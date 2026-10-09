'use strict';

/* Big Head Cutouts in the designer (2026-10-08). The product had no design area
 * and no methods, so it opened blank and the admin list's DTF default priced a
 * cutout as a shirt print. It must list exactly the cutout methods on sale. */

const test = require('node:test');
const assert = require('node:assert');
const { cutoutPrintings, cutoutStages } = require('../tools/lib/cutouts');

const rows = [
  { id: '1', title: 'DTF Printing', active: '1' },
  { id: '29', title: 'Big Head Cutout — 12in, 32-pack (full sheet)', active: '1' },
  { id: '32', title: 'Big Head Cutout — 36in, 3-pack (full sheet)', active: '0' },
  { id: '62', title: 'Big Head Cutout — 12in, 16-pack (half sheet)', active: '1' },
  { id: '35', title: 'Full Body Cutout — single-sided', active: '1' },
];

test('only cutout methods that are on sale, in the storefront shape', () => {
  const enc = cutoutPrintings(rows);
  assert.deepStrictEqual(JSON.parse(decodeURIComponent(enc)), { _29: 'A3', _62: 'A3' });
});

test('nothing on sale means no value, so the tool refuses rather than writes empty', () => {
  assert.strictEqual(cutoutPrintings(rows.filter((r) => r.id === '1')), '');
});

test('one white board to design on', () => {
  const s = cutoutStages();
  assert.deepStrictEqual(Object.keys(s), ['front']);
  assert.match(s.front.url, /jt-banner-backdrop\.png$/);
});
