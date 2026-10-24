/* tools/raise-front-box.js: the full-front box moves 2" up on shirts, hoodies
 * and sweats, in the product AND every colourway, once, and never off the photo.
 *
 * Run: node --test tests/raise-front-box.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { enjson, dejson } = require('../tools/lib/db');
const { planProduct, MARK } = require('../tools/raise-front-box');

const front = (top, extra = {}) => ({ label: 'Full front', product_width: 400, product_height: 475,
  edit_zone: { width: 210, height: 250, left: 0, top, radius: '0' }, ...extra });
const chest = { label: 'Left chest', edit_zone: { width: 80, height: 80, left: 64, top: -88, radius: '0' } };
const row = (name, top = 8) => ({ id: 1, name,
  stages: enjson({ front: front(top), left_chest: chest }),
  variations: enjson({ variations: { 1: { stages: { front: front(top), left_chest: chest } } } }) });

test('a pullover hoodie moves 2" (14" box -> 15 units per inch) in the product and every colour', () => {
  const plan = planProduct(row('Independent Trading Heavyweight Hoodie'));
  assert.strictEqual(plan.after, -22);
  assert.strictEqual(plan.stages.front.edit_zone.top, -22);
  assert.ok(plan.stages.front[MARK]);
  assert.strictEqual(plan.copies, 1);
  assert.strictEqual(plan.variations.variations[1].stages.front.edit_zone.top, -22);
  assert.deepStrictEqual(plan.stages.left_chest, chest, 'the left chest stays');
});

test('tees and kids move; caps, zips, polos and tanks do not', () => {
  assert.ok(planProduct(row('Gildan Softstyle T-Shirt')));
  assert.ok(planProduct(row('Youth Heavy Cotton Tee')));
  for (const n of ['Richardson Trucker Cap', 'Full-Zip Hooded Sweatshirt', 'Sport-Tek Polo', 'Bella Tank'])
    assert.strictEqual(planProduct(row(n)), null, n);
});

test('a product already moved is skipped, so a re-run cannot move it twice', () => {
  const plan = planProduct(row('Gildan Hoodie'));
  const again = { id: 1, name: 'Gildan Hoodie', stages: enjson(plan.stages), variations: enjson(plan.variations) };
  assert.strictEqual(planProduct(again), null);
});

test('the box never goes above the top of the photo', () => {
  const plan = planProduct(row('Gildan Hoodie', -100));
  assert.strictEqual(plan.after, 250 / 2 - 475 / 2);
});

test('an unreadable colourway blob is reported, not overwritten', () => {
  const r = row('Gildan Hoodie'); r.variations = 'not-base64-json';
  assert.ok(planProduct(r).error);
  assert.ok(dejson(r.stages).front.edit_zone.top === 8);
});

test('a product with no colourways (NULL or {}) moves its own box and writes no variations', () => {
  for (const v of ['NULL', '{}']) {
    const r = row('Port & Company Core Cotton Tee'); r.variations = v;
    const plan = planProduct(r);
    assert.ok(plan && !plan.error && plan.variations === null && plan.copies === 0, v);
  }
});
