'use strict';

/* The 3" button ladders, priced through the real engine.
 *
 * A button does not fit the model the rest of the system assumes. Every other
 * line is `blank + decoration x qty`: a garment you buy and printing you put on
 * it. A button has no blank and no separate decoration — the print IS the
 * product — so the per-piece ladder lives on the decoration METHOD, and the
 * product carries no price.
 *
 * Tiers here are band CEILINGS, the opposite convention to BLANK_TIERS, which
 * are floors. Reading one as the other puts every band a step out, which is the
 * single easiest mistake in this system to make and the reason this file
 * asserts exact money at exact quantities.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const m = src.match(/function quotePricingSource\(\) \{\s*return `([\s\S]*?)`;\s*\}/);
const W = vm.runInThisContext('(function(){' + m[1] + ';return {priceLine:priceLine};})()');

/* The ladders as tools/add-buttons.js writes them, in the shape the catalogue
   feed publishes: a list of bands, each with the ceiling it applies up to. */
const ladder = (bands) => ({
  positions: { front: Object.entries(bands).map(([q, p]) => ({ min_qty: Number(q), price: p })) },
});

const PERSONALISED = ladder({ 1: '6.00', 5: '5.50', 15: '4.50', 25: '4.00', 50: '3.50',
  75: '3.25', 100: '3.00', 150: '2.85', 1000: '2.75' });
const ONE_DESIGN = ladder({ 1: '3.00', 5: '2.75', 15: '2.50', 25: '2.00', 50: '1.50',
  75: '1.25', 100: '1.10', 150: '1.00', 200: '0.95', 499: '0.85', 1000: '0.80' });

const each = (method, qty) => Number(W.priceLine({
  qty, method, stage: 'front', blankTiers: [], product: { price: 0 }, addons: [],
}).decoration);

test('personalised prices at every published quantity', () => {
  const want = { 1: 6.00, 5: 5.50, 15: 4.50, 25: 4.00, 50: 3.50, 75: 3.25, 100: 3.00, 150: 2.85, 200: 2.75 };
  for (const [q, p] of Object.entries(want)) assert.strictEqual(each(PERSONALISED, Number(q)), p, 'at ' + q);
});

test('one design prices at every published quantity', () => {
  const want = { 1: 3.00, 5: 2.75, 15: 2.50, 25: 2.00, 50: 1.50, 75: 1.25, 100: 1.10, 150: 1.00, 200: 0.95, 500: 0.80 };
  for (const [q, p] of Object.entries(want)) assert.strictEqual(each(ONE_DESIGN, Number(q)), p, 'at ' + q);
});

test('a ceiling applies UP TO its quantity, not from it', () => {
  /* The floor/ceiling trap, pinned. 5 pays the <=5 rate; 6 has fallen into the
     next band. Read as floors, 6 would still pay the 5 rate and every band
     would sit one step out. */
  assert.strictEqual(each(ONE_DESIGN, 5), 2.75);
  assert.strictEqual(each(ONE_DESIGN, 6), 2.50);
  assert.strictEqual(each(ONE_DESIGN, 15), 2.50);
  assert.strictEqual(each(ONE_DESIGN, 16), 2.00);
});

test('neither ladder ever rises as the order grows', () => {
  for (const [name, L] of [['personalised', PERSONALISED], ['one design', ONE_DESIGN]]) {
    let prev = Infinity;
    for (const q of [1, 2, 5, 6, 15, 16, 25, 26, 50, 51, 75, 100, 150, 200, 300, 500, 1000, 5000]) {
      const p = each(L, q);
      assert.ok(p <= prev, name + ' rises at ' + q + ': ' + p + ' after ' + prev);
      prev = p;
    }
  }
});

test('personalised is dearer than one design at every quantity', () => {
  /* Every button its own setup. If these ever crossed, the harder job would be
     the cheaper one. */
  for (const q of [1, 5, 25, 50, 100, 200, 500]) {
    assert.ok(each(PERSONALISED, q) > each(ONE_DESIGN, q), 'they cross at ' + q);
  }
});

test('above the largest band the largest band holds', () => {
  assert.strictEqual(each(PERSONALISED, 5000), 2.75);
  assert.strictEqual(each(ONE_DESIGN, 5000), 0.80);
});

test('the margin holds where the work is done in house', () => {
  /* $0.35 of parts. The in-house tiers are the ones worth taking; the point of
     checking is that a later reprice cannot quietly take them under water. */
  const PARTS = 0.35;
  for (const q of [1, 5, 15, 25, 50]) {
    const margin = (each(PERSONALISED, q) - PARTS) / each(PERSONALISED, q);
    assert.ok(margin > 0.85, 'personalised margin at ' + q + ' is ' + (margin * 100).toFixed(0) + '%');
  }
  for (const q of [1, 5, 15, 25]) {
    assert.ok((each(ONE_DESIGN, q) - PARTS) / each(ONE_DESIGN, q) > 0.80, 'one design at ' + q);
  }
});
