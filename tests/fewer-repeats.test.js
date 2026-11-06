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
    ['Text from 773', '✅💳 Quote ABC234 accepted and paid, $103.00 (set aside $9.30)']);
  assert.match(out[1].html, /accepted[\s\S]*paid/, 'both bodies, the accept first');
  assert.strictEqual(out[1].reply_to, 'ada@example.com', 'reply goes to the customer, as the accept email did');
});

test('a balance, or a payment taken in Stripe, folds the same way', () => {
  for (const kind of ['Balance paid', 'Paid in Stripe']) {
    const out = D.mergeRepeats([accepted('QWERTY2345'), paid('QWERTY2345', kind)]);
    assert.strictEqual(out.length, 1, kind);
    assert.match(out[0].subject, /^✅💳 Quote QWERTY2345 accepted and paid/);
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
  assert.match(out[0].subject, /accepted and paid/);
  assert.match(out[1].subject, /^💳 Balance paid/);
});

test('the daily email counts what it shows', () => {
  const built = D.build([accepted('ABC234'), paid('ABC234')], { esc: (s) => String(s), when: () => '' });
  assert.strictEqual(built.subject, "June's Tees daily summary: 1 update");
  assert.match(built.html, /accepted and paid/);
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
  assert.match(src, /if \(await chargeInBooks\(pi, extRef\)\) return \{ skipped: 'already in the books' \};/);
  assert.match(src, /checkout\/sessions\?payment_intent=\$\{encodeURIComponent\(pi\)\}&limit=1`\);\s*if \(Array\.isArray\(s\.data\) && s\.data\.length\) return \{ skipped: 'a checkout payment' \};/);
  /* A payment already in the ledger answers duplicate before any email. */
  const land = src.slice(src.indexOf('async function landStripePaymentOnQuote('), src.indexOf('async function landStripePaymentOnQuote(') + 2500);
  assert.ok(land.indexOf('if (res.duplicate) return') < land.indexOf('sendEmail('), 'the duplicate guard comes before the email');
});

test('a bell notice never repeats an email the shop already gets', () => {
  for (const k of ['approval', 'lead', 'payment', 'review', 'late', 'studio_order', 'studio_checkout']) {
    assert.strictEqual(NOTIFY.KINDS[k].email, false, `${k} is bell-only by default`);
  }
});
