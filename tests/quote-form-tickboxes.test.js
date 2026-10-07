/* Tick boxes on the quote form (2026-09-30).
 *
 * Run: node --test tests/*.test.js
 *
 * A ticked box posts its value and an unticked one posts nothing. The form
 * blanked values in two places (adding an item, and clearing the only item),
 * so a box ticked afterwards posted "" and the save read it as unticked:
 * Optional and Dark garment were dropped without a word, on the clicked item
 * and on every item copied from it. run-admin-post.cjs on the e2e harness ticks
 * them in a real browser; these pin the rules.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced');
}
const tickedBox = vm.runInNewContext(`${lift('tickedBox')}\ntickedBox`);

test('a posted tick box is ticked, whatever value the page gave it', () => {
  assert.strictEqual(tickedBox('1'), true);
  assert.strictEqual(tickedBox(''), true, 'a blanked value still means ticked');
  assert.strictEqual(tickedBox('on'), true);
  assert.strictEqual(tickedBox(undefined), false, 'not posted is not ticked');
  assert.strictEqual(tickedBox(null), false);
  assert.strictEqual(tickedBox('0'), false);
  assert.strictEqual(tickedBox('false'), false);
});

test('Optional is read by presence', () => {
  assert.match(src, /const isOptional = \(i\) => tickedBox\(one\(b\['optional' \+ i\]\)\);/);
});

test('the Dark garment box is gone, and every saved line carries the base', () => {
  /* 2026-10-07: the white base goes on every garment, so there is nothing to
     tick. A box left behind would look like it changed the price. */
  assert.doesNotMatch(src, /name="dark\$\{n\}"/, 'the Dark garment box is back on the quote form');
  assert.doesNotMatch(src, /b\['dark' \+ i\]/, 'the save route reads a dark box again');
  assert.match(src, /garment_dark: true,/);
});

test('clearing the only item unticks its boxes rather than blanking them', () => {
  const fn = src.slice(src.indexOf('function removeLine(btn){'), src.indexOf('function reindex(){'));
  assert.match(fn, /if \(el\.type === 'checkbox' \|\| el\.type === 'radio'\) el\.checked = false;\s*else el\.value = '';/);
  assert.doesNotMatch(fn, /forEach\(function\(el\)\{ el\.value = ''; \}\)/, 'the value-blanking reset is back');
});

test('adding an item unticks its boxes and mends a blanked value', () => {
  const fn = src.slice(src.indexOf('function addLine(){'), src.indexOf("var oh = tpl.querySelector('.opthelp');"));
  assert.match(fn, /el\.checked = false;/);
  assert.match(fn, /if \(el\.type === 'checkbox' && !el\.value\) el\.value = '1';/);
});

test('a line priced by its method alone is named after it, not "Custom item"', () => {
  assert.match(src, /: method \? String\(method\.title \|\| ''\)\.trim\(\) \|\| 'Custom item' : 'Custom item'\);/);
});

test('an item with only a decoration picked (a cutout pack) is kept, not dropped as empty', () => {
  assert.match(src, /if \(!desc && !qty && !prod && !method && !method2 && !priceTyped && !sizeTyped && !detailTyped\) continue;/);
});

test('picking a product or decoration on an item with no quantity fills in 1, on the pick only', () => {
  assert.match(src, /document\.querySelectorAll\('\.line \.p, \.line \.pm'\)\.forEach\(function\(sel\)\{\s*if \(sel\.dataset\.qtyBound\) return;/);
  assert.match(src, /if \(sel\.value && q && !String\(q\.value\)\.trim\(\)\) \{ q\.value = '1'; calc\(\); \}/);
  /* A copied item must not inherit the mark, or its selects get no listener. */
  assert.match(src, /tpl\.querySelectorAll\('\[data-qty-bound\]'\)\.forEach\(function\(el\)\{ delete el\.dataset\.qtyBound; \}\);/);
});
