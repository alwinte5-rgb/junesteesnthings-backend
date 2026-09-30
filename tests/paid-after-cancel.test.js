'use strict';

/* Money on a cancelled quote, and the card pages that let it arrive.
 *
 * A Stripe Checkout page stays payable for 24 hours after it is made, whatever
 * happens to the quote meanwhile. Two things followed from that:
 *
 *   1. A quote cancelled while its card page was still open in the customer's
 *      tab could be paid, and bankStripeSession() treated that payment like any
 *      other: it set the quote back to "accepted", emailed and texted the
 *      customer "You're on the schedule", queued a review ask and sent the
 *      paid event to Brevo. The shop's email read like an ordinary deposit, so
 *      the only sign the job was dead was in a column nobody was looking at.
 *   2. Pressing Pay again made a new page and left the old one open, so a
 *      customer with two tabs could pay the same money twice.
 *
 * Now the payment is banked (it is real money) but the job stays cancelled,
 * nothing that follows a live sale happens, and the shop is told to refund it
 * or restore the quote. And a quote only ever has one card page open: the
 * last one is closed before a new one is made, and when the quote is
 * cancelled. A payment taken in Stripe that names a cancelled quote already
 * worked this way (bookChargeNow); checkout was the path that did not.
 *
 * Closing a page on purpose has two consequences of its own. Stripe reports
 * the closed page as expired, and an expired page is what the shop's
 * "Checkout abandoned — worth a follow-up" email is for, so that email must
 * stay quiet for a page replaced by a newer one or closed by cancelling. And
 * the paid-after-cancelling alert tells the shop to press Restore if the job
 * is back on, so Restore has to bring a paid quote back as accepted.
 *
 * Nothing here has a Postgres, a Stripe or an inbox, so all three answer in
 * memory.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in server.js`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function line(re, what) {
  const m = re.exec(src);
  assert.ok(m, `${what} not found in server.js`);
  return m[0];
}
const ROUND2 = line(/^const round2 = .*;$/m, 'round2');
const MONEY = line(/^const money = .*;$/m, 'money');
const CODE_RE = line(/^const QUOTE_CODE_RE = .*;/m, 'QUOTE_CODE_RE');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ── A quote, its ledger, and everyone who could be told ────────────────── */

function desk(quote) {
  const Q = { status: 'sent', paid_amount: 0, written_off: 0, cancelled_at: null, cancel_reason: null, ...quote };
  const out = { quote: Q, ledger: [], queries: [], alerts: [], shopMail: [], customerMail: [],
                texts: [], reviews: [], contacts: [], crmNotes: [] };
  const pool = {
    query(sql, args = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      out.queries.push(s);
      if (/^SELECT \* FROM quotes WHERE code=\$1$/.test(s)) {
        return Promise.resolve({ rows: args[0] === Q.code ? [{ ...Q }] : [] });
      }
      if (/^UPDATE quotes SET status='accepted'/.test(s)) {
        Q.status = 'accepted';
        Q.stripe_session = args[1];
        return Promise.resolve({ rows: [] });
      }
      return Promise.reject(new Error('unexpected query: ' + s.slice(0, 120)));
    },
  };
  const sandbox = {
    pool, console: { log() {}, warn() {}, error() {} },
    CARD_FEE: 0.04,
    SHOP_EMAIL: 'shop@example.com', SHOP_NAME: "June's Tees & Things", SHOP_SIGNER: 'June',
    SHOP_PHONE: '(773) 849-1854', BALANCE_WHEN: 'on pickup',
    REVIEW_DAYS_AFTER_DEPOSIT: () => 21, REVIEW_DAYS_AFTER_PAYMENT: () => 7,
    quoteLink: (code) => 'https://www.jtees.net/q/' + code,
    /* The real one appends to the ledger, is idempotent on the session, and
       rolls the ledger up onto the quote. */
    recordPayment: async (p) => {
      if (out.ledger.some((r) => r.session === p.session)) return { ok: false, duplicate: true, paid: null };
      out.ledger.push({ ...p });
      Q.paid_amount = round2(out.ledger.reduce((s, r) => s + r.amount, 0));
      return { ok: true, duplicate: false, paid: Q.paid_amount };
    },
    alertShop: async (subject, html) => { out.alerts.push({ subject, html }); },
    sendEmail: async (m) => { out.shopMail.push(m); },
    sendClientEmail: async (m) => { out.customerMail.push(m); },
    sendCustomerSms: (m) => { out.texts.push(m); return Promise.resolve('sent'); },
    SMS: { paymentReceived: ({ code }) => ({ template: 'payment-received', body: code }) },
    brevo: { post: (p, body) => { out.crmNotes.push(body); return Promise.resolve(); } },
    syncDealStage: () => Promise.resolve(),
    syncQuoteContact: (q, event) => { out.contacts.push(event); return Promise.resolve(); },
    queueReviewRequest: (r) => { out.reviews.push(r); return Promise.resolve(); },
  };
  vm.createContext(sandbox);
  vm.runInContext([ROUND2, MONEY, CODE_RE, lift('escEmail'), lift('bankStripeSession')].join('\n'), sandbox);
  out.bank = (session) => sandbox.bankStripeSession(session);
  return out;
}

