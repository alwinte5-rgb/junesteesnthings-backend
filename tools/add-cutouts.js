#!/usr/bin/env node
/* Big head cutouts: four per-piece ladders and one quote product.
 *
 *   node tools/add-cutouts.js --vars=~/.jtees-art.json
 *   node tools/add-cutouts.js --vars=~/.jtees-art.json --apply
 *
 * WHY THE SIZE IS THE DECORATION METHOD
 * -------------------------------------
 * Same shape as tools/add-buttons.js, for the same reason. Every ordinary line
 * in this system is `blank + decoration x qty` — a garment you buy and printing
 * you put on it. A cutout has no blank and no separate decoration: the print IS
 * the product, and what the price turns on is the SIZE. A per-piece ladder has
 * to live where a per-piece ladder can live, which is a decoration method's own
 * tiers, so each size carries its own ladder and the product carries no price.
 *
 * A size attribute could not express this. Size upcharges are flat — one number
 * added to every piece — and these four sizes do not differ by a constant at
 * any quantity: at 10 pieces a 24" is $30.80 against a 12" at $12.00, and at
 * 500 it is $19.50 against $5.10. Mixed-size jobs are separate lines, which the
 * run-group mechanism already prices at the combined quantity.
 *
 * WHAT IT COSTS (read off the Signs365 account, 2026-09-22)
 *
 *     GF 203OAPAE adhesive vinyl       $2.49 / sqft   (3M IJ-35C is $2.99)
 *     gloss laminate                       +10%
 *     contour cut                          +10%
 *     foamcore 48x96 sheet              $70.00        (+10% cut = $77.00)
 *     coroplast cut                     $75.00 flat, not a percentage
 *     20x30 board, one per head          $3.00
 *
 * The +20% is calibrated, not assumed: a live cart line of 12"x33" 3M with
 * gloss laminate and contour cutting priced at $9.87, and 2.75 sqft x $2.99
 * x 1.20 is $9.87 to the cent.
 *
 * TWO SUPPLY ROUTES, AND THE LADDER TAKES THE CHEAPER ONE
 *
 * A 12" or 18" head can be made in house — adhesive vinyl on a 20x30 board,
 * one whole board per head — or nested on a 48x96 foamcore sheet with 32 and
 * 10 to a sheet. In house wins while the run is short, because a sheet is $77
 * whether you use all of it or not; the sheet wins once the run fills one.
 * A 24" head is 22" across and does not fit a 20x30 board at all, so 24" and
 * 36" are always sheets, 8 and 3 to a sheet.
 *
 *     12"  board route up to ~13 pieces, sheet above
 *     18"  board route up to ~9 pieces, sheet above
 *
 * WHY THE LADDERS LOOK FLAT AT THE TOP AND STEEP AT THE BOTTOM
 *
 * Raw cost per piece is a SAWTOOTH, because sheets are bought whole: the 18"
 * falls to $8.70 at ten pieces and jumps back to $10.02 at fifteen, when the
 * eleventh piece forces a second sheet. A ladder that rises as the order grows
 * is always a mistake — add-buttons.js refuses to write one — so each band here
 * is the worst cost at ANY quantity at or above it. That is the cheapest price
 * that is both non-rising and never under cost, and it is why the 18" holds one
 * number until fifty rather than dipping at ten and climbing back.
 *
 * SHIPPING IS NOT IN THESE NUMBERS, on purpose. It is charged once an ORDER,
 * not once a piece or once a size, so folding it into four ladders would bill
 * it up to four times on a mixed job. It is an ADDON in server.js — $10
 * weekday, $50 Saturday rush, $199 large format — billed `once`.
 *
 * LABOUR IS IN THESE NUMBERS, and putting it in changed the answer.
 *
 *     $35/hour — the shop rate, the same one server.js quotes for design
 *                commission time over two hours
 *     10 min   — mounting vinyl to a board and hand-cutting one head
 *     1 min    — handling a head that arrives already contour cut
 *
 * MINUTES_PER_HEAD is the one number here that was estimated rather than read
 * off an invoice. Time a real one and correct it: at 5 minutes the in-house
 * route holds to 9 pieces, at 15 minutes only to 6, and every band below those
 * moves with it.
 *
 * The consequence is that the SHEET route wins far earlier than the material
 * costs alone suggested. A sheet arrives contour cut, so it carries a minute of
 * handling and no cutting at all; a board carries ten minutes of both. In-house
 * is only cheaper while the run is too short to fill a sheet — about 7 pieces
 * at 12", about 6 at 18". Before labour was counted those crossovers were 13
 * and 9, and the first ladders written from that were selling a single 12" at
 * a 1% margin: $12.00 against $11.82 of board, vinyl and time.
 *
 * WHY THE BIG SIZES CARRY A MINIMUM RATHER THAN BEING WITHDRAWN
 *
 * They were retired on sight, because a single 24" priced at $155. The price
 * was right and the framing was wrong: a 24" head is 22" across, does not fit
 * a 20x30 board, and so has no in-house route at any quantity — the first one
 * buys a whole $77 sheet and leaves seven heads of board over. Sold by the
 * sheet, which is how it is actually made, the same cutout is $35.40. So the
 * minimum is the fix, not withdrawal: eight for the 24", three for the 36",
 * one sheet each. `min_qty` in the calculate blob is what the engine enforces,
 * the same field Screen Printing carries its 50 in.
 */
