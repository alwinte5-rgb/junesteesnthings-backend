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
 *   Custom Magnets, PER SQUARE INCH        portal/#order/164
 *     any size      $0.07                  NOT per foot — see MAGNET_SQIN
 *   Vehicle Magnets, fixed sizes           confirmed by June
 *     18x12 $11.95  24x12 $14.95  24x18 $20.95  42x12 $29.95  72x24 $89.70
 *
 *   Paper 16pt, PER SHEET                  portal/#order/37
 *     one or two sides  $2.00              same price either way
 *
 *   Acrylic 3/16", PER SQUARE INCH         portal/#order/79
 *     single        $0.10                  NOT per foot. Indoor, long-term.
 *
 *   Canvas 11oz, PER SQUARE FOOT           portal/#order/19
 *     single        $4.98                  poly-cotton, gesso, INDOOR ONLY
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

/* GF 203OAPAE adhesive vinyl, PER SQUARE FOOT. Already priced in
   tools/lib/cutouts.js as VINYL_SQFT; restated here by reference only so the
   two cannot drift — this file imports it rather than retyping the number. */
const { VINYL_SQFT: GF_VINYL } = require('./cutouts');

/* MAGNETS COME TWO WAYS AND THE CHEAPER ONE IS NOT ALWAYS THE CUSTOM ONE.
 *
 *   Custom Magnets   $0.07 per SQUARE INCH   portal/#order/164
 *                    (their example: 24x24 = 576 sqin = $40.32, to the cent)
 *   Vehicle Magnets  fixed sizes, flat price, confirmed by June 2026-09-22
 *
 * Note the unit: square INCH, not square foot. It is the only product here
 * priced that way, and reading it as sqft would price a magnet at 144x cost.
 *
 * Every fixed size below beats $0.07/sqin — a 24x18 is $20.95 against $30.24
 * custom — so magnetCost() takes the cheaper of the two and a stock size is
 * never quoted at the custom rate by accident. */
const MAGNET_SQIN = 0.07;
const MAGNET_FIXED = {
  '18x12': 11.95, '24x12': 14.95, '24x18': 20.95, '42x12': 29.95, '72x24': 89.70,
};

/* Paper, PER SHEET — $2.00 whether it is printed one side or two.
   portal/#order/37. The sheet is the unit: a size's yield is how many come off
   one sheet, so 72 business cards and 1 poster-sized 20x16 both cost $2. */
/* Acrylic, PER SQUARE INCH — portal/#order/79. 3/16" rigid, printed on the
   back with a white underbase. Indoor, long-term. The SECOND product here
   priced by the square inch rather than the foot; read it as sqft and an
   18x24 plaque prices at $3 instead of $43. */
const ACRYLIC_SQIN = 0.10;

/* Canvas, PER SQUARE FOOT — portal/#order/19. 11oz poly-cotton with a gesso
   finish, indoor only, single-sided. */
const CANVAS = 4.98;

/* THE IN-HOUSE YARD SIGN ROUTE
 *
 * A blank 24x18 coro sign from Amazon, $4.50 each (June, 2026-09-22), with a
 * GF 203OAPAE sticker applied in the shop. It is the same two-route shape
 * cutouts.js has: buy the piece whole from the supplier, or make it here, and
 * take whichever is cheaper AT THAT QUANTITY.
 *
 * The crossover is early. A Signs365 sheet yields ten 24x18 signs for $44, so
 * once a run fills a sheet the supplier is $4.40 a sign and in-house cannot
 * get near it. Below that the sheet's $44 is spread over very few signs and
 * the in-house route wins easily.
 *
 * LABOUR IS NOT IN THIS YET. Applying a sticker to a board takes a few minutes
 * and nobody has timed it, so yardSignCost() takes the minutes as an argument
 * rather than inventing a number. At 0 it is materials only, which is a floor
 * and not a price. */
const AMAZON_CORO_BLANK = 4.50;

/* BLANK 48x96 COROPLAST, COLLECTED — the cheaper route for full body cutouts.
 * Home Depot, read 2026-09-23. Collected in Chicago, so NO FREIGHT AT ALL,
 * which is the whole point: Signs365 charges $75 to ship one 48x96 board and
 * that is larger than the $70 board.
 *
 *   4mm white   $28.91   (10-pack at $289.06)
 *   4mm black   $40.20
 *   10mm white  $111.24  (3-pack at $333.73)
 *
 * NOTE THE 10mm. At $111 a blank it is dearer than Signs365's $70 PRINTED
 * board, so there is no in-house route at 10mm at any quantity. In-house means
 * 4mm. That is a real product difference, not just a price one, and a quote
 * should say which it is.
 *
 * AND THE FREIGHT IS PER ORDER, NOT PER BOARD. One standee carries the whole
 * $75; four share it. So this is the same sawtooth as everything else here —
 * in-house wins on ones and twos, Signs365 wins once the order is big enough
 * to dilute the freight. */
