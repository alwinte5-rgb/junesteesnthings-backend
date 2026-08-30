/* Regression tests for blank (garment) volume pricing and the price override
 * strike-through on a quote (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * What these guard:
 *
 * 1. THE TWO TIER CONVENTIONS ARE OPPOSITE. The decoration tiers exported by
 *    jt-catalog.php key on the band CEILING, because that is what the
 *    storefront's own pricing code does. The blank tiers here key on the band
 *    FLOOR. Read one as the other and every band lands one step out — the
 *    quote then charges a different number than the shop's own website for the
 *    same order, which is exactly the class of bug that started this work.
 *
 * 2. The highest matching floor must win. Written as a plain loop over a
 *    descending table, a missing `break` or an ascending sort silently returns
 *    the SMALLEST discount instead of the largest, and nothing about the
 *    output looks wrong — the price is merely a little too high, on every
 *    volume order, forever.
 *
 * 3. A manual price is struck through only when it is genuinely lower. An
 *    override ABOVE list is a legitimate quote (rush, awkward artwork);
 *    rendering it crossed out would advertise a discount that is really a
 *    surcharge.
 *
 * These lift the real functions out of server.js rather than restating them,
 * so the tests cannot quietly drift from the code they guard. server.js boots
 * a listener and a DB pool on require, which is why it is not imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

/* Lift the tier table itself too. Restating it here would let the code and the
   test drift apart in exactly the way that makes a pricing test worthless. */
