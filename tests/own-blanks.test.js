'use strict';

/* Customer-supplied blanks (owner, 2026-10-19, the Ink Theory job): the
 * customer sends the garments, so the line is printing plus a per-piece
 * handling fee — no blank price and no extended-size upcharge. Lifts the real
 * priceLine out of server.js, as two-decorations.test.js does, and the rate
 * from the ADDONS table, so the test cannot pass against a copy. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function engine() {
  const e = src.slice(src.indexOf('function quotePricingSource()'));
  const body = e.slice(e.indexOf('return `') + 8, e.indexOf('\n`;'));
  const code = body.replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
  return vm.runInThisContext('(function(){' + code + '\nreturn {priceLine:priceLine};})()').priceLine;
}
const priceLine = engine();

const DTF = {
  id: 1, title: 'DTF Printing', type: 'fixed', min_order_qty: 0, colour_options: [],
  positions: {
    id: [{ min_qty: 4, price: 20.75 }, { min_qty: 11, price: 18.75 }, { min_qty: 99, price: 11.0 }],
    mr8a5dlx: [{ min_qty: 4, price: 5.95 }, { min_qty: 11, price: 5.5 }, { min_qty: 99, price: 4.6 }],
  },
};
const SHIRT = { id: 7, name: 'Tee', price: 6.68, sizes: [{ size: 'M', upcharge: 0 }, { size: '2XL', upcharge: 2.70 }] };
const OWN = { code: 'own_blanks', label: 'Customer supplies the blanks', kind: 'per_piece', rate: 1.50 };
const line = (extra) => Object.assign({
  product: SHIRT, qty: 70, colours: '', blankTiers: [],
  prints: [{ loc: 'back', method: DTF, colours: '' }, { loc: 'front', method: DTF, colours: '' }],
}, extra);

test('the add-on is offered on garment decoration only, at the rate the test assumes', () => {
  const row = src.slice(src.indexOf("{ code: 'own_blanks'"), src.indexOf("{ code: 'puff'"));
  assert.match(row, /appliesTo: GARMENT_METHOD_RE/);
  assert.match(row, /kind: 'per_piece', rate: 1\.50/);
  const re = new RegExp(src.match(/const GARMENT_METHOD_RE = \/(.+)\/i;/)[1], 'i');
  for (const t of ['DTF Printing', 'DTF Printing — Oversized (up to 252 sq in)', 'Screen Printing', 'Embroidery']) assert.ok(re.test(t), t);
  for (const t of ['Big Head Cutout 24in singles', 'Sized item', 'Vinyl Banner']) assert.ok(!re.test(t), t);
});

test('own blanks: no garment price, printing plus the handling fee', () => {
  const ours = priceLine(line({}));
  const theirs = priceLine(line({ addons: [OWN] }));
  assert.ok(ours.blank > 0, 'the shop-supplied line charges a blank');
  assert.strictEqual(theirs.blank, 0);
  assert.strictEqual(theirs.unit, 15.60, '$11.00 main + $4.60 chest at 70 pieces');
  assert.strictEqual(theirs.lineTotal, Math.round((15.60 * 70 + 1.50 * 70) * 100) / 100);
});

test('own blanks: no extended-size upcharge, because the shop did not buy the 2XL', () => {
  const mix = { M: 60, '2XL': 10 };
  assert.strictEqual(priceLine(line({ sizeMix: mix })).sizeUpcharge, 27);
  assert.strictEqual(priceLine(line({ sizeMix: mix, addons: [OWN] })).sizeUpcharge, 0);
});

test('a helper ticking it still needs sign-off: the catalogue figure ignores it', () => {
  const save = src.slice(src.indexOf('const ownBlanks = lineAddons.some('), src.indexOf('const ownBlanks = lineAddons.some(') + 400);
  assert.match(save, /addons: lineAddons\.filter\(\(a\) => a\.code !== 'own_blanks'\)/);
});

test('the upsell offers only a real break: 50 cents or 3% a piece', () => {
  assert.match(src, /if \(e1 <= e0 - Math\.max\(0\.5, e0 \* 0\.03\)\) \{/);
});
