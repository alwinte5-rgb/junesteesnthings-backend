'use strict';

/* The owner's website-traffic card: Google Analytics, last 28 days, read-only.
 *
 * Asked for 2026-10-02: the Traffic acquisition report as an overview in the
 * Google part of the dashboard. What must hold: a missing setting names itself
 * instead of crashing the dashboard; this period and the one before are told
 * apart (GA4 returns them as one list); the two funnels come out in order with
 * zeros for steps nobody reached; refusals become one sentence; and the cache
 * keeps page loads from re-running the report.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const GA = require('../tools/lib/google-analytics');

const ENV = {
  GOOGLE_ADS_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_ADS_CLIENT_SECRET: 'GOCSPX-test',
  GA4_REFRESH_TOKEN: '1//test',
};

const row = (dims, vals) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: vals.map((value) => ({ value: String(value) })),
});

const REPORTS = [
  { rows: [row(['date_range_0'], [538, 133, 197]), row(['date_range_1'], [400, 100, 150])] },
  { rows: [row(['Organic Search'], [88]), row(['Direct'], [295]), row(['Email'], [61])] },
  { rows: [row(['designer_open'], [40]), row(['add_to_cart'], [3]), row(['quote_submitted'], [12]), row(['purchase'], [2])] },
  { rows: [row(['/'], [300]), row(['/editor.php?product_base=14'], [20])] },
  { rows: [row(['www.jtees.net'], [350]), row(['design.jtees.net'], [180])] },
];

test('a missing setting is named, not thrown; the property defaults to June\'s Tees', () => {
  assert.deepStrictEqual(GA.configFromEnv({ ...ENV, GA4_REFRESH_TOKEN: '' }).missing, ['GA4_REFRESH_TOKEN']);
  assert.strictEqual(GA.configFromEnv(ENV).propertyId, '296855466');
  assert.strictEqual(GA.configFromEnv({ ...ENV, GA4_PROPERTY_ID: 'properties/123456789' }).propertyId, '123456789');
  assert.ok(GA.configFromEnv({ ...ENV, GA4_PROPERTY_ID: 'G-E65381594C' }).missing, 'a measurement ID is not a property ID');
});

test('this period and the one before are told apart', () => {
  const s = GA.summarise(REPORTS);
  assert.deepStrictEqual(s.sessions, { now: 538, before: 400 });
  assert.deepStrictEqual(s.users, { now: 133, before: 100 });
  assert.strictEqual(Math.round(s.engagedRate * 100), 37);
});

test('channels come out biggest first', () => {
  assert.deepStrictEqual(GA.summarise(REPORTS).channels.map((c) => c.name), ['Direct', 'Organic Search', 'Email']);
});

test('both funnels keep their order, with zero for a step nobody reached', () => {
  const s = GA.summarise(REPORTS);
  assert.deepStrictEqual(s.designFunnel.map((x) => [x.name, x.count]),
    [['designer_open', 40], ['design_started', 0], ['add_to_cart', 3], ['begin_checkout', 0]]);
  assert.deepStrictEqual(s.quoteFunnel.map((x) => x.count), [12, 0, 0]);
  assert.strictEqual(s.purchases, 2);
});

test('an empty property summarises without throwing', () => {
  const s = GA.summarise([]);
  assert.deepStrictEqual(s.sessions, { now: 0, before: 0 });
  assert.strictEqual(s.engagedRate, null);
  assert.deepStrictEqual(s.channels, []);
});

test('the report asks for every funnel event the sites send', () => {
  const body = GA.requestBody();
  assert.strictEqual(body.requests.length, 5, 'batchRunReports takes at most 5');
  const asked = body.requests[2].dimensionFilter.filter.inListFilter.values;
  for (const e of ['designer_open', 'design_started', 'add_to_cart', 'begin_checkout', 'quote_submitted', 'quote_accepted', 'purchase']) {
    assert.ok(asked.includes(e), e);
  }
});

test('Google refusals become a sentence the owner can act on', () => {
  assert.match(GA.explainError({ code: 'invalid_grant' }), /sign-in has expired/);
  assert.match(GA.explainError({ message: 'Request had insufficient authentication scopes.' }), /Analytics access/);
  assert.match(GA.explainError({ message: 'SERVICE_DISABLED: has not been used in project' }), /Enable it in Cloud Console/);
});

function fakeFetch(calls, { fail } = {}) {
  return async (url, init) => {
    calls.push({ url, body: init && init.body });
    const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
    if (url.includes('oauth2')) return fail ? json(400, { error: 'invalid_grant' }) : json(200, { access_token: 'a', expires_in: 3600 });
    return json(200, { reports: REPORTS });
  };
}

test('one batch request per refresh, cached for 30 minutes', async () => {
  const calls = [];
  let t = 0;
  const c = GA.createClient({ env: ENV, fetchImpl: fakeFetch(calls), now: () => t });
  const a = await c.overview();
  assert.strictEqual(a.ok, true);
  assert.strictEqual(a.sessions.now, 538);
  assert.ok(calls.some((x) => x.url.endsWith('/properties/296855466:batchRunReports')));
  const n = calls.length;
  t += 10 * 60 * 1000;
  await c.overview();
  assert.strictEqual(calls.length, n, 'second load within 30 minutes made no calls');
  t += 25 * 60 * 1000;
  await c.overview();
  assert.ok(calls.length > n, 'refetches after the cache expires');
});

test('a failure is reported, cached, and never echoes a credential', async () => {
  const calls = [];
  const c = GA.createClient({ env: ENV, fetchImpl: fakeFetch(calls, { fail: true }), now: () => 0 });
  const a = await c.overview();
  assert.strictEqual(a.ok, false);
  assert.match(a.reason, /sign-in/);
  assert.ok(!JSON.stringify(a).includes('GOCSPX'));
  const n = calls.length;
  await c.overview();
  assert.strictEqual(calls.length, n);
});

test('the card is on the dashboard for the owner only, beside Google Ads', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /isOwner\(\) \? safe\(GOOGLE_ANALYTICS\.overview\(\)/);
  assert.match(src, /traffic === undefined \? '' : googleAnalyticsCard\(traffic\)/);
});
