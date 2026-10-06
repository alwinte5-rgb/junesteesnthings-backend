/* Job costs worked out from the price lists (tools/lib/job-costs.js).
 *
 * Run: node --test tests/*.test.js
 *
 * Finances had sales and no costs: every job's cost was a box to type into
 * from the invoice, and none were. These pin the cost of the shop's common
 * jobs to the contract sheets, and pin those sheets to the tool that prices
 * the store, so the cost and the price cannot come from two different lists. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const J = require('../tools/lib/job-costs');

const catalog = {
  products: [
    { id: 10, name: 'Gildan 5000', price: 5.64, cost: 2.82 },
    { id: 11, name: '3in Buttons', price: 0, cost: 0 },
    { id: 12, name: 'Mystery tee', price: 8, cost: 0 },
  ],
  methods: [
    { id: 1, title: 'DTF Printing', type: 'fixed' },
    { id: 3, title: 'Screen Printing — 2 Colors', type: 'fixed' },
    { id: 22, title: 'Screen Printing', type: 'color' },
    { id: 8, title: 'Embroidery — Small Logo (≤6×6 cm, to 8k stitches)', type: 'fixed' },
    { id: 11, title: 'Embroidery — Full Back (≤30×30 cm, 22k–25k stitches)', type: 'fixed' },
    { id: 18, title: 'Embroidery — Name/Text (upper back)', type: 'fixed' },
    { id: 24, title: '3in Button — One design, repeated', type: 'fixed' },
  ],
};
const one = (line) => J.estimateJob([line], catalog);
const r2 = (n) => Math.round(n * 100) / 100;

test('the cost sheets are the ones the store is priced from', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'reprice-anchorfish-2026.js'), 'utf8');
  const lift = (name) => {
    const m = src.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n\\});`));
    assert.ok(m, `${name} not found in the reprice tool`);
    return vm.runInThisContext(`(${m[1]})`);
  };
  const SP = lift('SP');
  for (const f of Object.keys(SP)) assert.deepStrictEqual(J.SCREEN_PRINT[f], SP[f].p, `screen print ${f}+`);
  assert.deepStrictEqual(Object.keys(J.SCREEN_PRINT), Object.keys(SP));
  const DTF = lift('DTF');
  for (const f of Object.keys(DTF)) assert.deepStrictEqual(J.DTF[f], DTF[f].v, `DTF ${f}+`);
  assert.deepStrictEqual(Object.keys(J.DTF), Object.keys(DTF));
  assert.deepStrictEqual(J.EMBROIDERY, lift('EMB'));
  assert.match(src, new RegExp(`const SCREEN_COST = ${J.SCREEN_COST};`));
  /* Two minimums that happen to agree: what the shop SELLS screen printing from
     (the reprice tool writes it into the method) and what Anchorfish BILLS under
     (the job cost reads it). Kept as separate assertions so either can move. */
  assert.match(src, /const SCREEN_MIN_QTY = 50;/);
  assert.strictEqual(J.SCREEN_MIN_QTY, 50);
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, new RegExp(`const SCREEN_FEE_RATE = ${J.SCREEN_FEE};`));
});

test('the shop\'s common job: 100 Gildan 5000s, 1 colour front and back, dark', () => {
  /* Anchorfish quote #18249 (2026-09-10): white on black, left chest + full
     back, billed "2 Color" (Base + White) at $2.06 a place — the base is a
     colour on every shirt — plus 4 screens at $20. docs/pricing-2026.md had
     this at $1.65 a place ($692), which understated the cost by $82. */
  const r = one({ product_id: 10, method_id: 22, colours: 1, stage: 'both', garment_dark: true, qty: 100,
    unit_price: 13.83, addons: [{ code: 'screens', count: 4, total: 100 }] });
  assert.strictEqual(r.complete, true);
  assert.strictEqual(r.lines[0].unit_cost, 6.94);           // 2.82 + 2.06 x 2
  assert.strictEqual(r.outsourced, 80);
  assert.strictEqual(Math.round(r.lines[0].unit_cost * 100 + r.outsourced), 774);
});

test('a legacy per-colour method reads its count from its title', () => {
  const r = one({ product_id: 10, method_id: 3, qty: 50, unit_price: 9 });
  assert.strictEqual(r.lines[0].unit_cost, 2.82 + 2.25);
});

