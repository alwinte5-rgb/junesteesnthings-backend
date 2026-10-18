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
const tee = {
  name: 'Shaka Wear SHMHO Unisex Max Heavyweight Oversized Tee', price: '13.36',
  stages: enc({ front: { url: 'products/basic_tshirt_front.png' }, back: { url: 'products/basic_tshirt_back.png' } }),
  printings: encodeURIComponent(JSON.stringify({ _1: 'A3', _64: 'A3' })),
  attributes: 'xyz', thumbnail_url: 'https://cdn.ssactivewear.com/a.jpg', description: '• 7.5 oz cotton',
};

test('a fully set-up tee is ready', () => {
  assert.strictEqual(notReady(tee), null);
});

test('each missing piece holds it back, and says which', () => {
  assert.match(notReady({ ...tee, stages: '' }), /canvas: no stages/);
  assert.match(notReady({ ...tee, printings: '' }), /no decoration/);
  assert.match(notReady({ ...tee, attributes: '' }), /no sizes/);
  assert.match(notReady({ ...tee, price: '0' }), /no price/);
  assert.match(notReady({ ...tee, thumbnail_url: 'http://x/a.jpg' }), /no catalogue photo/);
  assert.match(notReady({ ...tee, description: '' }), /no description/);
  assert.strictEqual(notReady({ ...tee, description: '' }, { desc: '• from S&S' }), null, 'a description S&S supplied counts');
});

test('a jacket on the sweatshirt canvas is the wrong garment', () => {
  const jacket = { ...tee, name: 'Shaka Wear SHCJ Unisex Coaches Jacket',
    stages: enc({ front: { url: 'products/hoodies_sweatshirt_front.png' } }) };
  assert.match(notReady(jacket), /canvas: a jacket drawn on/);
});

test('stand-in canvas art is held back unless accepted', () => {
  const beanie = { ...tee, name: 'Yupoong 1501KC Cuffed Beanie', stages: enc({ front: { url: 'products/hat_front.png' } }) };
  assert.match(notReady(beanie), /stand-in canvas/);
  assert.strictEqual(notReady(beanie, { acceptStandin: true }), null);
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
