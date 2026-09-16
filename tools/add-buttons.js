#!/usr/bin/env node
/* Add 3" buttons to the catalogue, as two decoration ladders and one product.
 *
 *   node tools/add-buttons.js --vars=~/.jtees-art.json
 *   node tools/add-buttons.js --vars=~/.jtees-art.json --apply
 *
 * WHY IT IS SHAPED LIKE THIS
 * --------------------------
 * A button does not fit the model the quote engine assumes. Every other line is
 * `blank + decoration x qty`: a garment you buy, and printing you put on it.
 * A button has no blank to mark up and no separate decoration — the print IS
 * the product.
 *
 * The engine prices a blank through BLANK_TIERS, which are percentage
 * discounts off a catalogue price. A button's ladder is not a percentage off
 * anything: it is a per-piece price that falls because the setup is amortised
 * and because production moves off the press and out to a mill. So the ladder
 * has to live where a PER-PIECE ladder lives, which is a decoration method's
 * own tiers.
 *
 * Hence: the product carries no price, and the two methods carry the money.
 * Pick "3in Buttons" as the product and one of the two as the decoration.
 *
 * TWO LADDERS, BECAUSE THEY ARE TWO JOBS
 * --------------------------------------
 * PERSONALISED is one design per button — a photo, a name, a player. Every
 * button is its own setup, which is why the mills will not touch it and why
 * Etsy sells single ones at $4-5. It never leaves the shop.
 *
 * ONE DESIGN is the same file pressed repeatedly. It competes with online
 * mills at about $0.55 delivered, so the ladder has to come down to meet them,
 * and above about 50 pieces the work goes out: at 22 buttons an hour, pressing
 * them in house instead of buying them earns roughly $4.40 an hour.
 *
 * QUOTE ONLY, on purpose. `printings` is left empty, so products.php shows
 * "Get a Quote" rather than "Customize" — there is no canvas art for a button
 * and the designer would open on nothing.
 */
const fs = require('fs');
const { mysql, dejson, enjson, sq } = require('./lib/db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-buttons.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;

/* Keys are band CEILINGS — the price applies UP TO that quantity. The opposite
   convention to BLANK_TIERS, which are floors. Getting these the wrong way
   round puts every band one step out and is the single easiest mistake in this
   system to make. */
const PERSONALISED = { 1: '6.00', 5: '5.50', 15: '4.50', 25: '4.00', 50: '3.50',
  75: '3.25', 100: '3.00', 150: '2.85', 1000: '2.75' };
const ONE_DESIGN = { 1: '3.00', 5: '2.75', 15: '2.50', 25: '2.00', 50: '1.50',
  75: '1.25', 100: '1.10', 150: '1.00', 200: '0.95', 499: '0.85', 1000: '0.80' };

const calc = (bands) => enjson({
  multi: false, type: 'fixed', show_detail: '1',
  values: { front: Object.fromEntries(Object.entries(bands).map(([q, p]) => [q, { price: p }])) },
});

const METHODS = [
  { title: '3in Button — Personalised (every button different)',
    bands: PERSONALISED,
    description: 'A 3 inch pinback button, printed and pressed in house. Personalised means ' +
      'each button is its own design — a photo, a name, a player — so each one is set up ' +
      'separately. Priced per button.' },
  { title: '3in Button — One design, repeated',
    bands: ONE_DESIGN,
    description: 'A 3 inch pinback button, one design across the whole order. Made in house ' +
      'to about 50 pieces and produced to order above that. Priced per button.' },
];

const rows = mysql(url, "SELECT id,title FROM lumise_printings WHERE title LIKE '3in Button%';", { rows: true });
const have = new Map(rows.map((r) => [r.title, r.id]));
const prodRows = mysql(url, "SELECT id,name FROM lumise_products WHERE name = '3in Buttons';", { rows: true });

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '\n');
for (const m of METHODS) {
  const q = Object.keys(m.bands).map(Number).sort((a, b) => a - b);
  console.log('  ' + (have.has(m.title) ? 'update #' + have.get(m.title) : 'create') + '  ' + m.title);
  console.log('      ' + q.map((k) => '<=' + k + ' $' + m.bands[k]).join('  '));
  /* A ladder that rises as the order grows is a mistake, always. */
  for (let i = 1; i < q.length; i++) {
    if (parseFloat(m.bands[q[i]]) > parseFloat(m.bands[q[i - 1]])) {
      console.error('      !! price RISES at ' + q[i] + ' — refusing'); process.exit(1);
    }
  }
}
console.log('  ' + (prodRows.length ? 'product exists #' + prodRows[0].id : 'create product') + '  3in Buttons  (quote only, no canvas art)');

if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
for (const m of METHODS) {
  if (have.has(m.title)) {
    mysql(url, 'UPDATE lumise_printings SET calculate=' + sq(calc(m.bands)) +
      ', description=' + sq(m.description) + ', active=1, updated=NOW() WHERE id=' + have.get(m.title) + ';');
  } else {
    mysql(url, "INSERT INTO lumise_printings (title,active,calculate,thumbnail,upload,description,author,created,updated) VALUES (" +
      sq(m.title) + ",1," + sq(calc(m.bands)) + ",'','','" + m.description.replace(/'/g, "\\'") +
      "'," + sq(author) + ",NOW(),NOW());");
  }
}
if (!prodRows.length) {
  mysql(url, "INSERT INTO lumise_products (name,description,price,supplier_cost,stages,attributes,printings,thumbnail_url,active,`order`,author,created,updated) VALUES (" +
    sq('3in Buttons') + "," + sq('3 inch pinback buttons, printed in house. Priced per button — ' +
      'see the decoration options for personalised or one-design.') +
    ",0,0.35," + sq(enjson({})) + "," + sq(enjson({})) + ",'','',1,999," + sq(author) + ",NOW(),NOW());");
}
const after = mysql(url, "SELECT id,title,active FROM lumise_printings WHERE title LIKE '3in Button%' ORDER BY id;", { rows: true });
for (const a of after) console.log('  verified #' + a.id + '  active=' + a.active + '  ' + a.title);
const ap = mysql(url, "SELECT id,name,price,supplier_cost FROM lumise_products WHERE name='3in Buttons';", { rows: true });
for (const a of ap) console.log('  verified #' + a.id + '  ' + a.name + '  price=' + a.price + '  cost=' + a.supplier_cost);
