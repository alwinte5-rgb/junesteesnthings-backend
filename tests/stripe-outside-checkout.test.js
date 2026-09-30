'use strict';

/* Payments taken in Stripe outside checkout.
 *
 * Checkout is not the only way money reaches the shop's Stripe account: a card
 * charged in the Stripe Dashboard for an order taken by phone, a Stripe
 * invoice, a card reader. None of those has a Checkout Session, and until
 * 2026-09-27 none reached either ledger, so the money was in Stripe and nowhere
 * in the books or the sales tax figures.
 *
 * Now every successful charge is checked (charge.succeeded / charge.captured
 * and an hourly sweep). Checkout's own are left to the checkout webhook. The
 * rest land on the quote they name, or on the unlinked ledger with the shop
 * told, and the quote board offers those in "Record a payment", where applying
 * one moves it onto the quote instead of recording the same money twice.
 *
 * Nothing here has a Postgres or a Stripe, so both answer in memory.
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
const FROM = line(/^const OUTSIDE_CHECKOUT_FROM = .*;$/m, 'OUTSIDE_CHECKOUT_FROM');
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const NOW = Math.floor(Date.now() / 1000);

/* ── The books, a Stripe and an inbox, in memory ────────────────────────── */

/* `quotes` are the quote rows. `quotePayments` and `unlinked` are the two
   ledgers, which the code under test writes to and reads back. `stripe` is
   what Stripe holds: checkout sessions, payment intents, invoices, charges.
   `stripe.invoicePayments` false makes that endpoint answer the way an older
   API version does. */
