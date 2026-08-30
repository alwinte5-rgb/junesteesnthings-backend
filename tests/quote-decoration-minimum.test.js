/* The decoration minimum, enforced in the quote form's own pricing engine.
 *
 * The form already WARNED when a screen-print line fell below 50 pieces. A
 * warning does not stop the quote being saved, sent and paid, so the number
 * itself stayed wrong: tier keys are band CEILINGS, so 12 pieces priced at the
 * 50-99 rate — $8.45/ea — while the shop pays a 50-piece contract minimum plus
 * $25/colour in screens.
 *
 * The rule now lives inside quotePricingSource(), which is the text BOTH the
 * browser and the save path execute, so the displayed price and the charged
 * price cannot disagree about it. These tests pin that.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const box = {};
vm.runInNewContext(lift('quotePricingSource') + '\nthis.text = quotePricingSource();', box);
const engine = {};
vm.runInNewContext(box.text + '\nthis.priceLine = priceLine;', engine);
const { priceLine } = engine;

/* Method #22 as the catalogue serves it: bands are CEILINGS, and the method
   carries its own order minimum separately from them. */
const SCREEN = {
  id: 22,
  title: 'Screen Printing',
  min_order_qty: 50,
  positions: { front: [
    { min_qty: 99, price: 8.45 }, { min_qty: 249, price: 6.30 },
    { min_qty: 499, price: 4.15 }, { min_qty: 999, price: 3.45 },
  ] },
};
const DTF = { id: 1, title: 'Printing', min_order_qty: 0,
  positions: { front: [
    { min_qty: 11, price: 28.15 }, { min_qty: 24, price: 22.55 },
    { min_qty: 49, price: 18.00 }, { min_qty: 99, price: 13.00 },
  ] } };

const line = (method, qty) => priceLine({
  qty, colours: 1, method, stage: 'front',
  product: { price: 0, sizes: [] }, blankTiers: [], addons: [],
  blankOverride: null, unitOverride: null, sizeMix: null,
});

test('a below-minimum screen line is no longer billed at the 50-99 rate', () => {
  const got = line(SCREEN, 12);
  assert.notStrictEqual(Math.round(got.unit * 100) / 100, 8.45,
    '12 pieces must not price at the 50-piece rate');
});

test('it is billed as the 50-piece minimum it actually triggers', () => {
  /* $8.45 x 50 pieces = $422.50 of screen work, spread over the 12 ordered. */
  const got = line(SCREEN, 12);
  assert.strictEqual(Math.round(got.unit * 100) / 100, 35.21);
  assert.strictEqual(Math.round(got.unit * 12), 423);
});

test('at the minimum the price is untouched', () => {
  assert.strictEqual(Math.round(line(SCREEN, 50).unit * 100) / 100, 8.45);
});

test('one under still enforces — the boundary is not off by one', () => {
  assert.ok(line(SCREEN, 49).unit > 8.45);
});

test('a method with no minimum is never adjusted', () => {
  /* DTF at 12 sits in the 24-ceiling band: $22.55, straight through. */
  assert.strictEqual(Math.round(line(DTF, 12).unit * 100) / 100, 22.55);
});

test('above the smallest band the walk is untouched and prices still fall', () => {
  assert.ok(line(SCREEN, 500).unit < line(SCREEN, 150).unit);
});

test('the rule is inside the shared source, so both surfaces enforce it', () => {
  /* If this ever moves out of quotePricingSource() into the route handler, the
     browser would show one price and the save path would charge another. */
  assert.ok(box.text.includes('min_order_qty'),
    'the minimum must be read inside the shared pricing source');
});

test('the shared source has no free variables it cannot resolve alone', () => {
  /* It is lifted and executed in isolation, here and in the parity test. A
     server constant interpolated into it would break that — and did once. */
  assert.ok(!/\$\{[A-Z_]+\}/.test(box.text),
    'quotePricingSource() must not interpolate outer constants');
});
