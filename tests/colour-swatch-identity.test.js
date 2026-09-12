'use strict';

/* Two colourways must never share a swatch value.
 *
 * A product_color option's `value` does two jobs: it paints the swatch, and it
 * is the identity Lumise writes onto the cart line (item.options.COL). S&S
 * returns one BODY colour per colourway, so a trucker offered in "Black/ Black"
 * and "Black/ White" came back #000000 twice — two swatches a customer cannot
 * tell apart, and an order the shop cannot read. Whichever the customer picked,
 * the record was identical and the wrong blank gets ordered.
 *
 * 20 live products carried this. The name is not the fix: colour_name() is only
 * consulted for the stock check, never for the cart line.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

/* The rule, exercised through the repair tool's own implementation. */
function dedupeOf() {
  const src = fs.readFileSync(path.join(root, 'tools', 'unique-colour-swatches.js'), 'utf8');
  const body = src.slice(src.indexOf('function dedupe'), src.indexOf('let buf ='));
  // eslint-disable-next-line no-new-func
  return new Function(body + '; return dedupe;')();
}

test('a clashing colourway is moved, and only the clashing one', () => {
  const dedupe = dedupeOf();
  const { out, moved } = dedupe([
    { title: 'Loden/ Black', value: '#777056' },
    { title: 'Loden/ Khaki', value: '#777056' },
    { title: 'Navy', value: '#333e59' },
  ]);
  assert.strictEqual(moved, 1, 'exactly one of the pair should move');
  assert.strictEqual(out[0].value, '#777056', 'the first keeps the real body colour');
  assert.notStrictEqual(out[1].value, out[0].value, 'the second must be distinguishable');
  assert.strictEqual(out[2].value, '#333e59', 'an unaffected colour is left alone');
});

test('the nudge is imperceptible', () => {
  const dedupe = dedupeOf();
  const { out } = dedupe([
    { title: 'Black', value: '#1b151a' },
    { title: 'Black/ White', value: '#1b151a' },
  ]);
  const a = parseInt(out[0].value.slice(1), 16);
  const b = parseInt(out[1].value.slice(1), 16);
  /* One step in 16.7 million. A customer sees the same swatch; the order does
     not. If this ever grows, the picker starts lying about the colour. */
  assert.ok(Math.abs(a - b) <= 4, 'the swatch must still look like the real colour');
});

test('three of a kind all separate', () => {
  const dedupe = dedupeOf();
  const { out, moved } = dedupe([
    { title: 'Oyster', value: '#f5ecd2' },
    { title: 'Oyster/ Black', value: '#f5ecd2' },
    { title: 'Oyster/ Jungle', value: '#f5ecd2' },
  ]);
  assert.strictEqual(moved, 2);
  assert.strictEqual(new Set(out.map((o) => o.value)).size, 3);
});

test('a non-hex value is left untouched', () => {
  const dedupe = dedupeOf();
  const { out, moved } = dedupe([
    { title: 'A', value: '' },
    { title: 'B', value: '' },
  ]);
  assert.strictEqual(moved, 0, 'nothing to nudge if it is not a colour');
  assert.strictEqual(out[0].value, '');
});

test('the add tool cannot reintroduce a clash', () => {
  const src = fs.readFileSync(path.join(root, 'tools', 'ssa-add-products.js'), 'utf8');
  const attrs = src.slice(src.indexOf('function buildAttributes'), src.indexOf('function buildPrintings'));
  assert.match(attrs, /const used = new Set\(\)/, 'no uniqueness guard when building colours');
  assert.match(attrs, /value: uniq\(value\)/, 'the swatch value is written without deduping');
});
