'use strict';

/* Google Analytics (GA4): a read-only traffic overview for the owner's dashboard.

   Asked for 2026-10-02: the Traffic acquisition report (where visits come from)
   as an overview in the Google part of the dashboard, beside Google Ads. It also
   carries the two funnels the homepage change is measured by — design and quote
   — so the "before" numbers are on the dashboard rather than in a screenshot.

   Same OAuth client as Google Ads (GOOGLE_ADS_CLIENT_ID / _SECRET), with its own
   refresh token: the Ads sign-in was granted the adwords scope only, and GA4
   answers it with "insufficient authentication scopes". GA4_REFRESH_TOKEN comes
   from signing in once with analytics.readonly.

   Only reads. Every answer is cached — 30 minutes when it worked, 5 when it did
   not — so opening the dashboard many times a day costs one report batch per
   half hour, and a broken connection does not retry on every page load. */

const PROPERTY_DEFAULT = '296855466';   // "June's Tees" — stream G-E65381594C, both domains
const OK_TTL_MS = 30 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;

const REQUIRED = {
  clientId: 'GOOGLE_ADS_CLIENT_ID',
  clientSecret: 'GOOGLE_ADS_CLIENT_SECRET',
  refreshToken: 'GA4_REFRESH_TOKEN',
};

/* The two funnels, in order. Names are the events the sites send (analytics.js
   on jtees.net, analytics.php on the designer). */
const DESIGN_FUNNEL = [
  ['designer_open', 'Opened the designer'],
  ['design_started', 'Started a design'],
  ['add_to_cart', 'Added to cart'],
  ['begin_checkout', 'Reached checkout'],
];
const QUOTE_FUNNEL = [
  ['quote_submitted', 'Asked for a quote'],
  ['quote_viewed', 'Opened their quote'],
  ['quote_accepted', 'Accepted'],
];
const FUNNEL_EVENTS = [...DESIGN_FUNNEL, ...QUOTE_FUNNEL].map(([e]) => e).concat(['purchase']);

/* What went wrong for a customer, as the sites report it (plan 1d/1f): the
   morning email lists yesterday's counts. */
const PROBLEM_EVENTS = [
  ['checkout_error', 'Checkout errors'],
  ['upload_failed', 'Artwork uploads that failed'],
  ['ai_design_failed', 'AI designs that failed'],
  ['quote_form_error', 'Quote form errors (in the browser)'],
];
/* Last full week against the one before, for the Monday "Funnel health". */
const WEEK = { startDate: '7daysAgo', endDate: 'yesterday' };
const WEEK_BEFORE = { startDate: '14daysAgo', endDate: '8daysAgo' };

/** Request for weeklyFunnel(): sessions, then funnel event counts, each with
 *  both weeks (GA4 adds the dateRange dimension last; see byRange). */
function weeklyRequestBody() {
  return {
    requests: [
      { dateRanges: [WEEK, WEEK_BEFORE], metrics: [{ name: 'sessions' }] },
      { dateRanges: [WEEK, WEEK_BEFORE], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: FUNNEL_EVENTS } } } },
    ],
  };
}

/** { sessions: {now, before}, events: { name: {now, before} } } from weeklyRequestBody's reports. */
function summariseWeek(reports) {
  const [totals, events] = reports || [];
  const out = { sessions: byRange(totals), events: {} };
  for (const r of rowsOf(events)) {
    const dims = r.dimensionValues || [];
    const name = dims[0].value;
    const which = (dims[dims.length - 1] || {}).value;
    const e = (out.events[name] ||= { now: 0, before: 0 });
    if (which === 'date_range_1') e.before += num(r.metricValues[0].value); else e.now += num(r.metricValues[0].value);
  }
  return out;
}

