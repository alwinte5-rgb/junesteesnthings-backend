'use strict';

/* Big head cutouts: the pack price, the singles ladder, and the line between.
 *
 * A cutout has no blank and no separate decoration — the print IS the product —
 * so the price lives on the decoration METHOD and the product carries none.
 * Same shape as the 3in buttons. What is different here is that there are two
 * ways to buy, priced by different arithmetic, and the tests exist to keep them
 * from drifting into each other.
 *
 * A PACK IS ONE SHEET. Its cost is the sheet plus a minute of handling a head,
 * and it does not move whether one pack is ordered or forty, because the pack
 * is the unit the supplier actually sells and nothing is wasted. So a pack
 * ladder is FLAT — one number at every quantity. That is the whole reason packs
 * were introduced: per-piece pricing here cannot be stable.
 *
 * A SINGLE is per piece, and per-piece cost is a SAWTOOTH, because a sheet is
 * still bought whole underneath: the eleventh 18" head forces a second sheet
 * and the cost per piece jumps back up. Every band therefore has to cover the
 * worst quantity inside it. That is why those numbers are uneven, and why a
 * band can never be read off the cost at its own ceiling.
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
const CUT = require('../tools/lib/cutouts');

const ladder = (bands) => ({
  positions: { front: Object.entries(bands).map(([q, p]) => ({ min_qty: Number(q), price: p })) },
});
const each = (method, qty) => Number(W.priceLine({
  qty, method, stage: 'front', blankTiers: [], product: { price: 0 }, addons: [],
}).decoration);

/* Exactly as tools/add-cutouts.js writes them. */
const SINGLES = {
  12: { 6: '24.00', 12: '18.00', 32: '12.00', 1000: '8.00' },
  18: { 5: '31.00', 10: '28.00', 20: '25.00', 50: '20.00', 1000: '17.00' },
};
const S12 = ladder(SINGLES[12]);
const S18 = ladder(SINGLES[18]);
const PACKS = [12, 18, 24, 36].map((t) => [t, ladder({ 1000: CUT.packPrice(t).toFixed(2) })]);

/* ── Packs ─────────────────────────────────────────────────────────────── */

test('the production cost of a pack does not move with the order size', () => {
  /* The property the whole pack idea rests on: a pack is a whole sheet, so
     nothing is wasted and the per-piece cost is identical at one pack or forty.
     If this stops holding, the flat ladder is wrong and packs need bands.

     Freight is deliberately NOT part of this. It is charged once an ORDER but
     sits inside each pack price, so a four-pack order carries it four times in
     revenue and once in cost. That is margin on a bigger order, not a second
     charge to the customer, and it is why this compares the production half
     rather than packCost. */
  for (const t of [12, 18, 24, 36]) {
    const production = CUT.packCost(t) - CUT.SHIPPING_WEEKDAY;
    for (const packs of [2, 3, 10, 40]) {
      const n = CUT.packSizeFor(t) * packs;
      assert.ok(Math.abs(CUT.costEach(t, n) * n - production * packs) < 1e-6,
        t + 'in: ' + packs + ' packs is not ' + packs + 'x one sheet');
    }
  }
  /* And the freight really is in the price exactly once per pack. */
  assert.ok(CUT.packCost(24) > CUT.SHEET, 'the pack has stopped carrying freight');
});

test('a pack prices flat at every quantity, and clears 50%', () => {
  for (const [t, L] of PACKS) {
    const price = CUT.packPrice(t);
    for (const q of [1, 2, 5, 25, 100, 999]) {
      assert.strictEqual(each(L, q), price, t + 'in pack moved at ' + q);
    }
    const margin = (price - CUT.packCost(t)) / price;
    assert.ok(margin >= 0.5, t + 'in pack margin is ' + (margin * 100).toFixed(1) + '%');
  }
});

test('a pack is exactly one sheet, so nothing is wasted', () => {
  for (const t of [12, 18, 24, 36]) {
    assert.strictEqual(CUT.packSizeFor(t), CUT.PER_SHEET[t], t + 'in pack is not a whole sheet');
  }
  assert.deepStrictEqual([12, 18, 24, 36].map(CUT.packSizeFor), [32, 10, 8, 3]);
  assert.deepStrictEqual([12, 18, 24, 36].map(CUT.packPrice), [212, 186, 184, 178]);
});

test('a pack always beats the same heads bought as singles', () => {
  /* If a pack were ever the dearer way to buy a sheet's worth, the upsell the
     flyer is built on would be a lie. */
  for (const t of [12, 18]) {
    const n = CUT.packSizeFor(t);
    const asSingles = each(t === 12 ? S12 : S18, n) * n;
    assert.ok(CUT.packPrice(t) < asSingles,
      t + 'in: pack $' + CUT.packPrice(t) + ' vs ' + n + ' singles $' + asSingles.toFixed(2));
  }
});

/* ── Singles ───────────────────────────────────────────────────────────── */

test('singles price at every published band', () => {
  const want = {
    12: { 1: 24, 6: 24, 7: 18, 12: 18, 13: 12, 32: 12, 33: 8 },
    18: { 1: 31, 5: 31, 6: 28, 10: 28, 11: 25, 20: 25, 21: 20, 50: 20, 51: 17 },
  };
  for (const [t, cases] of Object.entries(want)) {
    const L = t === '12' ? S12 : S18;
    for (const [q, p] of Object.entries(cases)) {
      assert.strictEqual(each(L, Number(q)), p, t + 'in at ' + q);
    }
  }
});

