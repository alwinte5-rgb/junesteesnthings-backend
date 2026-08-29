/* The pivot from seven per-colour screen-print methods to ONE `color`-type
 * table (tools/lib/screenprint.js), and the garment decoration rules
 * (tools/lib/garments.js) that decide which methods each product may offer.
 *
 * These are guarded rather than trusted because both failure modes are silent
 * and expensive:
 *
 *   - a missing `full-color` column makes both pricing engines charge $0 for
 *     the decoration on any design with more colours than the table has,
 *   - a per-colour table banded differently from the others puts one colour
 *     count's price under another's quantity, which looks like a working price,
 *   - a cap or an infant bodysuit offered a decoration the shop will not run
 *     is an order taken that has to be rung back and cancelled.
 */

const test = require('node:test');
const assert = require('node:assert');

const { colorTable, colorKey } = require('../tools/lib/screenprint');
const { classify, DECORATIONS, ROLES } = require('../tools/lib/garments');
const { encodePrintings, decodePrintings, enjson, dejson } = require('../tools/lib/db');

/* The live tables, as the seven methods actually hold them. Bands are
   CEILINGS, which is what both engines key on. */
const BANDS = [99, 249, 499, 999, 2499, 7000];
const LIVE = [
  [1, [8.45, 6.30, 4.15, 3.45, 2.50, 1.95]],
  [2, [10.90, 8.05, 5.30, 4.35, 3.15, 2.45]],
  [3, [13.50, 10.00, 6.70, 5.60, 4.15, 3.40]],
  [4, [16.05, 11.95, 8.05, 6.85, 5.15, 4.30]],
  [5, [18.65, 13.95, 9.45, 8.10, 6.20, 5.25]],
  [6, [21.20, 15.90, 10.85, 9.35, 7.20, 6.15]],
  [7, [23.75, 17.85, 12.25, 10.55, 8.20, 7.10]],
];
const rows = () => LIVE.map(([colors, p]) => ({ colors, tiers: BANDS.map((b, i) => [b, p[i]]) }));

test('every price survives the pivot unchanged', () => {
  const t = colorTable(rows());
  for (const [colors, prices] of LIVE) {
    BANDS.forEach((band, i) => {
      assert.strictEqual(t.values.front[String(band)][colorKey(colors)], prices[i].toFixed(2),
        colors + ' colours at band ' + band);
    });
  }
});

test('the table is the shape both pricing engines read', () => {
  const t = colorTable(rows());
  // app.js ~16287 and core/cart.php ~516 both branch on exactly this.
  assert.strictEqual(t.type, 'color');
  assert.strictEqual(t.multi, false);
  assert.deepStrictEqual(Object.keys(t.values), ['front']);
  // Band keys stay numeric strings: both engines parseInt them to walk bands.
  for (const k of Object.keys(t.values.front)) assert.match(k, /^\d+$/);
});

test('full-color exists in every band, or an over-range design decorates for $0', () => {
  const t = colorTable(rows());
  for (const band of BANDS) {
    const cell = t.values.front[String(band)];
    assert.ok(cell['full-color'], 'band ' + band + ' has no full-color backstop');
    // The backstop is the widest column, never cheaper than it.
    assert.strictEqual(cell['full-color'], cell['7-color']);
  }
});

test('an 8-colour design falls back to full-color, not to nothing', () => {
  const t = colorTable(rows());
  const rule = t.values.front['499'];
  // This is the engines' own fallback, inlined: option = N-color, else full-color.
  const option = rule['8-color'] === undefined ? 'full-color' : '8-color';
  assert.strictEqual(parseFloat(rule[option]), 12.25);
});

test('mismatched bands are refused rather than silently interleaved', () => {
  const bad = rows();
  bad[3].tiers = [[99, 16.05], [250, 11.95], [499, 8.05], [999, 6.85], [2499, 5.15], [7000, 4.30]];
  assert.throws(() => colorTable(bad), /do not match/);
});

test('a colour count that is cheaper than the one below it is refused', () => {
  const bad = rows();
  bad[4].tiers = bad[4].tiers.map(([q]) => [q, 1.00]);   // 5 colours under 4
  assert.throws(() => colorTable(bad), /cheaper than/);
});

test('a price that rises with quantity is refused', () => {
  const bad = rows();
  bad[0].tiers = [[99, 1.95], [249, 6.30], [499, 4.15], [999, 3.45], [2499, 2.50], [7000, 1.95]];
  assert.throws(() => colorTable(bad), /RISES/);
});

