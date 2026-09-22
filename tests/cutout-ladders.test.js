'use strict';

/* The big head cutout ladders, priced through the real engine.
 *
 * A cutout has no blank and no separate decoration — the print IS the product
 * — so the per-piece ladder lives on the decoration METHOD, one per size, and
 * the product carries no price. Same shape as the 3in buttons.
 *
 * What makes these different from the buttons, and what these tests exist for:
 * the underlying COST is a sawtooth, because Signs365 sells a 48x96 sheet whole.
 * Ten 18" heads nest on one sheet at $7.70 each; the eleventh forces a second
 * sheet and the true cost per piece jumps back up. A ladder that rises as the
 * order grows is always wrong, so each band is the worst cost at any quantity
 * at or above it — the cheapest price that is both non-rising and never under
 * cost. That is why the 18" holds one number all the way to fifty instead of
 * dipping at ten and climbing back.
 *
 * Tiers are band CEILINGS, the opposite convention to BLANK_TIERS, which are
 * floors. Reading one as the other puts every band a step out.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const m = src.match(/function quotePricingSource\(\) \{\s*return `([\s\S]*?)`;\s*\}/);
const W = vm.runInThisContext('(function(){' + m[1] + ';return {priceLine:priceLine};})()');

const ladder = (bands) => ({
  positions: { front: Object.entries(bands).map(([q, p]) => ({ min_qty: Number(q), price: p })) },
});

const CUT = require('../tools/lib/cutouts');

/* Built from the SAME model the tool writes from, so a change to the cost
   inputs cannot leave the tool and this file disagreeing about the price. The
   exact money is still pinned below, against hand-checked figures. */
const L12 = ladder(CUT.ladderFor(12));
const L18 = ladder(CUT.ladderFor(18));
const L24 = ladder(CUT.ladderFor(24));
const L36 = ladder(CUT.ladderFor(36));
const ALL = [['12in', L12], ['18in', L18], ['24in', L24], ['36in', L36]];

const each = (method, qty) => Number(W.priceLine({
  qty, method, stage: 'front', blankTiers: [], product: { price: 0 }, addons: [],
}).decoration);

const costEach = (t, n) => CUT.costEach(t, n);

test('every ladder prices at every published quantity', () => {
  const want = {
    '12in': { 1: 23.65, 5: 23.65, 10: 16.55, 15: 11.45, 50: 8.25, 500: 6.25 },
    '18in': { 1: 30.35, 10: 29.15, 15: 23.15, 50: 19.30, 500: 16.85 },
    '24in': { 1: 155.15, 3: 52.50, 5: 35.40, 25: 25.80, 500: 20.70 },
    '36in': { 1: 155.15, 5: 67.15, 25: 56.60, 500: 52.70 },
  };
  for (const [name, L] of ALL) {
    for (const [q, p] of Object.entries(want[name])) {
      assert.strictEqual(each(L, Number(q)), p, name + ' at ' + q);
    }
  }
});

test('a ceiling applies UP TO its quantity, not from it', () => {
  /* The floor/ceiling trap, pinned. 15 pays the <=15 rate; 16 has fallen into
     the next band. Read as floors, every band would sit one step out. */
  assert.strictEqual(each(L12, 15), 11.45);
  assert.strictEqual(each(L12, 16), 10.50);
  assert.strictEqual(each(L24, 5), 35.40);
  assert.strictEqual(each(L24, 6), 31.95);
});

test('no ladder ever rises as the order grows', () => {
  for (const [name, L] of ALL) {
    let prev = Infinity;
    for (const q of [1, 2, 3, 4, 5, 9, 10, 11, 15, 16, 25, 26, 50, 51, 100, 250, 500, 1000, 5000]) {
      const p = each(L, q);
      assert.ok(p <= prev, name + ' rises at ' + q + ': ' + p + ' after ' + prev);
      prev = p;
    }
  }
});

test('no band is ever sold under what the material costs', () => {
  /* The sawtooth is the whole danger: a band must cover the worst cost at any
     quantity inside it, not the cost at its own ceiling. A 24" at 15 pieces
     needs two sheets, and pricing that band off the 8-piece cost would sell it
     under the foamcore. */
  for (const [name, L] of ALL) {
    const t = Number(name.replace('in', ''));
    for (let n = 1; n <= 1000; n++) {
      const sell = each(L, n);
      assert.ok(sell >= costEach(t, n) - 1e-9,
        name + ' at ' + n + ' sells at ' + sell.toFixed(2) + ' against cost ' + costEach(t, n).toFixed(2));
    }
  }
});