const fs = require('fs');
const { mysql, enjson, sq } = require('./lib/db');
const { ladderFor, minimumFor, MINUTES_PER_HEAD, SHOP_RATE } = require('./lib/cutouts');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-cutouts.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
if (!url) { console.error('no MySQL URL'); process.exit(2); }

/* The ladders are COMPUTED from the cost model in tools/lib/cutouts.js, not
   typed here, so changing MINUTES_PER_HEAD or a supplier rate moves the prices
   with it instead of leaving twelve stale numbers under a comment describing
   the model they no longer match.

   Keys are band CEILINGS — the price applies UP TO that quantity. The opposite
   convention to BLANK_TIERS, which are floors; getting them the wrong way round
   puts every band one step out. tests/cutout-ladders.test.js pins it. */
const L12 = ladderFor(12), L18 = ladderFor(18), L24 = ladderFor(24), L36 = ladderFor(36);

/* `min_qty` is what the feed publishes as min_order_qty and what priceLine
   enforces — the same field Screen Printing carries a 50 in. Below it the line
   is billed as the minimum, scaled per piece, so the arithmetic still reads
   unit x qty. It is the honest way to say "this size comes by the sheet". */
const calc = (bands, minQty) => enjson({
  multi: false, type: 'fixed', show_detail: '1',
  values: { front: Object.fromEntries(Object.entries(bands).map(([q, p]) => [q, { price: p }])) },
  min_qty: minQty,
});

/* `offered` is whether the size is SOLD, and it is still honoured on write: a
 * size set false keeps whatever `active` it already has, so a run of this tool
 * can never switch a deliberately retired size back on. All four are offered
 * now — the big two behind a one-sheet minimum rather than withdrawn. */
const METHODS = [
  /* `min` is one SHEET's worth for the sizes that can only come as a sheet.
     A 24" head is 22" across and does not fit a 20x30 board, so there is no
     in-house route for it at any quantity — the first one costs a whole $77
     sheet and leaves seven heads of board over. Selling it with a minimum of
     eight is not a restriction, it is the truth about how it is made, and it
     turns a $155 single into a $35.40 piece. The 12" and 18" have an in-house
     route for short runs, so they carry no minimum. */
  { title: 'Big Head Cutout — 12in', bands: L12, min: minimumFor(12), offered: true,
    description: 'A 12 inch tall big head cutout on 3/16 inch board, printed and contour cut. Priced per cutout.' },
  { title: 'Big Head Cutout — 18in', bands: L18, min: minimumFor(18), offered: true,
    description: 'An 18 inch tall big head cutout on 3/16 inch board, printed and contour cut. Priced per cutout.' },
  { title: 'Big Head Cutout — 24in', bands: L24, min: minimumFor(24), offered: true,
    description: 'A 24 inch tall big head cutout on 3/16 inch foam board, printed and contour cut. Made eight to a sheet, so eight is the smallest run. Priced per cutout.' },
  { title: 'Big Head Cutout — 36in', bands: L36, min: minimumFor(36), offered: true,
    description: 'A 36 inch tall big head cutout on 3/16 inch foam board, printed and contour cut. Made three to a sheet, so three is the smallest run. Priced per cutout.' },
];

