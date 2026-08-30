/* Regression tests for the whole-job discount on a quote (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * What these guard, and why each one is worth a test:
 *
 * 1. The discount comes off BEFORE tax. Illinois tax is owed on what the
 *    customer is actually charged. Taxing the undiscounted subtotal would have
 *    the shop remitting tax on money it never collected — a real loss, on
 *    every discounted job, that nothing on the page would show.
 *
 * 2. The discount can never exceed the job. The deposit and the Stripe charge
 *    are both derived from the total, so a fat-fingered "500" on a $400 job
 *    would otherwise produce a NEGATIVE amount to collect rather than a free
 *    one. Percent is capped at 100 for the same reason.
 *
 * 3. What was entered is stored, not just the resulting dollars, so editing
 *    the lines re-applies "10% off" instead of freezing yesterday's figure.
 *    That is a schema decision, but the arithmetic below is what makes it
 *    safe: quoteTotals() re-derives the discount from the CURRENT subtotal.
 *
 * These lift the real functions out of server.js rather than restating them,
 * so the tests cannot quietly drift from the code they guard. server.js boots
 * a listener and a DB pool on require, which is why it is not imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/** Lift a top-level `function name(...) {...}` out of server.js by brace depth. */
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

/* quoteTotals leans on round2, depositFor and quoteDiscount, and depositFor
   leans on two env-tunable constants. Rebuild that little world rather than
   restating any of it, so a change to the deposit rule is reflected here. */
const DEPOSIT_PC = Number(process.env.JT_DEPOSIT_PCT || 0.5);
const DEPOSIT_FULL_UNDER = Number(process.env.JT_DEPOSIT_FULL_UNDER || 100);
const { quoteDiscount, quoteTotals } = vm.runInThisContext(`(function(){
  const DEPOSIT_PC = ${DEPOSIT_PC}, DEPOSIT_FULL_UNDER = ${DEPOSIT_FULL_UNDER};
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  ${lift('depositFor')}
  ${lift('quoteDiscount')}
  ${lift('quoteTotals')}
  return { quoteDiscount, quoteTotals };
})()`);

const lines = (...amounts) => ({ items: amounts.map((line_total) => ({ line_total })) });

/* ── quoteDiscount: the clamps ──────────────────────────────────────────── */

test('a flat discount is taken at face value', () => {
  assert.strictEqual(quoteDiscount(400, 'amt', 25), 25);
});

test('a percentage discount is a percentage of the subtotal', () => {
  assert.strictEqual(quoteDiscount(400, 'pct', 10), 40);
});

test('a discount larger than the job is capped at the job', () => {
  /* The fat-finger case. Uncapped this returns 500, the total goes to -100,
     and the deposit route would try to collect a negative amount. */
  assert.strictEqual(quoteDiscount(400, 'amt', 500), 400);
});

test('a percentage over 100 is capped at 100', () => {
  assert.strictEqual(quoteDiscount(400, 'pct', 150), 400);
});

test('a negative or unparseable discount is no discount', () => {
  for (const bad of [-50, NaN, undefined, null, '', 'free']) {
    assert.strictEqual(quoteDiscount(400, 'amt', bad), 0, `${String(bad)} must not discount`);
  }
});

test('a discount on an empty quote is zero, not a credit', () => {
  assert.strictEqual(quoteDiscount(0, 'pct', 10), 0);
  assert.strictEqual(quoteDiscount(0, 'amt', 10), 0);
});

/* ── quoteTotals: the order of operations ───────────────────────────────── */

test('the discount comes off before tax', () => {
  /* $400 of work, 10% off, tax stored on the DISCOUNTED $360 (10.25% = 36.90).
     Tax must not be charged on the $40 that was given away. */
  const t = quoteTotals({ ...lines(400), discount_kind: 'pct', discount_value: 10, tax: 36.9 });
  assert.strictEqual(t.subtotal, 400);
  assert.strictEqual(t.discount, 40);
  assert.strictEqual(t.net, 360);
  assert.strictEqual(t.total, 396.9);
});

test('the discount is re-derived from the current lines, not frozen', () => {
  /* Same "10% off", a bigger job: the discount must grow with it. This is why
     the entered value is stored rather than only the resulting dollars. */
  const small = quoteTotals({ ...lines(400), discount_kind: 'pct', discount_value: 10, tax: 0 });
  const big = quoteTotals({ ...lines(400, 600), discount_kind: 'pct', discount_value: 10, tax: 0 });
  assert.strictEqual(small.discount, 40);
  assert.strictEqual(big.discount, 100);
});

test('no discount leaves the totals exactly as they were', () => {
  const t = quoteTotals({ ...lines(250, 150), tax: 41 });
  assert.strictEqual(t.subtotal, 400);
  assert.strictEqual(t.discount, 0);
  assert.strictEqual(t.net, 400);
  assert.strictEqual(t.total, 441);
});

test('the deposit follows the discounted total, never the original', () => {
  /* Half of the discounted total. Charging half of the UNDISCOUNTED job would
     collect more than the customer agreed to, on the deposit they pay first. */
  const t = quoteTotals({ ...lines(1000), discount_kind: 'pct', discount_value: 20, tax: 0 });
  assert.strictEqual(t.total, 800);
  assert.strictEqual(t.deposit, 400);
});

test('a full discount leaves nothing to collect and no negative deposit', () => {
  const t = quoteTotals({ ...lines(400), discount_kind: 'amt', discount_value: 400, tax: 0 });
  assert.strictEqual(t.total, 0);
  assert.strictEqual(t.deposit, 0);
});

test('an over-large discount can never invert the total', () => {
  /* The end-to-end version of the fat-finger: $500 off a $400 job. */
  const t = quoteTotals({ ...lines(400), discount_kind: 'amt', discount_value: 500, tax: 0 });
  assert.ok(t.total >= 0, `total went negative: ${t.total}`);
  assert.ok(t.deposit >= 0, `deposit went negative: ${t.deposit}`);
  assert.strictEqual(t.total, 0);
});

test('money stays to the cent through a percentage', () => {
  /* 33.33% of 149.99 is 49.9916... — it must not reach a card as $49.9916. */
  const t = quoteTotals({ ...lines(149.99), discount_kind: 'pct', discount_value: 33.33, tax: 0 });
  assert.strictEqual(t.discount, 49.99);
  assert.strictEqual(t.net, 100);
  assert.ok(Math.abs(t.total * 100 - Math.round(t.total * 100)) < 1e-9);
});
