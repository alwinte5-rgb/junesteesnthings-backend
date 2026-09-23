'use strict';

/* One garment, two processes, ONE line.
 *
 * A job that is DTF on one side and screen printed on the other is one shirt
 * and two decorations. Before this, a line carried a single method, so the job
 * could only be quoted two ways and both were wrong:
 *
 *   two lines          the shirt is counted twice — 50 garments billed as 100
 *   one line           only one of the two processes is charged
 *
 * The engine now carries method2/stage2 alongside method/stage. This lifts the
 * real priceLine out of server.js and runs it, the same way
 * decoration-parity.test.js does, so what is asserted here is what both the
 * browser and the save path execute.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* customerLinePricing calls typedUnitOf(), so the real one is lifted with it
   rather than stubbed — a stub would let the test pass while the shipped pair
   disagreed, which is the whole failure mode these lifted tests exist for. */
function lift(body) {
  const tu = src.slice(src.indexOf('function typedUnitOf('));
  const tuBody = tu.slice(0, tu.indexOf('\n}\n') + 2);
  return vm.runInThisContext('(function(){' + tuBody + '\nreturn (' + body + ');})()');
}

function engine() {
  const e = src.slice(src.indexOf('function quotePricingSource()'));
  const body = e.slice(e.indexOf('return `') + 8, e.indexOf('\n`;'));
  const code = body.replace(/\\`/g, '`').replace(/\\\$/g, '$').replace(/\\\\/g, '\\');
  const ctx = vm.runInThisContext('(function(){' + code + '\nreturn {priceLine:priceLine};})()');
  return ctx.priceLine;
}

/* The live ladders, as jt-catalog.php publishes them. Bands key on CEILINGS. */
const DTF = {
  id: 1, title: 'DTF Printing', type: 'fixed', min_order_qty: 0, colour_options: [],
  positions: {
    id: [{ min_qty: 3, price: 26.05 }, { min_qty: 11, price: 23.2 }, { min_qty: 24, price: 18.3 },
         { min_qty: 49, price: 15.75 }, { min_qty: 99, price: 11.9 }, { min_qty: 249, price: 9.5 }],
    mr8a5dlx: [{ min_qty: 3, price: 6.7 }, { min_qty: 11, price: 5.95 }, { min_qty: 24, price: 5.85 },
               { min_qty: 49, price: 5.25 }, { min_qty: 99, price: 4.95 }, { min_qty: 249, price: 4.2 }],
  },
};
const SCREEN = {
  id: 22, title: 'Screen Printing', type: 'color', min_order_qty: 50, colour_options: [1, 2, 3, 4, 5, 6, 7],
  positions: {
    front: [
      { min_qty: 99, price: 3.85, colors: { '1-color': 3.85, '2-color': 4.8, '7-color': 9.8 } },
      { min_qty: 249, price: 3.45, colors: { '1-color': 3.45, '2-color': 4.35, '7-color': 9.25 } },
    ],
  },
};
const SHIRT = { id: 187, price: 6.40, sizes: [], colours: [] };

const line = (over) => Object.assign({
  product: SHIRT, qty: 100, sizeMix: null, colours: '', stage: '',
  method2: null, stage2: '', colours2: '',
  addons: [], blankTiers: [], dark: false, blankOverride: null, unitOverride: '',
}, over);

test('a line with two decorations charges the garment ONCE', () => {
  const priceLine = engine();
  const both = priceLine(line({ method: DTF, method2: SCREEN, colours2: '1' }));
  const dtfOnly = priceLine(line({ method: DTF }));
  const screenOnly = priceLine(line({ method: SCREEN, colours: '1' }));

  /* The garment is in each single-decoration line once, so the two-decoration
     unit must be LESS than the two lines added together — by exactly one
     garment. That is the whole point. */
  assert.ok(both.unit < dtfOnly.unit + screenOnly.unit, 'the garment is being charged twice');
  const garment = dtfOnly.unit + screenOnly.unit - both.unit;
  assert.ok(Math.abs(garment - SHIRT.price) < 0.02,
    `the difference should be exactly one garment ($${SHIRT.price}), got $${garment.toFixed(2)}`);
});

test('both decorations are actually charged', () => {
  const priceLine = engine();
  const both = priceLine(line({ method: DTF, method2: SCREEN, colours2: '1' }));
  const dtfOnly = priceLine(line({ method: DTF }));
  assert.ok(both.unit > dtfOnly.unit, 'the second decoration added nothing');
  /* 100 pieces: garment 6.40 + DTF front 9.50 + screen 1-colour 3.45 */
  assert.ok(Math.abs(both.unit - (6.40 + 9.50 + 3.45)) < 0.02,
    'expected $19.35 a piece, got $' + both.unit.toFixed(2));
});

test('each decoration is minimum-enforced on its OWN method', () => {
  const priceLine = engine();
  /* Screen printing has a 50-piece floor; DTF has none. At 25 pieces the screen
     half must be scaled up and the DTF half must NOT be. */
  const at25 = priceLine(line({ qty: 25, method: DTF, method2: SCREEN, colours2: '1' }));
  const dtf25 = priceLine(line({ qty: 25, method: DTF }));
  const screen25 = priceLine(line({ qty: 25, method: SCREEN, colours: '1' }));
  /* The DTF half is untouched by screen printing's minimum. */
  assert.ok(Math.abs((at25.unit - screen25.unit + SHIRT.price) - dtf25.unit) < 0.05,
    "screen printing's 50-piece minimum leaked onto the DTF half");
});

test('the order of the two decorations does not change the price', () => {
  const priceLine = engine();
  const a = priceLine(line({ method: DTF, method2: SCREEN, colours2: '1' }));
  const b = priceLine(line({ method: SCREEN, colours: '1', method2: DTF, colours2: '' }));
  assert.ok(Math.abs(a.unit - b.unit) < 0.02,
    'DTF+screen and screen+DTF priced differently: $' + a.unit.toFixed(2) + ' vs $' + b.unit.toFixed(2));
});

test('a line with no second decoration prices exactly as it did before', () => {
  const priceLine = engine();
  const withNull = priceLine(line({ method: DTF, method2: null }));
  const without = priceLine(line({ method: DTF }));
  assert.strictEqual(withNull.unit, without.unit);
  /* 100 pieces: 6.40 garment + 9.50 DTF front */
  assert.ok(Math.abs(without.unit - 15.90) < 0.02, 'got $' + without.unit.toFixed(2));
});

test('placement applies per decoration', () => {
  const priceLine = engine();
  /* DTF front only vs DTF both sides, with the same screen back. */
  const front = priceLine(line({ method: DTF, stage: '', method2: SCREEN, colours2: '1' }));
  const bothSides = priceLine(line({ method: DTF, stage: 'both', method2: SCREEN, colours2: '1' }));
  assert.ok(bothSides.unit > front.unit, 'front+back DTF should cost more than front only');
  /* The extra is the DTF back rate at 100: $4.20. */
  assert.ok(Math.abs((bothSides.unit - front.unit) - 4.20) < 0.02,
    'expected the DTF back rate, got $' + (bothSides.unit - front.unit).toFixed(2));
});

/* ── The customer's own page ──────────────────────────────────────────────
 *
 * customerLinePricing() rebuilds each line from scratch before it is sent to
 * the customer, deliberately: the catalogue carries the shop's COST on every
 * product and shipping that would hand the customer the margin on their own
 * job. Nothing is copied wholesale, so a new field has to be added there
 * on purpose — and the first version of the two-decoration change did not.
 *
 * The consequence was not cosmetic. The customer's page re-prices when they
 * nudge a quantity, so a DTF-front/screen-back line would have lost its screen
 * half on the first nudge and shown an estimate UNDER the quote they were
 * sent.
 */
test('the customer page carries the second decoration, and still no cost', () => {
  const fn = src.slice(src.indexOf('function customerLinePricing(items, catalog)'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
  const customerLinePricing = lift(body);

  const catalog = {
    products: [{ id: 187, price: 6.40, cost: 3.10, sizes: [], colours: [] }],
    methods: [
      Object.assign({ cost: 99 }, DTF),
      Object.assign({ cost: 99 }, SCREEN),
    ],
  };
  const items = [{
    product_id: 187, method_id: 1, stage: '', method2_id: 22, stage2: 'mr8a5dlx',
    colours: '', colours2: '1', qty: 100, addons: [],
  }];
  const out = customerLinePricing(items, catalog);
  assert.equal(out.length, 1);

  /* The second decoration survives the rebuild. */
  assert.ok(out[0].method2, 'method2 was dropped on the way to the customer');
  assert.equal(out[0].method2.id, 22);
  assert.equal(out[0].stage2, 'mr8a5dlx');

  /* And the rule the whole function exists for still holds, for BOTH methods
     and the product: the shop's cost basis never leaves the building. */
  const json = JSON.stringify(out[0]);
  assert.equal(/"cost"/.test(json), false, 'a cost field reached the customer payload');
  assert.equal(out[0].method.cost, undefined);
  assert.equal(out[0].method2.cost, undefined);
  assert.equal(out[0].product.cost, undefined);
});

test('a line with no second decoration still sends method2 as null', () => {
  const fn = src.slice(src.indexOf('function customerLinePricing(items, catalog)'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
  const customerLinePricing = lift(body);
  const catalog = { products: [{ id: 187, price: 6.40, sizes: [], colours: [] }], methods: [DTF] };
  const out = customerLinePricing([{ product_id: 187, method_id: 1, qty: 100, addons: [] }], catalog);
  assert.strictEqual(out[0].method2, null);
  assert.strictEqual(out[0].stage2, null);
});

/* ── Screens, on a two-decoration line and across a run ────────────────────
 *
 * Two separate bugs lived here, in opposite directions:
 *
 *   The screen count read o.colours and o.stage unconditionally. That was
 *   right while a line held one decoration. With two it read the wrong half:
 *   a DTF front with a 4-colour screen BACK billed ONE screen instead of four,
 *   $75 short on every such job; a DTF printed both sides with a 1-colour
 *   screen front billed TWO instead of one.
 *
 *   And screens were billed per LINE. Lines pooled into one run are one press
 *   setup — the same artwork across several garment colours — so a run of
 *   three was paying for three sets of the same screens.
 */
const SCREENS_ADDON = { code: 'screens', label: 'Screens', kind: 'per_screen', rate: 25 };
const SCREEN4 = Object.assign({}, SCREEN, {
  positions: { front: [{ min_qty: 99, price: 3.85, colors: { '1-color': 3.85, '2-color': 4.8, '4-color': 6.8 } }] },
});
const scr = (r) => ((r.addonLines || []).find((a) => a.code === 'screens') || { total: 0 }).total;

test('screens are counted from the screen-print half, whichever slot it is in', () => {
  const priceLine = engine();
  const L = (o) => priceLine(line(Object.assign({ addons: [SCREENS_ADDON] }, o)));

  /* Screen print alone — the case that always worked. */
  assert.equal(L({ method: SCREEN4, colours: '4' }).screens, 4);

  /* DTF front, 4-colour screen BACK. The screens belong to the second slot. */
  assert.equal(L({ method: DTF, stage: '', method2: SCREEN4, stage2: 'mr8a5dlx', colours2: '4' }).screens, 4,
    'a 4-colour screen back must bill four screens, not the DTF half is one');

  /* DTF BOTH sides, 1-colour screen front. The DTF placement must not inflate
     the screen count — two locations of DTF is not two screen locations. */
  assert.equal(L({ method: DTF, stage: 'both', method2: SCREEN4, stage2: '', colours2: '1' }).screens, 1,
    "the DTF's two sides inflated the screen count");

  /* A dark garment still adds its underbase, on the screen half. */
  assert.equal(L({ method: DTF, method2: SCREEN4, stage2: '', colours2: '1', dark: true }).screens, 2);
});

test('a run burns its screens once, not once a line', () => {
  const priceLine = engine();
  const base = { method: SCREEN4, colours: '4', addons: [SCREENS_ADDON], bandQty: 300 };
  const primary = priceLine(line(Object.assign({}, base, { runPrimary: true })));
  const other = priceLine(line(Object.assign({}, base, { runPrimary: false })));

  assert.equal(scr(primary), 100, 'the primary line carries the run\'s four screens at $25');
  assert.equal(scr(other), 0, 'a second line in the same run must not buy the screens again');

  /* The secondary line still prices its DECORATION at the pooled quantity —
     it is only the screens it does not repeat. */
  assert.ok(other.decoration > 0, 'the run member lost its decoration, not just its screens');
  assert.equal(other.decoration, primary.decoration);
});

test('a line not in a run bills its own screens, exactly as before', () => {
  const priceLine = engine();
  const alone = priceLine(line({ method: SCREEN4, colours: '4', addons: [SCREENS_ADDON] }));
  const explicit = priceLine(line({ method: SCREEN4, colours: '4', addons: [SCREENS_ADDON], runPrimary: true }));
  assert.equal(scr(alone), 100);
  assert.equal(scr(alone), scr(explicit), 'an undefined runPrimary must behave as the primary');
});

test('run pooling reaches BOTH decorations', () => {
  const priceLine = engine();
  /* 30 pieces on the line, 300 across the run: both halves must read the 300
     band, not the 30 one. */
  const pooled = priceLine(line({ qty: 30, bandQty: 300, method: DTF, method2: SCREEN4, colours2: '1' }));
  const alone = priceLine(line({ qty: 30, method: DTF, method2: SCREEN4, colours2: '1' }));
  assert.ok(pooled.decoration < alone.decoration, 'the run did not cheapen the first decoration');
  assert.ok(pooled.unit < alone.unit, 'the run did not reach the line at all');
  /* And specifically the second half moved too: at 300 the screen rate is
     $3.45, at 30 it clamps to the 99 band at $3.85. */
  assert.ok(Math.abs(pooled.unit - alone.unit) > 0.35,
    'only one of the two decorations responded to the run');
});
