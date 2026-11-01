/* add-dtf-chest-logo.js links the chest-logo price to every product whose
 * designer Front shows the Left chest box (owner, 2026-10-31: youth and toddler
 * items too). lib/chest-box.js is the twin of the designer's front_chest_ok
 * (lumise-designer core/assets/js/app.js, tests/chest-front.test.cjs). */
const { test } = require('node:test');
const assert = require('node:assert');
const { enjson } = require('../tools/lib/db');
const { showsChestBox } = require('../tools/lib/chest-box');
const { decorationsFor } = require('../tools/lib/garments');

const FRONT = { image: 'https://x/up/18500b/navy-front.webp?v=2', product_width: 500,
  edit_zone: { width: 175, height: 280, left: 0, top: 10, radius: '0' } };
const CHEST = { image: 'https://x/up/18500b/navy-front.webp', product_width: 500,
  edit_zone: { width: 60, height: 60, left: 50, top: -80, radius: '0' } };
const sides = (extra) => Object.assign({ front: FRONT, left_chest: CHEST, back: { image: 'b.webp', edit_zone: FRONT.edit_zone } }, extra);
const clone = (v) => JSON.parse(JSON.stringify(v));

test('a youth hoodie whose left chest shares the front photo shows the box', () => {
  assert.ok(!(decorationsFor('Gildan 18500B Youth Heavy Blend Hoodie') || []).includes('dtf:chest'), 'not by the adult role');
  assert.ok(showsChestBox(enjson(sides())), 'stored as Lumise stores it');
  assert.ok(showsChestBox(enjson({ stages: sides(), colors: [] })), 'the {stages, colors} form');
  assert.ok(showsChestBox(JSON.stringify(sides())), 'plain JSON');
});

test('no box: no left chest, its own close-up photo, a zip garment, an incomplete box', () => {
  assert.ok(!showsChestBox(enjson({ front: FRONT, back: FRONT })), 'no left_chest side');
  assert.ok(!showsChestBox(enjson(sides({ left_chest: Object.assign(clone(CHEST), { image: 'chest-closeup.webp' }) }))), 'a close-up');
  assert.ok(!showsChestBox(enjson(sides({ right_chest: CHEST }))), 'zip / placket (right_chest)');
  assert.ok(!showsChestBox(enjson(sides({ left_chest: Object.assign(clone(CHEST), { edit_zone: { width: 60, height: 60 } }) }))), 'no offsets');
  assert.ok(!showsChestBox(enjson(sides({ left_chest: Object.assign(clone(CHEST), { edit_zone: { width: 0, height: 60, left: 0, top: 0 } }) }))), 'zero width');
  assert.ok(!showsChestBox(enjson(sides({ front: Object.assign(clone(FRONT), { image: '', url: '' }), left_chest: Object.assign(clone(CHEST), { image: '' }) }))), 'no photo on either');
});

test('a corrupt or empty column is no box, never a throw', () => {
  for (const v of ['', null, undefined, 'not base64 %%%', '{"front":'])
    assert.strictEqual(showsChestBox(v), false, String(v));
});

test('the tool links by the box as well as by the adult role', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'add-dtf-chest-logo.js'), 'utf8');
  assert.match(src, /const fits = \(p\) => byRole\(p\) \|\| showsChestBox\(p\.stages\);/);
  assert.match(src, /SELECT id, name, printings, stages FROM lumise_products;/);
});
