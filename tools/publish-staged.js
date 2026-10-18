#!/usr/bin/env node
/* Put staged S&S blanks live: designer, storefront and the daily sync.
 *
 *   railway run -s junesteesnthings-backend -- railway run -s MySQL -- \
 *     node tools/publish-staged.js                      # dry run: ready / not ready, and why
 *   ... node tools/publish-staged.js --apply            # publish every READY product
 *   ... node tools/publish-staged.js --apply --only=358,374
 *   ... --accept-standin                                # also publish stand-in canvas art
 *
 * tools/ssa-add-products.js --staged adds a style switched off with
 * supplier='ssa-staged': the quote form can sell it (jt-catalog.php lists it),
 * nothing a shopper sees does. This is the other half — it checks the product
 * is ready for the DESIGNER and only then makes it an ordinary live product
 * (supplier='ssa', active=1), files it into its categories, and leaves the
 * rest to the daily S&S sync.
 *
 * READY means every one of these holds; the dry run names the one that fails:
 *   - the design canvas is the right garment (tools/lib/canvas.js, the same
 *     verdict canvas-audit prints). Stand-in art — a jacket drawn on the
 *     sweatshirt, a beanie on the dad hat — is held back unless
 *     --accept-standin, because the customer designs against that canvas;
 *   - it has at least one decoration method, a size list and a price;
 *   - it has an https catalogue photo;
 *   - it has a description. An empty one is filled from S&S's own text as
 *     plain lines (product.php prints descriptions escaped, not as HTML), which
 *     needs SSA_ACCOUNT / SSA_API_KEY in the environment.
 */
const { mysql, mysqlUrlFrom, sq } = require('./lib/db');
const { canvasVerdict } = require('./lib/canvas');

