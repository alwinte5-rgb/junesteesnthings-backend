/* What Signs365 signage costs, and the retail that follows from it.
 *
 * One definition, shared by tools/add-signage.js and tests/signage-ladders.test.js —
 * the same split tools/lib/cutouts.js uses, and for the same reason: a cost
 * model that lives in a script gets edited for other reasons and drifts.
 *
 * EVERY NUMBER, AND WHERE IT CAME FROM
 * Read off the Signs365 order screens on 2026-09-22 (portal/#order/18 for the
 * banner, portal/#order/13 for the coro). The column heading on both reads
 * "PRICING AND SHIPPING", which is a LABEL ON THE COLUMN AND NOT A STATEMENT
 * THAT FREIGHT IS INCLUDED. It is not. June confirmed the rates; they are in
 * FREIGHT below, and the numbers in this file are all ex-freight.
 *
 *   HD Banner (vinyl scrim), PER SQUARE FOOT
 *     13oz  single  $1.25        grommets and heat-welded edges INCLUDED
 *     15oz  single  $1.75        rope / pole pockets / wind slits are EXTRA
 *     18oz  single  $2.25        (their price is not yet recorded — see below)
 *     18oz  double  $4.25        double-sided is 18oz ONLY
 *
 *   Coro (corrugated plastic), PER 48x96 SHEET, nest as many as fit
 *     4mm   single  $44.00       the yard-sign material
 *     4mm   double  $55.00
 *     10mm  single  $70.00       June's preference for full body cutouts
 *     10mm  double  $90.00
 *     step stake    $5.00 each
 *
 *   Poster paper, PER SQUARE FOOT          portal/#order/21
 *     single        $2.00
 *
 *   Econo Banner Stand Plus, PER ITEM      portal/#order/1021
 *     33.5 x 80     $95.00                 hardware + print, one fixed size
 *
 *   One Way Window, PER SQUARE FOOT        portal/#order/43
 *     no laminate   $2.75                  50/50 and 70/30 cost the same
 *     gloss lam     $3.99                  single-sided only, 8 year life
 *
 * WHY CORO IS PRICED BY THE SHEET AND BANNER BY THE FOOT
 * That is how the supplier sells them, and the shapes are genuinely different.
 * A banner is cut from a roll, so a 3x6 costs exactly half of a 3x12. A coro
 * sheet is bought whole however much of it is used, so ten 24x18 yard signs
 * cost one sheet and so does one. Pricing coro per square foot would sell the
 * first sign of a run at a ninth of what it costs.
 */

const MARKUP = 2.0;            // the shop's x2, as tools/lib/markup.js holds it
const SHEET_W = 48;            // a coro sheet, inches
const SHEET_H = 96;

/* Per square foot. Keyed weight -> sides. */
const BANNER = {
  13: { single: 1.25 },
  15: { single: 1.75 },
  18: { single: 2.25, double: 4.25 },
};

/* Per whole 48x96 sheet. Keyed thickness (mm) -> sides. */
const CORO = {
  4:  { single: 44.00, double: 55.00 },
  10: { single: 70.00, double: 90.00 },
};

const STEP_STAKE = 5.00;       // each, from the order screen's STEP STAKES control

/* Per square foot, single-sided. Poster paper, portal/#order/21. */
const POSTER = 2.00;

/* One Way Window — perforated window adhesive, PER SQUARE FOOT.
   portal/#order/43. 50/50 and 70/30 perforation cost the SAME; the only thing
   that moves the price is the laminate. Single-sided only. */
const ONE_WAY_WINDOW = { laminate: 3.99, no_laminate: 2.75 };

/* HOW SIGNS365 BILLS SQUARE FEET, and it is not the area of the piece.
 *
 * Their own worked example: One Way Window at 16.617" x 17.83" is 2.06 sqft of
 * material, and the screen charges 4 sqft ($15.96 at $3.99). That is EACH
 * DIMENSION rounded up to the next whole foot -- 2ft x 2ft -- not the area
 * rounded up, which would have been 3.
 *
 * It matters on every per-foot product here. A 3'6" x 2'3" banner is 7.9 sqft
 * of vinyl and 12 billable feet: price it on the area and the shop sells it at
 * two thirds of what it pays.
 *
 * CONFIRMED ON ONE PRODUCT ONLY. The banner and poster screens were both
 * sitting at 0" x 0" so neither could show its own arithmetic. Applied to all
 * of them anyway, because the error is one-directional: if Signs365 turns out
 * to bill the true area, this overcharges slightly and the margin holds. The
 * other way round sells below cost. Worth confirming on the next real invoice. */
const billableSqft = (w, h) => Math.ceil(w / 12) * Math.ceil(h / 12);

