/* Live S&S pricing (owner, 2026-10-18): a sale reaches the customer, except in
 * its last 4 days; and the size list and its extra charges follow today's cost
 * on every sync instead of staying what they were the day a product was added.
 *
 * Run: node --test tests/live-pricing.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pieceCost, costBySize, sizeOptions, jumpHeld, readSizes, SALE_BUFFER_DAYS } = require('../tools/lib/ssa-costs');

const NOW = Date.parse('2026-10-18T12:00:00Z');
const row = (over) => ({ sizeName: 'M', piecePrice: 3.55, customerPrice: 3.18, salePrice: 3.18, ...over });

test('a sale is passed on while it has more than 4 days to run', () => {
  assert.strictEqual(SALE_BUFFER_DAYS, 4);
  assert.strictEqual(pieceCost(row({ saleExpiration: '2026-10-31T00:00:00' }), NOW), 3.18);
});

test('inside the last 4 days the list price is used', () => {
  assert.strictEqual(pieceCost(row({ saleExpiration: '2026-10-21T00:00:00' }), NOW), 3.55);
  /* An expired sale the feed still reports is list too. */
  assert.strictEqual(pieceCost(row({ saleExpiration: '2026-10-10T00:00:00' }), NOW), 3.55);
});

test('no sale: customerPrice (equal to list for this account)', () => {
  assert.strictEqual(pieceCost({ piecePrice: 5.4, customerPrice: 5.4 }, NOW), 5.4);
});

test('costBySize applies the buffer per row', () => {
  const rows = [row({ sizeName: 'S', saleExpiration: '2026-10-31' }), row({ sizeName: '2XL', piecePrice: 5, customerPrice: 4.5, saleExpiration: '2026-10-20' })];
  assert.deepStrictEqual(costBySize(rows, NOW), { S: 3.18, '2XL': 5 });
});

test('sizeOptions makes a size list with values and today\'s extra charges', () => {
  const before = { multiple_options: [{ title: 'S', price: '', default: '' }, { title: 'L', price: '', default: '1' }, { title: '2XL', price: '', default: '' }, { title: '6XL', price: '9.00' }] };
  const after = sizeOptions(before, { S: 10, L: 10, '2XL': 12 }, 10);
  assert.strictEqual(after.type, 'multiple');
  assert.strictEqual(after.min_qty, '1');
  assert.deepStrictEqual(after.multiple_options.map((o) => [o.title, o.value, o.price, o.default]),
    [['S', 'S', '', ''], ['L', 'L', '', '1'], ['2XL', '2XL', '4.00', ''], ['6XL', '6XL', '9.00', undefined]],
    'defaults kept; a size S&S no longer prices keeps its charge');
  /* Idempotent: running it again on its own output changes nothing, so the
     daily sync does not rewrite every product every day. */
  assert.deepStrictEqual(sizeOptions(after, { S: 10, L: 10, '2XL': 12 }, 10), after);
});

test('one size stays a single quantity box', () => {
  const after = sizeOptions({ multiple_options: [{ title: 'One Size', price: '' }] }, { 'One Size': 4 }, 4);
  assert.strictEqual(after.type, undefined);
});

test('the daily sync rebuilds size fields, and add-products writes the full format', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(sync, /sizeOptions\(vals, bySize\.bySize, cost\)/);
  assert.ok(!/const pieceCost = \(r\) =>/.test(sync), 'the sync uses the shared, sale-aware pieceCost');
  const add = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-add-products.js'), 'utf8');
  assert.match(add, /values: JSON\.stringify\(sizeOptions\(\{ multiple_options \}, sizeCost, baseCost\)\)/);
});

test('one base-cost rule everywhere: cheapest core size, else cheapest size', () => {
  const { baseCostOf } = require('../tools/lib/ssa-costs');
  assert.strictEqual(baseCostOf({ S: 5, M: 4.5, '2XL': 7 }), 4.5);
  assert.strictEqual(baseCostOf({ '2XL': 7, '3XL': 8 }), 7, 'no core size: the cheapest size, as the sync always did');
  assert.strictEqual(baseCostOf({}), Infinity);
  const sync = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(sync, /const baseCost = baseCostOf;/);
  assert.match(sync, /const bySize = costBySize\(rows\);/, 'the sync uses the shared median-per-size helper');
});

test('the jump guard: a sale ending passes, a glitch with no sale running is held', () => {
  /* Sale ends: $9 sale back up to $15 list. */
  assert.strictEqual(jumpHeld(9, 15, 15, 0.4), false);
  /* No sale, so cost == list: a feed glitch to $1.50 must still be held. */
  assert.strictEqual(jumpHeld(15, 1.5, 1.5, 0.4), true);
  /* An upward jump that is not to list is held too. */
  assert.strictEqual(jumpHeld(10, 20, 15, 0.4), true);
  assert.strictEqual(jumpHeld(10, 11, 11, 0.4), false, 'small moves pass');
  assert.strictEqual(jumpHeld(0, 11, 11, 0.4), false, 'no stored cost: nothing to compare');
  const sync = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(sync, /if \(jumpHeld\(was, cost, listCost, PRICE_JUMP_GUARD\)\)/);
});

test('list costing ignores a running sale', () => {
  const r = row({ saleExpiration: '2026-10-31T00:00:00' });
  assert.strictEqual(pieceCost(r, NOW), 3.18);
  assert.strictEqual(pieceCost(r, NOW, { list: true }), 3.55);
  assert.deepStrictEqual(costBySize([r], NOW, { list: true }), { M: 3.55 });
});

test('a sale end with no zone is read as UTC', () => {
  /* 4 days + 1 hour after NOW in UTC: still on sale wherever the sync runs. */
  assert.strictEqual(pieceCost(row({ saleExpiration: '2026-10-22T13:00:00' }), NOW), 3.18);
  assert.strictEqual(pieceCost(row({ saleExpiration: '2026-10-22T11:00:00' }), NOW), 3.55);
});

test('readSizes: key, string form, and an unreadable field', () => {
  assert.strictEqual(readSizes({ a: { type: 'color' } }), null);
  const s = readSizes({ Q: { type: 'quantity', values: '{"multiple_options":[]}' } });
  assert.deepStrictEqual(s, { key: 'Q', asString: true, values: { multiple_options: [] } });
  assert.deepStrictEqual(readSizes({ Q: { type: 'quantity', values: '{bad' } }).values, { unreadable: true });
});

test('the sync writes a size field only if it is unchanged since it was read', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(sync, /'attributes=IF\(attributes=' \+ sq\(p\.attributes\)/);
});
