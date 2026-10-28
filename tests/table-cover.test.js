'use strict';

/* The 6 ft table cover (owner, 2026-10-21; repriced 2026-10-28): printed in
 * house on one or two sides (ivory and white sublimated, other colors DTF),
 * at the owner's all-in prices, shipping included:
 *   1 side  $75 (1-4), $70 (5-9), $60 (10-49), $52 (50-99), $45 (100+);
 *   2 sides $105, $95, $85, $75, $65.
 * tools/add-table-cover.js writes them as one decoration method whose main
 * stage is the 1-side price and whose second stage is what the back adds. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tool = fs.readFileSync(path.join(__dirname, '..', 'tools', 'add-table-cover.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const TC = require('../tools/lib/table-cover');
const ONE = TC.ONE_SIDE, TWO = TC.TWO_SIDES;
/* The REAL quote engine (server.js quotePricingSource priceLine), given the
   method exactly as the tool writes it. */
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
}
const { priceLine } = vm.runInThisContext(vm.runInThisContext(lift('quotePricingSource') + '\nquotePricingSource()') + '\n({ priceLine })');
const ladder = (t) => Object.keys(t).map(Number).sort((a, b) => a - b).map((c) => ({ min_qty: c, price: t[c] }));
const BACK = Object.fromEntries(Object.keys(ONE).map((c) => [c, TWO[c] - ONE[c]]));
const COVER = { id: 900, title: 'Table Cover Printing — Sublimation or DTF', type: 'fixed', min_order_qty: 0,
  positions: { id: ladder(ONE), mr8a5dlx: ladder(BACK) } };
const BIG = { id: 64, title: 'DTF Printing — Oversized (up to 252 sq in)', type: 'fixed', min_order_qty: 0,
  positions: { id: [{ min_qty: 7000, price: 14 }], mr8a5dlx: [{ min_qty: 7000, price: 4.95 }] } };
const line = (qty, prints) => priceLine({ product: { price: 0, sizes: [] }, addons: [], blankTiers: [], noBase: true, qty, prints });
const r2 = (n) => Math.round(n * 100) / 100;

test('the owner\'s prices, each, at every quantity, from the real engine', () => {
  for (const [q, one, two] of [[1, 75, 105], [4, 75, 105], [5, 70, 95], [10, 60, 85], [50, 52, 75], [100, 45, 65], [500, 45, 65]]) {
    assert.strictEqual(r2(line(q, [{ loc: 'front', method: COVER }]).unit), one, `1 side at ${q}`);
    assert.strictEqual(r2(line(q, [{ loc: 'front', method: COVER }, { loc: 'back', method: COVER }]).unit), two, `2 sides at ${q}`);
    assert.strictEqual(r2(line(q, [{ loc: 'back', method: COVER }]).unit), one, `a back-only print is one side at ${q}`);
  }
});

test('the cover is its own family: an oversized DTF print beside it does not take its main price', () => {
  const r = line(1, [{ loc: 'front', method: COVER }, { loc: 'back', method: BIG }]);
  assert.strictEqual(r2(r.decoration), 75 + 14);
});

test('the customer-supplies-the-blanks add-on is never offered on the cover', () => {
  const a = src.indexOf("code: 'own_blanks'");
  const re = eval(src.slice(src.indexOf('appliesTo: ', a) + 11, src.indexOf(",\n", a)).replace('GARMENT_METHOD_RE.source', JSON.stringify('\\bdtf\\b')));
  assert.ok(!re.test('Table Cover Printing — Sublimation or DTF'));
  assert.ok(!re.test('DTF Printing — Table Cover'), 'the old name too');
  assert.ok(re.test('DTF Printing'));
});

test('nothing is added on top: no product price, no delivery charge', () => {
  assert.match(tool, /const blank = 0;/);
  assert.doesNotMatch(src, /tablecover_ship/, 'shipping is inside the owner\'s price');
});

test('the tool refuses a missing or rising price and is dry-run by default', () => {
  assert.match(tool, /no price for the <=' \+ c \+ ' band — refusing/);
  assert.match(tool, /1-side price RISES at/);
  assert.match(tool, /const APPLY = argv\.includes\('--apply'\)/);
});

test('job costs: the cover blank and its delivery are costs, and the front is a 252 sq in print', () => {
  const JC = require('../tools/lib/job-costs');
  const catalog = { products: [{ id: 700, name: 'Table Cover — 6 ft', price: 0, cost: 15.39 }],
    methods: [{ id: 900, title: 'Table Cover Printing — Sublimation or DTF' }] };
  const est = JC.estimateJob([{ product_id: 700, method_id: 900, stage: '', qty: 1, unit_price: 75 }], catalog);
  const c = est.lines[0].unit_cost;
  assert.ok(c >= 15.39 + 11.99 + JC.DTF[1][2] - 0.01, `cost ${c}`);
});