test('a bigger cutout is never cheaper than a smaller one', () => {
  for (const q of [1, 5, 10, 25, 50, 100, 500]) {
    let prev = 0;
    for (const [name, L] of ALL) {
      const p = each(L, q);
      assert.ok(p >= prev, 'at ' + q + ', ' + name + ' (' + p + ') undercuts the size below (' + prev + ')');
      prev = p;
    }
  }
});

test('the markup holds, so a reprice cannot quietly take a band under water', () => {
  for (const [name, L] of ALL) {
    const t = Number(name.replace('in', ''));
    for (const q of [1, 10, 50, 500]) {
      const margin = (each(L, q) - costEach(t, q)) / each(L, q);
      assert.ok(margin > 0.35, name + ' margin at ' + q + ' is ' + (margin * 100).toFixed(0) + '%');
    }
  }
});

test('above the largest band the largest band holds', () => {
  assert.strictEqual(each(L12, 5000), 6.10);
  assert.strictEqual(each(L36, 5000), 52.60);
});

test('shipping is an addon billed once, never inside a ladder', () => {
  /* Signs365 charges freight once an ORDER. Folded into four size ladders it
     would be billed once per SIZE, so a job with 12" and 24" cutouts on two
     lines would pay it twice. */
  const ship = src.match(/code: 'cutout_ship'[\s\S]*?\},/);
  assert.ok(ship, 'the weekday cutout shipping addon is gone');
  assert.match(ship[0], /kind: 'once'/, 'cutout shipping must not scale with quantity');
  assert.match(ship[0], /rate: 10\b/, 'the weekday rate moved');
  for (const code of ['cutout_ship_sat', 'cutout_ship_large']) {
    assert.ok(src.includes("code: '" + code + "'"), code + ' is missing');
  }
  const tool = fs.readFileSync(path.join(root, 'tools', 'add-cutouts.js'), 'utf8');
  assert.match(tool, /const L12 = ladderFor\(12\)/,
    'the ladders are hardcoded again rather than computed from the cost model');
  /* Shipping must not appear in the model that builds the ladders, or it is
     billed once per SIZE on a mixed job instead of once per order. */
  const model = fs.readFileSync(path.join(root, 'tools', 'lib', 'cutouts.js'), 'utf8');
  assert.ok(!/ship/i.test(model), 'shipping has leaked into the per-piece cost model');
});

test('a size with no in-house route is sold by the sheet, not withdrawn', () => {
  /* The 24" and 36" were retired on sight because a single one priced at $155.
     The price was right and the framing was wrong: a 24" head is 22" across, does
     not fit a 20x30 board, and has no in-house route at any quantity — the first
     one buys a whole sheet. Sold by the sheet it is $35.40. The minimum is the
     fix; withdrawing the size threw away a sellable product. */
  assert.strictEqual(CUT.fitsBoard(12), true, 'a 12in fits a 20x30 board');
  assert.strictEqual(CUT.fitsBoard(24), false, 'a 24in is 22in across — it cannot');
  assert.strictEqual(CUT.minimumFor(12), 1, 'a size with a board route needs no minimum');
  assert.strictEqual(CUT.minimumFor(24), 8, 'a 24in comes eight to a sheet');
  assert.strictEqual(CUT.minimumFor(36), 3, 'a 36in comes three to a sheet');

  const tool = fs.readFileSync(path.join(root, 'tools', 'add-cutouts.js'), 'utf8');
  assert.match(tool, /min: minimumFor\(24\)/, 'the minimum is retyped rather than derived');
  assert.match(tool, /min_qty: minQty/, 'the minimum never reaches the engine');
  /* `offered` must still be honoured on write, so a size deliberately switched
     off cannot be resurrected by a re-run. */
  assert.match(tool, /\(m\.offered \? ', active=1' : ''\)/, 'the update path ignores offered');
});

test('labour is in the price, and one number controls it', () => {
  /* The first ladders were written without labour and sold a single 12" at a
     1% margin — $12.00 against $11.82 of board, vinyl and ten minutes. */
  assert.strictEqual(CUT.SHOP_RATE, 35, 'the shop rate moved');
  assert.ok(CUT.MINUTES_PER_HEAD > 0, 'labour has been zeroed out');
  const withLabour = CUT.costEach(12, 1);
  const bare = (CUT.sqftOf(12) * CUT.VINYL_SQFT * CUT.LAMINATE_AND_CUT) + CUT.BOARD;
  assert.ok(withLabour > bare, 'a single in-house head costs no labour at all');
  assert.ok(Math.abs(withLabour - (bare + CUT.labour(CUT.MINUTES_PER_HEAD))) < 1e-9,
    'the in-house route is not carrying exactly one head of labour');
});
