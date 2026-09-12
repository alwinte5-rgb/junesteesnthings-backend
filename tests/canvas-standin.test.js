'use strict';

/* A beanie drawn as a baseball cap used to pass the canvas audit.
 *
 * classify() calls every piece of headwear a 'cap', which is right for pricing
 * and decoration — they share a print area and a decoration list. The audit
 * then asked only "is this drawn on cap art?", and the answer was always yes,
 * because the designer owns exactly one headwear image. So a cuffed beanie, a
 * visor and a mesh-back trucker each reported CORRECT while being drawn as a
 * structured six-panel cap. Same for a vest, drawn with sleeves.
 *
 * The shop found this before the audit did, which is the actual defect.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { classify, subtype, standin } = require('../tools/lib/garments');

test('headwear stays one class for pricing', () => {
  for (const n of ['YP Classics 1500KC Cuffed Beanie', 'econscious EC7070 Eco Trucker Cap',
    'Valucap VC500 Bio-Washed Visor', 'Atlantis GEO Sustainable Bucket Hat']) {
    assert.strictEqual(classify(n), 'cap', n + ' should price as headwear');
  }
});

test('but the cut is reported separately', () => {
  const cases = {
    'YP Classics 1500KC Cuffed Beanie': 'beanie',
    'econscious EC7070 Eco Trucker Cap': 'trucker',
    'Valucap VC500 Bio-Washed Visor': 'visor',
    'Atlantis GEO Sustainable Bucket Hat': 'bucket',
    'Valucap VC300A Bio-Washed Dad Hat': 'dad-hat',
    'econscious EC7090 Hemp Structured Baseball Cap': 'cap-structured',
    'Independent Trading 29L Day Tripper Duffel': 'duffel',
    'Liberty Bags 8881 Drawstring Pack': 'drawstring',
  };
  for (const [name, want] of Object.entries(cases)) {
    assert.strictEqual(subtype(name), want, name);
  }
});

test('a garment with art of its own is not flagged', () => {
  /* hat.png IS an unstructured curved-bill dad hat, so a dad hat is the one
     piece of headwear that is drawn correctly. Written from the file rather
     than from the product name, which had this exactly backwards. */
  for (const n of ['Gildan 5000 Unisex Heavy Cotton Tee',
    'Bella+Canvas 3001 Unisex Jersey Tee', 'Liberty Bags 8502 Cotton Tote Bag',
    'Valucap VC300A Bio-Washed Dad Hat', 'Atlantis FRASER Sustainable Dad Hat']) {
    assert.strictEqual(standin(n), null, n + ' has its own art and must pass clean');
  }
});

test('every borrowed shape says what it actually looks like', () => {
  for (const n of ['YP Classics 1500KC Cuffed Beanie', 'econscious EC7070 Eco Trucker Cap',
    "CORE365 CE702 Men's Prevail Packable Puffer Vest", 'Gildan 18810 Heavy Blend Quarter-Zip',
    'Dickies 2574 Men\'s Short Sleeve Work Shirt']) {
    const s = standin(n);
    assert.ok(s, n + ' borrows art but reports nothing');
    /* The point of the string is that somebody reading the report can picture
       the wrongness without opening the editor. */
    assert.ok(s.looks && s.looks.length > 8, n + ' says nothing useful about the shape');
  }
});

test('the subtype answer wins over the family answer', () => {
  /* A trucker is a cap and caps borrow nothing as a class — the borrow is the
     mesh back. Reading the class first would have reported no problem. */
  const s = standin('Richardson 112RE Sustainable Trucker Cap');
  assert.strictEqual(s.as, 'trucker');
  assert.match(s.looks, /mesh/i);
  /* A cap whose name only says "Mesh" is still a mesh-back trucker. */
  assert.strictEqual(standin('Flexfit 110R Recycled Mesh Cap').as, 'trucker');
});

test('one size list, shared, that knows caps and totes exist', () => {
  const { CORE_SIZES } = require('../tools/lib/garments');
  /* ssa-sync's private copy was ['S','M','L','XL'], so a cap — sized
     "Adjustable" — matched nothing and reported NONE LOCAL while thousands sat
     in Lockport. ssa-add-products already knew better, one file away. */
  for (const s of ['S', 'M', 'L', 'XL', 'OSFA', 'One Size', 'Adjustable', 'YS', '2T']) {
    assert.ok(CORE_SIZES.includes(s), s + ' is missing from the costing sizes');
  }
  const fs2 = require('node:fs');
  const p2 = require('node:path');
  for (const f of ['ssa-sync.js', 'ssa-add-products.js']) {
    const src = fs2.readFileSync(p2.join(__dirname, '..', 'tools', f), 'utf8');
    assert.match(src, /CORE_SIZES\s*\}\s*=\s*require\('\.\/lib\/garments'\)/,
      f + ' does not share the size list');
    assert.ok(!/const CORE_SIZES\s*=\s*\[/.test(src), f + ' still has its own copy');
  }
});
