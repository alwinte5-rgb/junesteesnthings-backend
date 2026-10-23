#!/usr/bin/env node
/* White sublimation mugs and tumblers from Michaels, printed in house.
 *
 *   railway run -s MySQL node tools/add-shop-mugs.js            # dry run
 *   railway run -s MySQL node tools/add-shop-mugs.js --apply    # write
 *
 * Owner, 2026-10-23: the shop buys Make Market sublimation mugs at Michaels
 * (in-store pickup, no shipping) and prints them with the existing
 * "Sublimation" method. Priced from Michaels' REGULAR price, never a sale
 * price, through the garment rule in lib/markup.js (lower of x2 and +$8).
 *
 * Tagged `supplier = 'shop'`: the designer's catalogue feed (jt-catalog.php)
 * publishes those rows to the quote form even while inactive, and the daily
 * S&S sync lists them as the shop's own products, never looked up.
 */
const { mysqlUrlFrom, mysql, sq, enjson, encodePrintings } = require('./lib/db');
const { sellPrice } = require('./lib/markup');

const APPLY = process.argv.includes('--apply');
const url = mysqlUrlFrom();
if (!url) { console.error('usage: railway run -s MySQL node tools/add-shop-mugs.js [--apply]'); process.exit(2); }

const SUBLIMATION = 'Sublimation — Polyester Only';
const MUGS = [
  { name: 'White Ceramic Sublimation Mug — 11.8 oz', regular: 3.49, designer: true,
    desc: 'All-white ceramic mug, 11.8 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color: names, photos, logos.' },
  { name: 'White Ceramic Sublimation Mug — 15 oz', regular: 4.99, designer: true,
    desc: 'All-white ceramic mug, 15 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color: names, photos, logos.' },
  { name: 'White Skinny Sublimation Tumbler with Straw — 18.5 oz', regular: 9.99,
    desc: 'All-white stainless skinny tumbler with lid and straw, 18.5 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color, all the way around.' },
  { name: 'Glow-in-the-Dark Sublimation Tumbler — 20 oz', regular: 15.49,
    desc: 'Sublimation tumbler that glows in the dark, 20 oz, with lid and straw (Make Market, from Michaels). Printed in our shop in full color, all the way around.' },
];

/* The mugs are also sold in the online designer (owner, 2026-10-23): live,
   on the designer's own mug drawing (core/raws/products/cup_back.png, the
   stage Lumise ships for it), ONE print side. The designer charges the
   method's price once per designed side, and a mug is pressed in one pass, so
   a second side would double the printing for no extra work. Wraparound
   designs stay quote-only. Filed under Mugs & Drinkware, the shop group the
   owner approved the same day. The tumblers have no drawing yet, so they stay
   quote-only. */
const MUG_STAGES = { front: { label: 'Front', source: 'raws', overlay: true, url: 'products/cup_back.png',
  edit_zone: { height: 247, width: 199, left: -29.5, top: -85, radius: '0' },
  product_width: 400, product_height: 475, template: {} } };
const ONE_SIZE = { QTYS: { id: 'QTYS', name: 'Quantity per Size', type: 'quantity', required: true, use_variation: false,
  values: JSON.stringify({ type: 'multiple', min_qty: '1', max_qty: '',
    multiple_options: [{ title: 'One Size', value: 'One Size', price: '', min_qty: '', max_qty: '' }] }) },
  BCOL: { id: 'BCOL', name: 'Color', type: 'product_color', required: false, use_variation: false,
    values: { options: [{ value: '#ffffff', title: 'White', price: '', default: '1' }] } } };
const MUG_THUMB = 'https://design.jtees.net/core/raws/products/cup_back.png';
const CATEGORY = { slug: 'custom-mugs-drinkware', name: 'Mugs & Drinkware', order: 8 };

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
  m.active = m.designer ? 1 : 0;
  console.log('  ' + (m.id ? 'update #' + m.id : 'create') + '  $' + m.regular.toFixed(2) + ' regular -> $' + m.price.toFixed(2) +
    (m.designer ? '  LIVE in the designer, ' + CATEGORY.name : '  quote only') + '  ' + m.name);
}
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

for (const m of MUGS) {
  if (m.id) {
    mysql(url, 'UPDATE lumise_products SET price=' + sq(m.price.toFixed(2)) + ', supplier_cost=' + sq(m.regular.toFixed(2)) +
      ", supplier='shop', active=" + m.active + ', description=' + sq(m.desc) + ', printings=' + sq(printings) +
      ', updated=NOW() WHERE id=' + Number(m.id) + ';');
  } else {
    /* The same columns tools/add-table-cover.js writes for a quote-only row. */
    mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,supplier,stages,attributes,' +
      'printings,thumbnail_url,active,`order`,author,created,updated) VALUES (' +
      sq(m.name) + ',' + sq(m.desc) + ',' + sq(m.price.toFixed(2)) + ',' + sq(m.regular.toFixed(2)) + ",'shop'," +
      sq(enjson({})) + ',' + sq(enjson({})) + ',' + sq(printings) + ",''," + m.active + ',999,' + sq(authorRow.author) + ',NOW(),NOW());');
  }
}

let catId = null;
if (MUGS.some((m) => m.designer)) {
  const c = mysql(url, 'SELECT id FROM lumise_categories WHERE slug=' + sq(CATEGORY.slug) + " AND type='products';", { rows: true });
  if (c.length) catId = c[0].id;
  else {
    mysql(url, 'INSERT INTO lumise_categories (name, slug, upload, thumbnail_url, parent, type, active, `order`, author, created, updated) VALUES (' +
      sq(CATEGORY.name) + ', ' + sq(CATEGORY.slug) + ", '', '', 0, 'products', 1, " + CATEGORY.order + ", '', NOW(), NOW());");
    catId = mysql(url, 'SELECT id FROM lumise_categories WHERE slug=' + sq(CATEGORY.slug) + " AND type='products';", { rows: true })[0].id;
  }
  console.log('  category #' + catId + ' ' + CATEGORY.name);
}
for (const m of MUGS.filter((x) => x.designer)) {
  const id = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(m.name) + ';', { rows: true })[0].id;
  mysql(url, 'UPDATE lumise_products SET stages=' + sq(enjson(MUG_STAGES)) + ', attributes=' + sq(enjson(ONE_SIZE)) +
    ', variations=' + sq(enjson({ default: '', attrs: [], variations: [] })) + ', thumbnail_url=' + sq(MUG_THUMB) +
    ', updated=NOW() WHERE id=' + Number(id) + ';');
  const ref = mysql(url, 'SELECT id FROM lumise_categories_reference WHERE category_id=' + Number(catId) + ' AND item_id=' + Number(id) + " AND type='products';", { rows: true });
  if (!ref.length) mysql(url, 'INSERT INTO lumise_categories_reference (category_id, item_id, author, type) VALUES (' + Number(catId) + ', ' + Number(id) + ", '', 'products');");
}
let bad = 0;
for (const m of MUGS) {
  const v = mysql(url, 'SELECT id, price, active, supplier, printings FROM lumise_products WHERE name=' + sq(m.name) + ';', { rows: true });
  const ok = v.length === 1 && Number(v[0].price) === Number(m.price.toFixed(2)) && Number(v[0].active) === m.active && v[0].supplier === 'shop' && v[0].printings === printings;
  if (!ok) bad++;
  console.log('  verified #' + (v[0] && v[0].id) + ' $' + (v[0] && v[0].price) + ' ' + m.name + ': ' + (ok ? 'match' : 'DOES NOT MATCH'));
}
if (bad) process.exit(1);
