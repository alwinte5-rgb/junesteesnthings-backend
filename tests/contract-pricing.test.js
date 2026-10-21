'use strict';

/* Contract pricing + the DTF chest logo (owner, 2026-10-21).
 *
 * Ink Theory signed a 60-day contract: DTF front and back on their own
 * garments, $12 standard / $14 oversized at 24-49 pieces, $11 / $13 at 50+,
 * stepping up $2 or $4 when a month's volume is missed. The quote form picks
 * the contract; priceLine() prices the line from it.
 *
 * The chest logo is a DTF print up to 4" x 4" with its own main-print ladder.
 * On its own it is the main print; beside a full front or back it is the
 * additional location wherever it sits.
 *
 * What these pin:
 *   - the contract figures match the signed agreement, steps included;
 *   - a contract line is all-in (the $1.50 own-blanks fee is not added);
 *   - 50+ is per design (the run's pooled quantity), 24 is the minimum;
 *   - anything the contract does not cover prices from the list and says why;
 *   - a typed price still wins over the contract;
 *   - the save route only lets a contract onto the customer it names;
 *   - the chest logo takes the main table alone and the additional one beside
 *     a bigger print, front or back;
 *   - the chest ladder in the tool never rises with quantity and stays under
 *     the full-front price.
 *
 * Run: node --test tests/contract-pricing.test.js
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
const { priceLine } = vm.runInThisContext(text + '\n({ priceLine })');
const { contractTerms, contractAllowed, contractChoices } = require('../tools/lib/contracts');
const { CHEST_LOGO_LADDER } = require('../tools/lib/dtf-chest-logo');

/* The live ladders (docs/pricing-2026.md), bands 12-24 .. 100-249. */
const band = (pairs) => pairs.map(([min_qty, price]) => ({ min_qty, price }));
const ADDL = band([[24, 5.25], [35, 5.00], [49, 4.80], [99, 4.60], [249, 4.20]]);
const DTF = { id: 1, title: 'DTF Printing', type: 'fixed', min_order_qty: 0,
  positions: { id: band([[24, 16.75], [35, 14.75], [49, 13.00], [99, 11.00], [249, 9.50]]), mr8a5dlx: ADDL } };
const OVER = { id: 64, title: 'DTF Printing — Oversized (up to 252 sq in)', type: 'fixed', min_order_qty: 0,
  positions: { id: band([[24, 20.05], [35, 17.40], [49, 15.65], [99, 13.10], [249, 11.30]]), mr8a5dlx: ADDL } };
const CHEST = { id: 70, title: 'DTF Printing — Chest logo (up to 16 sq in)', type: 'fixed', min_order_qty: 0,
  positions: { id: band([[24, 9.60], [35, 8.45], [49, 7.45], [99, 7.25], [249, 5.15]]), mr8a5dlx: ADDL } };
const SCREEN = { id: 22, title: 'Screen Printing', type: 'color', min_order_qty: 50, max_screens: 6,
  positions: { id: [{ min_qty: 99, colors: { '1-color': 4.1, 'full-color': 12 } }] } };

const OWN = { code: 'own_blanks', label: 'Customer supplies the blanks', kind: 'per_piece', rate: 1.50 };
const TEE = { price: 4.0, sizes: [] };
const line = (prints, qty, extra) => priceLine(Object.assign({
  product: TEE, qty, prints: prints.map(([loc, method]) => ({ loc, method, colours: '' })),
  addons: [OWN], blankTiers: [],
}, extra || {}));

test('the Ink Theory figures are the signed agreement, steps included', () => {
  assert.deepStrictEqual(contractTerms('ink-theory:0'),
    { key: 'ink-theory:0', name: 'Ink Theory', min: 24, big: 50, standard: [12, 11], oversized: [14, 13] });
  assert.deepStrictEqual(contractTerms('ink-theory:1').standard, [14, 13]);
  assert.deepStrictEqual(contractTerms('ink-theory:1').oversized, [16, 15]);
  assert.deepStrictEqual(contractTerms('ink-theory:2').standard, [16, 15]);
  assert.deepStrictEqual(contractTerms('ink-theory:2').oversized, [18, 17]);
  assert.strictEqual(contractTerms('ink-theory:3'), null);
  assert.strictEqual(contractTerms('nobody:0'), null);
  assert.strictEqual(contractTerms('toString:0'), null);
  assert.strictEqual(contractTerms(''), null);
  assert.strictEqual(contractChoices().length, 3);
});

