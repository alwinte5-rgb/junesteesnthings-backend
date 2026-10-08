'use strict';

/* Any-size banners, finishing and the Signs365 catalog record (2026-10-07).
 * Run: node --test tests/*.test.js */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const s = require('../tools/lib/signage');
const C = require('../tools/lib/signs365-catalog');
const P = require('../tools/add-banner-product');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the per-foot rate rises with the vinyl, and every one keeps the x2 floor', () => {
  assert.deepStrictEqual(s.BANNER_RATES, { '13': 7, '15': 8, '18': 9, '18d': 12 });
  assert.strictEqual(s.BANNER_SQFT_RATE, 7, 'the 13oz rate the older tests know');
  const at = (oz, sides) => s.bannerPrice(120, 24, { oz, sides });
  assert.ok(at(13) < at(15) && at(15) < at(18) && at(18) < at(18, 'double'), 'heavier vinyl costs more');
  assert.strictEqual(at(13), 140, 'the customer\'s 2x10 on 13oz');
  for (const m of s.BANNER_MATERIALS) {
    for (const [w, h] of [[12, 12], [24, 48], [120, 24], [360, 60]]) {
      const p = s.bannerPrice(w, h, { oz: m.oz, sides: m.sides });
      const cost = s.bannerCost(w, h, { oz: m.oz, sides: m.sides }) + s.labourCost('banner', 1);
      assert.ok(p >= cost * s.MARKUP, `${m.key} ${w}x${h} under x2`);
    }
  }
  assert.strictEqual(s.bannerPrice(120, 24, { oz: 13, sides: 'double' }), null, 'double-sided is 18oz only');
});

test('the designer table: every whole-foot size inside the limits, nothing outside', () => {
  const t = s.bannerTable();
  assert.deepStrictEqual(t.materials.map((m) => m.key), ['13', '15', '18', '18d']);
  for (const m of t.materials) {
    assert.strictEqual(t.prices[m.key]['10x2'], s.bannerPrice(120, 24, s.BANNER_MATERIALS.find((x) => x.key === m.key)));
    assert.ok(t.prices[m.key]['30x5'] > 0 && t.prices[m.key]['5x30'] > 0, 'the limits themselves are sold');
    assert.strictEqual(t.prices[m.key]['6x6'], undefined, 'both sides over 5ft is not');
    assert.strictEqual(t.prices[m.key]['31x2'], undefined, 'nor over 30ft long');
  }
  assert.ok(JSON.stringify(t).length < 80000, 'small enough to ride on /api/pricing-rules');
});

test('finishing costs reproduce the Signs365 order screen', () => {
  // Observed 2026-10-07 on 15oz HD Banner: base + finishing, in dollars.
  assert.strictEqual(s.bannerFinishCost(120, 24, { hanging: 'rope_top' }), 10);
  assert.strictEqual(s.bannerFinishCost(120, 24, { hanging: 'rope_both' }), 20);
  assert.strictEqual(s.bannerFinishCost(96, 24, { hanging: 'rope_top' }), 8);
  assert.strictEqual(s.bannerFinishCost(120, 24, { hanging: 'pocket_top' }), 20);
  assert.strictEqual(s.bannerFinishCost(120, 24, { hanging: 'pocket_both' }), 30);
  assert.strictEqual(s.bannerFinishCost(120, 24, { hanging: 'pocket_sides' }), 14);
  assert.strictEqual(s.bannerFinishCost(96, 24, { windSlits: true }), null, '24in tall is not OVER 24in');
  assert.strictEqual(s.bannerFinishCost(72, 36, { windSlits: true }), 9);
  assert.strictEqual(s.bannerFinishCost(120, 36, { windSlits: true }), null, '120in is not UNDER 120in');
  assert.strictEqual(s.bannerFinishCost(72, 36, { hanging: 'grommets' }), 0, 'grommets are included');
  assert.strictEqual(s.bannerFinishCost(72, 36, { hanging: 'rope_and_pockets' }), null);
  assert.strictEqual(s.STEP_STAKE, 1.25, 'stakes as the coro screen charges them');
});

