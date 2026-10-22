/* Discontinued colours drop from the catalogue (owner, 2026-10-20: below 100). */
const test = require('node:test');
const assert = require('node:assert');
const { colourStock, closedColours, CLOSEOUT_MIN } = require('../tools/lib/ssa-costs');

const sku = (colorName, sizeName, qty, closeout = false) => ({ colorName, sizeName, warehouses: [{ warehouseAbbr: 'IL', qty, closeout }] });

test('a closeout colour drops once a core size is under the minimum; ordinary colours never do', () => {
  assert.strictEqual(CLOSEOUT_MIN, 100);
  const rows = [
    sku('Black', 'S', 5000), sku('Black', 'M', 0), sku('Black', 'L', 0), sku('Black', 'XL', 0),   // sold out, not closeout
    sku('Mint', 'S', 400, true), sku('Mint', 'M', 99, true), sku('Mint', 'L', 300, true), sku('Mint', 'XL', 300, true),
    sku('Sage', 'S', 900, true), sku('Sage', 'M', 900, true), sku('Sage', 'L', 900, true), sku('Sage', 'XL', 900, true),
    sku('Sage', '4XL', 1, true),                                                                  // only core sizes count
  ];
  const st = colourStock(rows);
  assert.deepStrictEqual(st.Mint, { closeout: true, minCore: 99 });
  const opts = ['Black', 'Mint', 'Sage', 'Our Own Name'].map((title) => ({ title }));
  assert.deepStrictEqual(closedColours(opts, st), ['Mint'], 'Black restocks; Sage still has 900; an unknown name is left alone');
});

test('stock is summed across every warehouse, dropship included', () => {
  const rows = [{ colorName: 'Red', sizeName: 'S', warehouses: [{ qty: 60, closeout: true }, { warehouseAbbr: 'DS', qty: 60, closeout: true }] }];
  assert.deepStrictEqual(colourStock(rows).Red, { closeout: true, minCore: 120 });
});

test('the sync retires a product with no colours left, and never revives it', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(src, /supplier='ssa-retired'/);
  assert.match(src, /WHERE active=0 AND supplier='ssa' AND ssa_auto_off IS NOT NULL/, 'revival reads only ssa rows');
  assert.match(src, /jt_dropped/, 'dropped colours are kept on the field');
});

test('an adult colour is judged on S-XL, not a sold-out XS (Bella 3001 White, 2026-10-20)', () => {
  const rows = [sku('White', 'XS', 0, true), ...['S', 'M', 'L', 'XL'].map((z) => sku('White', z, 4000, true)),
    sku('Youth', 'YS', 50, true), sku('Youth', 'YM', 500, true)];
  const st = colourStock(rows);
  assert.strictEqual(st.White.minCore, 4000);
  assert.strictEqual(st.Youth.minCore, 50, 'youth sizes still count when there are no adult ones');
});


test('a colour with no core sizes is judged on the sizes it has (code review)', () => {
  const st = colourStock([sku('Big', '2XL', 900, true), sku('Big', '3XL', 800, true)]);
  assert.strictEqual(st.Big.minCore, 800);
  assert.deepStrictEqual(closedColours([{ title: 'Big' }], st), []);
});

test('the add tool filters discontinued colours before sizing (code review)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'ssa-add-products.js'), 'utf8');
  const at = src.indexOf('rows = rows.filter((r) => !closed.has(r.colorName))');
  assert.ok(at > 0 && at < src.indexOf('const bySize = costBySize(rows)'), 'rows filtered before costing');
});

test('a dropped default falls back to White, then Black', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(src, /\['White', 'Black'\]\.map/);
});

test('Bella+Canvas keeps every colour: the shop buys it from SanMar (owner, 2026-10-22)', () => {
  const { atSanMar } = require('../tools/lib/ssa-costs');
  for (const n of ['BELLA + CANVAS 3001 Unisex Jersey Tee', 'Bella+Canvas 3001 Unisex Jersey Tee', 'Bella Canvas 3719 Hoodie']) assert.ok(atSanMar(n), n);
  assert.ok(!atSanMar('Gildan 5000 Unisex Heavy Cotton T-Shirt'));
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.match(src, /!atSanMar\(p\.name\) \? closedColours\(/, 'the sync drops no Bella colour');
  assert.match(src, /if \(atSanMar\(p\.name\)\) return false;/, 'the sync never switches off a Bella product gone from S&S');
  const add = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'ssa-add-products.js'), 'utf8');
  assert.match(add, /atSanMar\(brand \+ ' ' \+ name\) \? new Set\(\) :/, 'the add tool keeps Bella closeout colours');
});

test('light tees are never added to the shop (owner, 2026-10-22)', () => {
  const { isLightTee } = require('../tools/lib/ssa-costs');
  assert.ok(isLightTee('Gildan 3000 Unisex Light Cotton T-Shirt'));
  assert.ok(isLightTee('Gildan 3000B Youth Light Cotton T-Shirt'));
  assert.ok(isLightTee('Next Level 6210 Lightweight Tee'));
  assert.ok(!isLightTee('Gildan 5000 Unisex Heavy Cotton T-Shirt'));
  assert.ok(!isLightTee('Gildan 18500 Lightweight Hooded Sweatshirt'), 'only tees');
  const add = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'ssa-add-products.js'), 'utf8');
  assert.match(add, /if \(isLightTee\(name\)\) \{/);
});
