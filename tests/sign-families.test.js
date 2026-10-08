'use strict';

/* Sign families for the designer (tools/lib/sign-families.js) and their products.
 * Run: node --test tests/*.test.js */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../tools/lib/sign-families');
const P = require('../tools/add-sign-products');
const sg = require('../tools/lib/signage');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('every family publishes only its own materials and upgrades', () => {
  const t = F.signsTable();
  assert.deepStrictEqual(Object.keys(t.families).sort(), Object.keys(P.NAMES).sort(), 'one designer product per family');
  for (const [key, fam] of Object.entries(t.families)) {
    const mats = new Set(fam.materials.map((m) => m.key));
    for (const u of fam.upgrades) for (const o of u.only) assert.ok(mats.has(o), `${key}: upgrade ${u.key} names unknown material ${o}`);
  }
  const has = (fam, up) => t.families[fam].upgrades.some((u) => u.key === up);
  assert.ok(has('yard_sign', 'stake') && !has('window_graphic', 'stake'), 'stakes on yard signs only');
  assert.ok(has('window_graphic', 'outside') && t.families.window_graphic.upgrades.find((u) => u.key === 'outside').only.join() === 'cling', 'mounting side on cling only');
  assert.ok(!t.families.rigid_sign.upgrades.find((u) => u.key === 'standoffs').only.includes('foam_s'), 'no standoffs through foamcore');
  assert.deepStrictEqual(Object.keys(t.families.yard_sign.sheet_upgrades).sort(), ['gloss', 'grommets']);
});

test('stock ladders never rise with quantity, never fall under x2, and honour the minimum', () => {
  const t = F.signsTable();
  for (const [key, fam] of Object.entries(t.families)) {
    if (fam.sizing !== 'stock') continue;
    for (const [mat, sizes] of Object.entries(fam.prices)) for (const [size, combos] of Object.entries(sizes)) for (const [combo, lad] of Object.entries(combos)) {
      for (let i = 1; i < lad.length; i++) assert.ok(lad[i][1] <= lad[i - 1][1], `${key} ${mat} ${size} ${combo}: rises at ${lad[i][0]}`);
    }
  }
  const y = t.families.yard_sign.prices['4s'];
  assert.strictEqual(y['24x18'][''][0][0], 10, 'small yard signs start at 10');
  assert.strictEqual(y['36x24'][''][0][0], 1);
  assert.ok(y['24x18']['gloss'][0][1] > y['24x18'][''][0][1], 'gloss costs more');
  const cost10 = F.stockLadder('yard_sign', F.FAMILIES.yard_sign, F.FAMILIES.yard_sign.materials[0], 24, 18, '')[0][1] * 10;
  assert.ok(cost10 >= (sg.CORO[4].single + sg.labourCost('yard_sign', 10)) * sg.MARKUP, 'ten small signs carry their sheet x2');
  assert.strictEqual(t.families.yard_sign.freight_by_size['96x48:4s'], 75, 'a full coro board ships oversized');
  assert.strictEqual(t.families.rigid_sign.freight_by_size['96x48:foam_d'], 199, 'a full foam board ships at $199');
});

test('the area formula: whole feet for sqft, exact for sqin, limits refuse', () => {
  const W = F.FAMILIES.window_graphic, oww = W.materials[0], cling = W.materials.find((m) => m.key === 'cling');
  const exp = (units, cost, kind) => sg.evenUp((units * cost + sg.labourCost(kind, 1)) * sg.MARKUP);
  assert.strictEqual(F.areaPrice(W, oww, 36, 24), exp(6, sg.ONE_WAY_WINDOW.no_laminate, 'adhesive'));
  assert.strictEqual(F.areaPrice(W, oww, 37, 24), exp(8, sg.ONE_WAY_WINDOW.no_laminate, 'adhesive'), '37in bills as 4ft');
  assert.strictEqual(F.areaPrice(W, cling, 12, 12), exp(144, 0.02, 'adhesive'));
  assert.strictEqual(F.areaPrice(W, oww, 60, 60), null, 'both sides over the roll width');
  assert.strictEqual(F.areaPrice(W, oww, 4, 24), null, 'under the minimum');
});

test('stretched canvas: Stretcher Bar Warehouse bars, wrap allowance, no brace under 44in', () => {
  // 16x20: print on 22x26 -> 2ft x 3ft = 6 sqft x $4.98, bars 2x$4.59 + 2x$5.67.
  assert.strictEqual(Math.round(F.stretchedCanvasCost(16, 20) * 100) / 100, Math.round((6 * 4.98 + 2 * 4.59 + 2 * 5.67) * 100) / 100);
  for (const [w, h] of F.FAMILIES.stretched_canvas.sizes) {
    assert.ok(F.STRETCHER_BAR[w] && F.STRETCHER_BAR[h], `bars for ${w}x${h}`);
    assert.ok(Math.max(w, h) <= 44, 'no size needs a brace');
  }
});

test('the products carry the option ids the designer reads', () => {
  const a = P.familyAttributes('yard_sign');
  assert.ok(a.SMAT && a.SSIZE && a.SUP_gloss && a.SUP_grommets && a.SUP_stake && a.QTY && !a.SW);
  assert.ok(a.SMAT.values.options.every((o) => /^yard_sign:/.test(o.value)), 'the family travels in the material value');
  const w = P.familyAttributes('window_graphic');
  assert.ok(w.SW && w.SH && !w.SSIZE && w.SUP_outside);
  assert.ok(w.SMAT.values.options.filter((o) => o.default === true).length === 1);
  assert.deepStrictEqual(Object.keys(P.familyStages()), ['front', 'back']);
});

test('/api/pricing-rules publishes the families', () => {
  const route = src.slice(src.indexOf("app.get('/api/pricing-rules'"), src.indexOf("app.get('/api/pricing-rules'") + 3500);
  assert.match(route, /signs: SIGN_FAMILIES\.signsTable\(\)/);
  assert.ok(JSON.stringify(F.signsTable()).length < 60000, 'small enough for every page');
});

test('every sign family is filed under exactly one storefront category', () => {
  const { NAMES, CATEGORIES } = require('../tools/add-sign-products');
  const filed = CATEGORIES.flatMap((c) => c.families || []);
  assert.deepStrictEqual([...filed].sort(), Object.keys(NAMES).sort());
  assert.strictEqual(new Set(CATEGORIES.map((c) => c.slug)).size, CATEGORIES.length);
});
