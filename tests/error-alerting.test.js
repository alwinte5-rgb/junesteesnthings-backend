'use strict';

/* Somebody finds out when this app breaks.
 *
 * There is no error-tracking dependency, on purpose — the boundary forbids one,
 * and the gap was never CAPTURE. Every failure path already writes a structured
 * console.error and Railway keeps the logs. The gap is NOTICE: nobody reads
 * logs, so a broken page is reported by a customer or not at all.
 *
 * So errors are recorded where they survive a restart, grouped so a repeated
 * failure is one line rather than a flood, and the sweep that already runs every
 * hour mails a digest when there is something to say. Issue #19, built inside
 * the boundary rather than around it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('no error-tracking dependency was added', () => {
  /* The whole reason this is hand-built. If a package ever appears, this
     approach should be deleted rather than kept alongside it. */
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const bad of deps.filter((d) => /sentry|bugsnag|rollbar|airbrake/i.test(d))) {
    assert.fail(`${bad} is a new runtime dependency the boundary forbids`);
  }
});

/* ── it must survive the crash it is reporting ───────────────────────────── */

test('errors are stored in the database, not in memory', () => {
  /* An uncaught exception takes the process with it. A counter held in memory
     dies with it — which is precisely the error you most wanted to hear about. */
  assert.match(src, /CREATE TABLE IF NOT EXISTS app_errors/);
  assert.match(src, /reported_at\s+TIMESTAMPTZ/, 'so a digest is sent once, not forever');
});

test('a repeated failure is one row with a count, not a flood', () => {
  assert.match(src, /ON CONFLICT \(fingerprint\) WHERE reported_at IS NULL/);
  assert.match(src, /count = app_errors\.count \+ 1/);
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS app_errors_open_uniq/,
    'the index the upsert needs');
});

test('the fingerprint ignores digits, so one fault is not counted as many', () => {
  /* "quote AB12CD failed" and "quote EF34GH failed" are the same fault. Without
     this a digest becomes a flood and gets filtered away. */
  const fp = vm.runInThisContext(`((crypto, kind, msg) => {
    ${src.match(/const fp = crypto\.createHash[\s\S]*?\.slice\(0, 32\);/)[0]}
    return fp;
  })`);
  assert.strictEqual(fp(crypto, 'x', 'quote 111 failed'), fp(crypto, 'x', 'quote 222 failed'));
  assert.notStrictEqual(fp(crypto, 'x', 'quote failed'), fp(crypto, 'x', 'upload failed'));
  assert.notStrictEqual(fp(crypto, 'a', 'same'), fp(crypto, 'b', 'same'), 'kind separates faults');
});

test('the recorder can never throw', () => {
  /* An error recorder that can itself fail turns one broken thing into two and
     hides the first. */
  const fn = src.slice(src.indexOf('async function recordError'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /try \{/);
  assert.match(body, /catch \(e\)/);
  assert.match(body, /console\.warn/, 'and must not console.error, which could recurse');
});

/* ── the two ways a failure escapes every try/catch ──────────────────────── */

test('unhandled rejections and uncaught exceptions are both caught', () => {
  assert.match(src, /process\.on\('unhandledRejection'/);
  assert.match(src, /process\.on\('uncaughtException'/);
});

test('an uncaught exception still ends the process', () => {
  /* It leaves the process in an unknown state, and a server that keeps serving
     from one is worse than one Railway restarts. Recording it must not become
     swallowing it. */
  const h = src.slice(src.indexOf("process.on('uncaughtException'"));
  assert.match(h.slice(0, 600), /process\.exit\(1\)/,
    'the process must still die so Railway restarts it');
});

/* ── the digest ──────────────────────────────────────────────────────────── */

test('nothing is emailed when nothing is wrong', () => {
  /* An hourly "all fine" email is one people filter away — and then they filter
     away the one that mattered. */
  const fn = src.slice(src.indexOf('async function sendErrorDigest'));
  assert.match(fn.slice(0, 400), /if \(!rows\.length\) return '';/);
});

test('a digest is sent once, not every hour forever', () => {
  const fn = src.slice(src.indexOf('async function sendErrorDigest'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /UPDATE app_errors SET reported_at = NOW\(\)/);
  assert.match(body, /WHERE reported_at IS NULL/, 'and only unreported ones are selected');
});

test('it runs on the sweep that already exists — no new scheduler', () => {
  assert.match(src, /await step\('error digest', sendErrorDigest\)/);
});

test('a sweep task failing is itself recorded', () => {
  /* Reminders, follow-ups and the supplier sync are jobs nobody watches, so one
     failing silently for a fortnight is exactly what this is for. */
  const sweep = src.slice(src.indexOf('const step = async (name, fn)'));
  assert.match(sweep.slice(0, 900), /recordError\('sweep:' \+ name/);
  assert.match(sweep.slice(0, 900), /name !== 'error digest'/,
    'the digest is excluded — a failure to report errors cannot report itself');
});

test('the money paths report themselves', () => {
  assert.match(src, /recordError\('stripe-webhook'/, 'a webhook that stops banking money');
  assert.match(src, /recordError\('submission-insert'/, 'a lead lost at the form');
});
