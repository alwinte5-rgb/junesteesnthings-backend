'use strict';
/*
 * Where a customer first came from (plan Phase 1c).
 *
 * On a visitor's first page view, jtees.net (assets/js/analytics.js) and the
 * Design Studio (analytics.php) store a `jt_ft` cookie on .jtees.net for 90
 * days: the ad/campaign tags (utm_*), click ids (gclid, fbclid, msclkid), the
 * site that linked to us, and the landing page. It is never overwritten, so it
 * answers "how did this person first find us", not "what did they click last".
 *
 * The cookie is the visitor's to edit, so everything here treats it as
 * untrusted: a size cap before parsing, only known keys, every value a capped
 * string, and nothing from it is ever rendered without escaping. It holds no
 * name, email or phone — only marketing tags.
 */

const MAX_COOKIE = 2000;
const FIELDS = { src: 100, med: 100, cmp: 120, ref: 200, land: 200, gclid: 300, fbclid: 300, msclkid: 300, at: 30 };

/** The jt_ft cookie from a raw Cookie header, cleaned, or null. */
function parseFirstTouch(cookieHeader) {
  if (typeof cookieHeader !== 'string' || !cookieHeader) return null;
  const m = /(?:^|;\s*)jt_ft=([^;]*)/.exec(cookieHeader);
  if (!m || !m[1] || m[1].length > MAX_COOKIE) return null;
  let raw;
  try { raw = JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, cap] of Object.entries(FIELDS)) {
    const v = raw[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, cap);
  }
  return Object.keys(out).length ? out : null;
}

const host = (ref) => {
  try { return new URL(/^https?:\/\//.test(ref) ? ref : 'https://' + ref).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
};

/**
 * One line a person reads on the lead card: "Google Ads", "Google search",
 * "Facebook ad", "Instagram", "Email", "Direct"… Most specific evidence first:
 * a click id beats a utm tag, which beats the referring site.
 */
function firstTouchLabel(ft) {
  if (!ft) return '';
  const src = String(ft.src || '').toLowerCase();
  const med = String(ft.med || '').toLowerCase();
  const ref = host(ft.ref || '');
  const paid = /^(cpc|ppc|paid|paidsearch|paid_search|paid-social|paid_social|paidsocial|display|ads?)$/.test(med);
  const camp = ft.cmp ? ` · ${ft.cmp}` : '';
  if (ft.gclid || (/google/.test(src) && paid)) return 'Google Ads' + camp;
  if (ft.msclkid || (/bing|microsoft/.test(src) && paid)) return 'Microsoft (Bing) Ads' + camp;
  if (/instagram|^ig$/.test(src) && (paid || ft.fbclid)) return 'Instagram ad' + camp;
  if (ft.fbclid && !src && /instagram/.test(ref)) return 'Instagram';
  if ((/facebook|^fb$|meta/.test(src) && paid) || (ft.fbclid && paid)) return 'Facebook ad' + camp;
  if (med === 'email' || /brevo|newsletter|mail/.test(src)) return 'Email' + camp;
  if (med === 'sms' || /^(sms|text)$/.test(src)) return 'Text message' + camp;
  if (/instagram|^ig$/.test(src) || /instagram\.com$/.test(ref)) return 'Instagram';
  if (/facebook|^fb$/.test(src) || ft.fbclid || /(^|\.)facebook\.com$|^fb\.me$|^m\.facebook\.com$/.test(ref)) return 'Facebook';
  if (/tiktok/.test(src) || /tiktok\.com$/.test(ref)) return 'TikTok';
  if (/google/.test(src) && /organic|search/.test(med)) return 'Google search';
  if (/business|gbp|maps/.test(src) || /^g\.page$|maps\.google|business\.google/.test(ref)) return 'Google Business Profile';
  if (/(^|\.)google\.[a-z.]+$/.test(ref)) return 'Google search';
  if (/(^|\.)bing\.com$/.test(ref)) return 'Bing search';
  if (/(^|\.)yahoo\.com$|duckduckgo\.com$/.test(ref)) return 'Web search';
  if (/yelp\.com$/.test(ref) || /yelp/.test(src)) return 'Yelp';
  if (src) return `Campaign: ${ft.src}${med ? ' / ' + ft.med : ''}${camp}`;
  if (ref) return `Link from ${ref}`;
  return 'Direct (typed or bookmarked)';
}

module.exports = { parseFirstTouch, firstTouchLabel, FIELDS };
