'use strict';
/* The mug on the quote form is the designer's price (owner, 2026-11-25): one
 * all-in price, printing included. The form and the save both put the item's
 * own decoration on the line, and a line holding the retired SinaLite mug
 * becomes the shop's own mug. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SL = require('../tools/lib/sinalite');

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
const { priceLine } = vm.runInThisContext(
  vm.runInThisContext(lift('quotePricingSource') + '\nquotePricingSource()') + '\n({ priceLine })');
const F = vm.runInThisContext(`(function (SINALITE, QSIGNS) {
  ${lift('sizedKindOf')}\n${lift('retiredSinalite')}\n${lift('retiredReplacement')}\n${lift('allInMethods')}\n${lift('withoutRetired')}
  return { retiredReplacement, allInMethods, withoutRetired }; })`)(SL, require('../tools/lib/quote-signs'));

const M = (id, title, one) => ({ id, title, active: true, use_for_quoting: true, type: 'fixed', min_order_qty: 0,
  positions: { front: [{ min_qty: 11, price: one }, { min_qty: 10000, price: 15 }] } });
const MUG = M(90, 'All-in — Mug 11.8 oz (printing included)', 20.98);
const MUG15 = M(91, 'All-in — Mug 15 oz (printing included)', 23.98);
const SUB = M(50, 'Sublimation — Polyester Only', 14);
const shop = (id, name, ids) => ({ id, name, price: 0, supplier: 'shop', printing_ids: ids, sizes: [] });
const catalog = { methods: [MUG, MUG15, SUB], products: [
  shop(1, 'White Ceramic Sublimation Mug — 11.8 oz', [90]),
  shop(2, 'White Ceramic Sublimation Mug — 15 oz', [91]),
  { id: 223, name: 'Ceramic Mugs — 11oz, printed', price: 0, supplier: 'sinalite', printing_ids: [] },
  { id: 4, name: 'Gildan 5000', price: 8, supplier: 'ssa', printing_ids: [50] },
  shop(5, 'Two ways', [90, 50])] };

test('one mug is the designer price, whichever way the line got there', () => {
  const ai = F.allInMethods(catalog);
  assert.deepStrictEqual(Object.keys(ai), ['1', '2'], 'only single all-in shop items');
  const unit = (pid) => priceLine({ product: catalog.products.find((p) => p.id === pid), qty: 1, addons: [], blankTiers: [],
    prints: [{ loc: 'front', method: ai[pid], colours: '' }] }).unit;
  assert.strictEqual(unit(1), 20.98);
  assert.strictEqual(unit(2), 23.98);
});

test('the product list prices it with the line\'s own engine, in server scope', () => {
  assert.ok(src.includes('money(allInEach(p, ALL_IN'), 'the label');
  assert.match(lift('allInEach'), /priceLine\(/, 'tierAt is not in server scope');
});

test('a line holding the SinaLite mug opens as the shop mug; a typed price stays', () => {
  const old = { product_id: 223, qty: 1, sign: { kind: 'mug', mat: '1side', size: '11oz' }, sign_priced: true, manual: true,
    unit_override: 62, details: '11oz · blue', details_note: 'blue', description: 'Ceramic Mugs — 11oz, printed for Pat' };
  const it = F.withoutRetired(old, catalog);
  assert.strictEqual(it.product_id, 1);
  assert.deepStrictEqual(it.prints, [{ loc: 'front', method_id: 90 }]);
  assert.strictEqual(it.sign, null);
  assert.strictEqual(it.unit_override, null, 'the SinaLite price is not carried as a typed one');
  assert.strictEqual(it.details, 'blue');
  assert.strictEqual(it.description, 'White Ceramic Sublimation Mug — 11.8 oz for Pat');
  assert.strictEqual(F.withoutRetired({ ...old, sign_priced: false, unit_override: 26 }, catalog).unit_override, 26);
  const gone = { ...catalog, methods: [SUB] };
  assert.strictEqual(F.withoutRetired(old, gone), old, 'never a $0 shop mug');
  assert.strictEqual(F.withoutRetired({ ...old, sign: null, details: 'logo left' }, catalog).details, 'logo left');
  const tee = { product_id: 4, qty: 5 };
  assert.strictEqual(F.withoutRetired(tee, catalog), tee, 'other lines untouched');
  assert.strictEqual(F.retiredReplacement(catalog.products[2], { products: [] }), null, 'no replacement: refused on save');
});

/* allInSync runs in the browser: the same rows, as plain objects. */
const sync = vm.runInThisContext(`(function (ALL_IN, ALL_IN_IDS) { ${lift('allInSync')} return allInSync; })`)({ 1: '90', 2: '91' }, ['90', '91']);
function line(rows) {
  const els = rows.map(([on, m]) => { const pon = { checked: on }, pm = { value: m };
    return { pon, pm, dataset: {}, querySelector: (s) => (s === '.pon' ? pon : pm) }; });
  return { els, querySelector: () => null, querySelectorAll: () => els };
}
const state = (L) => L.els.map((r) => [r.pon.checked, r.pm.value]);
test('the form puts the mug\'s own decoration on, once, and gives back what it replaced', () => {
  let L = line([[true, ''], [false, '']]); sync(L, { id: 1 });
  assert.deepStrictEqual(state(L), [[true, '90'], [false, '']], 'picked, so priced at once');
  L = line([[true, '50'], [false, '']]); sync(L, { id: 1 });
  assert.deepStrictEqual(state(L)[0], [true, '90'], 'plain sublimation on a $0 mug is not the price');
  L = line([[false, ''], [true, '90']]); sync(L, { id: 1 });
  assert.deepStrictEqual(state(L), [[false, ''], [true, '90']], 'already on: left where it is');
  L = line([[true, '90'], [true, '90']]); sync(L, { id: 2 });
  assert.deepStrictEqual(state(L), [[true, '91'], [false, '']], '11.8 oz changed to 15 oz, charged once');
  L = line([[true, '90'], [false, '']]); sync(L, { id: 4 });
  assert.deepStrictEqual(state(L)[0], [true, ''], 'a tee never carries a mug price');
  L = line([[true, '50'], [true, '7']]); sync(L, { id: 1 }); sync(L, { id: 1 });
  assert.deepStrictEqual(state(L), [[true, '90'], [false, '']], 'two print places are one price');
  sync(L, { id: 2 }); sync(L, { id: 4 });
  assert.deepStrictEqual(state(L), [[true, '50'], [true, '7']], 'picked by mistake: the tee keeps its printing');
});

