/* Garment-correct print placements (owner, 2026-10-18).
 *
 * The live quarter-zip #136 offered one full-front box straight over its
 * zipper. Each garment now gets its own set, measured on its own photo:
 * zips/polos/wovens/jackets Left chest · Right chest · Back; tees, long
 * sleeves, tanks and pullovers Full front · Left chest · Back.
 *
 * Run: node --test tests/placements.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { placementSet, boxesFor, toEditZone, stagesFor } = require('../tools/lib/placements');
const { localChecks, expectedKeys } = require('../tools/catalog-inventory');
const { canvasVerdict, photoCoverage } = require('../tools/lib/canvas');

test('each garment gets the owner-approved placement set', () => {
  const cases = {
    'Comfort Colors 1580 Garment-Dyed Quarter-Zip': 'open',
    'Gildan 64800 Unisex Softstyle Pique Polo': 'open',
    'Harriton M500 — Easy Blend Long-Sleeve Twill Shirt': 'open',
    'Gildan 18600 Heavy Blend Full-Zip Hoodie': 'open',
    'Shaka Wear SHCJ Unisex Coaches Jacket': 'open',
    'Gildan 18500 Unisex Heavy Blend Hoodie': 'closed',
    'Shaka Wear SHMHO Unisex Max Heavyweight Oversized Tee': 'closed',
    'Gildan 5400 Adult Long-Sleeve Tee': 'closed',
    'Gildan 2200 Adult Ultra Cotton Tank Top': 'tank',
    'Gildan 5000B Youth Heavy Cotton Tee': 'kids',
    'Rabbit Skins RS4400 — Infant Short Sleeve Bodysuit': 'onesie',
    'Liberty Bags 8502 Cotton Tote Bag': 'bag',
    'Richardson 112 Snapback Trucker Cap': 'cap',
  };
  for (const [name, set] of Object.entries(cases)) assert.strictEqual(placementSet(name), set, name);
});

/* A 640x800 photo: garment centred at x=320, body 360px wide, shoulders at y=100. */
const M = { W: 640, H: 800, bbox: [20, 20, 620, 790], cx: 320, torso: 360, shoulder: 100 };
const m = { front: M, back: M };

test('a zip or placket garment: two chest logos clear of the centre line, and a back — no full front', () => {
  const b = boxesFor('open', m);
  assert.deepStrictEqual(b.map((x) => x.key), ['front', 'right_chest', 'back']);
  assert.deepStrictEqual(b.map((x) => x.label), ['Left chest', 'Right chest', 'Back']);
  const [left, right] = b;
  assert.ok(left.cx > M.cx && right.cx < M.cx, 'wearer\'s left chest is the viewer\'s right');
  for (const c of [left, right]) assert.ok(Math.abs(c.cx - M.cx) - c.w / 2 > 0, c.label + ' does not cross the zipper');
  assert.ok(left.w < M.torso * 0.45, 'a chest logo, not a full front');
});

test('a tee: full front centred below the shoulders, a left chest, and a back', () => {
  const b = boxesFor('closed', m);
  assert.deepStrictEqual(b.map((x) => x.label), ['Full front', 'Left chest', 'Back']);
  assert.strictEqual(b[0].cx, M.cx);
  assert.ok(b[0].cy - b[0].h / 2 > M.shoulder, 'starts below the shoulder line');
  assert.ok(b[1].cx > M.cx, 'left chest on the wearer\'s left');
});

test('an override nudges one placement of one style without touching the rule', () => {
  const base = boxesFor('closed', m), moved = boxesFor('closed', m, { left_chest: { dy: 1 } });
  assert.ok(moved[1].cy > base[1].cy && moved[0].cy === base[0].cy);
});

test('edit zones convert back exactly the way app.js draws them', () => {
  const b = { cx: 400, cy: 300, w: 120, h: 90 };
  const ez = toEditZone(b, 640, 800, 400);
  const u = 640 / 400;   // app.js: r = drawn width / product_width
  assert.ok(Math.abs(640 / 2 + ez.left * u - b.cx) < 0.2 && Math.abs(800 / 2 + ez.top * u - b.cy) < 0.2);
  assert.ok(Math.abs(ez.width * u - b.w) < 0.2 && Math.abs(ez.height * u - b.h) < 0.2);
});

test('stages: one per placement, front first, drawn on that side\'s photo', () => {
  const base = { front: { product_width: 400, product_height: 475, url: 'products/x.png' }, back: { product_width: 400 } };
  const st = stagesFor(base, boxesFor('open', m), { front: 'https://c/f.webp', back: 'https://c/b.webp' },
    { front: { W: 640, H: 800 }, back: { W: 640, H: 800 } });
  assert.deepStrictEqual(Object.keys(st), ['front', 'right_chest', 'back']);
  assert.strictEqual(st.right_chest.image, 'https://c/f.webp');
  assert.strictEqual(st.back.image, 'https://c/b.webp');
  for (const s of Object.values(st)) { assert.strictEqual(s.overlay, false); assert.strictEqual(s.product_width, 400); }
});

test('the inventory flags a quarter-zip that still offers a full front, and a missing photo', () => {
  const enc = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o))).toString('base64');
  const p = { name: 'Comfort Colors 1580 Garment-Dyed Quarter-Zip', price: '28.00', cost: '20.00', printings: '',
    stages: enc({ front: { label: 'Front' }, back: { label: 'Back' } }),
    attributes: enc({ COL: { type: 'product_color', values: { options: [{ title: 'Blue', value: '#1' }] } }, QTYS: { type: 'q' } }),
    variations: '' };
  const r = localChecks(p);
  assert.match(r.placements, /wants Left chest \/ Right chest \/ Back/);
  assert.match(r.photos, /0\/1 colours have photos/);
  assert.strictEqual(r.price, 'ok');
  assert.deepStrictEqual(expectedKeys('closed'), ['front', 'left_chest', 'back']);
});