/* Priced PER ITEM at one fixed size — the hardware IS the product, so there is
   no per-foot rate to scale and nothing to nest. portal/#order/1021. */
const PER_ITEM = {
  econo_banner_stand_plus: { price: 95.00, w: 33.5, h: 80, label: 'Econo Banner Stand Plus' },
};

/* Finishing that is NOT in the sqft rate. Grommets and welded edges ARE, so
   they are deliberately absent here — charging for an included finish is how a
   quote ends up above the competition for no reason. */
const BANNER_EXTRAS = ['rope', 'pole_pockets', 'wind_slits'];

/** How many WxH pieces nest on one 48x96 sheet, trying both orientations.
 *  Bounding box only; real artwork nests tighter, which only ever helps. */
function perSheet(w, h) {
  const upright = Math.floor(SHEET_W / w) * Math.floor(SHEET_H / h);
  const rotated = Math.floor(SHEET_W / h) * Math.floor(SHEET_H / w);
  return Math.max(upright, rotated);
}

/** Supplier cost of `qty` coro pieces at WxH: sheets are bought whole. */
function coroCost(qty, w, h, { mm = 4, sides = 'single' } = {}) {
  const per = perSheet(w, h);
  if (!per) return null;                       // does not fit a sheet at all
  const rate = CORO[mm] && CORO[mm][sides];
  if (!rate) return null;
  return rate * Math.ceil(qty / per);
}

/** Supplier cost of one banner at WxH inches. */
function bannerCost(w, h, { oz = 13, sides = 'single' } = {}) {
  const rate = BANNER[oz] && BANNER[oz][sides];
  if (!rate) return null;
  return billableSqft(w, h) * rate;
}

/** Supplier cost of one One Way Window graphic at WxH inches. */
function windowCost(w, h, { laminate = false } = {}) {
  return billableSqft(w, h) * ONE_WAY_WINDOW[laminate ? 'laminate' : 'no_laminate'];
}

/* Retail rounds UP to the nearest $0.05 so the x2 floor always holds — the
   same rounding tools/lib/cutouts.js uses on its ladders. Rounding down would
   put a line a cent under cost x2 and quietly break the margin guarantee. */
const retail = (cost) => Math.ceil(cost * MARKUP * 20) / 20;

/** Supplier cost of one poster at WxH inches. */
const posterCost = (w, h) => billableSqft(w, h) * POSTER;

/* FREIGHT — CHARGED ONCE AN ORDER, NEVER ONCE A PIECE
 *
 * Confirmed by June, 2026-09-22. Signs365 does NOT include it in the prices
 * above; the "PRICING AND SHIPPING" column heading misled an earlier draft of
 * this file into assuming it did.
 *
 *   standard              $10     the ordinary case
 *   oversized coro        $75     a coro order too big for standard freight
 *   oversized foam board  $199    the same for foam board
 *
 * This vindicates tools/lib/cutouts.js, which already adds $10, and server.js,
 * which bills cutout_ship. NOTE THE GAP: server.js carries $10, $50 (Saturday
 * rush) and $199, but has NO $75 oversized-coro addon. Sell an oversized coro
 * job today and there is no line to put that $75 on.
 *
 * WHERE IT GOES, AND WHY IT DEPENDS ON THE PRODUCT
 * June's rule is that shipping is built into the price. That is honest only
 * where the unit is big enough to carry a per-order charge without distorting
 * it, which is exactly the split cutouts.js already documents: $10 against a
 * $77 sheet is 13% and disappears; $10 on one $24 cutout is 42% and cannot be
 * buried. So:
 *
 *   sheet and board products   freight INSIDE the price (one sheet is big
 *                              enough to carry it, and on a multi-sheet order
 *                              the shop is ahead because freight is still
 *                              charged once)
 *   small per-foot pieces      freight stays a VISIBLE addon — burying $10 in
 *                              a $15 banner triples nothing and just makes the
 *                              quote look wrong
 *
 * freightFor() returns the supplier's charge; it is the caller that decides
 * whether to bury it or bill it, because only the caller knows the order. */
const FREIGHT = { standard: 10.00, oversized_coro: 75.00, oversized_foam: 199.00 };

/** What Signs365 charges to ship this order, once. */
function freightFor({ oversized = false, substrate = 'coro' } = {}) {
  if (!oversized) return FREIGHT.standard;
  return substrate === 'foam' ? FREIGHT.oversized_foam : FREIGHT.oversized_coro;
}

module.exports = {
  MARKUP, SHEET_W, SHEET_H, BANNER, CORO, STEP_STAKE, BANNER_EXTRAS, POSTER, PER_ITEM,
  ONE_WAY_WINDOW, billableSqft, FREIGHT, freightFor,
  perSheet, coroCost, bannerCost, posterCost, windowCost, retail,
};
