'use strict';

/* What every email this shop sends must carry.
 *
 * The split matters and is easy to get backwards:
 *
 *   EVERY email  — who sent it and a postal address. CAN-SPAM only demands the
 *                  address on commercial mail, so a receipt is exempt, but it
 *                  is how a person decides a message is from a real business
 *                  rather than a phishing attempt.
 *
 *   MARKETING    — additionally an unsubscribe link, the List-Unsubscribe
 *                  headers Gmail and Yahoo require of bulk senders, and a check
 *                  that the recipient has not already opted out.
 *
 * Unsubscribe must NOT be on transactional mail. A customer who opts out of a
 * receipt, a sign-in code or a payment confirmation stops receiving mail they
 * need, and the shop has no way to know it happened.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const sendEmail = src.slice(src.indexOf('async function sendEmail'),
                            src.indexOf('/* ── Brevo breach monitor'));

test('every email carries the shop identity and postal address', () => {
  /* Applied inside sendEmail, not at the call sites: thirty call sites is
     thirty chances to forget, and the one that forgets is the one reported. */
  assert.match(sendEmail, /html = marketing \? html \+ unsubFooter\(to\) : html \+ shopFooter\(\)/,
    'the footer must be attached centrally, so a new email gets it by existing');
  const footer = src.slice(src.indexOf('function shopFooter'), src.indexOf('function unsubFooter'));
  assert.match(footer, /3047 N Lincoln Ave/, 'a real postal address');
  assert.match(footer, /SHOP_PHONE/, 'and a way to reach a person');
});

test('the everyday footer carries no unsubscribe link', () => {
  /* Opting out of a receipt or a sign-in code is not something a customer can
     be allowed to do by accident. */
  const footer = src.slice(src.indexOf('function shopFooter'), src.indexOf('function unsubFooter'));
  assert.doesNotMatch(footer, /unsubscribe/i);
  assert.doesNotMatch(footer, /unsubToken/);
});

test('marketing mail carries unsubscribe, an address, and one-click headers', () => {
  const unsub = src.slice(src.indexOf('function unsubFooter'), src.indexOf('async function isUnsubscribed'));
  assert.match(unsub, /3047 N Lincoln Ave/, 'address');
  assert.match(unsub, /Unsubscribe<\/a>/, 'a visible opt-out');
  assert.match(src, /'List-Unsubscribe':/, 'and the header Gmail and Yahoo require');
  assert.match(src, /'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'/);
});

test('marketing mail is never sent to someone who opted out', () => {
  assert.match(sendEmail, /if \(marketing && await isUnsubscribed\(to\)\)/,
    'the opt-out is checked before the send, not after');
});

test('a promotional email is marked as one', () => {
  /* The discount-code email shipped without this flag, so it carried no
     address, no unsubscribe, no List-Unsubscribe headers, and would have gone
     to somebody who had explicitly opted out. An email whose entire content is
     an offer is commercial, whatever prompted it. */
  const fn = src.slice(src.indexOf('async function sendDiscountEmail'),
                       src.indexOf("app.post('/discounts/send'"));
  assert.match(fn, /marketing: true/);
});

test('an opted-out recipient is reported, not silently skipped', () => {
  /* sendEmail drops a marketing send to an opted-out address and returns as
     though it worked. The page would say "sent" and the customer would never
     receive it — worse than a refusal, because nobody goes looking. */
  const fn = src.slice(src.indexOf('async function sendDiscountEmail'),
                       src.indexOf("app.post('/discounts/send'"));
  assert.match(fn, /if \(await isUnsubscribed\(email\)\)/);
  assert.match(fn, /send this one by text or call instead/,
    'and it says what to do instead');
});

test('a single-use dollar code says so in the email', () => {
  /* Someone using $30 on a $12 order and expecting $18 back has been misled by
     omission. */
  const fn = src.slice(src.indexOf('async function sendDiscountEmail'),
                       src.indexOf("app.post('/discounts/send'"));
  assert.match(fn, /good for one order/);
});
