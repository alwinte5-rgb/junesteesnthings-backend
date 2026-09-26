'use strict';

/* Refunds from Stripe: booked once each, for what is new, and never chased.
 *
 * charge.refunded carries the CHARGE, and a charge's amount_refunded is the
 * running total of every refund on it, not the refund that just happened. The
 * handler booked that running total as if it were the new refund, so a second
 * partial refund on one charge booked the first one again: $10 and then $5
 * back wrote −$10 and −$15, and the quote read $10 less paid than it was.
 *
 * A refund also changes what a customer appears to owe, so everything that
 * chases payment on its own has to know one happened: the deposit and balance
 * nudges, and the review ask that was queued when the money first landed.
 *
 * Nothing here has a Postgres, so the ledger is answered in memory, query by
 * query. The SQL was run against a real Postgres when this was written.
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
   parameter list is stepped over first: a destructured `({ a, b })` opens with
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

/* The one-line helpers the refund path calls, taken from server.js rather than
   copied, so a change to either is a change to what is tested. */
function line(re, what) {
  const m = re.exec(src);
  assert.ok(m, `${what} not found in server.js`);
  return m[0];
}
const ROUND2 = line(/^const round2 = .*;$/m, 'round2');
const MONEY = line(/^const money = .*;$/m, 'money');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* ── The handler, against a ledger in memory ─────────────────────────────── */

/* `quotePayments` and `unlinked` are the ORIGINAL payments; `booked` collects
   every refund row the handler writes, in order, and is also what the
   "already booked" query reads back — so a sequence of events behaves the way
   it would against the real tables. */
function refundDesk({ quotePayments = [], unlinked = [] } = {}) {
  const booked = [];
  const alerts = [];
  const bookedCents = (chargeId) => booked
    .filter((r) => r.extRef.split(':')[0] === chargeId)
    .reduce((max, r) => Math.max(max, Number(r.extRef.split(':')[1])), 0);

  const pool = {
    query(sql, args = []) {
      if (/split_part\(ext_ref, ':', 1\) = \$1/.test(sql)) {
        return Promise.resolve({ rows: [{ cents: String(bookedCents(args[0])) }] });
      }
      if (/FROM quote_payments WHERE stripe_pi = \$1 AND amount > 0/.test(sql)) {
        const mine = quotePayments.filter((p) => p.pi === args[0]);
        return Promise.resolve({ rows: mine.length ? [{
          quote_code: mine[0].code,
          applied: String(mine.reduce((s, p) => s + p.amount, 0)),   // NUMERIC arrives as text
          fee: String(mine.reduce((s, p) => s + p.fee, 0)),
        }] : [] });
      }
      if (/FROM unlinked_payments WHERE stripe_pi = \$1 AND amount > 0/.test(sql)) {
        return Promise.resolve({ rows: unlinked.filter((u) => u.stripe_pi === args[0]).slice(0, 1) });
      }
      return Promise.reject(new Error('unexpected query: ' + sql.trim().slice(0, 90)));
    },
  };

  const sandbox = {
    pool,
    console: { log() {}, warn() {}, error() {} },
    escEmail: (s) => String(s),
    quoteLink: (code) => 'https://www.jtees.net/q/' + code,
    alertShop: async (subject, html) => { alerts.push({ subject, html }); },
    /* Both writers are idempotent on ext_ref in the real tables. */
    recordPayment: async (p) => {
      if (booked.some((r) => r.extRef === p.extRef)) return { ok: false, duplicate: true, paid: null };
      booked.push({ ledger: 'quote', code: p.code, amount: p.amount, fee: p.fee,
                    kind: p.kind, extRef: p.extRef });
      const code = p.code;
      const paid = quotePayments.filter((q) => q.code === code).reduce((s, q) => s + q.amount, 0) +
                   booked.filter((r) => r.code === code).reduce((s, r) => s + r.amount, 0);
      return { ok: true, duplicate: false, paid: round2(paid) };
    },
    recordUnlinkedPayment: async (session, reason, opts) => {
      if (booked.some((r) => r.extRef === opts.extRef)) return { ok: true, duplicate: true };
      booked.push({ ledger: 'unlinked', amount: opts.amount, taxPortion: opts.taxPortion,
                    kind: opts.kind, extRef: opts.extRef,
                    orderRef: session.metadata && session.metadata.order_id });
      return { ok: true, duplicate: false, amount: opts.amount };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([ROUND2, MONEY, lift('refundCentsBooked'), lift('recordStripeRefund')].join('\n'), sandbox);
  return { refund: sandbox.recordStripeRefund, booked, alerts };
}

const charge = (id, pi, cents) =>
  ({ id, object: 'charge', payment_intent: pi, amount_refunded: cents, currency: 'usd' });
const gross = (r) => round2(-(r.amount + (r.fee || 0)));
const sum = (rows, key) => round2(rows.reduce((s, r) => s + (r[key] || 0), 0));

/* A $50 quote payment by card: $52 charged, $2 of it the 4% card fee. */
const CARD_50 = { code: 'Q1', pi: 'pi_1', amount: 50, fee: 2 };

test('a second partial refund on one charge books only the new part', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50] });
  await desk.refund(charge('ch_1', 'pi_1', 1000));   // $10 back
  await desk.refund(charge('ch_1', 'pi_1', 1500));   // $5 more: the charge now says $15

  assert.strictEqual(desk.booked.length, 2);
  assert.strictEqual(gross(desk.booked[0]), 10);
  assert.strictEqual(gross(desk.booked[1]), 5,
    'amount_refunded is a running total; booking it whole re-books the first $10');
  assert.strictEqual(desk.booked[1].extRef, 'ch_1:1500',
    'ext_ref keeps carrying the running total, which is what the next refund reads back');
});

