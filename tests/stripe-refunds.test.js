'use strict';

/* Refunds from Stripe: the books follow Stripe, and nobody is chased for the money.
 *
 * charge.refunded carries the CHARGE, and a charge's amount_refunded is the
 * running total of every refund on it, not the refund that just happened. The
 * handler booked that running total as if it were the new refund, so a second
 * partial refund on one charge booked the first one again. Events also arrive
 * late, out of order and twice; a refund can FAIL after it was issued; and a
 * webhook can be missed. So a refund event (and an hourly sweep) now reconciles
 * the charge: what Stripe says is refunded now, minus what the ledgers hold.
 *
 * A refund also changes what a customer appears to owe, so everything that
 * asks for payment on its own has to know one happened: the deposit and
 * balance nudges, the review ask queued when the money landed, and the quote
 * page itself.
 *
 * Nothing here has a Postgres or a Stripe, so both are answered in memory,
 * call by call, the way the real ones answer. The SQL was also run against a
 * real Postgres, and the whole path through a running server, when this was
 * written.
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

/* ── A charge, a Stripe and a ledger, all in memory ─────────────────────── */

/* `quotePayments` and `unlinked` are the ORIGINAL payments. `stripe` is what
   Stripe holds: charge id -> its refunds, which a test edits between calls the
   way refunds happen in the Dashboard. `booked` collects every row the
   reconcile writes, and is also what the "already booked" query reads back. */
