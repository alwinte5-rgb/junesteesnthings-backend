/**
 * Meta Conversions API: the server's copy of the browser pixel's events.
 *
 * The pixel misses a share of real quotes (ad blockers, Safari, a tab closed
 * before fbevents.js loads), and a campaign optimising for Lead can only learn
 * from the leads Meta hears about. The server sends the same Lead with the
 * same event_id as the pixel, so Meta counts each quote once whichever
 * arrives, and hears about the ones the browser lost.
 *
 * Email and phone leave this server only as SHA-256 hashes, as Meta requires.
 * Without META_CAPI_ACCESS_TOKEN nothing is sent: the integration is optional
 * and the pixel keeps working on its own.
 */
'use strict';
const crypto = require('crypto');

const GRAPH_VERSION = 'v21.0';
// Same pixel as public/assets/js/analytics.js (dataset "June's Tees1").
const DEFAULT_PIXEL_ID = '348199180594218';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Lowercased, trimmed email, hashed; null when it is not an address. */
function hashEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  return e.includes('@') && e.length <= 254 ? sha256(e) : null;
}

/** Digits with the US country code, hashed; null unless a US number. */
function hashPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) return sha256('1' + d);
  if (d.length === 11 && d.startsWith('1')) return sha256(d);
  return null;
}

/* The pixel's own cookies tie a server event to the browser that made it.
   They are the visitor's to edit, so only the documented shape is passed on. */
const FBP_RE = /^fb\.\d\.\d{10,13}\.\d{1,20}$/;
const FBC_RE = /^fb\.\d\.\d{10,13}\.[A-Za-z0-9_.-]{1,500}$/;
function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

/* The page the form was sent from: origin and path only. A query string can
   carry an email address (mail links), which must not leave unhashed. A
   website event needs a URL, so anything else is the homepage. */
const HOME = 'https://www.jtees.net/';
function sourcePage(referer) {
  try {
    const u = new URL(String(referer || ''));
    if (u.protocol === 'https:' && /^(www\.)?jtees\.net$/.test(u.hostname)) {
      return (u.origin + u.pathname).slice(0, 500);
    }
  } catch (_) { /* not a URL */ }
  return HOME;
}

/**
 * One Lead event in the shape /{pixel}/events takes.
 * eventId must equal the eventID the browser sends for the same quote.
 */
function buildLeadEvent({ eventId, email, phone, ip, userAgent, sourceUrl, cookie, now = Date.now() }) {
  const user_data = {};
  const em = hashEmail(email);
  const ph = hashPhone(phone);
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (ip && ip !== 'unknown') user_data.client_ip_address = String(ip).slice(0, 64);
  if (userAgent) user_data.client_user_agent = String(userAgent).slice(0, 512);
  const fbp = readCookie(cookie, '_fbp');
  const fbc = readCookie(cookie, '_fbc');
  if (FBP_RE.test(fbp)) user_data.fbp = fbp;
  if (FBC_RE.test(fbc)) user_data.fbc = fbc;

  const event = {
    event_name: 'Lead',
    event_time: Math.floor(now / 1000),
    event_id: String(eventId),
    action_source: 'website',
    user_data,
    event_source_url: sourcePage(sourceUrl),
  };
  return event;
}

/**
 * Sends events; resolves { sent: false } when not configured.
 * `post` is axios.post (injected so tests never reach Meta).
 */
async function sendEvents(events, { post, env = process.env } = {}) {
  const token = env.META_CAPI_ACCESS_TOKEN;
  if (!token) return { sent: false, reason: 'not-configured' };
  /* Not overridable: the browser's pixel is fixed in analytics.js, and a
     server sending to a different dataset silently ends the dedupe.
     tests/meta-capi.test.js holds the two equal. */
  const pixelId = DEFAULT_PIXEL_ID;
  const body = { data: events, access_token: token };
  // Events Manager → Test events shows these live without counting them.
  if (env.META_CAPI_TEST_CODE) body.test_event_code = String(env.META_CAPI_TEST_CODE).slice(0, 40);
  let res;
  try {
    res = await post(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`, body,
      { timeout: 5000 });
  } catch (err) {
    /* An axios error carries the request body, access token included, and
       the error reporter sends what it is given to Sentry. Rethrow only the
       status and Meta's own message. */
    const status = err && err.response ? err.response.status : 'no response';
    const metaMsg = err && err.response && err.response.data && err.response.data.error
      ? String(err.response.data.error.message || '').slice(0, 200) : String(err && err.code || '');
    throw new Error(`Meta CAPI ${status}: ${metaMsg}`);
  }
  return { sent: true, received: res && res.data ? res.data.events_received : undefined };
}

module.exports = { buildLeadEvent, sendEvents, hashEmail, hashPhone, readCookie, DEFAULT_PIXEL_ID };
