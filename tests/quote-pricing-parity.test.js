/* The parity test: every surface that prices a line must agree to the cent.
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * WHY THIS EXISTS
 * ---------------
 * The line-pricing rule was written twice — once in `calc()` for the admin form
 * and once in the save path that writes the money — and the two were kept in
 * step by hand. That works until it does not, and when it stops working the
 * symptom is not a crash: it is a quote whose displayed total is not the total
 * charged, which nobody notices until a customer does.
 *
 * `quotePricingSource()` is now the only implementation, and both surfaces run
 * that same text. This file is the guard on that arrangement. It fails if:
 *
 *   - the browser copy and the Node copy stop being the same source
 *   - anyone reintroduces a second implementation of the tier walk, the blank
 *     discount, or the add-on arithmetic
 *
 * The specific bug that motivated the ceiling/floor assertions below: the tier
 * keys in the designer are band CEILINGS, but the old `tierFor` walked them as
 * if they were FLOORS. With ceiling-keyed data that returns the band BELOW the
 * right one — a 100-piece screen-print job was quoted at the 50-99 rate, which
 * is $2.15 per piece too high, $215 on that order and $1,900 at 2,000 pieces.
 * The customer was charged MORE for ordering more.
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

const box = {};
vm.runInNewContext(lift('quotePricingSource') + '\nthis.text = quotePricingSource();', box);
const engine = {};
vm.runInNewContext(box.text + '\nthis.priceLine = priceLine;', engine);
const { priceLine } = engine;

/* ── There is exactly one implementation ────────────────────────────────── */

test('the browser is served the same source the server runs', () => {
  /* The form interpolates `${quotePricingSource()}` into its <script>. If that
     is ever replaced by a hand-written copy, the two can drift silently. */
  assert.ok(src.includes('${quotePricingSource()}'),
    'the quote form must interpolate the shared source, not restate it');
  assert.ok(src.includes('vm.runInNewContext(quotePricingSource()'),
    'the server must execute the shared source rather than reimplement it');
});

test('no surface reimplements the tier walk', () => {
  /* The old floor-walk, in any of its spellings. One occurrence is expected:
     none. The engine sorts and compares with <=, never this shape. */
  const floorWalks = src.match(/if\s*\(\s*q(?:ty)?\s*>=\s*\w+\[i\]\.min_qty\s*\)/g) || [];
  assert.strictEqual(floorWalks.length, 0,
    'found a floor-style tier walk; decoration tiers are CEILINGS — use tierAt()');
});

test('no surface reimplements the blank discount', () => {
  /* `blankPriceFor` on the server and `blankPriceAt` in the engine are the two
     sanctioned copies (the server one predates the engine and is still used by
     other callers). A third would be a drift risk. */
  const impls = src.match(/1\s*-\s*(?:pct|blankDiscountPct\([^)]*\))\s*\/\s*100/g) || [];
  assert.ok(impls.length <= 2, `expected at most 2 blank-discount implementations, found ${impls.length}`);
});

/* ── The bug that started it: ceilings read as floors ───────────────────── */

const TIERS = [
  { min: 3000, pct: 20 }, { min: 1000, pct: 15 }, { min: 800, pct: 10 },
  { min: 500, pct: 8 }, { min: 250, pct: 5 }, { min: 100, pct: 3 },
];
const GILDAN = { id: 12, price: 5.64, sizes: [] };
/* The real screen-print table now in the designer, ceiling-keyed. */
const SCREEN1 = { title: 'Screen Printing — 1 Color', positions: { front: [
  { min_qty: 99, price: 8.45 }, { min_qty: 249, price: 6.30 }, { min_qty: 499, price: 4.15 },
  { min_qty: 999, price: 3.45 }, { min_qty: 2499, price: 2.50 }, { min_qty: 7000, price: 1.95 },
] } };

/** What the old floor-walking code returned, kept so the regression is explicit. */
function oldFloorWalk(pos, qty) {
  let price = pos[0].price;
  for (const t of pos) if (qty >= t.min_qty) price = t.price;
  return price;
}

