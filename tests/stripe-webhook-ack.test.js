'use strict';

/* Stripe is told the event landed only once it actually has.
 *
 * The handler used to answer 200 immediately and then do the work, reasoning
 * that the work is idempotent. Idempotency is the argument for answering LAST,
 * not first: Stripe retries any non-2xx, and a retry that re-banks a payment
 * already banked is discarded by the quote_payments ext_ref unique index.
 *
 * Acknowledging first threw the retry away. A failed write — a dropped
 * connection, the database restarting mid-deploy — logged one line and stopped,
 * with Stripe already told the event was delivered. Money sitting in Stripe,
 * nothing against the quote, and the only trace a log line nobody reads.
 *
 * That shape has already happened on this system once: the $35.75 on order #10,
 * visible only by opening the Stripe dashboard. Issue #10.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const route = src.slice(src.indexOf("app.post('/webhooks/stripe'"),
                        src.indexOf('async function handleStripeEvent'));

test('the work is awaited BEFORE the 200 is sent', () => {
  const ok = route.indexOf('await handleStripeEvent');
  const ack = route.indexOf('res.sendStatus(200)');
  assert.notStrictEqual(ok, -1, 'the handler must be awaited in the route');
  assert.notStrictEqual(ack, -1, 'the route must acknowledge');
  assert.ok(ok < ack, 'the 200 must come after the work, not before it');
});

test('a failed write asks Stripe to retry instead of swallowing it', () => {
  /* The whole recovery mechanism. Without the 500 the payment is simply lost:
     Stripe has been told it was delivered and will never come back. */
  assert.match(route, /res\.sendStatus\(500\)/,
    'processing failure must answer non-2xx');
  const catchBlock = route.slice(route.indexOf('} catch'));
  assert.match(catchBlock, /console\.error/, 'and still say so in the log');
});

test('the acknowledgement is never sent twice', () => {
  /* The signature checks above answer 401/503 and return. A second answer on
     the same response throws inside the catch, which would turn a clean
     rejection into a 500 and make Stripe retry something it should not. */
  assert.match(route, /if \(!res\.headersSent\) res\.sendStatus\(500\)/,
    'guard the failure answer against an already-answered response');
});

test('signature verification still happens before any work', () => {
  /* Reordering the acknowledgement must not have moved the work above the
     signature check — that would let anyone post events. */
  const sigOk = route.indexOf('timingSafeEqual');
  const work = route.indexOf('await handleStripeEvent');
  assert.notStrictEqual(sigOk, -1, 'signature comparison must still be here');
  assert.ok(sigOk < work, 'nothing may be processed before the signature is verified');
  assert.match(route, /Math\.abs\(Math\.floor\(Date\.now\(\) \/ 1000\) - Number\(parts\.t\)\) > 300/,
    'and the replay window must survive');
});

test('the retry is safe: banking is idempotent by a unique index', () => {
  /* Answering 500 invites Stripe to send the same event again. That is only
     correct because a second delivery cannot bank the money twice. */
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS quote_payments_extref_uniq/,
    'the index that makes a retry harmless');
  assert.match(src, /the loser gets\n \* `duplicate`|`duplicate`/,
    'and the loser of the race is reported as a duplicate rather than banked');
});

test('an alert can still never fail the webhook', () => {
  /* Alerts run inside the awaited work now, so one that throws would turn a
     banked payment into a retry. alertShop swallows its own errors; this is
     what keeps that true. */
  const alert = src.slice(src.indexOf('async function alertShop'));
  assert.match(alert.slice(0, 400), /\.catch\(/,
    'alertShop must swallow its own failure');
});

test('the handler throws on failure rather than reporting success', () => {
  /* handleStripeEvent has no catch of its own — a swallowed error there would
     put back exactly the bug this removes, one level down. */
  const h = src.slice(src.indexOf('async function handleStripeEvent'));
  const body = h.slice(0, h.indexOf('\n}\n'));
  assert.ok(!/catch \(/.test(body.slice(0, body.indexOf('switch'))),
    'no catch may wrap the event dispatch');
});
