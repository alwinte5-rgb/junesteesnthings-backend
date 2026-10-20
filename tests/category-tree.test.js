'use strict';

/* The shop's category tree (owner, 2026-10-19): a product is filed under every
   leaf it matches and that leaf's group, so a group page lists all of its
   garments and a leaf page only its own. */
const { test } = require('node:test');
const assert = require('node:assert');
const { treeSlugs } = require('../tools/categorise-products');
const TREE = require('../tools/data/category-tree');

const f = (name) => treeSlugs(name).map((s) => s.replace(/^custom-/, ''));

test('a tee is filed under T-Shirts and each of its kinds', () => {
  assert.deepStrictEqual(f('Shaka Wear SHMHO Unisex Max Heavyweight Oversized Tee'), ['t-shirts', 'short-sleeve-tees', 'oversized-tees']);
  assert.deepStrictEqual(f('Shaka Wear SHGMT Unisex Garment-Dyed Muscle Tee'), ['t-shirts', 'tank-tops']);
  assert.deepStrictEqual(f('BELLA + CANVAS 3005 Unisex V-Neck Tee'), ['t-shirts', 'short-sleeve-tees', 'v-neck-tees']);
});

test('hoodies split by pullover, zip, crew and quarter-zip', () => {
  assert.deepStrictEqual(f('Gildan 18500 Heavy Blend Hooded Sweatshirt'), ['hoodies-sweatshirts', 'pullover-hoodies']);
  assert.deepStrictEqual(f('Port & Company PC78ZH Core Fleece Full-Zip Hooded Sweatshirt'), ['hoodies-sweatshirts', 'zip-hoodies']);
  assert.deepStrictEqual(f('Comfort Colors 1566 Unisex Garment-Dyed Crewneck Sweatshirt'), ['hoodies-sweatshirts', 'crewneck-sweatshirts']);
  assert.deepStrictEqual(f('Gildan 18810 Heavy Blend Quarter Zip'), ['hoodies-sweatshirts', 'quarter-zips']);
});

test('youth garments are under Kids & Baby too; babies are not "Youth"', () => {
  assert.deepStrictEqual(f('Gildan 18500B Youth Heavy Blend Hoodie'), ['hoodies-sweatshirts', 'pullover-hoodies', 'kids-youth-apparel', 'youth-apparel']);
  assert.deepStrictEqual(f('Rabbit Skins 4424 Infant Fine Jersey Bodysuit'), ['kids-youth-apparel', 'baby-onesies']);
});

test('hats split by kind, and every hat lands somewhere', () => {
  assert.deepStrictEqual(f('YP Classics 6606 Retro Trucker Cap'), ['hats-caps', 'trucker-hats']);
  assert.deepStrictEqual(f('YP Classics 1500KC Cuffed Beanie'), ['hats-caps', 'beanies']);
  assert.deepStrictEqual(f('Richardson 112 Snapback Cap'), ['hats-caps', 'caps']);
});

test('slugs are unique, and existing slugs keep their categories (old links keep working)', () => {
  const all = TREE.flatMap((g) => [g.slug, ...(g.leaves || []).map((l) => l.slug), ...(g.adopt || [])]);
  assert.strictEqual(new Set(all).size, all.length);
  for (const s of ['custom-t-shirts', 'custom-hoodies-sweatshirts', 'custom-tank-tops', 'custom-kids-youth-apparel',
    'custom-baby-onesies', 'custom-hats-caps', 'custom-tote-bags', 'custom-business-apparel']) assert.ok(all.includes(s), s);
});

/* Owner, 2026-10-20: "create a womens category". */
test("women's and ladies' cuts are under Women's too; girls' sizes are not", () => {
  assert.deepStrictEqual(f("Gildan 5000L Women's Heavy Cotton Tee"), ['t-shirts', 'short-sleeve-tees', 'womens-apparel', 'womens-tees']);
  assert.deepStrictEqual(f("Comfort Colors 1570L Women's Garment-Dyed Full-Zip Hoodie"), ['hoodies-sweatshirts', 'zip-hoodies', 'womens-apparel', 'womens-hoodies']);
  assert.deepStrictEqual(f("Sport-Tek LST350 Ladies' Competitor Tee"), ['t-shirts', 'short-sleeve-tees', 'womens-apparel', 'womens-tees']);
  assert.ok(!f("Gildan 5000B Youth Girls' Tee").includes('womens-apparel'));
  assert.ok(!f('Gildan 5000 Unisex Heavy Cotton Tee').includes('womens-apparel'));
});