function desk({ quotes = [], quotePayments = [], unlinked = [], disputes = [], stripe = {}, key = 'sk_test_x' } = {}) {
  const S = { sessions: [], intents: {}, invoices: {}, invoicePayments: {}, charges: [], ...stripe };
  const Q = new Map(quotes.map((q) => [q.code, { status: 'sent', paid_amount: 0, written_off: 0, ...q }]));
  const alerts = [];
  const emails = [];
  const texts = [];
  const reviews = [];
  const calls = [];
  let nextId = 1 + unlinked.reduce((m, u) => Math.max(m, u.id || 0), 0);
  unlinked.forEach((u) => { if (!u.id) u.id = nextId++; });

  const clash = () => { const e = new Error('duplicate key value violates unique constraint'); e.code = '23505'; return e; };
  const pool = {
    query(sql, args = []) {
      const s = sql.replace(/\s+/g, ' ').trim();
      const ok = (rows) => Promise.resolve({ rows, rowCount: rows.length });
      if (/^SELECT 1 FROM quote_payments WHERE \(\$1::text IS NOT NULL AND stripe_pi = \$1\) OR ext_ref = \$2 UNION ALL SELECT 1 FROM unlinked_payments/.test(s)) {
        const [pi, ref] = args;
        const hit = (r) => (pi != null && r.stripe_pi === pi) || r.ext_ref === ref;
        return ok(quotePayments.some(hit) || unlinked.some(hit) ? [{ '?column?': 1 }] : []);
      }
      if (/^SELECT code FROM quotes WHERE code = ANY\(\$1::text\[\]\) ORDER BY code$/.test(s)) {
        return ok(args[0].filter((c) => Q.has(c)).sort().map((code) => ({ code })));
      }
      if (/^SELECT \* FROM quotes WHERE code = \$1$/.test(s)) {
        return ok(Q.has(args[0]) ? [{ ...Q.get(args[0]) }] : []);
      }
      if (/^UPDATE stripe_disputes SET quote_code = \$2 WHERE payment_intent = \$1 AND quote_code IS NULL$/.test(s)) {
        for (const x of disputes) if (x.payment_intent === args[0] && !x.quote_code) x.quote_code = args[1];
        return ok([]);
      }
      if (/^UPDATE quotes SET status = 'accepted', accepted_at = COALESCE\(accepted_at, NOW\(\)\) WHERE code = \$1 AND status <> 'held'$/.test(s)) {
        const q = Q.get(args[0]);
        if (q && q.status !== 'held') { q.status = 'accepted'; q.accepted_at = q.accepted_at || 'now'; }
        return ok([]);
      }
      if (/^INSERT INTO unlinked_payments \(amount, fee, currency, channel, order_ref, client_ref, kind, source,/.test(s)) {
        const [amount, fee, currency, channel, order_ref, client_ref, kind, source, stripe_session,
               stripe_pi, ext_ref, customer_email, customer_name, reason, note, tax_portion] = args;
        if (ext_ref != null && unlinked.some((u) => u.ext_ref === ext_ref)) return Promise.reject(clash());
        unlinked.push({ id: nextId++, amount, fee, currency, channel, order_ref, client_ref, kind, source,
                        stripe_session, stripe_pi, ext_ref, customer_email, customer_name, reason, note,
                        tax_portion, created_at: new Date() });
        return ok([]);
      }
      if (/^SELECT \* FROM unlinked_payments WHERE id = \$1$/.test(s)) {
        return ok(unlinked.filter((u) => u.id === Number(args[0])).map((u) => ({ ...u })));
      }
      if (/^SELECT ext_ref, client_ref FROM unlinked_payments WHERE stripe_pi = \$1 AND id <> \$2$/.test(s)) {
        return ok(unlinked.filter((u) => u.stripe_pi === args[0] && u.id !== Number(args[1]))
          .map((u) => ({ ext_ref: u.ext_ref, client_ref: u.client_ref })));
      }
      if (/^SELECT quote_code FROM quote_payments WHERE ext_ref = \$1 OR stripe_pi = \$2 LIMIT 1$/.test(s)) {
        const p = quotePayments.find((r) => r.ext_ref === args[0] || r.stripe_pi === args[1]);
        return ok(p ? [{ quote_code: p.quote_code }] : []);
      }
      if (/^INSERT INTO unlinked_payments \(amount, fee, currency, channel, client_ref, kind, source, stripe_pi, ext_ref,/.test(s)) {
        assert.match(s, /ON CONFLICT DO NOTHING$/);
        const [amount, currency, client_ref, stripe_pi, ext_ref, customer_email, customer_name, reason, note,
               tax_portion, created_at] = args;
        if (unlinked.some((u) => u.ext_ref === ext_ref)) return ok([]);
        unlinked.push({ id: nextId++, amount, fee: 0, currency, channel: 'stripe', client_ref, kind: 'correction',
                        source: 'manual', stripe_pi, ext_ref, customer_email, customer_name, reason, note,
                        tax_portion, resolved_at: 'now', created_at });
        return ok([]);
      }
      if (/^UPDATE unlinked_payments SET tax_portion = 0, resolved_at = NOW\(\), note = CONCAT_WS\(' · ', NULLIF\(note, ''\), \$2::text\) WHERE id = \$1 AND tax_portion IS NULL$/.test(s)) {
        const u = unlinked.find((r) => r.id === Number(args[0]) && r.tax_portion == null);
        if (u) { u.tax_portion = 0; u.resolved_at = 'now'; u.note = [u.note, args[1]].filter(Boolean).join(' · '); }
        return ok([]);
      }
      return Promise.reject(new Error('unexpected query: ' + s.slice(0, 120)));
    },
  };

  const reply = (status, body) => ({ ok: status < 300, status, json: async () => JSON.parse(JSON.stringify(body)) });
  const fetch = async (url, opts) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams),
                 auth: opts && opts.headers && opts.headers.Authorization });
    if (S.down) return reply(500, { error: { message: 'Stripe is having a moment' } });
    if (u.pathname === '/v1/checkout/sessions') {
      const pi = u.searchParams.get('payment_intent');
      return reply(200, { has_more: false, data: S.sessions.filter((x) => x.payment_intent === pi) });
    }
    let m;
    if ((m = /^\/v1\/payment_intents\/([^/]+)$/.exec(u.pathname))) {
      const pi = S.intents[decodeURIComponent(m[1])];
      return pi ? reply(200, pi) : reply(404, { error: { message: 'No such payment_intent' } });
    }
    if (u.pathname === '/v1/invoice_payments') {
      if (S.invoicePayments === false) return reply(404, { error: { message: 'Unrecognized request URL' } });
      assert.strictEqual(u.searchParams.get('payment[type]'), 'payment_intent');
      const inv = S.invoicePayments[u.searchParams.get('payment[payment_intent]')];
      return reply(200, { has_more: false, data: inv ? [{ object: 'invoice_payment', invoice: inv }] : [] });
    }
    if ((m = /^\/v1\/invoices\/([^/]+)$/.exec(u.pathname))) {
      const inv = S.invoices[decodeURIComponent(m[1])];
      return inv ? reply(200, inv) : reply(404, { error: { message: 'No such invoice' } });
    }
    if (u.pathname === '/v1/charges') {
      const since = Number(u.searchParams.get('created[gte]'));
      return reply(200, { has_more: false, data: S.charges.filter((c) => c.created >= since) });
    }
    return reply(400, { error: { message: 'no fake for ' + u.pathname } });
  };

  const sandbox = {
    pool, fetch, URL, URLSearchParams, AbortSignal, Date,
    process: { env: key ? { STRIPE_SECRET_KEY: key } : {} },
    console: { log() {}, warn() {}, error() {} },
    CARD_FEE: 0.04,
    SHOP_EMAIL: 'shop@example.com', SHOP_NAME: "June's Tees & Things", SHOP_SIGNER: 'June',
    SHOP_PHONE: '(773) 849-1854', BALANCE_WHEN: 'on pickup', PUBLIC_BASE_URL: 'https://www.jtees.net',
    FINANCES_PATH: '/admin/finances',
    REVIEW_DAYS_AFTER_DEPOSIT: () => 21, REVIEW_DAYS_AFTER_PAYMENT: () => 7,
    quoteLink: (code) => 'https://www.jtees.net/q/' + code,
    /* What each quote asks for: its stored total, and half of it as the deposit. */
    quoteTotals: (q) => ({ total: Number(q.total), deposit: round2(Number(q.total) / 2) }),
    alertShop: async (subject, html) => { alerts.push({ subject, html }); },
    sendEmail: async (m) => { emails.push(m); },
    /* Customer emails about a quote go through the recorded sender now. */
    sendClientEmail: async (m) => { emails.push(m); },
    sendCustomerSms: (m) => { texts.push(m); return Promise.resolve('sent'); },
    SMS: { paymentReceived: ({ code, amount, stillDue }) => ({ template: 'payment-received', body: `${code} ${amount} ${stillDue}` }) },
    brevo: { post: () => Promise.resolve() },
    syncDealStage: () => Promise.resolve(),
    syncQuoteContact: () => Promise.resolve(),
    queueReviewRequest: (r) => { reviews.push(r); return Promise.resolve(); },
    /* The real one is idempotent on ext_ref and rolls the ledger up onto the quote. */
    recordPayment: async (p) => {
      if (quotePayments.some((r) => r.ext_ref === (p.extRef || p.session))) return { ok: false, duplicate: true, paid: null };
      quotePayments.push({ quote_code: p.code, amount: round2(p.amount), fee: round2(p.fee || 0), method: p.method,
                           kind: p.kind || 'payment', source: p.source, stripe_pi: p.pi, ext_ref: p.extRef || p.session,
                           note: p.note, created_at: p.createdAt || null });
      const paid = round2(quotePayments.filter((r) => r.quote_code === p.code).reduce((c, r) => c + r.amount, 0));
      Q.get(p.code).paid_amount = paid;
      return { ok: true, duplicate: false, paid };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([ROUND2, MONEY, CODE_RE, FROM, lift('escEmail'), lift('cardFee'), lift('balanceOf'),
                   lift('stripeListAll'), lift('stripeGet'), lift('recordUnlinkedPayment'),
                   lift('chargeInBooks'), lift('invoiceForCharge'), lift('quoteNamedOn'), lift('stripePaymentHow'),
                   lift('landStripePaymentOnQuote'), lift('bookChargeNow'),
                   /* The queue and the lock are checked in the source below. */
                   'function bookCharge(c, via) { return bookChargeNow(c, via); }',
                   lift('reconcileOutsideCheckoutPayments'), lift('applyStripePaymentNow')].join('\n'), sandbox);
  return {
    book: (c, via = 'webhook') => sandbox.bookChargeNow(c, via),
    sweep: () => sandbox.reconcileOutsideCheckoutPayments(),
    apply: (id, code) => sandbox.applyStripePaymentNow(id, code),
    /* A top-level const is not a property of the sandbox; a second script in
       the same context can still read it. */
    from: vm.runInContext('OUTSIDE_CHECKOUT_FROM', sandbox),
    quotes: Q, quotePayments, unlinked, disputes, alerts, emails, texts, reviews, calls, stripe: S,
  };
}

/* A charge as Stripe holds it: succeeded and captured, made after booking began. */
let chN = 0;
function charge({ id = `ch_${++chN}`, pi = `pi_${chN}`, cents = 10400, description = null, metadata = {},
                  type = 'card', created = NOW - 60, email = 'pat@example.com', name = 'Pat Buyer', ...rest } = {}) {
  return { id, object: 'charge', payment_intent: pi, amount: cents, amount_captured: cents, currency: 'usd',
           status: 'succeeded', paid: true, captured: true, created, description, metadata,
           billing_details: { email, name }, receipt_url: `https://pay.stripe.com/receipts/${id}`,
           payment_method_details: { type }, ...rest };
}
const QUOTE = { code: 'AB12CD', name: 'Pat Buyer', email: 'pat@example.com', phone: '+13125550123',
                total: 200, tax: 18.6, items: [{ description: '24 tees' }] };

/* ── What is left alone ─────────────────────────────────────────────────── */

test("checkout's own payment is left to the checkout webhook", async () => {
  const c = charge();
  const d = desk({ stripe: { sessions: [{ id: 'cs_1', payment_intent: c.payment_intent }] } });
  const out = await d.book(c);
  assert.strictEqual(out.skipped, 'a checkout payment');
  assert.strictEqual(d.unlinked.length + d.quotePayments.length, 0);
  assert.strictEqual(d.alerts.length, 0);
});

test('a payment already in either ledger is skipped without asking Stripe', async () => {
  const c = charge();
  for (const books of [{ quotePayments: [{ quote_code: 'AB12CD', stripe_pi: c.payment_intent, ext_ref: 'cs_9', amount: 100 }] },
                       { unlinked: [{ stripe_pi: c.payment_intent, ext_ref: 'cs_8', amount: 104, channel: 'studio', kind: 'payment' }] }]) {
    const d = desk(books);
    assert.strictEqual((await d.book(c)).skipped, 'already in the books');
    assert.strictEqual(d.calls.length, 0, 'the database answers it; Stripe is not asked');
  }
});

test('only money actually taken is booked', async () => {
  const d = desk();
  assert.strictEqual((await d.book(charge({ captured: false, amount_captured: 0 }))).skipped, 'no money taken',
    'authorised for capture later: nothing taken yet');
  assert.strictEqual((await d.book(charge({ status: 'failed', paid: false }))).skipped, 'no money taken');
  assert.strictEqual((await d.book(charge({ status: 'pending' }))).skipped, 'no money taken');
  assert.strictEqual(d.unlinked.length, 0);
  /* A partial capture books what was captured. */
  const part = charge({ cents: 5000 });
  part.amount_captured = 3000;
  await d.book(part);
  assert.strictEqual(d.unlinked[0].amount, 30);
});

test('a charge from before booking began is left for a person to place', async () => {
  const d = desk();
  const out = await d.book(charge({ created: d.from - 1 }));
  assert.strictEqual(out.skipped, 'before booking began');
  assert.strictEqual(d.unlinked.length, 0);
  assert.strictEqual(d.from, Math.floor(Date.parse('2026-09-27T05:00:00Z') / 1000),
    'the day this shipped, in the shop\'s own midnight');
});

test('without a key it cannot tell a checkout payment from any other, so it books nothing', async () => {
  const d = desk({ key: null });
  assert.strictEqual((await d.book(charge())).skipped, 'no key to ask Stripe');
  assert.strictEqual(d.unlinked.length, 0);
});

test('when Stripe cannot say whether checkout owns it, nothing is booked and the webhook retries', async () => {
  const d = desk({ stripe: { down: true } });
  await assert.rejects(d.book(charge()), /Stripe GET \/v1\/checkout\/sessions.*500/);
  assert.strictEqual(d.unlinked.length + d.quotePayments.length, 0);
});

/* ── Money that names no quote ──────────────────────────────────────────── */

test('a Dashboard charge naming no quote lands on the unlinked ledger, tax unknown', async () => {
  const c = charge({ description: 'Phone order' });
  const d = desk();
  const out = await d.book(c);
  assert.strictEqual(out.ledger, 'unlinked');
  assert.strictEqual(d.unlinked.length, 1);
  const u = d.unlinked[0];
  assert.strictEqual(u.amount, 104);
  assert.strictEqual(u.channel, 'stripe');
  assert.strictEqual(u.kind, 'payment');
  assert.strictEqual(u.source, 'stripe_webhook');
  assert.strictEqual(u.stripe_pi, c.payment_intent, 'refunds and chargebacks find it by its payment');
  assert.strictEqual(u.ext_ref, `charge:${c.id}`);
  assert.strictEqual(u.tax_portion, null, 'unknown, never zero');
  assert.strictEqual(u.order_ref, null, 'never mistaken for a design studio order');
  assert.strictEqual(u.customer_email, 'pat@example.com');
  assert.strictEqual(u.reason, 'card charged in Stripe, not through checkout');
  assert.strictEqual(u.note, 'card charged in Stripe · Phone order');
  assert.strictEqual(d.quotePayments.length, 0);
});

test('its row can never be read back as a refund', () => {
  /* Refund and chargeback rows are found by an ext_ref that STARTS with the
     charge id (split_part(ext_ref, ':', 1) = charge), and read as money given
     back. The payment's own key must never match that. */
  assert.match(lift('refundCentsBooked'), /split_part\(ext_ref, ':', 1\) = \$1/);
  const extRef = /const extRef = `charge:\$\{id\}`;/;
  assert.match(lift('bookChargeNow'), extRef);
  assert.notStrictEqual('charge:ch_1'.split(':')[0], 'ch_1');
});

test('the shop is told once, with how to put it on its quote without counting it twice', async () => {
  const c = charge({ description: 'Phone order' });
  const d = desk();
  await d.book(c);
  await d.book(c);                       // Stripe retried
  await d.book(c, 'sweep');              // and the sweep saw it
  assert.strictEqual(d.unlinked.length, 1);
  assert.strictEqual(d.alerts.length, 1);
  const [a] = d.alerts;
  assert.match(a.subject, /Paid in Stripe, not on a quote yet: \$104\.00 from Pat Buyer/);
  assert.match(a.html, /press <b>Record a payment<\/b>, and apply this payment there/);
  assert.match(a.html, /Do not record it again as Zelle, cash or\s+other: that counts the same money twice/);
  assert.match(a.html, /https:\/\/www\.jtees\.net\/admin\/finances#settle-tax/);
  assert.match(a.html, /put the quote code in the payment&#x27;s description|put the quote code in the payment's description/);
  assert.match(a.html, new RegExp(`https://dashboard\\.stripe\\.com/payments/${c.payment_intent}`));
  assert.match(a.html, /Customer receipt/);
});

test('an ordinary word in the description does not move money', async () => {
  /* SHIRTS is six letters, and a quote code is six or ten characters: it only
     counts when a quote really has that code. */
  const d = desk({ quotes: [QUOTE] });
  await d.book(charge({ description: 'SHIRTS for the TEAM2026 relay' }));
  assert.strictEqual(d.quotePayments.length, 0);
  assert.strictEqual(d.unlinked.length, 1);
});

test('naming two real quotes places it on neither, and says so', async () => {
  const d = desk({ quotes: [QUOTE, { ...QUOTE, code: 'EF34GH' }] });
  await d.book(charge({ description: 'AB12CD and EF34GH' }));
  assert.strictEqual(d.quotePayments.length, 0);
  assert.strictEqual(d.unlinked[0].reason, 'names more than one quote (AB12CD, EF34GH)');
  assert.match(d.alerts[0].html, /names more than one quote \(AB12CD, EF34GH\), so it was not put on either/);
});

test('a payment naming a cancelled quote does not bring the job back', async () => {
  const d = desk({ quotes: [{ ...QUOTE, cancelled_at: '2026-09-20' }] });
  await d.book(charge({ description: 'Balance AB12CD' }));
  assert.strictEqual(d.quotePayments.length, 0);
  assert.strictEqual(d.quotes.get('AB12CD').status, 'sent', 'not accepted, not revived');
  assert.strictEqual(d.unlinked[0].reason, 'names quote AB12CD, which is cancelled');
  assert.match(d.alerts[0].html, /which is cancelled, so it was not put on it/);
});

/* ── Money that names its quote ─────────────────────────────────────────── */

test('a charge naming its quote lands on it the way a checkout payment does', async () => {
  const c = charge({ description: 'balance for ab12cd', cents: 12345 });
  const d = desk({ quotes: [QUOTE] });
  const out = await d.book(c);
  assert.strictEqual(out.ledger, 'quote');
  assert.strictEqual(d.unlinked.length, 0);
  const [p] = d.quotePayments;
  assert.strictEqual(p.quote_code, 'AB12CD');
  assert.strictEqual(p.amount, 123.45, 'an amount typed by hand is taken as it is');
  assert.strictEqual(p.fee, 0);
  assert.strictEqual(p.method, 'card');
  assert.strictEqual(p.source, 'stripe');
  assert.strictEqual(p.stripe_pi, c.payment_intent);
  assert.strictEqual(p.ext_ref, `charge:${c.id}`);
  assert.strictEqual(p.created_at, new Date(c.created * 1000).toISOString(), 'dated when the money arrived');
  assert.strictEqual(d.quotes.get('AB12CD').status, 'accepted');
  /* The shop, the customer's receipt, the text and the review ask. */
  const shop = d.emails.find((m) => m.to === 'shop@example.com');
  assert.match(shop.subject, /Paid in Stripe — quote AB12CD, \$123\.45 \(set aside \$11\.48\)/);
  assert.match(shop.html, /there is nothing to record by hand/);
  const receipt = d.emails.find((m) => m.to === 'pat@example.com');
  assert.match(receipt.subject, /Payment received — quote AB12CD/);
  assert.match(receipt.html, /A balance of <b>\$76\.55<\/b> remains/);
  assert.strictEqual(d.texts.length, 1);
  assert.strictEqual(d.texts[0].ref, `payment:charge:${c.id}`);
  assert.strictEqual(d.reviews[0].quote_code, 'AB12CD');
  assert.strictEqual(d.alerts.length, 0, 'nothing to act on, so no "not on a quote" alert');
});

test('charged exactly what the quote page asks by card, the card fee comes off', async () => {
  /* Deposit $100 plus the 4% fee is $104: the quote is credited $100 and the
     fee kept beside it, so the job still closes at exactly zero. */
  const d = desk({ quotes: [QUOTE] });
  await d.book(charge({ description: 'Deposit AB12CD', cents: 10400 }));
  assert.strictEqual(d.quotePayments[0].amount, 100);
  assert.strictEqual(d.quotePayments[0].fee, 4);
  /* And the balance, the same way. */
  await d.book(charge({ description: 'AB12CD balance', cents: 10400 }));
  assert.strictEqual(d.quotePayments[1].amount, 100);
  assert.strictEqual(d.quotes.get('AB12CD').paid_amount, 200);
});

test('metadata naming the quote is enough, and wins over the description', async () => {
  const d = desk({ quotes: [QUOTE, { ...QUOTE, code: 'EF34GH' }] });
  await d.book(charge({ metadata: { quote: 'ab12cd' }, description: 'EF34GH' }));
  assert.strictEqual(d.quotePayments[0].quote_code, 'AB12CD');
});

test('the description on the payment itself counts, where the Dashboard puts it', async () => {
  const c = charge();
  const d = desk({ quotes: [QUOTE], stripe: { intents: { [c.payment_intent]: { id: c.payment_intent, description: 'Quote AB12CD', metadata: {} } } } });
  await d.book(c);
  assert.strictEqual(d.quotePayments[0].quote_code, 'AB12CD');
});

test('a bank payment lands as a transfer, with no card fee taken off', async () => {
  const d = desk({ quotes: [QUOTE] });
  await d.book(charge({ description: 'AB12CD', cents: 10400, type: 'us_bank_account' }));
  assert.strictEqual(d.quotePayments[0].method, 'transfer');
  assert.strictEqual(d.quotePayments[0].amount, 104);
  assert.strictEqual(d.quotePayments[0].fee, 0);
});

/* ── Invoices ───────────────────────────────────────────────────────────── */

test('a Stripe invoice is named in the books, and its memo can name the quote', async () => {
  const c = charge();
  const d = desk({ quotes: [QUOTE], stripe: {
    invoicePayments: { [c.payment_intent]: 'in_1' },
    invoices: { in_1: { id: 'in_1', number: 'JT-0007', description: 'Team order, quote AB12CD', metadata: {} } } } });
  await d.book(c);
  assert.strictEqual(d.quotePayments[0].quote_code, 'AB12CD');
  assert.match(d.quotePayments[0].note, /^Stripe invoice JT-0007/);
});

test('an invoice naming no quote is labelled by its number on the unlinked ledger', async () => {
  const c = charge();
  const d = desk({ stripe: {
    invoicePayments: { [c.payment_intent]: 'in_2' },
    invoices: { in_2: { id: 'in_2', number: 'JT-0008', custom_fields: [{ name: 'PO', value: '12' }], metadata: {} } } } });
  await d.book(c);
  assert.strictEqual(d.unlinked[0].client_ref, 'JT-0008');
  assert.strictEqual(d.unlinked[0].reason, 'Stripe invoice JT-0008, not through checkout');
});

test('on an older API version the charge names its invoice itself', async () => {
  const c = charge({ invoice: 'in_3' });
  const d = desk({ quotes: [QUOTE], stripe: { invoicePayments: false,
    invoices: { in_3: { id: 'in_3', number: 'JT-0009', custom_fields: [{ name: 'Quote', value: 'AB12CD' }] } } } });
  await d.book(c);
  assert.strictEqual(d.quotePayments[0].quote_code, 'AB12CD');
});

test('an API version with no invoice payments costs only the label', async () => {
  const d = desk({ stripe: { invoicePayments: false } });
  await d.book(charge());
  assert.strictEqual(d.unlinked.length, 1);
  assert.strictEqual(d.unlinked[0].reason, 'card charged in Stripe, not through checkout');
});

test('a card reader payment says so', async () => {
  const d = desk();
  await d.book(charge({ type: 'card_present' }));
  assert.strictEqual(d.unlinked[0].reason, 'card reader payment in Stripe, not through checkout');
});

/* ── The hourly sweep ───────────────────────────────────────────────────── */

test('the sweep books what no webhook delivered, and leaves checkout payments alone', async () => {
  const outside = charge({ description: 'Phone order' });
  const viaCheckout = charge();
  const early = charge({ created: 1790000000 - 400 * 86400 });
  const d = desk({ stripe: { charges: [outside, viaCheckout, early],
                             sessions: [{ id: 'cs_2', payment_intent: viaCheckout.payment_intent }] } });
  const out = await d.sweep();
  assert.match(out, /charge\(s\) checked, 1 taken outside checkout booked/);
  assert.strictEqual(d.unlinked.length, 1);
  assert.strictEqual(d.unlinked[0].source, 'stripe_sweep');
  assert.match(d.alerts[0].html, /Found by the hourly check against Stripe/);
  const list = d.calls.find((c) => c.path === '/v1/charges');
  const since = Number(list.params['created[gte]']);
  assert.strictEqual(since, Math.max(d.from, NOW - 30 * 86400), 'never before booking began, never past 30 days');
  assert.strictEqual(await d.sweep(), '', 'quiet on the next hour');
});

test('without a key the sweep says it skipped', async () => {
  assert.strictEqual(await desk({ key: null }).sweep(), 'skipped: STRIPE_SECRET_KEY is not set');
});

/* ── Applying a booked payment to its quote ─────────────────────────────── */

async function bookedUnlinked(extra = {}) {
  const c = charge({ description: 'Phone order', cents: 10400, created: NOW - 3600 });
  const d = desk({ quotes: [QUOTE, { ...QUOTE, code: 'EF34GH' }], ...extra });
  await d.book(c);
  const u = d.unlinked[0];
  u.created_at = new Date(c.created * 1000);
  return { d, c, u };
}

test('applying moves the payment onto the quote, and off the unlinked ledger by a negative row', async () => {
  const { d, c, u } = await bookedUnlinked();
  d.emails.length = 0;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await d.apply(u.id, 'AB12CD'))), { ok: true });
  const [p] = d.quotePayments;
  assert.strictEqual(p.quote_code, 'AB12CD');
  assert.strictEqual(p.amount, 100, 'deposit plus its card fee: split like a checkout payment');
  assert.strictEqual(p.fee, 4);
  assert.strictEqual(p.ext_ref, `charge:${c.id}`);
  assert.strictEqual(p.stripe_pi, c.payment_intent, 'a refund or chargeback now finds it on the quote');
  assert.strictEqual(new Date(p.created_at).getTime(), c.created * 1000, 'dated when the money arrived');
  const back = d.unlinked.find((r) => r.ext_ref === `moved:${u.id}`);
  assert.ok(back, 'the original is reversed, not deleted');
  assert.strictEqual(back.amount, -104);
  assert.strictEqual(back.kind, 'correction');
  assert.strictEqual(back.client_ref, 'AB12CD');
  assert.strictEqual(back.stripe_pi, c.payment_intent);
  assert.strictEqual(new Date(back.created_at).getTime(), c.created * 1000, 'nets to zero in the month it arrived');
  assert.strictEqual(round2(d.unlinked.reduce((s, r) => s + r.amount, 0)), 0);
  /* An unknown tax was never the unlinked ledger's to know: both rows settle
     at zero, and the quote's row carries the real figure. */
  assert.strictEqual(u.tax_portion, 0);
  assert.match(u.note, /Its tax is on quote AB12CD/);
  assert.strictEqual(back.tax_portion === 0 || Object.is(back.tax_portion, -0), true);
  /* The customer hears the payment is on their quote; the shop pressed the
     button, so it is not emailed about it. */
  assert.strictEqual(d.emails.length, 1);
  assert.strictEqual(d.emails[0].to, 'pat@example.com');
  assert.strictEqual(d.quotes.get('AB12CD').status, 'accepted');
});

