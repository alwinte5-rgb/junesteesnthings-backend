/* The oversized DTF ladder the owner approved on 2026-10-17.
 *
 * Standard + 1.75 x Anchorfish's extra cost for a 252 sq in print, rounded up
 * to 5 cents, with 50-99 pieces on $14.00 (the Ink Theory 12x18 back). The
 * standard ladder below is method #1 after that day's 1-4 cut to $20.75.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { oversizedLadder, up05, ANCHORFISH_DTF_COST } = require('../tools/lib/dtf-oversized');
const { decorationsFor, OPTIONAL_ROLES, resolveRoles } = require('../tools/lib/garments');

const STANDARD = { 4: '20.75', 11: '20.75', 24: '18.30', 49: '15.75', 99: '11.90',
  249: '9.50', 499: '7.55', 999: '6.10', 2499: '4.90', 7000: '4.00' };

test('the approved ladder, band by band', () => {
  assert.deepStrictEqual(oversizedLadder(STANDARD), {
    4: '24.90', 11: '24.90', 24: '21.60', 49: '18.40', 99: '14.00',
    249: '11.30', 499: '9.10', 999: '7.40', 2499: '6.05', 7000: '4.95' });
});

test('50-99 pieces is the $14.00 the owner set', () => {
  assert.strictEqual(oversizedLadder(STANDARD)[99], '14.00');
});

test('always above standard, and never rises with quantity', () => {
  const o = oversizedLadder(STANDARD);
  const c = Object.keys(o).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < c.length; i++) {
    assert.ok(parseFloat(o[c[i]]) > parseFloat(STANDARD[c[i]]), 'band ' + c[i]);
    if (i) assert.ok(parseFloat(o[c[i]]) <= parseFloat(o[c[i - 1]]), 'band ' + c[i]);
  }
});

test('a band with no Anchorfish cost throws instead of dropping the surcharge', () => {
  assert.throws(() => oversizedLadder({ 150: '9.00' }), /no Anchorfish cost/);
});

test('rounding goes up to 5 cents and leaves exact values alone', () => {
  assert.strictEqual(up05(14.0), 14.0);
  assert.strictEqual(up05(13.999999999), 14.0);
  assert.strictEqual(up05(11.285), 11.3);
  assert.strictEqual(up05(6.0025), 6.05);
});

test('only adult garments with a big back are offered it (lib/garments.js decorationsFor)', () => {
  const fits = (n) => (decorationsFor(n) || []).includes('dtf:oversized');
  for (const n of ['Gildan 5000 Unisex Heavy Cotton Tee', 'Shaka Wear SHMHO Max Heavyweight Oversized Tee',
    'Gildan 5000L Women\'s Heavy Cotton Tee', 'Gildan 18500 Heavy Blend Hoodie', 'Gildan 64800 Unisex Softstyle Pique Polo',
    'Comfort Colors 1580 Garment-Dyed Quarter-Zip', 'Boxercraft BU7401 Men\'s Flannel Button Down'])
    assert.ok(fits(n), n);
  for (const n of ['Liberty Bags 8502 Cotton Tote Bag', 'Liberty Bags 8881 Drawstring Pack', 'Under Armour Ozsee Sackpack',
    'Rabbit Skins RS4400 — Infant Short Sleeve Bodysuit', 'Bella+Canvas 3001T — Toddler Jersey Tee',
    'Gildan 5000B Youth Heavy Cotton Tee', 'Gildan 18500B Youth Heavy Blend Hoodie', 'Richardson 112 Trucker Cap',
    'Yupoong 1501KC Cuffed Beanie', '3in Buttons', 'Full Body Cutouts', 'Business Cards & Flyers'])
    assert.ok(!fits(n), n);
});

test('the oversized role is optional, so no tool stops before the method exists', () => {
  assert.ok(OPTIONAL_ROLES.includes('dtf:oversized'));
  const { missing } = resolveRoles([{ id: 1, title: 'DTF Printing' }]);
  assert.ok(missing.includes('dtf:oversized'));
  const { ids } = resolveRoles([{ id: 1, title: 'DTF Printing' }, { id: 40, title: 'DTF Printing — Oversized (up to 252 sq in)' }]);
  assert.strictEqual(ids.dtf, 1, 'standard DTF still resolves to #1');
  assert.strictEqual(ids['dtf:oversized'], 40);
});

test('the Anchorfish costs here match the ones the reprice tool prices from', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'reprice-anchorfish-2026.js'), 'utf8');
  const block = src.slice(src.indexOf('const DTF = {'), src.indexOf('};', src.indexOf('const DTF = {')));
  const rows = [...block.matchAll(/ceil:\s*(\d+),.*?v: \[([^\]]+)\]/g)];
  assert.strictEqual(rows.length, Object.keys(ANCHORFISH_DTF_COST).length, 'same bands');
  for (const [, ceil, v] of rows) {
    const n = v.split(',').map(Number);
    assert.deepStrictEqual(ANCHORFISH_DTF_COST[ceil], [n[1], n[2]], 'band <=' + ceil);
  }
});
