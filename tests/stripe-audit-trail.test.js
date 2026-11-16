'use strict';

/* Every change Stripe makes to a quote leaves a record (Workstream E).
 *
 * A manual payment, cancel, restore or settle snapshots the quote into
 * quote_revisions first, so its History card shows before → after and who did
 * it. A card payment arriving by webhook did not: the money reached the
 * ledger, but the quote's history said nothing, and a delivery that FAILED and
 * was retried left no trace except a server log line.
 *
 *   1. bankStripeSession() reads the quote before banking and writes that row
 *      to its history only once this call has banked the money, credited to
 *      "Stripe" (not "Owner") with the amount in the label: a retry, the
 *      return-page race and a failed write leave no extra line, and nothing
 *      ever deletes history.
 *   2. Every webhook delivery for a quote writes one stripe_events row saying
 *      whether it was handled or failed, with the error. A retry is a second
 *      row with the same event id. Refunds and disputes find their quote by
 *      payment intent.
 *   3. The log is written after Stripe has its answer, so it can never delay
 *      or change it.
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
  const out = { ledger: [], snapshots: [], failWrite: false };
  let nextId = 1;
  const pool = {
    query(sql, args = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (/^SELECT \* FROM quotes WHERE code=\$1$/.test(s)) return Promise.resolve({ rows: [{ ...Q }] });
      if (/^SELECT to_jsonb\(q\.\*\) AS row, \(SELECT COALESCE\(MAX\(id\), 0\) FROM quote_revisions/.test(s)) {
        if (out.failRead) return Promise.reject(new Error('read failed'));
        return Promise.resolve({ rows: [{ row: { ...Q }, last_rev: 0 }] });
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
    reportError: async (where) => { out.reported = where; },
    snapshotQuote: async (code, action, ip, pre) => {
      out.snapshots.push({ id: nextId++, code, action, pre, paidBefore: pre && pre.row.paid_amount });
    },
    recordPayment: async (p) => {
      await new Promise((r) => setImmediate(r));   // lets two callers interleave, as the real INSERT does
      if (out.failWrite) throw new Error('connection terminated');
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
  assert.match(d.snapshots[0].action, /\$104\.00/, 'and says how much, which the field diff cannot show');
  assert.strictEqual(d.snapshots[0].paidBefore, 0, 'read before recordPayment, so it is the row as it stood');
});

test('a Stripe retry of a banked session adds no second history line', async () => {
  const d = desk();
  await d.bank(session());
  const again = await d.bank(session());
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(d.snapshots.length, 1, 'the retry is not a change');
  assert.strictEqual(d.ledger.length, 1);
});

test('the webhook and the return page racing on one session leave ONE line', async () => {
  const d = desk();
  const [a, b] = await Promise.all([d.bank(session()), d.bank(session())]);
  assert.strictEqual([a, b].filter((r) => r.duplicate).length, 1, 'one of them loses at the ledger');
  assert.strictEqual(d.ledger.length, 1);
  assert.strictEqual(d.snapshots.length, 1, 'only the call that banked it writes the line');
});

test('a write that fails leaves no line, and still throws so Stripe retries', async () => {
  const d = desk();
  d.failWrite = true;
  await assert.rejects(d.bank(session()), /connection terminated/);
  assert.strictEqual(d.snapshots.length, 0);
  d.failWrite = false;
  await d.bank(session());
  assert.strictEqual(d.snapshots.length, 1, 'the retry that lands is the one line');
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

test('a failed read of the quote is reported, and the payment still banks', async () => {
  const d = desk();
  d.failRead = true;
  const r = await d.bank(session());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(d.ledger.length, 1);
  assert.strictEqual(d.snapshots.length, 0);
  assert.strictEqual(d.reported, 'quote-snapshot');
});

test('the line carries the pre-read row and where History stood', async () => {
  const d = desk();
  await d.bank(session());
  assert.ok(d.snapshots[0].pre && d.snapshots[0].pre.row.code === CODE && d.snapshots[0].pre.lastRev === 0);
});

test('without snapshotQuote in scope (other tests lift this alone) banking still works', () => {
  assert.match(lift('bankStripeSession'), /typeof snapshotQuote === 'function'/);
});

test('only Stripe writes a Stripe: line, so the History credit cannot go to the wrong person', () => {
  const calls = src.match(/snapshotQuote\([^;]*?['`]Stripe:/g) || [];
  assert.strictEqual(calls.length, 1, 'one caller, in bankStripeSession');
  assert.ok(lift('bankStripeSession').includes(calls[0]));
});

test('the line is written only after the ledger accepted the payment, and history is never deleted', () => {
  const fn = lift('bankStripeSession');
  const read = fn.indexOf('SELECT to_jsonb(q.*) AS row');
  const bank = fn.indexOf('await recordPayment(');
  const dup = fn.indexOf('if (res.duplicate) return');
  const write = fn.indexOf('await snapshotQuote(code, `Stripe: card payment');
  assert.ok(read < bank && bank < dup && dup < write, 'read before, write after the duplicate check');
  assert.doesNotMatch(src, /DELETE FROM quote_revisions/);
});

/* ── The delivery log ──────────────────────────────────────────────────── */

