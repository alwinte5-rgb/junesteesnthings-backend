/* Every colour gets a back to design on (owner, 2026-10-20).
 *
 * Run: node --test tests/fill-colour-backs.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { fillBacks } = require('../tools/fill-colour-backs');
const { enjson } = require('../tools/lib/db');

const photo = (c, side) => ({ label: side === 'back' ? 'Back' : 'Front', image: 'https://c/' + c + '-' + side + '.webp', url: 'x.webp' });

test('a colour with no back gets the product\'s back drawing, never another colour\'s photo', () => {
  const p = { name: 'Gildan 5000 Tee',
    stages: enjson({ front: photo('white', 'front'), left_chest: photo('white', 'front'), back: { label: 'Back', url: 'products/basic_tshirt_back.png' } }),
    variations: enjson({ variations: { 1: { cfgstages: true, conditions: { C: '#1' }, stages: { front: photo('navy', 'front'), left_chest: photo('navy', 'front') } } } }) };
  const c = fillBacks(p);
  assert.strictEqual(c.backs, 1);
  const st = c.variations.variations[1].stages;
  assert.deepStrictEqual(Object.keys(st), ['front', 'left_chest', 'back'], 'the chest placement is kept');
  assert.strictEqual(st.back.url, 'products/basic_tshirt_back.png');
});

test('when every back is a photo, the back is measured on the garment\'s drawing', () => {
  const p = { name: 'C2 Sport 5900 Men\'s Utility Polo',
    stages: enjson({ front: photo('white', 'front'), back: photo('white', 'back') }),
    variations: enjson({ variations: { 1: { cfgstages: true, conditions: { C: '#1' }, stages: { front: photo('navy', 'front') } } } }) };
  const seen = [];
  const c = fillBacks(p, { drawnBack: (name) => { seen.push(name); return { url: 'products/polo_softstyle_back.png', label: 'Back' }; } });
  assert.deepStrictEqual(seen, [p.name]);
  assert.strictEqual(c.variations.variations[1].stages.back.url, 'products/polo_softstyle_back.png');
  assert.strictEqual(fillBacks(p, { drawnBack: () => null }), null, 'no drawing: left as it is');
});

test('colours that already have a back, and products with no colourways, are untouched', () => {
  const p = { name: 'Tee', stages: enjson({ front: photo('w', 'front'), back: photo('w', 'back') }),
    variations: enjson({ variations: { 1: { cfgstages: true, stages: { front: photo('n', 'front'), back: photo('n', 'back') } } } }) };
  assert.strictEqual(fillBacks(p), null);
  assert.strictEqual(fillBacks({ ...p, variations: '' }), null);
});

test('a polo and a quarter-zip have a back drawing; a cropped zip hoodie has its own', () => {
  const { drawingFor } = require('../tools/product-art/standin-placements');
  assert.strictEqual(drawingFor('hoodie', 'Shaka Wear SHGCZ Unisex Garment-Dyed Cropped Full-Zip Hoodie Sweatshirt'), 'cropped_hoodie');
  assert.strictEqual(drawingFor('hoodie', 'Gildan 18500 Unisex Heavy Blend Hooded Sweatshirt'), 'hoodies_sweatshirt');
});

/* #14 keeps admin-made stage ids; a back added to a colour goes under the
   product's back id, so every colour and the saved designs agree on it. */
test('a back added to a random-id product lands under the product\'s back id', () => {
  const p = { name: 'Bella+Canvas 3001 Unisex Jersey Tee',
    stages: enjson({ ZWEnsr7gXm: { ...photo('white', 'front'), jt_key: 'front' }, mr83j4pl: { label: 'Back', url: 'products/basic_tshirt_back.png' } }),
    variations: enjson({ variations: { 1: { cfgstages: true, conditions: { C: '#1' }, stages: { ZWEnsr7gXm: { ...photo('navy', 'front'), jt_key: 'front' } } } } }) };
  const c = fillBacks(p);
  assert.strictEqual(c.backs, 1);
  const st = c.variations.variations[1].stages;
  assert.deepStrictEqual(Object.keys(st), ['ZWEnsr7gXm', 'mr83j4pl']);
  assert.strictEqual(st.mr83j4pl.url, 'products/basic_tshirt_back.png');
});
