#!/usr/bin/env node
/* Price an estimated stitch count against the LIVE embroidery ladder.
 *
 *   python3 tools/embroidery/estimate.py logo.png --width-cm 10 --json \
 *     | node tools/embroidery/quote.js --vars=~/.jtees-art.json --qty 24
 *
 * The bands are READ from lumise_printings, and the stitch ceiling is parsed
 * out of each method's own title ("… 8k–10k stitches"). Nothing about the
 * ladder is duplicated here: retitle a band or switch one off in the admin and
 * this follows, because a second copy of a price ladder is a price ladder that
 * will disagree with the shop.
 */
const fs = require('fs');
const { mysql, dejson } = require('../lib/db');

const argv = process.argv.slice(2);
const opt = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const qi = argv.indexOf('--qty');
const QTY = qi > -1 ? Number(argv[qi + 1]) : 24;
const varsFile = (opt('vars', '') || '').replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: ... | quote.js --vars=<file> [--qty N]'); process.exit(2); }

const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;

/* "…, to 8k stitches" / "… 8k–10k stitches" / "… 14k–22k stitches" -> ceiling */
function ceilingOf(title) {
  const m = String(title).match(/(\d+(?:\.\d+)?)k\s*(?:stitches)?\s*\)?\s*$/i)
    || String(title).match(/[–-]\s*(\d+(?:\.\d+)?)k/i)
    || String(title).match(/to\s+(\d+(?:\.\d+)?)k/i);
  return m ? Math.round(parseFloat(m[1]) * 1000) : null;
}

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  const est = JSON.parse(buf);
  const rows = mysql(url,
    "SELECT id,title,calculate FROM lumise_printings WHERE active=1 AND title LIKE '%Embroidery%' ORDER BY id;",
    { rows: true });
  const dig = mysql(url,
    "SELECT id,title,calculate FROM lumise_printings WHERE active=1 AND title LIKE '%Digitizing%' ORDER BY id;",
    { rows: true });

  const priceAt = (cal, qty) => {
    const v = (dejson(cal) || {}).values;
    const front = v && v.front;
    if (!front) return null;
    /* Tier keys are CEILINGS: the first key >= qty wins. */
    const keys = Object.keys(front).map(Number).sort((a, b) => a - b);
    const k = keys.find((x) => qty <= x);
    return k === undefined ? null : Number(front[k].price);
  };

  const bands = rows.map((r) => ({ id: r.id, title: r.title, ceil: ceilingOf(r.title), cal: r.calculate }))
    .filter((b) => b.ceil).sort((a, b) => a.ceil - b.ceil);

  const pick = (n) => bands.find((b) => n <= b.ceil) || null;
  const lo = pick(est.stitches_low), hi = pick(est.stitches_high);

  console.log('\n  ' + est.file + '  ·  ' + est.width_cm + 'cm x ' + est.height_cm + 'cm  ·  ' +
    est.filled_area_in2 + ' sq in  ·  ~' + est.colours + ' colours');
  console.log('  estimated ' + est.stitches_low.toLocaleString() + ' - ' +
    est.stitches_high.toLocaleString() + ' stitches\n');
  console.log('  LADDER (live, active only)');
  for (const b of bands) {
    const mark = (lo && b.id === lo.id) || (hi && b.id === hi.id) ? ' <-' : '   ';
    console.log('    ' + String(b.ceil).padStart(6) + '  $' + String(priceAt(b.cal, QTY)).padEnd(6) +
      ' @' + QTY + mark + ' ' + String(b.title).slice(0, 46));
  }
  if (!hi) {
    console.log('\n  OVER THE LADDER — ' + est.stitches_high.toLocaleString() +
      ' stitches exceeds every active band. Quote by hand.');
  } else if (lo && lo.id !== hi.id) {
    console.log('\n  STRADDLES TWO BANDS: ' + String(lo.title).slice(0, 40) + ' ($' + priceAt(lo.cal, QTY) +
      ')  ..  ' + String(hi.title).slice(0, 40) + ' ($' + priceAt(hi.cal, QTY) + ')');
    console.log('  Quote the upper: $' + priceAt(hi.cal, QTY) + ' per piece at qty ' + QTY + '.');
  } else {
    console.log('\n  ONE BAND: ' + String(hi.title).slice(0, 46));
    console.log('  $' + priceAt(hi.cal, QTY) + ' per piece at qty ' + QTY + '.');
  }
  const d = dig.map((r) => ({ t: r.title, c: ceilingOf(r.title), p: priceAt(r.calculate, 1) }))
    .filter((x) => x.c).sort((a, b) => a.c - b.c).find((x) => est.stitches_high <= x.c);
  console.log('  Digitizing: ' + (d ? '$' + d.p + ' one-time — ' + String(d.t).slice(0, 44)
    : 'over every active tier, quote by hand') + '\n');
});
