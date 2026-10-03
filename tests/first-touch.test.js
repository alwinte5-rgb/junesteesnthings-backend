/**
 * Where a customer first came from (plan Phase 1c): the jt_ft cookie.
 *
 * Run: node tests/first-touch.test.js
 *
 * The browser half (assets/js/analytics.js) is pulled out and run against a
 * fake page, so the test cannot drift from what ships. The server half
 * (tools/lib/first-touch.js) treats the cookie as untrusted: it is the
 * visitor's to edit.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseFirstTouch, firstTouchLabel } = require('../tools/lib/first-touch');

const ROOT = path.join(__dirname, '..');
const analytics = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'analytics.js'), 'utf8');
const block = analytics.slice(analytics.indexOf('/* First touch (plan Phase 1c)'));

/** Run the capture block on a fake page; returns the cookies it set. */
function visit({ url, referrer = '', cookie = '' }) {
  const u = new URL(url);
  const set = [];
  const document = { referrer, get cookie() { return cookie; }, set cookie(v) { set.push(v); } };
  const location = { search: u.search, hostname: u.hostname, pathname: u.pathname, protocol: u.protocol };
  new Function('document', 'location', 'URLSearchParams', block)(document, location, URLSearchParams);
  return set;
}
const value = (set) => JSON.parse(decodeURIComponent(/^jt_ft=([^;]*)/.exec(set[0])[1]));

test('first visit from a Google ad stores the tags, the click id and the landing page', () => {
  const set = visit({ url: 'https://www.jtees.net/services/embroidery.html?utm_source=google&utm_medium=cpc&utm_campaign=embroidery-chi&gclid=abc123',
    referrer: 'https://www.google.com/' });
  assert.strictEqual(set.length, 1);
  assert.match(set[0], /; max-age=7776000; path=\/; domain=\.jtees\.net; SameSite=Lax; Secure$/);
  const ft = value(set);
  assert.deepStrictEqual({ src: ft.src, med: ft.med, cmp: ft.cmp, gclid: ft.gclid, ref: ft.ref, land: ft.land },
    { src: 'google', med: 'cpc', cmp: 'embroidery-chi', gclid: 'abc123', ref: 'https://www.google.com/', land: 'jtees.net/services/embroidery.html' });
  assert.match(ft.at, /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(firstTouchLabel(parseFirstTouch('jt_ft=' + /^jt_ft=([^;]*)/.exec(set[0])[1])), 'Google Ads · embroidery-chi');
});

test('it is the FIRST touch: an existing cookie is never overwritten', () => {
  assert.deepStrictEqual(visit({ url: 'https://design.jtees.net/?utm_source=facebook', cookie: 'x=1; jt_ft=%7B%7D' }), []);
});

test('our own sites are not a referrer, and a referrer keeps no query string', () => {
  assert.strictEqual(value(visit({ url: 'https://design.jtees.net/products.php', referrer: 'https://www.jtees.net/#shop' })).ref, undefined);
  assert.strictEqual(value(visit({ url: 'https://www.jtees.net/', referrer: 'https://l.instagram.com/?u=https%3A%2F%2Fjtees.net&e=secret' })).ref,
    'https://l.instagram.com/');
});

test('every value is capped in the browser too', () => {
  const ft = value(visit({ url: 'https://www.jtees.net/?utm_source=' + 'x'.repeat(500) }));
  assert.strictEqual(ft.src.length, 100);
});

test('the server keeps only known keys, caps them, and refuses junk', () => {
  const c = (o) => 'a=1; jt_ft=' + encodeURIComponent(JSON.stringify(o)) + '; b=2';
  assert.deepStrictEqual(parseFirstTouch(c({ src: ' ig ', email: 'x@y.z', name: 'Bo', land: 'jtees.net/' })), { src: 'ig', land: 'jtees.net/' });
  assert.strictEqual(parseFirstTouch(c({ src: 'y'.repeat(900) })).src.length, 100);
  assert.strictEqual(parseFirstTouch('jt_ft=' + 'a'.repeat(2500)), null, 'oversized cookie is not even parsed');
  assert.strictEqual(parseFirstTouch('jt_ft=%7Bnot json'), null);
  assert.strictEqual(parseFirstTouch(c(['src'])), null, 'arrays are refused');
  assert.strictEqual(parseFirstTouch(c({ src: 5, med: { a: 1 } })), null, 'non-strings are dropped');
  assert.strictEqual(parseFirstTouch(''), null);
  assert.strictEqual(parseFirstTouch(undefined), null);
});

test('labels say what a person would', () => {
  const L = (o) => firstTouchLabel(o);
  assert.strictEqual(L({ gclid: 'x' }), 'Google Ads');
  assert.strictEqual(L({ src: 'facebook', med: 'paid_social', cmp: 'reunions' }), 'Facebook ad · reunions');
  assert.strictEqual(L({ src: 'instagram', med: 'paid' }), 'Instagram ad');
  assert.strictEqual(L({ fbclid: 'x', ref: 'https://l.instagram.com/' }), 'Instagram');
  assert.strictEqual(L({ ref: 'https://www.google.com/' }), 'Google search');
  assert.strictEqual(L({ ref: 'https://www.bing.com/' }), 'Bing search');
  assert.strictEqual(L({ src: 'gbp', med: 'organic' }), 'Google Business Profile');
  assert.strictEqual(L({ src: 'brevo', med: 'email', cmp: 'oct' }), 'Email · oct');
  assert.strictEqual(L({ med: 'sms' }), 'Text message');
  assert.strictEqual(L({ ref: 'https://m.facebook.com/' }), 'Facebook');
  assert.strictEqual(L({ ref: 'https://www.yelp.com/biz/x' }), 'Yelp');
  assert.strictEqual(L({ src: 'flyer', med: 'qr' }), 'Campaign: flyer / qr');
  assert.strictEqual(L({ ref: 'https://chicagoreader.com/a' }), 'Link from chicagoreader.com');
  assert.strictEqual(L({ land: 'jtees.net/' }), 'Direct (typed or bookmarked)');
  assert.strictEqual(L(null), '');
});

test('quote requests and embroidery requests save it; the owner sees it, escaped', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /ALTER TABLE submissions ADD COLUMN IF NOT EXISTS first_touch JSONB/);
  assert.match(server, /first_touch: parseFirstTouch\(req\.headers\.cookie\) \}/);
  assert.match(server, /INSERT INTO submissions \(name, phone, email, description, photo_url, dedupe_key, first_touch\)/);
  assert.match(server, /dedupe_key, source, first_touch\)\s+VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,'embroidery',\$7\)/);
  assert.match(server, /Came from: <b style="color:#0B1F4B">\$\{\s*escEmail\(firstTouchLabel\(l\.first_touch\)\)\}/);
  assert.match(server, /landed on \$\{escEmail\(l\.first_touch\.land\)\}/);
  assert.match(server, /Came from<\/td><td style="padding:8px;">\$\{escEmail\(firstTouchLabel\(s\.first_touch\)\)\}/);
  assert.match(server, /came from \$\{escEmail\(firstTouchLabel\(parseFirstTouch\(/, 'studio orders: re-cleaned, escaped');
});