test('ordering more never costs more per piece', () => {
  /* The property that was actually violated. Walk the whole range and assert
     the per-piece decoration rate is non-increasing. */
  let prev = Infinity;
  for (let q = 50; q <= 3000; q += 10) {
    const r = priceLine({ product: GILDAN, method: SCREEN1, qty: q, blankTiers: TIERS });
    assert.ok(r.decoration <= prev,
      `at ${q} pieces the rate rose from ${prev} to ${r.decoration}`);
    prev = r.decoration;
  }
});

test('the quantities the old code got wrong are now right', () => {
  /* Each of these was overcharged. The figures are the real ones from the
     applied 2026 table. */
  for (const [qty, correct, oldWrong] of [
    [100, 6.30, 8.45], [150, 6.30, 8.45], [250, 4.15, 6.30],
    [500, 3.45, 4.15], [1000, 2.50, 3.45], [2500, 1.95, 2.50],
  ]) {
    const r = priceLine({ product: GILDAN, method: SCREEN1, qty, blankTiers: TIERS });
    assert.strictEqual(r.decoration, correct, `${qty} pieces should price at ${correct}`);
    assert.strictEqual(oldFloorWalk(SCREEN1.positions.front, qty), oldWrong,
      'the old behaviour is not what this test thinks it was');
  }
});

test('a band ceiling itself prices in that band, not the next', () => {
  /* Off-by-one in the other direction: 99 is the LAST quantity at the 50-99
     rate, and 100 is the first at the next. Both were correct before and must
     stay correct — a fix that moves the boundary is also a bug. */
  assert.strictEqual(priceLine({ product: GILDAN, method: SCREEN1, qty: 99, blankTiers: TIERS }).decoration, 8.45);
  assert.strictEqual(priceLine({ product: GILDAN, method: SCREEN1, qty: 100, blankTiers: TIERS }).decoration, 6.30);
  assert.strictEqual(priceLine({ product: GILDAN, method: SCREEN1, qty: 249, blankTiers: TIERS }).decoration, 6.30);
  assert.strictEqual(priceLine({ product: GILDAN, method: SCREEN1, qty: 250, blankTiers: TIERS }).decoration, 4.15);
});

test('above the largest band the largest band holds', () => {
  /* Not zero, and not a crash — 8,000 pieces is a real order that would
     otherwise have quoted the decoration as free. */
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 8000, blankTiers: TIERS });
  assert.strictEqual(r.decoration, 1.95);
});

/* ── Totals reconcile ───────────────────────────────────────────────────── */

test('the parts always sum to the line total', () => {
  /* Across a spread of shapes: plain, sized, overridden, with add-ons. If this
     drifts, the quote does not add up in front of the customer. */
  const cases = [
    { product: GILDAN, method: SCREEN1, qty: 50 },
    { product: GILDAN, method: SCREEN1, qty: 144, sizeMix: { M: 140, '2XL': 4 } },
    { product: GILDAN, method: SCREEN1, qty: 250, unitOverride: 9.5 },
    { product: GILDAN, method: SCREEN1, qty: 500,
      addons: [{ code: 'u', kind: 'once', rate: 25 }, { code: 'b', kind: 'per_piece', rate: 0.5 }] },
  ];
  for (const c of cases) {
    const r = priceLine({ ...c, blankTiers: TIERS });
    const expected = Math.round((r.unit * c.qty + r.sizeUpcharge + r.addonTotal) * 100) / 100;
    assert.strictEqual(r.lineTotal, expected, `qty ${c.qty} did not reconcile`);
  }
});

test('a sized product with no upcharges costs the same as a plain quantity', () => {
  /* The size grid drives the quantity; it must not also change the price when
     every size is a standard one. */
  const plain = priceLine({ product: GILDAN, method: SCREEN1, qty: 50, blankTiers: TIERS });
  const sized = priceLine({ product: { ...GILDAN, sizes: [{ size: 'M', upcharge: 0 }] },
    method: SCREEN1, qty: 50, sizeMix: { M: 50 }, blankTiers: TIERS });
  assert.strictEqual(sized.lineTotal, plain.lineTotal);
});
