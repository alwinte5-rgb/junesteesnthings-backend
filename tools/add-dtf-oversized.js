#!/usr/bin/env node
/* Add "DTF Printing — Oversized" next to the standard DTF method.
 *
 *   railway run -s MySQL node tools/add-dtf-oversized.js            # dry run
 *   railway run -s MySQL node tools/add-dtf-oversized.js --apply    # write
 *
 * The main print is priced from the LIVE standard ladder (method #1) by
 * oversizedLadder() in lib/dtf-oversized.js — read that file for the rule. The
 * second stage is method #1's additional-location ladder copied as it is: a
 * 12x18 back with a 4x4 chest is one oversized print plus one ordinary second
 * location, and the second location costs Anchorfish the same either way.
 *
 * The method is offered on every product that already offers method #1 and
 * that lib/garments.js decorationsFor() gives the 'dtf:oversized' role (adult
 * tees, hoodies, polos... — not bags, kids' sizes or caps),
 * with the same `printings` value #1 has there. That role is also what the
 * catalogue sweep (decorations-2026.js) and the new-product tool
 * (ssa-add-products.js) read, so neither strips it or forgets it.
 *
 * Re-running is safe: it re-prices the method in place WITHOUT touching its
 * on/off switch (a method the owner retired stays retired), and only adds the
 * product link where it is missing. Re-run it after every change to method #1's
 * prices — the oversized ladder is derived from them.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mysqlUrlFrom, mysql, enjson, dejson, sq } = require('./lib/db');
const { oversizedLadder } = require('./lib/dtf-oversized');
const { decorationsFor } = require('./lib/garments');

const APPLY = process.argv.includes('--apply');
const url = mysqlUrlFrom(process.env);
if (!url) { console.error('no MySQL connection in the environment — run it under `railway run -s MySQL`'); process.exit(2); }

const TITLE = 'DTF Printing — Oversized (up to 252 sq in)';
const DESCRIPTION = 'Full-color DTF for a big print, up to 252 square inches — a 12" x 18" ' +
  'or 14" x 18" full back. Standard DTF covers prints up to about 11" x 12". A second ' +
  'location, like a chest logo, is priced at the standard second-location rate. Larger ' +
  'prints are priced by quote.';

const std = mysql(url, 'SELECT id, title, calculate FROM lumise_printings WHERE id=1;', { rows: true })[0];
const calc = std && dejson(std.calculate);
/* The stages by NAME, the keys every engine reads (server.js "Back only" is
   mr8a5dlx), never by the order they happen to be stored in. */
const mainKey = 'id', addKey = 'mr8a5dlx';
if (!calc || !calc.values || !calc.values[mainKey] || !calc.values[addKey] ||
    Object.keys(calc.values).length !== 2) {
  console.error('method #1 is not the two-stage DTF table (id + mr8a5dlx) this tool expects — refusing');
  process.exit(1);
}
const flat = (g) => Object.fromEntries(Object.entries(calc.values[g]).map(([q, v]) => [q, v && v.price]));
const standard = flat(mainKey);
const additional = flat(addKey);
const oversized = oversizedLadder(standard);

const ceilings = Object.keys(standard).map(Number).sort((a, b) => a - b);
console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '\n');
console.log('  band        standard  oversized   2nd location');
let prev = Infinity;
for (const c of ceilings) {
  const o = parseFloat(oversized[c]);
  console.log('  <=' + String(c).padEnd(9) + ('$' + standard[c]).padStart(8) +
    ('$' + oversized[c]).padStart(11) + ('$' + additional[c]).padStart(15));
  /* A ladder that rises with quantity, or an oversized price at or under the
     standard one, is a mistake every time. */
  /* A missing price reads as FREE in every engine, so a band without one is
     refused, never written. */
  const a = parseFloat(additional[c]);
  if (!(o > 0) || !(a > 0)) { console.error('  !! no price for the <=' + c + ' band — refusing'); process.exit(1); }
  if (o > prev) { console.error('  !! oversized price RISES at ' + c + ' — refusing'); process.exit(1); }
  if (o <= parseFloat(standard[c])) { console.error('  !! oversized not above standard at ' + c + ' — refusing'); process.exit(1); }
  prev = o;
}

const newCalc = {
  multi: true, type: calc.type || 'fixed', show_detail: calc.show_detail || '1',
  values: {
    [mainKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: oversized[c] }])),
    [addKey]: Object.fromEntries(ceilings.map((c) => [String(c), { price: additional[c] }])),
  },
};

const existing = mysql(url, 'SELECT id, active FROM lumise_printings WHERE title=' + sq(TITLE) + ';', { rows: true });
const products = mysql(url, 'SELECT id, name, printings FROM lumise_products;', { rows: true });
const parse = (p) => { try { const o = JSON.parse(decodeURIComponent(p || '')); return o && typeof o === 'object' ? o : null; } catch { return null; } };
const hasDtf = products.filter((p) => { const o = parse(p.printings); return o && Object.prototype.hasOwnProperty.call(o, '_1'); });
const fits = (p) => (decorationsFor(p.name) || []).includes('dtf:oversized');
const withDtf = hasDtf.filter(fits);
const skipped = hasDtf.filter((p) => !fits(p));

console.log('\n  ' + (existing.length ? 'update #' + existing[0].id + ' (active=' + existing[0].active + ', left as it is)' : 'create') + '  ' + TITLE);
console.log('  offer it on ' + withDtf.length + ' product(s) that already offer standard DTF');
console.log('  skip ' + skipped.length + ' that cannot take it (bags, kids, caps, non-garments): ' + skipped.map((p) => '#' + p.id).join(' '));
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

/* Live pricing and live product links: snapshot both before writing. */
const dir = path.join(os.homedir(), 'jtees-backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(dir, 'dtf-oversized-' + stamp + '.json');
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

/* Every product link in ONE transaction: a dropped connection part-way leaves
   no product half-done. (A brand-new method above with no links yet is offered
   nowhere, so it is harmless on its own.) */
const linkStmts = [];
for (const p of withDtf) {
  const o = parse(p.printings);
  if (Object.prototype.hasOwnProperty.call(o, '_' + id)) continue;
  o['_' + id] = o._1;
  linkStmts.push('UPDATE lumise_products SET printings=' + sq(encodeURIComponent(JSON.stringify(o))) +
    ', updated=NOW() WHERE id=' + Number(p.id) + ';');
}
if (linkStmts.length) mysql(url, 'START TRANSACTION;\n' + linkStmts.join('\n') + '\nCOMMIT;');
const linked = linkStmts.length;

const v = mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings WHERE id=' + Number(id) + ';', { rows: true })[0];
const back = dejson(v.calculate);
const ok = back && JSON.stringify(back.values) === JSON.stringify(newCalc.values);
console.log('  verified #' + v.id + '  active=' + v.active + '  prices ' + (ok ? 'match' : 'DO NOT MATCH'));
console.log('  linked to ' + linked + ' more product(s)');
if (!ok) process.exit(1);
