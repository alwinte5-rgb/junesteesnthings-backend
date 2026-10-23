/* Garment markup: the LOWER of cost x 2 and cost + $8 (owner, 2026-10-23). */
const test = require('node:test');
const assert = require('node:assert');
const { sellPrice, sizeUpcharge } = require('../tools/lib/markup');

test('cheap blanks still double; dear blanks earn a flat $8', () => {
  assert.strictEqual(sellPrice(3.20), 6.40);    // Gildan 5000
  assert.strictEqual(sellPrice(8.00), 16.00);   // where the two rules meet
  assert.strictEqual(sellPrice(13.14), 21.14);  // Gildan 18500, was $26.28
  assert.strictEqual(sellPrice(28.46), 36.46);  // Comfort Colors 1567, was $56.92
});

test('a size upcharge is the size\'s sell price less the base\'s', () => {
  assert.strictEqual(sizeUpcharge(5.04, 3.20), 3.68);   // both under the cap: diff x 2
  assert.strictEqual(sizeUpcharge(16.00, 13.14), 2.86); // both over it: the cost difference
  assert.strictEqual(sizeUpcharge(9.00, 7.00), 3.00);   // crossing it: $17 - $14
  assert.strictEqual(sizeUpcharge(3.00, 3.20), 0);      // never negative
});
