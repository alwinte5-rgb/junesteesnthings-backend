'use strict';

/* Print locations (2026-10-06).
 *
 * The quote form used to describe "what is printed where" in seven overlapping
 * fields: a decoration, a front/back/both dropdown, a back ink box, a sleeves
 * dropdown with its own ink box, and a second decoration with its own location.
 * The owner could not follow it, and a helper would have been lost. It is now
 * one row per place — front, back, left sleeve, right sleeve — each with its
 * own method and ink count, stored as `prints`.
 *
 * What these pin:
 *   - a line written the new way prices exactly as the same job written the
 *     old way, across methods, places, ink counts, dark garments and bands;
 *   - mixed methods on one garment price each place with its own method, and
 *     each method's minimum applies only to its own places;
 *   - screens are one set per screen-printed place, at that place's count;
 *   - an old line converts to the same list (legacyPrints), so the form, the
 *     customer's page and the job cost read it the way it was priced;
 *   - the save route only accepts the four places and real, non-cutout methods.
 *
 * The old engine itself was compared against this one over 276,480 old-style
 * lines before release (identical to the cent); old lines still price through
 * legacyPrints(), whose shape is pinned below.
 *
 * Run: node --test tests/quote-print-locations.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const text = vm.runInThisContext(lift('quotePricingSource') + '\nquotePricingSource()');
const { priceLine, legacyPrints, linePrintsFrom } =
  vm.runInThisContext(text + '\n({ priceLine, legacyPrints, linePrintsFrom })');
const JC = require('../tools/lib/job-costs');

const SCREEN = { id: 22, title: 'Screen Printing', type: 'color', min_order_qty: 50, max_screens: 6,
  positions: { id: [{ min_qty: 71, colors: { '1-color': 4.1, '2-color': 5.35, '3-color': 6.6, '4-color': 7.85, 'full-color': 12 } },
                    { min_qty: 10000, colors: { '1-color': 2.4, '2-color': 3.1, '3-color': 3.8, '4-color': 4.5, 'full-color': 7 } }] } };
const DTF = { id: 1, title: 'DTF Printing', type: 'fixed', min_order_qty: 0,
  positions: { id: [{ min_qty: 49, price: 7.25 }, { min_qty: 10000, price: 5.1 }],
               mr8a5dlx: [{ min_qty: 49, price: 5.25 }, { min_qty: 10000, price: 3.9 }] } };
const EMB = { id: 5, title: 'Embroidery', type: 'fixed', min_order_qty: 12,
  positions: { front: [{ min_qty: 23, price: 8.75 }, { min_qty: 10000, price: 6.5 }] } };
const screens = { code: 'screens', label: 'Screens', kind: 'per_screen', rate: 25, runShared: true };
const base = { product: { price: 4.37, sizes: [] }, addons: [screens], blankTiers: [] };
const strip = (ps) => ps.map((p) => ({ loc: p.loc, method: p.method, colours: p.colours }));

test('a job written as print locations prices exactly as the same job written the old way', () => {
  let n = 0;
  for (const method of [SCREEN, DTF, EMB]) for (const stage of ['', 'mr8a5dlx', 'both'])
  for (const colours of [1, 3]) for (const backColours of ['', 1]) for (const sleeves of ['', 'left', 'both'])
  for (const sleeveColours of ['', 2]) for (const dark of [false, true]) for (const qty of [12, 60, 200]) {
    /* The one deliberate difference: a DTF print on the back ALONE is DTF's
       main print, not its additional location (see the test below). */
    if (method === DTF && stage === 'mr8a5dlx') continue;
    const old = { ...base, qty, method, stage, colours, backColours, sleeves, sleeveColours, dark };
    const now = { ...base, qty, dark, prints: strip(legacyPrints(old)) };
    const a = priceLine(old), b = priceLine(now);
    assert.deepStrictEqual(
      [b.lineTotal, b.listUnit, b.screens, b.overScreens, b.passScreens],
      [a.lineTotal, a.listUnit, a.screens, a.overScreens, a.passScreens],
      JSON.stringify({ method: method.id, stage, colours, backColours, sleeves, sleeveColours, dark, qty }));
    n++;
  }
  assert.ok(n > 500);
});

