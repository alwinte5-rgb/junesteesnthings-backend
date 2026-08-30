#!/usr/bin/env node
/* Retire a decoration method: stop offering it, without losing what it was.
 *
 *   railway variables --service MySQL --json | node tools/retire-printing.js 19
 *   railway variables --service MySQL --json | node tools/retire-printing.js 19 --apply
 *
 * WHY DEACTIVATE RATHER THAN DELETE
 * ---------------------------------
 * `order_products` and saved quotes both cite a method by id. Deleting the row
 * does not remove the method from those records — it removes the record's
 * ability to say what was sold, so a past job reads as decorated by nothing.
 * `active=0` is how #2-#6, #20 and #21 were already retired: the row and its
 * price history stay, the storefront and the quote form stop offering it.
 *
 * The products matter too. A product's `printings` column lists the methods it
 * allows, and a retired method left in that list is a dangling reference every
 * reader has to defend against. Both halves are done together here, because
 * doing one is what leaves the catalogue in a state nobody meant.
 *
 * Dry run by default: prints every change and writes nothing. `--apply` backs
 * both tables up to ~/jtees-backups/ first — this is live catalogue data.
 *
 * TO UNDO: set active=1 on the method, and restore the products table from the
 * backup this wrote. Both are named in the output.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { urlFromStdinJson, mysql, encodePrintings, decodePrintings, sq } = require('./lib/db');

const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.join(os.homedir(), 'jtees-backups');

const ID = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)));
if (!ID) {
  console.error('usage: railway variables --service MySQL --json | node tools/retire-printing.js <id> [--apply]');
  process.exit(1);
}

/** Snapshot both tables before writing. This is live pricing; there is no undo. */
function backup(url, tag) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
    p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
  const files = [];
  for (const [name, sql] of [
    ['printings', 'SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;'],
    ['products', 'SELECT id, name, active, printings FROM lumise_products ORDER BY id;'],
  ]) {
    const rows = mysql(url, sql, { rows: true });
    const head = Object.keys(rows[0] || {});
    const file = path.join(BACKUP_DIR, name + '-backup-' + stamp + '-' + tag + '.tsv');
    fs.writeFileSync(file, [head.join('\t'),
      ...rows.map((r) => head.map((h) => r[h]).join('\t'))].join('\n') + '\n');
    console.log('  backed up ' + rows.length + ' ' + name + ' rows to ' + file);
    files.push(file);
  }
  return files;
}

const url = urlFromStdinJson(fs.readFileSync(0, 'utf8'));

const method = mysql(url,
  'SELECT id, title, active FROM lumise_printings WHERE id=' + ID + ';', { rows: true })[0];
if (!method) {
  console.error('No printing method with id ' + ID + '.');
  process.exit(1);
}

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — retire printing method #' + ID);
console.log('  ' + method.title);
console.log('  currently ' + (Number(method.active) === 1 ? 'ACTIVE' : 'already inactive'));

/* Every product that offers it. Read and rewritten through the same helpers
   products.php uses, so the two encodings cannot drift — a hand-built string
   here is how a `printings` column gets written back in the legacy CSV form
   that silently drops the print size. */
const products = mysql(url,
  'SELECT id, name, active, printings FROM lumise_products ORDER BY id;', { rows: true });

const touched = [];
for (const p of products) {
  const ids = decodePrintings(p.printings);
  if (!ids.includes(ID)) continue;
  const kept = ids.filter((i) => i !== ID);
  touched.push({ id: Number(p.id), name: p.name, active: Number(p.active), before: ids, kept });
}

console.log('\n' + touched.length + ' product(s) offer it:');
for (const t of touched) {
  const warn = t.kept.length === 0 ? '   <-- would be left with NO decoration method' : '';
  console.log('  #' + String(t.id).padEnd(4) + (t.active ? 'active ' : 'off    ') +
    t.name.slice(0, 52).padEnd(54) + '[' + t.before.join(',') + '] -> [' + t.kept.join(',') + ']' + warn);
}

/* A product with no methods left cannot be designed at all — the editor has
   nothing to offer and the product page falls back to "Get a Quote". That may
   be intended, but it is never intended silently. */
const stranded = touched.filter((t) => t.kept.length === 0);
if (stranded.length) {
  console.log('\nREFUSING: ' + stranded.length + ' product(s) would be left with no decoration ' +
    'method at all. Give them another method first, or take them out of the designer ' +
    'deliberately. Nothing has been written.');
  process.exit(1);
}

const stmts = [
  'UPDATE lumise_printings SET active=0, updated=NOW() WHERE id=' + ID + ';',
  ...touched.map((t) =>
    'UPDATE lumise_products SET printings=' + sq(encodePrintings(t.kept)) +
    ', updated=NOW() WHERE id=' + t.id + ';'),
];

console.log('\n' + stmts.length + ' statement(s):');
for (const s of stmts.slice(0, 4)) console.log('  ' + s.slice(0, 120) + (s.length > 120 ? '...' : ''));
if (stmts.length > 4) console.log('  ... and ' + (stmts.length - 4) + ' more product updates');

if (!APPLY) {
  console.log('\nDry run — nothing written. Re-run with --apply to write.');
  process.exit(0);
}

console.log('\nBacking up before writing...');
backup(url, 'pre-retire-' + ID);

console.log('\nApplying...');
mysql(url, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');

const after = mysql(url,
  'SELECT id, title, active FROM lumise_printings WHERE id=' + ID + ';', { rows: true })[0];
const still = mysql(url, 'SELECT id, printings FROM lumise_products;', { rows: true })
  .filter((p) => decodePrintings(p.printings).includes(ID));

console.log('\nDone.');
console.log('  #' + ID + ' active = ' + after.active + ' (0 = retired)');
console.log('  products still referencing it: ' + still.length + ' (expected 0)');
console.log('\nTo undo: UPDATE lumise_printings SET active=1 WHERE id=' + ID +
  '; and restore the products table from the backup above.');
