#!/usr/bin/env node
/* White sublimation mugs, tumblers and pillows (Michaels) and socks (Silky
 * Socks), printed in house.
 *
 *   railway run -s MySQL node tools/add-shop-mugs.js            # dry run
 *   railway run -s MySQL node tools/add-shop-mugs.js --apply    # write
 *
 * Owner, 2026-10-23: the shop buys Make Market sublimation mugs at Michaels
 * (in-store pickup, no shipping) and prints them in house. Priced from
 * Michaels' REGULAR price, never a sale price, through the garment rule in
 * lib/markup.js (lower of x2 and +$8), plus the Sublimation method's printing.
 *
 * ONE ALL-IN PRICE (owner, same day: "the printing comes with it. It doesn't
 * have to be separate"). Each item gets its own method, "All-in — <item>",
 * whose bands are the blank's price plus the Sublimation band, and the product
 * is stored at $0 — the big head cutout pattern. The designer shows "From $X
 * each" for it (jt-print-compat.php, designer #156) and the quote form adds
 * nothing on top of a $0 product. The Sublimation method's bands are read at
 * run time, so re-running this after a sublimation reprice carries it through
 * to the designer, the quote form and the jtees.net cards (the shop feed sends
 * an all-in item's cheapest band, flagged `all_in`). The "From $X each" text
 * in public/assets/data/page-blocks.json is what search engines, visitors
 * without scripts and a feed outage see: after a reprice, change it in the
 * same commit and run node tools/page-blocks.js --write.
 *
 * Tagged `supplier = 'shop'`: the designer's catalogue feed (jt-catalog.php)
 * publishes those rows to the quote form even while inactive, and the daily
 * S&S sync lists them as the shop's own products, never looked up. A `held`
 * item is written as supplier 'shop-held', active=0, with its method switched
 * off: off the quote form and out of the S&S sync (which reads only active or
 * staged rows). Un-hold it here and re-run; never switch the row on by hand.
 */
const { mysqlUrlFrom, mysql, sq, enjson, dejson, encodePrintings } = require('./lib/db');
const { sellPrice } = require('./lib/markup');

const APPLY = process.argv.includes('--apply');
const url = mysqlUrlFrom();
if (!url) { console.error('usage: railway run -s MySQL node tools/add-shop-mugs.js [--apply]'); process.exit(2); }