test('a method\'s first place takes its main price, later places its additional-location price', () => {
  /* The owner's screenshot, 2026-10-06: screen front + DTF back at 1 piece had
     the DTF back at the $6.70 additional-location rate. It is the only DTF
     print on the shirt, so it is DTF's main print. */
  const backOnly = priceLine({ ...base, addons: [], qty: 60, prints: [{ loc: 'back', method: DTF }] });
  assert.equal(backOnly.decoration, 5.1, 'DTF on the back alone is the main print');
  const sleeveOnly = priceLine({ ...base, addons: [], qty: 60, prints: [{ loc: 'right', method: DTF }] });
  assert.equal(sleeveOnly.decoration, 5.1, 'DTF on a sleeve alone is the main print');
  const frontBack = priceLine({ ...base, addons: [], qty: 60, prints: [{ loc: 'front', method: DTF }, { loc: 'back', method: DTF }] });
  assert.equal(frontBack.decoration, 5.1 + 3.9, 'a second DTF place is the additional location');
  const mixed = priceLine({ ...base, addons: [], qty: 60, prints: [{ loc: 'front', method: SCREEN, colours: 1 }, { loc: 'back', method: DTF }] });
  assert.equal(mixed.decoration, 4.1 + 5.1, 'screen front + DTF back: the back is still DTF\'s main print');
});

test('mixed methods: each place prices with its own method', () => {
  const r = priceLine({ ...base, qty: 60, prints: [
    { loc: 'front', method: DTF, colours: '' },
    { loc: 'back', method: SCREEN, colours: 1 },
  ] });
  /* DTF front 5.10 (60 is past its 49 band) + screen back 1-colour 4.10 (the ≤71 band) */
  assert.equal(r.decoration, 5.1 + 4.1);
  assert.equal(r.screens, 1, 'only the screen-printed back burns a screen');
  assert.equal(r.lineTotal, Math.round((Math.round((4.37 + 9.2) * 100) / 100 * 60 + 25) * 100) / 100);
});

test('a method\'s minimum applies to its own places only', () => {
  /* 20 pieces: screen printing's 50 minimum scales the SCREEN part only. */
  const r = priceLine({ ...base, addons: [], qty: 20, prints: [
    { loc: 'front', method: DTF, colours: '' },
    { loc: 'left', method: SCREEN, colours: 1 },
  ] });
  const screenAt20 = Math.round(4.1 * (50 / 20) * 100) / 100;
  assert.equal(Math.round(r.decoration * 100) / 100, Math.round((7.25 + screenAt20) * 100) / 100);
});

test('screens: one set per screen-printed place, at its own count, plus the underbase on dark', () => {
  const r = priceLine({ ...base, qty: 100, dark: true, prints: [
    { loc: 'front', method: SCREEN, colours: 3 },
    { loc: 'back', method: SCREEN, colours: 1 },
    { loc: 'right', method: SCREEN, colours: 2 },
  ] });
  assert.equal(r.screens, 4 + 2 + 3);
  assert.equal(r.passScreens, 4);
  assert.equal(r.overScreens, false);
  const over = priceLine({ ...base, qty: 100, dark: true, prints: [
    { loc: 'front', method: SCREEN, colours: 1 },
    { loc: 'back', method: { ...SCREEN, max_screens: 3 }, colours: 3 },
  ] });
  assert.equal(over.overScreens, true, 'the back alone is past its press ceiling');
});

test('an old line converts to the places it was priced on', () => {
  const ps = (o) => legacyPrints(o).map((p) => `${p.loc}:${p.method.id}:${p.colours}`);
  assert.deepStrictEqual(ps({ method: SCREEN, stage: '', colours: 3 }), ['front:22:3']);
  assert.deepStrictEqual(ps({ method: SCREEN, stage: 'mr8a5dlx', colours: 2 }), ['back:22:2']);
  assert.deepStrictEqual(ps({ method: SCREEN, stage: 'both', colours: 3 }), ['front:22:3', 'back:22:3'],
    'no back count: the back was priced at the front\'s');
  assert.deepStrictEqual(ps({ method: SCREEN, stage: 'both', colours: 3, backColours: 1, sleeves: 'both', sleeveColours: 1 }),
    ['front:22:3', 'back:22:1', 'left:22:1', 'right:22:1']);
  assert.deepStrictEqual(ps({ method: DTF, stage: '', method2: SCREEN, stage2: 'mr8a5dlx', colours2: 1 }),
    ['front:1:undefined', 'back:22:1']);
  assert.deepStrictEqual(ps({}), []);
});

test('a posted list is cleaned: known places only, one each, in order', () => {
  const out = linePrintsFrom([
    { loc: 'right', method: SCREEN, colours: 1 },
    { loc: 'collar', method: SCREEN, colours: 1 },
    { loc: 'front', method: DTF },
    { loc: 'front', method: SCREEN, colours: 2 },
    { loc: 'back', method: null },
  ]);
  assert.deepStrictEqual(out.map((p) => p.loc + ':' + p.method.id), ['front:1', 'right:22']);
});

