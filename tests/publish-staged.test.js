/* Staged S&S blanks: quote form first, live once the designer setup holds
 * (2026-10-17). ssa-add-products.js --staged writes them switched off;
 * publish-staged.js checks them and puts the ready ones live.
 *
 * Run: node --test tests/publish-staged.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { notReady, htmlToLines } = require('../tools/publish-staged');
const { selectWanted, productInsertSql, parseIds } = require('../tools/lib/ssa-staged');
const { classify } = require('../tools/lib/garments');

const enc = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o))).toString('base64');
/* Two colours; `wired` lists which of them have a real-photo canvas. */
const attrs = enc({ COL: { type: 'product_color', values: { options: [{ title: 'Black', value: '#000001' }, { title: 'White', value: '#fffffe' }] } },
  QTYS: { type: 'quantity' } });
/* What wire.js writes: each placement of the garment's set, on that colour's photo. */
const KEYS = { closed: ['front', 'left_chest', 'back'], open: ['front', 'right_chest', 'back'], cap: ['front'] };
const st = (keys, v = '000001') => Object.fromEntries(keys.map((k) => [k,
  { label: k, image: 'https://res.cloudinary.com/x/' + v + '-' + (k === 'back' ? 'back' : 'front') + '.webp' }]));
const photo = (v, keys = KEYS.closed) => ({ cfgstages: true, conditions: { COL: v }, stages: st(keys, v.slice(1)) });
const vars = (...vals) => enc({ variations: Object.fromEntries(vals.map((v, i) => [String(i + 1), photo(v)])) });
const varsFor = (keys, ...vals) => enc({ variations: Object.fromEntries(vals.map((v, i) => [String(i + 1), photo(v, keys)])) });
const tee = {
  name: 'Shaka Wear SHMHO Unisex Max Heavyweight Oversized Tee', price: '13.36',
  stages: enc(st(KEYS.closed)),
  printings: encodeURIComponent(JSON.stringify({ _1: 'A3', _64: 'A3' })),
  attributes: attrs, variations: vars('#000001', '#fffffe'),
  thumbnail_url: 'https://cdn.ssactivewear.com/a.jpg', description: '• 7.5 oz cotton',
};

test('a tee with a real photo for every colour is ready', () => {
  assert.strictEqual(notReady(tee), null);
});

test('owner, 2026-10-18: held back only for missing product images (or a broken basic)', () => {
  assert.match(notReady({ ...tee, variations: vars('#000001') }), /no product images for 1 of 2/);
  assert.match(notReady({ ...tee, variations: '' }), /no product images for 2 of 2/);
  assert.match(notReady({ ...tee, printings: '' }), /no decoration/);
  assert.match(notReady({ ...tee, price: '0' }), /no price/);
  assert.match(notReady({ ...tee, thumbnail_url: 'http://x/a.jpg' }), /no catalogue photo/);
  assert.match(notReady({ ...tee, description: '' }), /no description/);
  assert.strictEqual(notReady({ ...tee, description: '' }, { desc: '• from S&S' }), null, 'a description S&S supplied counts');
});

test('jackets and caps with real photos and their own placements go live too', () => {
  for (const [name, keys] of [['Shaka Wear SHCJ Unisex Coaches Jacket', KEYS.open], ['Yupoong 1501KC Cuffed Beanie', KEYS.cap]])
    assert.strictEqual(notReady({ ...tee, name, stages: enc(st(keys)), variations: varsFor(keys, '#000001', '#fffffe') }), null, name);
});

/* Code review 2026-10-18: "ready" used to mean only "every colour has a
   photo", so a product wire.js wired through its copy-the-box fallback — one
   full front over a jacket's zipper — would have gone live. */
test('a product, or any one colourway, without the garment\'s full placement set is held back', () => {
  const jacket = { ...tee, name: 'Shaka Wear SHCJ Unisex Coaches Jacket' };
  assert.match(notReady({ ...jacket, stages: enc(st(['front', 'back'])), variations: varsFor(['front', 'back'], '#000001', '#fffffe') }),
    /placements: has front \/ back, wants Left chest \/ Right chest \/ Back/);
  const mixed = enc({ variations: { 1: photo('#000001', KEYS.open), 2: photo('#fffffe', ['front', 'back']) } });
  assert.match(notReady({ ...jacket, stages: enc(st(KEYS.open)), variations: mixed }), /1 colourway\(s\) without the full placement set/);
});

