'use strict';
/* The shop and designer picker order (tools/shop-order.js). Owner, 2026-10-28:
   the Gildan 5000 first, common items before expensive ones. */
const { test } = require('node:test');
const assert = require('node:assert');
const { planOrder } = require('../tools/shop-order');

const cats = [
  { id: 52, parent: 0, order: 1, active: 1 },   // T-Shirts
  { id: 74, parent: 52, order: 1, active: 1 },  // Short Sleeve
  { id: 53, parent: 0, order: 2, active: 1 },   // Hoodies
  { id: 66, parent: 0, order: 0, active: 0 },   // Sustainable, switched off
];

test('Gildan 5000 is first, hand-ranked basics keep their places, parked stay last', () => {
  const plan = planOrder([
    { id: 12, order: 1, price: 6.4, cats: [52] },
    { id: 17, order: 2, price: 7.9, cats: [52] },
    { id: 125, order: 1, price: 39.37, cats: [53] },
    { id: 188, order: 999, price: 0, cats: [] },
  ], cats);
  assert.deepStrictEqual(plan.map((x) => [x.id, x.to]), [[12, 1], [17, 2], [125, 100], [188, 999]]);
});

test('the rest go by section, then cheapest first; a switched-off category does not count', () => {
  const plan = planOrder([
    { id: 1, order: 1, price: 30, cats: [53] },
    { id: 2, order: 900, price: 20, cats: [74, 66] },
    { id: 3, order: 150, price: 9, cats: [53, 66] },
    { id: 4, order: 1, price: 12, cats: [74] },
  ], cats);
  assert.deepStrictEqual(plan.map((x) => x.id), [4, 2, 3, 1]);
  assert.deepStrictEqual(plan.map((x) => x.to), [100, 101, 102, 103]);
});

test('a re-run changes nothing', () => {
  const first = planOrder([
    { id: 12, order: 1, price: 6.4, cats: [52] },
    { id: 5, order: 1, price: 30, cats: [53] },
    { id: 6, order: 1, price: 8, cats: [74] },
  ], cats);
  const again = planOrder(first.map((x) => ({ id: x.id, order: x.to, price: { 12: 6.4, 5: 30, 6: 8 }[x.id], cats: { 12: [52], 5: [53], 6: [74] }[x.id] })), cats);
  assert.ok(again.every((x) => x.from === x.to));
});