const CODE = 'AB12CD34EF';
/* A paid Checkout Session for a $100 deposit, plus the 4% card fee. */
const session = (over = {}) => ({
  id: 'cs_test_deposit', object: 'checkout.session', client_reference_id: CODE,
  payment_status: 'paid', amount_total: 10400, payment_intent: 'pi_deposit',
  metadata: { kind: 'deposit' }, customer_details: { email: 'pat@example.com' }, ...over,
});
const QUOTE = { code: CODE, name: 'Pat Buyer', email: 'pat@example.com', phone: '+13125550123',
                total: 200, tax: 0, brevo_deal_id: 77, items: [{ description: '24 tees' }] };
const CANCELLED = { ...QUOTE, status: 'cancelled', cancelled_at: '2026-09-28T15:00:00Z',
                    cancel_reason: 'customer changed their mind' };

/* ── Paid after cancelling ──────────────────────────────────────────────── */

test('a payment on a cancelled quote is banked, not lost', async () => {
  const d = desk(CANCELLED);
  const r = await d.bank(session());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.cancelled, true);
  assert.strictEqual(d.ledger.length, 1, 'the money is real, so the books show it');
  assert.strictEqual(d.ledger[0].amount, 100, 'net of the card fee, like any card payment');
  assert.strictEqual(d.ledger[0].fee, 4);
  assert.strictEqual(d.quote.paid_amount, 100);
});

test('it does not bring the job back', async () => {
  const d = desk(CANCELLED);
  await d.bank(session());
  assert.strictEqual(d.quote.status, 'cancelled');
  assert.ok(!d.queries.some((q) => /^UPDATE quotes/.test(q)), 'no write to the quote at all: ' + d.queries.join(' | '));
});

test('the shop is told, in words, what to do about it', async () => {
  const d = desk(CANCELLED);
  await d.bank(session());
  assert.strictEqual(d.alerts.length, 1);
  const a = d.alerts[0];
  assert.match(a.subject, /Paid after cancelling/);
  assert.match(a.subject, new RegExp(CODE));
  assert.match(a.subject, /\$104\.00/, 'what the customer actually paid, fee included');
  assert.match(a.html, /customer changed their mind/, 'why it was cancelled, so the decision is easy');
  assert.match(a.html, /Refund it in Stripe/);
  assert.match(a.html, /Restore/);
  assert.match(a.html, /dashboard\.stripe\.com\/payments\/pi_deposit/, 'one click to the refund');
});

test('the customer is not told they are on the schedule, and nothing follows as for a sale', async () => {
  const d = desk(CANCELLED);
  await d.bank(session());
  assert.strictEqual(d.customerMail.length, 0, 'no "You\'re on the schedule" receipt');
  assert.strictEqual(d.texts.length, 0, 'no payment-received text');
  assert.strictEqual(d.reviews.length, 0, 'no review ask for a job that is not happening');
  assert.strictEqual(d.contacts.length, 0, 'no paid event for Brevo workflows to act on');
  assert.strictEqual(d.crmNotes.length, 0);
  assert.strictEqual(d.shopMail.length, 0, 'the alert replaces the ordinary "deposit paid" email');
});

test('the second report of the same payment says nothing again', async () => {
  /* The webhook and the return page both bank the same session. */
  const d = desk(CANCELLED);
  await d.bank(session());
  const again = await d.bank(session());
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(d.ledger.length, 1);
  assert.strictEqual(d.alerts.length, 1);
});

