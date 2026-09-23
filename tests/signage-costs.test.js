'use strict';

/* The signage cost model, checked against Signs365's own screens.
 *
 * Two of their worked examples are reproduced here to the cent. They are the
 * only evidence that this model bills the way the supplier bills, so if either
 * stops matching, the shop is quoting from arithmetic the invoice will not
 * agree with.
 *
 *   portal/#order/13   24x18 coro, 10 signs to a 48x96 sheet, $44.00
 *   portal/#order/43   One Way Window 16.617" x 17.83" with gloss laminate,
 *                      charged as 4 sqft at $3.99 = $15.96
 *
 * The second one is the important one. 16.617 x 17.83 is 2.06 sqft of actual
 * material; they charge for 4. Each DIMENSION rounds up to the next whole foot
 * (2ft x 2ft), which is not the same as rounding the area up — that would give
 * 3 — and not the same as the true area, which is what anyone writing this
 * from scratch would reach for first. Billing the true area sells a 3'6" x 2'3"
 * banner at two thirds of what it costs.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const s = require('../tools/lib/signage');

test("their coro example: 24x18 nests 10 to a sheet at $44", () => {
  assert.equal(s.perSheet(24, 18), 10);
  assert.equal(s.coroCost(10, 24, 18, { mm: 4, sides: 'single' }), 44.00);
  /* One sign still costs a whole sheet — that is the point, and it is why this
     product needs a minimum rather than a per-piece price. */
  assert.equal(s.coroCost(1, 24, 18, { mm: 4 }), 44.00);
  /* The eleventh forces a second sheet. */
  assert.equal(s.coroCost(11, 24, 18, { mm: 4 }), 88.00);
});

test("their window example: 16.617 x 17.83 bills as 4 sqft, $15.96", () => {
  assert.equal(s.billableSqft(16.617, 17.83), 4);
  assert.equal(Number(s.windowCost(16.617, 17.83, { laminate: true }).toFixed(2)), 15.96);
});

test('each dimension rounds up independently, not the area', () => {
  /* 2.06 sqft of material. Area-rounded would be 3; dimension-rounded is 4. */
  assert.equal(s.billableSqft(16.617, 17.83), 4);
  /* A foot on the nose does not round up to two. */
  assert.equal(s.billableSqft(12, 12), 1);
  assert.equal(s.billableSqft(12.1, 12), 2);
  /* The case that costs real money: 3'6" x 2'3" is 7.875 sqft, billed as 12. */
  assert.equal(s.billableSqft(42, 27), 12);
});

test('the rounding is applied to every per-foot product, not just the window', () => {
  /* Banner and poster bill the same way; pricing them on true area would sell
     below cost. 42x27 is 7.875 actual sqft. */
  assert.equal(s.bannerCost(42, 27, { oz: 13 }), 12 * 1.25);
  assert.equal(s.posterCost(42, 27), 12 * 2.00);
});

test('double-sided banner exists at 18oz only', () => {
  assert.ok(s.BANNER[18].double);
  assert.equal(s.BANNER[13].double, undefined);
  assert.equal(s.BANNER[15].double, undefined);
  assert.equal(s.bannerCost(24, 24, { oz: 13, sides: 'double' }), null);
});

test('both window perforations cost the same; only laminate moves it', () => {
  assert.equal(s.ONE_WAY_WINDOW.no_laminate, 2.75);
  assert.equal(s.ONE_WAY_WINDOW.laminate, 3.99);
});

test('retail never lands under cost x2', () => {
  for (const cost of [0.01, 5, 44, 70, 95, 22.5, 76.5]) {
    assert.ok(s.retail(cost) >= cost * s.MARKUP,
      'retail ' + s.retail(cost) + ' is under ' + cost + ' x' + s.MARKUP);
  }
});

test('a piece too big for a coro sheet is refused, not priced', () => {
  assert.equal(s.perSheet(60, 120), 0);
  assert.equal(s.coroCost(1, 60, 120, { mm: 4 }), null);
});

/* Freight, confirmed by June 2026-09-22. An earlier draft of the model read
 * the "PRICING AND SHIPPING" column heading as meaning freight was included
 * and added nothing — it is not included, and that would have sold every
 * signage job $10 to $199 under cost. */
