/* SinaLite items: priced from SinaLite's own cost by the owner rule, with a
 * real minimum (owner, 2026-10-14/15). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SL = require('../tools/lib/sinalite');

const FIXTURE = {
  captured: '2026-10-15T12:00:00Z',
  ship_to: 'Chicago IL 60657',
  products: {
    calendar: {
      name: 'Wall Calendars', label: 'Wall Calendars', group: 'Print & Paper', design: 'calendar',
      materials: [{ key: '28pg', label: '28 pages, self cover' }],
      sizes: [{ key: '8.5x11', label: '8.5" x 11"' }],
      rows: [
        { mat: '28pg', size: '8.5x11', qty: 25, cost: 120, ship: 20 },
        { mat: '28pg', size: '8.5x11', qty: 50, cost: 180, ship: 28 },
        { mat: '28pg', size: '8.5x11', qty: 100, cost: 300, ship: 41.2 },
      ],
    },
  },
};

test('the owner rule: cost x2, shipping + $25 rounded up to $5, over the quantity, up to the cent', () => {
  /* The 3,000 brochure run tools/add-services.js priced by hand:
     $274.17 x2 + ($106.62 + $25 -> $135) = $683.34 / 3,000 = $0.2278 -> $0.23 */
  assert.strictEqual(SL.priceEach(274.17, 106.62, 3000), 0.23);
  assert.strictEqual(SL.shipBilled(106.62), 135);
  assert.strictEqual(SL.shipBilled(0), 25);
  assert.strictEqual(SL.shipBilled(20), 45, 'exactly on a $5 step is not rounded further');
  assert.strictEqual(SL.priceEach(0, 10, 100), null, 'no cost, no price');
});

test('the ladder is floor-keyed from the smallest SinaLite tier', () => {
  const lad = SL.ladderFrom(FIXTURE.products.calendar.rows);
  assert.deepStrictEqual(lad.map((r) => r[0]), [25, 50, 100]);
  assert.strictEqual(lad[0][1], SL.priceEach(120, 20, 25));
});

test('a calendar under its minimum of 25 is refused in words; 25 is priced', () => {
  SL._setData(JSON.parse(JSON.stringify(FIXTURE)));
  delete require.cache[require.resolve('../tools/lib/quote-signs')];
  const QS = require('../tools/lib/quote-signs');
  assert.strictEqual(QS.signKindOf('Wall Calendars'), 'calendar');
  const spec = { size: '8.5x11', mat: '28pg' };
  const under = QS.priceSign('calendar', spec, 24, true);
  assert.strictEqual(under.ok, false);
  assert.strictEqual(under.min, 25);
  assert.match(under.error, /minimum of 25/);
  const at = QS.priceSign('calendar', spec, 25, true);
  assert.ok(at.ok);
  assert.strictEqual(at.each, SL.priceEach(120, 20, 25));
  assert.strictEqual(at.freight, 0, 'shipping is inside a SinaLite price, never charged again');
  const between = QS.priceSign('calendar', spec, 70, true);
  /* 70 is not a SinaLite run: it is bought as runs (50 + 25, or 100),
     never at the 50-run each (Codex on #293). */
  const lad = SL.table().families.calendar.prices['28pg']['8.5x11'][''];
  assert.strictEqual(between.each, SL.eachFor(lad, 70));
  assert.ok(between.each * 70 >= Math.min(50 * lad[1][1] + 25 * lad[0][1], 100 * lad[2][1]) - 0.7, '70 costs at least the runs that cover it');
  const opts = QS.sizerOptions().calendar;
  assert.strictEqual(opts.min, 25, 'the form can say "min 25" before a quantity is typed');
  assert.strictEqual(opts.supplier, 'sinalite');
});

test('the published table carries the minimum, the group and the capture date', () => {
  SL._setData(JSON.parse(JSON.stringify(FIXTURE)));
  const t = SL.table();
  assert.strictEqual(t.families.calendar.min, 25);
  assert.strictEqual(t.families.calendar.group, 'Print & Paper');
  assert.strictEqual(t.captured, FIXTURE.captured);
  assert.strictEqual(SL.stale(Date.parse('2026-10-20')), false);
  assert.strictEqual(SL.stale(Date.parse('2026-12-20')), true, 'a sale price read two months ago is stale');
});

