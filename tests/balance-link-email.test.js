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
  // Past the parameter list first: a default like `{ heading = true } = {}` has braces too.
  let p = src.indexOf('(', start);
  for (let d = 0; p < src.length; p++) {
    if (src[p] === '(') d++;
    else if (src[p] === ')' && --d === 0) break;
  }
  const open = src.indexOf('{', p);
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

/* ── a refunded studio order on the job board ─────────────────────────────
   The studio webhook ignored refunds until 2026-09-26, so a refunded order
   read as paid on this board and could go to press. The feed now carries
   `refunded` alongside `paid` (what was received). */

const board = vm.runInThisContext(`(() => {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const money = (n) => '$' + Number(n || 0).toFixed(2);
  const STUDIO_BASE = 'https://design.jtees.net';
  ${extractFn('function escEmail(')}
  ${extractFn('function studioStage(')}
  ${extractFn('function studioOrdersSection(')}
  return studioOrdersSection;
})()`);

const order = (o) => ({ id: 7, status: 'processing', total: 120, paid: 120, name: 'Ada', email: 'a@b.com', ...o });

test('a fully refunded studio order says do not produce, and shows nothing due', () => {
  const html = board({ orders: [order({ refunded: 120 })], error: null }, { heading: false });
  assert.match(html, /Refunded \$120\.00 &mdash; don&rsquo;t produce/);
  assert.doesNotMatch(html, /due<\/span>/, 'a refund is not money the customer owes');
});

test('a partial refund is shown, and nothing becomes due', () => {
  const html = board({ orders: [order({ refunded: 20 })], error: null }, { heading: false });
  assert.match(html, /\$20\.00 refunded/);
  assert.doesNotMatch(html, /don&rsquo;t produce/);
  assert.doesNotMatch(html, /due<\/span>/);
});

test('an order with no refunds (or an older feed without the field) is unchanged', () => {
  const html = board({ orders: [order({ paid: 60 })], error: null }, { heading: false });
  assert.match(html, /\$60\.00 due/);
  assert.doesNotMatch(html, /refunded|Refunded/);
});

test('customer lifetime spend is net of studio refunds', () => {
  assert.match(src, /cur\.spent \+= Number\(o\.paid \|\| 0\) - Number\(o\.refunded \|\| 0\)/);
  assert.match(src, /spent: Number\(o\.paid \|\| 0\) - Number\(o\.refunded \|\| 0\)/);
});
