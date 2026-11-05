/* Every quote to the designer (owner, 2026-11-05: "assign my designer to all
 * the quotes so he can review without me sending").
 * Run: node --test tests/auto-art.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const STAFF = require('../tools/lib/staff');

const fnAt = (anchor) => {
  const at = src.indexOf(anchor);
  assert.notStrictEqual(at, -1, `${anchor} not found`);
  return src.slice(at, src.indexOf('\n}\n', at));
};

test('the setting is a table of its own, owner-only to change', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS shop_settings/);
  const route = src.slice(src.indexOf("app.post('/admin/settings/auto-art'"), src.indexOf("app.get('/admin/staff'"));
  assert.match(route, /if \(!isOwner\(\)\) return res\.status\(403\)/);
  assert.match(route, /designersOnRoster\(\)\)\.find\(\(d\) => d\.id === id\)/, 'only someone who does design work can be picked');
  assert.strictEqual(STAFF.permForRoute('POST', '/admin/settings/auto-art'), 'owner');
});

test('the sweep sends each open quote once, to that designer, and never overwrites a request', () => {
  const fn = fnAt('async function autoArtSweep(');
  assert.match(fn, /NOT EXISTS \(SELECT 1 FROM art_requests a WHERE a\.quote_code = q\.code\)/);
  assert.match(fn, /ON CONFLICT \(quote_code\) DO NOTHING/);
  assert.match(fn, /if \(!designer\) return 0/, 'an archived designer gets nothing');
  assert.match(src, /q\.cancelled_at IS NULL AND q\.delivered_at IS NULL/);
  assert.match(fn, /One email per sweep/);
});

test('it runs with every notification sweep, so every way a quote is made is covered', () => {
  assert.match(fnAt('async function notifySweep('), /notifyPart\('auto art', autoArtSweep\(\)\)/);
});

test('the Staff page offers the picker to the owner only', () => {
  const card = fnAt('async function autoArtCard(');
  assert.match(card, /if \(!isOwner\(\)\) return ''/);
  assert.match(card, /escEmail\(d\.name\)/);
  assert.match(src, /\$\{await autoArtCard\(\)/);
});
