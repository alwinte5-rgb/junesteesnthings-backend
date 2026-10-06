'use strict';

/* What a screen-print job costs to MAKE: Anchorfish vs pressing in-house with
 * Transfer Express Goof Proof Premium (2026-10-06). Pinned to the owner's real
 * Anchorfish paperwork so the comparison the quote form shows cannot drift from
 * what the shop is actually billed.
 *
 * Run: node --test tests/production-cost.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const PC = require('../tools/lib/production-cost');

const job = (qty, dark, places) => PC.productionCompare({ qty, dark, places }, PC.DATA);
const LCFB = [{ loc: 'front', kind: 'screen', colours: 1 }, { loc: 'back', kind: 'screen', colours: 1 }];

test('Anchorfish matches its own paperwork: the base is a colour on dark shirts', () => {
  /* #18249: 100 black, white left chest + full back: $4.12 x 100 + 4 x $20 */
  assert.strictEqual(job(100, true, LCFB).anchorfish, 492);
  /* #16899: 62 of the same: $4.50 x 62 + $80 */
  assert.strictEqual(job(62, true, LCFB).anchorfish, 359);
  /* Under 50 they bill 50. */
  assert.strictEqual(job(30, false, [{ loc: 'front', kind: 'screen', colours: 1 }]).anchorfish, 1.80 * 50 + 20);
});

test('Premium in-house, as a range from left-chest to full front', () => {
  const r = job(100, true, LCFB);
  /* Back: 100 large single images at $1.69. Left chest: 12 gang sheets at
     $8.27 (cheaper than 9 at $15.31). Plus $15 shipping. */
  assert.strictEqual(r.premiumLow, Math.round((169 + 12 * 8.27 + 15) * 100) / 100);
  /* Full front: another 100 large single images. */
  assert.strictEqual(r.premiumHigh, 169 + 169 + 15);
  assert.ok(r.premiumLow < r.anchorfish && r.premiumHigh < r.anchorfish, 'in-house wins this job');
});

test('buying up to a cheaper tier is taken when it costs less', () => {
  /* 40 one-colour full prints: 40 x $3.75 = $150, or 50 x $1.89 = $94.50. */
  const r = job(40, false, [{ loc: 'back', kind: 'screen', colours: 1 }]);
  assert.strictEqual(r.premiumHigh, Math.round((94.5 + 15) * 100) / 100);
});

test('large multi-colour prints are cheaper at Anchorfish; over 4 colours Premium cannot do it', () => {
  const r = job(100, false, [{ loc: 'front', kind: 'screen', colours: 3 }]);
  assert.ok(r.premiumHigh > r.anchorfish, 'a 3-colour full front is an Anchorfish job');
  const five = job(100, false, [{ loc: 'front', kind: 'screen', colours: 5 }]);
  assert.strictEqual(five.premiumLow, null);
  assert.ok(five.anchorfish > 0);
});

test('the quote form ships this exact function and data', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /var PROD_DATA = \$\{JSON\.stringify\(PRODCOST\.DATA\)\};/);
  assert.match(src, /\$\{PRODCOST\.productionCompare\.toString\(\)\}/);
  /* Self-contained, so its source runs in the browser. */
  const fn = new Function('return ' + PC.productionCompare.toString())();
  assert.deepStrictEqual(fn({ qty: 100, dark: true, places: LCFB }, JSON.parse(JSON.stringify(PC.DATA))),
    job(100, true, LCFB));
});
