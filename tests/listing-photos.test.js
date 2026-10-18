/* Owner's branded listing photos (2026-10-18): files named by product id go
 * onto that product's thumbnail_url — never onto a different garment.
 *
 * Run: node --test tests/listing-photos.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readDir, mismatch } = require('../tools/set-listing-photos');

test('files are read by their id prefix, with the style number as the check', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-'));
  for (const f of ['012-Gildan-5000-Unisex-Heavy-Cotton-Tee.webp', '091-Rabbit-Skins-RS4400-Infant-Bodysuit.png', 'notes.txt', 'x-foo.webp'])
    fs.writeFileSync(path.join(d, f), 'x');
  const got = readDir(d);
  assert.deepStrictEqual(got.map((g) => [g.id, g.styles]), [[12, ['5000']], [91, ['RS4400']]]);
});

test('a misnumbered file is refused rather than put on the wrong garment', () => {
  assert.strictEqual(mismatch('Gildan 5000 Unisex Heavy Cotton Tee', ['5000']), null);
  assert.strictEqual(mismatch('Bella+Canvas BC3001CVC — Unisex Heather CVC T-Shirt', ['BC3001CVC']), null);
  assert.match(mismatch('Gildan 5000L Women\'s Heavy Cotton Tee', ['5000']), /style 5000 is not in/, '5000 is not 5000L');
  assert.match(mismatch('Gildan 5000 Tee', []), /no style number/);
});
