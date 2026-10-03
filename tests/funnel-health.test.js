/**
 * The morning email's watch on the funnel (plan Phase 1f): customer-facing
 * failures every day, and on Mondays last week against the week before.
 *
 * Run: node tests/funnel-health.test.js
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const F = require('../tools/lib/funnel-health');
const GA = require('../tools/lib/google-analytics');
const H = require('../tools/lib/site-health');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ENV = { GOOGLE_ADS_CLIENT_ID: 'c', GOOGLE_ADS_CLIENT_SECRET: 's', GA4_REFRESH_TOKEN: 'r' };

/** A fake Google: the token endpoint, then whatever `reply` returns for the report. */
function fakeGoogle(reply) {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: init && init.body });
    const body = /oauth2/.test(url) ? { access_token: 't', expires_in: 3600 } : reply(url, JSON.parse(init.body));
    return { ok: !body.error, status: body.error ? 403 : 200, text: async () => JSON.stringify(body) };
  };
  return { seen, client: GA.createClient({ env: ENV, fetchImpl }) };
}
const row = (dims, n) => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: [{ value: String(n) }] });

test('weeklyFunnel: both weeks of sessions and each event', async () => {
  const g = fakeGoogle(() => ({ reports: [
    { rows: [row(['date_range_0'], 300), row(['date_range_1'], 250)] },
    { rows: [row(['designer_open', 'date_range_0'], 40), row(['designer_open', 'date_range_1'], 50),
             row(['add_to_cart', 'date_range_0'], 4)] },
  ] }));
  const w = await g.client.weeklyFunnel();
  assert.deepStrictEqual(w, { ok: true, sessions: { now: 300, before: 250 },
    events: { designer_open: { now: 40, before: 50 }, add_to_cart: { now: 4, before: 0 } } });
  const req = JSON.parse(g.seen[1].body);
  assert.deepStrictEqual(req.requests[0].dateRanges, [{ startDate: '7daysAgo', endDate: 'yesterday' }, { startDate: '14daysAgo', endDate: '8daysAgo' }]);
  assert.match(g.seen[1].url, /properties\/296855466:batchRunReports$/);
});

test('yesterdayProblems: counts by event; failures and no connection never throw', async () => {
  const g = fakeGoogle(() => ({ rows: [row(['checkout_error'], 3), row(['upload_failed'], 1)] }));
  assert.deepStrictEqual(await g.client.yesterdayProblems(), { ok: true, counts: { checkout_error: 3, upload_failed: 1 } });
  assert.deepStrictEqual(JSON.parse(g.seen[1].body).dimensionFilter.filter.inListFilter.values,
    ['checkout_error', 'upload_failed', 'ai_design_failed', 'quote_form_error']);
  const bad = fakeGoogle(() => ({ error: { status: 'PERMISSION_DENIED' } }));
  const r = await bad.client.yesterdayProblems();
  assert.strictEqual(r.ok, false);
  assert.match(r.reason, /cannot see this Analytics property/);
  const none = await GA.createClient({ env: {}, fetchImpl: () => { throw new Error('no call expected'); } }).weeklyFunnel();
  assert.strictEqual(none.ok, false);
  assert.strictEqual(none.notConnected, true);
});

test('problem lines: leads waiting a day, and yesterday\'s errors with counts', () => {
  const waiting = [{ created_at: new Date(Date.now() - 2 * 86400000).toISOString() }, { created_at: new Date(Date.now() - 5 * 86400000).toISOString() }];
  const lines = F.problemLines({ waiting, problems: { ok: true, counts: { checkout_error: 2, ai_design_failed: 0 } }, problemNames: GA.PROBLEM_EVENTS });
  assert.deepStrictEqual(lines, [
    { text: '2 leads waiting over a day for a reply (oldest 5 days)', href: '/admin/leads' },
    { text: 'Checkout errors yesterday: 2' },
  ]);
  assert.deepStrictEqual(F.problemLines({ waiting: [], problems: { ok: false }, problemNames: GA.PROBLEM_EVENTS }), []);
  const html = H.siteHealthDigestHtml({ extra: lines, esc, base: 'https://www.jtees.net' });
  assert.match(html, /When something went wrong for a customer/);
  assert.match(html, /<b>Checkout errors yesterday: 2<\/b>/);
  assert.match(html, /href="https:\/\/www\.jtees\.net\/admin\/leads"/);
});

test('funnel health: last week vs before, drops of 40%+ from 5+ flagged', () => {
  const ga = { ok: true, sessions: { now: 300, before: 250 }, events: { designer_open: { now: 20, before: 50 }, add_to_cart: { now: 3, before: 4 } } };
  const html = F.funnelHealthHtml({ ga, esc, db: { leads: { now: 9, before: 10 }, sent: { now: 4, before: 0 }, accepted: { now: 0, before: 0 }, orders: { now: 2, before: 3 } } });
  assert.match(html, /Visits \(both sites\)<\/td><td[^>]*>300<\/td>\s*<td[^>]*>250<\/td>\s*<td[^>]*color:#166534[^>]*>\+20%/);
  assert.match(html, /Opened the designer<\/td>[\s\S]*?⚠ -60%/, 'designer opens fell 60%');
  assert.doesNotMatch(html.split('Added to cart')[1].split('</tr>')[0], /⚠/, '3 from 4 is too small to call');
  assert.match(html, /Quotes sent<\/td>[\s\S]*?>new</);
  assert.match(html, /Quotes accepted<\/td>[\s\S]*?>—</);
  assert.match(html, /Studio orders/);
  const noGa = F.funnelHealthHtml({ ga: { ok: false, reason: 'Google Analytics is not connected.' }, esc, db: { leads: { now: 1, before: 1 } } });
  assert.match(noGa, /Website numbers missing: Google Analytics is not connected\./);
  assert.doesNotMatch(noGa, /Visits/);
  assert.strictEqual(F.funnelHealthHtml({ ga: null, db: null, esc }), '');
});

test('server: wired into the morning email, each source failing on its own', () => {
  const fn = server.slice(server.indexOf('async function siteHealthHtml()'), server.indexOf('/* The helpers\' day, for the morning email:'));
  assert.match(fn, /GOOGLE_ANALYTICS\.yesterdayProblems\(\)\.catch\(\(\) => null\)/);
  assert.match(fn, /\.filter\(\(l\) => l\.source !== 'chat' && !l\.first_response_at && !l\.outcome/);
  assert.match(fn, /monday \? await funnelHealthSection\(tz\)\.catch\(/);
  assert.match(fn, /GOOGLE_ANALYTICS\.weeklyFunnel\(\)/);
  assert.match(fn, /Number\(o\.paid \|\| 0\) > 0/, 'only paid studio orders count');
  assert.match(fn, /status NOT IN \('held', 'draft'\)/, 'held and draft quotes were never sent');
});