test('the quote form offers each banner add-on only on its own size, one hanging per banner', () => {
  const a = s.stockBannerAddons();
  const for3x6 = a.filter((x) => x.appliesTo.test('Vinyl Banner — 3ft x 6ft, 13oz single-sided'));
  assert.ok(for3x6.some((x) => /^banner_rope_top/.test(x.code)) && for3x6.some((x) => /windslits/.test(x.code)));
  assert.ok(for3x6.every((x) => /_3x6$/.test(x.code)), 'no other size\'s price on a 3x6');
  assert.ok(a.filter((x) => x.appliesTo.test('Vinyl Banner — 3ft x 6ft, 18oz DOUBLE-SIDED')).length === for3x6.length, 'the double-sided 3x6 too');
  assert.ok(!a.some((x) => x.appliesTo.test('Gildan 5000 — Screen Printing')), 'never on a shirt');
  assert.ok(!a.some((x) => /windslits_2x4|windslits_3x10/.test(x.code)), 'no wind slits where Signs365 refuses them');
  assert.ok(a.filter((x) => /rope|pocket/.test(x.code)).every((x) => x.group === 'banner_hanging'));
  assert.ok(a.every((x) => x.rate > 0 && x.kind === 'per_piece'));
  assert.match(src, /\.\.\.SIGNAGE\.stockBannerAddons\(\)/, 'in ADDONS');
  assert.match(src, /if \(a\.group\) \{ if \(groupsTaken\.has\(a\.group\)\) continue;/, 'the server keeps one per group');
  assert.match(src, /group: a\.group \|\| null/, 'the page is told the group');
  assert.match(src, /\.ao\[data-group\]/, 'and unticks the other');
});

test('/api/pricing-rules publishes the banner table', () => {
  const route = src.slice(src.indexOf("app.get('/api/pricing-rules'"), src.indexOf("app.get('/api/pricing-rules'") + 3000);
  assert.match(route, /banner: SIGNAGE\.bannerTable\(\)/);
  assert.match(route, /requireInternalKey/);
});

test('the designer product carries the five option ids the designer reads', () => {
  const a = P.bannerAttributes();
  assert.deepStrictEqual(Object.keys(a).sort(), ['BH', 'BHANG', 'BMAT', 'BSLIT', 'BW', 'QTY']);
  assert.deepStrictEqual(a.BMAT.values.options.map((o) => o.value), s.BANNER_MATERIALS.map((m) => m.key));
  assert.deepStrictEqual(a.BHANG.values.options.map((o) => o.value), Object.keys(s.BANNER_HANGING));
  assert.strictEqual(a.BW.values.options.length, s.BANNER_MAX_FT.long);
  assert.ok(a.BMAT.values.options.every((o) => o.price === ''), 'no price on an option: the table carries it');
  /* Lumise selects an option only when default === true (app.js: o.default === true); a '1' was ignored and the banner opened at 1ft x 1ft. */
  const dflt = (k) => a[k].values.options.filter((o) => o.default === true).map((o) => o.value);
  assert.deepStrictEqual([dflt('BMAT'), dflt('BW'), dflt('BH'), dflt('BHANG'), dflt('BSLIT')], [['13'], ['6'], ['3'], ['grommets'], ['no']]);
  assert.strictEqual(P.bannerStages().front.url, 'products/jt-banner-backdrop.png');
});

test('the Signs365 record agrees with the costs the shop sells from', () => {
  const hd = C.CATALOG.banner.hd_banner.prices;
  assert.strictEqual(hd['13oz'].single, s.BANNER[13].single);
  assert.strictEqual(hd['15oz'].single, s.BANNER[15].single);
  assert.strictEqual(hd['18oz'].single, s.BANNER[18].single);
  assert.strictEqual(hd['18oz'].double, s.BANNER[18].double);
  assert.deepStrictEqual(C.CATALOG.rigid.coro.prices['4mm'], s.CORO[4]);
  assert.deepStrictEqual(C.CATALOG.rigid.coro.prices['10mm'], s.CORO[10]);
  assert.strictEqual(C.CATALOG.banner.poster.prices.single, s.POSTER);
  assert.strictEqual(C.CATALOG.banner.canvas.prices.single, s.CANVAS);
  assert.strictEqual(C.CATALOG.rigid.acrylic.prices.single, s.ACRYLIC_SQIN);
  assert.strictEqual(C.CATALOG.adhesive.low_tac_wall.prices.single, s.ADHESIVE.low_tac_wall);
  assert.strictEqual(C.CATALOG.adhesive.controltac.prices.single, s.ADHESIVE.controltac_3m);
  assert.strictEqual(C.CATALOG.adhesive.gf203.prices.single, s.GF_VINYL);
  assert.deepStrictEqual(C.CATALOG.adhesive.one_way_window.prices, s.ONE_WAY_WINDOW);
  assert.strictEqual(C.CATALOG.magnet.custom.prices.single, s.MAGNET_SQIN);
  assert.deepStrictEqual(C.CATALOG.magnet.vehicle.prices, s.MAGNET_FIXED);
  assert.strictEqual(C.CATALOG.handheld.paper.prices.single, s.PAPER_SHEET);
  assert.strictEqual(C.CATALOG.banner.econo_stand_plus.prices.single, s.PER_ITEM.econo_banner_stand_plus.price);
  for (const p of C.all()) {
    assert.ok(p.id > 0 && p.name && p.unit, `${p.key} needs its order screen id, name and unit`);
    assert.ok(p.prices && Object.keys(p.prices).length, `${p.key} has no price`);
  }
});
