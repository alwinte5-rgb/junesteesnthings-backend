'use strict';

/* What the product-art run decides before it spends anything.
 *
 * Both rules here are ones the pipeline gets no feedback on. A cap quietly
 * given a back stage looks like a better product until somebody orders a
 * decorated cap back the shop does not sell; art built for a product that never
 * opens the designer looks like progress while changing nothing a customer can
 * see. Neither shows up in the output of a successful run, so they are tested
 * rather than watched.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { planFor } = require('../tools/product-art/plan');

const colour = (...hexes) => ({
  COL: { type: 'product_color', values: { options: hexes.map((h, i) => ({ value: h, title: 'c' + i })) } },
});
const twoSided = { front: { url: 'products/hat.png' }, back: { url: 'products/hat.png' } };

const product = (over) => Object.assign({
  id: 1, name: 'econscious EC7070 Eco Trucker Cap', supplier_style_id: '13574',
  printings: '%7B%22_8%22%3A%22A3%22%7D', stages: twoSided,
  attributes: colour('#111', '#222'), variations: {},
}, over);

test('headwear is front only, even when the product has a back stage', () => {
  const p = planFor(product());
  assert.deepStrictEqual(p.sides, ['front']);
  assert.strictEqual(p.images, 2, 'two colourways, one side each');
});

test('everything else keeps both sides', () => {
  const p = planFor(product({ name: 'Gildan 18810 Heavy Blend Quarter-Zip' }));
  assert.deepStrictEqual(p.sides, ['front', 'back']);
  assert.strictEqual(p.images, 4);
});

test('a product with no decoration method is blocked, not queued', () => {
  for (const printings of ['', null, '%7B%7D', '   ']) {
    const p = planFor(product({ printings }));
    assert.ok(p.blocked.some((b) => /never opens the designer/.test(b)),
      'printings ' + JSON.stringify(printings) + ' should block the run');
  }
});

test('duplicate colour swatches are refused before any image is fetched', () => {
  const p = planFor(product({ attributes: colour('#777056', '#777056') }));
  assert.ok(p.blocked.some((b) => /duplicate colour swatches/.test(b)));
});

test('a product with no supplier style id has nothing to fetch', () => {
  for (const sid of ['', '0', null, undefined]) {
    assert.ok(planFor(product({ supplier_style_id: sid })).blocked
      .some((b) => /no supplier style id/.test(b)), 'sid ' + JSON.stringify(sid));
  }
});

test('a garment already drawn as itself is not in the plan at all', () => {
  assert.strictEqual(planFor(product({ name: 'Gildan 5000 Unisex Heavy Cotton Tee' })), null);
});

test('done means every colourway is wired, not merely some', () => {
  /* The real column is {default, attrs, variations:{...}} — the shape wire.js
     writes. Nesting matters: a flat map here reads as zero wired, which is how
     this test first passed its "not done" case for the wrong reason. */
  const wired = (n) => ({
    variations: {
      default: { COL: '#111' }, attrs: ['COL'],
      variations: Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), {
        cfgstages: true, stages: { front: { image: 'https://res.cloudinary.com/x/' + i + '.webp' } },
      }])),
    },
  });
  assert.strictEqual(planFor(product(wired(1))).done, false, '1 of 2 is not done');
  assert.strictEqual(planFor(product(wired(2))).done, true, '2 of 2 is done');
});

test('a local raws path in a variation does not count as real art', () => {
  const p = planFor(product({
    variations: { default: { COL: '#111' }, attrs: ['COL'], variations: {
      1: { cfgstages: true, stages: { front: { image: 'assets/raws/products/hat.png' } } } } },
  }));
  assert.strictEqual(p.wired, 0);
});
