/* Regression tests for payments Stripe took that the quote ledger did not claim,
 * and for the receipt Stripe sends (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * What these exist to prevent:
 *
 * `bankStripeSession` requires client_reference_id to match QUOTE_CODE_RE
 * (six characters) and returns `{ok:false, reason:'no quote code'}` otherwise.
 * The design studio on design.jtees.net sends the ORDER NUMBER as
 * client_reference_id — "10" — so its payments failed that test and the whole
 * event ended as one console.log nobody reads. A real $35.75 order payment on
 * 2026-08-11 was therefore visible only by opening the Stripe dashboard.
 *
 * Not banking an order against a quote is correct; an order has its own
 * ledger. Staying silent about the money is the bug, and it is the same shape
 * as the 08-16 outage: the code decided nothing was wrong and said nothing.
 *
 * The receipt half: of the first seven live charges, zero had a receipt
 * emailed (`receipt_number` was null on every one) because the Dashboard's
 * "Successful payments" toggle was off. Setting receipt_email makes Stripe
 * send one in live mode regardless of that toggle, so customers stop having to
 * ask.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

function extractFn(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated function reading \`${anchor}\``);
}

/* ── the quote-code test that drops order payments ────────────────────────── */

const QUOTE_CODE_RE = (() => {
  const m = /const QUOTE_CODE_RE = (\/.*\/);/.exec(src);
  assert.ok(m, 'QUOTE_CODE_RE not found');
  const sandbox = {};
  vm.createContext(sandbox);
  return vm.runInContext(`(${m[1]})`, sandbox);
})();

test('a design-studio order number is NOT a quote code', () => {
  assert.strictEqual(QUOTE_CODE_RE.test('10'), false,
    'if this ever passes, order payments would be banked against a quote that does not exist');
  assert.strictEqual(QUOTE_CODE_RE.test('7'), false);
});

test('a real quote code still passes', () => {
  for (const code of ['731EAC', 'A7BFAD', 'AE6162']) {
    assert.strictEqual(QUOTE_CODE_RE.test(code), true, `${code} must remain a valid quote code`);
  }
});

/* ── the alert that closes the silence ───────────────────────────────────── */

const ALERT_SRC = extractFn('async function alertUnbankedPayment(');

test('an unbanked payment raises an alert instead of only a log line', () => {
  assert.match(src, /if \(!out\.ok && !out\.duplicate\) \{[\s\S]{0,900}?alertUnbankedPayment\(obj, out\.reason\)/,
    'the checkout.session.completed branch must alert when the payment did not bank');
});

/* The alert closed the silence. It did not close the hole: an email is not a
   record, so the money still reached no table, no export and no tax position —
   and sales tax is filed on receipts, so a return built from this data was
   understated by however much the studio took. */
test('an unbanked payment is RECORDED, not just announced', () => {
  assert.match(src, /if \(!out\.ok && !out\.duplicate\) \{[\s\S]{0,900}?await recordUnlinkedPayment\(obj, out\.reason\)/,
    'money that arrived must land in a table, not only in an inbox');
});

test('it is recorded before it is alerted', () => {
  const branch = /if \(!out\.ok && !out\.duplicate\) \{([\s\S]{0,900}?)\n        \}/.exec(src);
  assert.ok(branch, 'the unbanked branch should still be a block');
  const record = branch[1].indexOf('recordUnlinkedPayment');
  const alert  = branch[1].indexOf('alertUnbankedPayment');
  assert.ok(record !== -1 && alert !== -1, 'both the record and the alert must be present');
  assert.ok(record < alert,
    'record first: a swallowed alert costs a notification, a lost write costs a tax return');
});

test('the alert names the amount and the reference it arrived under', () => {
  assert.match(ALERT_SRC, /amount_total/);
  assert.match(ALERT_SRC, /client_reference_id/,
    'the reference is how the shop finds the order this money belongs to');
});

test('the alert carries the Stripe receipt URL', () => {
  assert.match(ALERT_SRC, /receipt_url/,
    'a customer asking for a receipt should be answerable from the alert, not the dashboard');
});

test('a duplicate delivery does not re-alert', () => {
  assert.match(src, /!out\.duplicate/,
    'Stripe retries webhooks; the redirect also races them — neither may double-notify');
});

test('the alert can never fail the webhook', () => {
  assert.match(ALERT_SRC, /catch \(e\) \{[\s\S]*console\.error\('unbanked payment alert failed/,
    'a throwing alert would make Stripe retry a payment that already settled');
});

/* ── the receipt ─────────────────────────────────────────────────────────── */

test('checkout sets receipt_email so Stripe sends its own receipt', () => {
  assert.match(src, /payment_intent_data\[receipt_email\]/,
    'without this, receipts depend entirely on a Dashboard toggle that was off for the first 7 live charges');
});

test('the receipt address is only set when one is actually known', () => {
  assert.match(src, /if \(q\.email\) form\.set\('payment_intent_data\[receipt_email\]', q\.email\);/,
    'sending an empty receipt_email would error the session and take card payment down');
});

/* Balance payments arrive through a Stripe Payment Link, which carries no
   client_reference_id at all — metadata.order_id is the only identifier on
   them. An alert that reads only client_reference_id would say "no reference"
   for precisely the payments hardest to place by hand. */
test('the alert identifies a design-studio order from metadata', () => {
  assert.match(ALERT_SRC, /session\.metadata\?\.order_id/,
    'metadata.order_id is the only identifier on a Payment Link balance payment');
});

test('the subject line names the order when there is one', () => {
  assert.match(ALERT_SRC, /order #\$\{orderId\}/,
    'the shop should be able to place the payment from the subject line alone');
});

test('it still falls back to client_reference_id, then to saying so plainly', () => {
  assert.match(ALERT_SRC, /ref\s*\?/);
  assert.match(ALERT_SRC, /'no reference'/,
    'an unidentifiable payment must still be announced, not dropped');
});