test('a contract only goes on the customer it names', () => {
  assert.strictEqual(contractAllowed('ink-theory:0', 'ethan.g@inktheoryofficial.com'), true);
  assert.strictEqual(contractAllowed('ink-theory:0', ' Ethan.G@InkTheoryOfficial.com '), true);
  assert.strictEqual(contractAllowed('ink-theory:0', 'someone@else.com'), false);
  assert.strictEqual(contractAllowed('ink-theory:0', ''), false);
  assert.strictEqual(contractAllowed('ink-theory:9', 'ethan.g@inktheoryofficial.com'), false);
});

test('standard front + back on his blanks: $12 at 24, $11 at 50, all-in', () => {
  const c = contractTerms('ink-theory:0');
  const r24 = line([['front', DTF], ['back', DTF]], 24, { contract: c });
  assert.strictEqual(r24.contract, true);
  assert.strictEqual(r24.unit, 12);
  assert.strictEqual(r24.lineTotal, 288, 'no $1.50 own-blanks fee on top');
  /* Kept on the line at $0: reopening, the customer's page and the blanks
     schedule all read the code. */
  assert.ok(r24.addonLines.some((a) => a.code === 'own_blanks' && a.total === 0));
  assert.strictEqual(r24.addonTotal, 0);
  const r50 = line([['front', DTF], ['back', DTF]], 50, { contract: c });
  assert.strictEqual(r50.unit, 11);
  assert.strictEqual(r50.lineTotal, 550);
  /* The list price for the same 24 is far higher, which is the point. */
  const list = line([['front', DTF], ['back', DTF]], 24);
  assert.strictEqual(list.contract, false);
  assert.strictEqual(list.lineTotal, Math.round((16.75 + 5.25 + 1.5) * 24 * 100) / 100);
});

test('oversized anywhere on the line is the oversized price; steps add on', () => {
  const r = line([['front', CHEST], ['back', OVER]], 30, { contract: contractTerms('ink-theory:0') });
  assert.strictEqual(r.unit, 14);
  const s2 = line([['front', CHEST], ['back', OVER]], 60, { contract: contractTerms('ink-theory:2') });
  assert.strictEqual(s2.unit, 17);
  const s1 = line([['front', DTF], ['back', DTF]], 24, { contract: contractTerms('ink-theory:1') });
  assert.strictEqual(s1.unit, 14);
});

test('50+ is per design: a run pooling 30 + 30 gets the 50+ price', () => {
  const r = line([['front', DTF], ['back', DTF]], 30, { contract: contractTerms('ink-theory:0'), bandQty: 60 });
  assert.strictEqual(r.unit, 11);
});

test('a third place adds its list additional-location price', () => {
  const r = line([['front', DTF], ['back', DTF], ['left', DTF]], 24, { contract: contractTerms('ink-theory:0') });
  assert.strictEqual(r.unit, 12 + 5.25);
});

test('what the contract does not cover prices from the list and says why', () => {
  const c = contractTerms('ink-theory:0');
  const small = line([['front', DTF], ['back', DTF]], 12, { contract: c });
  assert.strictEqual(small.contract, false);
  assert.match(small.contractMiss, /24 pieces minimum/);
  assert.strictEqual(small.unit, small.listUnit);
  const theirs = line([['front', DTF], ['back', DTF]], 24, { contract: c, addons: [] });
  assert.strictEqual(theirs.contract, false);
  assert.match(theirs.contractMiss, /Customer supplies the blanks/);
  const scr = line([['front', SCREEN]], 60, { contract: c });
  assert.strictEqual(scr.contract, false);
  assert.match(scr.contractMiss, /DTF prints only/);
});

test('a typed price still wins over the contract', () => {
  const r = line([['front', DTF], ['back', DTF]], 24, { contract: contractTerms('ink-theory:0'), unitOverride: '10' });
  assert.strictEqual(r.unit, 10);
  assert.strictEqual(r.manual, true);
  assert.strictEqual(r.contract, false);
});

test('chest logo alone takes its own main table', () => {
  const r = line([['front', CHEST]], 24, { addons: [] });
  assert.strictEqual(r.decoration, 9.60);
  const r60 = line([['front', CHEST]], 60, { addons: [] });
  assert.strictEqual(r60.decoration, 7.25);
});