/* S&S descriptions are HTML lists. Bullet lines, entities decoded, capped. */
function htmlToLines(html) {
  const s = String(html || '');
  const items = [...s.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  const parts = items.length ? items : [s];
  const clean = (t) => t.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&#174;|&reg;/g, '®')
    .replace(/&#8482;|&trade;/g, '™').replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const lines = parts.map(clean).filter(Boolean);
  return (items.length ? lines.map((l) => '• ' + l) : lines).join('\n').slice(0, 2000);
}

const decodePrintings = (v) => {
  try { const o = JSON.parse(decodeURIComponent(String(v || ''))); return o && typeof o === 'object' ? Object.keys(o) : []; }
  catch { return []; }
};

/** Why a staged product is not ready, or null when it is. `desc` is the
 *  description it WILL have (the stored one, or the one S&S supplied). */
function notReady(p, { acceptStandin = false, desc = p.description } = {}) {
  const c = canvasVerdict(p);
  if (c.verdict === 'unusable') return 'canvas: ' + c.why;
  if (c.verdict === 'bad') return 'canvas: a ' + c.cls + ' drawn on ' + c.art;
  if (c.verdict === 'borrowed' && !acceptStandin) return 'stand-in canvas: drawn as ' + c.sub.looks;
  if (!decodePrintings(p.printings).length) return 'no decoration methods';
  if (!String(p.attributes || '').trim()) return 'no sizes';
  if (!(parseFloat(p.price) > 0)) return 'no price';
  if (!/^https:\/\//.test(String(p.thumbnail_url || ''))) return 'no catalogue photo';
  if (!String(desc || '').trim()) return 'no description (S&S had none, or no SSA credentials)';
  return null;
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const ACCEPT = process.argv.includes('--accept-standin');
  const ONLY = new Set((process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
    .split(',').filter(Boolean).map(Number).filter(Number.isFinite));
  const url = mysqlUrlFrom(process.env);
  if (!url) { console.error('no MySQL connection — run under `railway run -s MySQL`'); process.exit(2); }
  const { SSA_ACCOUNT: acct, SSA_API_KEY: key } = process.env;

  let rows = mysql(url, "SELECT id, name, price, stages, printings, attributes, thumbnail_url, " +
    "IFNULL(description,'') description, IFNULL(supplier_style_id,0) sid FROM lumise_products " +
    "WHERE supplier='ssa-staged' ORDER BY name;", { rows: true });
  if (ONLY.size) rows = rows.filter((p) => ONLY.has(Number(p.id)));
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + rows.length + ' staged product(s)' +
    (ACCEPT ? ', stand-in canvas accepted' : '') + '\n');

  /* Descriptions from S&S, only for rows that have none. One call per style,
     spaced like ssa-add-products (S&S throttles bursts); a failed call leaves
     the row without one, which holds it back rather than inventing text. */
  const fetched = {};
  const need = rows.filter((p) => !String(p.description).trim() && Number(p.sid));
  if (need.length && acct && key) {
    const H = { Authorization: 'Basic ' + Buffer.from(acct + ':' + key).toString('base64') };
    for (const p of need) {
      for (let i = 0; i < 4; i++) {
        const r = await fetch('https://api.ssactivewear.com/v2/styles/' + Number(p.sid), { headers: H });
        if (r.ok) { const j = await r.json(); fetched[p.id] = htmlToLines((Array.isArray(j) ? j[0] : j || {}).description); break; }
        if (r.status !== 429 && r.status < 500) break;
        await new Promise((z) => setTimeout(z, 1200 * (i + 1) ** 2));
      }
      await new Promise((z) => setTimeout(z, 1000));
    }
  } else if (need.length) {
    console.log('  no SSA credentials: ' + need.length + ' product(s) without a description stay staged\n');
  }

  const ready = [], held = [];
  for (const p of rows) {
    const desc = String(p.description).trim() ? p.description : (fetched[p.id] || '');
    const why = notReady(p, { acceptStandin: ACCEPT, desc });
    (why ? held : ready).push({ p, why, desc, fill: !String(p.description).trim() && desc });
  }
  console.log('  READY (' + ready.length + ')');
  for (const r of ready) console.log('    #' + String(r.p.id).padStart(3) + '  ' + r.p.name.slice(0, 70));
  console.log('\n  HELD BACK (' + held.length + ')');
  for (const h of held) console.log('    #' + String(h.p.id).padStart(3) + '  ' + h.p.name.slice(0, 50).padEnd(52) + h.why);

  if (!APPLY) { console.log('\n  dry run — pass --apply to publish the ' + ready.length + ' ready product(s)'); return; }
  if (!ready.length) { console.log('\n  nothing ready to publish'); return; }

  /* One transaction. The WHERE re-checks 'ssa-staged' so a row published or
     changed since it was read is left alone. */
  const stmts = ready.map((r) => 'UPDATE lumise_products SET supplier=\'ssa\', active=1, ' +
    (r.fill ? 'description=' + sq(r.desc) + ', ' : '') + 'ssa_seen_at=NOW(), updated=NOW() ' +
    "WHERE id=" + Number(r.p.id) + " AND supplier='ssa-staged';");
  mysql(url, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  const live = mysql(url, 'SELECT COUNT(*) n FROM lumise_products WHERE active=1 AND supplier=\'ssa\' AND id IN (' +
    ready.map((r) => Number(r.p.id)).join(',') + ');', { rows: true })[0].n;
  console.log('\n  published ' + live + ' of ' + ready.length);

  /* Filed into categories, as ssa-add-products does after an add: the
     categoriser only files LIVE products, so a staged one had none. */
  const cat = require('child_process').spawnSync(process.execPath,
    [require('path').join(__dirname, 'categorise-products.js'), '--apply'],
    { input: JSON.stringify({ MYSQL_PUBLIC_URL: url, SSA_ACCOUNT: acct || '', SSA_API_KEY: key || '' }), stdio: ['pipe', 'inherit', 'inherit'] });
  if (cat.status !== 0) { console.error('\n  published, but filing into categories FAILED: run tools/categorise-products.js --apply'); process.exit(1); }
  console.log('\n  next: tools/colour-photos.js --write, for per-colour photos on the new products');
  if (Number(live) !== ready.length) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { notReady, htmlToLines, decodePrintings };
