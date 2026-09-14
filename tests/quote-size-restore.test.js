'use strict';

/* Reopening a quote must not empty the size boxes.
 *
 * `size_mix` was saved with every line and never put back: lineHtml used it
 * only to decide whether the extras section had anything in it, so the grid
 * rebuilt empty on every edit.
 *
 * The quantity box still held its number, so the line total looked broadly
 * right and the failure hid. What actually vanished were the extended-size
 * UPCHARGES, which are computed from these counts — correcting a phone number
 * on a quote with 2XLs in it quietly made the quote cheaper, and again on the
 * next save. Same shape as the add-ons that had to be restored for the same
 * reason, and the reason both are one-shot.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* Lift the restore block and run it against a fake grid. Anchored on the
   dataset key, which is the shortest unique text — not on the expression, so
   the test reports a REGRESSION rather than "not found" if the code is
   reworded. */
const m = src.match(/var savedSizes = L\.dataset\.savedSizes;[\s\S]*?\n        \}/);
assert.ok(m, 'the size-restore block is gone from server.js');
const restore = new Function('L', 'box', m[0]);

function fakeGrid(sizes) {
  const els = sizes.map((sz) => ({ dataset: { size: sz }, value: '' }));
  return {
    els,
    box: { querySelectorAll: () => ({ forEach: (f) => els.forEach(f) }) },
  };
}

test('a saved mix comes back in the right boxes', () => {
  const g = fakeGrid(['S', 'M', 'L', '2XL']);
  const L = { dataset: { savedSizes: JSON.stringify({ M: 6, '2XL': 3 }) } };
  restore(L, g.box);
  assert.deepStrictEqual(g.els.map((e) => e.value), ['', 6, '', 3]);
});

test('the 2XL count survives — it is what carries the upcharge', () => {
  const g = fakeGrid(['L', '2XL', '3XL']);
  restore({ dataset: { savedSizes: JSON.stringify({ '2XL': 4, '3XL': 2 }) } }, g.box);
  assert.strictEqual(g.els[1].value, 4);
  assert.strictEqual(g.els[2].value, 2);
});

test('it is a ONE-SHOT, so changing product does not resurrect counts', () => {
  const L = { dataset: { savedSizes: JSON.stringify({ M: 5 }) } };
  const first = fakeGrid(['S', 'M']);
  restore(L, first.box);
  assert.strictEqual(first.els[1].value, 5);
  assert.strictEqual(L.dataset.savedSizes, undefined, 'the attribute is consumed');

  const second = fakeGrid(['S', 'M']);
  restore(L, second.box);
  assert.deepStrictEqual(second.els.map((e) => e.value), ['', ''],
    'the next product gets empty boxes, not the previous one\'s counts');
});

test('a size the new product does not have is simply absent', () => {
  const g = fakeGrid(['S', 'M']);
  restore({ dataset: { savedSizes: JSON.stringify({ '5XL': 9, M: 1 }) } }, g.box);
  assert.deepStrictEqual(g.els.map((e) => e.value), ['', 1]);
});

test('a zero is not written back as a visible zero', () => {
  const g = fakeGrid(['S', 'M']);
  restore({ dataset: { savedSizes: JSON.stringify({ S: 0, M: 2 }) } }, g.box);
  assert.strictEqual(g.els[0].value, '', 'zero stays the placeholder, not a typed 0');
  assert.strictEqual(g.els[1].value, 2);
});

test('corrupt saved data does not throw', () => {
  const g = fakeGrid(['S']);
  assert.doesNotThrow(() => restore({ dataset: { savedSizes: '{not json' } }, g.box));
  assert.strictEqual(g.els[0].value, '');
});
