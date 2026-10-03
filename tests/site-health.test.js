/**
 * Failures a customer hits, made visible (plan Phase 1d): refused quote forms
 * and 404s, counted in site_health and listed in the morning email.
 *
 * Run: node tests/site-health.test.js
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const H = require('../tools/lib/site-health');

const ROOT = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('each refusal gets one fixed reason, never what was typed', () => {
  assert.strictEqual(H.formFailureReason(429, 'Too many requests'), 'rate_limit');
  assert.strictEqual(H.formFailureReason(400, 'Bad request'), 'bot_filter');
  assert.strictEqual(H.formFailureReason(400, 'Please complete the human check and try again.'), 'human_check');
  assert.strictEqual(H.formFailureReason(400, 'That human check did not pass. Please try again.'), 'human_check');
  assert.strictEqual(H.formFailureReason(400, 'Please enter a valid 10-digit phone number.'), 'validation: Please enter a valid 10-digit phone number.');
  assert.strictEqual(H.formFailureReason(500, 'x'), 'server_error');
  assert.strictEqual(H.formFailureReason(200, ''), '');
  assert.strictEqual(H.formFailureReason(302, ''), '');
  assert.ok(H.formFailureReason(400, 'z'.repeat(500)).length <= 72, 'capped');
});

test('a 404 report keeps a clean path and only the referring host', () => {
  assert.deepStrictEqual(H.cleanNotFound({ site: 'www', path: '/old-page.html?email=a@b.c#x', ref: 'https://l.facebook.com/l.php?u=secret' }),
    { site: 'www', path: '/old-page.html', ref: 'l.facebook.com' });
  assert.deepStrictEqual(H.cleanNotFound({ site: 'design', path: '/x', ref: '' }), { site: 'design', path: '/x', ref: '' });
  assert.strictEqual(H.cleanNotFound({ site: 'evil', path: '/x' }), null, 'unknown site');
  assert.strictEqual(H.cleanNotFound({ site: 'www', path: 'x' }), null, 'not a path');
  assert.strictEqual(H.cleanNotFound({ site: 'www', path: '/' + 'a'.repeat(300) }), null, 'too long');
  assert.strictEqual(H.cleanNotFound({ site: 'www', path: '/a\nb' }), null, 'control characters');
  assert.strictEqual(H.cleanNotFound({ site: 'www', path: '/x', ref: 'javascript:alert(1)' }).ref, '');
  assert.strictEqual(H.cleanNotFound(null), null);
  assert.strictEqual(H.cleanNotFound('x'), null);
  assert.strictEqual(H.notFoundDetail({ site: 'www', path: '/x' }), 'www /x');
});

test('the morning email section: real refusals first, bots as a side count, links on Mondays, escaped', () => {
  assert.strictEqual(H.siteHealthDigestHtml({ formFails: [], notFound: [], esc }), '');
  assert.strictEqual(H.siteHealthDigestHtml({ formFails: [{ detail: 'bot_filter', n: 40 }], notFound: [], esc }), '',
    'bots alone are not worth an email');
  const html = H.siteHealthDigestHtml({ esc,
    formFails: [{ detail: 'rate_limit', n: 2 }, { detail: 'embroidery human_check', n: 1 }, { detail: 'bot_filter', n: 9 }],
    notFound: [{ detail: 'www /<b>old</b>.html', ref: 'google.com', n: 5 }, { detail: 'design /gone', ref: '', n: 1 }] });
  assert.match(html, /3 quote requests refused yesterday<\/b> <span[^>]*>\(plus 9 stopped as bots\)/);
  assert.match(html, /Hit the 4-an-hour limit: 2/);
  assert.match(html, /Failed the human check \(embroidery form\): 1/);
  assert.match(html, /jtees\.net \/&lt;b&gt;old&lt;\/b&gt;\.html — 5× <span[^>]*>from google\.com/);
  assert.match(html, /Design Studio \/gone — 1×<\/div>/);
  assert.doesNotMatch(html, /<b>old/);
});

test('server: counted on both forms before the limiter, 404 endpoint guarded, email wired', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS site_health \(/);
  assert.match(server, /app\.post\('\/submit', countFormFailures\('quote'\), makeRateLimit\(4,/);
  assert.match(server, /app\.post\('\/api\/embroidery-quote', countFormFailures\('embroidery'\), orderRateLimit,/);
  const ep = server.slice(server.indexOf("app.post('/api/not-found'"), server.indexOf("app.post('/api/not-found'") + 600);
  assert.match(ep, /makeRateLimit\(20, 60 \* 60 \* 1000\)/);
  assert.match(ep, /content-length[^\n]*> 2048\) return res\.status\(413\)/);
  assert.match(ep, /!req\.headers\.origin \|\| fromAnotherSite\(req\)\) return res\.status\(403\)/);
  assert.match(ep, /SITEHEALTH\.cleanNotFound\(req\.body\)/);
  assert.match(server, /< \$\{SITE_HEALTH_DAILY_ROWS\}/, 'distinct rows per day are capped');
  assert.match(server, /const healthHtml = await siteHealthHtml\(\)/);
  assert.match(server, /if \(!rows\.length && !ship && !healthHtml\) return;/);
  assert.match(server, /\$\{teamHtml\}\$\{healthHtml\}/);
});

test('pages: the quote form reports its failures, the 404 page reports itself', () => {
  const index = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  for (const r of ['phone', 'email', 'rate_limit', 'network_or_server']) assert.ok(index.includes(`formError('${r}')`), r);
  assert.match(index, /res\.status === 429\)[\s\S]{0,400}call or text us at \(773\) 849-1854/);
  const nf = fs.readFileSync(path.join(ROOT, 'public', '404.html'), 'utf8');
  assert.match(nf, /jtTrack\('page_not_found'/);
  assert.match(nf, /fetch\('\/api\/not-found'/);
  assert.ok(nf.indexOf("fetch('/api/not-found'") > nf.indexOf('/assets/js/analytics.js'), 'after analytics loads');
});
