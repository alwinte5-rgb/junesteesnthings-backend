/* Regression tests for the shared line-pricing engine (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * WHY THIS EXISTS
 * ---------------
 * The line-pricing rule used to be written twice: once in `calc()` for the
 * admin form and once in the save path that actually writes the money. Two
 * copies of a pricing rule is two chances to drift, and drift here does not
 * look like a crash — it looks like a quote whose displayed total is not the
 * total charged. Adding a customer preview and a public estimator would have
 * made four copies.
 *
 * `quotePricingSource()` returns the rule as source text, executed by both the
 * browser and the server, so all four surfaces run the same characters. These
 * tests lift that same source and run it a third time, which is what stops the
 * tests describing code that no longer exists.
 *
 * The arithmetic pinned below is not arbitrary — each case is a bug that has
 * already happened once in this file's history.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/** Lift a top-level `function name(...) {...}` out of server.js by brace depth. */
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

/* Run the real shared source, exactly as server.js and the browser both do. */
const box = {};
vm.runInNewContext(lift('quotePricingSource') + '\nthis.text = quotePricingSource();', box);
const engine = {};
vm.runInNewContext(box.text +
  '\nthis.priceLine = priceLine; this.addonAmount = addonAmount;' +
  '\nthis.blankPriceAt = blankPriceAt; this.tierAt = tierAt;', engine);
const { priceLine, addonAmount, blankPriceAt, tierAt } = engine;

/* Fixtures shaped like the real catalogue from jt-catalog.php. */
const TIERS = [
  { min: 3000, pct: 20 }, { min: 1000, pct: 15 }, { min: 800, pct: 10 },
  { min: 500, pct: 8 }, { min: 250, pct: 5 }, { min: 100, pct: 3 },
];
const GILDAN = { id: 12, price: 5.64, sizes: [
  { size: 'M', upcharge: 0 }, { size: 'XL', upcharge: 0 }, { size: '2XL', upcharge: 2 },
] };
const SCREEN1 = { title: 'Screen Printing — 1 Color', positions: { front: [
  { min_qty: 99, price: 8.45 }, { min_qty: 249, price: 6.30 }, { min_qty: 499, price: 4.15 },
] } };
/* Two stages, as method #1 has: the main print and an additional location. */
const DTF = { title: 'DTF Printing', positions: {
  id:       [{ min_qty: 99, price: 13.00 }, { min_qty: 249, price: 11.05 }],
  mr8a5dlx: [{ min_qty: 99, price: 5.40 },  { min_qty: 249, price: 4.90 }],
} };

/* ── The basic rule ─────────────────────────────────────────────────────── */

test('a line is blank + decoration, times quantity', () => {
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 50, blankTiers: TIERS });
  assert.strictEqual(r.blank, 5.64);
  assert.strictEqual(r.decoration, 8.45);
  assert.strictEqual(r.unit, 14.09);
  assert.strictEqual(r.lineTotal, 704.50);
});

test('the blank volume tier applies, the decoration tier applies, and they are independent', () => {
  /* 144 pieces: blank gets 3% off (>=100), decoration drops to the 249 band. */
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 144, blankTiers: TIERS });
  assert.strictEqual(r.blank, 5.47);       // 5.64 less 3%
  assert.strictEqual(r.decoration, 6.30);
  assert.strictEqual(r.lineTotal, 1694.88); // 144 x 11.77
});

test('an empty line prices at zero rather than NaN', () => {
  /* NaN renders as $0.00 and looks like a free job rather than a broken one. */
  const r = priceLine({ qty: 0, blankTiers: TIERS });
  assert.strictEqual(r.lineTotal, 0);
  assert.ok(Number.isFinite(r.lineTotal));
});

/* ── Size upcharges ─────────────────────────────────────────────────────── */

test('an extended-size upcharge applies only to those pieces', () => {
  /* 24 shirts of which 4 are 2XL is NOT the same price as 24 mediums, and
     forgetting that silently eats the difference on every order. */
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 24,
    sizeMix: { M: 20, '2XL': 4 }, blankTiers: TIERS });
  assert.strictEqual(r.sizeUpcharge, 8);   // 4 x $2, not 24 x $2
  assert.strictEqual(r.lineTotal, round2(24 * 14.09 + 8));
});

/* ── The manual override ────────────────────────────────────────────────── */

test('a typed unit price replaces the computed one', () => {
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 50,
    unitOverride: 12, blankTiers: TIERS });
  assert.strictEqual(r.manual, true);
  assert.strictEqual(r.unit, 12);
  assert.strictEqual(r.lineTotal, 600);
  assert.strictEqual(r.listTotal, 704.50, 'list price must survive for the strike-through');
});

