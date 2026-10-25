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
  assert.match(s, /- Bella\+Canvas 3001 Unisex Jersey Tee \[100% cotton \(heather colors are blends\)\]: \$9\.24 \(2XL \+\$3\.26\); can take: DTF Printing, Screen Printing/);
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

test('each garment carries its colors (the ones they named first) and a jtees.net link; services are not garments', () => {
  const tee = { ...TEE, colours: [{ name: 'Black' }, { name: 'Asphalt' }, { name: 'Charcoal Heather' }, { name: 'Black' }] };
  const FEE = { id: 77, name: 'Design fee tee artwork', price: 25, service: true, printing_ids: [], sizes: [] };
  const s = P.priceSheet({ ...CAT, products: [tee, FEE] }, 'charcoal tees with cream design');
  assert.match(s, /- Bella\+Canvas 3001 Unisex Jersey Tee(?: \[[^\]]+\])*: \$9\.24 .*; link: https:\/\/www\.jtees\.net\/p\/5; colors: Charcoal Heather, Black, Asphalt$/m);
  assert.doesNotMatch(s, /Design fee/);
  const many = { ...TEE, colours: Array.from({ length: 50 }, (_, i) => ({ name: 'Color ' + i })).concat([{ name: 'Alpine Green' }]) };
  const list = P.colourList(many, 'alpine green hoodie');
  assert.match(list, /^Alpine Green, Color 0, /, 'the color they asked for is never cut');
  assert.match(list, / and 11 more$/);
  assert.strictEqual(P.colourList({ ...TEE, colours: [] }, 'x'), '');
  assert.match(P.priceSheet({ ...CAT, products: [{ ...TEE }] }, 'tees'), /colors: not listed/);
});

test('/p/:id sends a whole-number id to the designer page, anything else to all products', () => {
  const at = src.indexOf("app.get('/p/:id'");
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /\/\^\\d\{1,7\}\$\/\.test\(req\.params\.id\)/);
  assert.match(route, /`https:\/\/design\.jtees\.net\/editor\.php\?product_base=\$\{id\}` : 'https:\/\/design\.jtees\.net\/products\.php'/);
  assert.strictEqual(P.productLink('12'), 'https://www.jtees.net/p/12');
});

test('light tees are never offered; the Gildan 5000 leads a tee order and the Gildan 8000 a uniform order', () => {
  const LIGHT = { id: 11, name: 'Gildan 3000 Unisex Light Cotton T-Shirt', price: 4.86, printing_ids: [1], sizes: [] };
  const LIGHT_YOUTH = { id: 12, name: 'Gildan 3000B Youth Light Cotton T-Shirt', price: 4.1, printing_ids: [1], sizes: [] };
  const HEAVY = { id: 13, name: 'Gildan 5000 Unisex Heavy Cotton T-Shirt', price: 6.4, printing_ids: [1], sizes: [] };
  const BLEND = { id: 14, name: 'Gildan 8000 Adult DryBlend 50/50 Tee', price: 6.9, printing_ids: [1], sizes: [] };
  const all = [LIGHT, LIGHT_YOUTH, HEAVY, BLEND, ...CAT.products];
  for (const ask of ['price on a t-shirt?', 'shirts for my family reunion', 'youth tees for the kids', 'Do you have the 3000?', 'hi']) {
    const got = P.pickProducts(all, ask);
    assert.ok(!got.includes(LIGHT) && !got.includes(LIGHT_YOUTH), `a light tee was offered for "${ask}"`);
  }
  assert.strictEqual(P.pickProducts(all, 'price on a t-shirt?')[0], HEAVY);
  assert.deepStrictEqual(P.pickProducts(all, 'work shirts for our staff uniforms').slice(0, 2), [BLEND, HEAVY]);
  const sheet = P.priceSheet({ ok: true, products: all, methods: [DTF] }, 'uniform shirts for staff');
  assert.match(sheet, /- Gildan 8000 Adult DryBlend 50\/50 Tee \(our tee for uniform orders\) \[50\/50 cotton-polyester blend\]: \$6\.90/);
  assert.match(sheet, /- Gildan 5000 Unisex Heavy Cotton T-Shirt \(our regular tee\) \[100% cotton \(heather colors are blends\)\]: \$6\.40/);
  assert.doesNotMatch(sheet, /Light Cotton/);
  assert.strictEqual(P.shopPick(BLEND, 'do you have the 8000 in red?'), '', 'the uniform label is for uniform enquiries');
});

