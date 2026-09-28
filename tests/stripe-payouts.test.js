'use strict';

/* Payouts Stripe could not deliver to the bank.
 *
 * A payout that fails (a closed or mistyped account, the bank refusing it)
 * puts the money back in the Stripe balance, and Stripe can hold later payouts
 * until the bank details are fixed. Until 2026-09-27 payout.failed reached the
 * webhook as "ignored", so the first sign would have been money not arriving.
 *
 * Now the event, and an hourly sweep over Stripe's own list, email the shop
 * once per failed payout. Nothing moves in the books: a sale counts when the
 * customer pays, not when Stripe pays out.
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

/* A top-level function out of server.js by name, `async` included, stepping
   over the parameter list first so a destructured default is not taken for
   the body. */
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

/* Stripe, the claim table and the shop's inbox, in memory. `stripe.payouts`
   is what Stripe holds; `stripe.bank` is what an expanded destination reads
   as. `emailFails` makes that many sends throw, the way Brevo does when down. */
function payoutDesk({ key = 'sk_test_x', stripe = { payouts: {} }, emailFails = 0 } = {}) {
  const claimed = new Map();
  const emails = [];
  const calls = [];
  const sql = [];
  let failures = emailFails;

  const pool = {
    query(text, args = []) {
      const s = text.replace(/\s+/g, ' ').trim();
      sql.push(s);
      if (/^INSERT INTO stripe_payout_failures/.test(s)) {
        if (claimed.has(args[0])) return Promise.resolve({ rows: [], rowCount: 0 });
        claimed.set(args[0], { amount: args[1], currency: args[2], code: args[3], message: args[4] });
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      if (/^DELETE FROM stripe_payout_failures WHERE id = \$1$/.test(s)) {
        claimed.delete(args[0]);
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.reject(new Error('unexpected query: ' + s.slice(0, 100)));
    },
  };

  const fetch = async (url, opts) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams),
                 auth: opts && opts.headers && opts.headers.Authorization });
    if (u.pathname === '/v1/payouts') {
      const status = u.searchParams.get('status');
      const data = Object.values(stripe.payouts).filter((p) => !status || p.status === status);
      return { ok: true, status: 200, json: async () => ({ has_more: false, data: JSON.parse(JSON.stringify(data)) }) };
    }
    const one = /^\/v1\/payouts\/([^/]+)$/.exec(u.pathname);
    if (one && stripe.payouts[one[1]] && stripe.bank) {
      return { ok: true, status: 200,
               json: async () => ({ ...JSON.parse(JSON.stringify(stripe.payouts[one[1]])), destination: stripe.bank }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: { message: 'No such payout' } }) };
  };

  const sandbox = {
    pool, fetch, URL, URLSearchParams, AbortSignal,
    process: { env: key ? { STRIPE_SECRET_KEY: key } : {} },
    console: { log() {}, warn() {}, error() {} },
    SHOP_TZ: 'America/Chicago',
    SHOP_EMAIL: 'shop@example.com',
    sendEmail: async (m) => {
      if (failures > 0) { failures--; throw new Error('Brevo 500: down'); }
      emails.push(m);
    },
  };
  vm.createContext(sandbox);
  vm.runInContext([ROUND2, MONEY, lift('escEmail'), lift('stripeListAll'), lift('stripeGet'),
                   lift('reportFailedPayout'), lift('reconcileFailedPayouts')].join('\n'), sandbox);
  return {
    report: (p, via) => sandbox.reportFailedPayout(p, via),
    sweep: () => sandbox.reconcileFailedPayouts(),
    claimed, emails, calls, sql, stripe,
  };
}

/* A payout as Stripe holds it. */
const payout = (id, { cents = 123456, status = 'failed', code = 'account_closed',
                      message = 'The bank account has been closed.', dest = 'ba_1' } = {}) =>
  ({ id, object: 'payout', amount: cents, currency: 'usd', status, failure_code: status === 'failed' ? code : null,
     failure_message: status === 'failed' ? message : null, arrival_date: 1790000000, destination: dest });

const NAVY = { id: 'ba_1', object: 'bank_account', bank_name: 'NAVY FEDERAL CREDIT UNION', last4: '6789' };

/* ── Telling the shop ───────────────────────────────────────────────────── */

test('a failed payout emails the shop once, however many times it is reported', async () => {
  const desk = payoutDesk({ stripe: { payouts: { po_1: payout('po_1') }, bank: NAVY } });
  const first = await desk.report(payout('po_1'), 'webhook');
  const again = await desk.report(payout('po_1'), 'webhook');   // Stripe retried the event
  await desk.sweep();                                          // and the hourly sweep saw it too
  assert.strictEqual(first.told, true);
  assert.strictEqual(again.told, false);
  assert.strictEqual(desk.emails.length, 1, 'one email per failed payout');
  assert.strictEqual(desk.claimed.size, 1);
  assert.strictEqual(desk.claimed.get('po_1').amount, 1234.56);
});

