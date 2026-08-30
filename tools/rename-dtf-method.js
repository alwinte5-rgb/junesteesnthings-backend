/* Rename printing method #1 "Printing" to "DTF Printing".
 *
 * WHY: "Printing" is the name a customer sees next to "Screen Printing" and
 * "Embroidery" on the product page and in the designer's method list. It reads
 * as a generic category rather than a third technique, so the choice looks like
 * two real options and one placeholder. It IS direct-to-film, and the product
 * copy already says "screen print, DTF, or embroidery" — the method list was
 * the only place not saying it.
 *
 * Title only. The `calculate` blob, tiers and id are untouched, so nothing that
 * prices from this method changes; `$JT_NO_TIER_QUOTE` and the quote form key
 * off ids, not titles.
 *
 * Dry run by default. `--apply` backs both tables up to ~/jtees-backups/ first.
 *
 *     railway variables --service MySQL --json | node tools/rename-dtf-method.js
 *     railway variables --service MySQL --json | node tools/rename-dtf-method.js --apply
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql } = require('./lib/db');

const BACKUP_DIR = path.join(os.homedir(), 'jtees-backups');
const FROM = 'Printing';
const TO = 'DTF Printing';
const APPLY = process.argv.includes('--apply');

const url = urlFromStdinJson(fs.readFileSync(0));
const rows = mysql(url, 'SELECT id, title, active FROM lumise_printings ORDER BY id;', { rows: true });

/* Exact match only. A LIKE '%Printing%' would also hit "Screen Printing" and
   rename the method whose minimum this whole change exists to enforce. */
const hit = rows.filter((r) => String(r.title).trim() === FROM);

console.log('RENAME "' + FROM + '" -> "' + TO + '"');
if (hit.length === 0) {
  const already = rows.find((r) => String(r.title).trim() === TO);
  console.log(already ? '  Already renamed (#' + already.id + '). Nothing to do.'
                      : '  No method titled exactly "' + FROM + '". Nothing to do.');
  process.exit(0);
}
if (hit.length > 1) throw new Error('several methods titled "' + FROM + '": ' +
  hit.map((r) => '#' + r.id).join(', ') + ' — resolve by hand');

const m = hit[0];
console.log('  #' + m.id + '  "' + m.title + '"  active=' + m.active + '  ->  "' + TO + '"');
console.log('  untouched: ' + rows.filter((r) => r.id !== m.id && String(r.active) === '1')
  .map((r) => '#' + r.id).join(', '));

const sql = "UPDATE lumise_printings SET title='" + TO + "', updated=NOW() WHERE id=" +
  parseInt(m.id, 10) + " AND title='" + FROM + "';";

if (!APPLY) {
  console.log('\nDRY RUN — nothing written:\n  ' + sql + '\n\nRe-run with --apply.');
  process.exit(0);
}

fs.mkdirSync(BACKUP_DIR, { recursive: true });
const d = new Date(); const p2 = (n) => String(n).padStart(2, '0');
const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
  p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
const bk = mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;', { rows: true });
const head = Object.keys(bk[0]);
const file = path.join(BACKUP_DIR, 'printings-backup-' + stamp + '-pre-rename.tsv');
fs.writeFileSync(file, [head.join('\t'), ...bk.map((r) => head.map((h) => r[h]).join('\t'))].join('\n') + '\n');
console.log('\nAPPLYING —\n  backed up ' + bk.length + ' rows to ' + file);

mysql(url, sql);

const after = mysql(url, 'SELECT title FROM lumise_printings WHERE id=' + parseInt(m.id, 10) + ';', { rows: true })[0];
if (!after || String(after.title).trim() !== TO)
  throw new Error('write did not take — title reads back as "' + (after && after.title) + '"');
console.log('  verified: #' + m.id + ' is now "' + after.title + '"');
