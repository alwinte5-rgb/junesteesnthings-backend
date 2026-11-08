'use strict';

/* Fewer repeated notifications (dashboard plan, Part 5, 2026-11-06).
 *
 * One event, one message to the shop. A customer who accepts and pays in the
 * same visit set off "✅ accepted" and then "💳 Deposit paid"; both wait for
 * the daily summary, which now shows them as one entry. One Stripe payment
 * reaching both payment paths is booked, and emailed, once.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const D = require('../tools/lib/shop-digest');
const NOTIFY = require('../tools/lib/notifications');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const accepted = (code, extra = '') => ({ subject: `✅ Quote ${code} accepted — Ada Lovelace $200.00${extra}`, html: '<p>accepted</p>', reply_to: 'ada@example.com' });
const paid = (code, kind = 'Deposit paid') => ({ subject: `💳 ${kind} — quote ${code}, $103.00 (set aside $9.30)`, html: '<p>paid</p>', reply_to: null });

test('accepted and paid in one batch is one entry, where the payment was', () => {
  const out = D.mergeRepeats([accepted('ABC234'), { subject: 'Text from 773', html: 'x' }, paid('ABC234')]);
  assert.deepStrictEqual(out.map((i) => i.subject),
    ['Text from 773', '✅💳 Quote ABC234 accepted — Ada Lovelace $200.00 · Deposit paid, $103.00 (set aside $9.30)'],
    'who and what the job is worth, and that it was a deposit, not paid in full');
  assert.deepStrictEqual(out[1].parts, ['<p>accepted</p>', '<p>paid</p>'], 'both bodies, the accept first');
  assert.strictEqual(out[1].reply_to, 'ada@example.com', 'reply goes to the customer, as the accept email did');
});

test('a balance, or a payment taken in Stripe, folds the same way', () => {
  for (const kind of ['Balance paid', 'Paid in Stripe']) {
    const out = D.mergeRepeats([accepted('QWERTY2345'), paid('QWERTY2345', kind)]);
    assert.strictEqual(out.length, 1, kind);
    assert.match(out[0].subject, new RegExp(`^✅💳 Quote QWERTY2345 accepted — Ada Lovelace \\$200\\.00 · ${kind},`));
  }
});

test('an accept with no payment, or a payment with no accept, is left alone', () => {
  const a = [accepted('ABC234')];
  assert.deepStrictEqual(D.mergeRepeats(a).map((i) => i.subject), a.map((i) => i.subject));
  const p = [paid('ABC234')];
  assert.deepStrictEqual(D.mergeRepeats(p).map((i) => i.subject), p.map((i) => i.subject));
  const other = [accepted('ABC234'), paid('ZZZ999')];
  assert.strictEqual(D.mergeRepeats(other).length, 2, 'different quotes are different events');
});

test('only the first payment takes the accept; a second payment stays its own entry', () => {
  const out = D.mergeRepeats([accepted('ABC234'), paid('ABC234'), paid('ABC234', 'Balance paid')]);
  assert.strictEqual(out.length, 2);
  assert.match(out[0].subject, /accepted — .* · Deposit paid/);
  assert.match(out[1].subject, /^💳 Balance paid/);
});

test('the daily email counts what it shows', () => {
  const built = D.build([accepted('ABC234'), paid('ABC234')], { esc: (s) => String(s), when: () => '' });
  assert.strictEqual(built.subject, "June's Tees daily summary: 1 update");
  assert.strictEqual(built.count, 1);
  assert.match(built.html, /accepted — Ada Lovelace/);
  assert.match(src, /sent \+= mail\.count;/, 'the log counts what the email shows');
});

test('a big merged entry is cut part by part, so a normal body keeps its formatting', () => {
  const big = { ...accepted('ABC234'), html: `<table>${'x'.repeat(D.MAX_ITEM_HTML - 100)}</table>` };
  const built = D.build([big, { ...paid('ABC234'), html: `<p>${'y'.repeat(6000)}</p>` }], { esc: String, when: () => '' });
  assert.match(built.html, /<table>/, 'the accept table stays a table');
  assert.doesNotMatch(built.html, /\(cut short here\)/);
});

test('the server\'s real subjects are the ones merged', () => {
  /* Rendered from the templates in server.js, so rewording one fails here
     instead of quietly bringing back two entries. */
  const tpl = (needle) => {
    const i = src.indexOf(needle);
    assert.notStrictEqual(i, -1, needle);
    return src.slice(i, src.indexOf('`', i + needle.length));
  };
  const accept = tpl('`✅ Quote ${q.code} accepted').slice(1).replace('${q.code}', 'ABC234');
  const deposit = tpl("`💳 ${isBalance ? 'Balance' : 'Deposit'} paid — quote ${code}").slice(1)
    .replace("${isBalance ? 'Balance' : 'Deposit'}", 'Deposit').replace('${code}', 'ABC234');
  const stripe = tpl('`💳 Paid in Stripe — quote ${code}').slice(1).replace('${code}', 'ABC234');
  assert.deepStrictEqual(D.eventOf({ subject: accept }) && D.eventOf({ subject: accept }).kind, 'accepted');
  assert.strictEqual(D.eventOf({ subject: deposit }).label, 'Deposit paid');
  assert.strictEqual(D.eventOf({ subject: stripe }).label, 'Paid in Stripe');
  assert.strictEqual(D.eventOf({ subject: deposit }).code, 'ABC234');
});