test('applying twice is the same as applying once', async () => {
  const { d, u } = await bookedUnlinked();
  await d.apply(u.id, 'AB12CD');
  const receipts = d.emails.length;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(await d.apply(u.id, 'AB12CD'))), { ok: true });
  assert.strictEqual(d.quotePayments.length, 1);
  assert.strictEqual(d.unlinked.filter((r) => r.ext_ref === `moved:${u.id}`).length, 1);
  assert.strictEqual(d.emails.length, receipts, 'no second receipt');
});

test('an apply that stopped half way is finished by the next press', async () => {
  const { d, c, u } = await bookedUnlinked();
  /* The quote row was written and the reversal was not. */
  d.quotePayments.push({ quote_code: 'AB12CD', amount: 100, fee: 4, stripe_pi: c.payment_intent, ext_ref: `charge:${c.id}` });
  await d.apply(u.id, 'AB12CD');
  assert.strictEqual(d.quotePayments.length, 1, 'not landed twice');
  assert.ok(d.unlinked.find((r) => r.ext_ref === `moved:${u.id}`), 'the reversal is written');
});

test('a press that stopped after the reversal still settles the tax on the next', async () => {
  const { d, c, u } = await bookedUnlinked();
  d.quotePayments.push({ quote_code: 'AB12CD', amount: 100, fee: 4, stripe_pi: c.payment_intent, ext_ref: `charge:${c.id}` });
  d.unlinked.push({ id: 900, amount: -104, kind: 'correction', channel: 'stripe', stripe_pi: c.payment_intent,
                    ext_ref: `moved:${u.id}`, client_ref: 'AB12CD', tax_portion: 0 });
  assert.strictEqual(u.tax_portion, null);
  await d.apply(u.id, 'AB12CD');
  assert.strictEqual(u.tax_portion, 0, 'otherwise the month is held open by a payment that is on a quote');
  assert.strictEqual(d.unlinked.filter((r) => r.ext_ref === `moved:${u.id}`).length, 1);
});