test('an override does NOT suppress size upcharges, or the add-ons', () => {
  /* These used to be zeroed under an override, on the theory that a typed
     price already accounted for them. In practice the price is typed first and
     the size mix entered after, so the upcharge disappeared the moment the
     2XLs were added — while the form went on printing "+$2" over the 2XL box
     and the customer quote printed it again. On a real 100-piece quote that
     was $176.20 the shop ate.

     A typed price is a judgement about one shirt. It cannot be a judgement
     about a size mix that did not exist when it was typed. */
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 50, unitOverride: 12,
    sizeMix: { M: 46, '2XL': 4 }, blankTiers: TIERS,
    addons: [{ code: 'unbagging', label: 'Unbagging', kind: 'per_piece', rate: 0.50 }] });
  assert.strictEqual(r.sizeUpcharge, 8, '4 x $2, charged on top of the typed price');
  assert.strictEqual(r.addonTotal, 25);
  assert.strictEqual(r.lineTotal, 633, '50 x $12 + $8 upcharge + $25 unbagging');
});

test('the size upcharge is the same figure with or without an override', () => {
  /* The two used to be different numbers on the same mix, which is what let
     one of them be forgotten. */
  const mix = { M: 46, '2XL': 4 };
  const plain = priceLine({ product: GILDAN, method: SCREEN1, qty: 50,
    sizeMix: mix, blankTiers: TIERS });
  const typed = priceLine({ product: GILDAN, method: SCREEN1, qty: 50,
    unitOverride: 12, sizeMix: mix, blankTiers: TIERS });
  assert.strictEqual(typed.sizeUpcharge, plain.sizeUpcharge);
});

test('the quote form never shows a surcharge it does not bill', () => {
  /* The bug was not the arithmetic, it was the disagreement: the size grid
     advertises the upcharge from product.sizes, and the engine decided
     separately whether to charge it. Now the line total always contains
     exactly what the grid advertised. */
  const mix = { M: 20, '2XL': 20, '3XL': 19 };
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 59,
    unitOverride: 10.98, sizeMix: mix, blankTiers: TIERS });
  const advertised = Object.entries(mix).reduce((n, [sz, count]) => {
    const row = GILDAN.sizes.find((x) => x.size === sz);
    return n + count * Number((row || {}).upcharge || 0);
  }, 0);
  assert.strictEqual(r.sizeUpcharge, advertised,
    'what the grid promises is what the line bills');
  assert.strictEqual(r.lineTotal, round2(59 * 10.98 + advertised));
});

test('an unparseable override is ignored rather than becoming NaN', () => {
  for (const bad of ['', null, undefined, 'free']) {
    const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 50,
      unitOverride: bad, blankTiers: TIERS });
    assert.strictEqual(r.manual, false, `${String(bad)} must not count as an override`);
    assert.strictEqual(r.lineTotal, 704.50);
  }
});

/* ── Add-on kinds: the digitizing bug, generalised ──────────────────────── */

test('a "once" add-on is charged once, whatever the quantity', () => {
  /* THE bug this table exists to prevent: digitizing was a decoration method,
     decoration methods are per-piece, so $30 billed $1,500 on 50 pieces. */
  const small = priceLine({ product: GILDAN, method: SCREEN1, qty: 12, blankTiers: TIERS,
    addons: [{ code: 'd', label: 'Digitizing', kind: 'once', rate: 30 }] });
  const big = priceLine({ product: GILDAN, method: SCREEN1, qty: 500, blankTiers: TIERS,
    addons: [{ code: 'd', label: 'Digitizing', kind: 'once', rate: 30 }] });
  assert.strictEqual(small.addonTotal, 30);
  assert.strictEqual(big.addonTotal, 30);
});

test('each add-on kind scales the way it says it does', () => {
  const at = (kind, rate, qty, colours, screens) =>
    addonAmount({ kind, rate }, qty, colours, 1000, screens);
  assert.strictEqual(at('once', 25, 50, 1), 25);
  assert.strictEqual(at('per_order', 15, 50, 1), 15);
  assert.strictEqual(at('per_piece', 0.5, 50, 1), 25);
  assert.strictEqual(at('per_piece_per_colour', 0.5, 50, 4), 100);
  assert.strictEqual(at('percent_of_decoration', 50, 50, 1), 500);
  /* Screens are per screen and per ORDER — six screens is six screens whether
     the run is 50 shirts or 5,000. See tests/screen-fees.test.js. */
  assert.strictEqual(at('per_screen', 35, 50, 3, 6), 210);
  assert.strictEqual(at('per_screen', 35, 5000, 3, 6), 210);
});

test('an unknown add-on kind charges nothing rather than guessing', () => {
  assert.strictEqual(addonAmount({ kind: 'nonsense', rate: 99 }, 50, 1, 1000), 0);
});

test('a percentage add-on is a percentage of decoration, never of the blank', () => {
  /* Jumbo hoop is extra STITCHING time. Charging 50% of the garment too would
     make the same surcharge cost four times more on a hoodie than a tee. */
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 50, blankTiers: TIERS,
    addons: [{ code: 'j', label: 'Jumbo', kind: 'percent_of_decoration', rate: 50 }] });
  assert.strictEqual(r.addonTotal, round2(8.45 * 50 * 0.5));
});

