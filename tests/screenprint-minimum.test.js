/* The 50-piece screen-print minimum, and the clamp that made it necessary.
 *
 * Screen printing's cheapest band has ceiling 99 at $8.45 for one colour. Both
 * engines clamp a quantity below the first band UP into it, so before this fix a
 * 12-piece screen order quoted $8.45/ea against DTF's $22.55 — while the shop
 * pays a 50-piece contract minimum plus $25/colour in screens. Screen print was
 * the cheapest click below 50, which is the exact mirror of the embroidery
 * problem Phase 1a fixed.
 *
 * These tests pin the rule the two engines implement separately (app.js
 * `enforce_min`, core/cart.php `printing_calc`), so the pair cannot drift into
 * agreeing only with each other.
 */

const test = require('node:test');
const assert = require('node:assert');

const { bandFor, minQty, effectiveMethod, minimumIsExpressible } =
  require('../tools/lib/minimums');

/* The live table as method #22 actually holds it. */
const BANDS = [99, 249, 499, 999, 2499, 7000];
const SCREEN_1_COLOR = { 99: 8.45, 249: 6.30, 499: 4.15, 999: 3.45, 2499: 2.50, 7000: 1.95 };

const SCREEN = { id: 22, title: 'Screen Printing', calculate: { min_qty: 50 } };
const DTF = { id: 1, title: 'Printing', calculate: {} };
const EMBROIDERY = { id: 7, title: 'Embroidery — Chest', calculate: {} };

test('the clamp is real: a quantity below every band prices at the cheapest row', () => {
  /* This is the whole reason a minimum cannot live in the table. Not a
     hypothetical — it is what both engines do today. */
  assert.strictEqual(bandFor(BANDS, 12), 99);
  assert.strictEqual(SCREEN_1_COLOR[bandFor(BANDS, 12)], 8.45);

  /* One piece prices identically to fifty. */
  assert.strictEqual(bandFor(BANDS, 1), bandFor(BANDS, 50));
});

test('above the first band the walk is correct and prices fall', () => {
  assert.strictEqual(bandFor(BANDS, 150), 249);
  assert.strictEqual(bandFor(BANDS, 600), 999);
  assert.ok(SCREEN_1_COLOR[bandFor(BANDS, 600)] < SCREEN_1_COLOR[bandFor(BANDS, 150)]);
});

test('below the minimum, screen print is replaced — not sold at the clamped price', () => {
  const got = effectiveMethod([SCREEN, DTF], 22, 12);
  assert.strictEqual(got.id, 1, '12 pieces must not be priced as screen print');
});

test('at exactly the minimum, screen print is kept', () => {
  assert.strictEqual(effectiveMethod([SCREEN, DTF], 22, 50).id, 22);
});

test('one under the minimum still falls back — the boundary is not off by one', () => {
  assert.strictEqual(effectiveMethod([SCREEN, DTF], 22, 49).id, 1);
});

test('the fallback is the product\'s own list, never a hardcoded DTF id', () => {
  /* A garment that cannot take DTF — a cap, say — must still land somewhere it
     actually allows, or the customer hits a dead end the plan ruled out. */
  const got = effectiveMethod([SCREEN, EMBROIDERY], 22, 12);
  assert.strictEqual(got.id, 7);
});

test('a method with no minimum is never second-guessed', () => {
  assert.strictEqual(effectiveMethod([DTF, SCREEN], 1, 1).id, 1);
});

test('no qualifying method returns null, so the caller cannot price it as free', () => {
  /* Returning the chosen method here would re-introduce the clamp; returning a
     zero price would decorate for nothing. Null forces an explicit decision. */
  assert.strictEqual(effectiveMethod([SCREEN], 22, 12), null);
});

test('a minimum above the first band ceiling is rejected as inexpressible', () => {
  assert.ok(minimumIsExpressible(BANDS, 50), '50 is under the 99 ceiling — fine');
  assert.ok(!minimumIsExpressible(BANDS, 150),
    'quantities between 99 and 150 would still clamp; the table must be re-banded');
});

test('minQty reads the number out of the method\'s own calculate blob', () => {
  assert.strictEqual(minQty(SCREEN), 50);
  assert.strictEqual(minQty(DTF), 0);
  assert.strictEqual(minQty({ id: 9 }), 0);
});

/* ── The minimum has to be IN the method row ─────────────────────────────── */

test('the combined method carries min_qty, so the storefront enforces it', () => {
  /* core/cart.php already knows how to do this: it reads `min_qty`, and when an
     order is short it reprices the line onto DTF and tells the customer. That
     code ran the whole time against a method with no min_qty — it read 0, and
     `if ($min <= 0) return` skipped every check. Screen printing was orderable
     at any quantity, below the floor the shop has with its own printer.

     It belongs in the GENERATOR because colorTable replaces the method's
     calculate blob on every reprice: a value written by hand would be silently
     dropped the next time prices moved. */
  const { colorTable } = require('../tools/lib/screenprint');
  const rows = [
    { colors: 1, tiers: [[99, 3.85], [249, 3.45]] },
    { colors: 2, tiers: [[99, 4.80], [249, 4.35]] },
  ];
  assert.strictEqual(colorTable(rows, 50).min_qty, '50');
  assert.strictEqual(colorTable(rows, 50).values.front['99']['1-color'], '3.85',
    'and the prices are untouched by it');
});

test('no minimum means no min_qty key at all', () => {
  /* An explicit 0 would be a value the storefront then compares against, and
     `min_qty: "0"` reads as a deliberate "no minimum" rather than an omission.
     Absent is the honest shape for a method that has none. */
  const { colorTable } = require('../tools/lib/screenprint');
  const rows = [{ colors: 1, tiers: [[99, 3.85]] }];
  assert.ok(!('min_qty' in colorTable(rows)));
  assert.ok(!('min_qty' in colorTable(rows, 0)));
  assert.ok(!('min_qty' in colorTable(rows, 'nonsense')));
});

test('the reprice tool passes the contracted floor', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const tool = fs.readFileSync(path.join(__dirname, '..', 'tools', 'reprice-anchorfish-2026.js'), 'utf8');
  assert.match(tool, /const SCREEN_MIN_QTY = 50;/);
  assert.match(tool, /colorTable\(all, SCREEN_MIN_QTY\)/,
    'the generator must be told the minimum, or it emits a method without one');
});