test('freight is charged once an order, at the confirmed rates', () => {
  assert.equal(s.freightFor({}), 10.00);
  assert.equal(s.freightFor({ oversized: true, substrate: 'coro' }), 75.00);
  assert.equal(s.freightFor({ oversized: true, substrate: 'foam' }), 199.00);
  /* Default substrate is coro, so an unqualified oversized order never
     silently takes the cheaper standard rate. */
  assert.equal(s.freightFor({ oversized: true }), 75.00);
});

test('the oversized-coro rate has no home in server.js yet', () => {
  /* $10, $50 (Saturday) and $199 exist as addons; $75 does not. This test is
     the reminder — when a cutout_ship_oversize_coro addon is added, assert it
     here instead of asserting its absence. */
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  const addons = src.slice(src.indexOf('const ADDONS = ['), src.indexOf('\n];', src.indexOf('const ADDONS = [')));
  assert.ok(/rate: 10\b/.test(addons), 'the $10 standard freight addon should exist');
  assert.ok(/rate: 199\b/.test(addons), 'the $199 oversized addon should exist');
  assert.equal(/rate: 75\b/.test(addons), false,
    'a $75 oversized-coro addon now exists — update this test to assert it, not its absence');
});

test('only the oversized freight is built into the price', () => {
  /* June's rule: the oversized charges are easy to forget and ruinous to miss,
     so they are folded in. The $10 stays visible so the quote is honest rather
     than quietly padded. This is the OPPOSITE of the first draft. */
  assert.equal(s.freightIsBuiltIn({}), false);
  assert.equal(s.freightIsBuiltIn({ oversized: false }), false);
  assert.equal(s.freightIsBuiltIn({ oversized: true }), true);
});

test('the wall and vehicle adhesives price per billable foot', () => {
  assert.equal(s.ADHESIVE.low_tac_wall, 3.47);
  assert.equal(s.ADHESIVE.controltac_3m, 4.99);
  /* 42x27 is 7.875 actual sqft, 12 billable. */
  assert.equal(s.adhesiveCost(42, 27, 'low_tac_wall'), 12 * 3.47);
  assert.equal(s.adhesiveCost(42, 27, 'controltac_3m'), 12 * 4.99);
});

test('an unknown adhesive is refused, never priced at zero', () => {
  /* A missing rate reading as free is the failure this repo keeps hitting. */
  assert.equal(s.adhesiveCost(24, 24, 'nope'), null);
  assert.equal(s.adhesiveCost(24, 24, undefined), null);
});

test('acrylic and magnets price per square INCH, canvas per square foot', () => {
  /* Two units in one file is a trap. Reading acrylic as per-sqft would put an
     18x24 panel on the quote at $3 instead of $43. */
  assert.equal(s.acrylicCost(18, 24), 18 * 24 * 0.10);
  assert.equal(s.magnetCost(24, 24), 24 * 24 * 0.07);
  /* Canvas is per billable FOOT: 24x36 is 6 sqft, not 864 of anything. */
  assert.equal(s.canvasCost(24, 36), 6 * 4.98);
});

test('a stock magnet size never quotes at the dearer custom rate', () => {
  for (const [key, fixed] of Object.entries(s.MAGNET_FIXED)) {
    const [w, h] = key.split('x').map(Number);
    assert.ok(s.magnetCost(w, h) <= fixed + 1e-9, key + ' should not exceed its fixed price');
    assert.ok(s.magnetCost(w, h) <= w * h * s.MAGNET_SQIN + 1e-9, key + ' should not exceed the custom rate');
  }
  /* Orientation must not change the answer — 12x18 is the same magnet as 18x12. */
  assert.equal(s.magnetCost(12, 18), s.magnetCost(18, 12));
});

test('paper sheets are whole, so the first 72 cards cost one sheet', () => {
  assert.equal(s.paperCost(1, '3.5x2'), 2.00);
  assert.equal(s.paperCost(72, '3.5x2'), 2.00);
  assert.equal(s.paperCost(73, '3.5x2'), 4.00);
  /* An unknown size is refused rather than priced at zero. */
  assert.equal(s.paperCost(100, '99x99'), null);
});