function logger({ fail = false, ledger = {} } = {}) {
  const rows = [];
  const sandbox = {
    console: { error() {} },
    pool: { query: async (sql, args) => {
      if (fail) throw new Error('db down');
      if (/FROM quote_payments WHERE stripe_pi/.test(sql)) {
        return { rows: ledger[args[0]] ? [{ quote_code: ledger[args[0]] }] : [] };
      }
      rows.push(args); return { rows: [] };
    } },
  };
  vm.createContext(sandbox);
  vm.runInContext([CODE_RE, lift('logStripeDelivery')].join('\n'), sandbox);
  return { rows, log: (...a) => sandbox.logStripeDelivery(...a) };
}

test('a handled delivery is one row: event id, type, quote, outcome', async () => {
  const l = logger();
  await l.log({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', client_reference_id: CODE.toLowerCase() } } }, 'handled');
  // Through JSON: arrays made inside the vm context carry its prototypes.
  assert.deepStrictEqual(JSON.parse(JSON.stringify(l.rows)), [['evt_1', 'checkout.session.completed', 'cs_1', CODE, 'handled', null]]);
});

test('a failed delivery keeps the error, capped', async () => {
  const l = logger();
  await l.log({ id: 'evt_2', type: 'charge.refunded', data: { object: { metadata: { quote_code: CODE } } } },
    'failed', new Error('x'.repeat(1000)));
  assert.strictEqual(l.rows[0][3], CODE, 'a charge names its quote in metadata');
  assert.strictEqual(l.rows[0][4], 'failed');
  assert.strictEqual(l.rows[0][5].length, 300);
});

test('a refund or dispute finds its quote by payment intent', async () => {
  const l = logger({ ledger: { pi_deposit: CODE } });
  await l.log({ id: 'evt_5', type: 'charge.dispute.created', data: { object: { payment_intent: 'pi_deposit' } } }, 'handled');
  await l.log({ id: 'evt_6', type: 'charge.refunded', data: { object: { payment_intent: { id: 'pi_deposit' } } } }, 'handled');
  assert.deepStrictEqual(l.rows.map((r) => r[3]), [CODE, CODE]);
});

test('a delivery for no quote is not kept, handled or failed (failures reach app_errors via reportError)', async () => {
  const l = logger();
  await l.log({ id: 'evt_3', type: 'checkout.session.completed', data: { object: { client_reference_id: '10' } } }, 'handled');
  await l.log({ id: 'evt_7', type: 'payout.paid', data: { object: {} } }, 'handled');
  await l.log({ id: 'evt_8', type: 'payout.failed', data: { object: {} } }, 'failed', new Error('z'));
  assert.strictEqual(l.rows.length, 0);
  const route = src.slice(src.indexOf("app.post('/webhooks/stripe'"), src.indexOf('async function logStripeDelivery'));
  assert.match(route, /reportError\('stripe-webhook', err\)/);
});

test('the log never throws, so it can never turn a banked payment into a retry', async () => {
  const l = logger({ fail: true });
  await assert.doesNotReject(l.log({ id: 'evt_4', type: 'x', data: { object: {} } }, 'handled'));
  await assert.doesNotReject(l.log(null, 'failed', new Error('y')));
});

test('the route logs only once signed, and only AFTER Stripe has its answer', () => {
  const route = src.slice(src.indexOf("app.post('/webhooks/stripe'"), src.indexOf('async function logStripeDelivery'));
  const work = route.indexOf('await handleStripeEvent');
  const handled = route.indexOf("logStripeDelivery(req.body, 'handled')");
  const ok = route.indexOf('res.sendStatus(200)');
  const failed = route.indexOf("logStripeDelivery(req.body, 'failed', err)");
  const retry = route.indexOf('res.sendStatus(500)');
  assert.ok(route.indexOf('timingSafeEqual') < work, 'nothing logged for an unsigned request');
  assert.ok(work < ok && ok < handled, 'the 200 goes before the log write');
  assert.ok(retry !== -1 && retry < failed, 'the 500 goes before the log write');
  assert.doesNotMatch(route, /await logStripeDelivery/, 'the log is never awaited on the answer path');
});

test('stripe_events is created, and the History card lists deliveries', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS stripe_events \(/);
  const card = lift('jobHistoryCard');
  assert.match(card, /FROM stripe_events/);
  assert.match(card, /Stripe deliveries/);
  assert.match(card, /\/\^Stripe:\/\.test\(r\.action\) \? 'Stripe' : 'Owner'/);
  assert.match(card, /if \(!rows\.length && !deliveries\.length && !deliveriesUnread\) return '';/,
    'a quote with deliveries but no revisions still shows the card');
  assert.match(card, /owner && d\.error/, 'the raw error is the owner\'s to see, not a helper\'s');
  assert.match(card, /openFailures \? ' open' : ''/, 'an unsettled failure opens the card');
  assert.match(card, /Could not load the Stripe deliveries/, 'a failed read says so instead of looking empty');
  assert.match(card, /h\.event_id === d\.event_id && Number\(h\.id\) > Number\(d\.id\)/, 'settled only by a LATER handled row of the same event');
  assert.match(card, /d\.banked \|\|/, 'or by the ledger holding the checkout');
});

test('snapshotQuote with a pre-read row writes it only if nothing newer was saved', async () => {
  const calls = [];
  const sandbox = { console: { error() {}, warn() {} }, reportError: async () => {}, currentActor: () => null,
    pool: { query: async (sql, args) => { calls.push({ sql, args }); return { rowCount: args[1] === 'raced' ? 0 : 1, rows: [] }; } } };
  vm.createContext(sandbox);
  vm.runInContext(lift('snapshotQuote'), sandbox);
  await sandbox.snapshotQuote('ab12cd34ef', 'Stripe: card payment $104.00', null, { row: { code: CODE, total: 200 }, lastRev: 7 });
  const s = calls[0].sql.replace(/\s+/g, ' ');
  assert.match(s, /SELECT \$1::text, \$5::jsonb, \$2::text, \$3::int, \$4::text WHERE NOT EXISTS \(SELECT 1 FROM quote_revisions WHERE quote_code = \$1::text AND id > \$6::bigint\)/,
    'every parameter cast: Postgres cannot infer them in INSERT ... SELECT');
  assert.strictEqual(calls[0].args[0], CODE);
  assert.deepStrictEqual(JSON.parse(calls[0].args[4]), { code: CODE, total: 200 });
  assert.strictEqual(calls[0].args[5], 7);
  await assert.doesNotReject(sandbox.snapshotQuote(CODE, 'raced', null, { row: {}, lastRev: 1 }));
  await sandbox.snapshotQuote(CODE, 'edit');
  assert.match(calls[2].sql, /to_jsonb\(q\.\*\)/, 'without pre it still snapshots the live row');
});
