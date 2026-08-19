/* Regression tests for the Brevo send-credit guard in sendEmail (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * The outage these exist to prevent, in full, because it has happened once:
 *
 * Brevo answers POST /v3/smtp/email with `201 Created` and a genuine messageId
 * even when the account has zero send credits, then discards the message. The
 * app checked only `r.ok`, so nothing threw, the Resend fallback never fired,
 * and every caller believed the mail had gone out.
 *
 * On 2026-08-16 the shared Brevo account spent its entire monthly send limit
 * in a single day. From then until 08-19 every notification the shop sends was
 * accepted and destroyed. A real card payment on 08-18 — quote 731EAC, $141.12
 * — banked correctly and nobody was told, and no log line anywhere said so.
 * It was found by reading Brevo's own event log, not from anything the app did.
 *
 * So brevoCanSend() is load-bearing: it is the only thing standing between an
 * empty Brevo balance and silently losing mail. Two properties matter and are
 * asserted below — it must say NO on zero credits so Resend takes over, and it
 * must FAIL OPEN on anything it cannot determine, because an unreachable
 * status endpoint must never be able to stop mail on its own.
 *
 * These lift the real function out of server.js rather than restating it, so
 * the tests cannot quietly drift from the code they are guarding. server.js
 * boots a listener and a DB pool on require, which is why it is not imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/** Lift `async function brevoCanSend(...) { ... }` by brace matching. */
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

const FN_SRC = extractFn('async function brevoCanSend(');

/**
 * Run the lifted guard against a fabricated Brevo /v3/account response.
 * `fetchImpl` stands in for the network so the real account is never touched.
 */
function makeGuard(fetchImpl, env = {}) {
  const sandbox = {
    fetch: fetchImpl,
    console: { error() {}, log() {} },
    AbortSignal: { timeout: () => undefined },
    Date,
    Number,
    process: { env },
    BREVO_CREDIT_TTL: 5 * 60 * 1000,
    brevoCreditCheckedAt: 0,
    brevoHasCredits: true,
  };
  vm.createContext(sandbox);
  vm.runInContext(FN_SRC, sandbox);
  /* The cache is what makes a second call meaningful, so tests that need one
     expire it explicitly rather than waiting out the TTL. */
  sandbox.expireCache = () => { sandbox.brevoCreditCheckedAt = 0; };
  return sandbox;
}

const ok = (plan) => async () => ({ ok: true, json: async () => ({ plan }) });

test('says NO when the sendLimit plan has zero credits', async () => {
  const { brevoCanSend: guard } = makeGuard(ok([{ type: 'subscription', creditsType: 'sendLimit', credits: 0 }]));
  assert.strictEqual(await guard('key'), false);
});

test('says YES when the sendLimit plan still has credits', async () => {
  const { brevoCanSend: guard } = makeGuard(ok([{ type: 'subscription', creditsType: 'sendLimit', credits: 1 }]));
  assert.strictEqual(await guard('key'), true);
});

/* Brevo reports several credit types; only the send limit gates a send. An
   empty sms balance must not silence the shop's email. */
test('ignores credit types that are not the send limit', async () => {
  const { brevoCanSend: guard } = makeGuard(ok([
    { type: 'subscription', creditsType: 'sms', credits: 0 },
    { type: 'subscription', creditsType: 'sendLimit', credits: 500 },
  ]));
  assert.strictEqual(await guard('key'), true);
});

/* Fail-open, three ways. Each of these once meant "unknown", and unknown must
   never be treated as "empty" — that would take mail down to protect it. */
test('fails open when the status endpoint answers non-2xx', async () => {
  const { brevoCanSend: guard } = makeGuard(async () => ({ ok: false, json: async () => ({}) }));
  assert.strictEqual(await guard('key'), true);
});

test('fails open when the status request throws', async () => {
  const { brevoCanSend: guard } = makeGuard(async () => { throw new Error('network down'); });
  assert.strictEqual(await guard('key'), true);
});

test('fails open when the plan array is missing entirely', async () => {
  const { brevoCanSend: guard } = makeGuard(async () => ({ ok: true, json: async () => ({}) }));
  assert.strictEqual(await guard('key'), true);
});