test('the reply leads with the shop\'s pick, checks colors against the list, and links what it names', () => {
  const at = src.indexOf("app.post('/admin/api/lead/:id/suggest-followup'");
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.doesNotMatch(route, /cheapest garment/);
  assert.match(route, /lead with the shop\\'s pick, marked in the list/);
  assert.match(route, /"our regular tee" for a regular order, "our tee for uniform orders"/);
  assert.match(route, /say a garment comes in a color only when that color is in its colors list/);
  assert.match(route, /Give each garment you name its link from the list/);
});

/* 2026-10-24, a customer asked for women's fit tees: the list held the cheapest tees
   of any cut, so the reply led with the unisex pick and offered a performance tee. */
test("a women's fit gets the women's cuts first, and cotton never gets a performance tee", () => {
  const g = (id, name, price) => ({ id, name, price, sizes: [], printing_ids: [1] });
  const catalog = { methods: [DTF], products: [
    g(12, 'Gildan 5000 Unisex Heavy Cotton T-Shirt', 6.40), g(14, 'Bella+Canvas 3001 Unisex Jersey Tee', 9.24),
    g(436, "CORE365 CE10W Women's Capital Performance T-Shirt", 5.88), g(63, 'Bella+Canvas BC6004 — Women’s The Favorite T-Shirt', 8.66),
    g(178, "econscious EC3000 Women's Classic Organic T-Shirt", 10.60), g(64, 'Next Level NL3900 — Women’s Boyfriend T-Shirt', 7.96),
    g(90, 'Gildan 2000 Adult Ultra Cotton T-Shirt', 5.10),
  ] };
  const names = (asked) => P.pickProducts(catalog.products, asked).map((p) => p.id);

  /* Women's, cotton: the women's cotton cuts lead; the performance tee is not offered at all. */
  const wc = names("Hi, I need 5 women's fit cotton t-shirts with my logo");
  assert.ok(!wc.includes(436), 'no performance tee when they asked for cotton');
  assert.deepStrictEqual(wc.slice(0, 3).sort(), [63, 64, 178].sort(), "women's cotton cuts first: " + wc);
  assert.ok(wc.indexOf(12) > 2, 'the unisex pick comes after them, as an extra');
  /* Women's, no fabric said: women's cuts first (the performance one marked as such). */
  const w = names("women's tees for my team, 6 shirts");
  assert.ok(w.slice(0, 4).every((id) => [436, 63, 64, 178].includes(id)), "women's cuts first: " + w);
  const sheet = P.priceSheet(catalog, "women's tees for my team, 6 shirts");
  assert.match(sheet, /CE10W Women's Capital Performance T-Shirt \[women's cut\] \[performance \(polyester\), not cotton\]/);
  assert.match(sheet, /BC6004 — Women’s The Favorite T-Shirt \[women's cut\] \[100% cotton/);
  assert.match(sheet, /EC3000 Women's Classic Organic T-Shirt \[women's cut\] \[100% organic cotton\]/);
  /* Not asked: unchanged, the shop's pick leads. */
  assert.strictEqual(names('20 t-shirts for a family reunion')[0], 12);
  /* Fabric from the name, or the known everyday styles, or nothing. */
  assert.strictEqual(P.fabric('Gildan 2000 Adult Ultra Cotton T-Shirt'), 'cotton');
  assert.strictEqual(P.fabric('Gildan 8000 Adult DryBlend 50/50 Tee'), '50/50 cotton-polyester blend');
  assert.strictEqual(P.fabric('Mystery Brand Tee'), '');
  /* And the reply is told what to do with it. */
  const route = src.slice(src.indexOf("app.post('/admin/api/lead/:id/suggest-followup'"), src.indexOf("app.post('/admin/api/quote/:code/review-message'"));
  assert.match(route, /When they ask for a women\\'s or ladies\\' fit, offer the women\\'s-cut garments in the list first/);
  assert.match(route, /never one marked performance or polyester/);
});

/* The lead reply's instructions were 2,123 characters and the note limit 2,000, so the
   end ("No discounts, rush fees or dates of your own, no pressure.") never reached Claude. */
test('the lead reply instructions reach Claude whole, with room for a change of 500', () => {
  const a = src.indexOf('const fillIn = (prices');
  const b = src.indexOf("const { ask } = REPLYCOACH.validateAsk({ channel: 'email'", a);
  assert.ok(a > -1 && b > a, 'the instructions are found');
  const build = (prices, lastOut, days) => {
    const out = {};
    new Function('prices', 'lastOut', 'days', 'out', 'req', 'LEAD_CHANGE_MAX',
      src.slice(a, b).replace(/\bconst (\w+) =/g, 'var $1 = out.$1 =') )(prices, lastOut, days, out, { body: {} }, 500);
    return out.note;
  };
  for (const note of [build('x', null, 0), build('x', {}, 12), build('', null, 0)]) {
    const change = 'x'.repeat(500);
    const full = `The shop has read the draft and wants this changed: "${change}". Rewrite the draft to do exactly that, `
      + 'and keep everything else in it that is still right. This overrides any rule below that conflicts with it. ' + note;
    const { ask } = C.validateAsk({ note: full });
    assert.strictEqual(ask.note, full.slice(0, C.LIMITS.note));
    assert.ok(full.length <= C.LIMITS.note, `the note fits: ${full.length} of ${C.LIMITS.note}`);
    assert.match(ask.note, /No discounts, rush fees or dates of your own, no pressure\./);
  }
});

test('"Tell Claude what to change" on a lead reaches Claude, last and in its own words', () => {
  const route = src.slice(src.indexOf("app.post('/admin/api/lead/:id/suggest-followup'"), src.indexOf("app.post('/admin/api/quote/:code/review-message'"));
  assert.match(route, /const change = String\(\(req\.body \|\| \{\}\)\.change \|\| ''\)\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)\.slice\(0, LEAD_CHANGE_MAX\);/);
  assert.match(route, /wants this changed: "\$\{change\}"\. Rewrite the draft to do exactly that/);
  /* First in the note, so a long note never loses it; worded for no draft yet too. */
  assert.match(route, /validateAsk\(\{ channel: 'email', draft, note: asked \+ note \}\)/);
  assert.match(route, /: `The shop wants this in the reply: "\$\{change\}"\. Do exactly that\./);
  /* The page has the box and sends it with the draft. */
  const box = src.slice(src.indexOf('function leadEmailBox('), src.indexOf("const shopMonth = (d) =>"));
  assert.match(box, /<input data-lchange maxlength="\$\{LEAD_CHANGE_MAX\}"/);
  assert.match(box, /data-lredo/);
  assert.match(box, /JSON\.stringify\(\{draft:f\.body\.value===f\.body\.defaultValue\?'':f\.body\.value,change:change\|\|''\}\)/);
});

test('fabric and fit words are read the way a customer means them', () => {
  /* A blend is a blend, not performance, even when its name says Poly. */
  assert.strictEqual(P.fabric('Jerzees 29M Dri-Power 50/50 Cotton/Poly T-Shirt'), '50/50 cotton-polyester blend');
  assert.strictEqual(P.fabric('Bella+Canvas 3001 CVC Heather Tee'), 'cotton-polyester blend', 'the CVC is not the cotton 3001');
  assert.strictEqual(P.fabric('Bella+Canvas 3001 Unisex Jersey Tee'), '100% cotton (heather colors are blends)');
  assert.strictEqual(P.fabric('Sport-Tek ST350 PosiCharge Competitor Tee'), 'performance (polyester), not cotton');
  const g = (id, name, price) => ({ id, name, price, sizes: [], printing_ids: [1] });
  const cat = [g(1, 'Jerzees 29M 50/50 Cotton/Poly T-Shirt', 5), g(2, "CORE365 Women's Performance T-Shirt", 5.5),
    g(3, 'Gildan 5000 Unisex Heavy Cotton T-Shirt', 6.4), g(4, "Bella+Canvas 6004 Women's Favorite T-Shirt", 8.66),
    g(5, "Women's Fashion Polo", 12), g(6, 'Girls Youth Tee', 6), g(7, "Women's 50/50 Blend Tee", 6.9)];
  const ids = (asked) => P.pickProducts(cat, asked).map((p) => p.id);
  /* "No cotton" and "cotton candy" are not asking for cotton: performance stays. */
  assert.ok(ids('need moisture wicking shirts, no cotton please').includes(2));
  assert.ok(ids('tees in cotton candy pink').includes(2));
  assert.ok(!ids('cotton tees please').includes(2), 'cotton asked: no performance');
  /* Girls are children: no adult women's cuts pushed first. */
  const kids = ids("15 shirts for my daughter's girls soccer team");
  assert.ok(kids[0] !== 4 && kids[0] !== 2, 'no women\'s cut leads a girls order: ' + kids);
  /* Women's polo shirts: polos, not four women's tees. */
  const polo = ids("women's polo shirts for the front desk");
  assert.strictEqual(polo[0], 5);
  assert.ok(!polo.slice(0, 2).includes(4), 'no women\'s tee ahead of the polo: ' + polo);
  /* Women's cotton: a cotton women's cut ahead of a women's blend. */
  const wc = ids("women's cotton tees");
  assert.ok(wc.indexOf(4) < wc.indexOf(7), 'cotton before blend: ' + wc);
});