function refundDesk({ quotePayments = [], unlinked = [], stripe = {}, key = 'sk_test_x' } = {}) {
  const booked = [];
  const alerts = [];
  const synced = [];
  const calls = [];
  const rowsFor = (chargeId) => booked.filter((r) => r.extRef.split(':')[0] === chargeId);

  const pool = {
    query(sql, args = []) {
      if (/split_part\(ext_ref, ':', 1\) = \$1/.test(sql)) {
        const mine = rowsFor(args[0]);
        const cents = Math.round(-mine.reduce((s, r) => s + r.amount + (r.fee || 0), 0) * 100);
        return Promise.resolve({ rows: [{ cents: String(cents), n: String(mine.length) }] });
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

  /* Stripe's GET /v1/refunds, by charge or by date, one page. */
  const fetch = async (url, opts) => {
    const u = new URL(url);
    calls.push({ url, auth: opts && opts.headers && opts.headers.Authorization });
    if (stripe.failWith) return { ok: false, status: stripe.failWith.status, json: async () => ({ error: { message: stripe.failWith.message } }) };
    assert.strictEqual(u.origin + u.pathname, 'https://api.stripe.com/v1/refunds');
    const charge = u.searchParams.get('charge');
    const all = Object.entries(stripe.refunds || {}).flatMap(([ch, list]) =>
      list.map((x, i) => ({ id: `re_${ch}_${i}`, charge: ch, payment_intent: stripe.pi && stripe.pi[ch], currency: 'usd', ...x })));
    return { ok: true, status: 200, json: async () => ({ has_more: false, data: charge ? all.filter((x) => x.charge === charge) : all }) };
  };

  const sandbox = {
    pool, fetch, URL, URLSearchParams, AbortSignal,
    process: { env: key ? { STRIPE_SECRET_KEY: key } : {} },
    console: { log() {}, warn() {}, error() {} },
    escEmail: (s) => String(s),
    quoteLink: (code) => 'https://www.jtees.net/q/' + code,
    alertShop: async (subject, html) => { alerts.push({ subject, html }); },
    syncPaidAmount: async (code) => { synced.push(code); },
    /* Both writers are idempotent on ext_ref in the real tables. */
    recordPayment: async (p) => {
      if (booked.some((r) => r.extRef === p.extRef)) return { ok: false, duplicate: true, paid: null };
      booked.push({ ledger: 'quote', code: p.code, amount: p.amount, fee: p.fee, kind: p.kind,
                    extRef: p.extRef, note: p.note });
      const code = p.code;
      const paid = quotePayments.filter((q) => q.code === code).reduce((s, q) => s + q.amount, 0) +
                   booked.filter((r) => r.code === code).reduce((s, r) => s + r.amount, 0);
      return { ok: true, duplicate: false, paid: round2(paid) };
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
  vm.runInContext([ROUND2, MONEY, lift('stripeListAll'), lift('refundedOnCharge'),
                   lift('refundCentsBooked'), lift('movedShare'), lift('reconcileChargeRefunds'),
                   /* The sweep calls the queued, locked wrapper; the queue and
                      the lock have tests of their own below. */
                   'function reconcileRefunds(charge, via) { return reconcileChargeRefunds(charge, via); }',
                   lift('reconcileRecentRefunds')].join('\n'), sandbox);
  return {
    reconcile: (charge, via) => sandbox.reconcileChargeRefunds(charge, via),
    sweep: () => sandbox.reconcileRecentRefunds(),
    booked, alerts, synced, calls, stripe,
  };
}

/* A charge as a webhook carries it. The reconcile asks Stripe for the refunds,
   so amount_refunded here only matters when there is no key. */
const charge = (id, pi, cents = 0) =>
  ({ id, object: 'charge', payment_intent: pi, amount_refunded: cents, currency: 'usd' });
const gross = (r) => round2(-(r.amount + (r.fee || 0)));
const sum = (rows, key) => round2(rows.reduce((s, r) => s + (r[key] || 0), 0));

/* A $50 quote payment by card: $52 charged, $2 of it the 4% card fee. */
const CARD_50 = { code: 'Q1', pi: 'pi_1', amount: 50, fee: 2 };
const refund = (cents, status = 'succeeded') => ({ amount: cents, status });

test('a second partial refund on one charge books only the new part', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { refunds: { ch_1: [refund(1000)] } } });
  await desk.reconcile(charge('ch_1', 'pi_1', 1000));
  desk.stripe.refunds.ch_1.push(refund(500));
  await desk.reconcile(charge('ch_1', 'pi_1', 1500));   // the charge now says $15 in all

  assert.strictEqual(desk.booked.length, 2);
  assert.strictEqual(gross(desk.booked[0]), 10);
  assert.strictEqual(gross(desk.booked[1]), 5,
    'amount_refunded is a running total; booking it whole re-books the first $10');
});

test('a retried, late or out-of-order event books nothing new', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { refunds: { ch_1: [refund(1000), refund(500)] } } });
  await desk.reconcile(charge('ch_1', 'pi_1', 1500));   // the newer event lands first
  await desk.reconcile(charge('ch_1', 'pi_1', 1000));   // the older one arrives late
  await desk.reconcile(charge('ch_1', 'pi_1', 1500));   // Stripe retries the newer one

  assert.strictEqual(desk.booked.length, 1);
  assert.strictEqual(gross(desk.booked[0]), 15);
  assert.strictEqual(desk.alerts.length, 1, 'one refund, one email to the shop');
  assert.deepStrictEqual([...desk.synced], ['Q1', 'Q1'],
    'a retry re-derives the quote\'s paid figure, so a rollup that failed first time heals');
});

test('refunded in full across several refunds puts back exactly what was paid', async () => {
  /* Rounded refund by refund, $10 + $5 + $37 came to $50.01 of net. */
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { refunds: { ch_1: [] } } });
  for (const cents of [1000, 500, 3700]) {
    desk.stripe.refunds.ch_1.push(refund(cents));
    await desk.reconcile(charge('ch_1', 'pi_1'));
  }
  assert.strictEqual(sum(desk.booked, 'amount'), -50, 'the quote is back to exactly $0 paid');
  assert.strictEqual(sum(desk.booked, 'fee'), -2, 'and the card fee comes back out with it');
});

test('a payment with no card fee is refunded without inventing one', async () => {
  /* The old split divided by today's CARD_FEE whatever the payment had
     carried, which left 4% of a fee-free payment sitting on the quote. */
  const desk = refundDesk({ quotePayments: [{ code: 'Q2', pi: 'pi_2', amount: 40, fee: 0 }],
                            stripe: { refunds: { ch_2: [refund(4000)] } } });
  await desk.reconcile(charge('ch_2', 'pi_2'));
  assert.strictEqual(desk.booked[0].amount, -40);
  assert.ok(desk.booked[0].fee === 0, 'no fee to give back (-0 and 0 are the same NUMERIC)');
});