const SUBLIMATION = 'Sublimation — Polyester Only';
const MUGS = [
  { name: 'White Ceramic Sublimation Mug — 11.8 oz', short: 'Mug 11.8 oz', regular: 3.49, designer: 'mug',
    desc: 'All-white ceramic mug, 11.8 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color: names, photos, logos.' },
  { name: 'White Ceramic Sublimation Mug — 15 oz', short: 'Mug 15 oz', regular: 4.99, designer: 'mug',
    desc: 'All-white ceramic mug, 15 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color: names, photos, logos.' },
  { name: 'White Skinny Sublimation Tumbler with Straw — 18.5 oz', short: 'Skinny Tumbler 18.5 oz', regular: 9.99,
    desc: 'All-white stainless skinny tumbler with lid and straw, 18.5 oz, made for sublimation (Make Market, from Michaels). Printed in our shop in full color, all the way around.' },
  { name: 'Glow-in-the-Dark Sublimation Tumbler — 20 oz', short: 'Glow Tumbler 20 oz', regular: 15.49,
    desc: 'Sublimation tumbler that glows in the dark, 20 oz, with lid and straw (Make Market, from Michaels). Printed in our shop in full color, all the way around.' },
  /* Owner, 2026-10-24: pillows and socks on the quote form first; each goes
     live in the designer once its template and drawing are ready. Same rule as
     the mugs. The sequin cover is a Craft Express 4-pack ($24.99) at Michaels,
     so `regular` is the price of one. Socks carry ONE printing charge per
     pair: two would put one pair at ~$35, above what photo socks sell for. */
  /* Owner, 2026-10-25: the white pillow is the Michaels 16x16 cover ($6.99),
     sold FILLED with polyfill (about $4 a pillow), so `regular` is the cover
     plus the filling. The owner set it at $28 for one, printing included
     (she sold them at $25). `sell` is the blank's price the owner's $28 gives
     at today's $14 Sublimation band for one, set by hand rather than by the
     markup rule; every band is then that blank plus the band, as for the mugs.
     The one pillow live in the designer; the 18x18 cover is held, as its own
     row, so quotes already made with it keep their item. */
  { name: 'White Sublimation Throw Pillow — 16x16, filled', short: 'Pillow 16x16 (filled)', regular: 10.99, sell: 14.00, designer: 'pillow',
    desc: 'All-white polyester throw pillow, 16" x 16", zipper cover made for sublimation (Make Market, from Michaels), filled in our shop. Printed in full color on the front.' },
  { name: 'White Sublimation Throw Pillow Cover — 18x18', short: 'Pillow Cover 18x18', regular: 6.99, held: true,
    desc: 'All-white polyester throw pillow cover with zipper, 18" x 18", made for sublimation (Make Market, from Michaels). Printed in our shop in full color on the front. Cover only, no insert.' },
  /* Held 2026-10-25 (owner): sequin pillows and socks come off the quote form
     until the owner has checked vendors and the stock on hand. `held` writes
     supplier 'shop-held', which jt-catalog.php does not publish, so the row and
     its pricing stay ready to switch back on. */
  { name: 'Flip Sequin Sublimation Pillow Cover — 16x16', short: 'Sequin Pillow 16x16', regular: 6.25, held: true,
    desc: 'Two-tone flip sequin pillow cover, 16" x 16" (Craft Express, from Michaels). Your photo or design is printed on the white sequin side and shows when the sequins are brushed one way. Cover only, no insert.' },
  /* Silky Socks Athletic Socks, the colored-foot style the owner uses: $4.50 a pair. */
  { name: 'Sublimation Crew Socks — Adult, pair', short: 'Crew Socks (pair)', regular: 4.50, held: true,
    desc: 'Athletic crew socks, one pair (Silky Socks): white leg for the print, cushioned cotton foot in your choice of color. Adult S-XL. Printed in our shop in full color: faces, names, logos.' },
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
/* The pillow drawing (core/raws/products/square_pillow.png, designer repo) is
   an opaque 600x600 photo, so it sits UNDER the design (no overlay). The print
   box is 440px of the 535px pillow, about 13" on the 16" face, centred; the
   stage is drawn at 400px, so every figure is scaled by 2/3. Filed under
   Pillows & Home Decor, the shop group the owner named 2026-10-25. */
const PILLOW_STAGES = { front: { label: 'Front', source: 'raws', overlay: false, url: 'products/square_pillow.png',
  edit_zone: { height: 293, width: 293, left: 0, top: 0, radius: '0' },
  product_width: 400, product_height: 400, template: {} } };
/* `thumb` is the product photo the designer's shop grid and product page show
   (owner's branded mockups, 2026-10-28), the same files as the jtees.net cards.
   The drawing the design sits on stays in `stages`. */
const DESIGNER = {
  mug: { stages: MUG_STAGES, thumb: 'https://jtees.net/assets/images/shop/listing-p523.jpg',
    category: { slug: 'custom-mugs-drinkware', name: 'Mugs & Drinkware', order: 8 } },
  pillow: { stages: PILLOW_STAGES, thumb: 'https://jtees.net/assets/images/shop/listing-p530.jpg',
    category: { slug: 'custom-pillows-home-decor', name: 'Pillows & Home Decor', order: 9 } },
};
for (const m of MUGS) if (m.designer && !DESIGNER[m.designer]) { console.error('no designer drawing "' + m.designer + '" for ' + m.name + ' — refusing'); process.exit(1); }

const method = mysql(url, 'SELECT id, active, calculate FROM lumise_printings WHERE title=' + sq(SUBLIMATION) + ';', { rows: true });
if (method.length !== 1) { console.error('expected one "' + SUBLIMATION + '" method, found ' + method.length + ' — refusing'); process.exit(1); }
const subBands = ((dejson(method[0].calculate) || {}).values || {}).front || {};
const ceilings = Object.keys(subBands).map(Number).filter((c) => c > 0).sort((a, b) => a - b);
if (!ceilings.length || ceilings.some((c) => !(Number(subBands[c].price) > 0))) { console.error('Sublimation has no usable price bands — refusing'); process.exit(1); }
/* Band ceilings -> all-in price each: the blank plus that band's printing. */
const allIn = (blank) => Object.fromEntries(ceilings.map((c) => [String(c), { price: (blank + Number(subBands[c].price)).toFixed(2) }]));
const methodTitle = (m) => 'All-in — ' + m.short + ' (printing included)';
const authorRow = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0];
if (!authorRow) { console.error('no active product to take the author from — refusing'); process.exit(1); }

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — all-in = blank + ' + SUBLIMATION + ' (#' + method[0].id + ')\n');
console.log('  ' + 'item'.padEnd(24) + ceilings.map((c, i) => ((i ? ceilings[i - 1] + 1 : 1) + '-' + c).padStart(9)).join(''));
for (const m of MUGS) {
  /* An owner-set blank price must never sell the blank under what it costs. */
  m.price = m.sell != null ? m.sell : sellPrice(m.regular);
  if (!(m.price >= m.regular)) { console.error('  ' + m.name + ': blank $' + m.price.toFixed(2) + ' is under its $' + m.regular.toFixed(2) + ' cost — refusing'); process.exit(1); }
  const have = mysql(url, 'SELECT id, price, active, supplier FROM lumise_products WHERE name=' + sq(m.name) + ';', { rows: true });
  if (have.length > 1) { console.error('  ' + have.length + ' products are named "' + m.name + '" — refusing'); process.exit(1); }
  m.id = have.length ? have[0].id : null;
  m.active = m.designer ? 1 : 0;
  m.supplier = m.held ? 'shop-held' : 'shop';
  m.bands = allIn(m.price);
  console.log('  ' + m.short.padEnd(24) + ceilings.map((c) => ('$' + m.bands[c].price).padStart(9)).join('') +
    '   (blank $' + m.price.toFixed(2) + ' from $' + m.regular.toFixed(2) + ' regular; ' + (m.held ? 'HELD, off the quote form' : m.designer ? 'LIVE in the designer' : 'quote only') + ')');
}
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

for (const m of MUGS) {
  const title = methodTitle(m);
  const calc = enjson({ multi: false, type: 'fixed', show_detail: '1', values: { front: m.bands } });
  const desc = m.desc + ' Price includes the printing.';
  const have = mysql(url, 'SELECT id FROM lumise_printings WHERE title=' + sq(title) + ';', { rows: true });
  if (have.length > 1) { console.error('  ' + have.length + ' methods are titled "' + title + '" — refusing'); process.exit(1); }
  /* A held item's method is switched off with it. */
  const on = m.held ? 0 : 1;
  if (have.length) mysql(url, 'UPDATE lumise_printings SET calculate=' + sq(calc) + ', active=' + on + ', description=' + sq(desc) + ', updated=NOW() WHERE id=' + Number(have[0].id) + ';');
  else mysql(url, 'INSERT INTO lumise_printings (title,active,calculate,thumbnail,upload,description,author,created,updated) VALUES (' +
    sq(title) + ',' + on + ',' + sq(calc) + ",'',''," + sq(desc) + ',' + sq(authorRow.author) + ',NOW(),NOW());');
  m.methodId = mysql(url, 'SELECT id FROM lumise_printings WHERE title=' + sq(title) + ';', { rows: true })[0].id;
  m.printings = encodePrintings([m.methodId]);
}
for (const m of MUGS) {
  if (m.id) {
    mysql(url, "UPDATE lumise_products SET price='0.00', supplier_cost=" + sq(m.regular.toFixed(2)) +
      ", supplier=" + sq(m.supplier) + ', active=' + m.active + ', description=' + sq(m.desc) + ', printings=' + sq(m.printings) +
      ', updated=NOW() WHERE id=' + Number(m.id) + ';');
  } else {
    /* The same columns tools/add-table-cover.js writes for a quote-only row. */
    mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,supplier,stages,attributes,' +
      'printings,thumbnail_url,active,`order`,author,created,updated) VALUES (' +
      sq(m.name) + ',' + sq(m.desc) + ",'0.00'," + sq(m.regular.toFixed(2)) + ',' + sq(m.supplier) + ',' +
      sq(enjson({})) + ',' + sq(enjson({})) + ',' + sq(m.printings) + ",''," + m.active + ',999,' + sq(authorRow.author) + ',NOW(),NOW());');
  }
}

