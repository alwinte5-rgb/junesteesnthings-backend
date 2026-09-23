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
