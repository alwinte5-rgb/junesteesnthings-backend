'use strict';

/* Chargebacks: the books follow what Stripe decides, and nobody is chased.
 *
 * Until 2026-09-27 only charge.dispute.created was handled, as an email. A lost
 * dispute stayed in the books as money received, the shop was never told how
 * one ended, and the deposit, balance, reorder and review emails kept going to
 * the customer who had gone to their card issuer.
 *
 * Now every dispute event, and an hourly sweep, reconciles the dispute against
 * Stripe: opening one moves no money (it may be won); losing one takes the
 * disputed money back off the quote or the unlinked ledger the way a refund
 * does, and Stripe's dispute fee goes in as an expense. A dispute is recorded
 * from the day it opens so that everything that writes to a customer can see
 * it before anything is booked.
 *
 * Nothing here has a Postgres or a Stripe, so both are answered in memory, the
 * way the real ones answer.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* Pull a top-level function out of server.js by name, `async` included. The
   parameter list is stepped over first: a destructured `{ a } = {}` opens with
   a brace, and matching on that returns a signature with no body. */
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
const OPEN_SET = (() => {
  const at = src.indexOf('const DISPUTE_OPEN = new Set([');
  assert.notStrictEqual(at, -1, 'DISPUTE_OPEN not found');
  return src.slice(at, src.indexOf(']);', at) + 3);
})();
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ── A Stripe, a ledger and an inbox, all in memory ─────────────────────── */

/* `quotePayments` and `unlinked` are the ORIGINAL payments. `stripe.disputes`
   is what Stripe holds, which a test edits between calls the way a dispute
   moves along. `booked` and `expenses` collect every row the reconcile writes,
   and are also what its "already booked" queries read back. */
