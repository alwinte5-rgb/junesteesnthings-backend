/* SinaLite items sold in the designer (owner, 2026-10-22: roll labels): sent
 * to it as sign stock families, at the same price a staff quote gives. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SL = require('../tools/lib/sinalite');
const QS = require('../tools/lib/quote-signs');

const fams = SL.designerFamilies();

test('roll labels go to the designer with every size mapped to its inches', () => {
  const f = fams.roll_label;
  assert.ok(f, 'roll_label is published');
  assert.strictEqual(f.sizing, 'stock');
  assert.strictEqual(f.runs_only, true);
  assert.strictEqual(f.no_pool, true);
  assert.strictEqual(f.freight, 0, 'shipping is inside every SinaLite price');
  for (const s of f.sizes) {
    assert.match(s.key, /^\d+x\d+$/, 'the designer size option is WxH');
    assert.strictEqual(s.key, `${s.w}x${s.h}`);
    assert.ok(SL.DESIGNER.roll_label.sizes[s.sinalite], s.key);
  }
  assert.deepStrictEqual(f.sizes.filter((s) => s.shape === 'circle').map((s) => s.key), ['2x2', '3x3']);
});

test('only SinaLite runs from the smallest sold, each at the staff quote price', () => {
  const t = SL.table().families.roll_label;
  const f = fams.roll_label;
  for (const s of f.sizes) {
    for (const m of f.materials) {
      const lad = f.prices[m.key][s.key][''];
      assert.ok(lad.length, s.key);
      for (const [q, each] of lad) {
        assert.ok(q >= t.sell_from, `${s.key} ${q} is under ${t.sell_from}`);
        assert.ok(each > 0);
        const r = QS.priceSign('roll_label', { mat: m.key, size: s.sinalite }, q, false);
        assert.ok(r.ok, `${s.key} x ${q}: ${r.error}`);
        assert.strictEqual(r.piece, each, `${s.key} x ${q}`);
      }
    }
  }
});

test('a family with no table is left out, never sent unpriced', () => {
  try {
    SL._setData({ captured: null, products: {} });
    assert.deepStrictEqual(SL.designerFamilies(), {});
  } finally {
    SL._setData(JSON.parse(fs.readFileSync(SL.DATA_FILE, 'utf8')));
  }
  assert.ok(SL.designerFamilies().roll_label, 'the real table is back');
});

test('/api/pricing-rules publishes them inside signs.families', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /families: \{ \.\.\.t\.families, \.\.\.SINALITE\.designerFamilies\(\) \}/);
});

test('the designer product offers exactly the published sizes, from the smallest run', () => {
  const T = require('../tools/add-label-product');
  const f = fams.roll_label;
  const a = T.labelAttributes(f);
  assert.deepStrictEqual(a.SMAT.values.options.map((o) => o.value), f.materials.map((m) => 'roll_label:' + m.key));
  assert.deepStrictEqual(a.SSIZE.values.options.map((o) => o.value), f.sizes.map((s) => s.key));
  assert.strictEqual(a.SSIZE.values.options.filter((o) => o.default).length, 1);
  assert.strictEqual(a.QTY.type, 'quantity', 'core/cart.php counts a sign line only with a quantity-type QTY');
  assert.strictEqual(Number(a.QTY.values.min_qty), SL.table().families.roll_label.sell_from);
  assert.deepStrictEqual(Object.keys(T.labelStages()), ['front']);
});

test('the product description names exactly the runs sold', () => {
  const T = require('../tools/add-label-product');
  const f = fams.roll_label;
  const runs = [...new Set(f.sizes.flatMap((s) => f.prices[f.materials[0].key][s.key][''].map(([q]) => q)))];
  const d = T.labelDescription(f);
  for (const q of runs) assert.ok(d.includes(q.toLocaleString('en-US')), `${q} in "${d}"`);
  assert.doesNotMatch(d, /\b250\b/, 'never a run under sell_from');
});

test('every material sent has a price, and every size key is unique', () => {
  const f = fams.roll_label;
  for (const m of f.materials) assert.ok(Object.keys(f.prices[m.key] || {}).length, m.key);
  assert.deepStrictEqual(Object.keys(f.prices).sort(), f.materials.map((m) => m.key).sort());
  assert.strictEqual(new Set(f.sizes.map((s) => s.key)).size, f.sizes.length);
});

test('built once per SinaLite table, rebuilt when it changes', () => {
  assert.strictEqual(SL.designerFamilies(), SL.designerFamilies());
  const before = SL.designerFamilies();
  SL._setData(JSON.parse(fs.readFileSync(SL.DATA_FILE, 'utf8')));
  assert.notStrictEqual(SL.designerFamilies(), before);
});
