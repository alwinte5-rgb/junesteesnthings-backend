/* The whole-catalogue audit (owner, 2026-10-18): the checks added for the
 * faults the owner found by hand — sizes drawn as one quantity box, extended
 * sizes sold at the small-size price, a catalogue photo from another style, and
 * S&S's bib apron (#143) sold under a shirt's name.
 *
 * Run: node --test tests/catalog-audit.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { localChecks, ssaChecks } = require('../tools/catalog-inventory');
const { enjson } = require('../tools/lib/db');

const qty = (values) => enjson({ QTYS: { id: 'QTYS', type: 'quantity', values: JSON.stringify(values) } });
const opts = (sizes) => sizes.map(([title, price]) => ({ title, value: title, price }));

test('sizes stored without type:multiple are flagged as one quantity box', () => {
  const bad = localChecks({ name: 'Boxercraft BU7401 Flannel', attributes: qty({ multiple_options: opts([['S', ''], ['M', ''], ['L', '']]) }) });
  assert.strictEqual(bad.sizes, '3 sizes drawn as one quantity box');
  const good = localChecks({ name: 'Gildan 64800 Polo', attributes: qty({ type: 'multiple', multiple_options: opts([['S', ''], ['M', '']]) }) });
  assert.strictEqual(good.sizes, 'ok');
  /* One size (a tote, a cap) is a single box by nature. */
  const one = localChecks({ name: 'Liberty Bags 8502 Tote', attributes: qty({ multiple_options: opts([['One Size', '']]) }) });
  assert.strictEqual(one.sizes, 'ok');
});

test('a thin description is flagged', () => {
  assert.match(localChecks({ name: 'x tee', description: '• 5.3 oz cotton' }).copy, /^description \d+ chars$/);
  assert.strictEqual(localChecks({ name: 'x tee', description: 'y'.repeat(220) }).copy, 'ok');
});

const rows = (spec) => spec.flatMap(([size, cost]) => [{ sizeName: size, customerPrice: cost, colorFrontImage: 'Images/Color/111_f_fm.jpg' }]);

test('upcharges must match the S&S cost difference x markup', () => {
  const prods = rows([['S', 10], ['M', 10], ['L', 10], ['XL', 10], ['2XL', 12]]);
  const p = (up) => ({ name: 'Gildan 5000 Tee', thumb: '', attributes: qty({ type: 'multiple', multiple_options: opts([['S', ''], ['2XL', up]]) }) });
  assert.strictEqual(ssaChecks(p('4.00'), { title: 'Tee' }, prods).upcharges, 'ok');
  assert.strictEqual(ssaChecks(p(''), { title: 'Tee' }, prods).upcharges, '2XL +0 (S&S: +4.00)');
});

test('a size S&S does not price under that name is a fault, not a pass', () => {
  const prods = rows([['S', 10], ['M', 10], ['L', 10], ['XL', 10], ['2XL', 12]]);
  const p = { name: 'Gildan 5000 Tee', thumb: '', attributes: qty({ type: 'multiple', multiple_options: opts([['S', ''], ['2X', '']]) }) };
  assert.strictEqual(ssaChecks(p, { title: 'Tee' }, prods).upcharges, '2X not a size at S&S');
  const one = { name: 'Richardson 112 Cap', thumb: '', attributes: qty({ multiple_options: opts([['One Size', '']]) }) };
  assert.strictEqual(ssaChecks(one, { title: 'Cap' }, rows([['OSFA', 8]])).upcharges, 'ok');
});

test('the catalogue photo must be this style\'s own, or the owner\'s listing mockup', () => {
  const prods = rows([['S', 10]]);
  const p = (thumb) => ({ name: 'Next Level NL3200 V-Neck', thumb, attributes: qty({ multiple_options: [] }) });
  assert.strictEqual(ssaChecks(p('https://cdn.ssactivewear.com/Images/Color/111_f_fm.jpg'), { title: 'V-Neck' }, prods).listing, 'ok');
  /* #72 showed a Bayside long sleeve's photo. */
  assert.strictEqual(ssaChecks(p('https://cdn.ssactivewear.com/Images/Color/17327_f_fm.jpg'), { title: 'V-Neck' }, prods).listing,
    "photo 17327 is not one of this style's");
  assert.strictEqual(ssaChecks(p('https://res.cloudinary.com/dhjtzewsx/image/upload/v1/jtees/listing/p72-ab.webp'), { title: 'V' }, prods).listing, 'ok');
  /* S&S's main style photo is keyed by style id. */
  assert.strictEqual(ssaChecks({ ...p('https://cdn.ssactivewear.com/Images/Style/3206_fl.jpg'), sid: '3206' }, { title: 'V' }, prods).listing, 'ok');
  assert.strictEqual(ssaChecks({ ...p('https://cdn.ssactivewear.com/Images/Style/13030_fl.jpg'), sid: '3206' }, { title: 'V' }, prods).listing,
    'style photo 13030 is not style 3206');
});

test('a garment word in the S&S title must be in the name (the #143 apron)', () => {
  const p = { name: 'Artisan Collection RP144 Annex Oxford Shirt', thumb: '', attributes: qty({ multiple_options: [] }) };
  assert.strictEqual(ssaChecks(p, { title: 'Annex Oxford Bib Apron' }, []).naming, 'S&S calls it "Annex Oxford Bib Apron"');
  assert.strictEqual(ssaChecks({ ...p, name: 'Artisan Collection RP144 Annex Oxford Bib Apron' }, { title: 'Annex Oxford Bib Apron' }, []).naming, 'ok');
  /* A hoodie is S&S's hooded sweatshirt; a "Pullover" name still hides it. */
  assert.strictEqual(ssaChecks({ ...p, name: 'Gildan 18500 Heavy Blend Hoodie' }, { title: 'Unisex Heavy Blend™ Hooded Sweatshirt' }, []).naming, 'ok');
  assert.notStrictEqual(ssaChecks({ ...p, name: 'Independent Trading IND5000P Legend Pullover' }, { title: 'Legend Hooded Sweatshirt' }, []).naming, 'ok');
});

test('a size field that cannot be read is reported, not passed', () => {
  const attributes = enjson({ QTYS: { id: 'QTYS', type: 'quantity', values: '{"multiple_options":[{"title":"S"' } });
  assert.strictEqual(localChecks({ name: 'Gildan 5000 Tee', attributes }).sizes, 'size field unreadable');
});
