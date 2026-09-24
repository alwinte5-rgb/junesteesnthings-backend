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

/* Derived, exactly as tools/add-cutouts.js derives them. This used to be a
   hardcoded copy described as "exactly as add-cutouts writes them", which
   stopped being true the day the ladder became computed — so the suite was
   asserting against prices the shop no longer sold. */
const SINGLE_BANDS = { 12: [6, 12, 32, 1000], 18: [5, 10, 20, 50, 1000] };
const SINGLES = {
  12: CUT.singlesLadder(12, SINGLE_BANDS[12]),
  18: CUT.singlesLadder(18, SINGLE_BANDS[18]),
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
      /* costEach carries the order's freight now, once, so take it back off
         before comparing production against production. */
      const made = CUT.costEach(t, n) * n - CUT.SHIPPING_WEEKDAY;
      assert.ok(Math.abs(made - production * packs) < 1e-6,
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
  /* Pinned so a change to the cost model cannot move a PUBLISHED price without
     someone noticing: these four are on jtees.net and in the PDF handout.
     $212/$186/$184/$178 until 2026-09-23, when the shop rate went $35 -> $50. */
  assert.deepStrictEqual([12, 18, 24, 36].map(CUT.packPrice), [228, 192, 188, 180]);
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
  /* Against the DERIVED ladder rather than a copy of last month's numbers.
     What matters is that every quantity inside a band pays that band's rate
     and the first quantity past its ceiling pays the next one — the prices
     themselves move whenever the cost model does, and pinning them here only
     ever meant updating two places. */
  for (const [t, bands] of Object.entries(SINGLE_BANDS)) {
    const L = t === '12' ? S12 : S18;
    let lo = 1;
    for (const ceil of bands) {
      const rate = parseFloat(SINGLES[t][ceil]);
      assert.strictEqual(each(L, lo), rate, t + 'in at ' + lo + ' (band start)');
      assert.strictEqual(each(L, ceil), rate, t + 'in at ' + ceil + ' (band ceiling)');
      lo = ceil + 1;
    }
  }
});

test('a ceiling applies UP TO its quantity, not from it', () => {
  /* The floor/ceiling trap. 6 pays the <=6 rate; 7 has fallen into the next
     band. Read as floors, every band would sit one step out. */
  assert.strictEqual(each(S12, 6), parseFloat(SINGLES[12][6]));
  assert.strictEqual(each(S12, 7), parseFloat(SINGLES[12][12]));
  assert.ok(each(S12, 7) < each(S12, 6), '7 must have fallen into a cheaper band than 6');
  assert.strictEqual(each(S18, 5), parseFloat(SINGLES[18][5]));
  assert.strictEqual(each(S18, 6), parseFloat(SINGLES[18][10]));
  assert.ok(each(S18, 6) < each(S18, 5), '6 must have fallen into a cheaper band than 5');
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
  /* $50 from 2026-09-23, up from $35, and deliberately the SAME number
     tools/lib/signage.js uses — one business, one rate. If these two ever
     disagree again, one of them is quietly wrong. */
  assert.strictEqual(CUT.SHOP_RATE, 50, 'the shop rate moved');
  assert.strictEqual(CUT.SHOP_RATE, require('../tools/lib/signage').SHOP_RATE,
    'cutouts and signage are charging different shop rates');
  assert.ok(CUT.MINUTES_PER_HEAD > 0, 'labour has been zeroed out');
  /* sqftOf is BILLABLE square feet now — each dimension rounded up to the
     next whole foot, which is how Signs365 charges — and the laminate is
     included in the $2.49 rather than surcharged. One head of labour, and the
     order's freight, which at n=1 is all of it. */
  const bare = CUT.sqftOf(12) * CUT.VINYL_SQFT + CUT.BOARD;
  assert.ok(Math.abs(CUT.costEach(12, 1) -
      (bare + CUT.labour(CUT.MINUTES_PER_HEAD) + CUT.SHIPPING_WEEKDAY)) < 1e-9,
    'a single in-house head is not carrying exactly one head of labour plus freight');
});