test('a refund that fails at the bank comes back onto the quote, and the shop is told', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { refunds: { ch_1: [refund(1000)] } } });
  await desk.reconcile(charge('ch_1', 'pi_1'));
  desk.stripe.refunds.ch_1[0].status = 'failed';          // the card was closed
  await desk.reconcile({ id: 'ch_1', payment_intent: 'pi_1', amount_refunded: null });

  const back = desk.booked[1];
  assert.strictEqual(gross(back), -10, 'the $10 is money in again, not money out');
  assert.strictEqual(back.kind, 'correction', 'it is not a refund, so it must not read as one');
  assert.strictEqual(sum(desk.booked, 'amount'), 0, 'the quote is back to what it was before the refund');
  assert.match(desk.alerts[1].subject, /Refund failed — quote Q1, \$10\.00 came back/);
  assert.match(desk.alerts[1].html, /customer has not been refunded/);
});

test('a refund issued again after one failed is booked, not mistaken for the old one', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { refunds: { ch_1: [refund(1000)] } } });
  await desk.reconcile(charge('ch_1', 'pi_1'));
  desk.stripe.refunds.ch_1[0].status = 'failed';
  await desk.reconcile(charge('ch_1', 'pi_1'));
  desk.stripe.refunds.ch_1.push(refund(1000));            // the shop re-issues the same $10
  await desk.reconcile(charge('ch_1', 'pi_1', 1000));

  assert.strictEqual(desk.booked.length, 3);
  assert.strictEqual(gross(desk.booked[2]), 10);
  assert.strictEqual(new Set(desk.booked.map((r) => r.extRef)).size, 3,
    'the same running total twice must still be two rows, or the second is dropped as a duplicate');
});

test('the shop is told how much has come back in all, once there is more than one refund', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { refunds: { ch_1: [refund(1000)] } } });
  await desk.reconcile(charge('ch_1', 'pi_1'));
  desk.stripe.refunds.ch_1.push(refund(500));
  await desk.reconcile(charge('ch_1', 'pi_1'));

  assert.match(desk.alerts[1].subject, /quote Q1, \$5\.00$/, 'the subject names this refund, not the total');
  assert.match(desk.alerts[1].html, /\$15\.00 refunded on this payment in all/);
  assert.doesNotMatch(desk.alerts[0].html, /in all/, 'a first refund has nothing to add up');
});

