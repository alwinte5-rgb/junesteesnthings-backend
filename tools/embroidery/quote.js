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
/* The estimate is loaded before it picks a band, and that is not padding.
   Fitted against 217 real digitised designs, the raw estimate lands in the
   right band 58% of the time and UNDER-prices 33% — one job in three given
   away. At +25% the give-away rate falls to 12%. Pass --raw to see the
   unloaded band, but do not quote from it. */
const LOADING = argv.includes('--raw') ? 1.0 : 1.25;
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
  const loaded = Math.round((est.stitches_high || est.stitches) * LOADING);
  const lo = pick(est.stitches_low), hi = pick(loaded);

  /* Both producers feed this: estimate.py reports filled_area_in2/colours,
     digitize.py reports threads and no area. Naming them apart printed
     "undefined sq in" on every digitize run. Take either, and omit what is
     genuinely absent rather than print a hole. */
  const area = est.filled_area_in2 != null ? est.filled_area_in2 + ' sq in' : null;
  const cols = est.colours != null ? est.colours : est.threads;
  console.log('\n  ' + est.file + '  ·  ' + est.width_cm + 'cm x ' + est.height_cm + 'cm' +
    (area ? '  ·  ' + area : '') + (cols != null ? '  ·  ' + cols + ' threads' : ''));
  console.log('  estimated ' + est.stitches_low.toLocaleString() + ' - ' +
    est.stitches_high.toLocaleString() + ' stitches' +
    (LOADING > 1 ? '   ->  quoting on ' + loaded.toLocaleString() +
      ' (+' + Math.round((LOADING - 1) * 100) + '% loading)' : '   [RAW - do not quote]'));
  if (est.verdict) {
    console.log('\n  ' + est.verdict + (est.reasons && est.reasons.length ? '' : '  — nothing flagged'));
    for (const r of (est.reasons || [])) console.log('    - ' + r);
  }
  console.log('');
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
    : 'over every active tier, quote by hand'));
  if (est.preview) console.log('  Preview:    ' + est.preview);
  if (est.verdict === 'DECLINE') {
    console.log('\n  This is a DECLINE — the price above is what it would cost, not an offer.');
  }
  console.log('');
});