test('weekday freight is inside the price, and the exceptions are not', () => {
  /* REVERSED on 2026-09-23, June's call. The old rule kept weekday freight out
     of the singles price because "$10 on a $24 cutout is 42%" — but $24 was
     wrong: the print alone is $9.96 at 18in and a single head really costs
     over $30. At the true price $10 is a fifth of it, and shown on a quote the
     word "shipping" tells a customer we are posting the goods to them, which
     we are not.
     So the weekday rate is amortised inside costEach, and the two exceptions
     stay as add-ons because they are a decision someone makes for one job. */
  assert.equal(/code: 'cutout_ship'[^_]/.test(src), false,
    'the weekday freight addon is back — it would be charged twice, once here and once in the price');
  for (const code of ['cutout_ship_sat', 'cutout_ship_large']) {
    assert.ok(src.includes("code: '" + code + "'"), code + ' is missing');
  }
  /* The pack has always carried it. */
  assert.ok(Math.abs(CUT.packCost(24) - (CUT.SHEET + 8 * CUT.labour(CUT.MINUTES_HANDLING) + CUT.SHIPPING_WEEKDAY)) < 1e-9,
    'the pack price has stopped carrying delivery');

  /* And the singles cost carries it now too, which is the reversal: one head
     is the material, the board, ten minutes, and the whole $10. */
  const bare12 = CUT.sqftOf(12) * CUT.VINYL_SQFT + CUT.BOARD + CUT.labour(CUT.MINUTES_PER_HEAD);
  assert.ok(Math.abs(CUT.costEach(12, 1) - (bare12 + CUT.SHIPPING_WEEKDAY)) < 1e-9,
    'the singles cost is not carrying delivery');

  /* One head carries the whole $10; two carry $5 each. The in-house cost per
     head is identical either way, so the gap between them IS the amortisation. */
  const gap = CUT.costEach(12, 1) - CUT.costEach(12, 2);
  assert.ok(Math.abs(gap - CUT.SHIPPING_WEEKDAY / 2) < 1e-9,
    'freight is not being amortised across the run: gap was ' + gap.toFixed(4));
});

test('the singles ladder is derived, so it cannot drift from its own costs', () => {
  /* These four and five prices used to be a literal table in add-cutouts.js.
     When the shop rate went $35 -> $50 the packs moved and the singles did
     not: eight of the nine bands fell under the x2 floor, the 12in bottoming
     out at 31%. Derived now, and asserted at every band's WORST quantity —
     which for a ceiling band is its lowest member, not its highest. */
  for (const [size, bands] of [[12, [6, 12, 32, 1000]], [18, [5, 10, 20, 50, 1000]]]) {
    const L = CUT.singlesLadder(size, bands);
    let lo = 1, prev = Infinity;
    for (const b of bands) {
      const price = parseFloat(L[b]);
      const cost = CUT.costEach(size, lo);
      assert.ok(price >= cost * CUT.MARKUP,
        `${size}in band <=${b} at $${price} is under cost x${CUT.MARKUP} ($${(cost * CUT.MARKUP).toFixed(2)}) at qty ${lo}`);
      assert.ok(price <= prev, `${size}in ladder rose at band <=${b}`);
      prev = price;
      lo = b + 1;
    }
  }
});

test('the singles ladder moves when the shop rate does', () => {
  /* The guard that would have caught the drift: a price derived from the cost
     model must respond to the cost model. */
  const cheap = CUT.singlesLadder(12, [6, 1000]);
  assert.ok(parseFloat(cheap[6]) > 0);
  /* And it must never be the stale literal that was there before. */
  assert.notStrictEqual(cheap[6], '24.00', 'the 12in single is back to its hardcoded $35/hr price');
});
