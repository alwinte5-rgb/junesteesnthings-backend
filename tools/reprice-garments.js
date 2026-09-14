#!/usr/bin/env node
/* Reprice the catalogue's blanks to the current garment markup.
 *
 *   node tools/reprice-garments.js --vars=~/.jtees-art.json
 *   node tools/reprice-garments.js --vars=~/.jtees-art.json --apply
 *
 * Changing lib/markup.js only changes what the SYNC writes next time. The 102
 * products already in the catalogue keep whatever they were priced at until
 * something repricing them says otherwise — this.
 *
 * IT REPRICES THE SIZE UPCHARGES TOO. They live in each product's `attributes`
 * as a per-size price, built from the real cost difference carrying the same
 * multiple as the base. Move the base and leave them, and every extended size
 * quietly keeps the old markup — 2XL becomes the most profitable thing in the
 * shop while the shop believes it lowered prices.
 *
 * The upcharges do not store the cost difference they came from, so it is
 * recovered by dividing by the multiple they were BUILT at: `--from` (default
 * 2). Verified first — the run refuses if the catalogue does not actually sit
 * at that multiple, because dividing by the wrong one silently rescales
 * everything.
 */
const fs = require('fs');
const { mysql, dejson, enjson, sq } = require('./lib/db');
const { GARMENT_MARKUP, sellPrice } = require('./lib/markup');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const fi = argv.indexOf('--from');
const FROM = fi > -1 ? parseFloat(argv[fi + 1]) : 2.0;
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: reprice-garments.js --vars=<file> [--from 2] [--apply]'); process.exit(2); }
if (!Number.isFinite(FROM) || FROM < 1) { console.error('--from must be >= 1'); process.exit(2); }

const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;

const rows = mysql(url,
  'SELECT id,name,supplier_cost,price,attributes FROM lumise_products ' +
  'WHERE active=1 AND supplier_cost > 0 ORDER BY id;', { rows: true });

/* Refuse if the catalogue is not where --from says it is. Dividing upcharges by
   a multiple they were never built at rescales every extended size silently. */
const off = rows.filter((r) => Math.abs(Number(r.price) / Number(r.supplier_cost) - FROM) > 0.02);
console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — markup ' + FROM + ' -> ' + GARMENT_MARKUP +
  ' across ' + rows.length + ' products\n');
if (off.length) {
  console.error('  ' + off.length + ' product(s) are NOT at x' + FROM + ' — pass the right --from:');
  for (const r of off.slice(0, 8))
    console.error('    #' + r.id + '  x' + (Number(r.price) / Number(r.supplier_cost)).toFixed(2) + '  ' + r.name.slice(0, 40));
  process.exit(1);
}

const writes = [];
let upTotal = 0;
for (const r of rows) {
  const price = sellPrice(r.supplier_cost);
  const attrs = dejson(r.attributes) || {};
  let changedUp = 0;
  for (const k of Object.keys(attrs)) {
    const a = attrs[k];
    if (!a || a.type !== 'quantity') continue;
    let vals = a.values;
    if (typeof vals === 'string') { try { vals = JSON.parse(vals); } catch { vals = null; } }
    const opts = vals && vals.multiple_options;
    if (!Array.isArray(opts)) continue;
    for (const o of opts) {
      const cur = parseFloat(o.price);
      if (!Number.isFinite(cur) || cur <= 0) continue;      // no upcharge on this size
      const diff = cur / FROM;                              // back to the real cost difference
      const next = Math.round(diff * GARMENT_MARKUP * 100) / 100;
      if (next !== cur) { o.price = String(next.toFixed(2)); changedUp++; }
    }
    a.values = JSON.stringify(vals);
  }
  upTotal += changedUp;
  writes.push({ id: r.id, price, attrs: enjson(attrs), name: r.name, was: Number(r.price), ups: changedUp });
}

for (const w of writes.slice(0, 8))
  console.log('  #' + String(w.id).padStart(3) + '  $' + w.was.toFixed(2) + ' -> $' + w.price.toFixed(2) +
    '   ' + String(w.ups).padStart(2) + ' size upcharges   ' + w.name.slice(0, 38));
if (writes.length > 8) console.log('  ... and ' + (writes.length - 8) + ' more');
const drop = writes.reduce((a, w) => a + (w.was - w.price), 0) / writes.length;
console.log('\n  ' + writes.length + ' products · ' + upTotal + ' size upcharges · average price drop $' + drop.toFixed(2));

if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const backup = process.env.HOME + '/jtees-backups/prices-' + Date.now() + '.json';
fs.mkdirSync(process.env.HOME + '/jtees-backups', { recursive: true });
fs.writeFileSync(backup, JSON.stringify(rows, null, 1));
console.log('  backed up to ' + backup);

for (const w of writes)
  mysql(url, 'UPDATE lumise_products SET price=' + w.price + ', attributes=' + sq(w.attrs) +
    ' WHERE id=' + w.id + ';');

const after = mysql(url,
  'SELECT COUNT(*) n, ROUND(AVG(price/supplier_cost),3) mult FROM lumise_products ' +
  'WHERE active=1 AND supplier_cost > 0;', { rows: true });
console.log('  verified: ' + after[0].n + ' products now at x' + after[0].mult);
if (Math.abs(Number(after[0].mult) - GARMENT_MARKUP) > 0.02) {
  console.error('  WRITE DID NOT TAKE'); process.exitCode = 1;
}