test('a retried or late event books nothing', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50] });
  await desk.refund(charge('ch_1', 'pi_1', 1500));   // the newer event lands first
  await desk.refund(charge('ch_1', 'pi_1', 1000));   // the older one arrives late
  await desk.refund(charge('ch_1', 'pi_1', 1500));   // Stripe retries the newer one

  assert.strictEqual(desk.booked.length, 1);
  assert.strictEqual(gross(desk.booked[0]), 15);
  assert.strictEqual(desk.alerts.length, 1, 'one refund, one email to the shop');
});

test('refunded in full across several refunds puts back exactly what was paid', async () => {
  /* Rounded refund by refund, $10 + $5 + $37 came to $50.01 of net. */
  const desk = refundDesk({ quotePayments: [CARD_50] });
  for (const cents of [1000, 1500, 5200]) await desk.refund(charge('ch_1', 'pi_1', cents));

  assert.strictEqual(sum(desk.booked, 'amount'), -50, 'the quote is back to exactly $0 paid');
  assert.strictEqual(sum(desk.booked, 'fee'), -2, 'and the card fee comes back out with it');
});

test('a payment with no card fee is refunded without inventing one', async () => {
  /* The old split divided by today's CARD_FEE whatever the payment had
     carried, which left 4% of a fee-free payment sitting on the quote. */
  const desk = refundDesk({ quotePayments: [{ code: 'Q2', pi: 'pi_2', amount: 40, fee: 0 }] });
  await desk.refund(charge('ch_2', 'pi_2', 4000));
  assert.strictEqual(desk.booked[0].amount, -40);
  assert.ok(desk.booked[0].fee === 0, 'no fee to give back (-0 and 0 are the same NUMERIC)');
});

test('the shop is told how much has come back in all, once there is more than one refund', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50] });
  await desk.refund(charge('ch_1', 'pi_1', 1000));
  await desk.refund(charge('ch_1', 'pi_1', 1500));

  assert.match(desk.alerts[1].subject, /quote Q1, \$5\.00$/, 'the subject names this refund, not the total');
  assert.match(desk.alerts[1].html, /\$15\.00 refunded on this payment in all/);
  assert.doesNotMatch(desk.alerts[0].html, /in all/, 'a first refund has nothing to add up');
});

