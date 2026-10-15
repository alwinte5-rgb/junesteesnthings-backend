#!/usr/bin/env node
/* Put the SinaLite items in the catalogue so the quote form can sell them.
 *
 *   node tools/add-sinalite-products.js --vars=~/.jtees-art.json
 *   node tools/add-sinalite-products.js --vars=~/.jtees-art.json --apply
 *
 * One product per family in tools/data/sinalite-costs.json, named exactly as
 * that file names it — the quote form finds a product's price ladder by its
 * NAME (tools/lib/sinalite.js kindOf), so a renamed row stops pricing.
 *
 * WHY INACTIVE, AND WHY NOT A SERVICE
 *   `active` is what every storefront page filters on, and a quote-only item
 *   must not appear in the shop. A `service` row is priced flat per unit by
 *   the quote engine, which would ignore the quantity ladder. So these are
 *   stored INACTIVE and tagged `supplier = 'sinalite'`; jt-catalog.php
 *   publishes that tag to the quote form as an ordinary product, and the
 *   sizer prices it from tools/lib/sinalite.js. The designer change that
 *   teaches jt-catalog.php the tag must be deployed BEFORE --apply, or the
 *   rows exist and the quote form never sees them.
 *
 *   A product the designer sells online (PR 3) is switched active there, by
 *   the change that builds its page — not here.
 *
 * Upserted by name; the price column stays 0 because the size and quantity
 * carry the price.
 */
const fs = require('fs');
const { mysql, mysqlUrlFrom, enjson, sq } = require('./lib/db');
const SL = require('./lib/sinalite');

const PRODUCTS = Object.entries(JSON.parse(fs.readFileSync(SL.DATA_FILE, 'utf8')).products || {})
  .map(([key, p]) => ({ key, name: p.name, description: p.description || p.note || p.label }));

module.exports = { PRODUCTS };
if (require.main !== module) return;

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-sinalite-products.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = mysqlUrlFrom(env);
if (!url) { console.error('no MySQL connection in ' + varsFile); process.exit(2); }

for (const p of PRODUCTS) {
  if (!p.name) { console.error('!! family ' + p.key + ' has no product name — refusing'); process.exit(1); }
  if (SL.kindOf(p.name) !== p.key) { console.error('!! ' + p.name + ' does not map back to ' + p.key + ' — refusing'); process.exit(1); }
  const fam = SL.table().families[p.key];
  if (!fam || !fam.min) { console.error('!! ' + p.name + ' has no priced tier — refusing'); process.exit(1); }
}

const rows = PRODUCTS.length ? mysql(url, 'SELECT id,name,active,supplier FROM lumise_products WHERE name IN (' +
  PRODUCTS.map((p) => sq(p.name)).join(',') + ');', { rows: true }) : [];
const key = (n) => String(n).toLowerCase().trim();
const have = new Map(rows.map((r) => [key(r.name), r]));
/* A same-named row that is not ours is somebody's real product. */
for (const r of rows) {
  if (r.supplier !== 'sinalite') {
    console.error('!! "' + r.name + '" exists as #' + r.id + ' and is not a SinaLite item — refusing');
    process.exit(1);
  }
}

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '  —  SinaLite costs read ' + (SL.table().captured || 'never') +
  (SL.stale() ? '  (STALE: re-run tools/sinalite-capture.js)' : '') + '\n');
for (const p of PRODUCTS) {
  const h = have.get(key(p.name));
  const fam = SL.table().families[p.key];
  console.log('  ' + (h ? 'update #' + h.id : 'create') + '  ' + p.name + '  (min ' + fam.min + ')');
}
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
for (const p of PRODUCTS) {
  const h = have.get(key(p.name));
  if (h) {
    mysql(url, 'UPDATE lumise_products SET description=' + sq(p.description) +
      ", supplier='sinalite', price=0, updated=NOW() WHERE id=" + Number(h.id) + ';');
  } else {
    mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,supplier,stages,attributes,' +
      'printings,thumbnail_url,active,`order`,author,created,updated) VALUES (' +
      sq(p.name) + ',' + sq(p.description) + ",0,0,'sinalite'," + sq(enjson({})) + ',' + sq(enjson({})) +
      ",'','',0,999," + sq(author) + ',NOW(),NOW());');
  }
}
const after = mysql(url, "SELECT id,name,active,supplier FROM lumise_products WHERE supplier='sinalite' ORDER BY id;", { rows: true });
for (const a of after) console.log('  verified #' + a.id + '  active=' + a.active + '  ' + a.name);
