'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const CF = require('../tools/lib/cf-access');

const AUD = 'a'.repeat(64);
const ENV = { CF_ACCESS_TEAM_DOMAIN: 'jtees.cloudflareaccess.com', CF_ACCESS_AUD: AUD, OWNER_EMAILS: 'Owner@Example.com, second@example.com' };
const cfg = CF.configFromEnv(ENV);

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwks = { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256' }] };

function sign(payload, { kid = 'k1', key = privateKey, alg = 'RS256' } = {}) {
  const h = Buffer.from(JSON.stringify({ alg, kid, typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = crypto.sign('RSA-SHA256', Buffer.from(`${h}.${p}`), key).toString('base64url');
  return `${h}.${p}.${s}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { aud: [AUD], iss: 'https://jtees.cloudflareaccess.com', email: 'Helper@Example.com', exp: now + 600, nbf: now - 10 };
const keyFor = CF.makeKeyStore(cfg.certsUrl, async () => jwks);

test('config needs team, 64-hex aud and at least one owner email — or nothing opens', () => {
  assert.deepStrictEqual(cfg.owners, ['owner@example.com', 'second@example.com']);
  assert.strictEqual(cfg.certsUrl, 'https://jtees.cloudflareaccess.com/cdn-cgi/access/certs');
  assert.strictEqual(CF.configFromEnv({ ...ENV, CF_ACCESS_AUD: '' }), null);
  assert.strictEqual(CF.configFromEnv({ ...ENV, OWNER_EMAILS: ' , ' }), null);
  assert.strictEqual(CF.configFromEnv({ ...ENV, CF_ACCESS_TEAM_DOMAIN: 'evil.example.com' }), null);
  assert.strictEqual(CF.configFromEnv({ ...ENV, CF_ACCESS_AUD: 'not-hex' }), null);
});

test('a genuine pass gives its email, lower-cased', async () => {
  assert.strictEqual(await CF.verifyAccessToken(sign(good), cfg, keyFor), 'helper@example.com');
  assert.strictEqual(await CF.verifyAccessToken(sign({ ...good, aud: AUD }), cfg, keyFor), 'helper@example.com');
});

test('forged, tampered, or foreign passes are refused', async () => {
  const v = (t) => CF.verifyAccessToken(t, cfg, keyFor);
  assert.strictEqual(await v(sign(good, { key: other.privateKey })), null, 'signed by someone else');
  const [h, , s] = sign(good).split('.');
  const p2 = Buffer.from(JSON.stringify({ ...good, email: 'owner@example.com' })).toString('base64url');
  assert.strictEqual(await v(`${h}.${p2}.${s}`), null, 'payload swapped after signing');
  assert.strictEqual(await v(sign({ ...good, aud: ['b'.repeat(64)] })), null, 'another Access application');
  assert.strictEqual(await v(sign({ ...good, iss: 'https://evil.cloudflareaccess.com' })), null, 'another team');
  assert.strictEqual(await v(sign({ ...good, exp: now - 3600 })), null, 'expired');
  assert.strictEqual(await v(sign({ ...good, nbf: now + 3600 })), null, 'not yet valid');
  assert.strictEqual(await v(sign({ ...good, email: '' })), null, 'no email (a service token)');
  assert.strictEqual(await v(sign(good, { kid: 'unknown' })), null, 'unknown key');
  const none = Buffer.from(JSON.stringify({ alg: 'none', kid: 'k1' })).toString('base64url');
  assert.strictEqual(await v(`${none}.${Buffer.from(JSON.stringify(good)).toString('base64url')}.`), null, 'alg none');
  assert.strictEqual(await v(sign(good, { alg: 'HS256' })), null, 'alg switched');
  assert.strictEqual(await v(''), null);
  assert.strictEqual(await v('a.b'), null);
  assert.strictEqual(await v('x'.repeat(9000)), null, 'oversized');
  assert.strictEqual(await CF.verifyAccessToken(sign(good), null, keyFor), null, 'not configured');
});

test('keys are cached; an unknown key id does not hammer Cloudflare', async () => {
  let calls = 0;
  const store = CF.makeKeyStore(cfg.certsUrl, async () => { calls++; return jwks; });
  await store('k1'); await store('k1'); await store('nope'); await store('nope');
  assert.strictEqual(calls, 1);
});

test('a failed key fetch keeps the last good keys', async () => {
  let fail = false;
  const store = CF.makeKeyStore(cfg.certsUrl, async () => { if (fail) throw new Error('down'); return jwks; });
  assert.ok(await store('k1'));
  fail = true;
  assert.ok(await store('k1'));
});