test('the unlinked ledger books the new part, and its tax adds back up exactly', async () => {
  /* Design studio order #10: $35.75 with $2.77 of sales tax stamped on it. */
  const desk = refundDesk({ unlinked: [{ id: 7, stripe_pi: 'pi_3', amount: '35.75', tax_portion: '2.77',
    order_ref: '10', client_ref: '10', customer_email: 'a@example.com', customer_name: 'A' }] });
  await desk.refund(charge('ch_3', 'pi_3', 1000));
  await desk.refund(charge('ch_3', 'pi_3', 3575));

  assert.strictEqual(desk.booked[0].amount, -10);
  assert.strictEqual(desk.booked[1].amount, -25.75);
  assert.strictEqual(desk.booked[0].taxPortion, -0.77);
  assert.strictEqual(sum(desk.booked, 'taxPortion'), -2.77,
    'a refund in full returns exactly the tax the payment carried');
  assert.strictEqual(desk.booked[1].orderRef, '10', 'the refund stays attached to its studio order');
});

test('a tax nobody knew stays unknown on the refund', async () => {
  const desk = refundDesk({ unlinked: [{ id: 8, stripe_pi: 'pi_4', amount: '0.57', tax_portion: null,
    order_ref: null, client_ref: 'E7BE52' }] });
  await desk.refund(charge('ch_4', 'pi_4', 57));
  assert.strictEqual(desk.booked[0].amount, -0.57);
  assert.strictEqual(desk.booked[0].taxPortion, null, 'NULL means unknown; 0 would assert none was collected');
});

test('a refund on a charge neither ledger holds writes nothing', async () => {
  const desk = refundDesk();
  await desk.refund(charge('ch_9', 'pi_9', 500));
  assert.strictEqual(desk.booked.length, 0);
  assert.strictEqual(desk.alerts.length, 0);
});

/* ── One charge at a time ─────────────────────────────────────────────────── */

function refundQueue() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext([line(/^const refundQueues = new Map\(\);$/m, 'refundQueues'),
                   lift('oneRefundAtATime')].join('\n'), sandbox);
  return { queue: sandbox.oneRefundAtATime, size: () => vm.runInContext('refundQueues.size', sandbox) };
}

test('refunds on one charge wait for each other; other charges do not', async () => {
  /* Two refunds on one charge handled at once would both read the same
     "already booked" total and book the overlap twice. */
  const { queue, size } = refundQueue();
  const order = [];
  let release;
  const first = queue('ch_1', () => new Promise((done) => {
    order.push('first starts');
    release = () => { order.push('first ends'); done(); };
  }));
  const second = queue('ch_1', async () => { order.push('second'); });
  const other = queue('ch_2', async () => { order.push('other charge'); });

  await new Promise((r) => setImmediate(r));
  assert.strictEqual(order.join(' | '), 'first starts | other charge',
    'the second refund on ch_1 must not start while the first is still booking');

  release();
  await Promise.all([first, second, other]);
  assert.strictEqual(order.join(' | '), 'first starts | other charge | first ends | second');
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(size(), 0, 'a finished charge leaves nothing behind in memory');
});

test('a failed refund still fails for Stripe, and does not jam the charge', async () => {
  const { queue } = refundQueue();
  const failing = queue('ch_3', async () => { throw new Error('database restarting'); });
  const next = queue('ch_3', async () => 'booked');

  await assert.rejects(failing, /database restarting/,
    'the webhook answers 500 on this, which is what makes Stripe retry');
  assert.strictEqual(await next, 'booked');
});

/* ── Nobody is chased for money that was refunded ───────────────────────── */

test('neither payment nudge goes to a quote that has had a refund', () => {
  /* Refunded in full reads as never paid, which the deposit nudge answered
     with "pay your deposit"; a partial refund leaves paid below total, which
     the balance nudge answered with the refunded amount as a balance due. */
  for (const name of ['sendDepositReminders', 'sendBalanceReminders']) {
    assert.match(lift(name),
      /AND NOT EXISTS \(SELECT 1 FROM quote_payments p\s+WHERE p\.quote_code = quotes\.code AND p\.kind = 'refund'\)/,
      `${name} must skip a quote with a refund on its ledger`);
  }
});

