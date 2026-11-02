const test = require('node:test');
const assert = require('node:assert');
const { planProduct, chestFrom } = require('../tools/add-kids-left-chest');
const { enjson, dejson } = require('../tools/lib/db');
const { SETS } = require('../tools/lib/placements');

const front = { image: 'https://res.cloudinary.com/x/ash-front.webp', product_width: 500, product_height: 600,
  edit_zone: { width: 220, height: 280, left: 0, top: -10, radius: '0' }, jt_front_raised: '2026-10-24' };
const back = { image: 'https://res.cloudinary.com/x/ash-back.webp', product_width: 500, product_height: 600,
  edit_zone: { width: 220, height: 300, left: 0, top: 0 } };

test('kids placement set has a left chest', () => {
  assert.deepStrictEqual(SETS.kids.map((b) => b.key), ['front', 'left_chest', 'back']);
});

test('the chest is a copy of the front with a small box on the wearer\'s left', () => {
  const lc = chestFrom(front);
  assert.strictEqual(lc.image, front.image, 'same photo, so the designer draws it on the front');
  assert.strictEqual(lc.jt_front_raised, undefined);
  const u = 220 / 11;
  assert.strictEqual(lc.edit_zone.width, 4.5 * u);
  assert.strictEqual(lc.edit_zone.left, 3.5 * u);
  const shoulder = -10 - 140 - 1.5 * u;
  assert.strictEqual(lc.edit_zone.top, Math.round((shoulder + 5 * u) * 10) / 10);
  assert.ok(lc.edit_zone.top > -150 && lc.edit_zone.top < 0, 'inside the front box, near its top');
});

test('a kids product gets it on its own sides and every colourway, in order', () => {
  const p = { name: 'Bella+Canvas 3001Y Youth Jersey Tee', stages: enjson({ front, back }),
    variations: enjson({ variations: { a: { cfgstages: true, stages: { front, back } }, b: { cfgstages: true, stages: { stages: { front, back } } } } }) };
  const plan = planProduct(p);
  assert.deepStrictEqual(Object.keys(plan.stages), ['front', 'left_chest', 'back']);
  assert.strictEqual(plan.copies, 2);
  assert.deepStrictEqual(Object.keys(plan.variations.variations.a.stages), ['front', 'left_chest', 'back']);
  assert.deepStrictEqual(Object.keys(plan.variations.variations.b.stages.stages), ['front', 'left_chest', 'back']);
  assert.ok(dejson(enjson(plan.stages)).left_chest);
});

test('adult garments, products that already have one and re-runs are left alone', () => {
  assert.strictEqual(planProduct({ name: 'Gildan 5000 Unisex Heavy Cotton Tee', stages: enjson({ front, back }) }), null);
  assert.strictEqual(planProduct({ name: 'Gildan 5000B Youth Heavy Cotton Tee', stages: enjson({ front, left_chest: front, back }) }), null);
  const once = planProduct({ name: 'Gildan 5000B Youth Heavy Cotton Tee', stages: enjson({ front, back }) });
  assert.strictEqual(planProduct({ name: 'Gildan 5000B Youth Heavy Cotton Tee', stages: enjson(once.stages) }), null);
});