test('no CONCAT_WS is handed a bare parameter, which Postgres refuses outright', () => {
  /* CONCAT_WS takes arguments of any type, so Postgres cannot infer a
     parameter's and fails the whole query: "could not determine data type of
     parameter $2". A mocked pool accepts it, so only this, or a real
     database, catches it. The first apply against real Postgres did. */
  const calls = src.match(/CONCAT_WS\([^;]*?\)\s*\n?/g) || [];
  const bare = calls.filter((c) => /\$\d+(?!\d|::)/.test(c));
  assert.deepStrictEqual(bare, []);
});

test('a payment on one quote cannot then be applied to another', async () => {
  const { d, u } = await bookedUnlinked();
  await d.apply(u.id, 'AB12CD');
  assert.strictEqual((await d.apply(u.id, 'EF34GH')).error, 'applied-elsewhere');
  assert.strictEqual(d.quotePayments.length, 1);
});

test('what cannot be applied is refused, and nothing is written', async () => {
  const { d, c, u } = await bookedUnlinked();
  assert.strictEqual((await d.apply(u.id, 'ZZ99ZZ')).error, 'no-quote');
  d.quotes.get('EF34GH').cancelled_at = '2026-09-20';
  assert.strictEqual((await d.apply(u.id, 'EF34GH')).error, 'cancelled');
  assert.strictEqual((await d.apply(999, 'AB12CD')).error, 'not-stripe');
  /* Refunded since it was booked: left where the refund was booked against it. */
  d.unlinked.push({ id: 500, amount: -104, kind: 'refund', channel: 'stripe', stripe_pi: c.payment_intent,
                    ext_ref: `${c.id}:10400:1` });
  assert.strictEqual((await d.apply(u.id, 'AB12CD')).error, 'refunded');
  assert.strictEqual(d.quotePayments.length, 0);
});

