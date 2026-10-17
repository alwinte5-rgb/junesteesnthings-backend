'use strict';

/* Standard DTF and DTF Oversized are one family in the quote engine (2026-10-17).
 *
 * The Ink Theory job: a 12x18 back on Oversized and a 4x4 chest on standard
 * DTF. "A method's first place takes its main table" was keyed on method id,
 * so the two prints were each charged a MAIN print ($14.00 + $11.90 at 50-99)
 * instead of one oversized print plus one additional location ($14.00 + $4.95).
 *
 * Run: node --test tests/dtf-oversized-quote.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}
const text = vm.runInThisContext(lift('quotePricingSource') + '\nquotePricingSource()');
const { priceLine } = vm.runInThisContext(text + '\n({ priceLine })');

/* The live 50-99 band (ceiling 99) and one band above it. */
const DTF = { id: 1, title: 'DTF Printing', type: 'fixed', min_order_qty: 0,
  positions: { id: [{ min_qty: 99, price: 11.90 }, { min_qty: 249, price: 9.50 }],
               mr8a5dlx: [{ min_qty: 99, price: 4.95 }, { min_qty: 249, price: 4.20 }] } };
const BIG = { id: 40, title: 'DTF Printing — Oversized (up to 252 sq in)', type: 'fixed', min_order_qty: 0,
  positions: { id: [{ min_qty: 99, price: 14.00 }, { min_qty: 249, price: 11.30 }],
               mr8a5dlx: [{ min_qty: 99, price: 4.95 }, { min_qty: 249, price: 4.20 }] } };
const base = { product: { price: 6.68, sizes: [] }, addons: [], blankTiers: [], noBase: true, qty: 70 };
const money = (n) => Math.round(n * 100) / 100;

test('oversized back + standard chest is one main print and one additional location', () => {
  const r = priceLine({ ...base, prints: [{ loc: 'front', method: DTF }, { loc: 'back', method: BIG }] });
  assert.equal(money(r.decoration), 18.95, 'the $14.00 back + $4.95 chest quoted to Ink Theory');
});

test('the oversized print takes the main price wherever it sits', () => {
  const r = priceLine({ ...base, prints: [{ loc: 'front', method: BIG }, { loc: 'back', method: DTF }] });
  assert.equal(money(r.decoration), 18.95);
});

test('oversized alone is its own main print', () => {
  const r = priceLine({ ...base, prints: [{ loc: 'back', method: BIG }] });
  assert.equal(money(r.decoration), 14.00);
});

test('standard DTF alone still prices as before', () => {
  const one = priceLine({ ...base, prints: [{ loc: 'back', method: DTF }] });
  assert.equal(money(one.decoration), 11.90, 'back alone is the main print');
  const two = priceLine({ ...base, prints: [{ loc: 'front', method: DTF }, { loc: 'back', method: DTF }] });
  assert.equal(money(two.decoration), 16.85, 'front main + back additional');
});
