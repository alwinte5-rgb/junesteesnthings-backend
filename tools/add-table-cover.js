#!/usr/bin/env node
/* Fitted 6 ft table cover, DTF printed in house on one or two sides.
 *
 *   node tools/add-table-cover.js --vars=<(jtees-env)            # dry run
 *   node tools/add-table-cover.js --vars=<(jtees-env) --apply    # write
 *
 * THE OWNER'S PRICES (2026-10-21), each, shipping included:
 *   1 side:  $75 for 1-2 covers, $65 each from 3.
 *   2 sides: $90 for 1 cover,    $80 each from 2.
 *
 * WHAT IT WRITES
 *   1. A decoration method, "DTF Printing — Table Cover", that carries the
 *      whole price (the 3in-button pattern, tools/add-buttons.js): the main
 *      stage is the 1-side price, and the second stage is what the back adds,
 *      so 1 side + back = the 2-side price at every quantity. The engine reads
 *      the main table for the first side printed and the second-stage table
 *      for the other (server.js priceLine keyOf). Keys are band CEILINGS.
 *   2. The product, "Fitted Table Cover — 6 ft", quote-only (active=0,
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

const BLANK_COST = 12.99;   // YCC Linens 6 ft fitted polyester, 1-19 (2026-10-20), for job costs
const METHOD = 'DTF Printing — Table Cover';
const METHOD_DESC = 'Full-color DTF printed on a fitted 6 ft table cover: one side is a large print ' +
  'on the front panel; two sides adds the back panel. The price includes the cover and its delivery.';
const PRODUCT = 'Fitted Table Cover — 6 ft';
/* supplier 'ycc': the designer's catalogue feed (jt-catalog.php) publishes
   inactive rows only for the suppliers it lists ('ycc' since designer #147). */
const PRODUCT_DESC = 'Fitted polyester table cover for a 6 ft table (72" x 30"), closed on all four sides. ' +
  'Tell us the color on the quote (30 to choose from). Printed in our shop with DTF on one side (front) or two sides (front and back).';

/* Band ceilings -> price each. ONE_SIDE is the main stage; BACK is what the
   second side adds: 2 sides = 90 (1), 80 (2), 80 (3+). */
const ONE_SIDE = { 1: 75, 2: 75, 7000: 65 };
const TWO_SIDES = { 1: 90, 2: 80, 7000: 80 };
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
const cStd = mysql(url, 'SELECT calculate FROM lumise_printings WHERE id=1;', { rows: true })[0];
const std = cStd && dejson(cStd.calculate);
if (!std) { console.error('method #1 unreadable — refusing'); process.exit(1); }
const blank = 0;

const newCalc = {
  multi: true, type: std.type || 'fixed', show_detail: std.show_detail || '1',
  values: {
    [mainKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: ONE_SIDE[c].toFixed(2) }])),
    [addKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: BACK[c].toFixed(2) }])),
  },
};

const existingM = mysql(url, 'SELECT id, active FROM lumise_printings WHERE title=' + sq(METHOD) + ';', { rows: true });
const existingP = mysql(url, 'SELECT id, price, active, printings FROM lumise_products WHERE name=' + sq(PRODUCT) + ';', { rows: true });
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
  const author = mysql(url, 'SELECT author FROM lumise_printings WHERE id=1;', { rows: true })[0].author;
  mysql(url, 'INSERT INTO lumise_printings (title,active,calculate,thumbnail,upload,description,author,created,updated) VALUES (' +
    sq(METHOD) + ',1,' + sq(enjson(newCalc)) + ",'',''," + sq(METHOD_DESC) + ',' + sq(author) + ',NOW(),NOW());');
  mid = mysql(url, 'SELECT id FROM lumise_printings WHERE title=' + sq(METHOD) + ';', { rows: true })[0].id;
}
const printings = encodePrintings([mid]);
if (existingP.length) {
  mysql(url, 'UPDATE lumise_products SET price=' + sq(blank.toFixed(2)) + ', supplier_cost=' + sq(BLANK_COST.toFixed(2)) +
    ', description=' + sq(PRODUCT_DESC) + ', printings=' + sq(printings) + ', updated=NOW() WHERE id=' + Number(existingP[0].id) + ';');
} else {
  /* The same columns tools/add-services.js writes for a quote-only row. */
  const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
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
