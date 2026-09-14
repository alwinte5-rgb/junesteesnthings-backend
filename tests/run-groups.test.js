'use strict';

/* Same-run grouping: lines that sew together should price as one job.
 *
 * Twelve adult tees and twelve youth tees on one run are one 24-piece job to
 * every cost that matters — same screens, same setup, one trip through the
 * press — but they must stay separate quote lines because the blanks cost
 * different amounts. Priced line by line they were two 12s, and the customer
 * paid the 12-piece rate twice for a 24-piece job.
 *
 * The risk in fixing that is the opposite mistake: a line NOT in a group, or
 * alone in one, must price exactly as it did before any of this existed. The
 * first test here is the one that matters.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const m = src.match(/function quotePricingSource\(\) \{\s*return `([\s\S]*?)`;\s*\}/);
assert.ok(m, 'quotePricingSource not found in server.js');

const W = vm.runInThisContext('(function(){' + m[1] + ';\n' +
  'return {priceLine:priceLine, runGroupTotals:runGroupTotals, bandQtyFor:bandQtyFor};})()');

/* A DTF-shaped method: keys are band CEILINGS, cheaper as quantity rises. */
const METHOD = {
  positions: { front: [
    { min_qty: 11, price: '23.20' },
    { min_qty: 24, price: '18.30' },
    { min_qty: 49, price: '15.75' },
  ] },
};
const TIERS = [{ min: 100, pct: 6 }, { min: 35, pct: 3 }];   // FLOORS

const line = (over) => Object.assign({
  qty: 12, method: METHOD, stage: 'front', blankTiers: TIERS,
  product: { price: 10 }, addons: [],
}, over);

test('an ungrouped line prices exactly as it always did', () => {
  const a = W.priceLine(line({ qty: 12 }));
  const b = W.priceLine(line({ qty: 12, runGroup: '', bandQty: 0 }));
  assert.deepStrictEqual(a, b, 'an empty group tag must change nothing');
});

test('a line alone in a group is not given someone else\'s quantity', () => {
  const totals = W.runGroupTotals([{ runGroup: 'A', qty: 12 }]);
  assert.strictEqual(W.bandQtyFor({ runGroup: 'A', qty: 12 }, totals), 12);
});

test('6 adult + 6 youth reach the 12-24 decoration rate', () => {
  /* 6 and 6, not 12 and 12. At 12 the ceiling-keyed ladder ALREADY gives the
     <=24 band — a first draft of this test asserted 12 pieces pay the "12-piece
     rate" and failed, because that rate is the <=11 band. The pair that
     actually crosses a boundary is 6 + 6. */
  const items = [{ runGroup: 'run1', qty: 6 }, { runGroup: 'run1', qty: 6 }];
  const totals = W.runGroupTotals(items);
  assert.strictEqual(totals.run1, 12);

  const alone = W.priceLine(line({ qty: 6 }));
  const grouped = W.priceLine(line({ qty: 6, bandQty: W.bandQtyFor(items[0], totals) }));

  assert.strictEqual(Number(alone.decoration), 23.20, 'six alone sit in the <=11 band');
  assert.strictEqual(Number(grouped.decoration), 18.30, 'twelve as a run reach the <=24 band');
  assert.ok(grouped.decoration < alone.decoration);
});

test('the line still bills its OWN quantity, not the pool', () => {
  /* Pooling picks the rung of the ladder. It never invents pieces nobody
     ordered: six pieces at the twelve-piece rate, not twelve pieces. */
  const grouped = W.priceLine(line({ qty: 6, bandQty: 12, product: { price: 0 }, blankTiers: [] }));
  assert.strictEqual(Number(grouped.decoration), 18.30);
  assert.strictEqual(Number(grouped.lineTotal), Number((18.30 * 6).toFixed(2)),
    'six pieces of decoration, at the pooled rate');
});

test('blank volume tiers are FLOORS and read the pooled quantity', () => {
  const under = W.priceLine(line({ qty: 20, bandQty: 20 }));   // below the 35 floor
  const over = W.priceLine(line({ qty: 20, bandQty: 40 }));    // pooled over it
  assert.ok(over.blank < under.blank,
    'crossing the 35-piece floor as a group must discount the blank');
});

test('a decoration minimum is satisfied by the group, not the line', () => {
  const MIN = Object.assign({}, METHOD, { min_order_qty: 5 });
  const alone = W.priceLine(line({ qty: 3, method: MIN, bandQty: 3 }));
  const grouped = W.priceLine(line({ qty: 3, method: MIN, bandQty: 6 }));
  assert.ok(alone.decoration > grouped.decoration,
    'three pieces alone are scaled up to the five-piece minimum; three of a ' +
    'six-piece run are not');
});

test('bandQty can never drag a line BELOW its own quantity', () => {
  const p = W.priceLine(line({ qty: 40, bandQty: 5 }));
  const q = W.priceLine(line({ qty: 40 }));
  assert.strictEqual(p.blank, q.blank, 'a smaller bandQty must be ignored');
});

/* Six designs on one quote are SIX runs, not one.
 *
 * This is why the form control is a run number and not a tick box. A tick can
 * only say "one run per quote"; ticking six different designs would pool them
 * into a single job and under-charge every one of them.
 */
test('six separate runs stay separate', () => {
  const items = [];
  for (let d = 1; d <= 6; d++) {
    items.push({ runGroup: String(d), qty: 6 }, { runGroup: String(d), qty: 6 });
  }
  const totals = W.runGroupTotals(items);
  assert.strictEqual(Object.keys(totals).length, 6, 'six distinct runs');
  for (let d = 1; d <= 6; d++) {
    assert.strictEqual(totals[String(d)], 12, 'run ' + d + ' pools its own two lines only');
  }
  /* 72 pieces on the quote, but no line may be priced at 72. */
  const all = items.reduce((a, i) => a + i.qty, 0);
  assert.strictEqual(all, 72);
  for (const it of items) {
    assert.strictEqual(W.bandQtyFor(it, totals), 12,
      'a line sees its own run, never the whole quote');
  }
});

test('runs are kept apart by number, not merged by proximity', () => {
  const totals = W.runGroupTotals([
    { runGroup: '1', qty: 24 }, { runGroup: '2', qty: 6 }, { qty: 100 },
  ]);
  assert.strictEqual(totals['1'], 24);
  assert.strictEqual(totals['2'], 6);
  assert.strictEqual(W.bandQtyFor({ runGroup: '2', qty: 6 }, totals), 6,
    'the big untagged line must not leak into run 2');
});
