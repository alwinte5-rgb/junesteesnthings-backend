/* Sizes S&S sells that a product does not offer (owner, 2026-10-20).
 *
 * Run: node --test tests/add-missing-sizes.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { missingSizes, withSizes } = require('../tools/add-missing-sizes');
const { costBySize, readSizes } = require('../tools/lib/ssa-costs');

const row = (size, order, price) => ({ sizeName: size, sizeOrder: order, customerPrice: price, piecePrice: price, colorName: 'Black' });
const sizes = (titles) => ({ QTYS: { id: 'QTYS', type: 'quantity', values: JSON.stringify({ type: 'multiple', multiple_options: titles.map((t) => ({ title: t, value: t, price: '' })) }) } });

test('a priced S&S size the product lacks is reported; an unpriced one is not', () => {
  const rows = [row('S', 1, 3), row('M', 2, 3), row('L', 3, 3), row('XL', 4, 3), row('2XL', 5, 5), row('5XL', 8, 0)];
  const r = missingSizes(sizes(['S', 'M', 'L', 'XL']), rows);
  assert.deepStrictEqual(r.missing, ['2XL']);
  assert.deepStrictEqual(missingSizes(sizes(['S', 'M', 'L', 'XL', '2XL']), rows).missing, []);
});

test('missing sizes go in S&S order with the markup upcharge; nothing is removed', () => {
  const rows = [row('S', 1, 3), row('M', 2, 3), row('L', 3, 3), row('XL', 4, 3), row('2XL', 5, 5), row('3XL', 6, 6)];
  const { missing, order } = missingSizes(sizes(['S', 'M', 'L', 'XL']), rows);
  const out = readSizes(withSizes(sizes(['S', 'M', 'L', 'XL']), missing, order, costBySize(rows)));
  assert.deepStrictEqual(out.values.multiple_options.map((o) => o.value), ['S', 'M', 'L', 'XL', '2XL', '3XL']);
  const up = Object.fromEntries(out.values.multiple_options.map((o) => [o.value, Number(o.price || 0)]));
  assert.ok(up['2XL'] > 0 && up['3XL'] > up['2XL'], 'extended sizes carry their cost difference');
  assert.strictEqual(up.M, 0);
});

test('a product with no size list (the Richardson 112 cap) gets one', () => {
  const rows = [row('M/L', 1, 4), row('XL', 2, 4)];
  const { missing, order } = missingSizes({}, rows);
  assert.deepStrictEqual(missing, ['M/L', 'XL']);
  const out = withSizes({}, missing, order, costBySize(rows));
  assert.strictEqual(out.QTYS.id, 'QTYS', 'id set, or the cart reads name="undefined"');
  assert.deepStrictEqual(readSizes(out).values.multiple_options.map((o) => o.value), ['M/L', 'XL']);
  assert.strictEqual(readSizes(out).values.type, 'multiple');
});
