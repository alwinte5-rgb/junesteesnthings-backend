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
 *   shop rate            $50/hour    raised from $35 on 2026-09-23: $35 was the
 *                                    bottom of the $30-70 range sign shops charge
 *                                    for shop time, and signage carries the same
 *                                    rate, so one business now has one rate
 *
 * MINUTES_PER_HEAD is the one estimate in here. Time a real one and correct it;
 * everything below moves with it.
 */

const VINYL_SQFT = 2.49;          // GF 203OAPAE
const LAMINATE_AND_CUT = 1.20;    // +10% gloss laminate, +10% contour cut
const BOARD = 3.00;               // one 20x30 board per head
const SHEET = 77.00;              // 48x96 foamcore, contour cut included
const SHOP_RATE = 50;             // $/hour
const MINUTES_PER_HEAD = 10;      // mount vinyl to board, hand-cut the head
/* Per head, on a PACK. The sheet arrives contour cut, so none of the cutting
   is ours — but the sticks still have to be glued on, and one minute a head is
   almost certainly short for that. It is the number the pack price is most
   sensitive to: a 32-pack at 3 minutes is 96 minutes of shop time, $80 against
   the $26.67 assumed here, and the 12in pack goes $208 -> $314.
   UNTIMED. Time one and correct it; everything above moves with it. */
const MINUTES_HANDLING = 1;
const MARKUP = 2.0;               // the shop's x2, as tools/lib/markup.js holds it
const SHIPPING_WEEKDAY = 10.00;   // Signs365 weekday freight, charged once an ORDER

/* How many nest on one 48x96 sheet, by bounding box: a head is about 0.85 as
   wide as it is tall, plus an inch for kerf and bleed. Real head artwork can
   nest tighter than its bounding box, which only ever helps. */
const PER_SHEET = { 12: 32, 18: 10, 24: 8, 36: 3 };

/* A 24" head is 22" across and does not fit a 20x30 board at all, so 24" and
   36" have no in-house route at any quantity. That is the whole reason they
   carry a minimum. */
/* THE PRINT, MEASURED RATHER THAN GUESSED.
 *
 * Three Signs365 order screens, same artwork at three sizes, 2026-09-23. The
 * nominal size IS the print height and the width is 0.9398 of it:
 *
 *     12in   11.277 x 12        1 billable sqft    $2.49
 *     18in   16.889 x 17.972    4 billable sqft    $9.96
 *     36in   33.831 x 36        9 billable sqft   $22.41
 *
 * The old figure was 0.85 of the height plus an inch of kerf — narrower than
 * the real print at every size. */
const HEAD_RATIO = 0.9398;
const boxOf = (t) => ({ w: t * HEAD_RATIO, h: t });

/* AND SIGNS365 BILLS EACH DIMENSION ROUNDED UP TO THE NEXT WHOLE FOOT, not the
 * area of the piece. An 18in head is 2.11 sqft of vinyl and is charged for 4.
 * All three screens confirm it to the cent. It is the same rule
 * tools/lib/signage.js already applies; this file never got it, and reading
 * true area understated an 18in head by $3.61 — most of the reason two of them
 * sold at a loss. */
const billableSqft = (w, h) => Math.ceil(w / 12) * Math.ceil(h / 12);
const sqftOf = (t) => { const b = boxOf(t); return billableSqft(b.w, b.h); };

/* Gloss laminate is INCLUDED at $2.49/sqft: the screens show it selected and
 * the price is exactly billable x $2.49. The old +20% came from a 3M IJ-35C
 * cart line priced on true area — a different material under a different
 * rule — and does not apply to this one. */
const printCost = (t) => sqftOf(t) * VINYL_SQFT;

const fitsBoard = (t) => { const b = boxOf(t); return b.w <= 20 && b.h <= 30; };

const labour = (mins) => (SHOP_RATE * mins) / 60;

