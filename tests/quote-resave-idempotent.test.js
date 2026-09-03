/* Saving a quote twice must not charge more the second time.
 *
 * WHAT WENT WRONG
 * ---------------
 * Size upcharges used to be zeroed whenever a unit price was hand-typed, which
 * was wrong — the price is typed first as a blended per-piece rate and the size
 * mix entered afterwards, so the upcharge vanished at the moment the 2XLs were
 * added. Fixing that (2026-09-01) made priceLine() total a line as
 * `unit x qty + sizeUpcharge + addons`, which is right.
 *
 * What went unnoticed is that the SAVE path stores `unit_price` as the BLENDED
 * rate — line total less the extras, over the quantity — so on a line with
 * extended sizes it now carries the upcharge spread across the pieces. The edit
 * form prefilled the "Each $" box from that field. So:
 *
 *     type $18.00, 24 shirts, 4 x 2XL   -> line $446.72, unit_price $18.61
 *     open the quote, save, change nothing -> line $461.36, unit_price $19.22
 *     save again                           -> line $476.00
 *
 * Every re-save added the upcharge again. Nothing on screen said so: each
 * individual total is internally consistent, and `line_total` still equals
 * `unit_price x qty + addons` at every step. On the quote that found the
 * original bug — 100 shirts, 20 x 2XL and 19 x 3XL — that is $176.20 added
 * every time the quote is opened and saved, to a figure the customer has
 * already agreed to.
 *
 * THE RULE
 * --------
 * The price a person typed is stored as typed (`unit_override`) and is what
 * comes back into the form and into the customer's live estimate. `unit_price`
 * stays blended, because that is what "each" means to a reader of the quote.
 * Round-tripping a line must be a fixed point: same inputs in, same money out,
 * however many times it happens.
 *
 * Quotes saved before `unit_override` existed are recovered rather than
 * guessed — `unit_price` is `typed + sizeUpcharge/qty` by construction, so
 * subtracting the upcharge the line already stores inverts it exactly.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/* The engine, lifted out of the file that ships it. */
const m = src.match(/function quotePricingSource\(\) \{\s*return `([\s\S]*?)`;\s*\n\}/);
assert.ok(m, 'could not find quotePricingSource() in server.js');
const sandbox = {};
vm.runInNewContext(m[1] + '\nthis.priceLine = priceLine;', sandbox);
const { priceLine } = sandbox;

const round2 = (n) => Math.round(n * 100) / 100;

/* typedUnitOf(), lifted the same way. It is the whole fix, so a test that
 * described it in its own words would pass while the shipped one was wrong. */
const t = src.match(/function typedUnitOf\(item\) \{[\s\S]*?\n\}/);
assert.ok(t, 'could not find typedUnitOf() in server.js');
const helper = {};
vm.runInNewContext(
  'function round2(n){ return Math.round(n * 100) / 100; }\n' +
  t[0] + '\nthis.typedUnitOf = typedUnitOf;', helper);
const { typedUnitOf } = helper;

const PRODUCT = {
  id: 1, price: 5.64,
  sizes: [{ size: 'M', upcharge: 0 }, { size: '2XL', upcharge: 3.68 }, { size: '3XL', upcharge: 5.40 }],
};
const METHOD = {
  id: 1, title: 'DTF Printing', type: 'size',
  positions: { front: [{ min_qty: 99, price: 11.90 }] },
};

/** One save: price the line, then store it exactly as the route stores it. */
function save({ typed, sizeMix, addons = [] }) {
  const qty = Object.values(sizeMix).reduce((a, n) => a + n, 0);
  const priced = priceLine({
    product: PRODUCT, method: METHOD, qty, sizeMix, colours: 1, stage: '',
    addons, blankTiers: [], dark: false, blankOverride: null, unitOverride: typed,
  });
  return {
    qty,
    manual: priced.manual,
    size_mix: sizeMix,
    size_upcharge: priced.sizeUpcharge,
    unit_price: round2((priced.lineTotal - priced.addonTotal) / qty),
    unit_override: priced.manual ? round2(priced.unit) : null,
    line_total: priced.lineTotal,
    addons: priced.addonLines,
  };
}

/** Re-open the quote and save it again, changing nothing — what the edit form
 *  does when the only edit is a note, a date or a typo in the customer's name. */