const BLANK_BOARD = { '4mm_white': 28.91, '4mm_black': 40.20, '10mm_white': 111.24 };

/* A life-size silhouette is not a full 48x96 rectangle of print — it is a
   person-shaped cut, roughly 24in across and 72in tall. 12 sqft is that
   shape's area and it is an ESTIMATE, the one number here nobody measured.
   Every in-house figure moves with it. */
const STANDEE_PRINT_SQFT = 12;

/* Mounting vinyl to a 48x96 board and hand-cutting a 6ft silhouette. Also an
   estimate — cutouts.js makes the same admission about MINUTES_PER_HEAD, and
   the same instruction applies: time a real one and correct it. */
const STANDEE_MINUTES = 40;

/* THE BACKING. A standee has to stand up, and that foot does not come off the
   sheet — it is built here, per piece, out of offcut board and time. June set
   the finished single at $225, and working back from that at the x2 floor the
   backing is $24 a piece: $88.10 of cutout plus $24 is $112.10, which doubles
   to $224.20 and rounds up to $225.
   It is per PIECE, not per order — every standee needs its own foot — so it
   does not dilute the way the freight does. */
const STANDEE_BACKING = 24.00;

/* LABOUR. Nothing arrives finished.
 *
 * Every signage price in this file was supplier cost x2 and nothing else,
 * which quietly assumed the shop does no work — it unpacks a box and hands it
 * over. It does not: there is checking, trimming, folding, bagging, and on the
 * adhesive work an application. cutouts.js has carried $35/hr from the start
 * and this file should have too.
 *
 * Two kinds of time, because they scale differently:
 *   job    once a line, whatever the quantity — pull the file, check the
 *          proof, receive the delivery, hand it over
 *   piece  every unit — inspect, trim, fold, bag
 *
 * ALL OF THESE ARE ESTIMATES. Nobody has timed them. They are the same
 * admission cutouts.js makes about MINUTES_PER_HEAD, and the same instruction
 * applies: time a real job and correct the table. The prices move with it. */
const SHOP_RATE = 50;
/* DOUBLED on 2026-09-23, June's call: the first table was written from a
   standing start and it turned out to be about half the real time. Rigid was
   set explicitly at 25 minutes a line rather than doubled, because mounting
   and wrapping an acrylic or a canvas is the slowest thing on this list. */
const LABOUR = {
  banner:   { job: 20, piece: 10 },  // unfold, check hems and grommets, refold, bag
  rigid:    { job: 25, piece: 6 },   // acrylic, canvas, poster — mount, inspect, wrap
  adhesive: { job: 30, piece: 0 },   // sold by the foot; the time is in the file and the handover
  magnet:   { job: 20, piece: 4 },
  paper:    { job: 30, piece: 0 },   // a box of cards is one handling job, not 500
  stand:    { job: 30, piece: 10 },  // assemble and test the mechanism

  /* Yard signs are NOT rigid work and must not borrow its 25+6. They arrive
     printed and stacked from Signs365 and get counted and bagged: seconds
     each, not minutes. Priced as rigid, fifty yard signs came to 5.4 hours
     of labour and $20 a sign against an $8-15 local market — the category
     was wrong, not the price. The in-house route carries its own sticker
     time, passed to yardSignCost() as its minutes argument. */
  yard_sign: { job: 15, piece: 0.5 },
};

/** Shop time on a line of `qty` `kind`, in dollars. */
function labourCost(kind, qty = 1) {
  const l = LABOUR[kind];
  if (!l) throw new Error('no labour defined for ' + kind);
  return (SHOP_RATE * (l.job + l.piece * qty)) / 60;
}

/* Paper carries a higher multiple than everything else, and deliberately.
 * A $2 sheet yields 72 business cards, so cost x2 prices 500 cards at $46 —
 * under Vistaprint, which is not where a local shop with design included
 * should sit. June asked for a little under market; market here is $35 at
 * Vistaprint and $80-100 at Moo, with local shops higher again. */
const PAPER_MARKUP = 2.5;

/* BUT NOT ON THE BIG SHEETS, and the reason is which cost dominates.
 *
 * A sheet yields 72 business cards, so on a card order the supplier cost is
 * trivial and almost the whole price is the shop's work — x2.5 on $14 of paper
 * is fair and lands 500 cards at $70 against Moo's $80-100.
 *
 * An 11x8.5 flyer yields 5 to a sheet, so 1000 of them is $400 of paper and
 * the same multiple lands at $1,035 against a $400-700 market. The multiple is
 * not wrong; it is being applied to the wrong kind of cost. Where the supplier
 * dominates, the markup has to come down or the price leaves the market.
 *
 * Threshold is the sheet yield: 9 or more to a sheet is a small piece where
 * handling dominates, fewer is a large one where the paper does. */