test('yard signs take the cheaper of the two routes, and cross over at 4', () => {
  /* A Signs365 sheet yields ten 24x18 signs for $44. Below four, that sheet's
     $44 is spread over too few signs and the Amazon blank plus a sticker wins.
     This is what stops one yard sign quoting at $88 the way one 24in cutout
     once quoted at $155. */
  assert.equal(s.yardSignCost(1).route, 'in-house');
  assert.equal(s.yardSignCost(3).route, 'in-house');
  assert.equal(s.yardSignCost(4).route, 'signs365 sheet');
  assert.equal(s.yardSignCost(10).route, 'signs365 sheet');
  /* One sign must never cost a whole sheet. */
  assert.ok(s.yardSignCost(1).cost < 44.00);
});

test('raw cost per sign is a SAWTOOTH — it is the ladder that must not rise', () => {
  /* Sheets are bought whole, so ten signs cost $44 ($4.40 each) and eleven
     cost $88 ($8.00 each). The raw cost per piece genuinely rises there, and
     an earlier version of this test wrongly asserted it could not — it failed
     at exactly qty 11 and was right to.
     cutouts.js documents the same shape: the 18in falls to $8.70 at ten and
     jumps back to $10.02 at fifteen. */
  assert.ok(s.yardSignCost(11).each > s.yardSignCost(10).each, 'the 11th sign forces a second sheet');

  /* What must never rise is the PUBLISHED ladder, which is the envelope over
     that sawtooth: each band priced at the worst cost at or above it. Anyone
     building a ladder straight from yardSignCost() without this step ships a
     price list that gets cheaper if you order less. */
  const envelope = [];
  let worst = 0;
  for (let q = 200; q >= 1; q--) { worst = Math.max(worst, s.yardSignCost(q).each); envelope[q] = worst; }
  for (let q = 2; q <= 200; q++) {
    assert.ok(envelope[q] <= envelope[q - 1] + 1e-9, 'the ladder rose at qty ' + q);
  }
  /* And the envelope still covers cost everywhere. */
  for (let q = 1; q <= 200; q++) {
    assert.ok(envelope[q] >= s.yardSignCost(q).each - 1e-9, 'the ladder is under cost at qty ' + q);
  }
});

test('shop time raises the in-house route and moves the crossover earlier', () => {
  /* Labour is not in the model yet; when it is, more minutes must make the
     supplier route win sooner, never later. */
  assert.equal(s.yardSignCost(3, { minutes: 0 }).route, 'in-house');
  assert.equal(s.yardSignCost(3, { minutes: 30 }).route, 'signs365 sheet');
});

test('a single full body cutout never pays the whole $75 freight', () => {
  /* The failure this route exists to prevent: one standee through Signs365 is
     $70 of board and $75 of freight, and the freight is the larger number. */
  const one = s.fullBodyCutoutCost(1);
  assert.equal(one.route, 'in-house (collected blank)');
  /* Compare the BOARD costs only. one.cost includes the $24 backing, which the
     Signs365 route would also carry — an earlier version of this test left the
     backing on one side of the comparison and not the other, and started
     failing the moment the backing was introduced. */
  const boardOnly = one.cost - s.STANDEE_BACKING;
  assert.ok(boardOnly < s.CORO[4].single + s.boardFreight('coro'),
    'one cutout must beat the Signs365 board-plus-freight price');
});

test('freight is per ORDER, so Signs365 wins once it is diluted', () => {
  assert.ok(s.fullBodyCutoutCost(10).route.startsWith('signs365'));
  /* And the per-unit cost falls as the order grows, because the $75 spreads. */
  assert.ok(s.fullBodyCutoutCost(10).each < s.fullBodyCutoutCost(5).each);
  assert.ok(s.fullBodyCutoutCost(5).each < s.fullBodyCutoutCost(3).each);
});

