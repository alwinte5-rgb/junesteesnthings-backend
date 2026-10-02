'use strict';

/* Google Ads: a read-only look at the last 30 days, for the owner's dashboard.

   Since 2026-09-10 the API no longer needs a developer token: access comes from
   the Google Cloud project that issued the OAuth client, and the project's
   access level (Test, Explorer, Basic) decides whether real accounts answer.
   So what this needs is the OAuth client, a refresh token from signing in once
   (tools/google-ads-signin.js), the ad account, and the manager account it is
   reached through.

   Only reads. Nothing here changes a campaign, a bid or a budget.

   Every answer is cached: the dashboard is opened many times a day and the
   Explorer level allows 2,880 operations a day. A failure is cached too, for
   less time, so a broken connection does not spend the allowance retrying on
   every page load. */

const API_VERSION_DEFAULT = 'v25';
const OK_TTL_MS = 30 * 60 * 1000;
const FAIL_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 6000;

const REQUIRED = {
  clientId: 'GOOGLE_ADS_CLIENT_ID',
  clientSecret: 'GOOGLE_ADS_CLIENT_SECRET',
  refreshToken: 'GOOGLE_ADS_REFRESH_TOKEN',
  customerId: 'GOOGLE_ADS_CUSTOMER_ID',
  loginCustomerId: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
};

/** A customer ID as Google shows it (123-456-7890) or bare; ten digits or null. */
function customerDigits(v) {
  const d = String(v || '').replace(/[\s-]/g, '');
  return /^\d{10}$/.test(d) ? d : null;
}

/** Settings from the environment, or { missing: [names] } saying what is not set. */
function configFromEnv(env = process.env) {
  const cfg = {};
  const missing = [];
  for (const [k, name] of Object.entries(REQUIRED)) {
    const v = String(env[name] || '').trim();
    cfg[k] = k.endsWith('ustomerId') ? customerDigits(v) : v;
    if (!cfg[k]) missing.push(name);
  }
  if (missing.length) return { missing };
  cfg.version = /^v\d{2}$/.test(String(env.GOOGLE_ADS_API_VERSION || '')) ? env.GOOGLE_ADS_API_VERSION : API_VERSION_DEFAULT;
  /* Optional and ignored by the API since the sunset; sent only if still set. */
  cfg.developerToken = String(env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim() || null;
  return cfg;
}

/** Turn a failure into one sentence the owner can act on. Never echoes a credential. */
function explainError(err) {
  const s = `${err && err.code || ''} ${err && err.message || ''}`;
  if (/invalid_grant/i.test(s)) return 'The Google sign-in has expired or was revoked. Run the sign-in again.';
  if (/invalid_client|unauthorized_client/i.test(s)) return 'Google did not accept the OAuth client ID or secret.';
  if (/DEVELOPER_TOKEN|NOT_APPROVED|access level|test account/i.test(s)) {
    return 'The Cloud project only has Test access. It needs Explorer access (Google Ads API Overview in Cloud Console) to read a real account.';
  }
  if (/USER_PERMISSION_DENIED|PERMISSION_DENIED|CUSTOMER_NOT_ENABLED/i.test(s)) {
    return 'The signed-in Google account cannot see this ad account. Check the account is linked under the manager account.';
  }
  if (/abort|timeout/i.test(s)) return 'Google Ads did not answer in time.';
  return 'Could not reach Google Ads.';
}

/** The account total and top campaigns from the two query results. Costs are in micros. */
function summarise(totalRows, campaignRows) {
  const n = (v) => Number(v || 0);
  const t = { spend: 0, clicks: 0, impressions: 0, conversions: 0, value: 0 };
  for (const r of totalRows || []) {
    const m = r.metrics || {};
    t.spend += n(m.costMicros) / 1e6;
    t.clicks += n(m.clicks);
    t.impressions += n(m.impressions);
    t.conversions += n(m.conversions);
    t.value += n(m.conversionsValue);
  }
  t.cpc = t.clicks ? t.spend / t.clicks : null;
  t.costPerConversion = t.conversions ? t.spend / t.conversions : null;
  t.ctr = t.impressions ? t.clicks / t.impressions : null;
  const campaigns = (campaignRows || []).map((r) => ({
    name: String((r.campaign && r.campaign.name) || 'Unnamed campaign'),
    status: String((r.campaign && r.campaign.status) || ''),
    spend: n(r.metrics && r.metrics.costMicros) / 1e6,
    clicks: n(r.metrics && r.metrics.clicks),
    conversions: n(r.metrics && r.metrics.conversions),
  }));
  return { ...t, campaigns };
}

const TOTAL_GAQL = `SELECT metrics.cost_micros, metrics.clicks, metrics.impressions,
  metrics.conversions, metrics.conversions_value
  FROM customer WHERE segments.date DURING LAST_30_DAYS`;
const CAMPAIGN_GAQL = `SELECT campaign.name, campaign.status, metrics.cost_micros, metrics.clicks, metrics.conversions
  FROM campaign WHERE segments.date DURING LAST_30_DAYS AND campaign.status != 'REMOVED'
  ORDER BY metrics.cost_micros DESC LIMIT 5`;

function createClient({ env = process.env, fetchImpl = globalThis.fetch, now = () => Date.now() } = {}) {
  let token = null;      // { value, expires }
  let cached = null;     // { at, ttl, result }

  async function call(url, init) {
    const res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) {
      /* Keep Google's reason codes, which explainError reads; never the request. */
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

  async function search(cfg, query) {
    const headers = {
      Authorization: `Bearer ${await accessToken(cfg)}`,
      'login-customer-id': cfg.loginCustomerId,
      'Content-Type': 'application/json',
    };
    if (cfg.developerToken) headers['developer-token'] = cfg.developerToken;
    const body = await call(
      `https://googleads.googleapis.com/${cfg.version}/customers/${cfg.customerId}/googleAds:search`,
      { method: 'POST', headers, body: JSON.stringify({ query }) });
    return body.results || [];
  }

  /** { ok: true, ...summary } | { ok: false, notConnected?, missing?, reason } */
  async function overview() {
    if (cached && now() - cached.at < cached.ttl) return cached.result;
    const cfg = configFromEnv(env);
    if (cfg.missing) return { ok: false, notConnected: true, missing: cfg.missing, reason: 'Not connected yet.' };
    let result;
    try {
      const [totals, campaigns] = await Promise.all([search(cfg, TOTAL_GAQL), search(cfg, CAMPAIGN_GAQL)]);
      result = { ok: true, customerId: cfg.customerId, ...summarise(totals, campaigns) };
    } catch (err) {
      console.error('google ads overview failed:', err.message);
      result = { ok: false, reason: explainError(err) };
    }
    cached = { at: now(), ttl: result.ok ? OK_TTL_MS : FAIL_TTL_MS, result };
    return result;
  }

  return { overview };
}

module.exports = { configFromEnv, customerDigits, explainError, summarise, createClient, REQUIRED };