function disputeDesk({ quotePayments = [], unlinked = [], stripe = { disputes: {} }, key = 'sk_test_x' } = {}) {
  const booked = [];
  const expenses = [];
  const alerts = [];
  const disputes = new Map();
  const calls = [];
  const expenseSql = [];

  const pool = {
    query(sql, args = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT status FROM stripe_disputes WHERE id = \$1/.test(s)) {
        const d = disputes.get(args[0]);
        return Promise.resolve({ rows: d ? [{ status: d.status }] : [] });
      }
      if (/^INSERT INTO stripe_disputes/.test(s)) {
        const [id, charge, pi, quote_code, order_ref, amount, currency, reason, status, evidence_due, closed] = args;
        disputes.set(id, { id, charge, pi, quote_code, order_ref, amount, currency, reason, status,
                           evidence_due, closed_at: closed ? 'now' : null, close_alerted: false });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/^UPDATE stripe_disputes SET status = \$2/.test(s)) {
        const d = disputes.get(args[0]);
        Object.assign(d, { status: args[1], evidence_due: args[2], amount: args[3] });
        if (args[4] && !d.closed_at) d.closed_at = 'now';
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/^UPDATE stripe_disputes SET close_alerted = TRUE WHERE id = \$1 AND close_alerted = FALSE/.test(s)) {
        const d = disputes.get(args[0]);
        if (!d || d.close_alerted) return Promise.resolve({ rows: [], rowCount: 0 });
        d.close_alerted = true;
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/FROM expenses WHERE split_part\(ext_ref, ':', 1\) = \$1 AND split_part\(ext_ref, ':', 2\) = 'fee'/.test(s)) {
        const mine = expenses.filter((e) => e.extRef.split(':')[0] === args[0] && e.extRef.split(':')[1] === 'fee');
        return Promise.resolve({ rows: [{ cents: String(Math.round(mine.reduce((c, e) => c + e.amount, 0) * 100)),
                                          n: String(mine.length) }] });
      }
      if (/split_part\(ext_ref, ':', 1\) = \$1/.test(s)) {   // refundCentsBooked, keyed on the dispute
        const mine = booked.filter((r) => r.extRef.split(':')[0] === args[0]);
        const cents = Math.round(-mine.reduce((c, r) => c + r.amount + (r.fee || 0), 0) * 100);
        return Promise.resolve({ rows: [{ cents: String(cents), n: String(mine.length) }] });
      }
      if (/FROM quote_payments WHERE stripe_pi = \$1 AND amount > 0/.test(s)) {
        const mine = quotePayments.filter((p) => p.pi === args[0]);
        return Promise.resolve({ rows: mine.length ? [{
          quote_code: mine[0].code,
          applied: String(mine.reduce((c, p) => c + p.amount, 0)),   // NUMERIC arrives as text
          fee: String(mine.reduce((c, p) => c + p.fee, 0)),
        }] : [] });
      }
      if (/FROM unlinked_payments WHERE stripe_pi = \$1 AND amount > 0/.test(s)) {
        return Promise.resolve({ rows: unlinked.filter((u) => u.stripe_pi === args[0]).slice(0, 1) });
      }
      if (/^INSERT INTO expenses/.test(s)) {
        expenseSql.push(s);
        const [amount, note, extRef] = args;
        if (expenses.some((e) => e.extRef === extRef)) {
          const e = new Error('duplicate key value violates unique constraint "expenses_extref_uniq"');
          e.code = '23505';
          return Promise.reject(e);
        }
        expenses.push({ amount, note, extRef });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.reject(new Error('unexpected query: ' + s.slice(0, 100)));
    },
  };

  /* Stripe's GET /v1/disputes/:id and its listing. */
  const fetch = async (url, opts) => {
    const u = new URL(url);
    calls.push({ url, auth: opts && opts.headers && opts.headers.Authorization });
    if (stripe.failWith) {
      return { ok: false, status: stripe.failWith.status,
               json: async () => ({ error: { message: stripe.failWith.message } }) };
    }
    const one = /^\/v1\/disputes\/([^/]+)$/.exec(u.pathname);
    if (one) {
      const d = stripe.disputes[decodeURIComponent(one[1])];
      return d ? { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(d)) }
               : { ok: false, status: 404, json: async () => ({ error: { message: 'No such dispute' } }) };
    }
    assert.strictEqual(u.origin + u.pathname, 'https://api.stripe.com/v1/disputes');
    return { ok: true, status: 200,
             json: async () => ({ has_more: false, data: JSON.parse(JSON.stringify(Object.values(stripe.disputes))) }) };
  };

  const sandbox = {
    pool, fetch, URL, URLSearchParams, AbortSignal,
    process: { env: key ? { STRIPE_SECRET_KEY: key } : {} },
    console: { log() {}, warn() {}, error() {} },
    SHOP_TZ: 'America/Chicago',
    escEmail: (s) => String(s),
    quoteLink: (code) => 'https://www.jtees.net/q/' + code,
    alertShop: async (subject, html) => { alerts.push({ subject, html }); },
    /* Both writers are idempotent on ext_ref in the real tables. */
    recordPayment: async (p) => {
      if (booked.some((r) => r.extRef === p.extRef)) return { ok: false, duplicate: true, paid: null };
      booked.push({ ledger: 'quote', code: p.code, amount: p.amount, fee: p.fee, kind: p.kind,
                    method: p.method, extRef: p.extRef, note: p.note });
      return { ok: true, duplicate: false, paid: null };
    },
    recordUnlinkedPayment: async (session, reason, opts) => {
      if (booked.some((r) => r.extRef === opts.extRef)) return { ok: true, duplicate: true };
      booked.push({ ledger: 'unlinked', amount: opts.amount, fee: 0, taxPortion: opts.taxPortion,
                    kind: opts.kind, extRef: opts.extRef, source: opts.source, reason,
                    orderRef: session.metadata && session.metadata.order_id });
      return { ok: true, duplicate: false, amount: opts.amount };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([ROUND2, MONEY, OPEN_SET, lift('movedShare'), lift('refundCentsBooked'),
                   lift('stripeListAll'), lift('stripeGet'), lift('disputedPayment'),
                   lift('disputeFeeBooked'), lift('reconcileDisputeNow'),
                   /* The queue and the lock have a test of their own below. */
                   'function reconcileDisputes(d, via, opts) { return reconcileDisputeNow(d, via, opts); }',
                   lift('reconcileRecentDisputes')].join('\n'), sandbox);
  return {
    reconcile: (d, via, opts) => sandbox.reconcileDisputeNow(d, via, opts),
    sweep: () => sandbox.reconcileRecentDisputes(),
    booked, expenses, alerts, disputes, calls, stripe, expenseSql,
  };
}

/* A dispute as Stripe holds it. `bts` are its balance transactions: the
   withdrawal when a chargeback opens, a reinstatement when it is won. */
const dispute = (id, { charge = 'ch_1', pi = 'pi_1', cents = 5200, status = 'needs_response',
                       reason = 'fraudulent', due = 1790000000, bts = [] } = {}) =>
  ({ id, object: 'dispute', charge, payment_intent: pi, amount: cents, currency: 'usd', status, reason,
     evidence_details: { due_by: due }, balance_transactions: bts });
const withdrawn = (cents, fee = 1500) => ({ id: 'txn_w', amount: -cents, fee, net: -cents - fee });
const reinstated = (cents, fee = 0) => ({ id: 'txn_r', amount: cents, fee, net: cents - fee });

/* A $50 quote payment by card: $52 charged, $2 of it the 4% card fee. */
const CARD_50 = { code: 'Q1', pi: 'pi_1', amount: 50, fee: 2 };
const sum = (rows, k) => round2(rows.reduce((c, r) => c + (r[k] || 0), 0));

/* ── the books ────────────────────────────────────────────────────────────── */

test('opening a dispute books nothing, records it, and tells the shop to respond and hold the job', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50],
    stripe: { disputes: { dp_1: dispute('dp_1', { bts: [withdrawn(5200)] }) } } });
  const out = await desk.reconcile(desk.stripe.disputes.dp_1);

  assert.deepStrictEqual(desk.booked, [], 'a dispute can be won: nothing moves while it is open');
  assert.deepStrictEqual(desk.expenses, [], 'and the fee waits for the decision too');
  const rec = desk.disputes.get('dp_1');
  assert.ok(rec && rec.quote_code === 'Q1' && rec.status === 'needs_response' && !rec.closed_at,
    'recorded against the quote from day one, so the payment and review emails can see it');
  assert.strictEqual(out.opened, true);
  assert.strictEqual(desk.alerts.length, 1);
  assert.match(desk.alerts[0].subject, /Chargeback opened: \$52\.00 on quote Q1/);
  assert.match(desk.alerts[0].html, /Respond in the Stripe Dashboard before /);
  assert.match(desk.alerts[0].html, /If the job is not made yet, hold it/);
  assert.match(desk.alerts[0].html, /fraudulent/, 'the reason the customer gave');
});

