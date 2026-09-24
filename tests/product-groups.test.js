'use strict';

/* The product dropdown is grouped by what the thing IS.
 *
 * It was one flat run of 112 rows, so finding a hoodie meant scrolling past
 * every cap in the catalogue. The grouping matches on the supplier's own
 * product name, because the catalogue carries no category field — which makes
 * the ORDER of the rules load-bearing, not cosmetic.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const GROUPS = vm.runInThisContext(
  '(' + src.match(/const PRODUCT_GROUPS = (\[[\s\S]*?\n\]);/)[1] + ')');
const groupOf = (name) => {
  for (const [label, re] of GROUPS) if (re.test(String(name || ''))) return label;
  return 'Everything else';
};

test('a brand name is not a category', () => {
  /* "canvas" swept the entire Bella+Canvas range and every canvas tote into
     Signs — thirteen shirts filed under signage — because a brand and a
     material share a word. */
  assert.equal(groupOf('Bella+Canvas 3001 Unisex Jersey Tee'), 'T-Shirts');
  assert.equal(groupOf('Bella+Canvas 3484 — Unisex Triblend Tank'), 'Tanks');
  assert.equal(groupOf('Bella+Canvas 3719 Unisex Sponge Fleece Hoodie'), 'Hoodies & Sweatshirts');
  assert.equal(groupOf('Liberty Bags 8861R — Recycled Canvas Tote'), 'Bags & Totes');
  assert.equal(groupOf('Q-Tees S800 Sustainable Canvas Tote Bag'), 'Bags & Totes');
  /* And the actual canvas product still lands in signage, via "acrylic". */
  assert.equal(groupOf('Acrylic & Canvas'), 'Signs, Print & Décor');
});

test('the zip decides, so quarter-zips are asked about before sweatshirts', () => {
  assert.equal(groupOf('C2 Sport 5102 Men\'s Quarter-Zip Pullover'), 'Quarter-Zips');
  assert.equal(groupOf('Harriton M421 Pilbloc Quarter-Zip Pullover'), 'Quarter-Zips');
  /* No zip in the name: a pullover is a sweatshirt. */
  assert.equal(groupOf('Independent Trading IND5000P Legend Pullover'), 'Hoodies & Sweatshirts');
});

test('a long-sleeve woven shirt is a shirt, not a long sleeve tee', () => {
  assert.equal(groupOf('Harriton M500 — Easy Blend Long-Sleeve Twill Shirt'), 'Woven Shirts');
  assert.equal(groupOf('Bella+Canvas BC3501 — Unisex Jersey Long-Sleeve T-Shirt'), 'Long Sleeve');
});

test('infant and youth win over the garment type', () => {
  assert.equal(groupOf('Rabbit Skins 4424 Infant Fine Jersey Bodysuit'), 'Youth, Toddler & Infant');
  assert.equal(groupOf('Bella+Canvas BC3001Y — Youth Short-Sleeve Jersey T-Shirt'), 'Youth, Toddler & Infant');
  assert.equal(groupOf('Bella+Canvas 3001T — Toddler Jersey Tee'), 'Youth, Toddler & Infant');
});

test('every signage product reaches signage, and nothing else does', () => {
  for (const n of ['Vinyl Banners', 'Posters & Prints', 'Window & Wall Graphics',
                   'Vehicle Magnets', 'Business Cards & Flyers', 'Big Head Cutouts',
                   'Full Body Cutouts', 'Acrylic & Canvas']) {
    assert.equal(groupOf(n), 'Signs, Print & Décor', n + ' left the signage group');
  }
});

test('anything unmatched still gets a home', () => {
  assert.equal(groupOf('3in Buttons'), 'Everything else');
  assert.equal(groupOf(''), 'Everything else');
  assert.equal(groupOf(null), 'Everything else');
  assert.equal(groupOf('Something Nobody Has Sold Before'), 'Everything else');
});

test('the dropdown renders optgroups and skips empty ones', () => {
  assert.match(src, /<optgroup label="/, 'the product list is not grouped');
  const fn = src.slice(src.indexOf('const prodOpts = (sel) =>'));
  assert.match(fn.slice(0, 900), /filter\(\(\[, list\]\) => list\.length\)/,
    'an empty group would render as a heading with nothing under it');
});