function liftConst(name) {
  const m = src.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\];)`));
  assert.ok(m, `const ${name} not found in server.js`);
  return `const ${name} = ${m[1]}`;
}

const { BLANK_TIERS, blankDiscountPct, blankPriceFor, SCREEN_MIN_QTY } =
  vm.runInThisContext(`(function(){
    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    ${liftConst('BLANK_TIERS')}
    ${lift('blankDiscountPct')}
    ${lift('blankPriceFor')}
    const SCREEN_MIN_QTY = ${(src.match(/const SCREEN_MIN_QTY = (\d+)/) || [])[1]};
    return { BLANK_TIERS, blankDiscountPct, blankPriceFor, SCREEN_MIN_QTY };
  })()`);

/* ── The tier table itself ──────────────────────────────────────────────── */

test('the tier table is sorted descending, which is what makes the loop correct', () => {
  /* blankDiscountPct returns the FIRST match. That is only the largest
     applicable discount if the table descends. Sort it the other way and every
     volume order quietly prices at 3%. */
  const mins = BLANK_TIERS.map((t) => t.min);
  assert.deepStrictEqual(mins, [...mins].sort((a, b) => b - a),
    'BLANK_TIERS must be ordered from the highest floor down');
});

test('the agreed curve is the one in the code', () => {
  /* Cut back on 2026-08-29. There is no supplier volume break behind any of
     this — the garment costs the same at 50 as at 5,000 — so every point given
     away here is margin, not a saving passed on. The shallow curve keeps a real
     gesture on the bids where the garment is most of the price, and nothing
     below 100 pieces, where the shop's flat cost x2 rule stands unmodified.
     The first floor moved 125 -> 100 on 2026-08-30: 100 is the commonest order
     size in the shop and it sat just under the old floor, so the most-quoted
     job got no break and was being hand-overridden on each quote instead. */
  for (const [qty, pct] of [[100, 2], [500, 3], [1000, 5], [3000, 8]]) {
    assert.strictEqual(blankDiscountPct(qty), pct, `${qty} pieces should be ${pct}% off`);
  }
});

/* ── Floors, not ceilings ───────────────────────────────────────────────── */

test('a floor applies AT its quantity, not one piece later', () => {
  assert.strictEqual(blankDiscountPct(100), 2);
  assert.strictEqual(blankDiscountPct(99), 0);
});

test('below the minimum the garment is flat cost x2, with no break at all', () => {
  /* The shop's stated rule. A break here would be pure give-away on the
     smallest orders, which are also the ones that carry the most setup. */
  for (const q of [1, 12, 50, 99]) {
    assert.strictEqual(blankDiscountPct(q), 0, `${q} pieces must not be discounted`);
  }
});

test('the band holds until the next floor', () => {
  assert.strictEqual(blankDiscountPct(499), 2);
  assert.strictEqual(blankDiscountPct(500), 3);
  assert.strictEqual(blankDiscountPct(999), 3);
  assert.strictEqual(blankDiscountPct(1000), 5);
});

test('the largest applicable discount wins, not the smallest', () => {
  /* 5000 clears every floor in the table. Returning 3% here is the missing
     -break bug, and it is invisible in the output. */
  assert.strictEqual(blankDiscountPct(5000), 8);
  assert.strictEqual(blankDiscountPct(1000), 5);
});

test('below the first floor there is no discount at all', () => {
  for (const q of [1, 12, 50, 72, 99]) {
    assert.strictEqual(blankDiscountPct(q), 0, `${q} pieces must not be discounted`);
  }
});

test('a nonsense quantity is not a discount', () => {
  for (const bad of [0, -5, NaN, undefined, null, 'lots']) {
    assert.strictEqual(blankDiscountPct(bad), 0, `${String(bad)} must not discount`);
  }
});

/* ── The money ─────────────────────────────────────────────────────────── */

test('the garment price drops by exactly the tier', () => {
  assert.strictEqual(blankPriceFor(5.64, 50), 5.64);    // Gildan 5000, no break
  assert.strictEqual(blankPriceFor(5.64, 99), 5.64);    // still none, one under the floor
  assert.strictEqual(blankPriceFor(5.64, 100), 5.53);   // 2%
  assert.strictEqual(blankPriceFor(5.64, 1000), 5.36);  // 5%
  assert.strictEqual(blankPriceFor(5.64, 3000), 5.19);  // 8%
});

test('the garment never sells below cost x1.8 on this curve', () => {
  /* The guard the curve exists inside. Cost is flat, so a deep discount walks
     the multiple down with nothing recovering it; 8% at the top keeps the
     garment at 1.84x rather than the 1.60x the previous curve reached. */
  const cost = 2.82, retail = 5.64;   // Gildan 5000, the shop's volume seller
  for (const q of [1, 100, 500, 1000, 3000, 99999]) {
    assert.ok(blankPriceFor(retail, q) / cost >= 1.8,
      `${q} pieces sells the garment at ${(blankPriceFor(retail, q) / cost).toFixed(2)}x`);
  }
});

test('the price is always a whole number of cents', () => {
  /* A fraction of a cent reaches Stripe as an invalid amount. 9.24 x 0.97 is
     8.9628, which must land on 8.96 and not on 8.9628.
     Compared with a tolerance because `8.96 * 100` is itself 896.0000000000001
     in binary floating point — asserting exact equality there tests the
     arithmetic of the test, not the rounding of the code. */
  for (const q of [100, 250, 500, 800, 1000, 3000]) {
    const p = blankPriceFor(9.24, q);
    assert.ok(Math.abs(p * 100 - Math.round(p * 100)) < 1e-9,
      `${q} pieces gave ${p}, which is not a whole number of cents`);
  }
});

test('a missing or zero garment price stays zero', () => {
  for (const bad of [0, -1, NaN, undefined, null]) {
    assert.strictEqual(blankPriceFor(bad, 1000), 0);
  }
});

test('discounting never inverts the price', () => {
  for (const q of [1, 100, 1000, 3000, 99999]) {
    const p = blankPriceFor(9.24, q);
    assert.ok(p > 0 && p <= 9.24, `${q} pieces gave ${p}`);
  }
});

/* ── The screen-print floor ────────────────────────────────────────────── */

test('the screen-print minimum is 50', () => {
  /* The decoration tiers are keyed on band CEILINGS, so the lowest screen tier
     is 71 and a 20-piece job would price at the 50-71 rate and look entirely
     normal. The minimum is what stops that being quoted. */
  assert.strictEqual(SCREEN_MIN_QTY, 50);
});

/* ── The override strike-through ───────────────────────────────────────── */

/* The rule the customer page and the form both apply. Restated here rather
   than lifted because it lives inline in two render paths; if it moves into a
   helper, lift it instead. */
const struck = (listTotal, lineTotal) =>
  (listTotal != null && listTotal > lineTotal) ? listTotal : null;

test('a real reduction is struck through', () => {
  assert.strictEqual(struck(1000, 900), 1000);
});

test('a price above list is NOT struck through', () => {
  /* Rush work priced above catalogue is a surcharge. Crossing it out would
     advertise a discount that does not exist. */
  assert.strictEqual(struck(900, 1000), null);
});

test('an unchanged price is not struck through', () => {
  assert.strictEqual(struck(1000, 1000), null);
});

test('a line with no catalogue price cannot be struck through', () => {
  /* A hand-typed line ("banner, 3ft x 8ft") has no list price to compare. */
  assert.strictEqual(struck(null, 500), null);
});
