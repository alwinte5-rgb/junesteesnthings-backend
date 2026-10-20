/* Front + back only in the designer (owner, 2026-10-20).
 *
 * Run: node --test tests/front-back-only.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { frontBack, cutProduct } = require('../tools/front-back-only');
const { enjson, dejson } = require('../tools/lib/db');

const zone = { width: 100, height: 100, left: 0, top: 0 };
const st = (labels) => Object.fromEntries(Object.entries(labels).map(([k, l]) => [k, { label: l, edit_zone: zone, url: 'products/' + k + '.png' }]));

test('a tee loses its Left chest tab and keeps its front and back boxes', () => {
  const out = frontBack(st({ front: 'Full front', left_chest: 'Left chest', back: 'Back' }));
  assert.deepStrictEqual(Object.keys(out), ['front', 'back']);
  assert.deepStrictEqual(Object.values(out).map((s) => s.label), ['Front', 'Back']);
  assert.deepStrictEqual(out.front.edit_zone, zone, 'the print box is kept');
});

test('a zip garment keeps its left-chest front and loses the Right chest', () => {
  const out = frontBack(st({ front: 'Left chest', right_chest: 'Right chest', back: 'Back' }));
  assert.deepStrictEqual(Object.keys(out), ['front', 'back']);
  assert.strictEqual(out.front.url, 'products/front.png');
});

test('already front + back, a cap, or a non-garment is left alone', () => {
  assert.strictEqual(frontBack(st({ front: 'Front', back: 'Back' })), null);
  assert.strictEqual(frontBack(st({ front: 'Front' })), null);
  assert.strictEqual(frontBack(st({ panel: 'Panel' })), null);
  assert.strictEqual(frontBack(null), null);
});

test('every colourway is cut as well as the product, and reported once', () => {
  const p = {
    stages: enjson(st({ front: 'Full front', left_chest: 'Left chest', back: 'Back' })),
    variations: enjson({ variations: {
      1: { cfgstages: true, conditions: { C: '#1' }, stages: st({ front: 'Full front', left_chest: 'Left chest', back: 'Back' }) },
      2: { cfgstages: true, conditions: { C: '#2' }, stages: st({ front: 'Front', back: 'Back' }) },
    } }),
  };
  const c = cutProduct(p);
  assert.deepStrictEqual(c.dropped, ['left_chest']);
  assert.deepStrictEqual(Object.keys(c.stages), ['front', 'back']);
  assert.deepStrictEqual(Object.keys(c.variations.variations[1].stages), ['front', 'back']);
  assert.deepStrictEqual(c.variations.variations[2].stages, dejson(p.variations).variations[2].stages, 'an already-right colourway is untouched');
  assert.strictEqual(cutProduct({ stages: enjson(st({ front: 'Front', back: 'Back' })), variations: '' }), null);
});
