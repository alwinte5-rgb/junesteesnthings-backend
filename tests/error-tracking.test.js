'use strict';

/* Production exceptions reach Sentry, and nothing about a customer goes with them.
 *
 * The other half of this is error-alerting.test.js — the app's own `app_errors`
 * digest, which is still the reporter when there is no DSN. This file covers the
 * Sentry sink: that it is wired, that it cannot take the boot down, that it
 * labels which deployment an event came from, and that it does not carry
 * customer data to a third party.
 *
 * Runtime wherever it can be. A regex proving `Sentry.init` appears in a file is
 * the weakest possible evidence — it is satisfied by a comment — and the whole
 * reason this task existed is that the board's check is exactly that grep.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const monitoring = require('../tools/lib/monitoring');

/** Run a snippet in a clean child, so an init in one test cannot leak into the
 *  next — `initMonitoring` latches a module-level flag on purpose. */
function inChild(code, env) {
  return execFileSync(process.execPath, ['-e', code], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SENTRY_DSN: '', SENTRY_ENVIRONMENT: '', ...env },
  }).trim();
}

/* ── it is actually installed ────────────────────────────────────────────── */

test('the SDK is a declared runtime dependency, not a devDependency', () => {
  /* devDependencies are not installed by `npm ci --omit=dev` on Railway, so a
     misfiled SDK is one that exists everywhere except production. */
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@sentry/node'], '@sentry/node must be in dependencies');
  assert.ok(!(pkg.devDependencies || {})['@sentry/node']);
});

test('the SDK resolves and the module loads', () => {
  assert.strictEqual(typeof monitoring.initMonitoring, 'function');
  assert.strictEqual(typeof require('@sentry/node').init, 'function');
});

/* ── it starts early enough to instrument anything ───────────────────────── */

test('monitoring starts before express is required', () => {
  /* The SDK patches modules as they load. Anything required before it is a
     module it can never wrap, and express is the one that matters most here.
     This ordering is a single line and is the easiest thing in the change to
     break by accident — someone tidying the requires into alphabetical order
     would do it and nothing else would complain. */
  const init = src.indexOf('initMonitoring()');
  const express = src.indexOf("require('express')");
  assert.notStrictEqual(init, -1, 'initMonitoring() must be called at the top level');
  assert.notStrictEqual(express, -1);
  assert.ok(init < express, 'initMonitoring() must run before express is required');
});

/* ── no DSN is a degraded mode, never an outage ──────────────────────────── */

test('with no DSN the module is inert and reports so', () => {
  const out = inChild(`
    const m = require('./tools/lib/monitoring');
    console.log(JSON.stringify({ started: m.initMonitoring(), on: m.monitoringEnabled() }));
  `);
  assert.deepStrictEqual(JSON.parse(out), { started: false, on: false });
});

test('a malformed DSN warns and carries on — it never throws', () => {
  /* A monitoring SDK that can crash the boot has made the storefront less
     reliable than it was with no monitoring at all. */
  const out = inChild(`
    const m = require('./tools/lib/monitoring');
    let threw = null;
    try { m.initMonitoring(); } catch (e) { threw = e.message; }
    console.log(JSON.stringify({ threw, on: m.monitoringEnabled() }));
  `, { SENTRY_DSN: 'this-is-not-a-dsn' });
  const r = JSON.parse(out);
  assert.strictEqual(r.threw, null, 'init must never throw');
  assert.strictEqual(r.on, false, 'and must not claim to be reporting');
});

test('capturing before init is a no-op, not a crash', () => {
  const out = inChild(`
    const m = require('./tools/lib/monitoring');
    m.captureError('x', new Error('y'));
    console.log('survived');
  `);
  assert.strictEqual(out, 'survived');
});

test('the boot warns when nothing will reach Sentry', () => {
  /* Silence here is the failure mode: a deploy that reports nothing looks
     exactly like a deploy with no errors. */
  assert.match(src, /WARNING: SENTRY_DSN is not set/);
});

/* ── environment labels ──────────────────────────────────────────────────── */

test('an unlabelled environment is "development", never production', () => {
  /* A laptop must not be able to raise a production alert. Defaulting the other
     way makes every alert rule untrustworthy the first time someone runs the
     server locally with the production DSN in their .env. */
  const out = inChild(`
    console.log(require('./tools/lib/monitoring').environmentName());
  `, { NODE_ENV: '', RAILWAY_ENVIRONMENT_NAME: '' });
  assert.strictEqual(out, 'development');
});

test('Railway names the environment, and an explicit override wins', () => {
  assert.strictEqual(
    inChild(`console.log(require('./tools/lib/monitoring').environmentName());`,
      { RAILWAY_ENVIRONMENT_NAME: 'production' }),
    'production');
  assert.strictEqual(
    inChild(`console.log(require('./tools/lib/monitoring').environmentName());`,
      { RAILWAY_ENVIRONMENT_NAME: 'production', SENTRY_ENVIRONMENT: 'staging' }),
    'staging', 'SENTRY_ENVIRONMENT must override the platform');
});