const PAPER_MARKUP_LARGE = 2.0;

/* BANNERS CARRY x3, June's call 2026-09-23.
 *
 * The research said a local sign shop's standard is $8/sqft and the US average
 * is $5. At x2 a 3x6 was $70, which is $3.89/sqft — under the average and half
 * the local rate, with 50% margin. There was room and this takes it.
 *
 * WATCH THE SMALL ONES. The $12.50 of handling is the same on a 2x4 as on a
 * 4x8, so on a small banner it is a big share of the cost and x3 multiplies it
 * too: a 2x4 lands at $70, which is $8.75/sqft — over the $8 local standard
 * even though the big sizes stay well under it. Small banners are where this
 * markup stops being generous and starts being dear. */
/* BANNERS ARE PRICED PER SQUARE FOOT, not by a markup on cost.
 *
 * That is how the market quotes them and it is why a flat multiple kept
 * misbehaving. Handling is the same $35 on a 2x4 as on a 4x8, so a multiple
 * that is fair on the big sizes is punitive on the small ones: at x3 a 2x4
 * came out at $8.75/sqft, above the $8 a local shop charges, while a 4x8 sat
 * at $5.00. One number cannot fix both.
 *
 * $7/sqft is a little under the $8 local standard, which is what June asked
 * for, and above the $5 US average.
 *
 * THE MINIMUM IS NOT OPTIONAL. At $7/sqft a 2x4 is $56 against $35 of cost —
 * 37%, under the x2 floor — because eight square feet cannot carry a fixed
 * handling charge. The floor price is cost x2, so small banners are sold at
 * the minimum rather than below cost. */
const BANNER_SQFT_RATE = 7.00;

/** Published price for a banner at WxH: per billable foot, never under x2. */
function bannerPrice(w, h, opts = {}) {
  const cost = bannerCost(w, h, opts) + labourCost('banner', 1);
  if (cost === null) return null;
  return evenUp(Math.max(billableSqft(w, h) * BANNER_SQFT_RATE, cost * MARKUP));
}
const PAPER_YIELD_SMALL = 9;

/** The multiple to use for a paper size, by how many come off one sheet. */
const paperMarkupFor = (size) =>
  (PAPER_PER_SHEET[size] || 0) >= PAPER_YIELD_SMALL ? PAPER_MARKUP : PAPER_MARKUP_LARGE;

/* EVENING OUT THE PRICE. A ladder built straight from cost lands on figures
   like $224.20 and $151.00, which read as arithmetic rather than as a price.
   Round UP, never down — down would break the x2 floor — and by a step that
   suits the size of the number. */
function evenUp(price) {
  const step = price < 5 ? 0.05 : price < 50 ? 1 : 5;
  return Math.ceil(price / step - 1e-9) * step;
}

const PAPER_SHEET = 2.00;
const PAPER_PER_SHEET = {
  '3.5x2': 72, '3.5x2.5': 56, '5x3': 30, '6x4': 21, '9x4': 14, '7x5': 12,
  '9x6': 9, '11x8.5': 5, '14x11': 2, '16x12': 2, '17x11': 2, '12x18': 2,
  '20x16': 1, '18x28': 1,
};

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

/** Supplier cost of one magnet at WxH, by whichever route is cheaper. */
function magnetCost(w, h) {
  const custom = w * h * MAGNET_SQIN;
  const fixed = MAGNET_FIXED[w + 'x' + h] ?? MAGNET_FIXED[h + 'x' + w];
  return fixed === undefined ? custom : Math.min(fixed, custom);
}

/** Cost of `qty` 24x18 yard signs by whichever route is cheaper.
 *  Returns { route, cost, each }. `minutes` is the shop time per sign to mount
 *  a sticker — pass the real figure once someone times it. */
function yardSignCost(qty, { minutes = 0, shopRate = SHOP_RATE } = {}) {
  const sheet = coroCost(qty, 24, 18, { mm: 4, sides: 'single' });
  /* Our own vinyl, not Signs365's, so no billable-foot rounding — the sqft is
     the sqft. +20% is the laminate and contour cut, as cutouts.js calibrates it. */
  const sticker = (24 * 18) / 144 * GF_VINYL * 1.20;
  const inHouse = qty * (AMAZON_CORO_BLANK + sticker + (shopRate * minutes) / 60);
  return inHouse < sheet
    ? { route: 'in-house', cost: inHouse, each: inHouse / qty }
    : { route: 'signs365 sheet', cost: sheet, each: sheet / qty };
}