test('a missing or zero price is refused, never written as free', () => {
  for (const broken of [undefined, 0, NaN]) {
    const bad = rows();
    bad[2].tiers[1] = [249, broken];
    assert.throws(() => colorTable(bad), /no price/);
  }
});

/* ── Garment rules ──────────────────────────────────────────────────────── */

test('garments are classified the way the catalogue actually names them', () => {
  const cases = [
    ['Gildan 5000 Unisex Heavy Cotton Tee', 'tee'],
    ['Gildan 18500B Youth Heavy Blend Hoodie', 'hoodie'],   // hoodie beats youth
    ['Bella+Canvas 3001T — Toddler Jersey Tee', 'kids'],
    ['Rabbit Skins 4424 Infant Fine Jersey Bodysuit', 'onesie'],
    ['YP Classics 6606 Retro Trucker Cap', 'cap'],
    ['Liberty Bags 8502 Cotton Tote Bag', 'bag'],
    ['Core 365 88181 — Origin Performance Pique Polo', 'polo'],
    ['Harriton M500 — Easy Blend Long-Sleeve Twill Shirt', 'woven'], // twill beats long-sleeve
    ['Gildan 5400 Adult Long-Sleeve Tee', 'longslv'],
    ['Bella+Canvas 3484 — Unisex Triblend Tank', 'tank'],
  ];
  for (const [name, want] of cases) assert.strictEqual(classify(name), want, name);
});

test('nothing is offered a decoration the shop would have to refuse', () => {
  // A curved cap front takes no screen and has no back panel to hoop.
  assert.ok(!DECORATIONS.cap.includes('screen'), 'a cap cannot be screen printed');
  assert.ok(!DECORATIONS.cap.includes('dtf'), 'a cap is not DTF printed here');
  assert.ok(!DECORATIONS.cap.some((r) => /fullback|upperback|large/.test(r)),
    'a cap has no back or large-logo placement');
  // An infant bodysuit is smaller than the hoop, and stitching sits on skin.
  assert.ok(!DECORATIONS.onesie.some((r) => r.startsWith('emb:')), 'a bodysuit is not embroidered');
  assert.ok(!DECORATIONS.kids.some((r) => r.startsWith('emb:')), 'youth/toddler is not embroidered');
  // A placket, zip or quilted shell has no flat panel for a platen.
  for (const cls of ['polo', 'vest', 'jacket', 'woven']) {
    assert.ok(!DECORATIONS[cls].includes('screen'), cls + ' cannot be screen printed');
  }
  // Every class the classifier can return must have a rule, or the tool skips it.
  for (const cls of ['tee', 'longslv', 'tank', 'hoodie', 'qzip', 'bag', 'woven',
    'polo', 'vest', 'jacket', 'cap', 'kids', 'onesie']) {
    assert.ok(DECORATIONS[cls] && DECORATIONS[cls].length, cls + ' has no decoration rule');
  }
});

test('every role names a method title, and none is duplicated', () => {
  const titles = new Set();
  for (const [role, spec] of Object.entries(ROLES)) {
    assert.ok(spec.title, role + ' has no title');
    assert.ok(!titles.has(spec.title), 'two roles claim "' + spec.title + '"');
    titles.add(spec.title);
  }
  for (const roles of Object.values(DECORATIONS)) {
    for (const r of roles) assert.ok(ROLES[r], 'no such role: ' + r);
  }
});

/* ── Encoding ───────────────────────────────────────────────────────────── */

test('printings round-trip through the format jt_printing_ids reads', () => {
  const enc = encodePrintings([1, 7, 8, 9]);
  assert.strictEqual(enc, '%7B%22_1%22%3A%22A3%22%2C%22_7%22%3A%22A3%22%2C%22_8%22%3A%22A3%22%2C%22_9%22%3A%22A3%22%7D');
  assert.deepStrictEqual(decodePrintings(enc), [1, 7, 8, 9]);
  // The legacy CSV form and the empty forms products.php back-fills from.
  assert.deepStrictEqual(decodePrintings('7,8,9,15,10,16,13'), [7, 8, 9, 15, 10, 16, 13]);
  assert.deepStrictEqual(decodePrintings('%7B%7D'), []);
  assert.deepStrictEqual(decodePrintings(''), []);
  assert.deepStrictEqual(decodePrintings(null), []);
});

test('calculate round-trips through lumise base64(urlencode(json))', () => {
  const t = colorTable(rows());
  assert.deepStrictEqual(dejson(enjson(t)), t);
  assert.strictEqual(dejson('not base64 json'), null);
});
