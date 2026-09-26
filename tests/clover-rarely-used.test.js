'use strict';

/* Clover is the in-store till, and the owner rarely uses it (2026-09-26).
 *
 * Run: node --test tests/*.test.js
 *
 * Its API token was found rejected (401) that day. Two consequences, fixed
 * differently because they matter differently:
 *
 *  - Every quote-form enquiry also created a Clover customer. With the token
 *    dead that failed on every lead, and a digest line per lead for a system
 *    nobody reads is how a digest gets muted. Now opt-in: CLOVER_SYNC_LEADS=1.
 *  - The payment webhook looks each payment up with the same token BEFORE the
 *    money is written down, after already answering Clover 200 — so a failure
 *    there lost the payment from the sales-tax ledger with only a log line.
 *    Rare is exactly when nobody is watching, so that one now reports.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const submitAt = src.indexOf("app.post('/submit'");
assert.notStrictEqual(submitAt, -1, '/submit not found in server.js');
const submit = src.slice(submitAt, src.indexOf('\n});', submitAt));

const hookAt = src.indexOf("app.post('/webhooks/clover'");
assert.notStrictEqual(hookAt, -1, '/webhooks/clover not found in server.js');
const hook = src.slice(hookAt, src.indexOf('\n});', hookAt));

test('an enquiry becomes a Clover customer only when CLOVER_SYNC_LEADS=1', () => {
  assert.match(submit, /process\.env\.CLOVER_SYNC_LEADS === '1'/);
  const call = submit.indexOf('createCloverCustomer(s)');
  assert.notStrictEqual(call, -1, 'the opt-in path must still exist');
  assert.match(submit.slice(Math.max(0, call - 40), call), /syncClover \?/,
    'the Clover call must sit behind the opt-in, not run for every lead');
});

test('a skipped Clover step writes no customer id', () => {
  assert.match(submit, /cloverResult\.status === 'fulfilled' && cloverResult\.value !== undefined/,
    'skipped must not be read as "created, with id undefined"');
});

test('a Clover payment the webhook cannot process is reported with its id', () => {
  const tail = hook.slice(hook.lastIndexOf('catch (err)'));
  assert.match(tail, /reportError\('clover-webhook', err, `payment \$\{paymentId\}`\)/,
    'Clover was already answered 200 and will not resend — a log line is the payment gone');
});
