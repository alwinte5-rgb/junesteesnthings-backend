/* What a big head cutout costs, and the ladder that follows from it.
 *
 * One definition, shared by tools/add-cutouts.js and tests/cutout-ladders.test.js.
 * The ladders used to be twelve hardcoded numbers per size sitting under a
 * comment block describing the cost model they came from — two things that have
 * to agree, in a file that is edited for other reasons. Changing MINUTES_PER_HEAD
 * and leaving the ladder is exactly the drift tools/lib exists to prevent.
 *
 * EVERY NUMBER, AND WHERE IT CAME FROM
 *
 *   GF 203OAPAE vinyl   $2.49/sqft   read off the Signs365 account 2026-09-22
 *                                    (3M IJ-35C is $2.99 — the GF is cheaper)
 *   laminate + cut        +20%       CALIBRATED, not assumed: a live cart line
 *                                    of 12"x33" 3M with gloss laminate and
 *                                    contour cutting priced at $9.87, and
 *                                    2.75 sqft x $2.99 x 1.20 is $9.87 exactly
 *   foamcore 48x96 sheet $70.00      +10% contour cut = $77.00
 *   20x30 board           $3.00      Walmart, one whole board per head
 *   shop rate            $35/hour    server.js, the design_commission note
 *
 * MINUTES_PER_HEAD is the one estimate in here. Time a real one and correct it;
 * everything below moves with it.
 */

const VINYL_SQFT = 2.49;          // GF 203OAPAE
const LAMINATE_AND_CUT = 1.20;    // +10% gloss laminate, +10% contour cut
const BOARD = 3.00;               // one 20x30 board per head
const SHEET = 77.00;              // 48x96 foamcore, contour cut included
const SHOP_RATE = 35;             // $/hour
const MINUTES_PER_HEAD = 10;      // mount vinyl to board, hand-cut the head
const MINUTES_HANDLING = 1;       // a sheet arrives contour cut; just unpack it
const MARKUP = 2.0;               // the shop's x2, as tools/lib/markup.js holds it

/* How many nest on one 48x96 sheet, by bounding box: a head is about 0.85 as
   wide as it is tall, plus an inch for kerf and bleed. Real head artwork can
   nest tighter than its bounding box, which only ever helps. */
const PER_SHEET = { 12: 32, 18: 10, 24: 8, 36: 3 };

/* A 24" head is 22" across and does not fit a 20x30 board at all, so 24" and
   36" have no in-house route at any quantity. That is the whole reason they
   carry a minimum. */
const boxOf = (t) => ({ w: Math.ceil(t * 0.85) + 1, h: t });
const sqftOf = (t) => { const b = boxOf(t); return (b.w * b.h) / 144; };
const fitsBoard = (t) => { const b = boxOf(t); return b.w <= 20 && b.h <= 30; };

const labour = (mins) => (SHOP_RATE * mins) / 60;

/** Cost of one head at run size `n`, taking whichever route is cheaper. */
function costEach(size, n) {
  const sheet = SHEET * Math.ceil(n / PER_SHEET[size]) + n * labour(MINUTES_HANDLING);
  const inHouse = fitsBoard(size)
    ? n * (sqftOf(size) * VINYL_SQFT * LAMINATE_AND_CUT + BOARD + labour(MINUTES_PER_HEAD))
    : Infinity;
  return Math.min(sheet, inHouse) / n;
}

/* Raw cost per piece is a SAWTOOTH, because sheets are bought whole: ten 18"
   heads nest on one sheet, and the eleventh forces a second one and sends the
   cost per piece back up. A ladder that rises as the order grows is always a
   mistake, so each band is the worst cost at ANY quantity at or above it — the
   cheapest price that is both non-rising and never under cost. */
const BANDS = [1, 2, 3, 5, 10, 15, 25, 50, 100, 250, 500, 1000];
const HORIZON = 2000;

/** The published ladder for a size: band ceiling -> price, as money strings. */
function ladderFor(size) {
  const envelope = new Array(HORIZON + 1).fill(0);
  let worst = 0;
  for (let n = HORIZON; n >= 1; n--) { worst = Math.max(worst, costEach(size, n)); envelope[n] = worst; }
  const out = {};
  for (const q of BANDS) out[q] = (Math.round(envelope[q] * MARKUP * 20) / 20).toFixed(2);
  return out;
}

/** Smallest run worth selling: one sheet, where there is no in-house route. */
const minimumFor = (size) => (fitsBoard(size) ? 1 : PER_SHEET[size]);

module.exports = {
  VINYL_SQFT, LAMINATE_AND_CUT, BOARD, SHEET, SHOP_RATE, MINUTES_PER_HEAD,
  MINUTES_HANDLING, MARKUP, PER_SHEET, BANDS,
  boxOf, sqftOf, fitsBoard, labour, costEach, ladderFor, minimumFor,
};
