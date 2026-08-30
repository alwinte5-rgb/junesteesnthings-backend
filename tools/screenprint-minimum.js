/* Give the screen-print method the 50-piece minimum it actually has.
 *
 * WHY THIS EXISTS
 * ---------------
 * A quantity tier table cannot express a minimum. Both pricing engines walk the
 * bands expecting the price to fall, and clamp a quantity below the first band UP
 * into it (app.js `index = -1` then qtys[index+1]; core/cart.php the same), so the
 * cheapest row becomes the price for ANY quantity under it. Screen printing's
 * lowest band has ceiling 99 at $8.45 for one colour, so a 12-piece order quotes
 * $8.45/ea against DTF's $22.55 — while the shop pays a 50-piece contract minimum
 * plus $25/colour in screens. Screen print was the cheap click below 50.
 *
 * The fix is enforcement where the quantity is chosen, in both engines. This tool
 * writes the NUMBER those engines read: `min_qty` inside the method's own
 * `calculate` blob, which both already load. One definition, two consumers — not
 * a constant duplicated in JS and PHP.
 *
 * Dry run by default. `--apply` backs both tables up to ~/jtees-backups/ first.
 *
 *     railway variables --service MySQL --json | node tools/screenprint-minimum.js
 *     railway variables --service MySQL --json | node tools/screenprint-minimum.js --apply
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql, dejson, enjson } = require('./lib/db');

const BACKUP_DIR = path.join(os.homedir(), 'jtees-backups');
const TITLE = 'Screen Printing';
const MIN_QTY = 50;

const APPLY = process.argv.includes('--apply');

function backup(url, tag) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
    p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
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
  }
}

const url = urlFromStdinJson(fs.readFileSync(0));

const rows = mysql(url,
  "SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;",
  { rows: true });

const screen = rows.find((r) => String(r.title).toLowerCase() === TITLE.toLowerCase());
if (!screen) throw new Error('no method titled "' + TITLE + '" — run decorations-2026.js first');

const calc = dejson(screen.calculate);
if (!calc) throw new Error('#' + screen.id + ' has an undecodable `calculate` column');

console.log('SCREEN-PRINT MINIMUM');
console.log('  #' + screen.id + ' "' + screen.title + '" active=' + screen.active +
  ' type=' + calc.type);

const bands = Object.keys((calc.values && calc.values.front) || {});
console.log('  bands: ' + (bands.join(', ') || '(none)'));
console.log('  lowest band ceiling: ' + (bands[0] || '?') +
  '  → the price any quantity below it clamps into');

const current = calc.min_qty ? parseInt(calc.min_qty, 10) : 0;
console.log('  min_qty now: ' + (current || 'NONE — this is the hole'));
console.log('  min_qty after: ' + MIN_QTY);

if (current === MIN_QTY) {
  console.log('\n  Already set. Nothing to do.');
  process.exit(0);
}

/* Guard: a minimum at or below the first band would be a no-op that reads as a
   fix, since the clamp only bites BELOW that band. */
const firstBand = parseInt(bands[0], 10);
if (Number.isFinite(firstBand) && MIN_QTY > firstBand) {
  throw new Error('min_qty ' + MIN_QTY + ' is above the first band ceiling ' + firstBand +
    ' — quantities between them would still clamp; re-band the table instead');
}

calc.min_qty = MIN_QTY;

const sql = "UPDATE lumise_printings SET calculate = '" + enjson(calc) +
  "', updated = NOW() WHERE id = " + parseInt(screen.id, 10) + ';';

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. SQL that would run:\n');
  console.log('  ' + sql);
  console.log('\nRe-run with --apply to write it.');
  process.exit(0);
}

console.log('\nAPPLYING —');
backup(url, 'pre-screenprint-minimum');
mysql(url, sql);

const after = dejson(mysql(url,
  'SELECT calculate FROM lumise_printings WHERE id = ' + parseInt(screen.id, 10) + ';',
  { rows: true })[0].calculate);

if (!after || parseInt(after.min_qty, 10) !== MIN_QTY)
  throw new Error('write did not take — min_qty reads back as ' + (after && after.min_qty));

console.log('  verified: #' + screen.id + ' min_qty = ' + after.min_qty);
console.log('  bands intact: ' + Object.keys(after.values.front).join(', '));
