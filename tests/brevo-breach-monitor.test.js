/* Regression tests for the Brevo breach monitor (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * On 2026-08-16 the shared Brevo account sent 7,896 emails in one day — a
 * phishing run to addresses this shop has never had — and spent the entire
 * monthly send limit. Normal traffic is under 20 a day. It went unnoticed for
 * three days, and what finally surfaced it was a customer payment going
 * unannounced. This monitor exists so the account says something itself.
 *
 * The two properties that make it worth having are both easy to break by
 * accident, so they are asserted here rather than trusted:
 *
 *   1. It must alert through Resend DIRECTLY, never through sendEmail(). If
 *      Brevo is the thing being abused — or is simply out of credits, where it
 *      returns 201 and discards — then routing the warning about Brevo through
 *      Brevo produces silence at exactly the wrong moment.
 *   2. It must alert on VOLUME, not only on credits reaching zero. Zero credits
 *      is the aftermath; the spike is the event.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

function extractFn(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated function reading \`${anchor}\``);
}

/* ── the once-per-day gate ────────────────────────────────────────────────── */

function makeGate() {
  const sandbox = { brevoAlertsSent: new Map(), Date };
  vm.createContext(sandbox);
  vm.runInContext(extractFn('function alertOncePerDay('), sandbox);
  return sandbox.alertOncePerDay;
}

test('the same condition alerts once, not on every hourly sweep', () => {
  const gate = makeGate();
  assert.strictEqual(gate('volume'), true, 'first sighting must alert');
  assert.strictEqual(gate('volume'), false, 'an hourly re-check must stay quiet');
  assert.strictEqual(gate('volume'), false);
});

test('different conditions each get their own alert', () => {
  const gate = makeGate();
  assert.strictEqual(gate('volume'), true);
  assert.strictEqual(gate('bounces'), true);
  assert.strictEqual(gate('spam'), true);
  assert.strictEqual(gate('credits'), true);
});

test('a new day re-arms the alert', () => {
  const sandbox = { brevoAlertsSent: new Map(), Date };
  vm.createContext(sandbox);
  vm.runInContext(extractFn('function alertOncePerDay('), sandbox);
  assert.strictEqual(sandbox.alertOncePerDay('volume'), true);
  assert.strictEqual(sandbox.alertOncePerDay('volume'), false);
  sandbox.brevoAlertsSent.set('volume', '2000-01-01');   // yesterday, in effect
  assert.strictEqual(sandbox.alertOncePerDay('volume'), true, 'must alert again the next day');
});

/* ── wiring, which is what a future tidy-up would quietly break ───────────── */

const MONITOR_SRC = extractFn('async function brevoBreachCheck(');
const SENDER_SRC  = extractFn('async function alertViaResend(');

test('the breach alert never routes through sendEmail', () => {
  assert.doesNotMatch(MONITOR_SRC, /\bsendEmail\s*\(/,
    'the monitor must not use sendEmail — that can route through the very provider being reported');
  assert.doesNotMatch(SENDER_SRC, /\bsendEmail\s*\(/);
});

test('the breach alert sends via Resend directly', () => {
  assert.match(SENDER_SRC, /resend\.emails\.send/,
    'alertViaResend must call Resend directly so a Brevo outage cannot silence it');
});

test('the monitor alerts on send volume, not only on empty credits', () => {
  assert.match(MONITOR_SRC, /BREVO_ALERT_DAILY_REQUESTS/,
    'volume is the event; credits reaching zero is only the aftermath');
  assert.match(MONITOR_SRC, /requests/);
});

test('the monitor also watches bounces and spam complaints', () => {
  assert.match(MONITOR_SRC, /BREVO_ALERT_HARD_BOUNCES/);
  assert.match(MONITOR_SRC, /BREVO_ALERT_SPAM_REPORTS/);
});

test('a rejected key raises an alert rather than passing silently', () => {
  assert.match(MONITOR_SRC, /401/,
    'a 401 is what revocation, or a half-applied rotation, looks like from in here');
});

test('the monitor can never break the hourly sweep', () => {
  assert.match(MONITOR_SRC, /catch \(e\) \{[\s\S]*console\.error\('brevoBreachCheck failed/,
    'brevoBreachCheck must swallow its own errors');
});

test('the monitor is actually called by the hourly sweep', () => {
  assert.match(src, /await brevoBreachCheck\(\);/,
    'a monitor nothing calls is not a monitor');
});

/* ── the secrets-handling fixes that came out of the same incident ────────── */

test('the Brevo key has exactly one home', () => {
  /* Matches the variable being READ, not the word — the comment at the axios
     client names the retired variable on purpose, so whoever finds a stale
     JTEES_BREVO_MCP_API still set on Railway knows why it is ignored. */
  assert.doesNotMatch(src, /process\.env\.JTEES_BREVO_MCP_API/,
    'a second variable for the same secret is a second chance to rotate only half of it');
});

test('a missing Brevo key degrades to Resend instead of killing the boot', () => {
  const envFn = extractFn('function validateEnv(');
  assert.doesNotMatch(envFn.slice(0, envFn.indexOf('missingEnv')), /REQUIRED_ENV = \[[^\]]*BREVO_API_KEY/,
    'BREVO_API_KEY in REQUIRED_ENV makes revoking a suspect key a storefront outage');
  assert.match(envFn, /BREVO_API_KEY[\s\S]*RESEND_API_KEY[\s\S]*process\.exit\(1\)/,
    'but having NO provider at all must still fail fast');
});