test('the release is the deployed commit, so a regression names its deploy', () => {
  assert.strictEqual(
    inChild(`console.log(String(require('./tools/lib/monitoring').releaseName()));`,
      { RAILWAY_GIT_COMMIT_SHA: 'abcdef1234567890' }),
    'junes-tees@abcdef1');
  assert.strictEqual(
    inChild(`console.log(String(require('./tools/lib/monitoring').releaseName()));`,
      { RAILWAY_GIT_COMMIT_SHA: '' }),
    'undefined', 'and is absent rather than invented when there is no deploy');
});

test('events are tagged with the project, for a shared Sentry org', () => {
  /* One org, a project per app. Without the tag, a combined issues view cannot
     say which of the portfolio's apps an event came from. */
  const mod = fs.readFileSync(path.join(root, 'tools', 'lib', 'monitoring.js'), 'utf8');
  assert.match(mod, /project: 'junes-tees'/);
});

/* ── customer data must not leave this app ───────────────────────────────── */

test('the request body, headers and cookies are never sent', () => {
  /* This is a storefront. Bodies carry names, addresses and emails; headers
     carry the admin password and session cookies. A leak here does not throw —
     it just quietly ships a customer's address to a third party. */
  const cleaned = monitoring.scrubEvent({
    request: {
      method: 'POST',
      url: 'https://jtees.net/api/quotes/AB12CD',
      data: { email: 'customer@example.com', address: '1 Real Street' },
      headers: { cookie: 'session=abc', authorization: 'Basic hunter2' },
      cookies: { session: 'abc' },
    },
    user: { email: 'customer@example.com', ip_address: '203.0.113.7' },
  });
  assert.deepStrictEqual(Object.keys(cleaned.request).sort(), ['method', 'url']);
  assert.strictEqual(cleaned.request.data, undefined);
  assert.strictEqual(cleaned.request.headers, undefined);
  assert.strictEqual(cleaned.request.cookies, undefined);
  assert.strictEqual(cleaned.user, undefined);
  assert.strictEqual(cleaned.request.method, 'POST', 'what is useful is kept');
});

test('the query string is stripped, because it can hold a token', () => {
  /* Unsubscribe links are signed and the signature rides in the query. */
  const cleaned = monitoring.scrubEvent({
    request: { method: 'GET', url: 'https://jtees.net/unsub?token=SECRETVALUE&e=a@b.com' },
  });
  assert.strictEqual(cleaned.request.url, '/unsub');
  assert.ok(!JSON.stringify(cleaned).includes('SECRETVALUE'));
});

test('scrubbing a malformed or absent url does not throw', () => {
  assert.doesNotThrow(() => monitoring.scrubEvent({ request: { method: 'GET', url: ':::' } }));
  assert.doesNotThrow(() => monitoring.scrubEvent({ request: { method: 'GET' } }));
  assert.doesNotThrow(() => monitoring.scrubEvent({}));
});

test('PII is off at the SDK level too, not only in the scrubber', () => {
  const mod = fs.readFileSync(path.join(root, 'tools', 'lib', 'monitoring.js'), 'utf8');
  assert.match(mod, /sendDefaultPii:\s*false/);
  assert.match(mod, /beforeSend:\s*scrub/, 'and the scrubber is actually installed');
});

test('tracing is off, so the free tier is spent on errors', () => {
  const mod = fs.readFileSync(path.join(root, 'tools', 'lib', 'monitoring.js'), 'utf8');
  assert.match(mod, /tracesSampleRate:\s*0\b/);
});

/* ── one funnel, two sinks ───────────────────────────────────────────────── */