test('the email says how much, to which account, why, and where to fix it', async () => {
  const desk = payoutDesk({ stripe: { payouts: { po_1: payout('po_1') }, bank: NAVY } });
  await desk.report(payout('po_1'), 'webhook');
  const [m] = desk.emails;
  assert.strictEqual(m.to, 'shop@example.com');
  assert.match(m.subject, /payout failed: \$1234\.56 did not reach the bank/);
  assert.match(m.html, /NAVY FEDERAL CREDIT UNION account ending 6789/);
  assert.match(m.html, /The bank account has been closed\./);
  assert.match(m.html, /\(account_closed\)/);
  assert.match(m.html, /The money is not lost/);
  assert.match(m.html, /https:\/\/dashboard\.stripe\.com\/settings\/payouts/);
  assert.match(m.html, /https:\/\/dashboard\.stripe\.com\/payouts\/po_1/);
  assert.match(m.html, /Nothing changes in the books/);
  assert.doesNotMatch(m.html, /hourly check/, 'a webhook delivery is not described as a sweep find');
});

test('a destination the event already carries is used without asking Stripe', async () => {
  const desk = payoutDesk();
  await desk.report(payout('po_2', { dest: { object: 'card', brand: 'Visa', last4: '4242' } }), 'webhook');
  assert.match(desk.emails[0].html, /the Visa card ending 4242/);
  assert.strictEqual(desk.calls.length, 0);
});

test('when the account cannot be looked up, the email still goes without its name', async () => {
  const desk = payoutDesk({ stripe: { payouts: {} } });        // Stripe answers 404
  await desk.report(payout('po_3'), 'webhook');
  assert.strictEqual(desk.emails.length, 1);
  assert.match(desk.emails[0].html, /the shop&#x27;s bank account/);
});

test('a payout that did not fail is left alone', async () => {
  const desk = payoutDesk();
  for (const status of ['paid', 'pending', 'in_transit', 'canceled']) {
    const out = await desk.report(payout('po_' + status, { status }), 'webhook');
    assert.strictEqual(out.skipped, 'not failed');
  }
  assert.strictEqual(desk.emails.length, 0);
  assert.strictEqual(desk.claimed.size, 0);
});

test('an email that does not send is tried again, not lost', async () => {
  const desk = payoutDesk({ emailFails: 1, stripe: { payouts: {}, bank: NAVY } });
  await assert.rejects(desk.report(payout('po_4'), 'webhook'), /was not reported, the email did not send/,
    'the webhook answers 500 so Stripe sends the event again');
  assert.strictEqual(desk.claimed.size, 0, 'the claim is handed back');
  const retry = await desk.report(payout('po_4'), 'webhook');
  assert.strictEqual(retry.told, true);
  assert.strictEqual(desk.emails.length, 1);
});

test('an unusable id is refused out loud, not reported', async () => {
  const desk = payoutDesk();
  const out = await desk.report({ ...payout('po_5'), id: 'po:5' }, 'webhook');
  assert.strictEqual(out.skipped, 'not a payout');
  assert.strictEqual(desk.emails.length, 0);
});

/* ── The hourly sweep ───────────────────────────────────────────────────── */

test('the sweep reports a failure no webhook delivered, and says it found it', async () => {
  const desk = payoutDesk({ stripe: { payouts: { po_6: payout('po_6'), po_ok: payout('po_ok', { status: 'paid' }) },
                                      bank: NAVY } });
  const out = await desk.sweep();
  assert.match(out, /1 failed payout\(s\) checked, 1 reported to the shop/);
  assert.strictEqual(desk.emails.length, 1);
  assert.match(desk.emails[0].html, /Found by the hourly check against Stripe/);
  const list = desk.calls.find((c) => c.path === '/v1/payouts');
  assert.strictEqual(list.params.status, 'failed', 'only failed payouts are listed');
  const since = Number(list.params['created[gte]']);
  const thirty = Math.floor(Date.now() / 1000) - 30 * 86400;
  assert.ok(Math.abs(since - thirty) < 60, 'it looks back 30 days');
  assert.strictEqual(list.auth, 'Bearer sk_test_x');
});

test('the sweep is quiet once everything has been told', async () => {
  const desk = payoutDesk({ stripe: { payouts: { po_7: payout('po_7') }, bank: NAVY } });
  await desk.sweep();
  assert.strictEqual(await desk.sweep(), '', 'an hourly job that has nothing new says nothing');
  assert.strictEqual(desk.emails.length, 1);
});

test('without a key the sweep says it skipped, rather than claiming all is well', async () => {
  const desk = payoutDesk({ key: null });
  assert.strictEqual(await desk.sweep(), 'skipped: STRIPE_SECRET_KEY is not set');
});

/* ── Wiring ─────────────────────────────────────────────────────────────── */

test('the webhook sends payout.failed here, and the hourly sweep runs the backstop', () => {
  const at = src.indexOf("case 'payout.failed':");
  assert.ok(at > 0, 'payout.failed is handled, not logged as ignored');
  assert.match(src.slice(at, at + 120), /await reportFailedPayout\(obj, 'webhook'\)/);
  const sweep = src.slice(src.indexOf('const runSweep = async () => {'));
  assert.match(sweep.slice(0, sweep.indexOf('setTimeout(runSweep')),
    /await step\('stripe payouts', reconcileFailedPayouts\);/);
});

test('the claim table is keyed on the payout, so one failure is one row', () => {
  const ddl = /CREATE TABLE IF NOT EXISTS stripe_payout_failures \(([\s\S]*?)\n    \)/.exec(src);
  assert.ok(ddl, 'stripe_payout_failures is created at startup');
  assert.match(ddl[1], /id\s+TEXT PRIMARY KEY/);
  /* ON CONFLICT needs a matching constraint, and the primary key is one with
     no predicate to repeat. */
  assert.match(lift('reportFailedPayout'), /ON CONFLICT \(id\) DO NOTHING/);
});