test('there is no in-house route at 10mm, because the blank costs more', () => {
  /* A 10mm blank is $111.24 against Signs365's $70 PRINTED board. Any future
     change that makes in-house claim 10mm is wrong. */
  assert.ok(s.BLANK_BOARD['10mm_white'] > s.CORO[10].single,
    'a 10mm blank is dearer than a printed 10mm board — in-house is 4mm only');
  assert.equal(s.fullBodyCutoutCost(1).mm, 4);
});

test('more shop time never makes in-house look better', () => {
  assert.ok(s.fullBodyCutoutCost(1, { minutes: 60 }).each > s.fullBodyCutoutCost(1, { minutes: 15 }).each);
});

test('evening up always rounds UP, never through the x2 floor', () => {
  /* Rounding down would put a line under cost x2 and quietly break the margin
     guarantee the whole file rests on. */
  for (const n of [0.11, 1.01, 4.99, 5.01, 44.20, 49.99, 50.01, 112.10, 224.20]) {
    assert.ok(s.evenUp(n) >= n, 'evenUp(' + n + ') went down');
  }
  /* Step by size: nickels under $5, dollars to $50, fives above. */
  assert.equal(s.evenUp(4.21), 4.25);
  assert.equal(s.evenUp(44.20), 45);
  assert.equal(s.evenUp(224.20), 225);
  /* A number already on its step does not jump to the next one. */
  assert.equal(s.evenUp(45), 45);
  assert.equal(s.evenUp(225), 225);
});

test('the standee ladder never rises', () => {
  /* June set the single at $225 when the shop rate was $35/hr. At $50 the
     honest cost carries it to $245 — the target was pinned to a rate that has
     since changed, so this asserts the INVARIANT rather than the figure, and
     the figure itself is June's call. */
  const L = s.standeeLadder();
  const qs = Object.keys(L).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < qs.length; i++) {
    assert.ok(L[qs[i]] <= L[qs[i - 1]], 'the ladder rose at qty ' + qs[i]);
  }
  assert.ok(L[1] >= 225, 'the single should not fall below the $225 June set');
});

test('every standee band still clears cost x2 at its worst quantity', () => {
  const L = s.standeeLadder();
  const qs = Object.keys(L).map(Number).sort((a, b) => a - b);
  let lo = 1;
  for (const q of qs) {
    /* Per piece, the dearest member of a ceiling band is its LOWEST quantity. */
    const worst = s.fullBodyCutoutCost(lo).each;
    assert.ok(L[q] >= worst * s.MARKUP - 1e-9,
      'band <=' + q + ' at $' + L[q] + ' is under cost x2 ($' + (worst * s.MARKUP).toFixed(2) + ') at qty ' + lo);
    lo = q + 1;
  }
});

test('the backing is per piece, so it never dilutes with quantity', () => {
  /* Freight dilutes across an order; a foot does not — every standee needs one. */
  const one = s.fullBodyCutoutCost(1).each;
  const fifty = s.fullBodyCutoutCost(50).each;
  assert.ok(one - fifty < 100, 'the backing should stop the curve collapsing');
  assert.ok(fifty > s.STANDEE_BACKING, 'even at volume a standee costs more than its backing');
});

test('every signage line carries shop time, not just supplier cost', () => {
  /* The gap this closes: every price in this file was supplier cost x2 and
     nothing else, which priced the shop's own work at zero. */
  assert.ok(s.labourCost('banner', 1) > 0);
  assert.ok(s.labourCost('rigid', 1) > 0);
  assert.ok(s.labourCost('paper', 500) > 0);
  /* Job time is once a line; piece time scales. A box of cards is one handling
     job, so 500 cards must not cost 500 handlings. */
  assert.equal(s.labourCost('paper', 1), s.labourCost('paper', 500));
  assert.ok(s.labourCost('banner', 10) > s.labourCost('banner', 1));
});

test('an unknown labour kind throws rather than costing nothing', () => {
  /* A missing rate reading as free is the recurring failure here. */
  assert.throws(() => s.labourCost('nope', 1), /no labour defined/);
});

test('paper carries a higher multiple than the rest', () => {
  assert.ok(s.PAPER_MARKUP > s.MARKUP,
    'cost x2 puts 500 business cards under Vistaprint, which is the wrong shelf');
});