test('the unlinked ledger books the new part, and its tax goes out and comes back exactly', async () => {
  /* Design studio order #10: $35.75 with $2.77 of sales tax stamped on it. */
  const desk = refundDesk({
    unlinked: [{ id: 7, stripe_pi: 'pi_3', amount: '35.75', tax_portion: '2.77',
                 order_ref: '10', client_ref: '10', customer_email: 'a@example.com', customer_name: 'A' }],
    stripe: { refunds: { ch_3: [refund(1000)] } } });
  await desk.reconcile(charge('ch_3', 'pi_3'));
  desk.stripe.refunds.ch_3.push(refund(2575));
  await desk.reconcile(charge('ch_3', 'pi_3'));

  assert.strictEqual(desk.booked[0].amount, -10);
  assert.strictEqual(desk.booked[1].amount, -25.75);
  assert.strictEqual(desk.booked[0].taxPortion, -0.77);
  assert.strictEqual(sum(desk.booked, 'taxPortion'), -2.77,
    'a refund in full returns exactly the tax the payment carried');
  assert.strictEqual(desk.booked[1].orderRef, '10', 'the refund stays attached to its studio order');

  desk.stripe.refunds.ch_3[1].status = 'failed';
  await desk.reconcile(charge('ch_3', 'pi_3'));
  assert.strictEqual(desk.booked[2].amount, 25.75);
  assert.strictEqual(desk.booked[2].taxPortion, 2, 'a failed refund brings its tax back in');
  assert.match(desk.alerts[2].subject, /Refund failed — design studio order #10/);
});

test('a tax nobody knew stays unknown on the refund', async () => {
  const desk = refundDesk({
    unlinked: [{ id: 8, stripe_pi: 'pi_4', amount: '0.57', tax_portion: null, order_ref: null, client_ref: 'E7BE52' }],
    stripe: { refunds: { ch_4: [refund(57)] } } });
  await desk.reconcile(charge('ch_4', 'pi_4'));
  assert.strictEqual(desk.booked[0].amount, -0.57);
  assert.strictEqual(desk.booked[0].taxPortion, null, 'NULL means unknown; 0 would assert none was collected');
});

test('a refund on a charge neither ledger holds writes nothing', async () => {
  const desk = refundDesk({ stripe: { refunds: { ch_9: [refund(500)] } } });
  const out = await desk.reconcile(charge('ch_9', 'pi_9'));
  assert.strictEqual(out.skipped, 'in neither ledger');
  assert.strictEqual(desk.booked.length, 0);
  assert.strictEqual(desk.alerts.length, 0);
});

test('any Stripe-shaped charge id is reconciled; only an unusable one is skipped, out loud', async () => {
  /* The first version checked the id against ^(ch|py)_[A-Za-z0-9]+$ and
     quietly returned on anything else, so a run with an id it did not expect
     booked no refund at all and answered Stripe 200. Found by running the
     server end to end, not by these tests. */
  const desk = refundDesk({ quotePayments: [{ code: 'Q1', pi: 'pi_1', amount: 50, fee: 2 }],
                            stripe: { refunds: { ch_3Ab_cd9: [{ amount: 1000, status: 'succeeded' }] } } });
  await desk.reconcile({ id: 'ch_3Ab_cd9', payment_intent: 'pi_1', amount_refunded: 1000 });
  assert.strictEqual(desk.booked.length, 1, 'an extra underscore is still a charge');

  const warned = [];
  const sandbox = { console: { warn: (m) => warned.push(m) } };
  vm.createContext(sandbox);
  vm.runInContext(lift('reconcileChargeRefunds'), sandbox);
  const out = await sandbox.reconcileChargeRefunds({ id: 'ch_1:2', payment_intent: 'pi_1' });
  assert.strictEqual(out.skipped, 'not a charge', 'a colon would corrupt the ledger key, so that one is refused');
  assert.match(warned[0], /unusable charge id "ch_1:2"/, 'and the skip is logged, never silent');
});

test('Stripe is asked, with the key, for that charge\'s refunds', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { refunds: { ch_1: [refund(1000)] } } });
  await desk.reconcile(charge('ch_1', 'pi_1', 999999));   // the event's figure is not trusted
  assert.strictEqual(gross(desk.booked[0]), 10);
  const u = new URL(desk.calls[0].url);
  assert.strictEqual(u.searchParams.get('charge'), 'ch_1');
  assert.strictEqual(desk.calls[0].auth, 'Bearer sk_test_x');
});

test('when Stripe cannot be asked, the webhook fails loudly so Stripe retries', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], stripe: { failWith: { status: 401, message: 'Invalid API Key provided' } } });
  await assert.rejects(desk.reconcile(charge('ch_1', 'pi_1', 1000)),
    /Stripe GET \/v1\/refunds 401: Invalid API Key provided/,
    'the error names the service, the call and Stripe\'s own message');
  assert.strictEqual(desk.booked.length, 0);
});

test('without a key the event\'s own running total is used, and a refund object is left for the sweep', async () => {
  const desk = refundDesk({ quotePayments: [CARD_50], key: null });
  await desk.reconcile(charge('ch_1', 'pi_1', 1000));
  assert.strictEqual(gross(desk.booked[0]), 10);
  const out = await desk.reconcile({ id: 'ch_1', payment_intent: 'pi_1', amount_refunded: null });
  assert.strictEqual(out.skipped, 'no key to ask Stripe',
    'a refund object carries no running total; guessing 0 would reverse every refund on the charge');
  assert.strictEqual(desk.booked.length, 1);
});

test('the hourly sweep books what the webhooks missed, and says so', async () => {
  const desk = refundDesk({
    quotePayments: [CARD_50, { code: 'Q2', pi: 'pi_2', amount: 40, fee: 0 }],
    stripe: { refunds: { ch_1: [refund(1000)], ch_2: [refund(4000)] }, pi: { ch_1: 'pi_1', ch_2: 'pi_2' } } });
  await desk.reconcile(charge('ch_1', 'pi_1'));          // this one's webhook arrived; ch_2's did not

  const summary = await desk.sweep();
  assert.strictEqual(desk.booked.length, 2);
  assert.strictEqual(desk.booked[1].code, 'Q2');
  assert.match(summary, /2 refunded charge\(s\) checked, 1 brought into line/);
  assert.match(desk.alerts[1].html, /hourly check against Stripe; no webhook for it arrived/);
  assert.strictEqual(await desk.sweep(), '', 'an hour with nothing to do says nothing');
});

