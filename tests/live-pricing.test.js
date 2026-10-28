/* Live S&S pricing. Owner, 2026-10-28: "regular price for everything" — an
 * S&S sale is the shop's margin and never reaches the customer (this replaced
 * the 2026-10-18 rule that passed sales on). The size list and its extra
 * charges follow today's cost on every sync.
 *
 * Run: node --test tests/live-pricing.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pieceCost, costBySize, sizeOptions, jumpHeld, readSizes } = require('../tools/lib/ssa-costs');

const row = (over) => ({ sizeName: 'M', piecePrice: 3.55, customerPrice: 3.18, salePrice: 3.18, ...over });

test('a running sale is never passed on: every row is priced at list', () => {
  assert.strictEqual(pieceCost(row({ saleExpiration: '2026-12-31T00:00:00' })), 3.55);
  assert.strictEqual(pieceCost({ piecePrice: 5.4, customerPrice: 5.4 }), 5.4, 'no sale: the same number');
  assert.strictEqual(pieceCost({ customerPrice: 5.4 }), 5.4, 'a row with no list price falls back');
});

/* The econscious EC3000 (style 13546), 2026-10-28: some colours on sale at
   $5.30, others at $7.19 list; the median-per-size of the SALE prices put S and
   XL at $5.30 and M and L at $7.19, so M cost +$3.78 and XL nothing. */
test('sizes never cost less than smaller sizes because only some colours are on sale', () => {
  const rows = [];
  const colour = (name, list, sale, xxl) => {
    for (const z of ['S', 'M', 'L', 'XL']) rows.push({ colorName: name, sizeName: z, piecePrice: list, customerPrice: sale });
    rows.push({ colorName: name, sizeName: '2XL', piecePrice: xxl, customerPrice: xxl });
  };
  colour('Black', 7.19, 5.3, 8.47); colour('Navy', 7.19, 7.19, 8.47);
  colour('Iris', 5.95, 5.25, 7.58); colour('Sky', 7.19, 5.3, 8.47);
  const c = costBySize(rows);
  assert.strictEqual(c.S, c.M); assert.strictEqual(c.M, c.L); assert.strictEqual(c.L, c.XL);
  assert.ok(c['2XL'] > c.XL);
  assert.strictEqual(c.S, 7.19, 'the typical colour at list');
});

test('a colour priced apart from the rest cannot reorder the sizes', () => {
  /* Heather dearer than the solids; it has no XL row at all. */
  const rows = [
    { colorName: 'Black', sizeName: 'S', piecePrice: 6 }, { colorName: 'Black', sizeName: 'XL', piecePrice: 6 },
    { colorName: 'White', sizeName: 'S', piecePrice: 6 }, { colorName: 'White', sizeName: 'XL', piecePrice: 6 },
    { colorName: 'Heather', sizeName: 'S', piecePrice: 9 },
  ];
  const c = costBySize(rows);
  assert.strictEqual(c.XL, c.S, 'one dear colour with no XL does not make XL cheaper than S');
});

test('an extended-only colour does not set the base or dilute the 2XL extra', () => {
  const rows = [];
  for (const c of ['A', 'B']) {
    for (const z of ['S', 'M', 'L', 'XL']) rows.push({ colorName: c, sizeName: z, piecePrice: 7.19 });
    rows.push({ colorName: c, sizeName: '2XL', piecePrice: 8.47 });
  }
  for (const z of ['2XL', '3XL']) rows.push({ colorName: 'Tall', sizeName: z, piecePrice: 8.47 });
  const c = costBySize(rows);
  assert.strictEqual(c.S, 7.19);
  assert.strictEqual(c['2XL'], 8.47);
});

test('a size cheaper than the base stays cheaper; colours disagreeing on the cheapest core size do not inflate it', () => {
  const xs = costBySize([{ colorName: 'A', sizeName: 'XS', piecePrice: 6.8 }, { colorName: 'A', sizeName: 'S', piecePrice: 7.2 }]);
  assert.ok(xs.XS < xs.S, 'XS keeps its lower cost');
  const rows = [
    { colorName: 'A', sizeName: 'S', piecePrice: 5 }, { colorName: 'A', sizeName: 'M', piecePrice: 6 },
    { colorName: 'B', sizeName: 'S', piecePrice: 6 }, { colorName: 'B', sizeName: 'M', piecePrice: 5 },
  ];
  const c = costBySize(rows);
  assert.strictEqual(Math.min(c.S, c.M), 5, 'the cheapest core size is the typical colour base');
});

