'use strict';

/* Three scopes, and each charge belongs to exactly one.
 *
 *   (default)     per LINE   — real work on these garments
 *   runShared     per RUN    — one press setup, one drawing
 *   orderShared   per ORDER  — freight, charged once by Signs365
 *
 * They were all per line. A run of three garment colours paid for three sets
 * of screens and three design setups; a quote with a 12in cutout line and a
 * 24in one paid freight twice. Declared on the ADDONS table so the rule is
 * stated once — a branch per add-on inside priceLine is how the digitizing
 * bug happened.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const TABLE = src.slice(src.indexOf('const ADDONS = ['), src.indexOf('\n];', src.indexOf('const ADDONS = [')));
const flagged = (flag) =>
  [...TABLE.matchAll(new RegExp("code: '([a-z_]+)'[\\s\\S]{0,300}?" + flag + ": true", 'g'))]
    .map((m) => m[1]).sort();

test('freight is charged once for the order', () => {
  /* The ordinary weekday $10 is NOT here: it lives inside the cutout price
     now (costEach in tools/lib/cutouts.js). It is June's inbound delivery
     from Signs365, and a line called "shipping" on a customer's quote says we
     are posting the goods to them. What remains are the two exceptions, which
     someone picks deliberately for one job. */
  assert.deepStrictEqual(flagged('orderShared'),
    ['cutout_ship', 'cutout_ship_large', 'cutout_ship_sat'],
    'the set of order-level charges changed — confirm it is deliberate');
});

test('the three scopes do not overlap', () => {
  const run = flagged('runShared'), order = flagged('orderShared');
  const both = run.filter((c) => order.includes(c));
  assert.deepStrictEqual(both, [], 'a charge cannot be both run-level and order-level: ' + both);
});

test('nothing priced per piece is pooled at any scope', () => {
  /* Pooling per-piece work hands back labour that was really done on every
     garment. Unbagging is the case: 120 shirts is 120 bags. */
  for (const flag of ['runShared', 'orderShared']) {
    for (const m of TABLE.matchAll(
      new RegExp("kind: '(per_piece|per_piece_per_colour|per_screen)'[\\s\\S]{0,240}?" + flag + ': true', 'g'))) {
      if (m[1] === 'per_screen' && flag === 'runShared') continue;  // screens are the one pooled count
      assert.fail('a ' + m[1] + ' charge is ' + flag + ': ' + m[0].slice(0, 70));
    }
  }
});

test('both engines de-duplicate order-level charges, by code', () => {
  /* By CODE on purpose: a weekday shipment and a Saturday one are two real
     shipments and both bill. Two of the SAME tier is the case June adds
     deliberately. */
  assert.match(src, /orderSharedSeen\[a\.code\]/, 'the browser does not de-duplicate order charges');
  assert.match(src, /orderSharedSeen\.has\(a\.code\)/, 'the save path does not de-duplicate order charges');
  assert.match(src, /orderSharedSeen\.add\(a\.code\)/);
});

test('the de-duplication happens after every add-on is on the line', () => {
  /* Filtering before the pushes would drop nothing and the bug would survive
     looking fixed. */
  const declared = src.indexOf('const lineAddons = [];');
  const filtered = src.indexOf('if (orderSharedSeen.has(a.code)) lineAddons.splice(k, 1);');
  const priced = src.indexOf('const priced = priceLine({');
  assert.ok(declared > -1 && filtered > declared, 'the server filter runs before lineAddons exists');
  assert.ok(priced > filtered, 'the server filter runs after the line is priced, which is too late');
});

test('the browser is told which charges are order-level', () => {
  const proj = src.slice(src.indexOf('var ADDONS = ${JSON.stringify(ADDONS.map('), src.indexOf('})))};'));
  assert.match(proj, /orderShared/, 'orderShared never reaches the browser');
  assert.match(proj, /runShared/, 'runShared never reaches the browser');
});