test('a real-photo canvas is the right garment by construction', () => {
  const enc = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o))).toString('base64');
  const v = canvasVerdict({ name: 'Shaka Wear SHCJ Unisex Coaches Jacket',
    stages: enc({ front: { url: 'a.webp', image: 'https://c/a.webp' }, back: { url: 'b.webp', image: 'https://c/b.webp' } }) });
  assert.strictEqual(v.verdict, 'ok');
  assert.deepStrictEqual(photoCoverage({ C: { type: 'product_color', values: { options: [{ value: '#1' }, { value: '#2' }] } } },
    { variations: { 1: { cfgstages: true, conditions: { C: '#1' }, stages: { front: { image: 'https://x' } } } } }), { colours: 2, withPhotos: 1 });
});

/* 2026-10-18 streetwear batch: sleeves hanging against the body made the hem
   band arms + body, so 17 hoodies/crews got oversized boxes down at the pocket. */
test('a garment whose sleeves touch the body uses the separated torso and shoulder', () => {
  const merged = { ...M, torso: 590, shoulder: 260, merged: true, torso_sep: 360, shoulder_sep: 100 };
  const fixed = boxesFor('closed', { front: merged, back: merged });
  const clean = boxesFor('closed', m);
  assert.deepStrictEqual(fixed.map((b) => [b.cy, b.w]), clean.map((b) => [b.cy, b.w]));
});

test('a tank keeps its merged outline as the body, and never starts on the neckline', () => {
  const tank = { ...M, merged: true, torso_sep: 200, shoulder_sep: 300, shoulder: 25 };
  const b = boxesFor('tank', { front: tank, back: tank });
  const [x0, y0, , y1] = M.bbox;
  for (const x of b) assert.ok(x.cy - x.h / 2 >= y0 + 0.12 * (y1 - y0) - 0.01, x.label + ' starts below the neckline');
  assert.ok(Math.abs(b[0].w - 12 * (M.torso / 14.5)) < 0.01, 'sized from the measured torso, not torso_sep');
});

test('every placement override names a real placement key', () => {
  const ov = require('../tools/data/placement-overrides.json');
  const keys = new Set(['front', 'left_chest', 'right_chest', 'back', 'bodyIn', '_why']);
  for (const [sid, o] of Object.entries(ov)) {
    assert.match(sid, /^\d+$/, 'keyed by S&S style id');
    for (const k of Object.keys(o)) assert.ok(keys.has(k), sid + ': unknown key ' + k);
  }
});

test('a side with no photo keeps its stand-in stage instead of vanishing (#170 tote, #177 tee)', () => {
  const { keepUncovered } = require('../tools/lib/placements');
  const base = { front: { label: 'Front', image: 'products/bag_front.png' }, back: { label: 'Back', image: 'products/bag_back.png' } };
  /* Only the front was photographed: the back stays the drawing it was. */
  const st = keepUncovered(base, [{ key: 'front', side: 'front' }], { front: { label: 'Front', image: 'https://x/front.webp' } });
  assert.deepStrictEqual(Object.keys(st), ['front', 'back']);
  assert.strictEqual(st.back.image, 'products/bag_back.png');
  assert.notStrictEqual(st.back, base.back, 'a copy, not the shared object');
  /* A photographed back is not overwritten. */
  const both = keepUncovered(base, [{ key: 'front', side: 'front' }, { key: 'back', side: 'back' }],
    { front: { image: 'f' }, back: { image: 'b' } });
  assert.strictEqual(both.back.image, 'b');
  /* An open garment's front side is covered by its chest boxes, so no stray Front stage is added. */
  const open = keepUncovered(base, [{ key: 'front', side: 'front' }, { key: 'right_chest', side: 'front' }, { key: 'back', side: 'back' }],
    { front: { label: 'Left chest' }, right_chest: { label: 'Right chest' }, back: { label: 'Back' } });
  assert.deepStrictEqual(Object.keys(open), ['front', 'right_chest', 'back']);
});

test('the stand-in comes from a drawing, never from another colour\'s photo', () => {
  const { standins, keepUncovered } = require('../tools/lib/placements');
  /* A re-run: the product's back is the default colour's PHOTO; an old
     colourway still holds the drawing. */
  const stages = { front: { image: 'https://res.cloudinary.com/x/white-front.webp' }, back: { image: 'https://res.cloudinary.com/x/white-back.webp' } };
  const old = { variations: { 1: { stages: { back: { image: 'https://res.cloudinary.com/x/white-back.webp' } } }, 2: { stages: { back: { image: 'products/bag_back.png' } } } } };
  const s = standins(stages, old);
  assert.strictEqual(s.back.image, 'products/bag_back.png');
  assert.strictEqual(s.front, undefined, 'no drawing anywhere: nothing to keep');
  const st = keepUncovered(s, [{ key: 'front', side: 'front' }], { front: { image: 'https://res.cloudinary.com/x/navy-front.webp' } });
  assert.strictEqual(st.back.image, 'products/bag_back.png', 'navy gets the drawing, not white\'s photo');
  /* Photos only: the side is left off rather than borrowing a colour. */
  assert.deepStrictEqual(Object.keys(keepUncovered(standins(stages, {}), [{ key: 'front', side: 'front' }], { front: {} })), ['front']);
});

