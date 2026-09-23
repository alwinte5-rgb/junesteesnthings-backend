'use strict';

/* The pack-vs-singles comparison has to price the pack quantity at the band
 * that actually applies to it.
 *
 * Decoration bands are CEILINGS: `<=32 $12` means 32 cutouts cost $12 each,
 * and the `<=1000 $8` row below it does not start until 33. The first build of
 * the public price page reached for the LAST band instead of looking one up,
 * and published "a full sheet of 32 is $212 — $256 at the single price". $256
 * is 32 x the 33-or-more rate: a price nobody can buy 32 at. The true
 * comparison is 32 x $12 = $384, so the page understated the saving by $128
 * and quoted a single price that does not exist.
 *
 * Reading a ceiling table as anything else is the recurring bug in this repo
 * (AGENTS.md has two lessons about it), so the lookup is pinned here.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'tools/build-cutout-page.js'), 'utf8');

/* Anchored on the declaration, which survives the bug being reintroduced. */
function priceAt() {
  const m = src.match(/const priceAt = \(m, qty\) => \{[\s\S]*?\n\};/);
  assert.ok(m, 'priceAt not found in tools/build-cutout-page.js');
  return vm.runInThisContext('(' + m[0].replace(/^const priceAt = /, '').replace(/;$/, '') + ')');
}

/* The live 12in and 18in singles ladders, as lumise_printings holds them. */
const twelve = { bands: [{ upTo: 6, price: 24 }, { upTo: 12, price: 18 }, { upTo: 32, price: 12 }, { upTo: 1000, price: 8 }] };
const eighteen = { bands: [{ upTo: 5, price: 31 }, { upTo: 10, price: 28 }, { upTo: 20, price: 25 }, { upTo: 50, price: 20 }, { upTo: 1000, price: 17 }] };

test('a quantity sitting exactly on a ceiling takes THAT band, not the one below', () => {
  const at = priceAt();
  assert.equal(at(twelve, 32), 12, '32 is the ceiling of the $12 band — the $8 band starts at 33');
  assert.equal(at(twelve, 33), 8);
  assert.equal(at(eighteen, 10), 28, '10 is the ceiling of the $28 band');
  assert.equal(at(eighteen, 11), 25);
});

test('the pack comparison is the pack quantity at its own band', () => {
  const at = priceAt();
  /* 32 to a sheet at $212, against buying 32 singles. */
  assert.equal(at(twelve, 32) * 32, 384, 'a sheet of 32 is $212 against $384, not $256');
  /* 10 to a sheet at $186, against buying 10 singles. */
  assert.equal(at(eighteen, 10) * 10, 280, 'a sheet of 10 is $186 against $280, not $170');
});

test('the pack always wins the comparison, or the page is arguing against itself', () => {
  const at = priceAt();
  assert.ok(at(twelve, 32) * 32 > 212, 'the 12in pack must beat 32 singles');
  assert.ok(at(eighteen, 10) * 10 > 186, 'the 18in pack must beat 10 singles');
});

test('the first band covers everything below its ceiling', () => {
  const at = priceAt();
  assert.equal(at(twelve, 1), 24);
  assert.equal(at(twelve, 6), 24);
  assert.equal(at(twelve, 7), 18);
});

test('a quantity past the top band still prices, at the bottom rate', () => {
  const at = priceAt();
  assert.equal(at(twelve, 5000), 8, 'never undefined — a missing price reads as free');
});