/** Cost of one head at run size `n`, taking whichever route is cheaper. */
function costEach(size, n) {
  const sheet = SHEET * Math.ceil(n / PER_SHEET[size]) + n * labour(MINUTES_HANDLING);
  const inHouse = fitsBoard(size)
    ? n * (printCost(size) + BOARD + labour(MINUTES_PER_HEAD))
    : Infinity;
  /* FREIGHT IS NOT IN HERE, and an attempt to put it here was reverted on
     2026-09-23 within the hour. It is charged once an ORDER, and a per-piece
     cost is per METHOD: with it folded in, a job with a 12in pack and 18in
     singles billed the customer $20 of freight against the $10 Signs365
     charges. The note on packCost below has warned about exactly this from the
     beginning — "split across the ladders: billed once per METHOD, so a job
     with 12in singles and a 24in pack pays it twice."
     It lives on the order instead, as the cutout_ship add-on in server.js,
     which is orderShared and therefore billed once for the whole quote no
     matter how many cutout lines it has. */
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

/** The published SINGLES ladder for a size, at the given band ceilings.
 *
 *  Derived, not typed. The four 12in and five 18in prices used to be a literal
 *  table in tools/add-cutouts.js, and when the shop rate went $35 -> $50 the
 *  packs moved with it and the singles did not — eight of the nine bands fell
 *  under the x2 floor, the 12in bottoming out at 31%. A price that does not
 *  move with its own cost model is a price that is right once.
 *
 *  Each band is the worst cost at ANY quantity at or above where the band
 *  starts, so the ladder never rises, and rounded UP to the nearest dollar so
 *  it never lands under the floor. */
function singlesLadder(size, bands) {
  const envelope = new Array(HORIZON + 1).fill(0);
  let worst = 0;
  for (let n = HORIZON; n >= 1; n--) { worst = Math.max(worst, costEach(size, n)); envelope[n] = worst; }
  const out = {};
  let lo = 1;
  for (const q of bands) {
    out[q] = Math.ceil(envelope[Math.min(lo, HORIZON)] * MARKUP).toFixed(2);
    lo = q + 1;
  }
  return out;
}

/** Smallest run worth selling: one sheet, where there is no in-house route. */
const minimumFor = (size) => (fitsBoard(size) ? 1 : PER_SHEET[size]);

/* ── PACKS ────────────────────────────────────────────────────────────────
 *
 * A pack is ONE SHEET. That is the whole idea, and it is why pack pricing is
 * stable where per-piece pricing cannot be.
 *
 * Per-piece cost is a sawtooth: a sheet is bought whole, so the eleventh 18"
 * head forces a second sheet and the cost per piece jumps back up. Every band
 * of a per-piece ladder therefore has to be priced for the WORST quantity
 * inside it, which is why those numbers are uneven and why they move whenever
 * a yield changes.
 *
 * Sold as a sheet, none of that exists. The cost of a pack is the sheet plus a
 * minute of handling a head, and it is IDENTICAL whether one pack is ordered or
 * forty — there is no waste, because the pack IS the unit the supplier sells.
 * One price, flat, at every quantity:
 *
 *     12"  32 a pack   $228    $7.13 a head
 *     18"  10 a pack   $192   $19.20 a head
 *     24"   8 a pack   $188   $23.50 a head
 *     36"   3 a pack   $180   $60.00 a head
 *
 * Rounded UP to an even dollar from cost x2, so every pack clears 50%.
 * These four figures are the ONLY hand-written prices in this file and they
 * have gone stale twice — once when freight was folded in, once when the rate
 * changed. They are documentation, not the source: packPrice() is.
 *
 * It is also the honest thing to sell. A customer ordering ten 12" heads pays
 * for a whole sheet either way; the only question is whether they go home with
 * ten or with thirty-two.
 */
const packSizeFor = (size) => PER_SHEET[size];

/* DELIVERY IS INSIDE THE PACK PRICE, and this is a deliberate choice.
 *
 * Signs365 charges $10 weekday freight once an ORDER. Three ways to handle it:
 *
 *   as an addon on every quote   correct to the cent, and a decision to make
 *                                on every job — which is how it gets forgotten
 *   split across the ladders     wrong: billed once per METHOD, so a job with
 *                                12" singles and a 24" pack pays it twice
 *   inside the pack price        one number, nothing to remember, and a pack
 *                                is big enough to carry it
 *
 * A pack carries it comfortably: $10 against a $78-96 sheet is under 13%, and
 * holding the x2 keeps the margin at 50% with delivery already paid. On an
 * order of several packs the shop is ahead, because freight is still charged
 * once — that is margin, not a second charge to the customer.
 *
 * SINGLES DO NOT include it. $10 on one $24 cutout is 42% of the price and
 * cannot be buried; it stays the `cutout_ship` addon in server.js, visible on
 * the quote. Saturday rush ($50) and large-format freight ($199) stay addons
 * for both, because they are exceptions a person should be choosing on purpose.
 */
/** What one pack costs the shop. Flat in the sheet — no waste, because the
 *  pack IS the unit the supplier sells.
 *
 *  DELIVERY IS NOT IN HERE ANY MORE. It used to be, on the reasoning that a
 *  pack carries $10 comfortably and it is one less thing to remember. The flaw
 *  is what happens on a bigger order: three packs carried three lots of
 *  freight in revenue against one in cost, and the old note called that
 *  "margin, not a second charge to the customer" — which it plainly is, since
 *  the customer paid it three times. June's rule is one delivery charge an
 *  order, so it is one line on the order and nowhere else. */
const packCost = (size) => SHEET + PER_SHEET[size] * labour(MINUTES_HANDLING);

/** Published pack price, rounded up to an even dollar so 50% always holds. */
const packPrice = (size) => Math.ceil((packCost(size) * MARKUP) / 2) * 2;

module.exports = {
  VINYL_SQFT, LAMINATE_AND_CUT, BOARD, SHEET, SHOP_RATE, MINUTES_PER_HEAD,
  MINUTES_HANDLING, MARKUP, PER_SHEET, BANDS,
  boxOf, sqftOf, fitsBoard, labour, costEach, ladderFor, minimumFor,
  packSizeFor, packCost, packPrice, SHIPPING_WEEKDAY, singlesLadder,
};
