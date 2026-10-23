#!/usr/bin/env node
/* White sublimation mugs from Michaels, printed in house, quote form only.
 *
 *   railway run -s MySQL node tools/add-shop-mugs.js            # dry run
 *   railway run -s MySQL node tools/add-shop-mugs.js --apply    # write
 *
 * Owner, 2026-10-23: the shop buys Make Market sublimation mugs at Michaels
 * (in-store pickup, no shipping) and prints them with the existing
 * "Sublimation" method. Priced from Michaels' REGULAR price, never a sale
 * price, through the garment rule in lib/markup.js (lower of x2 and +$8).
 *
 * Inactive and tagged `supplier = 'shop'`: the designer's catalogue feed
 * (jt-catalog.php, designer branch quote-shop-supplies) publishes those rows to
 * the quote form, and no storefront page shows them. The daily S&S sync only
 * reads active and staged rows, so it never touches these.
 */
const { mysqlUrlFrom, mysql, sq, enjson, encodePrintings } = require('./lib/db');
const { sellPrice } = require('./lib/markup');

const APPLY = process.argv.includes('--apply');
const url = mysqlUrlFrom();
if (!url) { console.error('usage: railway run -s MySQL node tools/add-shop-mugs.js [--apply]'); process.exit(2); }

const SUBLIMATION = 'Sublimation — Polyester Only';
const MUGS = [
  { name: 'White Ceramic Sublimation Mug — 11.8 oz', regular: 3.49,
    desc: 'All-white ceramic mug, 11.8 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color: names, photos, logos.' },
  { name: 'White Ceramic Sublimation Mug — 15 oz', regular: 4.99,
    desc: 'All-white ceramic mug, 15 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color: names, photos, logos.' },
];

const method = mysql(url, 'SELECT id, active FROM lumise_printings WHERE title=' + sq(SUBLIMATION) + ';', { rows: true });
if (method.length !== 1) { console.error('expected one "' + SUBLIMATION + '" method, found ' + method.length + ' — refusing'); process.exit(1); }
const printings = encodePrintings([method[0].id]);
const authorRow = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0];
if (!authorRow) { console.error('no active product to take the author from — refusing'); process.exit(1); }

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — printed with method #' + method[0].id + ' ' + SUBLIMATION + '\n');
for (const m of MUGS) {
  m.price = sellPrice(m.regular);
  const have = mysql(url, 'SELECT id, price, active, supplier FROM lumise_products WHERE name=' + sq(m.name) + ';', { rows: true });
  if (have.length > 1) { console.error('  ' + have.length + ' products are named "' + m.name + '" — refusing'); process.exit(1); }
  m.id = have.length ? have[0].id : null;
  console.log('  ' + (m.id ? 'update #' + m.id : 'create') + '  $' + m.regular.toFixed(2) + ' regular -> $' + m.price.toFixed(2) + '  ' + m.name);
}
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

for (const m of MUGS) {
  if (m.id) {
    mysql(url, 'UPDATE lumise_products SET price=' + sq(m.price.toFixed(2)) + ', supplier_cost=' + sq(m.regular.toFixed(2)) +
      ", supplier='shop', active=0, description=" + sq(m.desc) + ', printings=' + sq(printings) +
      ', updated=NOW() WHERE id=' + Number(m.id) + ';');
  } else {
    /* The same columns tools/add-table-cover.js writes for a quote-only row. */
    mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,supplier,stages,attributes,' +
      'printings,thumbnail_url,active,`order`,author,created,updated) VALUES (' +
      sq(m.name) + ',' + sq(m.desc) + ',' + sq(m.price.toFixed(2)) + ',' + sq(m.regular.toFixed(2)) + ",'shop'," +
      sq(enjson({})) + ',' + sq(enjson({})) + ',' + sq(printings) + ",'',0,999," + sq(authorRow.author) + ',NOW(),NOW());');
  }
}
let bad = 0;
for (const m of MUGS) {
  const v = mysql(url, 'SELECT id, price, active, supplier, printings FROM lumise_products WHERE name=' + sq(m.name) + ';', { rows: true });
  const ok = v.length === 1 && Number(v[0].price) === Number(m.price.toFixed(2)) && Number(v[0].active) === 0 && v[0].supplier === 'shop' && v[0].printings === printings;
  if (!ok) bad++;
  console.log('  verified #' + (v[0] && v[0].id) + ' $' + (v[0] && v[0].price) + ' ' + m.name + ': ' + (ok ? 'match' : 'DOES NOT MATCH'));
}
if (bad) process.exit(1);