test('a lost dispute takes the payment back off the quote the way a refund does; the fee is an expense', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50],
    stripe: { disputes: { dp_1: dispute('dp_1', { bts: [withdrawn(5200)] }) } } });
  await desk.reconcile(desk.stripe.disputes.dp_1);             // opened
  desk.stripe.disputes.dp_1.status = 'lost';
  const out = await desk.reconcile(desk.stripe.disputes.dp_1); // decided

  assert.strictEqual(desk.booked.length, 1);
  const row = desk.booked[0];
  assert.deepStrictEqual([row.ledger, row.code, row.amount, row.fee, row.kind, row.method],
    ['quote', 'Q1', -50, -2, 'dispute', 'card'],
    'the whole charge back out, split the way the payment was: the quote is back to $0 paid');
  assert.match(row.extRef, /^dp_1:5200:1$/, 'keyed on the dispute, so a retry is a duplicate');
  assert.strictEqual(desk.expenses.length, 1);
  assert.deepStrictEqual([desk.expenses[0].amount, desk.expenses[0].extRef], [15, 'dp_1:fee:1500:1']);
  assert.match(desk.expenseSql[0], /VALUES \(CURRENT_DATE, 'Fees', \$1, 'Stripe', \$2, \$3\)/,
    'Stripe\'s fee is a cost of the business, filed under Fees');
  assert.deepStrictEqual([out.booked, out.fee, out.closed], [52, 15, true]);
  assert.strictEqual(desk.alerts.length, 2);
  assert.match(desk.alerts[1].subject, /Chargeback lost: \$52\.00 on quote Q1/);
  assert.match(desk.alerts[1].html, /It has come off the quote, with its tax\s+in proportion/);
  assert.match(desk.alerts[1].html, /Stripe kept its \$15\.00 dispute fee, recorded as an expense/);
});

