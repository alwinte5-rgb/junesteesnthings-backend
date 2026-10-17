'use strict';

/* The quote form must survive a second press of Send (public/index.html).
 *
 * Run: node --test tests/*.test.js
 *
 * A Turnstile token is single-use and lasts five minutes, and the server spends
 * it on every attempt — including one that then fails. The widget used to be
 * rendered implicitly and never renewed, so on 2026-09-26 the owner's own retry
 * (same page, 26 minutes after a failed first try) was refused with "Please
 * complete the human check" and nothing on screen to complete; only a reload
 * got it through. The form token had the same shape of problem over 30-60
 * minutes, answered with a bare "Bad request".
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/* The form's code lives in public/assets/js/quote-form.js (shared by the
   homepage, /contact and the designer's occasion pages since 2026-10-17). */
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'quote-form.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const handlerAt = js.indexOf("form.addEventListener('submit'");
assert.notStrictEqual(handlerAt, -1, 'the quote form submit handler was not found in quote-form.js');
const handler = js.slice(handlerAt, js.indexOf('\n    });', handlerAt));

/* ── the script's own token helpers, run against a fake widget ───────────── */

function helpers(turnstile) {
  const sandbox = {
    window: { turnstile }, location: { href: 'https://www.jtees.net/', origin: 'https://www.jtees.net' },
    document: { currentScript: null, readyState: 'complete', getElementById: () => null, querySelectorAll: () => [] },
    fetch: () => new Promise(() => {}),        // /api/config never answers here
    setTimeout, Promise, Date, URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox);
  const t = sandbox.window.JTQuoteForm._turnstile(null);
  return {
    turnstileReady: t.ready, renewTurnstile: t.renew, turnstileToken: t.token,
    mount: t._mount, fail: t._fail,
  };
}

function fakeWidget({ token = '', expired = false, tokenAfterReset = 'fresh' } = {}) {
  const w = { token, expired, resets: 0 };
  w.api = {
    getResponse: () => w.token,
    isExpired: () => w.expired,
    // A reset clears the token; the invisible check hands out a new one shortly.
    reset: () => { w.resets++; w.token = ''; w.expired = false; setTimeout(() => { w.token = tokenAfterReset; }, 300); },
  };
  return w;
}

test('with no widget on the page there is nothing to wait for', async () => {
  const h = helpers(fakeWidget().api);
  assert.strictEqual(await h.turnstileReady(1000), true);
});

test('a token already there is used at once', async () => {
  const w = fakeWidget({ token: 'tok' });
  const h = helpers(w.api); h.mount('w1');
  assert.strictEqual(await h.turnstileReady(1000), true);
  assert.strictEqual(h.turnstileToken(), 'tok');
});

test('an expired token is renewed before sending, and the new one is waited for', async () => {
  const w = fakeWidget({ token: 'stale', expired: true });
  const h = helpers(w.api); h.mount('w1');
  assert.strictEqual(await h.turnstileReady(3000), true);
  assert.strictEqual(w.resets, 1);
  assert.strictEqual(h.turnstileToken(), 'fresh');
});

test('a token that never comes is reported, not sent empty', async () => {
  const w = fakeWidget({ token: '' });
  const h = helpers(w.api); h.mount('w1');
  assert.strictEqual(await h.turnstileReady(600), false);
});

test('a check that errored is not waited on', async () => {
  const w = fakeWidget({ token: '' });
  const h = helpers(w.api); h.mount('w1'); h.fail();
  const t0 = Date.now();
  assert.strictEqual(await h.turnstileReady(5000), false);
  assert.ok(Date.now() - t0 < 1000, 'a failed widget must not cost the customer the full wait');
});

test('renewing asks the widget for a new token', () => {
  const w = fakeWidget({ token: 'spent' });
  const h = helpers(w.api); h.mount('w1');
  h.renewTurnstile();
  assert.strictEqual(w.resets, 1);
  assert.strictEqual(h.turnstileToken(), '', 'the spent token must not be offered again');
});

/* ── the submit handler uses them ─────────────────────────────────────────── */

test('the widget is rendered explicitly, so the page holds its id', () => {
  assert.match(js, /turnstile\/v0\/api\.js\?render=explicit&onload=jtTurnstileReady/);
  assert.match(html, /<script src="\/assets\/js\/quote-form\.js\?v=[0-9a-f]{8}" defer><\/script>/, 'the homepage loads the shared form script');
  assert.doesNotMatch(html, /let tsWidget = null;/, 'no second copy of the form code left in the page');
});

test('the token is waited for before the enquiry is posted', () => {
  const waitAt = handler.indexOf('ts.ready(');
  assert.ok(waitAt !== -1 && waitAt < handler.indexOf("fetch(API + '/submit'"),
    'posting without a token is a guaranteed refusal');
});

