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
 * The quote form lists every active method. The online designer offers it on
 * every product that already offers method #1 and that lib/garments.js
 * decorationsFor() gives the 'dtf:chest' role — adult garments: the oversized
 * print's list plus vests (owner, 2026-10-26) — with the value #1 has there.
 *
 * Re-running is safe: it re-prices the method in place WITHOUT touching its
 * on/off switch, and only adds the product link where it is missing. Re-run it
 * after any change to method #1's additional-location prices, since that stage
 * is copied.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mysqlUrlFrom, mysql, enjson, dejson, sq } = require('./lib/db');
const { CHEST_LOGO_LADDER } = require('./lib/dtf-chest-logo');
const { decorationsFor } = require('./lib/garments');

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
const products = mysql(url, 'SELECT id, name, printings FROM lumise_products;', { rows: true });
const parse = (p) => { try { const o = JSON.parse(decodeURIComponent(p || '')); return o && typeof o === 'object' ? o : null; } catch { return null; } };
const hasDtf = products.filter((p) => { const o = parse(p.printings); return o && Object.prototype.hasOwnProperty.call(o, '_1'); });
const fits = (p) => (decorationsFor(p.name) || []).includes('dtf:chest');
const withDtf = hasDtf.filter(fits);
const skipped = hasDtf.filter((p) => !fits(p));

console.log('\n  ' + (existing.length ? 'update #' + existing[0].id + ' (active=' + existing[0].active + ', left as it is)' : 'create') + '  ' + TITLE);
console.log('  offer it on ' + withDtf.length + ' product(s) that already offer standard DTF');
console.log('  skip ' + skipped.length + ' that are not adult garments (bags, kids, caps, non-garments): ' + skipped.map((p) => '#' + p.id).join(' '));
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const dir = path.join(os.homedir(), 'jtees-backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(dir, 'dtf-chest-logo-' + stamp + '.json');
fs.writeFileSync(backup, JSON.stringify({
  printings: mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;', { rows: true }),
  products: products.map((p) => ({ id: p.id, printings: p.printings })),
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

/* Every product link in ONE transaction, as in add-dtf-oversized.js. */
const linkStmts = [];
for (const p of withDtf) {
  const o = parse(p.printings);
  if (Object.prototype.hasOwnProperty.call(o, '_' + id)) continue;
  o['_' + id] = o._1;
  linkStmts.push('UPDATE lumise_products SET printings=' + sq(encodeURIComponent(JSON.stringify(o))) +
    ', updated=NOW() WHERE id=' + Number(p.id) + ';');
}
if (linkStmts.length) mysql(url, 'START TRANSACTION;\n' + linkStmts.join('\n') + '\nCOMMIT;');

const v = mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings WHERE id=' + Number(id) + ';', { rows: true })[0];
const back = dejson(v.calculate);
const ok = back && JSON.stringify(back.values) === JSON.stringify(newCalc.values);
console.log('  verified #' + v.id + '  active=' + v.active + '  prices ' + (ok ? 'match' : 'DO NOT MATCH'));
console.log('  linked to ' + linkStmts.length + ' more product(s)');
if (!ok) process.exit(1);
