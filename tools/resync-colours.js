#!/usr/bin/env node
/* Re-pull every product's COLOUR list from S&S, and say exactly what differs.
 *
 *   node tools/resync-colours.js --vars=<file>            # report only
 *   node tools/resync-colours.js --vars=<file> --apply
 *   node tools/resync-colours.js --vars=<file> 97 --apply # one product
 *
 * WHY
 * ---
 * ssa-add-products.js builds the colour attribute when a product is ADDED, and
 * nothing has rebuilt it since. ssa-sync.js refreshes price, cost and stock and
 * never touches colours, so a product's palette is frozen at the day it was
 * created — or at whatever it was copied from.
 *
 * #97 Harriton M500 is the proof: it offers Ash, Sport Grey, Graphite Heather,
 * Irish Green, Safety Green and eighteen more — a Gildan tee palette on a
 * twill work shirt — while S&S says the M500 comes in Dill, French Blue,
 * Nautical Blue, Stone, Sunray Yellow, Team Orange, Team Purple, Wine and
 * Hunter. The shop was taking orders for 21 colours the garment is not made in.
 *
 * THE ONE THING THIS MUST NOT DO
 * ------------------------------
 * A variation keys on the colour's VALUE (the hex), not its title, and an
 * order records that hex as the identity of what was bought. So a surviving
 * colour KEEPS the hex it already has, even when S&S now reports a different
 * body colour. Reassigning it would orphan every per-colourway art variation
 * in one write and make past orders unreadable. Only genuinely new titles get
 * a new (uniquified) hex.
 *
 * Sizes are not touched. This is the colour list only.
 */
const fs = require('fs');
const { mysql, dejson, enjson, sq } = require('./lib/db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const only = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const varsFile = (argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=');
if (!varsFile) { console.error('usage: resync-colours.js --vars=<file> [productId...] [--apply]'); process.exit(2); }

