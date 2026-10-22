'use strict';

/* The list prices Claude quotes from in a lead reply (owner, 2026-10-22: "but
 * you know the prices"). Built from the designer's catalogue; the shapes below
 * are the live jt-catalog.php ones. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../tools/lib/lead-prices');
const C = require('../tools/lib/reply-coach');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const DTF = { id: 1, title: 'DTF Printing', active: true, use_for_quoting: true, type: 'fixed', min_order_qty: 0,
  positions: { id: [{ min_qty: 4, price: 20.75 }, { min_qty: 11, price: 18.75 }, { min_qty: 24, price: 16.75 }],
               mr8a5dlx: [{ min_qty: 4, price: 5.95 }, { min_qty: 11, price: 5.5 }, { min_qty: 24, price: 5.25 }] } };
const SCREEN = { id: 22, title: 'Screen Printing', active: true, use_for_quoting: true, type: 'color', min_order_qty: 50,
  positions: { front: [{ min_qty: 99, price: 3.85, colors: { '1-color': 3.85, '2-color': 4.8 } },
                       { min_qty: 249, price: 3.45, colors: { '1-color': 3.45, '2-color': 4.35 } }] } };
const XL = { id: 19, title: 'Embroidery — Extra Large Logo', active: true, use_for_quoting: false, type: 'fixed',
  positions: { front: [{ min_qty: 11, price: 60 }] } };
const OFF = { id: 2, title: 'Screen Printing — 1 Color', active: false, use_for_quoting: true, type: 'fixed',
  positions: { front: [{ min_qty: 99, price: 3.85 }] } };
const TEE = { id: 5, name: 'Bella+Canvas 3001 Unisex Jersey Tee', price: 9.24, printing_ids: [1, 22],
  sizes: [{ size: 'S', upcharge: 0 }, { size: '2XL', upcharge: 3.26 }] };
const HOODIE = { id: 6, name: 'Independent Trading IND5000P Unisex Legend Premium Heavyweight Cross-Grain Hoodie', price: 62.74, printing_ids: [1], sizes: [] };
const LS = { id: 7, name: 'American Apparel 1304 Unisex Heavyweight Cotton Long Sleeve Tee', price: 13.94, printing_ids: [1], sizes: [] };
const CAP = { id: 8, name: 'Adams Headwear LP101 Optimum Pigment-Dyed Dad Hat', price: 12.16, printing_ids: [1], sizes: [] };
const CAT = { ok: true, products: [TEE, HOODIE, LS, CAP], methods: [DTF, SCREEN, XL, OFF] };

test('a ladder keys on band ceilings: 1-4, 5-11, 12-24, starting at the method minimum', () => {
  assert.strictEqual(P.ladder(DTF.positions.id), '1-4 $20.75, 5-11 $18.75, 12-24 $16.75');
  assert.strictEqual(P.ladder(SCREEN.positions.front, { from: 50 }), '50-99 $3.85, 100-249 $3.45');
});

test('DTF lists its first-location and additional-location prices; screen print a column per ink count', () => {
  assert.deepStrictEqual(P.methodLines(DTF), ['DTF Printing, per piece:',
    '  first location: 1-4 $20.75, 5-11 $18.75, 12-24 $16.75', '  each additional location: 1-4 $5.95, 5-11 $5.50, 12-24 $5.25']);
  const s = P.methodLines(SCREEN).join('\n');
  assert.match(s, /^Screen Printing \(minimum 50 pieces\), per piece per location, by ink colors:/);
  assert.match(s, /1-color: 50-99 \$3\.85, 100-249 \$3\.45/);
  assert.match(s, /2-color: 50-99 \$4\.80, 100-249 \$4\.35/);
});

test('the garments are the ones they asked about: a style number first, then the kind of garment', () => {
  assert.strictEqual(P.pickProducts(CAT.products, 'Do you have IND5000P in green?')[0], HOODIE);
  const ls = P.pickProducts(CAT.products, 'price on a long sleeve t-shirt?');
  assert.ok(ls.includes(LS) && ls.includes(TEE));
  assert.deepStrictEqual(P.pickProducts(CAT.products, 'can you embroider a hat'), [CAP, TEE], 'the staple tee rides along');
  // Each kind they name gets its own room: cheap tees do not crowd out the aprons (Capriccio, #187).
  const APRON = { id: 9, name: 'Artisan Collection RP144 Annex Oxford Bib Apron', price: 24.18, printing_ids: [1], sizes: [] };
  const tees = Array.from({ length: 30 }, (_, i) => ({ ...TEE, id: 100 + i, name: 'Cheap Unisex Tee ' + i, price: 3 + i / 10 }));
  assert.ok(P.pickProducts([...tees, APRON], 'custom printed T-shirts and aprons for my restaurant').includes(APRON));
  // "long and short sleeved" asks for long sleeves too (Linda, #231).
  assert.ok(P.pickProducts(CAT.products, 'how much on a long and short sleeved t shirt').includes(LS));
  // A baby tee never fills an adult slot; it is offered when they ask for youth.
  const INFANT = { id: 10, name: 'BELLA + CANVAS 3001B Infant Jersey Tee', price: 6.86, printing_ids: [1], sizes: [] };
  assert.ok(!P.pickProducts([...CAT.products, INFANT], 'shirts for the team').includes(INFANT));
  assert.ok(P.pickProducts([...CAT.products, INFANT], 'youth and adult shirts').includes(INFANT));
  assert.ok(P.pickProducts(Array.from({ length: 40 }, (_, i) => ({ ...TEE, id: i })), 'tees').length <= P.MAX_PRODUCTS);
});

test('the sheet quotes the designer to the cent: B+C 3001 + one DTF print at 1 piece = $9.24 + $20.75', () => {
  const s = P.priceSheet(CAT, 'I need one Bella+Canvas 3001 and 8 long sleeve', { blankTiers: [{ min: 100, pct: 6 }, { min: 35, pct: 3 }] });
  assert.match(s, /- Bella\+Canvas 3001 Unisex Jersey Tee: \$9\.24 \(2XL \+\$3\.26\); can take: DTF Printing, Screen Printing/);
  assert.match(s, /first location: 1-4 \$20\.75/);
  assert.match(s, /Garment volume break: 3% off at 35\+, 6% off at 100\+; none below 35\./);
  assert.match(s, /white base/);
  // Only what the quote form may price from: no inactive row, no embroidery #19.
  assert.doesNotMatch(s, /Extra Large Logo|Screen Printing — 1 Color/);
  assert.doesNotMatch(s, /Screens: \$/, 'the screen fee only once it bills');
  assert.match(P.priceSheet(CAT, 'x', { screenFee: 25 }), /Screens: \$25\.00 per screen/);
  // No screen printing in the list, no screen-printing rule either (code review).
  assert.doesNotMatch(P.priceSheet({ ...CAT, methods: [DTF] }, 'tees'), /white base/);
});

test('no catalogue, no price list: the reply falls back to [June to fill in]', () => {
  assert.strictEqual(P.priceSheet(null, 'tees'), '');
  assert.strictEqual(P.priceSheet({ products: [], methods: [], failed: true }, 'tees'), '');
});

test('the price list reaches Claude as data, and the route builds it from the live catalogue', () => {
  const msg = C.askMessage({ job: { code: 'enquiry #1', name: 'A', today: '2026-10-22', items: [] }, history: [],
    ask: C.validateAsk({}).ask, money: false, prices: 'DTF <b>$20.75</b>' });
  assert.match(msg, /<price_list>\nDTF &lt;b&gt;\$20\.75&lt;\/b&gt;\n<\/price_list>/);
  assert.doesNotMatch(C.askMessage({ job: { code: 'x', items: [] }, history: [], ask: C.validateAsk({}).ask }), /price_list/);
  assert.match(C.SYSTEM, /use only the figures given in the job or in the shop's <price_list>/);
  const at = src.indexOf("app.post('/admin/api/lead/:id/suggest-followup'");
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /LEADPRICES\.priceSheet\(await getCatalog\(\)\.catch\(\(\) => null\), l\.description, \{\s*blankTiers: BLANK_TIERS, screenFee: SCREEN_FEES_LIVE \? SCREEN_FEE_RATE : 0, addons: ADDONS \}\)/);
  assert.match(route, /history, playbook, ask, money: false, pictures, prices,/);
  assert.match(route, /Say it is an estimate and the exact price comes on their written quote; sales tax is extra/);
});
