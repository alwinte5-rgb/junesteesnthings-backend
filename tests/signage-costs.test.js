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
