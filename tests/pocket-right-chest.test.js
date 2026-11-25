/* tools/add-pocket-right-chest.js: pocket tees already in the shop get a
 * Right chest side mirrored from their own Left chest (owner, 2026-11-09).
 *
 * Run: node --test tests/pocket-right-chest.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { planProduct, rightFrom } = require('../tools/add-pocket-right-chest');
const { enjson } = require('../tools/lib/db');

const front = { label: 'Full front', image: 'u/6030-black-front.webp', url: '6030-black-front.webp', product_width: 400,
  edit_zone: { width: 207.5, height: 252, left: 2.4, top: -41, radius: '0' } };
const left = { label: 'Left chest', image: 'u/6030-black-front.webp', url: '6030-black-front.webp', product_width: 400,
  edit_zone: { width: 81.5, height: 81.5, left: 69.1, top: -107.8, radius: '0' } };
const back = { label: 'Back', image: 'u/6030-black-back.webp', product_width: 400, edit_zone: { width: 196.9, height: 253.2, left: 4.3, top: -31.2 } };
const POCKET = 'Comfort Colors 6030 Unisex Garment-Dyed Heavyweight Pocket T-Shirt';

test('the right chest mirrors the left chest across the front box centre', () => {
  const r = rightFrom(front, left);
  assert.strictEqual(r.edit_zone.left, -64.3);
  assert.deepStrictEqual([r.edit_zone.width, r.edit_zone.height, r.edit_zone.top], [81.5, 81.5, -107.8]);
  assert.strictEqual(r.label, 'Right chest');
  assert.strictEqual(r.image, left.image, 'same photo as the front, so the designer draws it on the Front side');
  assert.strictEqual(left.edit_zone.left, 69.1, 'the left chest is not touched');
});

test('a colour photo drawn at its own size mirrors in its own units', () => {
  const l2 = { ...left, product_width: 800, edit_zone: { width: 163, height: 163, left: 138.2, top: -215.6 } };
  assert.strictEqual(rightFrom(front, l2).edit_zone.left, r1(2 * 2.4 * 2 - 138.2));
});
const r1 = (n) => Math.round(n * 10) / 10;

test('a pocket tee gets right_chest right after left_chest, in the product and each colourway', () => {
  const stages = { front, left_chest: left, back };
  const variations = { variations: { v1: { cfgstages: true, stages: { front, left_chest: left, back } }, v2: { stages: { front, back } } } };
  const plan = planProduct({ name: POCKET, stages: enjson(stages), variations: enjson(variations) });
  assert.ok(plan.own);
  assert.deepStrictEqual(Object.keys(plan.stages), ['front', 'left_chest', 'right_chest', 'back']);
  assert.strictEqual(plan.copies, 1, 'the colourway with its own sides; one with no left chest is left alone');
  assert.deepStrictEqual(Object.keys(plan.variations.variations.v1.stages), ['front', 'left_chest', 'right_chest', 'back']);
  assert.deepStrictEqual(Object.keys(plan.variations.variations.v2.stages), ['front', 'back']);
});

test('only pocket tees, only once', () => {
  const stages = enjson({ front, left_chest: left, back });
  assert.strictEqual(planProduct({ name: 'Gildan 5000 Adult Heavy Cotton T-Shirt', stages }), null, 'a plain tee');
  assert.strictEqual(planProduct({ name: 'Hanes HMB000 Men\'s V-Neck 1 Pocket Scrub Top', stages }), null, 'a scrub top is a placket garment');
  const done = enjson({ front, left_chest: left, right_chest: rightFrom(front, left), back });
  assert.strictEqual(planProduct({ name: POCKET, stages: done }), null, 're-running changes nothing');
  assert.strictEqual(planProduct({ name: POCKET, stages: enjson({ front, back }) }), null, 'no left chest to mirror');
});

test('stages stored wrapped as {stages, colors} stay wrapped', () => {
  const plan = planProduct({ name: POCKET, stages: enjson({ stages: { front, left_chest: left, back }, colors: ['#000'] }) });
  assert.deepStrictEqual(Object.keys(plan.stages.stages), ['front', 'left_chest', 'right_chest', 'back']);
  assert.deepStrictEqual(plan.stages.colors, ['#000']);
});