/** Cost of `qty` full body cutouts by whichever route is cheaper.
 *  Returns { route, cost, each, mm }. Signs365 prints the board and charges
 *  $75 freight ONCE for the order; in-house is a collected blank, our own
 *  vinyl and shop time, with no freight at all. */
function fullBodyCutoutCost(qty, { sides = 'single', minutes = STANDEE_MINUTES, shopRate = SHOP_RATE } = {}) {
  /* In-house is 4mm only — a 10mm blank costs more than a printed one. */
  const vinyl = STANDEE_PRINT_SQFT * GF_VINYL * 1.20 * (sides === 'double' ? 2 : 1);
  const inHouse = qty * (BLANK_BOARD['4mm_white'] + vinyl + (shopRate * minutes) / 60);

  /* Signs365, freight amortised across the order. */
  const s365_4 = CORO[4][sides] * qty + boardFreight('coro');
  const s365_10 = CORO[10][sides] * qty + boardFreight('coro');

  const options = [
    { route: 'in-house (collected blank)', cost: inHouse, mm: 4 },
    { route: 'signs365 4mm', cost: s365_4, mm: 4 },
    { route: 'signs365 10mm', cost: s365_10, mm: 10 },
  ];
  /* Compare like with like on 4mm; the 10mm is reported separately because it
     is a better board, not a cheaper one. */
  const best = options.filter((o) => o.mm === 4).reduce((a, b) => (a.cost <= b.cost ? a : b));
  /* The backing is per piece and applies whichever route the board came from. */
  const backing = STANDEE_BACKING * qty;
  const cost = best.cost + backing;
  return {
    ...best, cost, each: cost / qty,
    premium10mm: { cost: s365_10 + backing, each: (s365_10 + backing) / qty },
  };
}

/** The published full body cutout ladder: band CEILINGS -> price each.
 *  Each band is priced at the WORST cost inside it, evened up, so the ladder
 *  never rises and never falls under the x2 floor. */
function standeeLadder(bands = [1, 2, 5, 10, 25, 1000], opts = {}) {
  const out = {};
  let worst = 0;
  for (let i = bands.length - 1; i >= 0; i--) {
    const lo = i === 0 ? 1 : bands[i - 1] + 1;   // cheapest band member is the dearest per piece
    worst = Math.max(worst, fullBodyCutoutCost(lo, opts).each);
    out[bands[i]] = evenUp(retail(worst));
  }
  return out;
}

/** Supplier cost of one acrylic panel at WxH inches. */
const acrylicCost = (w, h) => w * h * ACRYLIC_SQIN;

/** Supplier cost of one canvas at WxH inches. */
const canvasCost = (w, h) => billableSqft(w, h) * CANVAS;

/** Supplier cost of `qty` paper pieces at a named size. Sheets are whole. */
function paperCost(qty, size) {
  const per = PAPER_PER_SHEET[size];
  if (!per) return null;
  return PAPER_SHEET * Math.ceil(qty / per);
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

/* A FULL 48x96 BOARD IS ALWAYS OVERSIZED. Confirmed by June 2026-09-22:
   a single 48x96 coro board ships at $75, a full foam board at $199. So a
   full body cutout is never the $10 rate, and the freight is built into its
   price per her rule that oversized charges are the ones not to forget. */
const isFullBoard = (w, h) => w >= SHEET_W && h >= SHEET_H;
const boardFreight = (substrate) => freightFor({ oversized: true, substrate });

/** True when this order's freight belongs INSIDE the price rather than on its
 *  own line. Only the oversized rates are buried; the $10 stays visible. */
const freightIsBuiltIn = ({ oversized = false } = {}) => Boolean(oversized);

module.exports = {
  MARKUP, SHEET_W, SHEET_H, BANNER, CORO, STEP_STAKE, BANNER_EXTRAS, POSTER, PER_ITEM,
  ONE_WAY_WINDOW, ADHESIVE, GF_VINYL, billableSqft, FREIGHT, freightFor, freightIsBuiltIn,
  MAGNET_SQIN, MAGNET_FIXED, PAPER_SHEET, PAPER_PER_SHEET, ACRYLIC_SQIN, CANVAS,
  AMAZON_CORO_BLANK, yardSignCost, isFullBoard, boardFreight,
  BLANK_BOARD, STANDEE_PRINT_SQFT, STANDEE_MINUTES, STANDEE_BACKING,
  fullBodyCutoutCost, standeeLadder, evenUp,
  SHOP_RATE, LABOUR, labourCost, PAPER_MARKUP, PAPER_MARKUP_LARGE, paperMarkupFor,
  BANNER_SQFT_RATE, bannerPrice,
  perSheet, coroCost, bannerCost, posterCost, windowCost, adhesiveCost,
  magnetCost, paperCost, acrylicCost, canvasCost, retail,
};