test('a live quote is paid exactly as before', async () => {
  /* The control: the gate is on cancelled_at, not on anything every quote has. */
  const d = desk(QUOTE);
  const r = await d.bank(session());
  assert.strictEqual(r.ok, true);
  assert.ok(!r.cancelled);
  assert.strictEqual(d.quote.status, 'accepted');
  assert.strictEqual(d.quote.stripe_session, 'cs_test_deposit');
  assert.strictEqual(d.alerts.length, 0);
  assert.strictEqual(d.shopMail.length, 1);
  assert.match(d.shopMail[0].subject, /Deposit paid/);
  assert.strictEqual(d.customerMail.length, 1);
  assert.match(d.customerMail[0].html, /on the schedule/);
  assert.strictEqual(d.texts.length, 1);
  assert.strictEqual(d.reviews.length, 1);
  assert.strictEqual(d.contacts[0], 'jt_deposit_paid');
});

/* ── One open card page per quote ───────────────────────────────────────── */

function expirer({ key = 'sk_test_x', answer = 200, throws = null } = {}) {
  const calls = [];
  const reports = [];
  const sandbox = {
    process: { env: key ? { STRIPE_SECRET_KEY: key } : {} },
    AbortSignal,
    fetch: async (url, opts) => {
      calls.push({ url, method: opts && opts.method, auth: opts && opts.headers && opts.headers.Authorization });
      if (throws) throw throws;
      return { ok: answer < 300, status: answer,
               json: async () => ({ error: { message: 'Stripe said no (' + answer + ')' } }) };
    },
    reportError: (kind, err, context) => { reports.push({ kind, message: err.message, context }); return Promise.resolve(); },
  };
  vm.createContext(sandbox);
  vm.runInContext(lift('expireCheckoutSession'), sandbox);
  return { expire: (id) => sandbox.expireCheckoutSession(id), calls, reports };
}

test('an open card page is closed through Stripe', async () => {
  const x = expirer();
  assert.strictEqual(await x.expire('cs_live_a1B2c3'), true);
  assert.strictEqual(x.calls.length, 1);
  assert.strictEqual(x.calls[0].url, 'https://api.stripe.com/v1/checkout/sessions/cs_live_a1B2c3/expire');
  assert.strictEqual(x.calls[0].method, 'POST');
  assert.strictEqual(x.calls[0].auth, 'Bearer sk_test_x');
  assert.strictEqual(x.reports.length, 0);
});

test('a page already paid or expired is the usual case, not an error', async () => {
  /* Stripe answers 400 for a session that is not open any more. */
  const x = expirer({ answer: 400 });
  assert.strictEqual(await x.expire('cs_live_paid'), false);
  assert.strictEqual(x.reports.length, 0);

  /* And 404 for one it has never heard of: a test-mode id stored before the
     live key, which the live account cannot see. Nothing was open either. */
  const old = expirer({ answer: 404 });
  assert.strictEqual(await old.expire('cs_test_from_july'), false);
  assert.strictEqual(old.reports.length, 0);
});

test('any other failure is reported and never thrown', async () => {
  const down = expirer({ answer: 500 });
  assert.strictEqual(await down.expire('cs_live_x'), false);
  assert.strictEqual(down.reports.length, 1);
  assert.strictEqual(down.reports[0].kind, 'stripe:expire-session');
  assert.match(down.reports[0].message, /HTTP 500: Stripe said no/);
  assert.strictEqual(down.reports[0].context, 'cs_live_x');

  const offline = expirer({ throws: new Error('fetch failed') });
  assert.strictEqual(await offline.expire('cs_live_x'), false);
  assert.match(offline.reports[0].message, /fetch failed/);
});

test('nothing is sent without a key, or for anything that is not a session id', async () => {
  const noKey = expirer({ key: null });
  assert.strictEqual(await noKey.expire('cs_live_x'), false);
  assert.strictEqual(noKey.calls.length, 0);
  const x = expirer();
  for (const id of [null, undefined, '', 'pi_123', 'cs_live_x/../../customers', 'cs_live x']) {
    assert.strictEqual(await x.expire(id), false, JSON.stringify(id));
  }
  assert.strictEqual(x.calls.length, 0, 'a stored value is never trusted into the URL');
});

/* Where it is called. Anchored on the route, so moving the call out of it
   fails here with the reason rather than as a missing anchor. */
const payRoute = src.slice(src.indexOf("app.get(['/q/:code/pay/card'"),
                           src.indexOf('Bank a completed Stripe Checkout session'));
const cancelRoute = src.slice(src.indexOf("app.post('/quote/:code/cancel'"),
                              src.indexOf("app.post('/quote/:code/uncancel'"));