test('a colour counts as photographed only when EVERY placement shows its photo', () => {
  const half = enc({ variations: { 1: photo('#000001'), 2: { ...photo('#fffffe'),
    stages: { ...st(KEYS.closed, 'fffffe'), back: { label: 'back', url: 'products/basic_tshirt_back.png' } } } } });
  assert.match(notReady({ ...tee, variations: half }), /no product images for 1 of 2/);
});

test('a staged product with colours but no size list is held back', () => {
  const colourOnly = enc({ COL: { type: 'product_color', values: { options: [{ title: 'Black', value: '#000001' }, { title: 'White', value: '#fffffe' }] } } });
  assert.match(notReady({ ...tee, attributes: colourOnly }), /no sizes/);
});

test('S&S HTML becomes plain bullet lines', () => {
  assert.strictEqual(htmlToLines('<ul><li>7.5 oz.&nbsp;100% cotton</li><li>Drop <b>shoulder</b> &amp; boxy</li></ul>'),
    '• 7.5 oz. 100% cotton\n• Drop shoulder & boxy');
  assert.strictEqual(htmlToLines('<p>Heavyweight tee.</p>'), 'Heavyweight tee.');
  assert.strictEqual(htmlToLines(''), '');
  assert.strictEqual(htmlToLines('<p>Use &amp;lt;b&amp;gt; tags</p>'), 'Use &lt;b&gt; tags', 'double-escaped text decodes once');
});

test('--staged writes the product switched off and tagged ssa-staged; plain runs write it live', () => {
  const row = { name: "Shaka Wear SHMHO Unisex Max Heavyweight Oversized Tee", price: 13.36, thumb: 'https://x/a.jpg',
    stages: 'st', attributes: 'at', printings: 'pr', styleID: 9161, cost: 6.68 };
  const staged = productInsertSql({ ...row, staged: true });
  assert.match(staged, /, 1, 0, '', NOW\(\), NOW\(\), 'ssa-staged', 9161, 6\.68, NOW\(\)/);
  const live = productInsertSql({ ...row, staged: false });
  assert.match(live, /, 1, 1, '', NOW\(\), NOW\(\), 'ssa', 9161, 6\.68, NOW\(\)/);
  assert.match(staged, /WHERE supplier_style_id=9161\) AS t\);$/, 'a re-run adds nothing twice');
  assert.throws(() => productInsertSql({ ...row, styleID: 'x' }), /bad style id/);
});

test('the streetwear batch is only ever added --staged', () => {
  const core = [['5000', 'tee', 'Gildan', 'Gildan 5000 Tee']];
  const batch = [['SHMHO', 'tee', 'Shaka Wear', 'Shaka Wear SHMHO Tee']];
  assert.deepStrictEqual(selectWanted(core, batch), core, 'a plain --apply never sees the batch');
  assert.deepStrictEqual(selectWanted(core, batch, { staged: true }), [...core, ...batch]);
  assert.throws(() => selectWanted(core, batch, { only: ['SHMHO'] }), /add it with --staged/);
  assert.deepStrictEqual(selectWanted(core, batch, { staged: true, only: ['shmho'] }), batch);
  assert.throws(() => selectWanted(core, batch, { only: ['NOPE'] }), /matched no style/);
});

test('--only takes real ids or refuses — never "all of them"', () => {
  assert.deepStrictEqual([...parseIds('358,374')], [358, 374]);
  assert.strictEqual(parseIds(undefined), null, 'no flag: no filter');
  for (const bad of ['', 'SHMHO', '358;374', '0', '12,abc', ' , '])
    assert.throws(() => parseIds(bad), /--only takes product ids/, JSON.stringify(bad));
});

test('a staged row S&S stopped pricing is held back', () => {
  assert.match(notReady({ ...tee, auto_off: '2026-11-01' }), /S&S stopped pricing it/);
});

