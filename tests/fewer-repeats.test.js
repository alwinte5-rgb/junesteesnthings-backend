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