test('a new or cleared line does not inherit the printing another line\'s mug replaced', () => {
  assert.strictEqual((src.match(/\.ploc\[data-was\]/g) || []).length, 2, 'addLine and the cleared only line');
});

test('on an agreed quote only newly added items follow the rule', () => {
  assert.deepStrictEqual(Object.keys(F.allInMethods(catalog, [{ product_id: 1 }])), ['2']);
  assert.deepStrictEqual(Object.keys(F.allInMethods(catalog, [])), ['1', '2']);
});

test('the save applies the same rules, and never to an agreed quote', () => {
  const i = src.indexOf("app.post(['/admin/api/quotes', '/admin/api/quotes/:code']");
  const route = src.slice(i, i + 40000);
  assert.ok(route.includes('allInMethods(catalog, agreedItems)'));
  assert.ok(route.includes('if (retiredSinalite(prod) && !(agreedItems'));
  assert.strictEqual((route.match(/&& !notItsOwn\(m\)\)/g) || []).length, 2, 'the hidden method field cannot bring it back');
  assert.ok(route.includes('method: ownAllIn'));
  assert.ok(src.includes('allInMethods(catalog, agreed ? E.items : null)'));
});

test('the retired mug names its replacement, and a re-capture keeps it', () => {
  assert.strictEqual(SL.table().families.mug.replaced_by, 'White Ceramic Sublimation Mug — 11.8 oz');
  assert.strictEqual(require('../tools/sinalite-assemble.js').META.mug.replaced_by, SL.table().families.mug.replaced_by);
  assert.ok(fs.readFileSync(path.join(__dirname, '..', 'tools', 'add-shop-mugs.js'), 'utf8').includes(`name: '${SL.table().families.mug.replaced_by}'`));
});