test('screen print under 50 is billed by Anchorfish as 50', () => {
  const r = one({ product_id: 10, method_id: 22, colours: 1, qty: 25, unit_price: 12 });
  assert.strictEqual(r.lines[0].unit_cost, Math.round((2.82 + 1.80 * 2) * 100) / 100);
});

test('DTF: the main print, plus the additional-location rate for a second side', () => {
  assert.strictEqual(one({ product_id: 10, method_id: 1, qty: 12, unit_price: 20 }).lines[0].unit_cost, 2.82 + 5.63);
  assert.strictEqual(one({ product_id: 10, method_id: 1, stage: 'both', qty: 12, unit_price: 25 }).lines[0].unit_cost,
    Math.round((2.82 + 5.63 + 1.80) * 100) / 100);
  // Back only is one print, at the main rate.
  assert.strictEqual(one({ product_id: 10, method_id: 1, stage: 'mr8a5dlx', qty: 12, unit_price: 20 }).lines[0].unit_cost, 2.82 + 5.63);
});

test('embroidery is costed at Anchorfish\'s rate (the owner\'s choice), by logo size', () => {
  assert.strictEqual(one({ product_id: 10, method_id: 8, qty: 24, unit_price: 30 }).lines[0].unit_cost, 2.82 + 4.25);
  assert.strictEqual(one({ product_id: 10, method_id: 11, qty: 100, unit_price: 80 }).lines[0].unit_cost, r2(2.82 + 13.05));
  assert.strictEqual(one({ product_id: 10, method_id: 18, qty: 6, unit_price: 50 }).lines[0].unit_cost, 2.82 + 5);
  assert.match(one({ product_id: 10, method_id: 8, qty: 24, unit_price: 30 }).lines[0].basis, /Anchorfish embroidery/);
});

test('a line in a run group is costed at the pooled quantity', () => {
  const r = J.estimateJob([
    { product_id: 10, method_id: 1, qty: 12, run_group: 'A', unit_price: 15 },
    { product_id: 10, method_id: 1, qty: 13, run_group: 'A', unit_price: 15 },
  ], catalog);
  assert.deepStrictEqual(r.lines.map((l) => l.unit_cost), [2.82 + 4.50, 2.82 + 4.50]);   // the 25+ band
});

test('a typed garment price and size upcharges are costed at the product\'s ratio', () => {
  const r = one({ product_id: 10, method_id: 1, qty: 10, blank_price: 6.00, size_upcharge: 20, unit_price: 30 });
  // (6.00 + 20/10) x (2.82/5.64) + 7.03
  assert.strictEqual(r.lines[0].unit_cost, r2(4 + 7.03));
});

test('buttons and other products without a sheet are half the price, marked rough', () => {
  const r = one({ product_id: 11, method_id: 24, qty: 100, unit_price: 1.10 });
  assert.strictEqual(r.lines[0].unit_cost, 0.55);
  assert.match(r.lines[0].basis, /rough/);
});

test('a product with no S&S cost on file is half its price', () => {
  assert.strictEqual(one({ product_id: 12, qty: 1, unit_price: 8 }).lines[0].unit_cost, 4);
});

test('add-ons: screens at $20, freight passed through, design work free', () => {
  const r = J.estimateJob([
    { product_id: 10, method_id: 22, colours: 2, qty: 50, unit_price: 10,
      addons: [{ code: 'screens', total: 75 }, { code: 'design_setup', total: 30 }] },
    { product_id: 11, method_id: 24, qty: 10, unit_price: 3, addons: [{ code: 'cutout_ship', total: 10 }] },
  ], catalog);
  assert.strictEqual(r.outsourced, 60);        // 3 screens (75 / 25) x 20
  assert.strictEqual(r.shipping, 10);
});

test('a job is complete only when every line it bought can be costed', () => {
  // A typed line with no price and no words to go on cannot be costed.
  const r = J.estimateJob([
    { product_id: 10, method_id: 1, qty: 12, unit_price: 20 },
    { description: 'Misc', qty: 1, unit_price: 0 },
  ], catalog);
  assert.strictEqual(r.complete, false);
  assert.deepStrictEqual(r.missing, ['Misc']);
});

test('service lines cost nothing; declined options and typed costs are left alone', () => {
  const r = J.estimateJob([
    { description: 'Design setup fee', qty: 1, unit_price: 30 },
    { product_id: 10, method_id: 1, qty: 12, unit_price: 20, optional: true },
    { product_id: 10, method_id: 1, qty: 12, unit_price: 20, unit_cost: 9 },
  ], catalog);
  assert.strictEqual(r.complete, true);
  assert.deepStrictEqual(r.lines, [{ ix: 0, unit_cost: 0, basis: 'service: no supplier cost', estimated: false }]);
});

