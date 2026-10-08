/* Signs on the quote form are priced by the SERVER from their size, and only
 * the owner (or a helper given "Change prices") can type a price
 * (owner, 2026-10-08). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const QS = require('../tools/lib/quote-signs');
const STAFF = require('../tools/lib/staff');
const SG = require('../tools/lib/signage');

test('product names map to the sign kind that sizes them', () => {
  assert.strictEqual(QS.signKindOf('Custom Size Vinyl Banner'), 'banner');
  assert.strictEqual(QS.signKindOf('Retractable Banner Stand'), null, 'a stand is a fixed item');
  assert.strictEqual(QS.signKindOf('Yard Signs'), 'yard_sign');
  assert.strictEqual(QS.signKindOf('Vehicle Magnets'), 'vehicle_magnet');
  assert.strictEqual(QS.signKindOf('Custom Magnets'), 'custom_magnet');
  assert.strictEqual(QS.signKindOf('Stretched Canvas'), 'stretched_canvas');
  assert.strictEqual(QS.signKindOf('Bella+Canvas 3001 Unisex Jersey Tee'), null, 'a brand name is not a sign');
});

test('a banner prices from the designer\'s own table, delivery once', () => {
  const t = SG.bannerTable();
  const r = QS.priceSign('banner', { w: 8, h: 3, mat: '13', hang: 'rope_top' }, 1, true);
  assert.ok(r.ok);
  assert.strictEqual(r.piece, t.prices['13']['8x3'] + t.finishing['8x3'].rope_top);
  assert.strictEqual(r.each, r.piece + t.freight);
  const second = QS.priceSign('banner', { w: 8, h: 3, mat: '13', hang: 'rope_top' }, 1, false);
  assert.strictEqual(second.each, r.piece, 'a second banner does not pay delivery again');
  assert.match(QS.priceSign('banner', { w: 40, h: 40, mat: '13' }, 1, true).error, /No price/);
});

test('stock signs use the quantity ladder and keep their minimum', () => {
  assert.match(QS.priceSign('yard_sign', { size: '24x18', mat: '4s' }, 2, true).error, /minimum of 10/);
  const ten = QS.priceSign('yard_sign', { size: '24x18', mat: '4s' }, 10, false);
  const hundred = QS.priceSign('yard_sign', { size: '24x18', mat: '4s' }, 100, false);
  assert.ok(ten.ok && hundred.ok && hundred.piece <= ten.piece, 'never dearer each at volume');
  const staked = QS.priceSign('yard_sign', { size: '24x18', mat: '4s', up: ['stake'] }, 10, false);
  assert.ok(staked.piece > ten.piece);
  const noStakeOn10mm = QS.priceSign('yard_sign', { size: '24x18', mat: '10s', up: ['stake'] }, 10, false);
  assert.deepStrictEqual(noStakeOn10mm.spec.up, [], 'an upgrade not offered on that material is dropped');
});

test('area signs price by inches and refuse sizes outside the limits', () => {
  assert.ok(QS.priceSign('window_graphic', { w: 36, h: 24, mat: 'oww' }, 1, false).ok);
  assert.match(QS.priceSign('window_graphic', { w: 2, h: 2, mat: 'oww' }, 1, false).error, /No price/);
  assert.match(QS.priceSign('window_graphic', { w: 36, h: 24, mat: 'nope' }, 1, false).error, /material/);
});

test('"Change prices" is a helper permission, off unless given, and in no preset', () => {
  assert.ok(STAFF.PERMISSIONS['quotes.price']);
  assert.strictEqual(STAFF.levelOf({ kind: 'staff', perms: {} }, 'quotes.price'), 'off');
  assert.strictEqual(STAFF.levelOf({ kind: 'owner' }, 'quotes.price'), 'on');
  for (const name of Object.keys(STAFF.PRESETS)) {
    assert.notStrictEqual(STAFF.levelOf({ kind: 'staff', perms: STAFF.presetPerms(name) }, 'quotes.price'), 'on', name);
  }
});

test('the save route refuses a helper\'s price change before writing', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const lock = src.indexOf("STAFF.levelOf(saver, 'quotes.price') !== 'on'");
  assert.ok(lock > -1, 'the price lock is in the save route');
  const insert = src.indexOf('INSERT INTO quotes', lock);
  const refuse = src.indexOf('Only the owner can change prices', lock);
  assert.ok(refuse > -1 && refuse < insert, 'refused before the quote is written');
});
