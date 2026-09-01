'use strict';

/* Money over the total has to be visible.
 *
 * balanceOf() clamps at zero, which is right for the customer — nobody should
 * be shown a negative amount due — and wrong for the shop. A quote paid twice
 * read exactly like a quote paid once: balance 0, nothing said, the extra money
 * sitting in the account belonging to someone else.
 *
 * It has to be refunded or deliberately applied to another job, and neither can
 * happen while the only evidence is a ledger nobody opens. Issue #8.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found`);
  let d = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}' && --d === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

const { overpaidBy, balanceOf } = vm.runInThisContext(`(() => {
  ${src.match(/^const round2 = .*?;$/m)[0]}
  ${lift('overpaidBy')}
  ${lift('balanceOf')}
  return { overpaidBy, balanceOf };
})()`);

test('a quote paid twice reports the excess', () => {
  const q = { total: 500, paid_amount: 1000, written_off: 0 };
  assert.strictEqual(overpaidBy(q), 500);
  assert.strictEqual(balanceOf(q), 0, 'the customer is still shown nothing owing');
});

test('square is not overpaid, and neither is still-owing', () => {
  assert.strictEqual(overpaidBy({ total: 500, paid_amount: 500 }), 0);
  assert.strictEqual(overpaidBy({ total: 500, paid_amount: 250 }), 0);
  assert.strictEqual(overpaidBy({ total: 500, paid_amount: 0 }), 0);
});

test('a write-off counts toward the total, not against the customer', () => {
  /* Writing off the remainder settles a quote; it must not then read as an
     overpayment. But a write-off ON TOP of full payment is money to return. */
  assert.strictEqual(overpaidBy({ total: 500, paid_amount: 400, written_off: 100 }), 0);
  assert.strictEqual(overpaidBy({ total: 500, paid_amount: 500, written_off: 100 }), 100);
});

test('cents are respected — this is a refund figure', () => {
  assert.strictEqual(overpaidBy({ total: 632.84, paid_amount: 1265.67 }), 632.83);
});

test('missing figures never invent an overpayment', () => {
  for (const q of [{}, { total: null, paid_amount: null }, { total: 0, paid_amount: 0 },
                   { total: 'x', paid_amount: 'y' }]) {
    assert.strictEqual(overpaidBy(q), 0, JSON.stringify(q));
  }
});

test('an explicit total wins over the stored one', () => {
  /* quoteTotals() recomputes from the items, so a quote edited after payment
     must be judged against the live figure, not the stale column. */
  assert.strictEqual(overpaidBy({ total: 900, paid_amount: 500 }, 400), 100);
});

/* ── it has to actually reach someone ────────────────────────────────────── */

test('banking a payment that overpays alerts the shop', () => {
  const rp = src.slice(src.indexOf('async function recordPayment'));
  const body = rp.slice(0, rp.indexOf('\n}\n'));
  assert.match(body, /overpaidBy\(/, 'the check runs when money lands');
  assert.match(body, /Overpaid by/, 'and says so in words');
  assert.match(body, /alertShop\(/);
});

test('only money going IN raises it', () => {
  /* A refund bringing the balance back to zero is the resolution, not a new
     alert. */
  const rp = src.slice(src.indexOf('async function recordPayment'));
  assert.match(rp.slice(0, rp.indexOf('\n}\n')), /if \(round2\(amount\) > 0\) \{/);
});

test('the check can never fail a payment that already banked', () => {
  const rp = src.slice(src.indexOf('async function recordPayment'));
  const body = rp.slice(0, rp.indexOf('\n}\n'));
  const check = body.slice(body.indexOf('if (round2(amount) > 0)'));
  assert.match(check, /catch \(err\)/, 'wrapped');
  assert.match(check, /console\.error\('overpayment check failed/);
});

test('the export carries it beside the balance', () => {
  /* The file the shop reconciles from. Without the column a double payment is
     invisible there too. */
  assert.match(src, /'paid','written_off','balance',/);
  assert.match(src, /'overpaid',/);
  assert.match(src, /overpaidBy\(q, t\.total\)/);
});