function configFromEnv(env = process.env) {
  const cfg = {};
  const missing = [];
  for (const [k, name] of Object.entries(REQUIRED)) {
    cfg[k] = String(env[name] || '').trim();
    if (!cfg[k]) missing.push(name);
  }
  if (missing.length) return { missing };
  const prop = String(env.GA4_PROPERTY_ID || PROPERTY_DEFAULT).replace(/^properties\//, '').trim();
  if (!/^\d{6,12}$/.test(prop)) return { missing: ['GA4_PROPERTY_ID (digits only)'] };
  cfg.propertyId = prop;
  return cfg;
}

/** One sentence the owner can act on. Never echoes a credential. */
function explainError(err) {
  const s = `${err && err.code || ''} ${err && err.message || ''}`;
  if (/invalid_grant/i.test(s)) return 'The Google Analytics sign-in has expired or was revoked. Run the sign-in again.';
  if (/invalid_client|unauthorized_client/i.test(s)) return 'Google did not accept the OAuth client ID or secret.';
  if (/SERVICE_DISABLED|has not been used|is disabled/i.test(s)) {
    return 'The Google Analytics Data API is switched off in the Cloud project. Enable it in Cloud Console, then reload.';
  }
  if (/insufficient authentication scopes/i.test(s)) return 'The sign-in was not given Analytics access. Run the sign-in again and tick Analytics.';
  if (/PERMISSION_DENIED/i.test(s)) return 'The signed-in Google account cannot see this Analytics property.';
  if (/abort|timeout/i.test(s)) return 'Google Analytics did not answer in time.';
  return 'Could not reach Google Analytics.';
}

const num = (v) => Number(v || 0);
const rowsOf = (report) => (report && report.rows) || [];
/* With two date ranges GA4 adds a dateRange dimension LAST: date_range_0 is the
   first range asked for (this period), date_range_1 the second (the one before). */
function byRange(report, metricIndex = 0) {
  const out = { now: 0, before: 0 };
  for (const r of rowsOf(report)) {
    const dims = r.dimensionValues || [];
    const which = (dims[dims.length - 1] || {}).value;
    const v = num((r.metricValues || [])[metricIndex] && r.metricValues[metricIndex].value);
    if (which === 'date_range_1') out.before += v; else out.now += v;
  }
  return out;
}

/** The five reports, in the order request() asks for them, as one summary. */
function summarise(reports) {
  const [totals, channels, events, landing, hosts] = reports || [];
  const metric = (i) => byRange(totals, i);
  const sessions = metric(0);
  const users = metric(1);
  const engaged = metric(2);
  const t = {
    sessions, users,
    engagedRate: sessions.now ? engaged.now / sessions.now : null,
  };

  t.channels = rowsOf(channels).map((r) => ({
    name: String(r.dimensionValues[0].value || '(not set)'),
    sessions: num(r.metricValues[0].value),
  })).sort((a, b) => b.sessions - a.sessions);

  const ev = {};
  for (const r of rowsOf(events)) ev[r.dimensionValues[0].value] = num(r.metricValues[0].value);
  const step = ([name, label]) => ({ name, label, count: ev[name] || 0 });
  t.designFunnel = DESIGN_FUNNEL.map(step);
  t.quoteFunnel = QUOTE_FUNNEL.map(step);
  t.purchases = ev.purchase || 0;

  t.landing = rowsOf(landing).map((r) => ({
    path: String(r.dimensionValues[0].value || '/'),
    sessions: num(r.metricValues[0].value),
  }));
  t.hosts = rowsOf(hosts).map((r) => ({
    host: String(r.dimensionValues[0].value || ''),
    sessions: num(r.metricValues[0].value),
  }));
  return t;
}

/* Last 28 full days against the 28 before them — Google's own default window,
   so the card and the GA4 report agree when compared side by side. */
const NOW = { startDate: '28daysAgo', endDate: 'yesterday' };
const BEFORE = { startDate: '56daysAgo', endDate: '29daysAgo' };

function requestBody() {
  return {
    requests: [
      { dateRanges: [NOW, BEFORE],
        metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagedSessions' }] },
      { dateRanges: [NOW], dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }], limit: 8 },
      { dateRanges: [NOW], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: FUNNEL_EVENTS } } } },
      { dateRanges: [NOW], dimensions: [{ name: 'landingPagePlusQueryString' }],
        metrics: [{ name: 'sessions' }], limit: 5,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] },
      { dateRanges: [NOW], dimensions: [{ name: 'hostName' }], metrics: [{ name: 'sessions' }], limit: 5,
        orderBys: [{ metric: { metricName: 'sessions' }, desc: true }] },
    ],
  };
}

