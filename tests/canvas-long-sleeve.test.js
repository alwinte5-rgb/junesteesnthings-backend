/* A youth long sleeve must not open on the short-sleeve kids drawing
 * (2026-11-05: Gildan 5400B was staged as 'kids', so publish-staged would
 * have passed it). Run: node --test tests/canvas-long-sleeve.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const { canvasVerdict } = require('../tools/lib/canvas');

const enc = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o))).toString('base64');
const drawn = (name, file) => ({ name, stages: enc({ front: { url: `products/${file}_front.png` }, back: { url: `products/${file}_back.png` } }) });

test('a youth long sleeve on the kids drawing is refused', () => {
  const v = canvasVerdict(drawn('Gildan 5400B Youth Heavy Cotton Long Sleeve T-Shirt', 'kids_babies'));
  assert.strictEqual(v.verdict, 'bad');
  assert.match(v.art, /short sleeves on a long sleeve/);
});

test('a youth long sleeve on the long-sleeve drawing passes, and so does its real photo', () => {
  assert.notStrictEqual(canvasVerdict(drawn('Gildan 5400B Youth Heavy Cotton Long Sleeve T-Shirt', 'long_sleeve')).verdict, 'bad');
  const photo = { name: 'Gildan 5400B Youth Heavy Cotton Long Sleeve T-Shirt',
    stages: enc({ front: { url: 'kids_babies_front.png', image: 'https://c/f.webp' } }) };
  assert.strictEqual(canvasVerdict(photo).verdict, 'ok');
});

test('the rule leaves hoodies, crews and short sleeves alone', () => {
  assert.strictEqual(canvasVerdict(drawn('Gildan 5000 Heavy Cotton T-Shirt', 'basic_tshirt')).verdict, 'ok');
  assert.notStrictEqual(canvasVerdict(drawn('Gildan 18500 Heavy Blend Hooded Sweatshirt', 'hoodies_sweatshirt')).verdict, 'bad');
});

test('the youth long sleeve is staged with the long-sleeve drawing', () => {
  const row = require('../tools/data/ssa-longsleeve-2026-11').find((r) => r[0] === '5400B');
  assert.strictEqual(row[1], 'kidslong');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'tools', 'ssa-add-products.js'), 'utf8');
  assert.match(src, /kidslong: \{ raws: 'long_sleeve'/);
});

test('long-sleeve polos, work shirts and jackets on their own art are not refused', () => {
  for (const [n, a] of [['CORE365 CE108L Long Sleeve Pique Polo', 'polo_core365'], ['Red Kap SP5A Long Sleeve Work Shirt', 'premium']]) {
    assert.notStrictEqual(canvasVerdict(drawn(n, a)).verdict, 'bad', n);
  }
});

test('every youth long sleeve is staged on the long-sleeve drawing', () => {
  const rows = require('../tools/data/ssa-expansion-2026-10').concat(require('../tools/data/ssa-longsleeve-2026-11'));
  for (const r of rows.filter((x) => /long sleeve/i.test(x[3]) && ['kids', 'kidslong'].includes(x[1]))) assert.strictEqual(r[1], 'kidslong', r[3]);
  const sp = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'tools', 'product-art', 'standin-placements.js'), 'utf8');
  assert.match(sp, /isCrew\(name\) \|\| isShortDrawnLongSleeve\(name, cls\) \? 'long_sleeve'/, 'the stand-in fixer moves one onto the long-sleeve drawing');
});
