'use strict';

/* The stand-in drawings are the reverse of a cut-out photo: the garment is
   translucent shading and everything around it opaque white. Measured as-is,
   the whole canvas reads as garment (torso 530 of 530, shoulder at 0) and
   every box lands in the wrong place, so the mask step is tested. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { MASK } = require('../tools/product-art/standin-placements');

const hasNumpy = spawnSync('python3', ['-c', 'import numpy, PIL']).status === 0;

test('a drawing is measured on its garment, not its white surround', { skip: !hasNumpy && 'needs numpy + Pillow' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standin-'));
  const art = path.join(dir, 'art.png'), mask = path.join(dir, 'art-front.webp');
  /* 200x240 white, with a translucent grey "garment" from (50,40) to (150,220). */
  const draw = `import sys\nfrom PIL import Image, ImageDraw\nim = Image.new('RGBA', (200, 240), (255, 255, 255, 255))\n` +
    `ImageDraw.Draw(im).rectangle([50, 40, 149, 219], fill=(90, 90, 90, 60))\nim.save(sys.argv[1])`;
  assert.strictEqual(spawnSync('python3', ['-c', draw, art]).status, 0);
  assert.strictEqual(spawnSync('python3', ['-c', MASK, art, mask]).status, 0);
  const r = spawnSync('python3', [path.join(__dirname, '..', 'tools', 'product-art', 'measure.py'), mask], { encoding: 'utf8' });
  const m = Object.values(JSON.parse(r.stdout))[0];
  assert.deepStrictEqual(m.bbox, [50, 40, 150, 220]);
  assert.strictEqual(m.torso, 100);
});

test('a muscle tee is a tank: no sleeves to draw or place around (#365)', () => {
  const { classify } = require('../tools/lib/garments');
  assert.strictEqual(classify('Shaka Wear SHGMT Unisex Garment-Dyed Muscle Tee'), 'tank');
  assert.strictEqual(classify('BELLA + CANVAS 3483 Jersey Muscle Tank'), 'tank');
  assert.strictEqual(classify('Shaka Wear SHMHSS Unisex Max Heavyweight Tee'), 'tee');
});

/* Owner, 2026-10-20: the Bayside 4025 crewneck opened as a hoodie and the
   Shaka Wear SHKTT youth tank as a tee. No crewneck drawing exists, so the
   long-sleeve crew stands in for it. */
test('a crewneck is drawn on the long-sleeve crew and a tank of any class on the tank', () => {
  const { drawingFor } = require('../tools/product-art/standin-placements');
  const { canvasVerdict } = require('../tools/lib/canvas');
  const { enjson } = require('../tools/lib/db');
  assert.strictEqual(drawingFor('hoodie', 'Bayside 4025 Unisex USA-Made Super Heavy Oversized Crewneck Sweatshirt'), 'long_sleeve');
  assert.strictEqual(drawingFor('hoodie', 'Gildan 18500 Unisex Heavy Blend Hooded Sweatshirt'), 'hoodies_sweatshirt');
  assert.strictEqual(drawingFor('kids', 'Shaka Wear SHKTT Youth Tank'), 'tank_tops');
  const on = (art) => enjson({ front: { url: 'products/' + art + '_front.png' }, back: { url: 'products/' + art + '_back.png' } });
  assert.strictEqual(canvasVerdict({ name: 'Shaka Wear SHGMC Unisex Max Heavy Garment-Dyed Crewneck', stages: on('long_sleeve') }).verdict, 'ok');
  assert.strictEqual(canvasVerdict({ name: 'Shaka Wear SHGMC Unisex Max Heavy Garment-Dyed Crewneck', stages: on('hoodies_sweatshirt') }).verdict, 'bad');
  assert.strictEqual(canvasVerdict({ name: 'Gildan 18500 Unisex Heavy Blend Hooded Sweatshirt', stages: on('long_sleeve') }).verdict, 'bad', 'a hoodie is not a crew');
});