const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
const auth = 'Basic ' + Buffer.from(env.SSA_ACCOUNT + ':' + env.SSA_API_KEY).toString('base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* S&S throttles a long sweep, and it does so as 503/429 — which is the trap
   this catalogue has been caught by before: a throttled response looks exactly
   like a style with no colours, and a tool that believes it will happily empty
   a product's palette. So a throttle is RETRIED with backoff, and if it still
   will not answer the product is SKIPPED, never rewritten. */
async function ssaColours(styleId) {
  let r, wait = 2000;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      r = await fetch('https://api.ssactivewear.com/v2/products/?styleid=' + styleId,
        { headers: { Authorization: auth }, signal: AbortSignal.timeout(60000) });
    } catch (e) {
      if (attempt === 5) throw new Error('network: ' + e.message);
      await sleep(wait); wait *= 2; continue;
    }
    if (r.ok) break;
    if (r.status !== 503 && r.status !== 429 && r.status !== 502) throw new Error('S&S ' + r.status);
    if (attempt === 5) throw new Error('S&S ' + r.status + ' after 5 tries (throttled)');
    await sleep(wait); wait *= 2;
  }
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error('S&S returned no rows');
  /* Ordered as S&S returns them, deduped by name, body colour kept for any
     title we have never seen before. */
  const out = new Map();
  for (const x of rows) {
    if (!x.colorName || out.has(x.colorName)) continue;
    out.set(x.colorName, '#' + String(x.color1 || '000000').replace(/^#/, '').toLowerCase());
  }
  return out;
}

(async () => {
  const where = only.length ? ' AND id IN (' + only.join(',') + ')' : '';
  const rows = mysql(url,
    'SELECT id, name, attributes, variations, supplier_style_id FROM lumise_products ' +
    'WHERE active=1' + where + ' ORDER BY id;', { rows: true });

  console.log((APPLY ? 'APPLYING' : 'REPORT ONLY — nothing is written') +
    '  ·  ' + rows.length + ' active products\n');

  let clean = 0, changed = 0, failed = 0, orphanTotal = 0;
  const writes = [];

  for (const p of rows) {
    const pid = Number(p.id);
    if (!p.supplier_style_id || p.supplier_style_id === '0') continue;

    let ssa;
    try { ssa = await ssaColours(p.supplier_style_id); }
    catch (e) { console.log('  #' + pid + '  ' + p.name.slice(0, 44) + '  — S&S FAILED: ' + e.message); failed++; continue; }
    await sleep(600);                                  // steady pace; the retry above handles a throttle

    const attrs = dejson(p.attributes) || {};
    const colKey = Object.keys(attrs).find((k) => attrs[k] && attrs[k].type === 'product_color');
    const cur = (colKey && attrs[colKey].values && attrs[colKey].values.options) || [];
    const curByTitle = new Map(cur.map((o) => [o.title, o]));

    const added = [...ssa.keys()].filter((t) => !curByTitle.has(t));
    const removed = cur.filter((o) => !ssa.has(o.title)).map((o) => o.title);
    if (!added.length && !removed.length) { clean++; continue; }

    /* Which removed colours are load-bearing: a variation keyed on their hex
       is art (or a price) that is about to point at nothing. */
    const vars = dejson(p.variations) || {};
    const wiredValues = new Set(Object.values(vars.variations || {})
      .filter((v) => v && v.conditions && v.conditions.COL).map((v) => v.conditions.COL));
    const orphans = cur.filter((o) => !ssa.has(o.title) && wiredValues.has(o.value)).map((o) => o.title);
    orphanTotal += orphans.length;

    changed++;
    console.log('  #' + String(pid).padStart(3) + '  ' + p.name.slice(0, 46).padEnd(48) +
      cur.length + ' → ' + ssa.size);
    if (added.length) console.log('       + ' + added.join(', ').slice(0, 150));
    if (removed.length) console.log('       - ' + removed.join(', ').slice(0, 150));
    if (orphans.length) console.log('       ! ' + orphans.length + ' removed colour(s) have wired art: ' + orphans.join(', ').slice(0, 120));

    /* Rebuild. A surviving title keeps its hex and its price upcharge; only a
       new title is assigned one, uniquified against everything already taken. */
    const used = new Set(cur.filter((o) => ssa.has(o.title)).map((o) => String(o.value).toLowerCase()));
    const uniq = (hex) => {
      let h = String(hex).toLowerCase();
      if (!used.has(h)) { used.add(h); return h; }
      let n = parseInt(h.slice(1), 16);
      if (!Number.isFinite(n)) { used.add(h); return h; }
      for (let i = 0; i < 256; i++) {
        n = (n + 1) & 0xffffff;
        const c = '#' + n.toString(16).padStart(6, '0');
        if (!used.has(c)) { used.add(c); return c; }
      }
      used.add(h); return h;
    };
    const options = [...ssa].map(([title, body], i) => {
      const old = curByTitle.get(title);
      return old
        ? { value: old.value, title, price: old.price || '', default: old.default || (i === 0 ? '1' : '') }
        : { value: uniq(body), title, price: '', default: i === 0 ? '1' : '' };
    });
    if (!options.some((o) => o.default === '1') && options.length) options[0].default = '1';

    const next = JSON.parse(JSON.stringify(attrs));
    const key = colKey || 'COL';
    next[key] = { id: key, name: (colKey && attrs[colKey].name) || 'Color', type: 'product_color',
      title: '', values: { options } };
    writes.push({ id: pid, blob: enjson(next) });
  }

  console.log('\n  ' + clean + ' already correct · ' + changed + ' differ · ' + failed + ' could not be checked');
  if (orphanTotal) console.log('  ' + orphanTotal + ' wired colourway(s) would lose their colour — their art is orphaned, not deleted');

  if (!APPLY) { console.log('\n  report only — pass --apply to write'); return; }
  for (const w of writes) mysql(url, 'UPDATE lumise_products SET attributes=' + sq(w.blob) + ' WHERE id=' + w.id + ';');
  console.log('  ' + writes.length + ' products rewritten.');
})();