test('a design studio payment is not a Stripe payment the board can move', async () => {
  const d = desk({ quotes: [QUOTE], unlinked: [{ id: 7, amount: 50, kind: 'payment', channel: 'studio',
    order_ref: '77', stripe_pi: 'pi_s', ext_ref: 'cs_s' }] });
  assert.strictEqual((await d.apply(7, 'AB12CD')).error, 'not-stripe');
});

test('a chargeback opened while the payment was on no quote follows it onto the quote', async () => {
  /* Reminders and review asks find a dispute by its quote; one recorded while
     the payment belonged to no quote would otherwise never be seen there. */
  const { d, c, u } = await bookedUnlinked();
  d.disputes.push({ id: 'dp_1', payment_intent: c.payment_intent, quote_code: null, status: 'needs_response' },
                  { id: 'dp_other', payment_intent: 'pi_other', quote_code: null, status: 'needs_response' });
  await d.apply(u.id, 'AB12CD');
  assert.strictEqual(d.disputes[0].quote_code, 'AB12CD');
  assert.strictEqual(d.disputes[1].quote_code, null, "another payment's dispute is left alone");
});

test('a tax already settled on the payment comes back out with it', async () => {
  const { d, u } = await bookedUnlinked();
  u.tax_portion = 9.27;
  await d.apply(u.id, 'AB12CD');
  assert.strictEqual(u.tax_portion, 9.27, 'a figure somebody entered is never overwritten');
  assert.strictEqual(d.unlinked.find((r) => r.ext_ref === `moved:${u.id}`).tax_portion, -9.27);
});