function createClient({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  let token = null;      // { value, expires }
  let cached = null;     // { at, ttl, result }

  async function call(url, init) {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) {
      const detail = body ? JSON.stringify(body.error || body).slice(0, 600) : text.slice(0, 200);
      const e = new Error(`HTTP ${res.status}: ${detail}`);
      e.code = body && (body.error === 'invalid_grant' ? 'invalid_grant' : body.error && body.error.status);
      throw e;
    }
    return body || {};
  }

  async function accessToken(cfg) {
    if (token && token.expires > now() + 60000) return token.value;
    const body = await call('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: cfg.clientId,
        client_secret: cfg.clientSecret, refresh_token: cfg.refreshToken,
      }).toString(),
    });
    token = { value: body.access_token, expires: now() + Number(body.expires_in || 3600) * 1000 };
    return token.value;
  }

  /** { ok: true, ...summary } | { ok: false, notConnected?, missing?, reason } */
  async function overview() {
    if (cached && now() - cached.at < cached.ttl) return cached.result;
    const cfg = configFromEnv(env);
    if (cfg.missing) return { ok: false, notConnected: true, missing: cfg.missing, reason: 'Not connected yet.' };
    let result;
    try {
      const body = await call(
        `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:batchRunReports`,
        { method: 'POST',
          headers: { Authorization: `Bearer ${await accessToken(cfg)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody()) });
      result = { ok: true, propertyId: cfg.propertyId, ...summarise(body.reports || []) };
    } catch (err) {
      console.error('google analytics overview failed:', err.message);
      result = { ok: false, reason: explainError(err) };
    }
    cached = { at: now(), ttl: result.ok ? OK_TTL_MS : FAIL_TTL_MS, result };
    return result;
  }

  /** Paths that showed the 404 page yesterday, most-viewed first:
   *  [{ host, path, views }]. Throws on failure, like any sweep step should,
   *  so a broken connection is reported rather than read as "no broken links". */
  async function notFoundPages({ title = 'Page Not Found', limit = 50 } = {}) {
    const cfg = configFromEnv(env);
    if (cfg.missing) throw new Error('Google Analytics is not connected: ' + cfg.missing.join(', ') + ' not set');
    const body = await call(
      `https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:runReport`,
      { method: 'POST',
        headers: { Authorization: `Bearer ${await accessToken(cfg)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
          dimensions: [{ name: 'hostName' }, { name: 'pagePath' }],
          metrics: [{ name: 'screenPageViews' }],
          dimensionFilter: { filter: { fieldName: 'pageTitle',
            stringFilter: { matchType: 'CONTAINS', value: title, caseSensitive: false } } },
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit,
        }) });
    return rowsOf(body).map((r) => ({
      host: String(r.dimensionValues[0].value || ''),
      path: String(r.dimensionValues[1].value || ''),
      views: num(r.metricValues[0].value),
    }));
  }

  /** One report, no cache (the morning email asks once a day).
   *  { ok: true, ... } | { ok: false, reason } — never throws. */
  async function report(path, body, shape) {
    const cfg = configFromEnv(env);
    if (cfg.missing) return { ok: false, notConnected: true, reason: 'Google Analytics is not connected.' };
    try {
      const out = await call(`https://analyticsdata.googleapis.com/v1beta/properties/${cfg.propertyId}:${path}`,
        { method: 'POST', headers: { Authorization: `Bearer ${await accessToken(cfg)}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body) });
      return { ok: true, ...shape(out) };
    } catch (err) {
      console.error('google analytics report failed:', err.message);
      return { ok: false, reason: explainError(err) };
    }
  }

  /** Last week vs the week before: sessions and every funnel event. */
  const weeklyFunnel = () => report('batchRunReports', weeklyRequestBody(), (b) => summariseWeek(b.reports || []));

  /** Yesterday's problem events: { counts: { checkout_error: 3, ... } }. */
  const yesterdayProblems = () => report('runReport', {
    dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
    dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: PROBLEM_EVENTS.map(([e]) => e) } } },
  }, (b) => ({ counts: Object.fromEntries(rowsOf(b).map((r) => [r.dimensionValues[0].value, num(r.metricValues[0].value)])) }));

  return { overview, notFoundPages, weeklyFunnel, yesterdayProblems };
}

module.exports = {
  configFromEnv, explainError, summarise, requestBody, createClient,
  REQUIRED, DESIGN_FUNNEL, QUOTE_FUNNEL, FUNNEL_EVENTS, PROPERTY_DEFAULT,
  PROBLEM_EVENTS, weeklyRequestBody, summariseWeek,
};
