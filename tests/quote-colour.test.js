'use strict';

/* The garment colour on a quote.
 *
 * Nothing used to choose one. The quote fell back to the product's default
 * catalogue photo — one colourway, picked by nobody — and the customer read it
 * as the choice they were being offered.
 *
 * Two properties matter and neither is cosmetic: the colour that reaches the
 * saved line must be one the PRODUCT actually comes in, and the swatch hex must
 * come from the catalogue rather than from the posted body.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* The resolve step, lifted. Anchored on the variable name — the shortest
   unique text — so a reworded body still reports a regression. */
const m = src.match(/const colourRow = colourPick && prod[\s\S]*?: null;/);
assert.ok(m, 'the colour resolve step is gone from server.js');
const resolve = new Function('colourPick', 'prod', 'return ' +
  m[0].replace(/^const colourRow = /, '').replace(/;$/, ''));

const PROD = { colours: [
  { name: 'Black', value: '#1b151a' },
  { name: 'Black/ White', value: '#8a9b9e' },
  { name: 'Sport Grey', value: '#9d9d9d' },
] };

test('a real colour resolves, and brings its own hex', () => {
  const r = resolve('Black/ White', PROD);
  assert.strictEqual(r.name, 'Black/ White');
  assert.strictEqual(r.value, '#8a9b9e');
});

test('a colour the product does not come in is dropped, not saved', () => {
  assert.ok(!resolve('Neon Lilac', PROD), 'an unknown colour must not reach the line');
});

test('two colourways sharing a name shape stay distinct', () => {
  /* "Black" and "Black/ White" differ by one character of suffix. Matching
     loosely would give a two-tone cap the solid colour's swatch, and the swatch
     is the value an order records. */
  assert.strictEqual(resolve('Black', PROD).value, '#1b151a');
  assert.notStrictEqual(resolve('Black', PROD).value, resolve('Black/ White', PROD).value);
});

test('nothing chosen resolves to nothing', () => {
  assert.ok(!resolve('', PROD));
});

test('a product with no colours cannot yield one', () => {
  assert.ok(!resolve('Black', { colours: [] }));
  assert.ok(!resolve('Black', {}));
});

test('the customer page only paints a swatch for a real hex', () => {
  const cell = src.match(/\$\{i\.colour \? `[\s\S]*?` : ''\}/);
  assert.ok(cell, 'the colour row is gone from the customer quote');
  assert.match(cell[0], /\^#\[0-9a-fA-F\]\{6\}\$/,
    'the hex is validated before it reaches a style attribute');
  assert.match(cell[0], /escEmail\(i\.colour\)/,
    'the colour NAME is escaped — it is supplier text on a customer page');
});

/* The line photo follows the chosen colour.
 *
 * Falling back to the catalogue thumbnail put one colourway — the supplier's
 * default shot — on every quote regardless of what was ordered. Now that a
 * colour is chosen and the feed carries per-colourway art, the fallback should
 * prefer the garment actually being bought.
 */
test('the chosen colourway photo is preferred over the catalogue default', () => {
  const block = src.match(/No photo uploaded, so fall back[\s\S]*?prod\.thumbnail\];\n      \}/);
  assert.ok(block, 'the image fallback block is gone from server.js');

  const colourAt = block[0].indexOf('colourRow.image');
  const thumbAt = block[0].indexOf('prod.thumbnail');
  assert.ok(colourAt > -1, 'the colourway photo is never consulted');
  assert.ok(colourAt < thumbAt,
    'the catalogue thumbnail must be the LAST resort, not the first');
});

test('both fallbacks validate the URL before using it', () => {
  const block = src.match(/No photo uploaded, so fall back[\s\S]*?prod\.thumbnail\];\n      \}/)[0];
  const guards = block.match(/\^https\?:/g) || [];
  assert.strictEqual(guards.length, 2,
    'each fallback checks its URL — supplier data reaching an img src');
});
