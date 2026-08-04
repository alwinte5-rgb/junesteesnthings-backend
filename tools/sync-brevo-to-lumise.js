#!/usr/bin/env node
/*
 * Bring every Brevo contact into the Lumise Customers page.
 *
 * WHY
 * ---
 * Brevo accumulated contacts from several places over the years (mailing list
 * imports, the old site, manual adds) while Lumise only ever knew about people
 * who checked out or were pushed there deliberately. That left ~580 real
 * customers invisible in the admin the shop actually works from.
 *
 * REVIEW PIPELINE (same shape as the text-archive import)
 * ------------------------------------------------------
 *   node tools/sync-brevo-to-lumise.js            -> writes a CSV, changes nothing
 *   <open the CSV, delete any row you do not want>
 *   node tools/sync-brevo-to-lumise.js --apply --only-approved brevo_sync_review.csv
 *
 * Nothing is ever written without --apply. Matching is by email first, then the
 * last 10 digits of the phone, so re-running only updates and never duplicates.
 *
 * Env: BREVO_API_KEY, JT_INTERNAL_KEY
 */

const fs = require('fs');
const path = require('path');

const BREVO = process.env.BREVO_API_KEY;
const JTKEY = process.env.JT_INTERNAL_KEY;
const OUT = path.join(__dirname, '..', 'brevo_sync_review.csv');

const apply = process.argv.includes('--apply');
const approvedIdx = process.argv.indexOf('--only-approved');
const approvedFile = approvedIdx > -1 ? process.argv[approvedIdx + 1] : null;

// Cloudflare rejects unfamiliar user agents with a 403, which silently killed an
// earlier run — always identify as a normal browser on these calls.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) jtees-sync/1.0';

const csvCell = (v) => {
  const s = String(v == null ? '' : v).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
  return /[",]/.test(s) ? `"${s}"` : s;
};

async function fetchAllContacts() {
  const out = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`https://api.brevo.com/v3/contacts?limit=500&offset=${offset}`,
      { headers: { 'api-key': BREVO, 'User-Agent': UA } });
    if (!r.ok) throw new Error('brevo ' + r.status);
    const d = await r.json();
    const batch = d.contacts || [];
    out.push(...batch);
    if (batch.length < 500) break;
    offset += 500;
  }
  return out;
}

/** Push one contact into Lumise. Returns 'created' | 'updated' | error string. */
async function pushToLumise(row) {
  const body = JSON.stringify({
    name: row.name,
    email: row.email,
    phone: row.phone,
    note: row.note,
    source: 'brevo-sync',
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(
        `https://design.jtees.net/jt-contact.php?key=${encodeURIComponent(JTKEY)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': UA }, body,
          signal: AbortSignal.timeout(20000) });
      if (r.status === 502 || r.status === 503) {   // deploy restart — worth retrying
        await new Promise(s => setTimeout(s, 1500 * attempt));
        continue;
      }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return `HTTP ${r.status} ${d.error || ''}`.trim();
      return d.action || 'ok';
    } catch (e) {
      if (attempt === 3) return e.message;
      await new Promise(s => setTimeout(s, 1500 * attempt));
    }
  }
  return 'gave up';
}

(async () => {
  if (!BREVO) { console.error('BREVO_API_KEY not set'); process.exit(1); }

  console.log('reading Brevo…');
  const contacts = await fetchAllContacts();
  console.log(`  ${contacts.length} contacts\n`);

  const rows = contacts.map(c => {
    const a = c.attributes || {};
    const name = [a.FIRSTNAME, a.LASTNAME].filter(Boolean).join(' ').trim();
    const phone = String(a.SMS || a.PHONE || '').trim();
    const email = String(c.email || '').trim();
    const src = a.SOURCE || '';
    const bits = [];
    if (src) bits.push(`source: ${src}`);
    if (c.createdAt) bits.push(`in Brevo since ${String(c.createdAt).slice(0, 10)}`);
    if (a.LAST_ORDER) bits.push(`last order ${a.LAST_ORDER}`);
    return {
      email, name, phone,
      source: src || '(none)',
      lists: (c.listIds || []).join(' '),
      created: String(c.createdAt || '').slice(0, 10),
      note: bits.join(' · ') || 'Synced from Brevo',
      skip_reason: (!email && !phone) ? 'no email or phone' : '',
    };
  });

  const usable = rows.filter(r => !r.skip_reason);
  const cols = ['email', 'name', 'phone', 'source', 'lists', 'created', 'note', 'skip_reason'];
  fs.writeFileSync(OUT, [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n'));

  console.log(`  usable (have an email or a phone): ${usable.length}`);
  console.log(`  unusable                        : ${rows.length - usable.length}`);
  console.log(`  with a phone                    : ${usable.filter(r => r.phone).length}`);
  console.log(`  with a name                     : ${usable.filter(r => r.name).length}`);
  console.log(`\nreview file: ${OUT}`);

  if (!apply) {
    console.log('\nDry run — nothing written.');
    console.log('Open the CSV, delete rows you do not want, then:');
    console.log('  node tools/sync-brevo-to-lumise.js --apply --only-approved brevo_sync_review.csv');
    return;
  }
  if (!JTKEY) { console.error('JT_INTERNAL_KEY not set'); process.exit(1); }

  let todo = usable;
  if (approvedFile) {
    const text = fs.readFileSync(approvedFile, 'utf8').split(/\r?\n/).slice(1);
    const keep = new Set(text.map(l => (l.split(',')[0] || '').replace(/^"|"$/g, '').trim().toLowerCase()).filter(Boolean));
    todo = usable.filter(r => keep.has(r.email.toLowerCase()));
    console.log(`\napproved list: ${keep.size} row(s) -> ${todo.length} match`);
  } else {
    console.log(`\n*** --apply without --only-approved will sync ALL ${todo.length}. ***`);
  }

  let created = 0, updated = 0, failed = 0;
  for (let i = 0; i < todo.length; i++) {
    const res = await pushToLumise(todo[i]);
    if (res === 'created') created++;
    else if (res === 'updated') updated++;
    else { failed++; console.log(`  ${todo[i].email || todo[i].phone}: ${res}`); }
    if ((i + 1) % 100 === 0) console.log(`  …${i + 1}/${todo.length}`);
  }
  console.log(`\ncreated: ${created}   updated: ${updated}   failed: ${failed}`);
})().catch(e => { console.error(e.message); process.exit(1); });