test('a retried, late or out-of-order event books nothing twice, and the shop hears once', async () => {
  const lost = dispute('dp_1', { status: 'lost', bts: [withdrawn(5200)] });
  const desk = disputeDesk({ quotePayments: [CARD_50], stripe: { disputes: { dp_1: lost } } });
  const stale = dispute('dp_1', { status: 'needs_response' });   // an old event, delivered late
  await desk.reconcile(lost);
  await desk.reconcile(stale);
  await desk.reconcile(lost);

  assert.strictEqual(desk.booked.length, 1);
  assert.strictEqual(desk.expenses.length, 1);
  assert.strictEqual(desk.alerts.length, 1,
    'first seen already decided: one email, the decision, and no "opened" for a closed dispute');
  assert.match(desk.alerts[0].subject, /Chargeback lost/);
});

test('an event can be stale: Stripe is asked, with the key, and what it says now is what is booked', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50],
    stripe: { disputes: { dp_1: dispute('dp_1', { status: 'lost', bts: [withdrawn(5200)] }) } } });
  await desk.reconcile(dispute('dp_1', { status: 'needs_response' }));

  assert.strictEqual(desk.calls.length, 1);
  assert.strictEqual(desk.calls[0].url, 'https://api.stripe.com/v1/disputes/dp_1');
  assert.strictEqual(desk.calls[0].auth, 'Bearer sk_test_x');
  assert.strictEqual(sum(desk.booked, 'amount'), -50, 'booked as lost, as Stripe has it now');
});

test('a won dispute leaves the money; a fee Stripe kept is still an expense, one it gave back is not', async () => {
  const kept = disputeDesk({ quotePayments: [CARD_50], stripe: { disputes: {
    dp_1: dispute('dp_1', { status: 'won', bts: [withdrawn(5200, 1500), reinstated(5200, 0)] }) } } });
  await kept.reconcile(kept.stripe.disputes.dp_1);
  assert.deepStrictEqual(kept.booked, [], 'won: the money stays');
  assert.strictEqual(sum(kept.expenses, 'amount'), 15);
  assert.match(kept.alerts[0].subject, /Dispute won: \$52\.00 on quote Q1/);
  assert.match(kept.alerts[0].html, /nothing changed in the books\. Stripe kept its \$15\.00 dispute fee/);

  const returned = disputeDesk({ quotePayments: [CARD_50], stripe: { disputes: {
    dp_1: dispute('dp_1', { status: 'won', bts: [withdrawn(5200, 1500), reinstated(5200, -1500)] }) } } });
  await returned.reconcile(returned.stripe.disputes.dp_1);
  assert.deepStrictEqual(returned.booked, []);
  assert.deepStrictEqual(returned.expenses, [], 'Stripe gave its fee back: no expense');
  assert.doesNotMatch(returned.alerts[0].html, /dispute fee/);
});

test('won, with the reinstatement landing after the close: the next pass corrects the fee', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50], stripe: { disputes: {
    dp_1: dispute('dp_1', { status: 'won', bts: [withdrawn(5200, 1500)] }) } } });
  await desk.reconcile(desk.stripe.disputes.dp_1);
  assert.strictEqual(sum(desk.expenses, 'amount'), 15, 'what Stripe had kept at the time');

  desk.stripe.disputes.dp_1.balance_transactions.push(reinstated(5200, -1500));
  await desk.sweep();
  assert.strictEqual(desk.expenses.length, 2);
  assert.strictEqual(sum(desk.expenses, 'amount'), 0, 'a correcting row, so the history survives');
  assert.deepStrictEqual(desk.booked, []);
  assert.strictEqual(desk.alerts.length, 1, 'and the shop is not told twice');
});

test('an inquiry says no money has moved, and closing without a chargeback books nothing', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50], stripe: { disputes: {
    dp_1: dispute('dp_1', { status: 'warning_needs_response' }) } } });
  await desk.reconcile(desk.stripe.disputes.dp_1);
  assert.match(desk.alerts[0].subject, /Dispute inquiry: \$52\.00 on quote Q1/);
  assert.match(desk.alerts[0].html, /no money has moved yet/);

  desk.stripe.disputes.dp_1.status = 'warning_closed';
  await desk.reconcile(desk.stripe.disputes.dp_1);
  assert.deepStrictEqual(desk.booked, []);
  assert.deepStrictEqual(desk.expenses, []);
  assert.match(desk.alerts[1].subject, /Dispute inquiry closed: quote Q1/);
});