/* The guard is worthless if sendEmail does not consult it. This asserts the
   wiring, which is the part a future tidy-up is most likely to drop. */
test('sendEmail gates its Brevo branch on the guard', () => {
  assert.match(src, /if \(brevoKey && await brevoCanSend\(brevoKey\)\) \{/,
    'sendEmail no longer checks brevoCanSend before using Brevo');
});

/* A 201 with a messageId is exactly what an out-of-credits account returns, so
   the response body can never be the thing that decides. Recorded so nobody
   "improves" the guard into a messageId check. */
test('the guard is a balance check, not a response-body check', () => {
  assert.doesNotMatch(FN_SRC, /messageId/,
    'brevoCanSend must not rely on the send response — Brevo returns 201 + messageId while discarding');
});

/* Payment notifications must never swallow a send failure again: the silence
   was as much the bug as the lost mail. */
for (const who of ['shop', 'customer']) {
  test(`the payment ${who} email logs its own failure`, () => {
    assert.match(src, new RegExp(`payment (alert to shop|receipt to customer) FAILED`),
      `the ${who} payment email still discards its error`);
  });
}

/* Sticky state. An unreadable balance means "no news", not "all clear" — the
   old code reset to optimistic here, which would re-enter the silent drop on
   every hiccup of Brevo's status endpoint, because sending is precisely what
   does NOT fail when credits are gone. */
test('a failed re-check keeps the last known empty reading', async () => {
  let mode = 'empty';
  const box = makeGuard(async () => {
    if (mode === 'empty') return { ok: true, json: async () => ({ plan: [{ creditsType: 'sendLimit', credits: 0 }] }) };
    throw new Error('status endpoint down');
  });
  assert.strictEqual(await box.brevoCanSend('key'), false, 'should read empty first');
  mode = 'down';
  box.expireCache();
  assert.strictEqual(await box.brevoCanSend('key'), false, 'must not flip back to optimistic');
});

test('a failed re-check keeps a last known healthy reading too', async () => {
  let mode = 'ok';
  const box = makeGuard(async () => {
    if (mode === 'ok') return { ok: true, json: async () => ({ plan: [{ creditsType: 'sendLimit', credits: 9 }] }) };
    return { ok: false, json: async () => ({}) };
  });
  assert.strictEqual(await box.brevoCanSend('key'), true);
  mode = 'bad';
  box.expireCache();
  assert.strictEqual(await box.brevoCanSend('key'), true);
});

test('recovers on its own once credits come back', async () => {
  let credits = 0;
  const box = makeGuard(async () => ({ ok: true, json: async () => ({ plan: [{ creditsType: 'sendLimit', credits }] }) }));
  assert.strictEqual(await box.brevoCanSend('key'), false);
  credits = 300;
  box.expireCache();
  assert.strictEqual(await box.brevoCanSend('key'), true, 'must resume Brevo when the limit resets');
});

/* The override exists for the case the balance cannot describe: a key believed
   to be in someone else's hands. It must not need a deploy, and it must win
   over a perfectly healthy balance. */
for (const val of ['1', 'true', 'yes', 'on', 'TRUE']) {
  test(`JT_DISABLE_BREVO=${val} forces Resend even with credits available`, async () => {
    const { brevoCanSend } = makeGuard(
      async () => ({ ok: true, json: async () => ({ plan: [{ creditsType: 'sendLimit', credits: 5000 }] }) }),
      { JT_DISABLE_BREVO: val });
    assert.strictEqual(await brevoCanSend('key'), false);
  });
}

for (const val of ['', '0', 'false', 'no']) {
  test(`JT_DISABLE_BREVO=${JSON.stringify(val)} leaves Brevo enabled`, async () => {
    const { brevoCanSend } = makeGuard(
      async () => ({ ok: true, json: async () => ({ plan: [{ creditsType: 'sendLimit', credits: 5000 }] }) }),
      { JT_DISABLE_BREVO: val });
    assert.strictEqual(await brevoCanSend('key'), true);
  });
}