test('nothing else is merged or dropped', () => {
  const same = [{ subject: 'Proof approved: Ada (ABC234)', html: 'a' }, { subject: 'Proof approved: Ada (ABC234)', html: 'a' }];
  assert.strictEqual(D.mergeRepeats(same).length, 2, 'removing anything beyond the plan waits for the owner');
  assert.deepStrictEqual(D.mergeRepeats([]), []);
  assert.deepStrictEqual(D.mergeRepeats(null), []);
});

test('one Stripe payment through both paths is booked and emailed once', () => {
  /* The charge path asks Stripe whether a checkout owns the payment and
     leaves it to the checkout webhook, and refuses a charge already booked. */
  assert.match(src, /skipped: 'already in the books'/);
  assert.match(src, /checkout\/sessions\?payment_intent=/);
  assert.match(src, /skipped: 'a checkout payment'/);
  /* A payment already in the ledger answers duplicate before any email. */
  const at = src.indexOf('async function landStripePaymentOnQuote(');
  assert.notStrictEqual(at, -1);
  const land = src.slice(at, src.indexOf('\n}\n', at));
  const guard = land.indexOf('res.duplicate');
  const mail = land.indexOf('sendEmail(');
  assert.ok(guard >= 0, 'the duplicate guard is there');
  assert.ok(mail >= 0, 'the email is there');
  assert.ok(guard < mail, 'the duplicate guard comes before the email');
});

test('a bell notice never repeats an email the shop already gets', () => {
  for (const k of ['approval', 'lead', 'payment', 'review', 'late', 'studio_order', 'studio_checkout']) {
    assert.strictEqual(NOTIFY.KINDS[k].email, false, `${k} is bell-only by default`);
  }
});

/* ── Event tags and the overpaid line (owner, 2026-11-07) ──────────────────── */

