/* Front-and-back pricing, and the positional rule that decides which side is which.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two separate money bugs live here, and neither one crashes.
 *
 * 1. The quote form's location picker was either/or — "one location" or "second
 *    location" — so a job printed front AND back could be quoted at one side's
 *    price while the designer charged both. The quote came in under the work and
 *    nothing said so.
 *
 * 2. A method's price groups are matched to a product's stages BY POSITION, not
 *    by name: stage 0 takes group 0, stage 1 takes group 1. The keys are opaque
 *    ("id", "mr8a5dlx"), so nothing about the data says which is the front. Today
 *    product #12 is front -> back and DTF is id -> mr8a5dlx, which lines up. A
 *    re-seeded catalogue or a product built back-first would silently charge the
 *    cheap back rate for a front print, with no error anywhere.
 *
 * Both engines (core/assets/js/app.js, core/cart.php) resolve stages this way,
 * so these tests pin the arrangement the quote form now has to match.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const box = {};
vm.runInNewContext(lift('quotePricingSource') + '\nthis.text = quotePricingSource();', box);
const engine = {};
vm.runInNewContext(box.text + '\nthis.priceLine = priceLine;', engine);
const { priceLine } = engine;

/* DTF as the catalogue serves it: TWO groups, front first, back cheaper.
   Bands are CEILINGS. These are the live figures. */
const DTF = {
  id: 1, title: 'DTF Printing', min_order_qty: 0,
  positions: {
    id: [ { min_qty: 11, price: 28.15 }, { min_qty: 24, price: 22.55 },
          { min_qty: 49, price: 18.00 }, { min_qty: 99, price: 13.00 } ],
    mr8a5dlx: [ { min_qty: 11, price: 7.20 }, { min_qty: 24, price: 7.20 },
                { min_qty: 49, price: 6.00 }, { min_qty: 99, price: 5.40 } ],
  },
};

/* Screen printing: ONE group, because multi:false. A second location is a second
   set of screens, so the same table is charged again rather than a cheaper one. */
const SCREEN = {
  id: 22, title: 'Screen Printing', min_order_qty: 50,
  positions: { front: [ { min_qty: 99, price: 8.45 }, { min_qty: 249, price: 6.30 } ] },
};

const line = (method, qty, stage) => priceLine({
  qty, colours: 1, method, stage,
  product: { price: 0, sizes: [] }, blankTiers: [], addons: [],
  blankOverride: null, unitOverride: null, sizeMix: null,
});

const unit = (m, q, s) => Math.round(line(m, q, s).unit * 100) / 100;

test('front only prices the first group', () => {
  assert.strictEqual(unit(DTF, 50, ''), 13.00);
});

test('back only prices the second group, which is cheaper', () => {
  assert.strictEqual(unit(DTF, 50, 'mr8a5dlx'), 5.40);
  assert.ok(unit(DTF, 50, 'mr8a5dlx') < unit(DTF, 50, ''));
});

test('front + back charges BOTH, matching what the designer bills', () => {
  /* The designer prices each decorated stage: $13.00 front + $5.40 back. A quote
     that charged either one alone was under the work. */
  assert.strictEqual(unit(DTF, 50, 'both'), 18.40);
  assert.strictEqual(unit(DTF, 50, 'both'), unit(DTF, 50, '') + unit(DTF, 50, 'mr8a5dlx'));
});

test('a one-group method doubles its own table rather than pricing one side', () => {
  /* Screen printing is multi:false — the second location uses the SAME table,
     because it is a second set of screens. Falling back to "front only" here
     would give away a whole extra print run. */
  assert.strictEqual(unit(SCREEN, 100, 'both'), unit(SCREEN, 100, '') * 2);
});

test('front + back never costs less than one side', () => {
  for (const q of [1, 12, 24, 50, 100, 500]) {
    assert.ok(unit(DTF, q, 'both') >= unit(DTF, q, ''),
      `qty ${q}: two sides must not undercut one`);
  }
});

test('the positional rule: group ORDER is what names the side', () => {
  /* This is the invariant both engines depend on and neither states. If a
     product were ever built back-first, or the catalogue re-seeded with the
     groups reversed, "front only" would quietly bill the back rate. */
  const keys = Object.keys(DTF.positions);
  assert.strictEqual(keys[0], 'id', 'first group is the front');
  assert.strictEqual(keys[1], 'mr8a5dlx', 'second group is the back');

  const REVERSED = { id: 1, title: 'DTF Printing', min_order_qty: 0,
    positions: { mr8a5dlx: DTF.positions.mr8a5dlx, id: DTF.positions.id } };

  /* Same data, groups swapped: "front only" now returns the BACK price. Nothing
     errors. That is the whole hazard, asserted so it cannot be a surprise. */
  assert.strictEqual(unit(REVERSED, 50, ''), 5.40);
  assert.notStrictEqual(unit(REVERSED, 50, ''), unit(DTF, 50, ''));

  /* Both-sides is order-independent, being a sum — so it is the safe choice. */
  assert.strictEqual(unit(REVERSED, 50, 'both'), unit(DTF, 50, 'both'));
});

test('the minimum still applies to a two-sided line', () => {
  /* 12 pieces of screen printing is below the 50-piece minimum on BOTH sides, so
     both must be billed as the minimum they trigger, not the clamped rate. */
  assert.ok(unit(SCREEN, 12, 'both') > 8.45 * 2);
});
