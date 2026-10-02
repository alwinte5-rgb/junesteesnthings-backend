'use strict';

/* The owner's Google Ads card: last 30 days, read-only.
 *
 * Asked for 2026-10-02: "track my ads account in my dashboard, just a quick
 * overview." What must hold: a missing setting names itself instead of
 * crashing the dashboard; Google's refusals become one actionable sentence;
 * costs arrive in micros and are shown in dollars; and the cache keeps page
 * loads from spending the Explorer level's 2,880 operations a day.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ADS = require('../tools/lib/google-ads');

const ENV = {
  GOOGLE_ADS_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_ADS_CLIENT_SECRET: 'GOCSPX-test',
  GOOGLE_ADS_REFRESH_TOKEN: '1//test',
  GOOGLE_ADS_CUSTOMER_ID: '123-456-7890',
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: '4045995600',
};

test('customer IDs are accepted with or without dashes, and nothing else', () => {
  assert.strictEqual(ADS.customerDigits('123-456-7890'), '1234567890');
  assert.strictEqual(ADS.customerDigits('1234567890'), '1234567890');
  assert.strictEqual(ADS.customerDigits('12345'), null);
  assert.strictEqual(ADS.customerDigits('123-456-789x'), null);
});

test('a missing setting is named, not thrown', () => {
  const cfg = ADS.configFromEnv({ ...ENV, GOOGLE_ADS_REFRESH_TOKEN: '' });
  assert.deepStrictEqual(cfg.missing, ['GOOGLE_ADS_REFRESH_TOKEN']);
  assert.strictEqual(ADS.configFromEnv(ENV).customerId, '1234567890');
});

test('micros become dollars and the ratios survive zero clicks', () => {
  const s = ADS.summarise(
    [{ metrics: { costMicros: '12500000', clicks: '10', impressions: '400', conversions: 2 } }],
    [{ campaign: { name: 'Search', status: 'ENABLED' }, metrics: { costMicros: '12500000', clicks: '10', conversions: 2 } }]);
  assert.strictEqual(s.spend, 12.5);
  assert.strictEqual(s.cpc, 1.25);
  assert.strictEqual(s.costPerConversion, 6.25);
  assert.strictEqual(s.campaigns[0].spend, 12.5);
  const empty = ADS.summarise([], []);
  assert.strictEqual(empty.cpc, null);
  assert.strictEqual(empty.costPerConversion, null);
});

test('Google refusals become a sentence the owner can act on', () => {
  assert.match(ADS.explainError({ code: 'invalid_grant' }), /sign-in has expired/);
  assert.match(ADS.explainError({ message: 'DEVELOPER_TOKEN_NOT_APPROVED' }), /Explorer access/);
  assert.match(ADS.explainError({ message: 'USER_PERMISSION_DENIED' }), /linked under the manager/);
});

function fakeFetch(calls, { fail } = {}) {
  return async (url) => {
    calls.push(url);
    const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (url.includes('oauth2')) return fail ? json(400, { error: 'invalid_grant' }) : json(200, { access_token: 'a', expires_in: 3600 });
    return json(200, { results: [{ metrics: { costMicros: '1000000', clicks: '1' } }] });
  };
}

test('the overview is cached, so page loads do not spend the daily allowance', async () => {
  const calls = [];
  let t = 0;
  const c = ADS.createClient({ env: ENV, fetchImpl: fakeFetch(calls), now: () => t });
  const a = await c.overview();
  assert.strictEqual(a.ok, true);
  const n = calls.length;
  t += 10 * 60 * 1000;
  await c.overview();
  assert.strictEqual(calls.length, n, 'second load within 30 minutes made no calls');
  t += 25 * 60 * 1000;
  await c.overview();
  assert.ok(calls.length > n, 'refetches after the cache expires');
});

test('a failure is reported and also cached, never retried on every load', async () => {
  const calls = [];
  let t = 0;
  const c = ADS.createClient({ env: ENV, fetchImpl: fakeFetch(calls, { fail: true }), now: () => t });
  const a = await c.overview();
  assert.strictEqual(a.ok, false);
  assert.match(a.reason, /sign-in/);
  assert.ok(!JSON.stringify(a).includes('GOCSPX'), 'no credential in the result');
  const n = calls.length;
  await c.overview();
  assert.strictEqual(calls.length, n);
});

test('the card is on the dashboard for the owner only', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /isOwner\(\) \? safe\(GOOGLE_ADS\.overview\(\)/);
  assert.match(src, /ads === undefined \? '' : googleAdsCard\(ads\)/);
});