test('a ceiling applies UP TO its quantity, not from it', () => {
  /* The floor/ceiling trap. 6 pays the <=6 rate; 7 has fallen into the next
     band. Read as floors, every band would sit one step out. */
  assert.strictEqual(each(S12, 6), 24);
  assert.strictEqual(each(S12, 7), 18);
  assert.strictEqual(each(S18, 5), 31);
  assert.strictEqual(each(S18, 6), 28);
});

test('no singles ladder ever rises as the order grows', () => {
  for (const [name, L] of [['12in', S12], ['18in', S18]]) {
    let prev = Infinity;
    for (const q of [1, 5, 6, 7, 11, 12, 13, 20, 21, 32, 33, 50, 51, 100, 500, 1000, 5000]) {
      const p = each(L, q);
      assert.ok(p <= prev, name + ' rises at ' + q + ': ' + p + ' after ' + prev);
      prev = p;
    }
  }
});

test('no band is ever sold under what the material and labour cost', () => {
  /* The sawtooth is the danger: a band must cover the worst cost at any
     quantity inside it, not the cost at its own ceiling. */
  for (const [t, L] of [[12, S12], [18, S18]]) {
    for (let n = 1; n <= 1000; n++) {
      assert.ok(each(L, n) >= CUT.costEach(t, n) - 1e-9,
        t + 'in at ' + n + ' sells at ' + each(L, n).toFixed(2) +
        ' against cost ' + CUT.costEach(t, n).toFixed(2));
    }
  }
});

/* ── The model ─────────────────────────────────────────────────────────── */

test('only a size that fits a board can be sold as a single', () => {
  /* A 24" head is 22" across. There is no in-house route at any quantity, so
     the first one buys a whole sheet — which is how the first version of these
     priced a single 24" at $155. Pack-only is the fix. */
  assert.strictEqual(CUT.fitsBoard(12), true);
  assert.strictEqual(CUT.fitsBoard(18), true);
  assert.strictEqual(CUT.fitsBoard(24), false, 'a 24in is 22in across — it cannot fit 20x30');
  assert.strictEqual(CUT.fitsBoard(36), false);

  const tool = fs.readFileSync(path.join(root, 'tools', 'add-cutouts.js'), 'utf8');
  const singles = tool.slice(tool.indexOf('const SINGLES = {'), tool.indexOf('const packLadder'));
  assert.ok(!/\b24:/.test(singles) && !/\b36:/.test(singles),
    'a pack-only size has been given a singles ladder');
  assert.match(tool, /const SINGLES = \{/, 'the singles ladders moved');
  assert.match(tool, /packLadder\(12\)/, 'the packs are not built from the cost model');
  /* A size deliberately switched off must survive a re-run. */
  assert.match(tool, /\(m\.offered \? ', active=1' : ''\)/, 'the update path ignores offered');
});

test('labour is in the price, and one number controls it', () => {
  /* The first ladders were written without labour and sold a single 12" at a
     1% margin — $12.00 against $11.82 of board, vinyl and ten minutes. */
  assert.strictEqual(CUT.SHOP_RATE, 35, 'the shop rate moved');
  assert.ok(CUT.MINUTES_PER_HEAD > 0, 'labour has been zeroed out');
  const bare = CUT.sqftOf(12) * CUT.VINYL_SQFT * CUT.LAMINATE_AND_CUT + CUT.BOARD;
  assert.ok(Math.abs(CUT.costEach(12, 1) - (bare + CUT.labour(CUT.MINUTES_PER_HEAD))) < 1e-9,
    'a single in-house head is not carrying exactly one head of labour');
});

test('shipping is an addon billed once, never inside a price', () => {
  /* Signs365 charges freight once an ORDER. Folded into six methods it would be
     billed once per METHOD, so a job with 12" singles and a 24" pack would pay
     it twice. */
  const ship = src.match(/code: 'cutout_ship'[\s\S]*?\},/);
  assert.ok(ship, 'the weekday cutout shipping addon is gone');
  assert.match(ship[0], /kind: 'once'/, 'cutout shipping must not scale with quantity');
  assert.match(ship[0], /rate: 10\b/, 'the weekday rate moved');
  for (const code of ['cutout_ship_sat', 'cutout_ship_large']) {
    assert.ok(src.includes("code: '" + code + "'"), code + ' is missing');
  }
  /* Weekday freight IS inside the pack price on purpose — a pack carries $10
     comfortably and it is one less thing to remember on a quote. It must never
     reach the per-piece singles cost, where $10 on a $24 cutout is 42% and
     belongs on the quote where the customer can see it. */
  assert.ok(Math.abs(CUT.packCost(24) - (CUT.SHEET + 8 * CUT.labour(CUT.MINUTES_HANDLING) + CUT.SHIPPING_WEEKDAY)) < 1e-9,
    'the pack price has stopped carrying delivery');
  const bare12 = CUT.sqftOf(12) * CUT.VINYL_SQFT * CUT.LAMINATE_AND_CUT + CUT.BOARD
    + CUT.labour(CUT.MINUTES_PER_HEAD);
  assert.ok(Math.abs(CUT.costEach(12, 1) - bare12) < 1e-9,
    'delivery has leaked into the singles cost, where it would be charged twice');
});
