#!/usr/bin/env node
/* 6 ft table cover, printed in house on one or two sides: ivory and white
 * covers sublimated, every other color DTF (owner, 2026-10-28).
 *
 *   node tools/add-table-cover.js --vars=<(jtees-env)            # dry run
 *   node tools/add-table-cover.js --vars=<(jtees-env) --apply    # write
 *
 * THE OWNER'S PRICES: tools/lib/table-cover.js (each, shipping included).
 *
 * WHAT IT WRITES
 *   1. A decoration method, "DTF Printing — Table Cover", that carries the
 *      whole price (the 3in-button pattern, tools/add-buttons.js): the main
 *      stage is the 1-side price, and the second stage is what the back adds,
 *      so 1 side + back = the 2-side price at every quantity. The engine reads
 *      the main table for the first side printed and the second-stage table
 *      for the other (server.js priceLine keyOf). Keys are band CEILINGS.
 *   2. The product, "Table Cover — 6 ft" (was "Fitted Table Cover — 6 ft"
 *      until 2026-10-28; the old name is found and renamed), quote-only (active=0,
 *      supplier 'ycc', published to the quote form by the designer's
 *      jt-catalog.php), price 0 so nothing is added on top: the blank and its
 *      delivery from YCC Linens are inside the owner's price. supplier_cost
 *      keeps the blank's cost for the margin report.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mysqlUrlFrom, mysql, enjson, dejson, sq, encodePrintings } = require('./lib/db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
const env = varsFile ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : process.env;
const url = mysqlUrlFrom(env);
if (!url) { console.error('usage: add-table-cover.js --vars=<(jtees-env) [--apply]'); process.exit(2); }

const METHOD = 'DTF Printing — Table Cover';
const METHOD_DESC = 'Full-color print on a 6 ft table cover, sublimated on ivory and white covers and DTF on every other color: ' +
  'one side is a large print on the front panel; two sides adds the back panel. The price includes the cover and its delivery.';
const PRODUCT = 'Table Cover — 6 ft';
const OLD_PRODUCT = 'Fitted Table Cover — 6 ft';   // its name until 2026-10-28 (owner: no "fitted")
/* supplier 'ycc': the designer's catalogue feed (jt-catalog.php) publishes
   inactive rows only for the suppliers it lists ('ycc' since designer #147). */
const PRODUCT_DESC = 'Polyester table cover for a 6 ft table (72" x 30"), closed on all four sides, relaxed fit. ' +
  'Tell us the color on the quote (30 to choose from; we confirm stock). Printed in our shop on one side (front) or two sides (front and back): ' +
  'ivory and white are sublimated (no feel), every other color is DTF.';

/* Band ceilings -> price each, from tools/lib/table-cover.js (the page
   prints the same table). ONE_SIDE is the main stage; BACK is what the
   second side adds. */
const { ONE_SIDE, TWO_SIDES, BLANK_COST } = require('./lib/table-cover');
const BACK = Object.fromEntries(Object.keys(ONE_SIDE).map((c) => [c, TWO_SIDES[c] - ONE_SIDE[c]]));
const mainKey = 'id', addKey = 'mr8a5dlx';
const ceilings = Object.keys(ONE_SIDE).map(Number).sort((a, b) => a - b);

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '\n');
console.log('  up to      1 side   back adds   2 sides   (each, shipping included)');
let prev = Infinity;
for (const c of ceilings) {
  if (!(ONE_SIDE[c] > 0) || !(BACK[c] > 0)) { console.error('  !! no price for the <=' + c + ' band — refusing'); process.exit(1); }
  if (ONE_SIDE[c] > prev) { console.error('  !! 1-side price RISES at ' + c + ' — refusing'); process.exit(1); }
  prev = ONE_SIDE[c];
  console.log('  <=' + String(c).padEnd(8) + ('$' + ONE_SIDE[c].toFixed(2)).padStart(8) + ('$' + BACK[c].toFixed(2)).padStart(12) + ('$' + TWO_SIDES[c].toFixed(2)).padStart(10));
}
/* 2 sides must not rise with quantity either (code review). */
let prev2 = Infinity;
for (const c of ceilings) { if (TWO_SIDES[c] > prev2) { console.error('  !! 2-sides price RISES at ' + c + ' — refusing'); process.exit(1); } prev2 = TWO_SIDES[c]; }
const blank = 0;
/* Read before anything is written, so a missing author cannot leave a method
   with no product (code review). */