test('a lost dispute on a design studio order comes off the unlinked ledger, tax in proportion, named', async () => {
  const studio = { id: 9, stripe_pi: 'pi_s', order_ref: '77', client_ref: '77', customer_email: 'c@example.com',
                   customer_name: 'Cam', amount: '108.25', tax_portion: '8.25' };
  const desk = disputeDesk({ unlinked: [studio], stripe: { disputes: {
    dp_s: dispute('dp_s', { charge: 'ch_s', pi: 'pi_s', cents: 10825, status: 'lost', bts: [withdrawn(10825)] }) } } });
  await desk.reconcile(desk.stripe.disputes.dp_s);

  assert.strictEqual(desk.booked.length, 1);
  assert.deepStrictEqual(
    [desk.booked[0].ledger, desk.booked[0].amount, desk.booked[0].taxPortion, desk.booked[0].kind, desk.booked[0].orderRef],
    ['unlinked', -108.25, -8.25, 'dispute', '77']);
  assert.strictEqual(desk.disputes.get('dp_s').order_ref, '77', 'so the board can put it on the studio order');
  assert.match(desk.alerts[0].subject, /Chargeback lost: \$108\.25 on design studio order #77/);
  assert.match(desk.alerts[0].html, /off the unlinked ledger/);
});

test('a partial chargeback splits the net and the card fee in proportion', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50], stripe: { disputes: {
    dp_1: dispute('dp_1', { cents: 2600, status: 'lost', bts: [withdrawn(2600)] }) } } });
  await desk.reconcile(desk.stripe.disputes.dp_1);
  assert.deepStrictEqual([desk.booked[0].amount, desk.booked[0].fee], [-25, -1]);
});

test('a lost dispute on a payment neither ledger holds books nothing, and the shop is told to look', async () => {
  const desk = disputeDesk({ stripe: { disputes: {
    dp_x: dispute('dp_x', { charge: 'ch_x', pi: 'pi_x', status: 'lost', bts: [withdrawn(5200)] }) } } });
  await desk.reconcile(desk.stripe.disputes.dp_x);
  assert.deepStrictEqual(desk.booked, []);
  assert.match(desk.alerts[0].subject, /a payment the books do not hold \(ch_x\)/);
  assert.match(desk.alerts[0].html, /in neither ledger, so nothing came off the books/);
  assert.strictEqual(sum(desk.expenses, 'amount'), 15, 'the fee is still a real cost');
});

test('Stripe unreachable: nothing is written, and the error reaches the webhook so Stripe retries', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50],
    stripe: { disputes: {}, failWith: { status: 500, message: 'Something went wrong on our end' } } });
  await assert.rejects(desk.reconcile(dispute('dp_1', { status: 'lost' })),
    /Stripe GET \/v1\/disputes\/dp_1 500: Something went wrong on our end/);
  assert.deepStrictEqual(desk.booked, []);
  assert.strictEqual(desk.disputes.size, 0);
  assert.deepStrictEqual(desk.alerts, []);
});

test('an unusable id is skipped out loud, with nothing asked or written', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50] });
  const out = await desk.reconcile({ id: 'dp:1' });
  assert.strictEqual(out.skipped, 'not a dispute');
  assert.deepStrictEqual([desk.calls.length, desk.disputes.size], [0, 0]);
});

/* ── the hourly pass ──────────────────────────────────────────────────────── */

test('the hourly pass reads Stripe\'s listing once, trusts it, and is quiet when nothing changed', async () => {
  const desk = disputeDesk({ quotePayments: [CARD_50, { code: 'Q2', pi: 'pi_2', amount: 100, fee: 4 }],
    stripe: { disputes: {
      dp_1: dispute('dp_1', { status: 'lost', bts: [withdrawn(5200)] }),
      dp_2: dispute('dp_2', { charge: 'ch_2', pi: 'pi_2', cents: 10400, status: 'under_review', bts: [withdrawn(10400)] }),
    } } });
  const first = await desk.sweep();
  assert.match(first, /^2 dispute\(s\) checked, 1 booked, 2 reported to the shop$/);
  assert.strictEqual(desk.calls.length, 1, 'one listing, no per-dispute lookups: it is Stripe\'s own copy');
  const since = Number(new URL(desk.calls[0].url).searchParams.get('created[gte]'));
  assert.ok(Math.abs(since - (Math.floor(Date.now() / 1000) - 180 * 86400)) < 5,
    'disputes run for months: six of them are looked at');
  assert.ok(desk.alerts.every((a) => /Found by the hourly check/.test(a.html)),
    'the shop can tell a missed webhook from a normal one');

  assert.strictEqual(await desk.sweep(), '', 'nothing new: silent, it runs every hour');
  assert.strictEqual(desk.booked.length, 1);
});

