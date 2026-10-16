'use strict';

/* Shared logins, one view each (owner, 2026-10-16). End to end: run-tasks.cjs. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../tools/lib/shared-logins');
const STAFF = require('../tools/lib/staff');

const KEY = Buffer.alloc(32, 7);
const ID = '3f2b8c1e-9a4d-4e7b-8c21-0d5e6f7a8b9c';
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('sealed and opened with the right key and the same share only', () => {
  const s = L.seal({ username: 'shop@jtees.net', password: 'p@ss "with" <odd> chars' }, KEY, ID);
  assert.ok(!s.includes('p@ss') && !s.includes('shop@'), 'nothing readable in what is stored');
  assert.deepStrictEqual(L.open(s, KEY, ID), { username: 'shop@jtees.net', password: 'p@ss "with" <odd> chars' });
  assert.throws(() => L.open(s, Buffer.alloc(32, 8), ID), 'another key');
  assert.throws(() => L.open(s, KEY, ID.replace('3f', '4f')), 'copied onto another share');
  const [v, iv, tag, data] = s.split('.');
  const flipped = data.slice(0, -2) + (data.slice(-2) === 'AA' ? 'AB' : 'AA');
  assert.throws(() => L.open([v, iv, tag, flipped].join('.'), KEY, ID), 'tampered');
  assert.notStrictEqual(L.seal({ password: 'x' }, KEY, ID), L.seal({ password: 'x' }, KEY, ID), 'a fresh IV each time');
});

test('the key is a 32-byte hex secret or the feature is off; no fallback', () => {
  assert.strictEqual(L.keyFrom({}), null);
  assert.strictEqual(L.keyFrom({ SHARED_LOGIN_KEY: 'short' }), null);
  assert.strictEqual(L.keyFrom({ SHARED_LOGIN_KEY: 'a'.repeat(64) }).length, 32);
  assert.doesNotMatch(src.slice(src.indexOf('function keyFrom')), /SHARED_LOGIN_KEY \|\|/);
});

test('the form: site and password required, capped, expiry from a fixed list', () => {
  assert.match(L.fromForm({ password: 'x' }).error, /site/);
  assert.match(L.fromForm({ site: 'Canva' }).error, /password/);
  const f = L.fromForm({ site: 'Canva\nX', username: ' me ', password: ' keep spaces ', expiry: '__proto__' });
  assert.strictEqual(f.site, 'Canva X');
  assert.strictEqual(f.username, 'me');
  assert.strictEqual(f.password, ' keep spaces ', 'a password is kept as typed');
  assert.strictEqual(f.expiry, '1d');
  assert.match(L.fromForm({ site: 'x', password: 'y'.repeat(501) }).error, /too long/);
});

test('one view: taken and erased in one statement, by its helper only', () => {
  const at = src.indexOf("app.post('/admin/shared-logins/:id/open'");
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /SET sealed = NULL, viewed_at = NOW\(\)/);
  assert.match(route, /s\.staff_id = \$2 AND s\.sealed IS NOT NULL AND s\.viewed_at IS NULL/);
  assert.match(route, /actor\.kind !== 'staff'\) return res\.status\(403\)/);
  assert.match(route, /res\.set\('Cache-Control', 'no-store'\)/);
  assert.strictEqual(STAFF.ROUTES['POST /admin/shared-logins'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/shared-logins/:id/cancel'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/shared-logins/:id/open'], 'any');
  assert.match(src, /UPDATE shared_logins SET sealed = NULL WHERE sealed IS NOT NULL AND expires_at <= NOW\(\)/, 'expired ones are erased');
});