test('chest logo beside a full back is the additional location, front or back', () => {
  /* Chest on the front, standard back: back is main, chest is additional. */
  const a = line([['front', CHEST], ['back', DTF]], 60, { addons: [] });
  assert.strictEqual(a.decoration, 11.00 + 4.60);
  /* Same with the full print on the front and a small print on the back. */
  const b = line([['front', DTF], ['back', CHEST]], 60, { addons: [] });
  assert.strictEqual(b.decoration, 11.00 + 4.60);
  /* Oversized back still outranks both. */
  const c = line([['front', CHEST], ['back', OVER]], 60, { addons: [] });
  assert.strictEqual(c.decoration, 13.10 + 4.60);
  /* Unchanged: two standard prints, first one is main. */
  const d = line([['front', DTF], ['back', DTF]], 60, { addons: [] });
  assert.strictEqual(d.decoration, 11.00 + 4.60);
});

test('the chest ladder never rises and stays under the full front', () => {
  const full = { 4: 20.75, 11: 18.75, 24: 16.75, 35: 14.75, 49: 13.00, 99: 11.00,
    249: 9.50, 499: 7.55, 999: 6.10, 2499: 4.90, 7000: 4.00 };
  const ceils = Object.keys(CHEST_LOGO_LADDER).map(Number).sort((x, y) => x - y);
  assert.deepStrictEqual(ceils, Object.keys(full).map(Number));
  let prev = Infinity;
  for (const c of ceils) {
    const p = Number(CHEST_LOGO_LADDER[c]);
    assert.ok(p > 0 && p <= prev, `chest price rises at ${c}`);
    assert.ok(p < full[c], `chest not under full front at ${c}`);
    prev = p;
  }
  /* The owner's picked figures (2026-10-21). */
  assert.strictEqual(CHEST_LOGO_LADDER[4], '14.75');
  assert.strictEqual(CHEST_LOGO_LADDER[99], '7.25');
  assert.strictEqual(CHEST_LOGO_LADDER[7000], '2.50');
});

test('the save route checks the contract against the customer and the price lock', () => {
  assert.match(src, /contractAllowed\(contractKey, email\)/);
  assert.match(src, /contractChanged/);
});

test('an older line (no print places) under a contract says so, not silent list', () => {
  const r = priceLine({ product: TEE, qty: 24, method: DTF, stage: 'both', addons: [OWN], blankTiers: [],
    contract: contractTerms('ink-theory:0') });
  assert.strictEqual(r.contract, false);
  assert.match(r.contractMiss, /older line/);
});

test('code review fixes stay in (2026-10-21)', () => {
  /* The customer's estimate pools a run like the save route, so a run of
     3 x 10 keeps its contract price when the customer edits a quantity. */
  assert.match(src, /bandQty: L\.runGroup \? runQty\[L\.runGroup\] : 0/);
  assert.match(src, /runGroup: it\.run_group \? String\(it\.run_group\) : null/);
  /* The helper approval measure takes a contract line at its contract price. */
  assert.match(src, /if \(priced\.contract\) catalogueSum \+= priced\.lineTotal;/);
  /* "full front" only on lines saved since the choice existed. */
  assert.match(src, /named_front: true/);
});

test('a single print pays the contract price for its size; a chest logo alone its lower list (owner, 2026-10-21)', () => {
  const c = contractTerms('ink-theory:0');
  const full = line([['front', DTF]], 24, { contract: c });
  assert.strictEqual(full.contract, true);
  assert.strictEqual(full.unit, 12);
  const big = line([['front', OVER]], 60, { contract: c });
  assert.strictEqual(big.unit, 13);
  const chest = line([['front', CHEST]], 40, { contract: c });
  assert.strictEqual(chest.contract, false);
  assert.match(chest.contractMiss, /chest logo alone/);
  assert.strictEqual(chest.lineTotal, Math.round((7.45 + 1.50) * 40 * 100) / 100);
  /* At 24 the chest list ($9.60 + $1.50) is still under $12. */
  const chest24 = line([['front', CHEST]], 24, { contract: c });
  assert.strictEqual(chest24.lineTotal, Math.round((9.60 + 1.50) * 24 * 100) / 100);
});