test('the sweep does nothing without a key', async () => {
  const desk = refundDesk({ key: null });
  assert.match(await desk.sweep(), /STRIPE_SECRET_KEY is not set/);
  assert.strictEqual(desk.calls.length, 0);
});

/* ── Where refund events are routed ─────────────────────────────────────── */

test('refund events reach the reconcile, whichever kind the endpoint sends', async () => {
  const seen = [];
  const sandbox = {
    console: { log() {}, warn() {} },
    reconcileRefunds: async (c, via) => { seen.push(`${c.id}|${c.payment_intent}|${c.amount_refunded}|${via}`); },
  };
  vm.createContext(sandbox);
  vm.runInContext(lift('handleStripeEvent'), sandbox);
  await sandbox.handleStripeEvent({ type: 'charge.refunded',
    data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount_refunded: 1500 } } });
  for (const type of ['charge.refund.updated', 'refund.updated', 'refund.failed', 'refund.created']) {
    await sandbox.handleStripeEvent({ type,
      data: { object: { id: 're_1', object: 'refund', charge: 'ch_1', payment_intent: 'pi_1', status: 'failed' } } });
  }
  assert.strictEqual(seen[0], 'ch_1|pi_1|1500|webhook');
  assert.strictEqual(seen.length, 5);
  assert.ok(seen.slice(1).every((s) => s === 'ch_1|pi_1|null|webhook'),
    'a refund object is reconciled by its charge, with no running total to trust');
});

test('the sweep runs before anything that asks a customer for money or a review', () => {
  const at = (name) => src.indexOf(`await step('${name}'`);
  assert.ok(at('stripe refunds') > 0, 'the refund sweep is scheduled');
  for (const later of ['review asks', 'deposit reminders', 'balance reminders']) {
    assert.ok(at('stripe refunds') < at(later), `a missed refund must be booked before ${later} run`);
  }
});

/* ── One at a time ──────────────────────────────────────────────────────── */

function refundLine() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext([line(/^let refundChain = Promise\.resolve\(\);$/m, 'refundChain'),
                   lift('oneRefundAtATime')].join('\n'), sandbox);
  return sandbox.oneRefundAtATime;
}

test('refunds are reconciled one at a time', async () => {
  /* Two reconciles of one charge at once would both read the same "already
     booked" total and book the gap twice; and every reconcile holds a pool
     connection for its lock, so a burst of them must not run side by side. */
  const queue = refundLine();
  const order = [];
  let release;
  const first = queue(() => new Promise((done) => {
    order.push('first starts');
    release = () => { order.push('first ends'); done(); };
  }));
  const second = queue(async () => { order.push('second'); });

  await new Promise((r) => setImmediate(r));
  assert.strictEqual(order.join(' | '), 'first starts', 'the second must wait for the first');
  release();
  await Promise.all([first, second]);
  assert.strictEqual(order.join(' | '), 'first starts | first ends | second');
});

test('a failed reconcile still fails for Stripe, and does not jam the line', async () => {
  const queue = refundLine();
  const failing = queue(async () => { throw new Error('database restarting'); });
  const next = queue(async () => 'booked');
  await assert.rejects(failing, /database restarting/,
    'the webhook answers 500 on this, which is what makes Stripe retry');
  assert.strictEqual(await next, 'booked');
});

function lockedRun(fn, { rollbackFails = false } = {}) {
  const said = [];
  let released;
  const client = {
    query: async (sql, args) => {
      said.push(args ? `${sql} [${args}]` : sql);
      if (sql === 'ROLLBACK' && rollbackFails) throw new Error('connection gone');
    },
    release: (destroy) => { released = destroy; },
  };
  const sandbox = { pool: { connect: async () => client } };
  vm.createContext(sandbox);
  vm.runInContext(lift('withChargeLock'), sandbox);
  return { run: sandbox.withChargeLock('ch_1', fn), said, released: () => released };
}