const NAME = 'Big Head Cutouts';
const DESCRIPTION =
  'Custom big head cutouts, printed and contour cut on 3/16" board. Choose a ' +
  'size — 12, 18, 24 or 36 inches tall — and send the photo. The 24 and 36 ' +
  'inch come eight and three to a sheet, so those are the smallest runs. ' +
  'Bigger runs cost less each.';

const have = new Map(mysql(url, "SELECT id,title FROM lumise_printings WHERE title LIKE 'Big Head Cutout%';", { rows: true })
  .map((r) => [r.title, r.id]));
const prod = mysql(url, 'SELECT id,name FROM lumise_products WHERE name=' + sq(NAME) + ';', { rows: true });

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '  —  labour at $' + SHOP_RATE + '/hr, ' + MINUTES_PER_HEAD + ' min a head in house\n');
for (const m of METHODS) {
  const q = Object.keys(m.bands).map(Number).sort((a, b) => a - b);
  console.log('  ' + (have.has(m.title) ? 'update #' + have.get(m.title) : 'create') + '  ' + m.title +
    (m.offered ? (m.min > 1 ? '   [minimum ' + m.min + ']' : '') : '   [NOT OFFERED]'));
  console.log('      ' + q.map((k) => '<=' + k + ' $' + m.bands[k]).join('  '));
  /* A ladder that rises as the order grows is a mistake, always. */
  for (let i = 1; i < q.length; i++) {
    if (parseFloat(m.bands[q[i]]) > parseFloat(m.bands[q[i - 1]])) {
      console.error('      !! price RISES at ' + q[i] + ' — refusing'); process.exit(1);
    }
  }
}
console.log('\n  ' + (prod.length ? 'product #' + prod[0].id : 'create product') + '  ' + NAME + '  (no price — the size carries it)');
console.log('  shipping is an ADDON in server.js, billed once an order, not per size');

if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
for (const m of METHODS) {
  if (have.has(m.title)) {
    /* active is written ONLY for a size that is offered. A retired size keeps
       whatever active it already has, so re-running cannot resurrect it. */
    mysql(url, 'UPDATE lumise_printings SET calculate=' + sq(calc(m.bands, m.min)) + ', description=' + sq(m.description) +
      (m.offered ? ', active=1' : '') + ', updated=NOW() WHERE id=' + have.get(m.title) + ';');
  } else {
    mysql(url, 'INSERT INTO lumise_printings (title,active,calculate,thumbnail,upload,description,author,created,updated) VALUES (' +
      sq(m.title) + ',' + (m.offered ? '1' : '0') + ',' + sq(calc(m.bands, m.min)) + ",'',''," + sq(m.description) + ',' + sq(author) + ',NOW(),NOW());');
  }
}
/* The size attribute is dropped: the size is the decoration method now, and
   leaving a second place to say "18in" is two sources of truth for the one
   fact the price turns on. */
if (prod.length) {
  mysql(url, 'UPDATE lumise_products SET description=' + sq(DESCRIPTION) + ', attributes=' + sq(enjson({})) +
    ", price=0, printings='', active=1, updated=NOW() WHERE id=" + prod[0].id + ';');
} else {
  mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,stages,attributes,printings,' +
    'thumbnail_url,active,`order`,author,created,updated) VALUES (' + sq(NAME) + ',' + sq(DESCRIPTION) +
    ',0,0,' + sq(enjson({})) + ',' + sq(enjson({})) + ",'','',1,999," + sq(author) + ',NOW(),NOW());');
}
for (const a of mysql(url, "SELECT id,title,active FROM lumise_printings WHERE title LIKE 'Big Head Cutout%' ORDER BY id;", { rows: true }))
  console.log('  verified #' + a.id + '  active=' + a.active + '  ' + a.title);
for (const a of mysql(url, 'SELECT id,name,price FROM lumise_products WHERE name=' + sq(NAME) + ';', { rows: true }))
  console.log('  verified #' + a.id + '  ' + a.name + '  price=' + a.price);