test('nobody is stopped by the check: the enquiry is sent whatever it says', () => {
  const between = handler.slice(handler.indexOf('ts.ready('), handler.indexOf("fetch(API + '/submit'"));
  // The wait's answer is never read, so nothing between it and the post can
  // turn the enquiry away.
  assert.match(between, /^ts\.ready\(\d+\)\.then\(function \(\) \{/,
    'a browser that cannot run the check must still reach the shop (allowMissingTurnstile)');
  assert.doesNotMatch(between, /\breturn;|throw\b/,
    'a browser that cannot run the check must still reach the shop (allowMissingTurnstile)');
});

test('every attempt is followed by a fresh token, failed ones included', () => {
  const fin = handler.slice(handler.lastIndexOf('.catch('));
  assert.match(fin, /\}\)\.then\(function \(\) \{[\s\S]*ts\.renew\(\)/, 'the server spends the token on every attempt');
});

test('the form token is fetched fresh at send time, not only at page load', () => {
  const at = handler.indexOf("getJSON('/api/form-token')");
  assert.ok(at !== -1 && at < handler.indexOf("fetch(API + '/submit'"),
    'a token from page load is refused after 30-60 minutes');
});

/* ── and the server says when it happens ──────────────────────────────────── */

test('a missing token is logged, not refused in silence', () => {
  const start = src.indexOf('async function verifyTurnstile(');
  const fn = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(fn, /if \(!token\) \{[\s\S]*?console\.warn\('turnstile: no token/);
});

/* The server half of "nobody is stopped": on the quote form a request with no
   token continues, flagged; everywhere else it is still refused; and a token
   that is sent and FAILS is refused even on the quote form. */
function runVerify(req, cloudflareSays) {
  const start = src.indexOf('async function verifyTurnstile(');
  const fn = src.slice(start, src.indexOf('\n}\n', start) + 2);
  const sandbox = {
    process: { env: { TURNSTILE_SECRET_KEY: 'secret' } },
    console: { warn() {}, error() {} },
    URLSearchParams, AbortSignal, clientIp: () => '203.0.113.9',
    fetch: async () => ({ json: async () => cloudflareSays }),
  };
  vm.createContext(sandbox);
  vm.runInContext(fn, sandbox);
  const out = { next: false, status: null, body: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  return sandbox.verifyTurnstile(req, res, () => { out.next = true; }).then(() => out);
}

test('quote form: no token continues, marked missing', async () => {
  const req = { body: {}, path: '/submit', turnstileMayBeMissing: true };
  const out = await runVerify(req, null);
  assert.strictEqual(out.next, true);
  assert.strictEqual(req.humanCheck, 'missing');
});

test('any other route: no token is still refused', async () => {
  const out = await runVerify({ body: {}, path: '/api/embroidery-quote' }, null);
  assert.strictEqual(out.next, false);
  assert.strictEqual(out.status, 400);
});

test('a token that is sent and fails is refused, even on the quote form', async () => {
  const req = { body: { 'cf-turnstile-response': 'forged' }, path: '/submit', turnstileMayBeMissing: true };
  const out = await runVerify(req, { success: false, 'error-codes': ['invalid-input-response'] });
  assert.strictEqual(out.next, false);
  assert.strictEqual(out.status, 400);
});

test('only the quote form, which has the form-token check in front, lets a missing token through', () => {
  assert.match(src, /app\.post\('\/submit', [^\n]*rejectBots, allowMissingTurnstile, verifyTurnstile/);
  const emb = src.slice(src.indexOf("app.post('/api/embroidery-quote'"));
  assert.doesNotMatch(emb.slice(0, emb.indexOf('\n')), /allowMissingTurnstile/,
    'the embroidery endpoint has no form-token check, so it stays strict');
});

test('an unchecked enquiry is kept and flagged, but nothing goes to the address typed in', () => {
  const at = src.indexOf("app.post('/submit'");
  const submit = src.slice(at, src.indexOf('\n});', at));
  assert.match(submit, /sendNotificationEmail\(s, \{ unverified \}\)/, 'the shop still hears about it');
  assert.match(submit, /unverified \? Promise\.resolve\(undefined\) : sendCustomerConfirmationEmail\(s\)/,
    'no confirmation: the form must not be usable to email strangers');
  assert.match(submit, /unverified \? Promise\.resolve\(undefined\) : syncToBrevo\(s\)/,
    'no Brevo list: the form must not be usable to subscribe strangers');
  assert.match(submit, /SET human_check = 'missing'/, 'and the catch-up must know to leave it out');
});
