'use strict';

/* One enquiry, however many times the button is pressed.
 *
 * The client disables its submit button, which covers a slow double-click and
 * nothing else. A back-button resubmit, a flaky-connection retry, or a second
 * tab all arrive as ordinary requests, and /submit inserted unconditionally.
 *
 * The cost is not just a duplicate lead. One enquiry fans out to a customer
 * confirmation email, a Brevo contact, a HubSpot deal and a Clover customer —
 * so the person is told twice and the shop chases one job as two. Issue #9.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = src.slice(src.indexOf("app.post('/submit'"),
                        src.indexOf("app.post('/submit'") + 9000);

/* ── the guard is the write, not a check before it ───────────────────────── */

test('the duplicate is rejected BY the insert, not by a lookup before it', () => {
  /* Two clicks arrive concurrently. A SELECT-then-INSERT loses that race and
     both rows land, which is the shape that reads correct and is not. */
  assert.match(route, /ON CONFLICT \(dedupe_key\) DO NOTHING/,
    'the insert itself must decide the race');
  assert.match(route, /RETURNING id/);
  const insertAt = route.indexOf('INSERT INTO submissions');
  const selectAt = route.indexOf('SELECT 1 FROM submissions');
  assert.ok(insertAt < selectAt || selectAt === -1,
    'nothing may gate the insert on a prior read of the same key');
});

test('a unique index backs it, so the race has an arbiter', () => {
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS submissions_dedupe_uniq/);
  assert.match(src, /ON submissions \(dedupe_key\) WHERE dedupe_key IS NOT NULL/,
    'partial, so rows written before this existed are unaffected');
});

/* ── what counts as the same enquiry ─────────────────────────────────────── */

const dedupe = vm.runInThisContext(`((crypto, s, bucket) => {
  ${route.match(/const dedupeAt = [\s\S]*?\.digest\('hex'\);/)[0]}
  return dedupeAt(bucket);
})`);

const S = { email: 'a@b.com', phone: '7735551234', description: '24 tees, 1 colour' };

test('the same enquiry in the same window is one key', () => {
  assert.strictEqual(dedupe(crypto, S, 100), dedupe(crypto, S, 100));
});

test('a different person, or different text, is a different enquiry', () => {
  assert.notStrictEqual(dedupe(crypto, S, 100),
    dedupe(crypto, { ...S, email: 'c@d.com' }, 100));
  assert.notStrictEqual(dedupe(crypto, S, 100),
    dedupe(crypto, { ...S, phone: '7735559999' }, 100));
  assert.notStrictEqual(dedupe(crypto, S, 100),
    dedupe(crypto, { ...S, description: '48 tees' }, 100));
});

test('the same words next week are a real second enquiry', () => {
  /* Why the key carries a time bucket rather than being a permanent content
     hash: short descriptions repeat honestly. "need shirts" a month later is a
     new customer intent, not a duplicate, and swallowing it loses a lead. */
  assert.notStrictEqual(dedupe(crypto, S, 100), dedupe(crypto, S, 101));
});

test('the bucket edge is covered, not left as a gap', () => {
  /* Two clicks either side of a boundary get different keys and would both
     insert. The previous bucket is claimed too, within the same window. */
  assert.match(route, /dedupeAt\(nowBucket - 1\)/, 'the previous bucket is consulted');
  assert.match(route, /INTERVAL '10 minutes'/, 'and only while it is still recent');
});

/* ── what a duplicate does ───────────────────────────────────────────────── */

test('a duplicate answers success — the enquiry IS with the shop', () => {
  assert.match(route, /return res\.json\(\{ ok: true, duplicate: true \}\)/,
    'the person pressing the button has not failed at anything');
});

test('a duplicate does NOT fan out a second time', () => {
  /* The actual damage: a second confirmation email, a second HubSpot deal, a
     second Clover customer. The early return must sit BEFORE the fan-out. */
  const dupReturn = route.indexOf('duplicate: true');
  const fanout = route.indexOf('sendCustomerConfirmationEmail');
  assert.notStrictEqual(fanout, -1, 'the fan-out is still in this route');
  assert.ok(dupReturn < fanout,
    'the duplicate must return before any email, CRM or Clover call');
});

test('a genuine insert failure is still an error, not a silent success', () => {
  /* DO NOTHING makes "no row" mean duplicate. A thrown error still has to
     reach the customer as a failure, or a lost enquiry looks like a sent one. */
  assert.match(route, /return res\.status\(500\)\.json\(\{ error: 'Failed to save submission\.' \}\)/);
});