function resave(item) {
  return save({ typed: typedUnitOf(item), sizeMix: item.size_mix,
                addons: (item.addons || []).map((a) => ({ ...a })) });
}

test('re-saving a hand-priced line with extended sizes charges the same', () => {
  const first = save({ typed: '18.00', sizeMix: { M: 20, '2XL': 4 } });
  assert.strictEqual(first.line_total, 446.72);
  assert.strictEqual(first.size_upcharge, 14.72, 'four 2XL at $3.68');

  const second = resave(first);
  assert.strictEqual(second.line_total, first.line_total,
    'the second save charged more than the first — the size upcharge compounded');

  const third = resave(second);
  assert.strictEqual(third.line_total, first.line_total,
    'the third save drifted, so the error compounds rather than happening once');
});

test('the quote that found the bug does not grow by $176.20 a save', () => {
  const first = save({ typed: '10.98', sizeMix: { M: 61, '2XL': 20, '3XL': 19 } });
  /* The engine accumulates the upcharge unrounded and rounds the line once, so
     compare to the cent rather than to a float that happens to end in ...002. */
  assert.strictEqual(round2(first.size_upcharge), 176.20);

  let line = first;
  for (let i = 0; i < 5; i++) line = resave(line);
  assert.strictEqual(line.line_total, first.line_total,
    'five saves moved the total — this is the $176.20-a-save case');
});

test('the typed price survives the round trip, not the blended one', () => {
  const saved = save({ typed: '18.00', sizeMix: { M: 20, '2XL': 4 } });
  assert.strictEqual(saved.unit_override, 18,
    'the form must offer back the price that was typed');
  assert.notStrictEqual(saved.unit_price, saved.unit_override,
    'unit_price is deliberately the BLENDED rate — if these are equal this ' +
    'test is no longer exercising the case that broke');
  assert.strictEqual(typedUnitOf(saved), 18);
});

test('a quote saved before unit_override existed is recovered exactly', () => {
  const saved = save({ typed: '18.00', sizeMix: { M: 20, '2XL': 4 } });
  /* Exactly what such a row looks like: blended unit_price, no override. */
  const legacy = { ...saved, unit_override: undefined };
  assert.strictEqual(typedUnitOf(legacy), 18,
    'the typed price must be recoverable from unit_price and size_upcharge, ' +
    'or every quote already on file keeps compounding');
  assert.strictEqual(resave(legacy).line_total, saved.line_total);
});

test('a line saved before upcharges applied under an override is left alone', () => {
  /* Those rows stored size_upcharge: 0, so unit_price IS the typed price. */
  const old = { manual: true, qty: 24, unit_price: 18, size_upcharge: 0,
                size_mix: { M: 20, '2XL': 4 }, addons: [] };
  assert.strictEqual(typedUnitOf(old), 18);
});

test('a line that was never hand-priced re-prices from the catalogue', () => {
  const listed = save({ typed: '', sizeMix: { M: 20, '2XL': 4 } });
  assert.strictEqual(listed.manual, false);
  assert.strictEqual(typedUnitOf(listed), null,
    'a catalogue-priced line must not be pinned to the figure it happened to ' +
    'total last time — it has to follow the catalogue and the volume bands');
});

test('extras still ride outside the each-price after a round trip', () => {
  const addons = [{ code: 'digitizing', label: 'Digitizing', kind: 'once', rate: 65 }];
  const first = save({ typed: '18.00', sizeMix: { M: 20, '2XL': 4 }, addons });
  assert.strictEqual(first.line_total, round2(446.72 + 65));
  assert.strictEqual(resave(first).line_total, first.line_total,
    'a one-time fee must not be swept into the each-price and re-multiplied');
});

test('the edit form offers back the typed price, not the blended one', () => {
  assert.match(src, /name="unit_price\$\{n\}"[\s\S]{0,200}?typedUnitOf\(it\)/,
    'the "Each $" box must prefill from typedUnitOf() — prefilling it from ' +
    'unit_price is the bug, and it is invisible until somebody saves twice');
});

test("the customer's live estimate overrides from the typed price too", () => {
  assert.match(src, /unitOverride: typedUnitOf\(it\)/,
    'customerLinePricing() must pass the typed price — passing the blended one ' +
    'inflated every hand-priced line the moment a customer touched any quantity');
});