test('the daily sync re-costs staged rows and keeps their tag', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
  assert.ok(src.includes("WHERE active=1 OR supplier='ssa-staged' ORDER BY id"), 'staged rows are synced');
  assert.ok(src.includes("p.supplier === 'ssa-staged' ? `supplier='ssa-staged'` : `supplier='ssa'`"), 'and never retagged live');
  assert.ok(src.includes("WHERE active=0 AND supplier='ssa' AND ssa_auto_off IS NOT NULL"), 'auto-reactivation never wakes a staged row');
});

test('the streetwear rows are unique and each name is the garment its type says', () => {
  const rows = require('../tools/data/ssa-streetwear-2026-10');
  const T = { tee: 'tee', longslv: 'longslv', tank: 'tank', hoodie: 'hoodie', qzip: 'hoodie', cap: 'cap', bag: 'bag',
    kids: 'kids', onesie: 'kids', polo: 'polo', woven: 'premium', jacket: 'jacket', vest: 'vest' };
  const seen = new Set();
  for (const [style, type, brand, name] of rows) {
    const k = (brand + '|' + style).toUpperCase();
    assert.ok(!seen.has(k), 'duplicate ' + k); seen.add(k);
    assert.strictEqual(T[classify(name)], type, name);
    assert.ok(name.startsWith(brand), name);
  }
  assert.ok(rows.length >= 170, 'the 2026-10-17 batch');
});

/* Owner, 2026-10-19: "model photo + stand-in" for styles S&S only shot on a
   person. The drawn garment is accepted only when it IS the garment. */
const drawn = (front, back, keys = KEYS.closed) => enc(Object.fromEntries(keys.map((k) => [k,
  { label: k, url: 'products/' + (k === 'back' ? back : front) + '.png', edit_zone: { width: 100, height: 100, left: 0, top: 0 } }])));

test('--standin: a style with no photos goes live on the drawing of its own garment', () => {
  const standin = { ...tee, variations: '', stages: drawn('basic_tshirt_front', 'basic_tshirt_back') };
  assert.match(notReady(standin), /no product images for 2 of 2/, 'not without --standin');
  assert.strictEqual(notReady(standin, { standin: true }), null);
});

test('--standin never accepts the wrong garment, or a style with SOME photos', () => {
  const jacket = { ...tee, name: 'Shaka Wear SHBJ Unisex Bomber Jacket', variations: '',
    stages: drawn('hoodies_sweatshirt_front', 'hoodies_sweatshirt_back', KEYS.open) };
  assert.match(notReady(jacket, { standin: true }), /stand-in is the wrong garment/);
  const flannel = { ...tee, name: 'Shaka Wear SHHFS Unisex Plaid Flannel Overshirt', variations: '',
    stages: drawn('women_tshirt_front', 'women_tshirt_back', KEYS.open) };
  assert.match(notReady(flannel, { standin: true }), /stand-in (is not this|is the wrong) garment|cannot show a pattern/);
  /* One colour photographed: its other colours are recolor.js's job, not a stand-in's. */
  assert.match(notReady({ ...tee, variations: vars('#000001') }, { standin: true }), /no product images for 1 of 2/);
});

test('--standin refuses a patterned style: a drawing is one plain colour', () => {
  const plain = { ...tee, variations: '', stages: drawn('basic_tshirt_front', 'basic_tshirt_back') };
  assert.match(notReady({ ...plain, name: 'Champion CD100D Unisex Classic Jersey Dip Dye T-Shirt' }, { standin: true }), /pattern/);
  assert.match(notReady({ ...plain, name: 'Comfort Colors 6045 Unisex Colorblast™ Long Sleeve T-Shirt' }, { standin: true }), /pattern/);
  const twoTone = enc({ COL: { type: 'product_color', values: { options: [{ title: 'Heather Grey/ Black', value: '#000001' }, { title: 'Heather Grey/ Navy', value: '#fffffe' }] } }, QTYS: { type: 'quantity' } });
  assert.match(notReady({ ...plain, name: 'Shaka Wear SHRAGY Youth Tee', attributes: twoTone }, { standin: true }), /pattern/);
  assert.strictEqual(notReady(plain, { standin: true }), null, 'a plain tee is still fine');
});
