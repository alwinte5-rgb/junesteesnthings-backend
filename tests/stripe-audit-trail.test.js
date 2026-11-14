'use strict';

/* Every change Stripe makes to a quote leaves a record (Workstream E).
 *
 * A manual payment, cancel, restore or settle snapshots the quote into
 * quote_revisions first, so its History card shows before → after and who did
 * it. A card payment arriving by webhook did not: the money reached the
 * ledger, but the quote's history said nothing, and a delivery that FAILED and
 * was retried left no trace except a server log line.
 *
 *   1. bankStripeSession() snapshots the quote before banking, credited to
 *      "Stripe" (not "Owner"), and skips the snapshot when the session is
 *      already banked, so a Stripe retry adds no empty history line.
 *   2. Every webhook delivery writes one stripe_events row saying whether it
 *      was handled or failed, with the error. A retry is a second row.
 *   3. The log can never change the answer Stripe gets.
 *
 * Run: node --test tests/stripe-audit-trail.test.js
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

const CODE = 'AB12CD34EF';
const session = (over = {}) => ({
  id: 'cs_test_deposit', object: 'checkout.session', client_reference_id: CODE,
  payment_status: 'paid', amount_total: 10400, payment_intent: 'pi_deposit',
  metadata: { kind: 'deposit' }, customer_details: { email: 'pat@example.com' }, ...over,
});

/* bankStripeSession with an in-memory quote, ledger and history. */
function desk() {
  const Q = { code: CODE, name: 'Pat Buyer', email: 'pat@example.com', phone: '', total: 200,
              tax: 0, status: 'sent', paid_amount: 0, cancelled_at: null };
  const out = { ledger: [], snapshots: [] };
  const pool = {
    query(sql, args = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT \* FROM quotes WHERE code=\$1$/.test(s)) return Promise.resolve({ rows: [{ ...Q }] });
      if (/^SELECT 1 FROM quote_payments WHERE ext_ref = \$1/.test(s)) {
        return Promise.resolve({ rows: out.ledger.filter((r) => r.session === args[0]).map(() => ({ '?column?': 1 })) });
      }
      if (/^UPDATE quotes SET status='accepted'/.test(s)) { Q.status = 'accepted'; return Promise.resolve({ rows: [] }); }
      return Promise.reject(new Error('unexpected query: ' + s.slice(0, 120)));
    },
  };
  const sandbox = {
    pool, console: { log() {}, warn() {}, error() {} }, CARD_FEE: 0.04,
    SHOP_EMAIL: 'shop@example.com', SHOP_NAME: 'Shop', SHOP_SIGNER: 'June', SHOP_PHONE: '1', BALANCE_WHEN: 'on pickup',
    REVIEW_DAYS_AFTER_PAYMENT: () => 21, REVIEW_DAYS_AFTER_DELIVERY: () => 3,
    quoteLink: (code) => 'https://www.jtees.net/q/' + code,
    /* The real one takes the row before the change; here it records the call
       and the quote's paid amount at that moment. */
    snapshotQuote: async (code, action) => { out.snapshots.push({ code, action, paidBefore: Q.paid_amount }); },
    recordPayment: async (p) => {
      if (out.ledger.some((r) => r.session === p.session)) return { ok: false, duplicate: true, paid: null };
      out.ledger.push({ ...p });
      Q.paid_amount = round2(out.ledger.reduce((s, r) => s + r.amount, 0));
      return { ok: true, duplicate: false, paid: Q.paid_amount };
    },
    alertShop: async () => {}, sendEmail: async () => {}, sendClientEmail: async () => {},
    sendCustomerSms: () => Promise.resolve('sent'), SMS: { paymentReceived: () => ({}) },
    brevo: { post: () => Promise.resolve() }, syncDealStage: () => Promise.resolve(),
    syncQuoteContact: () => Promise.resolve(), queueReviewRequest: () => Promise.resolve(),
  };
  vm.createContext(sandbox);
  vm.runInContext([ROUND2, MONEY, CODE_RE, lift('escEmail'), lift('bankStripeSession')].join('\n'), sandbox);
  out.bank = (s) => sandbox.bankStripeSession(s);
  return out;
}

test('a card payment snapshots the quote BEFORE the money lands, credited to Stripe', async () => {
  const d = desk();
  const r = await d.bank(session());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(d.snapshots.length, 1, 'one history line for one payment');
  assert.strictEqual(d.snapshots[0].code, CODE);
  assert.match(d.snapshots[0].action, /^Stripe:/, 'the action names Stripe so the history does not say "Owner"');
  assert.strictEqual(d.snapshots[0].paidBefore, 0, 'taken before recordPayment, so it is the row as it stood');
});

