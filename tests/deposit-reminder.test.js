/* Accepted, no deposit: flagged on the boards, and chased after 12 hours.
 *
 * Owner, 2026-10-07: a customer accepted, the job went onto the production
 * board, and there was no sign that nothing had been paid. Accepting needs no
 * payment (card, Zelle or cash come after), so the board now says "Awaiting
 * deposit", and the one reminder goes out 12 hours after acceptance (it was two
 * days) saying the deposit secures their place in the order cycle and a late
 * one may delay the order.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { T, isGsm7 } = require('../tools/lib/sms-templates');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function liftFn(name) {
  let at = src.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  let i = src.indexOf('(', at);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

const awaitingDeposit = vm.runInNewContext(`${liftFn('awaitingDeposit')}\nawaitingDeposit`);
const job = (over) => ({ accepted_at: '2026-10-07T15:00:00Z', total: 400, paid_amount: 0, written_off: 0, ...over });

test('awaiting deposit: accepted, live, nothing paid', () => {
  assert.strictEqual(awaitingDeposit(job()), true);
  assert.strictEqual(awaitingDeposit(job({ accepted_at: null })), false, 'not accepted: a quote, not a job');
  assert.strictEqual(awaitingDeposit(job({ paid_amount: 200 })), false, 'deposit in');
  assert.strictEqual(awaitingDeposit(job({ paid_amount: '0.01' })), false, 'any payment counts');
  assert.strictEqual(awaitingDeposit(job({ written_off: 400 })), false, 'settled by hand');
  assert.strictEqual(awaitingDeposit(job({ cancelled_at: '2026-10-08' })), false, 'cancelled');
  assert.strictEqual(awaitingDeposit(job({ total: 0, subtotal: 0 })), false, 'nothing to pay');
  assert.strictEqual(awaitingDeposit(null), false);
});

test('the production card and the money board both say so', () => {
  assert.match(src, /\$\{awaitingDeposit\(q\) \? `<div class="kcard-deposit">💳 Awaiting deposit/);
  assert.match(src, /awaitingDeposit\(q\) \? 'awaiting deposit' : st/);
  assert.match(src, /awaiting deposit<\/b>/, 'the board header counts them');
});

/* sendDepositReminders against a fake pool and fake senders. */
async function runReminders(rows, env = {}) {
  const calls = { sql: [], email: [], sms: [] };
  const ctx = {
    process: { env },
    console: { log() {}, error() {} },
    pool: { query: async (sql, args) => { calls.sql.push({ sql, args }); return { rows: /^\s*SELECT/.test(sql) ? rows : [] }; } },
    quoteTotals: (q) => ({ total: q.total, deposit: q.total / 2 }),
    quoteLink: (c) => 'https://www.jtees.net/q/' + c,
    money: (n) => '$' + Number(n).toFixed(2),
    escEmail: (s) => String(s),
    sendClientEmail: async (m) => { calls.email.push(m); },
    sendCustomerSms: async (m) => { calls.sms.push(m); },
    SMS: T,
    ZELLE_HANDLE: 'pay@jtees.net', ZELLE_NAME: "June's Tees", SHOP_PHONE: '(773) 849-1854',
    SHOP_NAME: "June's Tees", SHOP_SIGNER: 'June',
  };
  const fn = vm.runInNewContext(`(${liftFn('sendDepositReminders').replace(/^async function sendDepositReminders/, 'async function')})`, ctx);
  await fn();
  return calls;
}

test('the reminder waits 12 hours, not two days', async () => {
  const c = await runReminders([]);
  assert.match(c.sql[0].sql, /accepted_at <= NOW\(\) - \(\$1 \|\| ' hours'\)::interval/);
  assert.strictEqual(c.sql[0].args[0], '12');
  assert.strictEqual((await runReminders([], { JT_DEPOSIT_NUDGE_HOURS: '6' })).sql[0].args[0], '6');
  /* Still once per job, still never after a refund or a dispute, still only
     on accepted, unpaid, live jobs. */
  for (const clause of ['deposit_nudged_at IS NULL', 'COALESCE(paid_amount,0) = 0', 'cancelled_at IS NULL',
                        "p.kind = 'refund'", 'stripe_disputes']) {
    assert.ok(c.sql[0].sql.includes(clause), 'lost: ' + clause);
  }
});

test('it says the deposit secures their place and a late one may delay the order', async () => {
  const q = { id: 7, code: 'SOHAN1', name: 'Sohan Patel', email: 's@example.com', phone: '7735550100', total: 400 };
  const c = await runReminders([q]);
  assert.ok(c.sql.some((x) => /UPDATE quotes SET deposit_nudged_at=NOW\(\) WHERE id=\$1/.test(x.sql) && x.args[0] === 7),
    'marked as sent, so it goes once');
  const e = c.email[0];
  assert.strictEqual(e.kind, 'deposit-reminder');
  assert.match(e.subject, /Deposit needed to secure your order — quote SOHAN1/);
  assert.match(e.html, /must be paid to secure the position we\s+promised you in our order cycle/);
  assert.match(e.html, /a\s+delay in payment may delay your order/);
  assert.match(e.html, /Sohan, thanks/);
  assert.match(e.html, /Pay \$200\.00 deposit/);
  assert.match(e.html, /memo <b>SOHAN1<\/b>/, 'a Zelle payment can be matched to the job');
  assert.match(e.html, /Already paid by Zelle or cash\?/, 'a customer who paid in a way we have not recorded is not scolded');
  const t = c.sms[0];
  assert.strictEqual(t.kind, 'transactional');
  assert.match(t.msg.body, /secures your place in our order cycle; a late deposit may delay your order/);
});

test('the text fits two segments in plain characters', () => {
  const m = T.depositReminder({ code: 'ABCDEFGHIJKL', amount: 12345.67, first: 'Christopher', link: 'https://www.jtees.net/q/ABCDEFGHIJKL' });
  assert.ok(isGsm7(m.body), m.body);
  assert.ok(m.body.length <= 306, m.body.length + ' chars');
});
