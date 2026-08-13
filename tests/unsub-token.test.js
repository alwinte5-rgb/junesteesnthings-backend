/* Regression tests for unsubscribe-link signing (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 * Uses only the built-in node:test runner, so this adds no dependency.
 *
 * The bug these cover: unsubToken() used to fall back to a hardcoded 'jtees'
 * when JT_INTERNAL_KEY was unset, which makes a valid unsubscribe token
 * forgeable for any address on the list. It also keyed unsubscribe links on the
 * secret shared with design.jtees.net, so rotating that key would have
 * invalidated every unsubscribe link already sitting in a customer's inbox.
 *
 * These pull the real functions out of server.js rather than restating them,
 * so the tests cannot quietly drift from the code they are guarding. server.js
 * boots a listener and a DB pool on require, which is why it is not imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/** Lift one top-level `function name(...) { ... }` out of the source. */
function extract(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

/** Evaluate the real signing functions against a given environment. */
function load(env) {
  const sandbox = { crypto, process: { env }, Buffer, module: {}, exports: {} };
  vm.createContext(sandbox);
  const code = ['hexEqual', 'unsubSecret', 'unsubSecrets', 'signUnsub',
                'unsubToken', 'unsubTokenValid'].map(extract).join('\n\n');
  vm.runInContext(
    `${code}\nmodule.exports = { unsubSecret, unsubSecrets, unsubToken, unsubTokenValid };`,
    sandbox);
  return sandbox.module.exports;
}

const EMAIL = 'customer@example.com';
const SHARED = 'the-current-shared-internal-key';
const DEDICATED = 'a-fresh-dedicated-unsubscribe-secret';

test('a link delivered before the migration still verifies afterwards', () => {
  // The whole migration guarantee, in the shape production actually has:
  // UNSUB_TOKEN_SECRET is a NEW random value, not a copy of JT_INTERNAL_KEY.
  // If this fails, every unsubscribe link already in an inbox dies on deploy,
  // which is the RFC 8058 breakage that gets bulk mail spam-foldered.
  const before = load({ JT_INTERNAL_KEY: SHARED });
  const after = load({ UNSUB_TOKEN_SECRET: DEDICATED, JT_INTERNAL_KEY: SHARED });

  const delivered = before.unsubToken(EMAIL);
  assert.ok(delivered, 'expected a token to be issued');
  assert.ok(after.unsubTokenValid(EMAIL, delivered),
    'a link sent before the migration must still unsubscribe');
});

test('new mail is signed with the dedicated secret, not the shared key', () => {
  const { unsubToken, unsubTokenValid } = load({
    UNSUB_TOKEN_SECRET: DEDICATED, JT_INTERNAL_KEY: SHARED });
  const issued = unsubToken(EMAIL);
  const sharedSigned = crypto.createHmac('sha256', SHARED)
    .update(EMAIL).digest('hex').slice(0, 32);
  assert.notStrictEqual(issued, sharedSigned);
  assert.ok(unsubTokenValid(EMAIL, issued));
});

test('seeding the new secret with the old value also works', () => {
  // The alternative migration, kept working so either choice is safe.
  const before = load({ JT_INTERNAL_KEY: SHARED });
  const after = load({ UNSUB_TOKEN_SECRET: SHARED, JT_INTERNAL_KEY: SHARED });
  assert.ok(after.unsubTokenValid(EMAIL, before.unsubToken(EMAIL)));
  // Spread into this realm's Array — the sandbox returns a foreign one.
  assert.deepStrictEqual([...after.unsubSecrets()], [SHARED],
    'an identical value must not be checked twice');
});

test('closing the grace window stops honouring old links', () => {
  // What removing the JT_INTERNAL_KEY fallback is supposed to do.
  const legacy = load({ JT_INTERNAL_KEY: SHARED }).unsubToken(EMAIL);
  const closed = load({ UNSUB_TOKEN_SECRET: DEDICATED });
  assert.strictEqual(closed.unsubTokenValid(EMAIL, legacy), false);
});

test('rotating JT_INTERNAL_KEY does not affect links signed with the dedicated secret', () => {
  const before = load({ UNSUB_TOKEN_SECRET: DEDICATED, JT_INTERNAL_KEY: SHARED });
  const rotated = load({ UNSUB_TOKEN_SECRET: DEDICATED, JT_INTERNAL_KEY: 'rotated-key' });
  assert.ok(rotated.unsubTokenValid(EMAIL, before.unsubToken(EMAIL)),
    'current-generation links must survive rotation of the shared key');
});

test('UNSUB_TOKEN_SECRET takes precedence over JT_INTERNAL_KEY', () => {
  const { unsubSecret } = load({ UNSUB_TOKEN_SECRET: 'dedicated', JT_INTERNAL_KEY: 'shared' });
  assert.strictEqual(unsubSecret(), 'dedicated');
});

test('JT_INTERNAL_KEY is still honoured on a deploy that lands before the new var is set', () => {
  const { unsubSecret, unsubToken } = load({ JT_INTERNAL_KEY: SHARED });
  assert.strictEqual(unsubSecret(), SHARED);
  assert.match(unsubToken(EMAIL), /^[0-9a-f]{32}$/);
});

test('no secret configured issues no token and validates nothing', () => {
  // The regression itself: this case used to sign with 'jtees'.
  const { unsubSecret, unsubToken, unsubTokenValid } = load({});
  assert.strictEqual(unsubSecret(), '');
  assert.strictEqual(unsubToken(EMAIL), '');
  assert.strictEqual(unsubTokenValid(EMAIL, ''), false,
    'an empty token must never validate — it is what a forged link would carry');
  assert.strictEqual(unsubTokenValid(EMAIL, 'anything'), false);
});

test('blank and whitespace-only secrets count as unset', () => {
  assert.strictEqual(load({ UNSUB_TOKEN_SECRET: '   ', JT_INTERNAL_KEY: '' }).unsubSecret(), '');
  assert.strictEqual(
    load({ UNSUB_TOKEN_SECRET: '  ', JT_INTERNAL_KEY: SHARED }).unsubSecret(), SHARED,
    'a blank dedicated secret must fall through, not disable signing');
});

test('a token minted with the old hardcoded fallback no longer validates', () => {
  const legacy = crypto.createHmac('sha256', 'jtees')
    .update(EMAIL).digest('hex').slice(0, 32);
  const { unsubTokenValid } = load({ JT_INTERNAL_KEY: SHARED });
  assert.strictEqual(unsubTokenValid(EMAIL, legacy), false);
});

test('one address\'s token does not unsubscribe another address', () => {
  const { unsubToken, unsubTokenValid } = load({ JT_INTERNAL_KEY: SHARED });
  assert.strictEqual(unsubTokenValid('someone.else@example.com', unsubToken(EMAIL)), false);
});

test('address matching stays case-insensitive', () => {
  const { unsubToken, unsubTokenValid } = load({ JT_INTERNAL_KEY: SHARED });
  assert.ok(unsubTokenValid('Customer@Example.COM', unsubToken(EMAIL)),
    'mail clients vary the case they echo back; the link must still work');
});

test('malformed tokens are rejected rather than throwing', () => {
  const { unsubTokenValid } = load({ JT_INTERNAL_KEY: SHARED });
  // hexEqual compares length first, so a short or long value must not blow up
  // timingSafeEqual — a 500 here would be a broken unsubscribe page.
  for (const bad of ['', 'z', 'not-hex', 'a'.repeat(31), 'a'.repeat(33), 'A'.repeat(32)]) {
    assert.strictEqual(unsubTokenValid(EMAIL, bad), false, `rejected: ${JSON.stringify(bad)}`);
  }
});
