/* Give every active printing method a thumbnail.
 *
 * WHY: all nine active methods had an empty `thumbnail`, and app.js falls back
 * to `assets/images/print-default.jpg` — one grey printer placeholder — so every
 * row in the method list looked identical and the list read as unfinished. The
 * three techniques are visually distinct jobs; the icons say which is which at a
 * glance, on the product page where the choice is now made.
 *
 * Assigned by technique, not per row: the seven embroidery rows differ by size
 * and stitch count, not by process, so they share one mark. Matching is on the
 * TITLE, and deliberately not on id — ids are stable but a re-seeded catalogue
 * is not, and a wrong icon is worse than none.
 *
 * Dry run by default. `--apply` backs the table up to ~/jtees-backups/ first.
 *
 *     railway variables --service MySQL --json | node tools/print-method-thumbnails.js
 *     railway variables --service MySQL --json | node tools/print-method-thumbnails.js --apply
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql } = require('./lib/db');

const BACKUP_DIR = path.join(os.homedir(), 'jtees-backups');
const BASE = '/assets/print-methods/';
const APPLY = process.argv.includes('--apply');

/* First match wins, so the more specific pattern goes first. */
const RULES = [
  [/embroider/i,       'embroidery.svg'],
  [/screen\s*print/i,  'screenprint.svg'],
  [/dtf|printing/i,    'dtf.svg'],
];

const url = urlFromStdinJson(fs.readFileSync(0));
const rows = mysql(url, 'SELECT id, title, active, thumbnail FROM lumise_printings ORDER BY id;', { rows: true });

const want = [];
for (const r of rows) {
  if (String(r.active) !== '1') continue;
  const rule = RULES.find(([re]) => re.test(String(r.title)));
  if (!rule) { console.log('  #' + r.id + ' "' + r.title + '" — no icon matches, left alone'); continue; }
  const file = BASE + rule[1];
  const now = (r.thumbnail && r.thumbnail !== 'NULL') ? r.thumbnail.trim() : '';
  want.push({ id: Number(r.id), title: r.title, from: now, to: file });
}

console.log('PRINT-METHOD THUMBNAILS');
for (const w of want)
  console.log('  #' + String(w.id).padStart(2) + '  ' + w.title.slice(0, 44).padEnd(46) +
    (w.from === w.to ? 'already set' : (w.from === '' ? 'BLANK' : w.from) + '  ->  ' + w.to));

const todo = want.filter((w) => w.from !== w.to);
if (todo.length === 0) { console.log('\n  Nothing to change.'); process.exit(0); }

/* The image has to exist before the row points at it, or every method renders a
   broken image instead of the placeholder it renders today. */
const webroot = path.join(__dirname, '..', 'Lumise', 'Lumise-Product-Designer-PHP-ver2.0', 'lumise');
for (const f of new Set(todo.map((w) => w.to))) {
  const onDisk = path.join(webroot, f.replace(/^\//, ''));
  if (!fs.existsSync(onDisk)) throw new Error('missing icon file: ' + onDisk);
}
console.log('\n  all ' + new Set(todo.map((w) => w.to)).size + ' icon files present on disk');

const sql = todo.map((w) =>
  "UPDATE lumise_printings SET thumbnail='" + w.to + "', updated=NOW() WHERE id=" + w.id + ';').join('\n');

if (!APPLY) {
  console.log('\nDRY RUN — nothing written:\n' + sql.split('\n').map((l) => '  ' + l).join('\n'));
  console.log('\nRe-run with --apply.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
  p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
const head = Object.keys(rows[0]);
const file = path.join(BACKUP_DIR, 'printings-backup-' + stamp + '-pre-thumbnails.tsv');
fs.writeFileSync(file, [head.join('\t'), ...rows.map((r) => head.map((h) => r[h]).join('\t'))].join('\n') + '\n');
console.log('\nAPPLYING —\n  backed up ' + rows.length + ' rows to ' + file);

mysql(url, sql);

const after = mysql(url, 'SELECT id, thumbnail FROM lumise_printings WHERE id IN (' +
  todo.map((w) => w.id).join(',') + ');', { rows: true });
const bad = after.filter((r) => !String(r.thumbnail || '').startsWith(BASE));
if (bad.length) throw new Error('write did not take for: ' + bad.map((r) => '#' + r.id).join(', '));
console.log('  verified: ' + after.length + ' rows now carry an icon');
