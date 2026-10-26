/* The DTF chest logo is offered in the online designer on adult garments and
 * vests (owner, 2026-10-26) — the oversized print's list plus vests — and the
 * designer picks it from the art (lumise app.js printing.dtf_auto). */
const { test } = require('node:test');
const assert = require('node:assert');
const { decorationsFor, OPTIONAL_ROLES, resolveRoles, DECORATIONS } = require('../tools/lib/garments');

const fits = (n) => (decorationsFor(n) || []).includes('dtf:chest');

test('adult garments and vests get the chest logo', () => {
  for (const n of ['Gildan 5000 Unisex Heavy Cotton Tee', 'Gildan 18500 Heavy Blend Hoodie',
    'Gildan 64800 Unisex Softstyle Pique Polo', 'Comfort Colors 1580 Garment-Dyed Quarter-Zip',
    'Boxercraft BU7401 Men\'s Flannel Button Down'])
    assert.ok(fits(n), n);
  assert.ok(DECORATIONS.vest.includes('dtf:chest'), 'vests');
});

test('kids, bags, caps and non-garments do not', () => {
  for (const n of ['Liberty Bags 8502 Cotton Tote Bag', 'Gildan 5000B Youth Heavy Cotton Tee',
    'Gildan 18500B Youth Heavy Blend Hoodie', 'Bella+Canvas 3001T — Toddler Jersey Tee',
    'Rabbit Skins RS4400 — Infant Short Sleeve Bodysuit', 'Richardson 112 Trucker Cap', '3in Buttons'])
    assert.ok(!fits(n), n);
});

test('every class with the oversized print has the chest logo too', () => {
  for (const [cls, roles] of Object.entries(DECORATIONS))
    if (roles.includes('dtf:oversized')) assert.ok(roles.includes('dtf:chest'), cls);
});

test('the chest role is optional and resolves by the exact title the tool writes', () => {
  assert.ok(OPTIONAL_ROLES.includes('dtf:chest'));
  const { ids } = resolveRoles([{ id: 1, title: 'DTF Printing' }, { id: 74, title: 'DTF Printing — Chest logo (up to 16 sq in)' }]);
  assert.strictEqual(ids.dtf, 1);
  assert.strictEqual(ids['dtf:chest'], 74);
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'tools', 'add-dtf-chest-logo.js'), 'utf8');
  assert.ok(src.includes("const TITLE = 'DTF Printing — Chest logo (up to 16 sq in)';"));
});
