#!/usr/bin/env node
/* Add "DTF Printing — Chest logo" next to the standard DTF method.
 *
 *   railway run -s MySQL node tools/add-dtf-chest-logo.js            # dry run
 *   railway run -s MySQL node tools/add-dtf-chest-logo.js --apply    # write
 *
 * The main print is the owner's chest-logo ladder (lib/dtf-chest-logo.js). The
 * second stage is method #1's additional-location ladder copied as it is, so a
 * chest logo beside a full back costs exactly what it does today.
 *
 * QUOTE FORM ONLY: the method is linked to no product, so the online designer
 * does not offer it. The quote form lists every active method.
 *
 * Re-running is safe: it re-prices the method in place WITHOUT touching its
 * on/off switch. Re-run it after any change to method #1's additional-location
 * prices, since that stage is copied.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mysqlUrlFrom, mysql, enjson, dejson, sq } = require('./lib/db');
const { CHEST_LOGO_LADDER } = require('./lib/dtf-chest-logo');

const APPLY = process.argv.includes('--apply');
const url = mysqlUrlFrom(process.env);
if (!url) { console.error('no MySQL connection in the environment — run it under `railway run -s MySQL`'); process.exit(2); }

const TITLE = 'DTF Printing — Chest logo (up to 16 sq in)';
const DESCRIPTION = 'Full-color DTF for a small print up to 16 square inches — a 4" x 4" ' +
  'left-chest logo. Next to a full front or back it is priced as the second location.';

const std = mysql(url, 'SELECT id, title, calculate FROM lumise_printings WHERE id=1;', { rows: true })[0];
const calc = std && dejson(std.calculate);
/* The stages by NAME, the keys every engine reads, never by stored order. */
const mainKey = 'id', addKey = 'mr8a5dlx';
if (!calc || !calc.values || !calc.values[mainKey] || !calc.values[addKey] ||
    Object.keys(calc.values).length !== 2) {
  console.error('method #1 is not the two-stage DTF table (id + mr8a5dlx) this tool expects — refusing');
  process.exit(1);
}
const flat = (g) => Object.fromEntries(Object.entries(calc.values[g]).map(([q, v]) => [q, v && v.price]));
const standard = flat(mainKey);
const additional = flat(addKey);

const ceilings = Object.keys(standard).map(Number).sort((a, b) => a - b);
const mine = Object.keys(CHEST_LOGO_LADDER).map(Number).sort((a, b) => a - b);
if (JSON.stringify(ceilings) !== JSON.stringify(mine)) {
  console.error('method #1 bands (' + ceilings.join(',') + ') do not match the chest ladder (' + mine.join(',') + ') — refusing');
  process.exit(1);
}

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '\n');
console.log('  band        full front  chest logo   2nd location');
let prev = Infinity;
for (const c of ceilings) {
  const p = parseFloat(CHEST_LOGO_LADDER[c]);
  const a = parseFloat(additional[c]);
  console.log('  <=' + String(c).padEnd(9) + ('$' + standard[c]).padStart(10) +
    ('$' + CHEST_LOGO_LADDER[c]).padStart(12) + ('$' + additional[c]).padStart(15));
  /* A missing price reads as FREE in every engine; a ladder that rises with
     quantity, or a chest at or over the full front, is a mistake every time. */
  if (!(p > 0) || !(a > 0)) { console.error('  !! no price for the <=' + c + ' band — refusing'); process.exit(1); }
  if (p > prev) { console.error('  !! chest price RISES at ' + c + ' — refusing'); process.exit(1); }
  if (p >= parseFloat(standard[c])) { console.error('  !! chest not under the full front at ' + c + ' — refusing'); process.exit(1); }
  prev = p;
}

const newCalc = {
  multi: true, type: calc.type || 'fixed', show_detail: calc.show_detail || '1',
  values: {
    [mainKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: CHEST_LOGO_LADDER[c] }])),
    [addKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: additional[c] }])),
  },
};

const existing = mysql(url, 'SELECT id, active FROM lumise_printings WHERE title=' + sq(TITLE) + ';', { rows: true });
console.log('\n  ' + (existing.length ? 'update #' + existing[0].id + ' (active=' + existing[0].active + ', left as it is)' : 'create') + '  ' + TITLE);
console.log('  linked to no product: quote form only');
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const dir = path.join(os.homedir(), 'jtees-backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(dir, 'dtf-chest-logo-' + stamp + '.json');
fs.writeFileSync(backup, JSON.stringify({
  printings: mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;', { rows: true }),
}, null, 1));
console.log('\n  backup ' + backup);

let id;
if (existing.length) {
  id = existing[0].id;
  mysql(url, 'UPDATE lumise_printings SET calculate=' + sq(enjson(newCalc)) +
    ', description=' + sq(DESCRIPTION) + ', updated=NOW() WHERE id=' + Number(id) + ';');
} else {
  const author = mysql(url, 'SELECT author FROM lumise_printings WHERE id=1;', { rows: true })[0].author;
  mysql(url, 'INSERT INTO lumise_printings (title,active,calculate,thumbnail,upload,description,author,created,updated) VALUES (' +
    sq(TITLE) + ',1,' + sq(enjson(newCalc)) + ",'',''," + sq(DESCRIPTION) + ',' + sq(author) + ',NOW(),NOW());');
  id = mysql(url, 'SELECT id FROM lumise_printings WHERE title=' + sq(TITLE) + ';', { rows: true })[0].id;
}

const v = mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings WHERE id=' + Number(id) + ';', { rows: true })[0];
const back = dejson(v.calculate);
const ok = back && JSON.stringify(back.values) === JSON.stringify(newCalc.values);
console.log('  verified #' + v.id + '  active=' + v.active + '  prices ' + (ok ? 'match' : 'DO NOT MATCH'));
if (!ok) process.exit(1);