test('the charge is locked in the database for as long as it is being booked', async () => {
  const t = lockedRun(async () => 'done');
  assert.strictEqual(await t.run, 'done');
  assert.deepStrictEqual([...t.said], ['BEGIN',
    'SELECT pg_advisory_xact_lock(hashtext($1)) [jt-refund:ch_1]', 'COMMIT']);
  assert.strictEqual(t.released(), false, 'a healthy connection goes back to the pool');
});

test('a failure rolls back and releases the lock; a connection that cannot is dropped', async () => {
  const t = lockedRun(async () => { throw new Error('insert failed'); });
  await assert.rejects(t.run, /insert failed/);
  assert.strictEqual(t.said[t.said.length - 1], 'ROLLBACK');
  assert.strictEqual(t.released(), false);

  const u = lockedRun(async () => { throw new Error('insert failed'); }, { rollbackFails: true });
  await assert.rejects(u.run, /insert failed/, 'the original error is what the caller sees');
  assert.strictEqual(u.released(), true, 'dropping the connection is what frees a lock it still holds');
});

/* ── The August card test ───────────────────────────────────────────────── */

test('the $0.57 card test settles as no tax, and only where nobody has said otherwise', () => {
  const at = src.indexOf("['pi_3U0pFeGqgtaUfMW203neCYsX']");
  assert.ok(at > 0, 'the card test is named by its payment, not by amount');
  const sql = src.slice(src.lastIndexOf('UPDATE unlinked_payments', at), at);
  assert.match(sql, /SET tax_portion = 0, resolved_at = NOW\(\)/);
  assert.match(sql, /WHERE stripe_pi = \$1 AND tax_portion IS NULL/,
    'a tax portion someone entered by hand is never overwritten');
  assert.ok(lift('initDB').includes("['pi_3U0pFeGqgtaUfMW203neCYsX']"), 'it runs at start-up, inside initDB');
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

test('the quote page shows a refund instead of asking for the money again', () => {
  const at = src.indexOf("app.get('/q/:code',");
  const page = src.slice(at, src.indexOf('app.get(', at + 20));
  assert.match(page, /ext_ref ~ '\^\(ch\|py\)_\[A-Za-z0-9_\]\+:'/,
    'what went back to the card is read from the refund rows, net of any that failed');
  /* The gate became stopAsking on 2026-09-27: a refund or a dispute. */
  assert.match(page, /const stopAsking = refunded \|\| disputed;/, 'a refund still stops the asking');
  assert.match(page, /\$\{\(paid && balanceDue > 0 && !stopAsking\) \?/, 'no "Balance due" card after a refund');
  assert.match(page, /paid \|\| q\.requested_items \|\| q\.cancelled_at \|\| stopAsking \? '' : accepted \?/,
    'no "Pay your deposit" card after a refund in full');
  assert.match(page, /Refunded — \$\{money\(refundedToCard\)\}/, 'the refund itself is shown');
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
        if (/FROM stripe_disputes/.test(sql)) return Promise.resolve({ rows: [] });   // no disputes here
        return Promise.reject(new Error('unexpected query: ' + sql.slice(0, 80)));
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([lift('refundedInFull'), lift('disputeOn'), lift('sendDueReviewRequests')].join('\n'), sandbox);
  const summary = await sandbox.sendDueReviewRequests();

  assert.strictEqual(sentTo.join(','), 'happy@example.com');
  const stamp = updates.find((u) => u.id === 1);
  assert.ok(stamp, 'the refunded ask has to leave the queue, or it is reconsidered every hour');
  assert.match(stamp.sql, /followup_sent_at=NOW\(\)/, 'and the follow-up sweep must never pick it up');
  assert.match(summary, /skipped\(refunded or disputed\)=1/, 'the sweep\'s summary says why one was not sent');
});

test('the follow-up sweep checks for a refund too', () => {
  /* The first ask can go out before the refund does; the follow-up is days
     later and has to see it. */
  /* Anchored on the call, not on the expression around it; that it stops the
     send is proved by running the sweep in reviews-page.test.js. */
  assert.match(lift('sendReviewFollowUps'), /await refundedInFull\(r\)/);
});