const uncancelRoute = src.slice(src.indexOf("app.post('/quote/:code/uncancel'"),
                                src.indexOf("app.post('/quote/:code/settle'"));

test('a new card page closes the quote\'s last one first', () => {
  const close = payRoute.indexOf('expireCheckoutSession(q.stripe_session)');
  const create = payRoute.indexOf("fetch('https://api.stripe.com/v1/checkout/sessions'");
  assert.ok(close > 0, 'the pay route closes the stored session');
  assert.ok(create > 0, 'the pay route creates a session');
  assert.ok(close < create, 'closed BEFORE the new one exists, so two are never open together');
  assert.match(payRoute, /UPDATE quotes SET stripe_session=\$1/, 'and the new one is stored to be closed next time');
});

test('cancelling a quote closes its open card page', () => {
  assert.match(cancelRoute, /cancelled_at = NOW\(\)/);
  assert.match(cancelRoute, /expireCheckoutSession\(rows\[0\]\.stripe_session\)/);
});

test('a cancelled quote still cannot open a new card page', () => {
  /* The first line of defence; the two above close what was already open. */
  assert.match(payRoute, /if \(q\.cancelled_at\) return res\.redirect/);
});

test('the stored page is forgotten before it is closed', () => {
  /* So when Stripe reports it expired, the quote no longer names it and it
     reads as replaced. Forgetting it after closing would race the webhook. */
  const forget = payRoute.indexOf('UPDATE quotes SET stripe_session = NULL');
  const close = payRoute.indexOf('expireCheckoutSession(q.stripe_session)');
  assert.ok(forget > 0, 'the pay route forgets the stored session');
  assert.ok(forget < close, 'forgotten BEFORE it is closed');
});

/* ── A page closed on purpose is not a customer who gave up ─────────────── */

function expiryDesk(quote) {
  const alerts = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    pool: { query: async (sql, args) => ({ rows: args[0] === quote.code ? [{ ...quote }] : [] }) },
    alertShop: async (subject, html) => { alerts.push({ subject, html }); },
    quoteLink: (code) => 'https://www.jtees.net/q/' + code,
  };
  vm.createContext(sandbox);
  vm.runInContext([ROUND2, MONEY, CODE_RE, lift('escEmail'), lift('balanceOf'),
                   lift('handleStripeEvent')].join('\n'), sandbox);
  return {
    alerts,
    expire: (id) => sandbox.handleStripeEvent({ type: 'checkout.session.expired',
      data: { object: { id, object: 'checkout.session', client_reference_id: CODE } } }),
  };
}

const OWING = { ...QUOTE, paid_amount: 0, written_off: 0, cancelled_at: null,
                stripe_session: 'cs_live_current' };

test('a page the customer walked away from still tells the shop', async () => {
  /* The control: the nudge this protects is still sent. */
  const d = expiryDesk(OWING);
  await d.expire('cs_live_current');
  assert.strictEqual(d.alerts.length, 1);
  assert.match(d.alerts[0].subject, /Checkout abandoned — quote AB12CD34EF/);
  assert.match(d.alerts[0].html, /\$200\.00/);
});

test('a page replaced by a newer one says nothing', async () => {
  const d = expiryDesk(OWING);
  await d.expire('cs_live_older');
  assert.strictEqual(d.alerts.length, 0, 'the customer pressed Pay again; they did not give up');

  const between = expiryDesk({ ...OWING, stripe_session: null });
  await between.expire('cs_live_current');
  assert.strictEqual(between.alerts.length, 0, 'reported while its replacement was being made');
});

test('a page closed by cancelling says nothing', async () => {
  const d = expiryDesk({ ...OWING, cancelled_at: '2026-09-28T15:00:00Z' });
  await d.expire('cs_live_current');
  assert.strictEqual(d.alerts.length, 0, 'no follow-up on a job the shop cancelled');
});

test('restoring a quote that was paid while cancelled puts the job back on', () => {
  /* That payment did not accept the quote, so Restore has to count the money
     as accepting it, or the paid job comes back as merely "sent". */
  assert.match(uncancelRoute,
    /status = CASE WHEN accepted_at IS NOT NULL OR COALESCE\(paid_amount, 0\) > 0\s+THEN 'accepted' ELSE 'sent' END/);
  assert.match(uncancelRoute,
    /accepted_at = CASE WHEN accepted_at IS NULL AND COALESCE\(paid_amount, 0\) > 0\s+THEN NOW\(\) ELSE accepted_at END/);
});