function fullRefundCheck(answers) {
  const asked = [];
  const sandbox = {
    pool: {
      query(sql, args) {
        asked.push({ table: /FROM quote_payments/.test(sql) ? 'quote_payments'
                          : /FROM unlinked_payments/.test(sql) ? 'unlinked_payments' : '?',
                     key: args[0] });
        return Promise.resolve({ rows: [answers[args[0]]] });
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(lift('refundedInFull'), sandbox);
  return { refundedInFull: sandbox.refundedInFull, asked };
}

test('refunded in full means a refund happened and nothing is left paid', async () => {
  const { refundedInFull, asked } = fullRefundCheck({
    Q_FULL: { net: '0.00', refunded: true },
    Q_PART: { net: '30.00', refunded: true },     // the job went ahead
    Q_NONE: { net: '0', refunded: null },         // BOOL_OR over no rows is NULL
    '10':   { net: '0.00', refunded: true },
  });
  assert.strictEqual(await refundedInFull({ quote_code: 'Q_FULL' }), true);
  assert.strictEqual(await refundedInFull({ quote_code: 'Q_PART' }), false);
  assert.strictEqual(await refundedInFull({ quote_code: 'Q_NONE' }), false,
    'never paid is not refunded — that ask is none of this check\'s business');
  assert.strictEqual(await refundedInFull({ order_ref: '10' }), true);
  assert.strictEqual(asked[3].table, 'unlinked_payments',
    'studio orders are booked on the unlinked ledger, so that is where their refunds are');
  assert.strictEqual(await refundedInFull({}), false);
  assert.strictEqual(asked.length, 4, 'a review with no quote or order asks the database nothing');
});

test('a review ask is not sent for a job refunded in full, and cannot come back as a follow-up', async () => {
  const updates = [];
  const sentTo = [];
  const sandbox = {
    REVIEW_BATCH: 25,
    console: { log() {}, error() {} },
    isUnsubscribed: async () => false,
    requestReview: async (r) => { sentTo.push(r.email); },
    pool: {
      query(sql, args = []) {
        if (/SELECT \* FROM reviews/.test(sql)) {
          return Promise.resolve({ rows: [
            { id: 1, email: 'refunded@example.com', quote_code: 'Q_FULL' },
            { id: 2, email: 'happy@example.com', quote_code: 'Q_PAID' },
          ] });
        }
        if (/FROM quote_payments WHERE quote_code/.test(sql)) {
          return Promise.resolve({ rows: [args[0] === 'Q_FULL'
            ? { net: '0.00', refunded: true } : { net: '120.00', refunded: false }] });
        }
        if (/^UPDATE reviews/.test(sql)) { updates.push({ sql, id: args[0] }); return Promise.resolve({ rows: [] }); }
        return Promise.reject(new Error('unexpected query: ' + sql.slice(0, 80)));
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([lift('refundedInFull'), lift('sendDueReviewRequests')].join('\n'), sandbox);
  const summary = await sandbox.sendDueReviewRequests();

  assert.strictEqual(sentTo.join(','), 'happy@example.com');
  const stamp = updates.find((u) => u.id === 1);
  assert.ok(stamp, 'the refunded ask has to leave the queue, or it is reconsidered every hour');
  assert.match(stamp.sql, /followup_sent_at=NOW\(\)/, 'and the follow-up sweep must never pick it up');
  assert.match(summary, /skipped\(refunded\)=1/, 'the nightly digest says why one was not sent');
});

test('the follow-up sweep checks for a refund too', () => {
  /* The first ask can go out before the refund does; the follow-up is days
     later and has to see it. */
  assert.match(lift('sendReviewFollowUps'), /await isUnsubscribed\(r\.email\) \|\| await refundedInFull\(r\)/);
});