test('reportError feeds Sentry and the database from one call', () => {
  const fn = src.slice(src.indexOf('function reportError'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /captureError\(/, 'the Sentry sink');
  assert.match(body, /recordError\(/, 'the database sink');
  assert.ok(body.indexOf('captureError(') < body.indexOf('recordError('),
    'Sentry goes first: the database is what fails when the database is broken');
});

test('nothing reports to only one sink', () => {
  /* The bug this prevents: `recordError` still exists and still works, so a new
     failure path written the way the old ones were written lands in the digest
     and never reaches Sentry. Four call sites were already like that when the
     SDK went in — including the Stripe webhook, which is the one that stops
     money being banked.
     `reportError` is the only front door. recordError may appear only where it
     is defined and where the funnel calls it. */
  const offenders = src
    .split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /(?<![A-Za-z])recordError\s*\(/.test(line))
    .filter(([, line]) => !/async function recordError/.test(line))
    .filter(([, line]) => !/return recordError\(kind, message/.test(line));
  assert.deepStrictEqual(offenders, [],
    'these call recordError directly and so skip Sentry — use reportError');
});

test('the crash handlers report to both sinks', () => {
  const rej = src.slice(src.indexOf("process.on('unhandledRejection'"));
  assert.match(rej.slice(0, 400), /reportError\('unhandledRejection'/);
  const exc = src.slice(src.indexOf("process.on('uncaughtException'"));
  assert.match(exc.slice(0, 1200), /reportError\('uncaughtException'/);
});

test('each crash hook is registered exactly once', () => {
  /* Node runs EVERY listener for these events, so a second one does not replace
     the first — it runs after it. server.js carried two `unhandledRejection`
     listeners for a while and logged every rejection twice, which is noise in
     the place you least want it. A duplicate is also how a rejection could end
     up reported twice and counted as two faults. */
  const count = (needle) => src.split(needle).length - 1;
  assert.strictEqual(count("process.on('unhandledRejection'"), 1);
  assert.strictEqual(count("process.on('uncaughtException'"), 1);
});

test('a crash flushes Sentry before the process dies, but cannot be held up by it', () => {
  /* captureException only queues. Exiting immediately loses the queue — which
     is the report of the crash, the one you most wanted. Equally, a hung flush
     must not keep a broken process serving, so the exit is scheduled
     unconditionally as well. */
  const exc = src.slice(src.indexOf("process.on('uncaughtException'"));
  const body = exc.slice(0, exc.indexOf('\n});'));
  assert.match(body, /flushMonitoring\(/, 'the queue is flushed');
  assert.match(body, /setTimeout\(exit, 2500\)\.unref\(\)/,
    'and the exit happens even if a sink never settles');
});

test('HTTP 500s are reported — they used to go nowhere at all', () => {
  /* Before this, the express error handler only wrote console.error. A route
     throwing on every request was indistinguishable from a route nobody
     visited, and the digest never mentioned it once. */
  const h = src.slice(src.indexOf('app.use((err, req, res, _next)'));
  const body = h.slice(0, h.indexOf('\n});'));
  assert.match(body, /reportError\(`http:/);
  assert.match(body, /entity\.too\.large/, 'but an oversized request body is the caller, not us');
  assert.ok(h.indexOf('reportError') < h.indexOf('res.status(500)') + 200,
    'and reporting does not block the response');
});

test('one broken route is one fault, not one per customer', () => {
  /* `/api/quotes/AB12CD` as a grouping key turns a single failing route into a
     hundred issues in Sentry and a flood in the digest. */
  const fnSrc = src.slice(src.indexOf('function routeShape'));
  const routeShape = eval(`(${fnSrc.slice(0, fnSrc.indexOf('\n}') + 2)})`); // eslint-disable-line no-eval
  assert.strictEqual(routeShape('/api/quotes/AB12CD/pay'), '/api/quotes/:id/pay');
  assert.strictEqual(routeShape('/api/quotes/1029/pay'), '/api/quotes/:id/pay');
  assert.strictEqual(routeShape('/unsub/9f2ab7c4d5e6f70819a2b3c4d5e6f708'), '/unsub/:id');
  assert.strictEqual(routeShape('/health'), '/health', 'a plain route is left alone');
  assert.strictEqual(routeShape('/api/products/categories'), '/api/products/categories');
});

/* ── the test event ──────────────────────────────────────────────────────── */

test('the test-event script checks the ingest response, not just the flush', () => {
  /* The first version of that script reported PASS against a DSN whose project
     does not exist: `Sentry.flush()` resolves true when the QUEUE drains, which
     it does whether Sentry answered 200 or 400. A verification that passes
     against a made-up project verifies nothing, and this is the assertion that
     stops it being written that way again. */
  const t = fs.readFileSync(path.join(root, 'tools', 'sentry-test.js'), 'utf8');
  assert.match(t, /afterSendEvent/, 'the hook that exposes the HTTP status');
  assert.match(t, /statusCode/);
  assert.match(t, /status < 200 \|\| status >= 300/, 'and a non-2xx is a failure');
  assert.match(t, /process\.exit\(1\)/, 'which exits non-zero');
});

test('the test script fails loudly when the project does not exist', () => {
  /* The real thing, end to end, against a well-formed DSN for a project that
     cannot exist: Sentry answers 400 and the script must call that a failure.
     This is the test that would have caught the false pass. */
  let code = 0;
  let out = '';
  try {
    out = execFileSync(process.execPath, ['tools/sentry-test.js'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        SENTRY_ENVIRONMENT: 'development',
        SENTRY_DSN: 'https://abc123@o4500000000000000.ingest.us.sentry.io/4500000000000000',
      },
    });
  } catch (e) {
    code = e.status;
    out = `${e.stdout || ''}${e.stderr || ''}`;
  }
  assert.strictEqual(code, 1, `the script must exit non-zero. output:\n${out}`);
  assert.match(out, /FAIL/);
  assert.doesNotMatch(out, /^PASS/m);
});