const SERVER = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function extract(anchor, end) {
  const i = SERVER.indexOf(anchor);
  assert.ok(i >= 0, 'not found in server.js: ' + anchor);
  const j = SERVER.indexOf(end, i);
  return SERVER.slice(i, j + end.length);
}

test('an each-price under a dollar shows enough places for qty x each to foot', () => {
  const src = extract('function moneyEach(n) {', '\n}');
  const moneyEach = vm.runInThisContext('(' + src + ')');
  assert.strictEqual(moneyEach(310 / 3000), '$0.1033', '3,000 cards with $10 of delivery folded in');
  assert.strictEqual(moneyEach(0.1), '$0.10');
  assert.strictEqual(moneyEach(0.25), '$0.25');
  assert.strictEqual(moneyEach(4.5), '$4.50');
  assert.strictEqual(moneyEach(0), '$0.00');
  assert.strictEqual(moneyEach(310 / 300), '$1.0333', '300 signs with $10 of delivery: over a dollar still foots');
  assert.strictEqual(moneyEach(12.5), '$12.50');
  assert.strictEqual(moneyEach(0.105), '$0.105');
  /* One copy: the quote page's scripts get the server's own function. */
  assert.doesNotMatch(SERVER, /function mEach\(/);
  assert.strictEqual((SERVER.match(/\$\{moneyEach\.toString\(\)\}/g) || []).length, 2);
});

test('quote categories: bought-printed goods are split four ways and never swallow a tee', () => {
  const src = extract('const PRODUCT_GROUPS = [', '\n];');
  const PRODUCT_GROUPS = vm.runInThisContext('(() => {' + src + '; return PRODUCT_GROUPS; })()');
  const groupOf = (n) => (PRODUCT_GROUPS.find(([, re]) => re.test(n)) || ['Everything else'])[0];
  assert.strictEqual(groupOf('Wall Calendars'), 'Print & Paper');
  assert.strictEqual(groupOf('Trifold Brochures 8.5x11'), 'Print & Paper');
  assert.strictEqual(groupOf('Business Cards — single or double-sided'), 'Print & Paper');
  assert.strictEqual(groupOf('Roll Labels'), 'Labels, Stickers & Packaging');
  assert.strictEqual(groupOf('Cut-to-Shape Stickers'), 'Labels, Stickers & Packaging');
  assert.strictEqual(groupOf('Stand-Up Pouches'), 'Labels, Stickers & Packaging');
  assert.strictEqual(groupOf('11oz Ceramic Mugs'), 'Drinkware');
  assert.strictEqual(groupOf('20oz Tumblers'), 'Drinkware');
  assert.strictEqual(groupOf('Table Covers'), 'Signs & Display');
  assert.strictEqual(groupOf('X-Frame Banners'), 'Signs & Display');
  assert.strictEqual(groupOf('Gildan Softstyle Tee - Tear Away Label'), 'T-Shirts', 'a tee label is not a roll label');
  assert.strictEqual(groupOf('Bella+Canvas 3001 Unisex Jersey Tee'), 'T-Shirts');
  assert.strictEqual(groupOf('Independent Pullover Hood with Pouch Pocket'), 'Hoodies & Sweatshirts', 'a pouch pocket is not packaging');
  assert.strictEqual(groupOf('Sport Backpack with Bottle Pocket'), 'Bags & Totes', 'a bottle pocket is not drinkware');
});

test('only sign and paper names get the sizer by name; mugs and stickers need the exact SinaLite name', () => {
  /* The shop decorates its own mugs and stickers in-house: matching "mug" by
     word would hide their print methods and quote the blank (code review,
     2026-10-15). A SinaLite mug is found by quote-signs.js signKindOf. */
  const src = extract('const PRODUCT_GROUPS = [', '\n];') + ';' +
    extract('const SIZED_BY_NAME_RE =', ";\n");
  const RE = vm.runInThisContext('(() => {' + src + '; return SIZED_BY_NAME_RE; })()');
  assert.match('X-Frame Banners — 23.6x63', RE);
  assert.match('Wall Calendars — 8.5x11', RE);
  assert.doesNotMatch('11oz Ceramic Mug', RE);
  assert.doesNotMatch('Custom Stickers', RE);
  assert.doesNotMatch('Gildan Heavy Blend Hood', RE);
});

test('a sized item is offered the design tiers on the form and on the save', () => {
  assert.match(SERVER, /if \(signKind && !addonTitles\.some\(Boolean\)\) addonTitles = \[SIZED_ITEM_TITLE\];/);
  assert.match(SERVER, /if \(!lineTitles\.length && signKind\) lineTitles\.push/);
});

test('table covers say the whole outside is printed (SinaLite templates, not the support reply)', () => {
  /* "Printed 1 Side (4/0)" is one face of the fabric: SinaLite's 3- and
     4-sided templates are single full-cover artworks (2026-10-15). */
  const { META } = require('../tools/sinalite-assemble');
  const tc = META.table_cover;
  assert.match(tc.name, /printed all over/i);
  assert.match(tc.note, /edge to edge/i);
  for (const m of tc.materials) assert.match(m.label, /printed all over/i, m.key);
  assert.doesNotMatch(JSON.stringify(tc), /front panel printed/i);
});

test('stale is worked out on every call, not frozen when the table is first built', () => {
  SL._setData(JSON.parse(JSON.stringify({ ...FIXTURE, captured: new Date(Date.now() - 86400000).toISOString() })));
  assert.strictEqual(SL.table().stale, false);
  SL._setData(JSON.parse(JSON.stringify({ ...FIXTURE, captured: new Date(Date.now() - (SL.STALE_DAYS + 2) * 86400000).toISOString() })));
  assert.strictEqual(SL.table().stale, true);
});

test('an unpriceable cost row is reported by name, not skipped in silence', () => {
  const said = [];
  const orig = console.error;
  console.error = (m) => said.push(String(m));
  try { SL.ladderFrom([{ qty: 25, cost: 0, ship: 10 }, { qty: 50, cost: 90, ship: 10 }], 'calendar 28pg/8.5x11'); }
  finally { console.error = orig; }
  assert.strictEqual(said.length, 1);
  assert.match(said[0], /calendar 28pg\/8\.5x11/);
});

test('a SinaLite line saved without a size and material is refused, not priced at the $0 catalogue price', () => {
  assert.match(SERVER, /else if \(signKind && SINALITE\.table\(\)\.families\[signKind\]\) \{/);
});

test('the supplier-delivery note sits outside the each-price the quote page rewrites', () => {
  assert.match(SERVER, /<td class="num"><span data-each="\$\{ix\}">/);
  assert.match(SERVER, /<\/span>\$\{\s*\/\*[\s\S]{0,200}?\*\/\s*fig\.folded > 0 \?/);
});

test('the category box is re-synced from code-set products and filtered sections are disabled for phones', () => {
  assert.match(SERVER, /function calc\(\)\{\s*pcatSyncAll\(\);/);
  assert.match(SERVER, /g\.disabled = off;/);
});

test('a tier with no usable shipping is reported, not priced with $0 freight', () => {
  const said = [];
  const orig = console.error;
  console.error = (m) => said.push(String(m));
  let lad;
  try { lad = SL.ladderFrom([{ qty: 25, cost: 90 }, { qty: 50, cost: 90, ship: null }, { qty: 75, cost: 90, ship: -1 },
    { qty: 100, cost: 90, ship: 'x' }, { qty: 250, cost: 90, ship: 0 }], 'x'); }
  finally { console.error = orig; }
  assert.deepStrictEqual(lad.map((r) => r[0]), [250], 'only the row with a real (zero) shipping figure is priced');
  assert.strictEqual(said.length, 4);
});

test('stale SinaLite prices are said on the quote sizer and in the morning email', () => {
  const QS = require('../tools/lib/quote-signs');
  SL._setData(JSON.parse(JSON.stringify({ ...FIXTURE, captured: new Date(Date.now() - (SL.STALE_DAYS + 2) * 86400000).toISOString() })));
  const o = QS.sizerOptions().calendar;
  assert.strictEqual(o.stale, true);
  assert.match(o.captured, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(QS.sizerOptions().yard_sign && QS.sizerOptions().yard_sign.stale, undefined, 'Signs365 families carry no SinaLite date');
  assert.match(SERVER, /return health \+ sinaliteStaleHtml\(\) \+/);
  assert.ok(SERVER.includes("(o.stale ? '<div") && SERVER.includes(">Supplier prices last read '"));
});

test('switching Category clears the old product BEFORE filtering, so its section closes', () => {
  const clear = SERVER.indexOf("Cleared FIRST: pcatApply keeps");
  assert.ok(clear > 0, 'category switch handler not found');
  const blank = SERVER.indexOf("sel.value = '';", clear);
  const apply = SERVER.indexOf('pcatApply(sel, t.value);', clear);
  assert.ok(blank > 0 && apply > blank, 'the product is cleared before the filter is applied');
});

test('a quantity between SinaLite runs is bought as runs: the cheapest set that covers it', () => {
  const L = [[1, 316.18], [2, 217.33], [3, 214.09], [5, 204.9], [10, 198.5]];
  assert.strictEqual(SL.eachFor(L, 3), 214.09, 'an exact run is its own price');
  assert.ok(SL.eachFor(L, 4) * 4 >= 2 * 217.33 * 2 - 0.01, 'four covers cost at least two 2-runs');
  assert.ok(SL.eachFor(L, 4) > 214.09, 'never the 3-run price for four (Codex: $168.10 short)');
  assert.strictEqual(SL.eachFor(L, 0), null);
  const B = [[25, 7.53], [500, 0.62], [2500, 0.27], [5000, 0.19]];
  assert.ok(Math.abs(SL.eachFor(B, 3000) * 3000 - 950) < 30, '3,000 brochures: a 5,000 run beats 2,500 + 500');
  assert.ok(SL.eachFor(B, 12000) > 0, 'above the largest run it still prices');
  /* The public quote runs the same function from its source. */
  const copy = vm.runInThisContext('(' + SL.eachFor.toString() + ')');
  assert.strictEqual(copy(L, 4), SL.eachFor(L, 4));
});

test('a broken price file keeps the last good table instead of emptying it', () => {
  SL._setData(JSON.parse(JSON.stringify(FIXTURE)));
  assert.ok(SL.table().families.calendar);
  assert.match(SERVER, /prod\.supplier === 'sinalite'\) \{/, 'an unknown SinaLite row is refused on save');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'tools', 'lib', 'sinalite.js'), 'utf8'), /if \(!cache\) cache = \{ captured: null, products: \{\} \};/);
});

test('the public quote estimate re-prices SinaLite lines from their runs', () => {
  assert.match(SERVER, /runs: sinaliteRunsOf\(it\),/);
  assert.match(SERVER, /\$\{SINALITE\.eachFor\.toString\(\)\}/);
  assert.match(SERVER, /unitOverride: slUnit\(L, qty\),/);
});

test('a typed-quantity item (pouches) never prices 700 above 1,000, nor under the 500 each', () => {
  const L = [[500, 4.81], [1000, 2.56], [2500, 1.31]];
  const t = (q) => SL.eachFor(L, q, true) * q;
  assert.ok(t(700) <= 1000 * 2.56 + 7, '700 costs no more than a 1,000 run (to the cent)');
  assert.ok(t(700) >= 1000 * 2.56 - 0.01 || t(700) >= 700 * 4.81 - 0.01);
  assert.strictEqual(SL.eachFor(L, 500, true), 4.81);
  assert.strictEqual(SL.eachFor(L, 3000, true), 1.31, 'above the top tier: its each');
  assert.strictEqual(SL.eachFor(L, 400, true), null, 'under the minimum: nothing');
});
