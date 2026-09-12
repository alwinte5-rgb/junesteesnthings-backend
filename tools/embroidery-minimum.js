#!/usr/bin/env node
/* Give embroidery the 5-piece minimum the shop actually works to.
 *
 *   node tools/embroidery-minimum.js --vars=~/.jtees-art.json
 *   node tools/embroidery-minimum.js --vars=~/.jtees-art.json --apply
 *
 * WHY
 * ---
 * Embroidery is sewn in house and it is the slowest thing the shop does. Below
 * a handful of pieces the setup — hooping, thread-up, trims, the test sew — is
 * most of the job, so a one-off is sold at a loss of time whatever the price
 * says.
 *
 * A quantity tier table cannot say this. Both engines walk the bands as
 * CEILINGS starting at index -1, so any quantity below the first band clamps UP
 * into it and the cheapest row becomes the price for one piece. The minimum has
 * to be a number the engines read, which is `min_qty` inside the method's own
 * `calculate` blob — the same field tools/screenprint-minimum.js writes for the
 * 50-piece screen minimum, and the same one tools/lib/minimums.js reads.
 *
 * SCOPE — READ THIS
 * -----------------
 * The minimum is a property of the METHOD, and caps share their embroidery
 * methods with polos, wovens and everything else that embroiders. So this sets
 * a 5-piece minimum on ALL EMBROIDERY, not on headwear alone. A headwear-only
 * minimum is not expressible without per-product overrides, which do not exist.
 * Digitizing is left alone: it is a one-time charge on a single line.
 */
const fs = require('fs');
const { mysql, dejson, enjson, sq } = require('./lib/db');
const { minimumIsExpressible } = require('./lib/minimums');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const MIN_QTY = 5;
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: embroidery-minimum.js --vars=<file> [--apply]'); process.exit(2); }

const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;

const rows = mysql(url,
  "SELECT id,title,calculate FROM lumise_printings " +
  "WHERE active=1 AND title LIKE '%Embroidery%' ORDER BY id;", { rows: true });

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — minimum ' + MIN_QTY + ' on ' + rows.length + ' embroidery methods\n');

const writes = [];
for (const r of rows) {
  const calc = dejson(r.calculate) || {};
  const bands = Object.keys((calc.values && calc.values.front) || {});
  const cur = calc.min_qty ? parseInt(calc.min_qty, 10) : 0;

  /* A minimum ABOVE the first band ceiling leaves quantities between the two
     still clamping — a fix that reads as applied and is not. */
  if (!minimumIsExpressible(bands, MIN_QTY)) {
    const first = bands.map(Number).sort((a, b) => a - b)[0];
    console.log('  #' + String(r.id).padStart(2) + '  SKIPPED — first band ceiling is ' + first +
      ', a minimum of ' + MIN_QTY + ' cannot be expressed under it   ' + String(r.title).slice(0, 40));
    continue;
  }
  console.log('  #' + String(r.id).padStart(2) + '  min_qty ' + (cur || 'none') + ' -> ' + MIN_QTY +
    '   ' + String(r.title).slice(0, 46));
  if (cur === MIN_QTY) continue;
  calc.min_qty = MIN_QTY;
  writes.push({ id: r.id, blob: enjson(calc) });
}

if (!writes.length) { console.log('\n  nothing to change'); process.exit(0); }
if (!APPLY) { console.log('\n  ' + writes.length + ' to write — pass --apply'); process.exit(0); }

const backup = process.env.HOME + '/jtees-backups/printings-' + Date.now() + '.json';
fs.mkdirSync(process.env.HOME + '/jtees-backups', { recursive: true });
fs.writeFileSync(backup, JSON.stringify(rows, null, 1));
console.log('\n  backed up to ' + backup);

for (const w of writes) mysql(url, 'UPDATE lumise_printings SET calculate=' + sq(w.blob) + ' WHERE id=' + w.id + ';');

/* Read back. A write that did not take is worse than one refused. */
const after = mysql(url, 'SELECT id,calculate FROM lumise_printings WHERE id IN (' +
  writes.map((w) => w.id).join(',') + ');', { rows: true });
let bad = 0;
for (const a of after) {
  const c = dejson(a.calculate) || {};
  if (parseInt(c.min_qty, 10) !== MIN_QTY) { console.log('  #' + a.id + ' DID NOT TAKE'); bad++; }
}
console.log('  ' + (after.length - bad) + '/' + after.length + ' verified at min_qty ' + MIN_QTY);
process.exitCode = bad ? 1 : 0;