test('without a key the sweep says it was skipped', async () => {
  const desk = disputeDesk({ key: '' });
  assert.strictEqual(await desk.sweep(), 'skipped: STRIPE_SECRET_KEY is not set');
});

/* ── wiring ───────────────────────────────────────────────────────────────── */

test('every dispute event goes to the reconcile, and none is handled any other way', () => {
  const handler = lift('handleStripeEvent');
  assert.match(handler,
    /case 'charge\.dispute\.created':\s*case 'charge\.dispute\.updated':\s*case 'charge\.dispute\.closed':\s*case 'charge\.dispute\.funds_withdrawn':\s*case 'charge\.dispute\.funds_reinstated':\s*await reconcileDisputes\(obj, 'webhook'\);/);
  assert.strictEqual((handler.match(/charge\.dispute\./g) || []).length, 5);
});

test('disputes queue with refunds and lock on the charge, across replicas too', () => {
  const fn = lift('reconcileDisputes');
  assert.match(fn, /oneRefundAtATime\(\(\) => withChargeLock\(key, \(\) => reconcileDisputeNow\(dispute, via, opts\)\)\)/);
  assert.match(fn, /typeof dispute\?\.charge === 'string' \? dispute\.charge/,
    'locked on the charge, so a refund and a dispute on one payment cannot book at once');
});

test('the hourly sweep checks disputes before anything that writes to a customer', () => {
  const at = (s) => { const i = src.indexOf(s); assert.notStrictEqual(i, -1, s + ' missing'); return i; };
  const disputes = at("await step('stripe disputes', reconcileRecentDisputes);");
  for (const later of ["await step('review asks'", "await step('deposit reminders'",
                       "await step('balance reminders'", "await step('reorder nudges'"]) {
    assert.ok(disputes < at(later), later + ' must come after the dispute check');
  }
});

test('the dispute record and the fee reference are created at startup', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS stripe_disputes \(/);
  assert.match(src, /close_alerted  BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(src, /ALTER TABLE expenses ADD COLUMN IF NOT EXISTS ext_ref TEXT/);
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS expenses_extref_uniq\s+ON expenses \(ext_ref\) WHERE ext_ref IS NOT NULL/,
    'what makes a retried fee a duplicate instead of a second $15');
});

/* ── nobody chases a customer who disputed ────────────────────────────────── */

test('the deposit, balance and reorder emails skip a disputed quote, open or decided', () => {
  const skip = /AND NOT EXISTS \(SELECT 1 FROM stripe_disputes d WHERE d\.quote_code = quotes\.code\)/;
  assert.match(lift('sendDepositReminders'), skip);
  assert.match(lift('sendBalanceReminders'), skip);
  assert.match(lift('sendReorderNudges'), /AND NOT EXISTS \(SELECT 1 FROM stripe_disputes d WHERE d\.quote_code = q\.code\)/,
    'reorder only looks at quotes paid in full, which an OPEN dispute still is');
});