test('the save route reads the four places, real non-cutout methods, and stores them', () => {
  assert.match(src, /for \(const loc of PRINT_LOCS\) \{\s*if \(!tickedBox\(one\(b\[`pr_on_\$\{loc\}\$\{i\}`\]\)\)\) continue;/);
  assert.match(src, /!SUPPLIER_PRODUCT_RE\.test\(String\(m\.title \|\| ''\)\)\);/);
  assert.match(src, /colours: colourCount\(pm, one\(b\[`pr_c_\$\{loc\}\$\{i\}`\]\)\)/);
  assert.match(src, /prints: usePrints \? prints\.map\(\(p\) => \(\{ loc: p\.loc, method_id: p\.method\.id,/);
  /* Every method on the line brings its own add-ons — a DTF front with a
     screen-printed back still burns screens. */
  assert.match(src, /const addonTitles = usePrints \? \[\.\.\.new Set\(prints\.map/);
});

test('job costs: every place is costed, DTF extra places at the second-location rate', () => {
  const methods = new Map([[22, SCREEN], [1, DTF]].map(([k, v]) => [k, v]));
  const { places } = JC.linePlaces({ prints: [
    { loc: 'front', method_id: 1 }, { loc: 'back', method_id: 1 }, { loc: 'left', method_id: 22, colours: 1 },
  ] }, methods);
  assert.deepStrictEqual(places.map((p) => p.loc), ['front', 'back', 'left']);
  const both = JC.decorationEach(DTF, 'both', '', 100, 0).each;
  const one = JC.decorationEach(DTF, '', '', 100, 0).each;
  const scr = JC.decorationEach(SCREEN, '', 1, 100, 0).each;
  assert.equal(Math.round(JC.placesCost(places, 100, 0).each * 1e6), Math.round((both + scr) * 1e6));
  assert.ok(both > one, 'the back is costed, not free');
  /* An old line with sleeves and a back count is costed the same way. */
  const legacy = JC.linePlaces({ method_id: 22, stage: 'both', colours: 3, back_colours: 1, sleeves: 'right' }, methods);
  assert.deepStrictEqual(legacy.places.map((p) => p.loc + ':' + p.colours), ['front:3', 'back:1', 'right:3']);
});

test('every Signs365 product carries the supplier delivery charge automatically, once an order', () => {
  const re = eval(src.match(/const SIGNS365_FREIGHT_RE = (\/.*\/i);/)[1]);
  for (const t of ['Big Head Cutout — 24in, 8-pack (full sheet)', 'Vinyl Banner — 3ft x 6ft, 13oz single-sided',
    'Retractable Banner Stand — 33.5in x 80in', 'Poster — 18in x 24in, single-sided', 'Window Graphic — one-way vinyl, per sqft',
    'Wall Graphic — removable fabric, per sqft', 'Vehicle Graphic — 3M ControlTac, per sqft', 'Vehicle Magnet — 24in x 12in, single-sided',
    'Acrylic Panel — 12in x 12in, single-sided', 'Canvas Print — 16in x 20in, single-sided', 'Business Cards — single or double-sided',
    'Flyers — 6in x 4in, single or double-sided']) assert.ok(re.test(t), t);
  /* A full board ships oversized and that freight is inside its price. */
  assert.ok(!re.test('Full Body Cutout — single-sided'));
  for (const t of ['Screen Printing', 'DTF Printing', 'Embroidery']) assert.ok(!re.test(t), t);
  const ship = src.match(/code: 'cutout_ship'[\s\S]*?\},/)[0];
  assert.match(ship, /auto: 'method'/, 'the standard delivery charge must be automatic');
  assert.match(ship, /orderShared: true/);
  /* The form claims automatic order-level charges before its once-an-order
     filter, as the save route does — or the screen bills it per line. */
  const form = src.slice(src.indexOf('Charges the method carries automatically'));
  assert.ok(form.indexOf("if (a.code === 'cutout_ship' && (freightUpgraded || upgradedOn(L))) return;") > -1 &&
    form.indexOf("if (a.code === 'cutout_ship' && (freightUpgraded || upgradedOn(L))) return;") < form.indexOf('addons = addons.filter(function(a){'));
  /* Only a REQUIRED item's Saturday/large rate replaces the charge order-wide. */
  assert.match(src, /const freightUpgraded = \[\.\.\.Array\(40\)\.keys\(\)\]\.some\(\(i\) => !isOptional\(i\) && upgradedAt\(i\)\);/);
  assert.match(src, /if \(a\.code === 'cutout_ship' && \(freightUpgraded \|\| upgradedAt\(i\)\)\) continue;/);
});
