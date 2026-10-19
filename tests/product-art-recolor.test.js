'use strict';

/* Which colourways recolor.js makes, and from which photo.
 *
 * Every made image costs an OpenAI call and an owner review, and a wrong
 * source shows in the result: a recolour inherits the photo's texture, so a
 * plaid or two-tone source invents a pattern S&S never sold. Nothing in a
 * successful run reports that, so the choice is tested rather than watched.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { plan } = require('../tools/product-art/recolor');

function productDir(colours, photographed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recolor-'));
  fs.writeFileSync(path.join(dir, 'colours.json'), JSON.stringify(colours));
  for (const f of photographed) fs.writeFileSync(path.join(dir, f + '.webp'), '');
  return dir;
}

test('a missing colour is made from the nearest photographed one, on the sides that photo has', () => {
  const dir = productDir(
    [{ name: 'Navy', c1: '#263147' }, { name: 'Red', c1: '#C0272D' }, { name: 'Royal', c1: '#224D8F' }],
    ['navy-front', 'navy-back', 'red-front', 'red-back'],
  );
  const p = plan(dir);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].c.name, 'Royal');
  assert.strictEqual(p[0].src.name, 'Navy');
  assert.deepStrictEqual(p[0].sides, ['front', 'back']);
});

test('a pattern or two-colour colourway is never made and never a source', () => {
  const dir = productDir(
    [
      { name: 'Red Buffalo Plaid', c1: '#C0272D' },
      { name: 'Maroon', c1: '#5B2B42' },
      { name: 'Varsity Maroon/ Oxford', c1: '#5B2B42' },
      { name: 'Black/ White', c1: '#000000', c2: '#FFFFFF' },
      { name: 'Cardinal', c1: '#BF2F38' },
    ],
    ['red-buffalo-plaid-front', 'maroon-front'],
  );
  const byName = Object.fromEntries(plan(dir).map((x) => [x.c.name, x]));
  assert.ok(byName['Varsity Maroon/ Oxford'].skip);
  assert.ok(byName['Black/ White'].skip);
  /* The plaid is the nearer hex, but the plain photo is the one used. */
  assert.strictEqual(byName.Cardinal.src.name, 'Maroon');
});

test('a colour with no swatch hex is reported, not guessed', () => {
  const dir = productDir([{ name: 'Navy', c1: '#263147' }, { name: 'Mystery' }], ['navy-front']);
  const [p] = plan(dir);
  assert.strictEqual(p.c.name, 'Mystery');
  assert.match(p.skip, /no swatch/);
});

/* Front and back are separate edits and came back up to 32 apart. MATCH moves
   the side farther from the swatch onto the other; a near-zero channel (Fan
   Marine Green, #003A40) once divided by zero and wrote garbage pixels. */
const { spawnSync } = require('child_process');
const { py, MATCH, SIDE_GAP } = require('../tools/product-art/recolor');
const hasNumpy = spawnSync('python3', ['-c', 'import numpy, PIL']).status === 0;

function swatchPng(dir, name, rgb) {
  const p = path.join(dir, name);
  py(`import sys\nfrom PIL import Image\nImage.new('RGBA', (40, 40), tuple(int(v) for v in sys.argv[2:5]) + (255,)).save(sys.argv[1])`,
    [p, ...rgb.map(String)]);
  return p;
}
const pixel = (p) => py(`import sys\nfrom PIL import Image\nprint(*Image.open(sys.argv[1]).getpixel((20, 20))[:3])`, [p]).split(' ').map(Number);

test('the side farther from the swatch is matched to the other, even with a zero channel', { skip: !hasNumpy && 'needs numpy + Pillow' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recolor-match-'));
  const front = swatchPng(dir, 'f.png', [0, 38, 41]), back = swatchPng(dir, 'b.png', [23, 53, 53]);
  const gap = Number(py(MATCH, [front, back, '#003A40', String(SIDE_GAP)]));
  assert.ok(gap > SIDE_GAP);
  /* Back is nearer #003A40, so the back is kept and the front moves onto it. */
  assert.deepStrictEqual(pixel(back), [23, 53, 53]);
  assert.deepStrictEqual(pixel(front), [23, 53, 53]);
  /* Already matched: nothing changes. */
  assert.strictEqual(py(MATCH, [front, back, '#003A40', String(SIDE_GAP)]), '0');
});
