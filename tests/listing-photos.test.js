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
const { readDir, mismatch, ownPrintMismatch } = require('../tools/set-listing-photos');

test('files are read by their id prefix, with the style number as the check', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-'));
  for (const f of ['012-Gildan-5000-Unisex-Heavy-Cotton-Tee.webp', '091-Rabbit-Skins-RS4400-Infant-Bodysuit.png', 'notes.txt', 'x-foo.webp'])
    fs.writeFileSync(path.join(d, f), 'x');
  const got = readDir(d);
  assert.deepStrictEqual(got.map((g) => [g.id, g.styles, g.brand]), [[12, ['5000'], ['Gildan']], [91, ['RS4400'], ['Rabbit', 'Skins']]]);
});

test('a misnumbered file is refused rather than put on the wrong garment', () => {
  assert.strictEqual(mismatch('Gildan 5000 Unisex Heavy Cotton Tee', ['5000']), null);
  assert.strictEqual(mismatch('Bella+Canvas BC3001CVC — Unisex Heather CVC T-Shirt', ['BC3001CVC']), null);
  assert.match(mismatch('Gildan 5000L Women\'s Heavy Cotton Tee', ['5000']), /style 5000 is not in/, '5000 is not 5000L');
  assert.match(mismatch('Gildan 5000 Tee', []), /no style number/);
});

test('the brand must match too — style numbers repeat across brands', () => {
  assert.strictEqual(mismatch('Bella+Canvas 3001 Unisex Jersey Tee', ['3001'], ['Bella', 'Canvas']), null);
  assert.match(mismatch('Next Level 3001 Cotton Tee', ['3001'], ['Bella', 'Canvas']), /brand Bella Canvas is not in/);
});

test('own-print products match by their first word; only scene A is listed (sign launch, 2026-10-20)', () => {
  assert.strictEqual(ownPrintMismatch('Yard Signs', ['Yard', 'sign', 'front', 'lawn', 'A']), null);
  assert.strictEqual(ownPrintMismatch('Custom Size Vinyl Banner', ['Banner', 'on', 'event', 'fence']), null);
  assert.strictEqual(ownPrintMismatch('Big Head Cutout', ['Big', 'Head', 'Cutout']), null);
  assert.match(ownPrintMismatch('Yard Signs', ['Rigid', 'sign']), /"Rigid" is not in "Yard Signs"/);
  // a garment never takes a file with no style number, whatever its words
  assert.match(ownPrintMismatch('Gildan 5000 Heavy Cotton Tee', ['Gildan', 'tee']), /no style number/);
  const fs = require('fs'), os = require('os'), path = require('path');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-'));
  for (const f of ['197-Yard-sign-front-lawn-A.png', '197-Yard-sign-front-lawn-B.png', '196-Banner-on-event-fence.png']) fs.writeFileSync(path.join(d, f), '');
  const r = readDir(d);
  assert.deepStrictEqual(r.map((x) => [x.id, x.scene]), [[196, null], [197, 'A'], [197, 'B']]);
  fs.rmSync(d, { recursive: true });
});

test('letter-only style codes count as the style (Shaka Wear, Atlantis, LEGACY; 2026-10-27)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-'));
  for (const f of ['359-Shaka-Wear-SHGDH-Unisex-Los-Angeles-Garment-Dyed-Hoodie.webp', '166-Atlantis-FRASER-Sustainable-Dad-Hat.webp',
    '197-Yard-sign-front-lawn-A.webp']) fs.writeFileSync(path.join(d, f), 'x');
  const got = Object.fromEntries(readDir(d).map((g) => [g.id, g]));
  assert.deepStrictEqual([got[359].styles, got[359].brand], [['SHGDH'], ['Shaka', 'Wear']]);
  assert.deepStrictEqual([got[166].styles, got[166].brand], [['FRASER'], ['Atlantis']]);
  assert.deepStrictEqual(got[197].styles, [], 'a sign file still reads as own-print');
  assert.strictEqual(mismatch('Shaka Wear SHGDH Unisex Los Angeles Garment-Dyed Hoodie Sweatshirt', ['SHGDH'], ['Shaka', 'Wear']), null);
  assert.match(mismatch('Shaka Wear SHGDN Unisex Garment-Dyed Designer Tee', ['SHGDH'], ['Shaka', 'Wear']), /style SHGDH is not in/);
});
