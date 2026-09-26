'use strict';

/* The studio's balance-due email is sent from here, not by the designer
 * (server.js /api/balance-link-email).
 *
 * Run: node --test tests/*.test.js
 *
 * It was the one studio email the designer sent straight to Brevo, with its
 * own copy of the Brevo key. With Brevo's IP lock off (owner, 2026-09-26) the
 * key is protected by living in as few places as possible — so the designer
 * gives it up, and this endpoint takes the email over. It sends a "pay here"
 * link to a customer, so the link must be a Stripe payment link: the internal
 * key alone must not be enough to point a customer anywhere else.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

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

const balanceEmailInput = vm.runInThisContext(`(() => {
  ${extractFn('function isValidEmail(')}
  ${extractFn('function balanceEmailInput(')}
  return balanceEmailInput;
})()`);

const OK = { email: 'ada@example.com', name: 'Ada Lovelace', order_id: 1042, balance: 187.5,
             link: 'https://buy.stripe.com/test_8wM5kE' };

test('a Stripe payment link to a real address is sent', () => {
  const v = balanceEmailInput(OK);
  assert.strictEqual(v.error, undefined);
  assert.strictEqual(v.email, 'ada@example.com');
  assert.strictEqual(v.orderId, 1042);
  assert.strictEqual(v.balance, 187.5);
  assert.strictEqual(v.link, 'https://buy.stripe.com/test_8wM5kE');
});

test('a link anywhere but Stripe is refused', () => {
  for (const link of ['https://evil.example/pay', 'http://buy.stripe.com/x', 'https://buy.stripe.com.evil.example/x',
                      'javascript:alert(1)', '', 'not a url']) {
    assert.strictEqual(balanceEmailInput({ ...OK, link }).error, 'bad link', link);
  }
});

test('no balance, no order, or no address: nothing is sent', () => {
  assert.strictEqual(balanceEmailInput({ ...OK, balance: 0 }).error, 'bad balance');
  assert.strictEqual(balanceEmailInput({ ...OK, balance: 'abc' }).error, 'bad balance');
  assert.strictEqual(balanceEmailInput({ ...OK, order_id: 'x' }).error, 'bad order');
  assert.strictEqual(balanceEmailInput({ ...OK, order_id: -3 }).error, 'bad order');
  assert.strictEqual(balanceEmailInput({ ...OK, email: 'nope' }).error, 'bad email');
});

test('the endpoint needs the internal key, and reports a failed send', () => {
  assert.match(src, /app\.post\('\/api\/balance-link-email', requireInternalKey,/);
  const at = src.indexOf("app.post('/api/balance-link-email'");
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /sendEmail\(/, 'through the shared sender, so it gets the Resend fallback');
  assert.match(route, /reportError\('studio:balance-email'/);
  assert.match(route, /escEmail\(v\.link\)/, 'the link is escaped into the HTML');
});
