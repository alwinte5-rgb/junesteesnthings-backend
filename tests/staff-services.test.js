'use strict';

/* Staff-only services: design fees and folding.
 *
 * They reach the quote form through the shop catalogue but are stored inactive
 * (see jt-catalog.php and tools/add-services.js), so the storefront never shows
 * them. Two things must hold here:
 *
 *   - a service is priced FLAT. The garment volume break (BLANK_TIERS) is a
 *     margin rule for blanks; applied to 3,000 folded brochures it takes 18% off
 *     the folding, and nobody would see it happen.
 *   - a garment is still discounted exactly as before.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const m = src.match(/function quotePricingSource\(\) \{\s*return `([\s\S]*?)`;\s*\}/);
const W = vm.runInThisContext('(function(){' + m[1] + ';return {priceLine:priceLine};})()');

const TIERS = [{ min: 3000, pct: 18 }, { min: 1000, pct: 15 }, { min: 35, pct: 3 }];
const line = (product, qty, extra) => W.priceLine(Object.assign({
  qty, product, blankTiers: TIERS, addons: [], stage: 'front',
}, extra || {}));

test('folding 3,000 brochures is $0.10 each, not 18% off', () => {
  const r = line({ price: 0.10, service: true }, 3000);
  assert.strictEqual(Number(r.blank), 0.10);
});

test('a design fee at quantity 1 is its price', () => {
  assert.strictEqual(Number(line({ price: 150, service: true }, 1).blank), 150);
});

test('a typed price on a service is not volume-discounted either', () => {
  const r = line({ price: 0.10, service: true }, 3000, { blankOverride: '0.12' });
  assert.strictEqual(Number(r.blank), 0.12);
});

test('a garment still gets the volume break', () => {
  assert.strictEqual(Number(line({ price: 10 }, 3000).blank), 8.2);
  assert.strictEqual(Number(line({ price: 10 }, 10).blank), 10);
});

/* Lifted out of server.js by name, run in this realm. */
function lift(name) {
  const at = src.indexOf('function ' + name + '(');
  assert.ok(at > -1, name + ' not found in server.js');
  return src.slice(at, src.indexOf('\n}\n', at) + 2);
}

test('the customer quote page is told a line is a service', () => {
  const fn = vm.runInThisContext('(function(){ var itemPrints = function(){ return []; }; var typedUnitOf = function(){ return null; }; ' +
    lift('customerLinePricing') + '; return customerLinePricing; })()');
  const catalog = { products: [
    { id: 1, name: 'Brochure Design — Revision', price: 150, cost: 0, service: true },
    { id: 2, name: 'Tee', price: 10, cost: 4 },
  ], methods: [] };
  const out = fn([{ product_id: 1 }, { product_id: 2 }], catalog);
  assert.strictEqual(out[0].product.service, true);
  assert.strictEqual(out[1].product.service, false);
  assert.strictEqual(out[0].product.cost, undefined);   // never the shop's cost
});

test('services get their own heading in the quote form', () => {
  assert.match(src, /'Services \(not in shop\)'/);
});

test('a service line is costed as a service, not as half-price blanks', () => {
  const J = require('../tools/lib/job-costs');
  const catalog = { products: [{ id: 900, name: 'Brochure Design — Revision', price: 150, cost: 0, service: true }], methods: [] };
  const est = J.estimateJob([{ product_id: 900, qty: 1, unit_price: 150, description: 'Brochure Design — Revision' }], catalog);
  assert.strictEqual(est.complete, true);
  assert.strictEqual(est.lines[0].unit_cost, 0);
  assert.strictEqual(est.lines[0].basis, 'service: no supplier cost');
});
