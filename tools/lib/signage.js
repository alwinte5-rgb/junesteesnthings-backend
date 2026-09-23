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
 *   Low Tac Wall, PER SQUARE FOOT          portal/#order/45
 *     single        $3.47                  removable fabric, INDOOR ONLY
 *
 *   3M ControlTac, PER SQUARE FOOT         portal/#order/41
 *     single        $4.99                  White IJ-180c, gloss laminated
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

/* Wall and vehicle adhesives, PER SQUARE FOOT, single-sided.
     Low Tac Wall    $3.47   portal/#order/45 — removable fabric, INDOOR ONLY
     3M ControlTac   $4.99   portal/#order/41 — White IJ-180c, gloss laminated
   Low Tac Wall is indoor only; quoting it for a shopfront exterior is a
   callback, not a saving. */
const ADHESIVE = { low_tac_wall: 3.47, controltac_3m: 4.99 };

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

/** Supplier cost of one adhesive graphic at WxH inches. `kind` keys ADHESIVE. */
function adhesiveCost(w, h, kind) {
  const rate = ADHESIVE[kind];
  if (!rate) return null;
  return billableSqft(w, h) * rate;
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
 * WHERE IT GOES — June's rule, 2026-09-22
 *
 *   OVERSIZED ONLY is built into the price: $75 coro, $199 foam board.
 *   The $10 standard rate stays a SEPARATE, VISIBLE line.
 *
 * Her reasoning, and it is the right way round: the oversized charges are the
 * ones that are easy to forget and ruinous to miss — forget $199 on a foam job
 * and the margin is gone — so they are folded in where they cannot be
 * forgotten. The $10 is small, it is the ordinary case, and showing it keeps
 * the quote honest rather than quietly padding every line by ten dollars.
 *
 * Note this is the OPPOSITE of what a naive reading of "shipping in the price"
 * gives you, and the opposite of an earlier draft of this file, which buried
 * the $10 and surfaced the rest.
 *
 * freightFor() returns the supplier's charge. freightIsBuiltIn() answers
 * whether it belongs inside the price or on its own line. */
const FREIGHT = { standard: 10.00, oversized_coro: 75.00, oversized_foam: 199.00 };

/** What Signs365 charges to ship this order, once. */
function freightFor({ oversized = false, substrate = 'coro' } = {}) {
  if (!oversized) return FREIGHT.standard;
  return substrate === 'foam' ? FREIGHT.oversized_foam : FREIGHT.oversized_coro;
}

/** True when this order's freight belongs INSIDE the price rather than on its
 *  own line. Only the oversized rates are buried; the $10 stays visible. */
const freightIsBuiltIn = ({ oversized = false } = {}) => Boolean(oversized);

module.exports = {
  MARKUP, SHEET_W, SHEET_H, BANNER, CORO, STEP_STAKE, BANNER_EXTRAS, POSTER, PER_ITEM,
  ONE_WAY_WINDOW, ADHESIVE, billableSqft, FREIGHT, freightFor, freightIsBuiltIn,
  perSheet, coroCost, bannerCost, posterCost, windowCost, adhesiveCost, retail,
};
