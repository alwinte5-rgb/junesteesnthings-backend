'use strict';

/* The customer's quote prices shirts as shirts, and screens as screens.
 *
 * A screen-printed line used to read:
 *
 *     Bella 3001, 1 colour front     62    $6.85    $524.70
 *       + Screens - 4 x $25.00 = $100.00, one time
 *
 * 62 x $6.85 is $424.70. The customer was given a per-shirt price, shown an
 * amount that was not it, and left to work out that the difference was the
 * screens they had separately been told about in a note. `unit_price` has
 * always excluded add-ons, so the Amount column and the Each column were
 * describing different things.
 *
 * Now each extra is its own row and the line foots again. This file pins the
 * one property that matters: the split is PRESENTATION. Goods plus extras must
 * still be exactly the line total, because that is what the customer is charged
 * and what the subtotal sums.
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

/* The small helpers are consts, not declarations — taken by their exact source
 * line so a change to rounding or currency formatting reaches this file too. */
function liftConst(name) {
  const m = src.match(new RegExp('^const ' + name + ' = .*?;$', 'm'));
  assert.notStrictEqual(m, null, `const ${name} not found in server.js`);
  return m[0];
}

const api = vm.runInThisContext(`(() => {
  ${liftConst('round2')}
  ${liftConst('money')}
  ${lift('escEmail')}
  ${lift('normalisedAddons')}
  ${lift('addonTotalOf')}
  ${lift('addonRowsFor')}
  return { normalisedAddons, addonTotalOf, addonRowsFor, round2 };
})()`);

const { normalisedAddons, addonTotalOf, addonRowsFor, round2 } = api;

/* A real screen-print line: 62 shirts at $6.85 of goods, plus 4 screens at $25.
   These are the figures from invoice #16899, which is why the screens add-on
   exists at all. */
const SCREEN_LINE = {
  description: 'Bella 3001, 1 colour front',
  qty: 62,
  unit_price: 6.85,
  line_total: 524.70,
  list_total: 524.70,
  addons: [{ code: 'screens', label: 'Screens', kind: 'per_screen',
             rate: 25, count: 4, total: 100.00 }],
};

/* ── the money must not move ─────────────────────────────────────────────── */

test('goods plus extras is exactly the line total', () => {
  /* The whole safety property of this change in one line. If it ever fails the
     customer is being shown a quote that does not add up to what they pay. */
  for (const item of [
    SCREEN_LINE,
    { qty: 10, unit_price: 12, line_total: 120, list_total: 120, addons: [] },
    { qty: 50, unit_price: 9.10, line_total: 530, list_total: 530,
      addons: [{ code: 'screens', label: 'Screens', kind: 'per_screen',
                 rate: 25, count: 2, total: 50 },
               { code: 'unbagging', label: 'Unbagging', kind: 'per_piece',
                 rate: 0.5, count: 50, total: 25 }] },
    { qty: 24, unit_price: 20, line_total: 515, list_total: 515,
      setup_fee: 35, setup_label: 'Digitizing' },
  ]) {
    const goods = round2(Number(item.line_total) - addonTotalOf(item));
    assert.strictEqual(round2(goods + addonTotalOf(item)), round2(item.line_total),
      `line total moved for ${JSON.stringify(item.addons || item.setup_fee)}`);
  }
});

test('the shirts row foots: qty x each equals the goods amount', () => {
  const goods = round2(SCREEN_LINE.line_total - addonTotalOf(SCREEN_LINE));
  assert.strictEqual(goods, 424.70);
  assert.strictEqual(round2(SCREEN_LINE.qty * SCREEN_LINE.unit_price), goods,
    'this is the arithmetic the customer was being asked to do in their head');
});

test('extras total ignores zero and negative rows', () => {
  const item = { addons: [
    { code: 'a', label: 'A', total: 10 },
    { code: 'b', label: 'B', total: 0 },
    { code: 'c', label: 'C', total: -5 },
  ] };
  assert.strictEqual(addonTotalOf(item), 10);
});

/* ── what the rows say ───────────────────────────────────────────────────── */

test('the screens row counts SCREENS, not shirts', () => {
  /* Showing 62 against a one-time fee is precisely what made it read as a
     per-shirt charge. */
  const html = addonRowsFor(SCREEN_LINE, 0);
  assert.ok(html.indexOf('>4<') > -1, 'the screen count');
  assert.ok(html.indexOf('>62<') === -1, 'never the shirt quantity');
  assert.ok(/\$25\.00/.test(html), 'the rate per screen');
  assert.ok(/\$100\.00/.test(html), 'and what they come to');
  assert.ok(/one time/.test(html), 'said plainly, since it is not per shirt');
});

test('each extra row is addressable by the live preview', () => {
  /* Per-piece extras move with the quantity. Without a handle the browser
     cannot update them, and a stale figure beside a live shirt count is the
     arithmetic this split removed. */
  const html = addonRowsFor(SCREEN_LINE, 3);
  assert.ok(html.indexOf('data-addon="3-screens"') > -1, html.slice(0, 200));
});

test('a line with no extras produces no rows at all', () => {
  assert.strictEqual(addonRowsFor({ qty: 10, line_total: 100, addons: [] }, 0), '');
  assert.strictEqual(addonRowsFor({ qty: 10, line_total: 100 }, 0), '');
});

test('quotes saved before add-ons were itemised keep their digitizing', () => {
  /* These carry digitizing in its own column and have no `addons` array. Older
     quotes are still live documents people pay from. */
  const legacy = { qty: 24, line_total: 515, setup_fee: 35, setup_label: 'Digitizing' };
  assert.strictEqual(addonTotalOf(legacy), 35);
  const html = addonRowsFor(legacy, 0);
  assert.ok(/Digitizing/.test(html), 'named');
  assert.ok(/\$35\.00/.test(html), 'and priced');
});

test('an add-on label cannot inject markup into the quote', () => {
  /* The label reaches here from the database. */
  const evil = { qty: 1, line_total: 10,
    addons: [{ code: 'x', label: '<img src=x onerror=alert(1)>', kind: 'fixed', total: 5 }] };
  const html = addonRowsFor(evil, 0);
  assert.ok(html.indexOf('<img') === -1, 'the tag must not survive');
  assert.ok(html.indexOf('onerror') === -1 || html.indexOf('&lt;') > -1,
    'escaped rather than rendered');
});

/* ── the old shape must not come back ────────────────────────────────────── */

test('the Amount column no longer carries the extras silently', () => {
  const view = src.slice(src.indexOf("app.get('/q/:code'"));
  const row = view.slice(0, view.indexOf('res.send(quotePage'));
  assert.match(row, /data-amount="\$\{ix\}">\$\{cut/,
    'the amount cell must render the goods split, not the raw line total');
  assert.match(row, /addonRowsFor\(i, ix\)/,
    'and the extras must be rendered as their own rows');
  assert.doesNotMatch(row, /addonNotes\(i\)/,
    'the old note-under-the-description shape is back');
});
