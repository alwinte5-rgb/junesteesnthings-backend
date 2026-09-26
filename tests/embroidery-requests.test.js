'use strict';

/* An embroidery request is kept, not only emailed (server.js
 * /api/embroidery-quote, #117).
 *
 * Run: node --test tests/*.test.js
 *
 * Until 2026-09-26 the request existed only as an email to the shop: if that
 * email failed the request was gone, it never showed on the admin leads page,
 * and a failed Brevo sync could not be retried. It is now a row in
 * `submissions`, like a quote-form enquiry.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const at = src.indexOf("app.post('/api/embroidery-quote'");
assert.notStrictEqual(at, -1, '/api/embroidery-quote not found in server.js');
const route = src.slice(at, src.indexOf('\n});', at));

test('the request is saved to submissions before any email is sent', () => {
  const insertAt = route.indexOf('INSERT INTO submissions');
  assert.notStrictEqual(insertAt, -1, 'the request must be stored');
  assert.ok(insertAt < route.indexOf('await sendEmail('), 'stored first, so a failed email cannot lose it');
});

test('a second click is one request, and the guard names the partial index predicate', () => {
  assert.match(route, /ON CONFLICT \(dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/,
    'without the WHERE, Postgres refuses every insert — the bug that cost the quote form 25 days');
  assert.match(route, /if \(!rows\.length\) return res\.json\(\{ ok: true, duplicate: true \}\)/);
});

test('a saved request survives a failed shop email; an unsaved one does not pretend', () => {
  assert.match(route, /reportError\('embroidery:notify-shop', err\)/);
  assert.match(route, /if \(!savedId\) throw err;/,
    'not saved and not emailed must reach the customer as a failure');
});

test('a saved request that reached Brevo is marked, so the catch-up leaves it alone', () => {
  assert.match(route, /savedId && pool\.query\('UPDATE submissions SET brevo_synced_at = NOW\(\) WHERE id = \$1'/);
});
