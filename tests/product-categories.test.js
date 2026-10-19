'use strict';

/* The category list is how a customer finds anything.
 *
 * ssa-add-products writes a product but never a category row, so 57 live
 * products belonged to no category at all — a customer browsing "Hats & Caps"
 * saw four of the nine caps actually on sale.
 *
 * The Sustainable tab has a second trap. S&S's own `sustainableStyle` flag
 * covers 1,595 of 5,677 styles, plain Gildan and Bella included: filing on the
 * flag alone put 76 of 102 live products under "Sustainable", which tells a
 * customer who asked for sustainable options precisely nothing. The flag AND an
 * explicit claim in the style's own copy gives 31 — the set the shop can put in
 * writing.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { CLASSIFY } = require('../tools/lib/garments');

const src = fs.readFileSync(
  path.join(__dirname, '..', 'tools', 'categorise-products.js'), 'utf8');

test('membership needs an explicit claim, not just the supplier flag', () => {
  assert.match(src, /s\.sustainableStyle/, 'the supplier flag is not consulted');
  assert.match(src, /ECO_CLAIM/, 'nothing narrows the flag');
  const re = /const ECO_CLAIM = (\/.*\/i);/.exec(src);
  assert.ok(re, 'the claim test is not a readable regex');
  // eslint-disable-next-line no-eval
  const claim = eval(re[1]);
  for (const yes of ['100% organic cotton', 'made with recycled polyester',
    'hemp blend', 'sustainably sourced', 'REPREVE fibre', 'post-consumer content']) {
    assert.ok(claim.test(yes), 'should count as a claim: ' + yes);
  }
  for (const no of ['Heavy cotton tee', 'moisture wicking performance polo',
    'preshrunk jersey knit']) {
    assert.ok(!claim.test(no), 'should NOT count as a claim: ' + no);
  }
});

test('every garment class is either filed or knowingly left out', () => {
  /* Since the category tree (2026-10-19) every class has a home: jackets and
     vests went under Polos & Workwear. A plain product of each class must land
     in at least one tree category. */
  const { treeSlugs } = require('../tools/categorise-products');
  const { classify } = require('../tools/lib/garments');
  const sample = { cap: 'Richardson 112 Cap', bag: 'Q-Tees Q800 Tote', vest: 'Port Authority Vest', jacket: 'Port Authority Jacket',
    qzip: 'Gildan 18810 Quarter Zip', hoodie: 'Gildan 18500 Hooded Sweatshirt', polo: 'Sport-Tek Polo', woven: 'Red Kap Work Shirt',
    onesie: 'Rabbit Skins Infant Bodysuit', kids: 'Gildan Youth Tee', tank: 'Next Level Tank', longslv: 'Gildan Long Sleeve Tee', tee: 'Gildan Tee' };
  for (const [cls] of CLASSIFY) {
    assert.ok(sample[cls], 'no sample name for ' + cls);
    assert.strictEqual(classify(sample[cls]), cls, sample[cls]);
    assert.ok(treeSlugs(sample[cls]).length, cls + ' has nowhere to go — a product of this type would be unbrowsable');
  }
});

test('categories are resolved by slug, not by id', () => {
  /* Ids shift when the list is reordered in the admin; slugs do not. */
  assert.match(src, /bySlug/, 'category lookup is not slug-based');
  assert.ok(!/category_id\s*=\s*5[0-9]/.test(src), 'a category id is hardcoded');
});

test('a product is never filed into the same category twice', () => {
  assert.match(src, /existing\.has\(/, 'no guard against duplicate reference rows');
});
