#!/usr/bin/env node
/* Fitted 6 ft table cover, DTF printed in house on one or two sides
 * (owner, 2026-10-20: "we're only carrying 6ft for 1-2 sides"; "add shipping
 * cost to the table pricing on 6ft").
 *
 *   node tools/add-table-cover.js --vars=<(jtees-env)            # dry run
 *   node tools/add-table-cover.js --vars=<(jtees-env) --apply    # write
 *
 * WHAT IT WRITES
 *   1. A decoration method, "DTF Printing — Table Cover". Its main print is the
 *      LIVE oversized DTF ladder (method #64, itself derived from #1), because a
 *      logo on a table's front panel is a big print; its second stage is #1's
 *      additional-location ladder, so "2 sides" (front and back panels) is the
 *      main print plus one ordinary second location, exactly as on a tee.
 *      server.js gives this method its own once-an-order supplier delivery
 *      charge (tablecover_ship, $11.99, YCC Linens ground for one cover), shown
 *      inside the item's price. It is a separate method for that reason only:
 *      add-ons attach by method title, and DTF on a shirt has no such charge.
 *   2. The product, "Fitted Table Cover — 6 ft", quote-only (active=0, like
 *      the staff services), priced as the blank: YCC Linens' $12.99 x the
 *      garment markup (tools/lib/markup.js). Offered with that method only.
 *
 * Re-run after every DTF price change (tools/add-dtf-oversized.js first): the
 * method's prices are copied from #64 and #1, and a re-run re-prices it in
 * place without touching its on/off switch.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mysqlUrlFrom, mysql, enjson, dejson, sq } = require('./lib/db');
const { sellPrice } = require('./lib/markup');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
const env = varsFile ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : process.env;
const url = mysqlUrlFrom(env);
if (!url) { console.error('usage: add-table-cover.js --vars=<(jtees-env) [--apply]'); process.exit(2); }

const BLANK_COST = 12.99;   // YCC Linens 6 ft fitted polyester, 1-19 (2026-10-20)
const SHIP = 11.99;         // YCC to 60657, one cover, cheapest option (2026-10-20); server.js tablecover_ship
const METHOD = 'DTF Printing — Table Cover';
const METHOD_DESC = 'Full-color DTF printed on a fitted 6 ft table cover: one side is a large print ' +
  'on the front panel (up to 252 sq in); two sides adds the back panel. Includes delivery of the ' +
  'blank cover to our shop, once an order.';
const PRODUCT = 'Fitted Table Cover — 6 ft';
const PRODUCT_DESC = 'Fitted polyester table cover for a 6 ft table (72" x 30"), closed on all four sides. ' +
  'Choose from 30 colors. Printed in our shop with DTF on one side (front) or two sides (front and back).';

const row = (id) => mysql(url, 'SELECT id, title, calculate FROM lumise_printings WHERE id=' + id + ';', { rows: true })[0];
const std = row(1), big = row(64);
const cStd = std && dejson(std.calculate), cBig = big && dejson(big.calculate);
const mainKey = 'id', addKey = 'mr8a5dlx';
for (const [n, c] of [['#1', cStd], ['#64', cBig]]) {
  if (!c || !c.values || !c.values[mainKey] || !c.values[addKey]) {
    console.error('method ' + n + ' is not the two-stage DTF table (id + mr8a5dlx) this tool expects — refusing');
    process.exit(1);
  }
}
const flat = (c, g) => Object.fromEntries(Object.entries(c.values[g]).map(([q, v]) => [q, v && v.price]));
const main = flat(cBig, mainKey);
const additional = flat(cStd, addKey);
const ceilings = Object.keys(main).map(Number).sort((a, b) => a - b);
if (JSON.stringify(ceilings) !== JSON.stringify(Object.keys(additional).map(Number).sort((a, b) => a - b))) {
  console.error('#64 and #1 have different quantity bands — refusing'); process.exit(1);
}

const blank = sellPrice(BLANK_COST);
console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '\n');
console.log('  ' + PRODUCT + ': blank $' + BLANK_COST.toFixed(2) + ' -> $' + blank.toFixed(2) + ' (markup), plus $' + SHIP + ' delivery once an order\n');
console.log('  band        front    back     1 side each*   2 sides each*   (*for 1 cover, delivery included)');
for (const c of ceilings) {
  const m = parseFloat(main[c]), a = parseFloat(additional[c]);
  /* A missing price reads as FREE in every engine: refused, never written. */
  if (!(m > 0) || !(a > 0)) { console.error('  !! no price for the <=' + c + ' band — refusing'); process.exit(1); }
  const one = blank + m + SHIP, two = one + a;
  console.log('  <=' + String(c).padEnd(9) + ('$' + main[c]).padStart(7) + ('$' + additional[c]).padStart(8) +
    ('$' + one.toFixed(2)).padStart(15) + ('$' + two.toFixed(2)).padStart(16));
}

const newCalc = {
  multi: true, type: cStd.type || 'fixed', show_detail: cStd.show_detail || '1',
  values: {
    [mainKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: main[c] }])),
    [addKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: additional[c] }])),
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
const printings = encodeURIComponent(JSON.stringify({ ['_' + mid]: 'A3' }));
if (existingP.length) {
  mysql(url, 'UPDATE lumise_products SET price=' + sq(blank.toFixed(2)) + ', supplier_cost=' + sq(BLANK_COST.toFixed(2)) +
    ', description=' + sq(PRODUCT_DESC) + ', printings=' + sq(printings) + ', updated=NOW() WHERE id=' + Number(existingP[0].id) + ';');
} else {
  mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,supplier,stages,attributes,printings,active,created,updated) VALUES (' +
    sq(PRODUCT) + ',' + sq(PRODUCT_DESC) + ',' + sq(blank.toFixed(2)) + ',' + sq(BLANK_COST.toFixed(2)) + ",'ycc'," +
    sq(enjson({})) + ',' + sq(enjson({})) + ',' + sq(printings) + ',0,NOW(),NOW());');
}

const vm = mysql(url, 'SELECT id, active, calculate FROM lumise_printings WHERE id=' + Number(mid) + ';', { rows: true })[0];
const vp = mysql(url, 'SELECT id, price, active, printings FROM lumise_products WHERE name=' + sq(PRODUCT) + ';', { rows: true })[0];
const ok = JSON.stringify((dejson(vm.calculate) || {}).values) === JSON.stringify(newCalc.values) &&
  Number(vp.price) === blank && vp.printings === printings;
console.log('  verified method #' + vm.id + ' (active=' + vm.active + ') and product #' + vp.id + ' $' + vp.price + ' active=' + vp.active + ': ' + (ok ? 'match' : 'DO NOT MATCH'));
if (!ok) process.exit(1);