function reviewDesk(disputed) {
  const updates = [], sentTo = [];
  const sandbox = {
    REVIEW_BATCH: 25,
    console: { log() {}, error() {} },
    isUnsubscribed: async () => false,
    refundedInFull: async () => false,
    requestReview: async (r) => { sentTo.push(r.email); },
    pool: {
      query(sql, args = []) {
        if (/SELECT \* FROM reviews/.test(sql)) {
          return Promise.resolve({ rows: [
            { id: 1, email: 'disputed@example.com', quote_code: 'Q_D' },
            { id: 2, email: 'studio@example.com', quote_code: null, order_ref: '77' },
            { id: 3, email: 'happy@example.com', quote_code: 'Q_OK' },
          ] });
        }
        if (/FROM stripe_disputes/.test(sql)) {
          const [code, ref] = args;
          return Promise.resolve({ rows: (code && disputed.quotes.includes(code)) || (ref && disputed.orders.includes(ref)) ? [{ '?column?': 1 }] : [] });
        }
        if (/^UPDATE reviews/.test(sql)) { updates.push({ sql, id: args[0] }); return Promise.resolve({ rows: [] }); }
        return Promise.reject(new Error('unexpected query: ' + sql.slice(0, 80)));
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([lift('disputeOn'), lift('sendDueReviewRequests')].join('\n'), sandbox);
  return { run: () => sandbox.sendDueReviewRequests(), updates, sentTo };
}

test('a customer who disputed is not asked for a review, on a quote or a studio order', async () => {
  const desk = reviewDesk({ quotes: ['Q_D'], orders: ['77'] });
  const summary = await desk.run();
  assert.strictEqual(desk.sentTo.join(','), 'happy@example.com');
  for (const id of [1, 2]) {
    const u = desk.updates.find((x) => x.id === id);
    assert.ok(u && /followup_sent_at=NOW\(\)/.test(u.sql), `review ${id} leaves the queue, follow-up included`);
  }
  assert.match(summary, /skipped\(refunded or disputed\)=2/);
});

test('the review follow-up checks for a dispute too', () => {
  /* Anchored on the call, not on the expression around it; that it stops the
     send is proved by running the sweep in reviews-page.test.js. */
  assert.match(lift('sendReviewFollowUps'), /await disputeOn\(r\)/);
});

test('the quote page stops asking for money from the day a dispute opens, and says what happened', () => {
  const at = src.indexOf("app.get('/q/:code',");
  const page = src.slice(at, src.indexOf('app.get(', at + 20));
  assert.match(page, /EXISTS \(SELECT 1 FROM stripe_disputes WHERE quote_code = \$1\) AS disputed/);
  assert.match(page, /const stopAsking = refunded \|\| disputed;/);
  assert.match(page, /\$\{\(paid && balanceDue > 0 && !stopAsking(?: && !certLock)?\) \?/, 'no "Balance due" card');
  assert.match(page, /paid \|\| q\.requested_items \|\| q\.cancelled_at \|\| stopAsking \? '' : accepted \?/,
    'no deposit card and no accept form');
  assert.match(page, /Reversed by your card issuer/);
  assert.match(page, /Payment reversed — \$\{money\(reversedByIssuer\)\}/);
  assert.doesNotMatch(page, /!refunded\b/, 'no gate still reads the refund alone');
});

/* ── the board ────────────────────────────────────────────────────────────── */

function chip(d) {
  const sandbox = { dayShort: (x) => (x ? 'Oct 3' : '') };
  vm.createContext(sandbox);
  vm.runInContext([MONEY, lift('disputeChip')].join('\n'), sandbox);
  return sandbox.disputeChip(d);
}

test('a disputed job says hold, with the respond-by date; a lost one says so', () => {
  assert.strictEqual(chip(null), '');
  assert.match(chip({ status: 'needs_response', amount: '52.00', evidence_due: new Date() }),
    /Disputed \$52\.00 &middot; respond by Oct 3 &mdash; hold/);
  assert.match(chip({ status: 'lost', amount: '52.00', evidence_due: new Date() }), /Chargeback lost \$52\.00/);
});

test('the board shows disputes on production cards and on studio orders', () => {
  assert.match(src, /\$\{disputes\.byQuote\.has\(q\.code\) \? `<div style="margin-top:4px">\$\{disputeChip\(disputes\.byQuote\.get\(q\.code\)\)\}<\/div>` : ''\}/);
  assert.match(lift('studioOrdersSection'), /disputes \? disputeChip\(disputes\.byOrder\.get\(String\(o\.id\)\)\) : ''/);
  assert.match(lift('boardDisputes'), /WHERE status NOT IN \('won', 'warning_closed'\)/,
    'open and lost ones; a won dispute or a closed inquiry needs nothing from the shop');
  assert.strictEqual((src.match(/const disputes = await boardDisputes\(\);/g) || []).length, 2,
    'both pages that show studio orders load them');
});

test('a chargeback row is labelled as one in the books', () => {
  assert.match(src, /p\.kind === 'dispute' \? 'Chargeback'/);
  assert.match(src, /u\.kind === 'dispute' \? '<span style="color:#b91c1c"> \(chargeback\)<\/span>'/);
});