const authorRow = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0];
if (!authorRow) { console.error('no active product to take the author from — refusing'); process.exit(1); }

const newCalc = {
  multi: true, type: 'fixed', show_detail: '1',
  values: {
    [mainKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: ONE_SIDE[c].toFixed(2) }])),
    [addKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: BACK[c].toFixed(2) }])),
  },
};

const existingM = mysql(url, 'SELECT id, active FROM lumise_printings WHERE title=' + sq(METHOD) + ';', { rows: true });
let existingP = mysql(url, 'SELECT id, name, price, active, printings FROM lumise_products WHERE name=' + sq(PRODUCT) + ';', { rows: true });
if (!existingP.length) existingP = mysql(url, 'SELECT id, name, price, active, printings FROM lumise_products WHERE name=' + sq(OLD_PRODUCT) + ';', { rows: true });
console.log('\n  method:  ' + (existingM.length ? 'update #' + existingM[0].id + ' (active=' + existingM[0].active + ', left as it is)' : 'create') + '  ' + METHOD);
console.log('  product: ' + (existingP.length ? 'update #' + existingP[0].id + ' ($' + existingP[0].price + ' -> $' + blank.toFixed(2) + ')' : 'create (inactive, quote-only)') + '  ' + PRODUCT);
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const dir = path.join(os.homedir(), 'jtees-backups');
fs.mkdirSync(dir, { recursive: true });
const backup = path.join(dir, 'table-cover-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
fs.writeFileSync(backup, JSON.stringify({ method: existingM, product: existingP }, null, 1));
console.log('\n  backup ' + backup);

let mid;
if (existingM.length) {
  mid = existingM[0].id;
  mysql(url, 'UPDATE lumise_printings SET calculate=' + sq(enjson(newCalc)) + ', description=' + sq(METHOD_DESC) +
    ', updated=NOW() WHERE id=' + Number(mid) + ';');
} else {
  const author = authorRow.author;
  mysql(url, 'INSERT INTO lumise_printings (title,active,calculate,thumbnail,upload,description,author,created,updated) VALUES (' +
    sq(METHOD) + ',1,' + sq(enjson(newCalc)) + ",'',''," + sq(METHOD_DESC) + ',' + sq(author) + ',NOW(),NOW());');
  mid = mysql(url, 'SELECT id FROM lumise_printings WHERE title=' + sq(METHOD) + ';', { rows: true })[0].id;
}
const printings = encodePrintings([mid]);
if (existingP.length) {
  mysql(url, 'UPDATE lumise_products SET name=' + sq(PRODUCT) + ', price=' + sq(blank.toFixed(2)) + ', supplier_cost=' + sq(BLANK_COST.toFixed(2)) +
    ', description=' + sq(PRODUCT_DESC) + ', printings=' + sq(printings) + ', updated=NOW() WHERE id=' + Number(existingP[0].id) + ';');
} else {
  /* The same columns tools/add-services.js writes for a quote-only row. */
  const author = authorRow.author;
  mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,supplier,stages,attributes,' +
    'printings,thumbnail_url,active,`order`,author,created,updated) VALUES (' +
    sq(PRODUCT) + ',' + sq(PRODUCT_DESC) + ',' + sq(blank.toFixed(2)) + ',' + sq(BLANK_COST.toFixed(2)) + ",'ycc'," +
    sq(enjson({})) + ',' + sq(enjson({})) + ',' + sq(printings) + ",'',0,999," + sq(author) + ',NOW(),NOW());');
}

const vm = mysql(url, 'SELECT id, active, calculate FROM lumise_printings WHERE id=' + Number(mid) + ';', { rows: true })[0];
const vp = mysql(url, 'SELECT id, price, active, printings FROM lumise_products WHERE name=' + sq(PRODUCT) + ';', { rows: true })[0];
const ok = JSON.stringify((dejson(vm.calculate) || {}).values) === JSON.stringify(newCalc.values) &&
  Number(vp.price) === blank && vp.printings === printings;
console.log('  verified method #' + vm.id + ' (active=' + vm.active + ') and product #' + vp.id + ' $' + vp.price + ' active=' + vp.active + ': ' + (ok ? 'match' : 'DO NOT MATCH'));
if (!ok) process.exit(1);