/* ── The second print location ──────────────────────────────────────────── */

test('a second location prices from its own stage, not the first', () => {
  /* Both stages exist in the catalogue; before this engine only the first was
     ever read, so a two-location job could not be quoted at all. */
  const main = priceLine({ product: GILDAN, method: DTF, qty: 50, blankTiers: TIERS });
  const second = priceLine({ product: GILDAN, method: DTF, qty: 50,
    stage: 'mr8a5dlx', blankTiers: TIERS });
  assert.strictEqual(main.decoration, 13.00);
  assert.strictEqual(second.decoration, 5.40);
});

test('an unknown stage falls back to the first rather than pricing at zero', () => {
  const r = priceLine({ product: GILDAN, method: DTF, qty: 50,
    stage: 'nope', blankTiers: TIERS });
  assert.strictEqual(r.decoration, 13.00);
});

/* ── The two opposite tier conventions ──────────────────────────────────── */

test('decoration tiers are CEILINGS and blank tiers are FLOORS', () => {
  /* Reading one as the other puts every band one step out. This is the bug
     that started the whole pricing rebuild. */
  assert.strictEqual(tierAt(SCREEN1.positions, 50), 8.45,  '50 sits in the 99 band');
  assert.strictEqual(tierAt(SCREEN1.positions, 99), 8.45,  '99 is the top of its band');
  assert.strictEqual(tierAt(SCREEN1.positions, 100), 6.30, '100 crosses into the next');

  assert.strictEqual(blankPriceAt(5.64, 99, TIERS), 5.64,  'no break below 100');
  assert.strictEqual(blankPriceAt(5.64, 100, TIERS), 5.47, 'the 100 floor applies AT 100');
});

test('the largest applicable blank discount wins, not the smallest', () => {
  assert.strictEqual(blankPriceAt(5.64, 5000, TIERS), round2(5.64 * 0.8));
});

/* ── Money hygiene ──────────────────────────────────────────────────────── */

function round2(n) { return Math.round(n * 100) / 100; }

test('every figure is a whole number of cents', () => {
  /* A fraction of a cent reaches Stripe as an invalid amount. */
  const r = priceLine({ product: { price: 9.24, sizes: [] }, method: SCREEN1, qty: 137,
    blankTiers: TIERS, addons: [{ code: 'j', kind: 'percent_of_decoration', rate: 50 }] });
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== 'number') continue;
    assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, `${k} = ${v} is not whole cents`);
  }
});

test('quantity times each, plus the extras, equals the line total', () => {
  /* If this ever fails the quote does not add up in front of the customer. */
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 24,
    sizeMix: { M: 20, '2XL': 4 }, blankTiers: TIERS,
    addons: [{ code: 'u', kind: 'once', rate: 25 }, { code: 'b', kind: 'per_piece', rate: 0.5 }] });
  assert.strictEqual(r.lineTotal, round2(r.unit * 24 + r.sizeUpcharge + r.addonTotal));
});

/* ── The typed garment price ────────────────────────────────────────────── */

test('a typed garment price replaces the catalogue one', () => {
  /* Supplier costs move between the day a cost is recorded and the day a quote
     is written. Without this the shop quotes from a figure it knows is stale. */
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 50,
    blankOverride: 7.20, blankTiers: TIERS });
  assert.strictEqual(r.blank, 7.20);
  assert.strictEqual(r.lineTotal, round2((7.20 + 8.45) * 50));
});

test('volume tiers still apply to a typed garment price', () => {
  /* A typed price is a cost correction, not a decision to abandon the pricing
     rule — so the quantity break still comes off it. Derived from the fixture
     rather than hard-coded, so tuning the live curve does not fail this test
     for a reason that has nothing to do with what it is checking. */
  const pct = TIERS.find((t) => 1000 >= t.min).pct;
  const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 1000,
    blankOverride: 7.20, blankTiers: TIERS });
  assert.strictEqual(r.blank, round2(7.20 * (1 - pct / 100)));
  assert.ok(r.blank < 7.20, 'the tier must actually come off');
});

test('a blank, zero or negative garment price falls back to the catalogue', () => {
  /* A stray minus must not invert a line, and an empty box means "use the
     catalogue", not "the garment is free". */
  for (const bad of ['', null, undefined, 0, -5, 'free']) {
    const r = priceLine({ product: GILDAN, method: SCREEN1, qty: 50,
      blankOverride: bad, blankTiers: TIERS });
    assert.strictEqual(r.blank, 5.64, `${String(bad)} should fall back to the catalogue`);
  }
});

test('a typed garment price works on a line with no catalogue product', () => {
  /* A hand-entered garment the catalogue does not carry. */
  const r = priceLine({ method: SCREEN1, qty: 50, blankOverride: 9.00, blankTiers: TIERS });
  assert.strictEqual(r.blank, 9.00);
  assert.strictEqual(r.lineTotal, round2((9.00 + 8.45) * 50));
});