test('a Stripe retry of a banked session adds no second history line', async () => {
  const d = desk();
  await d.bank(session());
  const again = await d.bank(session());
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(d.snapshots.length, 1, 'the retry is not a change');
  assert.strictEqual(d.ledger.length, 1);
});

test('a second, different payment is its own history line', async () => {
  const d = desk();
  await d.bank(session());
  await d.bank(session({ id: 'cs_test_balance', metadata: { kind: 'balance' } }));
  assert.strictEqual(d.snapshots.length, 2);
});

test('an unpaid or unlinked session snapshots nothing', async () => {
  const d = desk();
  await d.bank(session({ payment_status: 'unpaid' }));
  await d.bank(session({ client_reference_id: '10' }));
  assert.strictEqual(d.snapshots.length, 0);
});

test('without snapshotQuote in scope (other tests lift this alone) banking still works', () => {
  assert.match(lift('bankStripeSession'), /typeof snapshotQuote === 'function'/);
});

/* ── The delivery log ──────────────────────────────────────────────────── */

function logger({ fail = false } = {}) {
  const rows = [];
  const sandbox = {
    console: { error() {} },
    pool: { query: async (sql, args) => { if (fail) throw new Error('db down'); rows.push(args); return { rows: [] }; } },
  };
  vm.createContext(sandbox);
  vm.runInContext([CODE_RE, lift('logStripeDelivery')].join('\n'), sandbox);
  return { rows, log: (...a) => sandbox.logStripeDelivery(...a) };
}

test('a handled delivery is one row: event id, type, quote, outcome', async () => {
  const l = logger();
  await l.log({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { client_reference_id: CODE.toLowerCase() } } }, 'handled');
  // Through JSON: arrays made inside the vm context carry its prototypes.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(l.rows)), [['evt_1', 'checkout.session.completed', CODE, 'handled', null]]);
});

test('a failed delivery keeps the error, capped', async () => {
  const l = logger();
  await l.log({ id: 'evt_2', type: 'charge.refunded', data: { object: { metadata: { quote_code: CODE } } } },
    'failed', new Error('x'.repeat(1000)));
  assert.strictEqual(l.rows[0][2], CODE, 'a charge names its quote in metadata');
  assert.strictEqual(l.rows[0][3], 'failed');
  assert.strictEqual(l.rows[0][4].length, 300);
});

test('money with no quote code is still logged, with no quote', async () => {
  const l = logger();
  await l.log({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { client_reference_id: '10' } } }, 'handled');
  assert.strictEqual(l.rows[0][2], null);
});

test('the log never throws, so it can never turn a banked payment into a retry', async () => {
  const l = logger({ fail: true });
  await assert.doesNotReject(l.log({ id: 'evt_4', type: 'x', data: { object: {} } }, 'handled'));
  await assert.doesNotReject(l.log(null, 'failed', new Error('y')));
});

test('the route logs AFTER the work, before each answer, and only once signed', () => {
  const route = src.slice(src.indexOf("app.post('/webhooks/stripe'"), src.indexOf('async function logStripeDelivery'));
  const work = route.indexOf('await handleStripeEvent');
  const handled = route.indexOf("logStripeDelivery(req.body, 'handled')");
  const ok = route.indexOf('res.sendStatus(200)');
  const failed = route.indexOf("logStripeDelivery(req.body, 'failed', err)");
  const retry = route.indexOf('res.sendStatus(500)');
  assert.ok(route.indexOf('timingSafeEqual') < work, 'nothing logged for an unsigned request');
  assert.ok(work < handled && handled < ok, 'handled is logged after the work, before the 200');
  assert.ok(failed !== -1 && failed < retry, 'failed is logged before asking Stripe to retry');
});

test('stripe_events is created, and the History card lists deliveries', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS stripe_events \(/);
  const card = lift('jobHistoryCard');
  assert.match(card, /FROM stripe_events/);
  assert.match(card, /Stripe deliveries/);
  assert.match(card, /\/\^Stripe:\/\.test\(r\.action\) \? 'Stripe' : 'Owner'/);
  assert.match(card, /if \(!rows\.length && !deliveries\.length\) return '';/,
    'a quote with deliveries but no revisions still shows the card');
});