const vm = require('node:vm');
const lift = (sig) => {
  const at = src.indexOf(sig);
  assert.notStrictEqual(at, -1, sig);
  let depth = 0, k = src.indexOf('{', src.indexOf(')', at));
  for (let j = k; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced ' + sig);
};
const tagged = (it, event) => ({ ...it, event });
const overpaid = (code, amt = '$5.00') => ({ subject: `💰 Overpaid by ${amt} — quote ${code}`, html: '<p>over</p>' });

test('repeats are combined by the tag, not the subject line', () => {
  const reworded = tagged({ subject: '💳 Money in for quote ABC234, $50.00', html: '<p>paid</p>' }, 'paid:ABC234');
  const out = D.mergeRepeats([tagged(accepted('ABC234'), 'accepted:ABC234'), reworded]);
  assert.strictEqual(out.length, 1, 'a reworded payment subject still folds');
  assert.match(out[0].subject, /accepted — Ada Lovelace \$200\.00 · Money in, \$50\.00$/, 'the quote code is not said twice');
  const wrongTag = tagged(paid('ABC234'), 'paid:ZZZ999');
  assert.strictEqual(D.mergeRepeats([accepted('ABC234'), wrongTag]).length, 2, 'the tag wins over the subject');
});

test('an overpaid alert stays its own entry: only a payment with no email of its own sends one now', () => {
  /* Folding it into the nearest card payment blamed that payment for money a
     later hand-recorded one took (code review, 2026-11-07). */
  const out = D.mergeRepeats([tagged(paid('ABC234'), 'paid:ABC234'), tagged(overpaid('ABC234'), 'overpaid:ABC234')]);
  assert.strictEqual(out.length, 2);
  assert.strictEqual(D.eventOf(tagged(overpaid('ABC234'), 'overpaid:ABC234')).over, '$5.00');
});

test('only a well-formed tag is stored', () => {
  assert.strictEqual(D.validEvent('paid:ABC234'), 'paid:ABC234');
  assert.strictEqual(D.validEvent('overpaid:QWERTY2345'), 'overpaid:QWERTY2345');
  for (const bad of [null, '', 'paid', 'paid:abc234', 'refund:ABC234', 'paid:ABC234; DROP', 'x'.repeat(500)]) {
    assert.strictEqual(D.validEvent(bad), null, String(bad).slice(0, 20));
  }
});

test('the server stores the tag with a held email and reads it back', () => {
  assert.match(src, /ADD COLUMN IF NOT EXISTS event TEXT/);
  assert.match(src, /SHOPDIGEST\.validEvent\(event\)/, 'never a raw value');
  assert.match(src, /RETURNING id, subject, html, reply_to, created_at, event/, 'the sweep reads it back');
  assert.ok(src.includes('event: `accepted:${q.code}`'), 'the accept email is tagged');
  assert.strictEqual(src.split('event: `paid:${code}`').length - 1, 2, 'both card payment emails are tagged');
});

function payDesk({ total = 100, paidBefore = 0, amount }) {
  const alerts = [];
  const sandbox = {
    console: { error() {}, log() {} }, round2: (n) => Math.round(n * 100) / 100, money: (n) => '$' + Number(n).toFixed(2),
    escEmail: String, quoteLink: (c) => 'https://www.jtees.net/q/' + c, quoteTaxable: () => true,
    syncPaidAmount: async () => paidBefore + amount,
    alertShop: async (subject, html, opts) => { alerts.push({ subject, html, opts }); },
    pool: { query: async (sql) => (/SELECT tax, total, taxable/.test(sql) ? { rows: [{ tax: 0, total, taxable: true }] }
      : /SELECT code, name, total, paid_amount, written_off/.test(sql)
        ? { rows: [{ code: 'ABC234', name: 'Ada', total, paid_amount: paidBefore + amount, written_off: 0 }] } : { rows: [] }) },
  };
  vm.createContext(sandbox);
  vm.runInContext([lift('function overpaidBy('), lift('function overpaidNote('), lift('async function recordPayment(')].join('\n'), sandbox);
  return { sandbox, alerts };
}

test('a card payment carries "overpaid by" in its own email; recordPayment does not send a second one', async () => {
  const quiet = payDesk({ amount: 105 });
  const r = await quiet.sandbox.recordPayment({ code: 'ABC234', amount: 105, method: 'card', overInOwnEmail: true });
  assert.strictEqual(r.over, 5, 'the figure comes back to the caller');
  assert.strictEqual(quiet.alerts.length, 0, 'no separate overpaid email');

  const loud = payDesk({ amount: 105 });
  await loud.sandbox.recordPayment({ code: 'ABC234', amount: 105, method: 'cash' });
  assert.strictEqual(loud.alerts.length, 1, 'a payment with no email of its own keeps the alert');
  assert.strictEqual(loud.alerts[0].opts && loud.alerts[0].opts.event, 'overpaid:ABC234', 'tagged');

  const exact = payDesk({ amount: 100 });
  assert.strictEqual((await exact.sandbox.recordPayment({ code: 'ABC234', amount: 100, method: 'cash' })).over, 0);
  assert.strictEqual(exact.alerts.length, 0);

  const note = quiet.sandbox.overpaidNote(5);
  assert.strictEqual(note.suffix, ' · overpaid by $5.00');
  assert.match(note.html, /Refund it, or apply it to another job/);
});

test('both card emails, and the cancelled-quote alert, use the one overpaid note', () => {
  assert.strictEqual(src.split('overNote ? overNote.suffix').length - 1, 2, 'both card subjects');
  assert.strictEqual(src.split('overNote ? overNote.html').length - 1, 3, 'both card bodies and the cancelled alert');
  assert.ok(src.includes("overInOwnEmail: via !== 'apply'"), "'apply' sends no shop email, so it keeps the alert");
});