const catIds = {};
for (const key of new Set(MUGS.filter((m) => m.designer).map((m) => m.designer))) {
  const cat = DESIGNER[key].category;
  const c = mysql(url, 'SELECT id FROM lumise_categories WHERE slug=' + sq(cat.slug) + " AND type='products';", { rows: true });
  if (!c.length) mysql(url, 'INSERT INTO lumise_categories (name, slug, upload, thumbnail_url, parent, type, active, `order`, author, created, updated) VALUES (' +
    sq(cat.name) + ', ' + sq(cat.slug) + ", '', '', 0, 'products', 1, " + cat.order + ", '', NOW(), NOW());");
  catIds[key] = c.length ? c[0].id : mysql(url, 'SELECT id FROM lumise_categories WHERE slug=' + sq(cat.slug) + " AND type='products';", { rows: true })[0].id;
  console.log('  category #' + catIds[key] + ' ' + cat.name);
}
for (const m of MUGS.filter((x) => x.designer)) {
  const d = DESIGNER[m.designer], catId = catIds[m.designer];
  const id = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(m.name) + ';', { rows: true })[0].id;
  mysql(url, 'UPDATE lumise_products SET stages=' + sq(enjson(d.stages)) + ', attributes=' + sq(enjson(ONE_SIZE)) +
    ', variations=' + sq(enjson({ default: '', attrs: [], variations: [] })) + ', thumbnail_url=' + sq(d.thumb) +
    ', updated=NOW() WHERE id=' + Number(id) + ';');
  const ref = mysql(url, 'SELECT id FROM lumise_categories_reference WHERE category_id=' + Number(catId) + ' AND item_id=' + Number(id) + " AND type='products';", { rows: true });
  if (!ref.length) mysql(url, 'INSERT INTO lumise_categories_reference (category_id, item_id, author, type) VALUES (' + Number(catId) + ', ' + Number(id) + ", '', 'products');");
}
let bad = 0;
for (const m of MUGS) {
  const v = mysql(url, 'SELECT id, price, active, supplier, printings FROM lumise_products WHERE name=' + sq(m.name) + ';', { rows: true });
  const ok = v.length === 1 && Number(v[0].price) === 0 && Number(v[0].active) === m.active && v[0].supplier === m.supplier && v[0].printings === m.printings;
  if (!ok) bad++;
  const vm = mysql(url, 'SELECT calculate FROM lumise_printings WHERE id=' + Number(m.methodId) + ';', { rows: true })[0];
  const okM = vm && JSON.stringify(((dejson(vm.calculate) || {}).values || {}).front) === JSON.stringify(m.bands);
  if (!okM) bad++;
  console.log('  verified #' + (v[0] && v[0].id) + ' (method #' + m.methodId + ') ' + m.name + ': ' + (ok && okM ? 'match' : 'DOES NOT MATCH'));
}
if (bad) process.exit(1);