test('a product gone from the catalogue is read by its words, and named when there are none', () => {
  const r = one({ product_id: 999, method_id: 1, qty: 12, unit_price: 0, description: 'Old thing' });
  assert.strictEqual(r.complete, false);
  assert.match(r.missing[0], /no longer in the catalogue/);
  const t = one({ product_id: 999, qty: 12, unit_price: 20, description: 'Old tee' });
  assert.strictEqual(t.complete, true);
});

/* ── Lines typed by hand: the seven jobs the first run could not cost ── */
const shop = {
  products: [
    { id: 10, name: 'Gildan 5000 Heavy Cotton T-Shirt', price: 5.64, cost: 2.82 },
    { id: 20, name: 'Comfort Colors 1717 Garment-Dyed Heavyweight T-Shirt', price: 13.00, cost: 6.50 },
    { id: 21, name: 'Comfort Colors 1566 Garment-Dyed Crewneck Sweatshirt', price: 40.00, cost: 20.00 },
    { id: 30, name: 'Rabbit Skins 3321 Toddler Fine Jersey Tee', price: 7.00, cost: 3.50 },
    { id: 31, name: 'Gildan 5000B Youth Heavy Cotton T-Shirt', price: 5.00, cost: 2.50 },
  ],
  methods: [],
};
const typed = (description, qty, unit_price) => J.estimateJob([{ description, qty, unit_price, manual: true }], shop);

test('a typed shirt line is costed as the garment its words name, plus half the rest', () => {
  const r = typed('Comfort Colors T-shirt - Navy Blue', 24, 25);
  assert.strictEqual(r.complete, true);
  // 6.50 S&S + (25 - 13) / 2
  assert.strictEqual(r.lines[0].unit_cost, 12.5);
  assert.match(r.lines[0].basis, /Comfort Colors 1717 .*matched by wording.*rough: half/);
});

test('age words pick the right blank, and never an adult one for a toddler', () => {
  assert.match(typed('Toddler Shirt BULK', 20, 12).lines[0].basis, /Rabbit Skins 3321 Toddler/);
  assert.match(typed('Youth/Adult Shirt BULK', 40, 10).lines[0].basis, /Gildan 5000B Youth/);
  const noToddler = J.estimateJob([{ description: 'Toddler Shirt BULK', qty: 20, unit_price: 12 }],
    { products: shop.products.filter((p) => p.id !== 30), methods: [] });
  assert.match(noToddler.lines[0].basis, /^rough: half the price$/);
});

test('a typed embroidery line is costed at the Anchorfish rate for its size', () => {
  const r = typed('Embroidery Chest Logo', 24, 20);
  assert.strictEqual(r.lines[0].unit_cost, 4.25);
  assert.match(r.lines[0].basis, /Anchorfish embroidery rate \(matched by wording\)/);
  assert.strictEqual(typed('Embroidered full back', 100, 75).lines[0].unit_cost, 13.05);
});

test('typed DTF and screen print lines read their sheet, sides and colours included', () => {
  assert.strictEqual(typed('DTF front and back', 12, 25).lines[0].unit_cost, Math.round((5.63 + 1.80) * 100) / 100);
  assert.strictEqual(typed('Screen print 2 color', 100, 5).lines[0].unit_cost, 2.06);
});

test('upcharges, signs, jeans, jerseys and sublimation are half their price, marked rough', () => {
  for (const [d, q, p] of [['2XL Upcharge', 4, 2], ['1000 Door Hangers', 1000, 0.3], ['24x18 Yard Signs - 100 pack', 1, 450],
    ['Step Stakes for Yard Signs 100 pack', 1, 90], ['Car Magnet', 2, 40], ['Custom Print on Jeans - 2 pair- Princess & Frog', 2, 45],
    ['Names/Numbers - Soccer Jersey', 15, 12], ['Sublimation full front extended print', 10, 30]]) {
    const r = typed(d, q, p);
    assert.strictEqual(r.complete, true, d);
    assert.strictEqual(r.lines[0].unit_cost, Math.round(p / 2 * 100) / 100, d);
    assert.strictEqual(r.lines[0].basis, 'rough: half the price', d);
  }
});