test('rows with no colour name are told apart by colour code', () => {
  const rows = [
    { colorCode: '01', sizeName: 'S', piecePrice: 5 }, { colorCode: '01', sizeName: 'XL', piecePrice: 5 },
    { colorCode: '02', sizeName: 'S', piecePrice: 9 }, { colorCode: '02', sizeName: 'XL', piecePrice: 9 },
    { colorCode: '03', sizeName: 'S', piecePrice: 5 }, { colorCode: '03', sizeName: 'XL', piecePrice: 5 },
  ];
  const c = costBySize(rows);
  assert.strictEqual(c.S, 5); assert.strictEqual(c.XL, 5);
});

test('sizeOptions makes a size list with values and today\'s extra charges', () => {
  const before = { multiple_options: [{ title: 'S', price: '', default: '' }, { title: 'L', price: '', default: '1' }, { title: '2XL', price: '', default: '' }, { title: '6XL', price: '9.00' }] };
  const after = sizeOptions(before, { S: 3, L: 3, '2XL': 5 }, 3);
  assert.strictEqual(after.type, 'multiple');
  assert.strictEqual(after.min_qty, '1');
  assert.deepStrictEqual(after.multiple_options.map((o) => [o.title, o.value, o.price, o.default]),
    [['S', 'S', '', ''], ['L', 'L', '', '1'], ['2XL', '2XL', '4.00', ''], ['6XL', '6XL', '9.00', undefined]],
    'defaults kept; a size S&S no longer prices keeps its charge');
  /* Idempotent: running it again on its own output changes nothing, so the
     daily sync does not rewrite every product every day. */
  assert.deepStrictEqual(sizeOptions(after, { S: 3, L: 3, '2XL': 5 }, 3), after);
});

test('one size stays a single quantity box', () => {
  const after = sizeOptions({ multiple_options: [{ title: 'One Size', price: '' }] }, { 'One Size': 4 }, 4);
  assert.strictEqual(after.type, undefined);
});

test('the daily sync rebuilds size fields, and add-products writes the full format', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(sync, /sizeOptions\(vals, bySize\.bySize, cost\)/);
  assert.ok(!/const pieceCost = \(r\) =>/.test(sync), 'the sync uses the shared pieceCost');
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

test('the jump guard holds a big move either way; --accept-jumps is the reviewed override', () => {
  assert.strictEqual(jumpHeld(15, 1.5, 0.4), true, 'a glitch down');
  assert.strictEqual(jumpHeld(10, 20, 0.4), true, 'a glitch up — no longer excused as "back to list"');
  assert.strictEqual(jumpHeld(10, 11, 0.4), false, 'small moves pass');
  assert.strictEqual(jumpHeld(0, 11, 0.4), false, 'no stored cost: nothing to compare');
  const sync = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(sync, /if \(!ACCEPT_JUMPS\.has\(Number\(p\.id\)\) && jumpHeld\(was, cost, PRICE_JUMP_GUARD\)\)/);
  assert.ok(/ACCEPT_JUMPS\.has\(Number\(p\.id\)\)/.test(sync), 'the override is per product id, not a blanket switch');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!server.includes('accept-jumps'), 'the scheduled run never accepts jumps');
});

test('a held product still gets its size extras rebuilt', () => {
  const sync = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  const sizes = sync.indexOf('sizeOptions(vals, bySize.bySize, cost)');
  const held = sync.indexOf('jumpHeld(was, cost, PRICE_JUMP_GUARD)');
  assert.ok(sizes > 0 && held > sizes, 'sizes are rebuilt before the hold decides');
  assert.match(sync.slice(held, held + 400), /if \(attrsChanged\) sets\.push\(attrsSet\(\)\)/);
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
