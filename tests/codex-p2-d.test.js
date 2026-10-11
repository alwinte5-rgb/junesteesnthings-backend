/* Codex P2 backlog, backend chunk D (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#129 drafts: cancelling keeps them private, no payment, no customer message, not counted as waiting', () => {
  assert.match(after("app.post('/admin/quote/:code/cancel'", 3000), /status = CASE WHEN status = 'draft' THEN 'draft' ELSE 'cancelled' END/);
  assert.match(after("app.post('/admin/quote/:code/mark-paid'", 2500), /if \(q\.status === 'draft'\) return res\.redirect/);
  assert.match(after('async function moveJobToStage(', 1500), /if \(\['draft', 'held'\]\.includes\(String\(before\.status \|\| ''\)\)\) notify = false;/);
  assert.match(src, /gQuotes\.filter\(\(q\) => q\.status !== 'draft'\)\.length\} waiting on the customer/);
  assert.match(after('async function customerHistory(', 700), /AND status <> 'draft'/);
});
test('#129 the quote form submits once', () => {
  assert.match(src, /if \(qf\.getAttribute\('data-sent'\) === '1'\) \{ e\.preventDefault\(\); return; \}/);
  assert.match(src, /window\.addEventListener\('pageshow', function\(ev\)\{\s*if \(!ev\.persisted\) return;/);
});
test('#123 conversion divides one cohort by itself', () => {
  assert.match(src, /AS conv_base/);
  assert.equal((src.match(/x\.convBase \? /g) || []).length, 2);
});
test('#127 the changes estimate counts shared freight once', () => {
  assert.match(src, /if \(sharedSeen\[al\.code\]\) sub -= Number\(al\.total\) \|\| 0; else sharedSeen\[al\.code\] = 1;/);
});
test('#127 a failed deal update after acceptance is retried hourly', () => {
  assert.match(src, /await step\('brevo quote re-sync', brevoQuoteResync\);/);
  assert.match(after('async function brevoQuoteResync()', 1200), /brevo_resync_at = NULL/);
});