/* ── Wiring ─────────────────────────────────────────────────────────────── */

test('the webhook books charge.succeeded and charge.captured, under the charge lock', () => {
  const at = src.indexOf("case 'charge.succeeded':");
  assert.ok(at > 0, 'handled, not logged as ignored');
  assert.match(src.slice(at, at + 160), /case 'charge\.captured':\s*await bookCharge\(obj, 'webhook'\);/);
  assert.match(lift('bookCharge'),
    /oneRefundAtATime\(\(\) => withChargeLock\(String\(charge\?\.id \|\| ''\), \(\) => bookChargeNow\(charge, via\)\)\)/,
    'a charge and its refund are never booked side by side');
  assert.match(lift('applyStripePayment'), /oneRefundAtATime\(\(\) => withChargeLock\(chargeId,/);
});

test('the hourly sweep books payments before it reconciles refunds and chargebacks', () => {
  const sweep = src.slice(src.indexOf('const runSweep = async () => {'));
  const body = sweep.slice(0, sweep.indexOf('setTimeout(runSweep'));
  const at = (s) => body.indexOf(s);
  assert.ok(at("await step('stripe payments', reconcileOutsideCheckoutPayments);") > 0);
  assert.ok(at("step('stripe payments'") < at("step('stripe refunds'"),
    'a refund on a payment taken outside checkout needs the payment booked first');
  assert.ok(at("step('stripe payments'") < at("step('stripe disputes'"));
});

test('the board offers only payments still waiting on a decision', () => {
  const sql = lift('unappliedStripePayments').replace(/\s+/g, ' ');
  assert.match(sql, /u\.channel = 'stripe' AND u\.kind = 'payment' AND u\.amount > 0/);
  assert.match(sql, /u\.ext_ref LIKE 'charge:%'/);
  assert.match(sql, /u\.tax_portion IS NULL/, 'settling its tax on Finances says it belongs to no quote');
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM unlinked_payments x WHERE x\.stripe_pi = u\.stripe_pi AND x\.id <> u\.id\)/,
    'not applied, refunded or disputed');
  assert.match(sql, /NOT EXISTS \(SELECT 1 FROM quote_payments p WHERE p\.stripe_pi = u\.stripe_pi\)/);
  assert.match(sql, /catch \(e\) \{ console\.error\('board: unapplied Stripe payments lookup failed:/,
    'a failed lookup costs the offer, never the board');
});

test('the offer sits beside "Record a payment", never inside its form', () => {
  const card = src.slice(src.indexOf('const quoteCard = (q) => {'));
  const offer = card.indexOf('<div id="ap-${q.code}"');
  const settleEnd = card.indexOf('</form>', card.indexOf('<form id="st-${q.code}"'));
  const markPaid = card.indexOf('<form id="mp-${q.code}"');
  assert.ok(offer > settleEnd && offer < markPaid, 'forms cannot nest, so it is its own block');
  assert.match(card.slice(offer - 200, offer), /outstanding > 0 && !q\.cancelled_at && stripeUnapplied\.length/);
  assert.match(card, /var a=document\.getElementById\('ap-\$\{q\.code\}'\);if\(a\)a\.style\.display='block'/,
    'the same button opens both');
  const block = card.slice(offer, markPaid);
  assert.match(block, /action="\/unlinked\/\$\{u\.id\}\/apply"/);
  assert.match(block, /<input type="hidden" name="quote" value="\$\{q\.code\}">/);
  assert.match(block, /if\(!confirm\('Apply this \$\{money\(u\.amount\)\} Stripe payment to \$\{q\.code\}\?'\)\)return false;/,
    'cancelling the confirm leaves the button usable');
  assert.match(block, /escEmail\(String\(u\.customer_name\)\)/);
});

test('the apply route is admin only, reads the result back, and answers from a fixed list', () => {
  const at = src.indexOf("app.post('/unlinked/:id/apply', requireAdmin,");
  assert.ok(at > 0, 'gated by requireAdmin');
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /QUOTE_CODE_RE\.test\(code\)/);
  assert.match(route, /SELECT 1 FROM quote_payments WHERE quote_code = \$1 AND ext_ref = \$2/,
    'it says applied only when the quote holds the payment');
  assert.match(route, /answer\('applied', code\)/);
  const board = src.slice(src.indexOf("const failed = APPLY_ERRORS[String(req.query.apply_err || '')];"));
  assert.match(board.slice(0, 600), /QUOTE_CODE_RE\.test\(applied\)/, 'nothing a request carries is echoed unchecked');
});
