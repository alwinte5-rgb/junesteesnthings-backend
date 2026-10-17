/**
 * Quotes reach Meta as one Lead from both the pixel and the server.
 *
 * Run: node tests/meta-capi.test.js
 *
 * tools/lib/meta-capi.js builds and sends the server's Lead; the page sends
 * the pixel's Lead with the same id (analytics.js meta_event_id), so Meta
 * keeps one. Nothing here reaches Meta: `post` is a fake.
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const CAPI = require('../tools/lib/meta-capi');

const ROOT = path.join(__dirname, '..');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

test('email and phone leave only as SHA-256 of the normalised value', () => {
  const ev = CAPI.buildLeadEvent({ eventId: 'quote-7', email: '  Pat@Example.COM ', phone: '(773) 900-4592', now: 1_700_000_000_000 });
  assert.deepStrictEqual(ev.user_data.em, [sha('pat@example.com')]);
  assert.deepStrictEqual(ev.user_data.ph, [sha('17739004592')]);
  assert.strictEqual(JSON.stringify(ev).includes('example.com'), false);
  assert.strictEqual(JSON.stringify(ev).includes('9004592'), false);
  assert.strictEqual(ev.event_name, 'Lead');
  assert.strictEqual(ev.event_id, 'quote-7');
  assert.strictEqual(ev.event_time, 1_700_000_000);
  assert.strictEqual(ev.action_source, 'website');
});

test('a non-US phone and a non-address email are left out, not guessed', () => {
  const ev = CAPI.buildLeadEvent({ eventId: 'quote-1', email: 'nope', phone: '12345' });
  assert.strictEqual(ev.user_data.em, undefined);
  assert.strictEqual(ev.user_data.ph, undefined);
});

test('pixel cookies pass only in their documented shape', () => {
  const good = CAPI.buildLeadEvent({ eventId: 'q', cookie: 'a=1; _fbp=fb.1.1700000000000.123456789; _fbc=fb.1.1700000000000.IwAR0abc.def_-1' });
  assert.strictEqual(good.user_data.fbp, 'fb.1.1700000000000.123456789');
  assert.strictEqual(good.user_data.fbc, 'fb.1.1700000000000.IwAR0abc.def_-1');
  const bad = CAPI.buildLeadEvent({ eventId: 'q', cookie: '_fbp=<script>; _fbc=fb.1.x.y' });
  assert.strictEqual(bad.user_data.fbp, undefined);
  assert.strictEqual(bad.user_data.fbc, undefined);
});

test('the source URL is a jtees.net page without its query, else the homepage', () => {
  const url = (r) => CAPI.buildLeadEvent({ eventId: 'q', sourceUrl: r }).event_source_url;
  assert.strictEqual(url('https://www.jtees.net/services/embroidery.html#quote'), 'https://www.jtees.net/services/embroidery.html');
  assert.strictEqual(url('https://jtees.net/?email=pat%40example.com&utm_source=brevo'), 'https://jtees.net/');
  assert.strictEqual(url('https://evil.example/jtees.net/'), 'https://www.jtees.net/');
  assert.strictEqual(url('https://jtees.net.evil.example/'), 'https://www.jtees.net/');
  assert.strictEqual(url(undefined), 'https://www.jtees.net/');
});

test('without a token nothing is sent', async () => {
  let called = false;
  const out = await CAPI.sendEvents([{}], { post: async () => { called = true; }, env: {} });
  assert.deepStrictEqual(out, { sent: false, reason: 'not-configured' });
  assert.strictEqual(called, false);
});

test('with a token it posts to the June\'s Tees pixel, test code when set', async () => {
  let seen;
  const post = async (url, body, opts) => { seen = { url, body, opts }; return { data: { events_received: 1 } }; };
  const out = await CAPI.sendEvents([{ event_name: 'Lead' }], { post, env: { META_CAPI_ACCESS_TOKEN: 'tok', META_CAPI_TEST_CODE: 'TEST1', META_PIXEL_ID: '1111111111' } });
  assert.deepStrictEqual(out, { sent: true, received: 1 });
  assert.match(seen.url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/348199180594218\/events$/);
  assert.strictEqual(seen.body.access_token, 'tok');
  assert.strictEqual(seen.body.test_event_code, 'TEST1');
  assert.ok(seen.opts.timeout > 0);
});

test('a failed send never carries the access token in its error', async () => {
  const post = async () => {
    const err = new Error('Request failed with status code 400');
    err.config = { data: JSON.stringify({ access_token: 'SECRET-TOKEN' }) };
    err.response = { status: 400, data: { error: { message: 'Invalid parameter' } } };
    throw err;
  };
  await assert.rejects(
    CAPI.sendEvents([{}], { post, env: { META_CAPI_ACCESS_TOKEN: 'SECRET-TOKEN' } }),
    (e) => {
      assert.strictEqual(e.message, 'Meta CAPI 400: Invalid parameter');
      assert.strictEqual(e.config, undefined);
      assert.strictEqual(JSON.stringify(e).includes('SECRET-TOKEN'), false);
      return true;
    });
});

test('the quote form sends Meta one Lead, under the server\'s id', () => {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert.strictEqual(html.includes("fbq('track', 'Lead')"), false, 'a direct fbq Lead doubles the jtTrack one');
  // No id (resubmit, no human check) = the server sent nothing, so nor does the page.
  assert.match(html, /if \(window\.jtTrack && saved\.lead_event_id\) jtTrack\('quote_submitted', \{ meta_event_id: saved\.lead_event_id \}\)/);
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /const leadEventId = 'quote-' \+ submissionId;/);
  assert.match(server, /lead_event_id: unverified \? undefined : leadEventId/);
});

test('jtTrack passes meta_event_id to the pixel as eventID and not to GA', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'analytics.js'), 'utf8');
  const fbq = [];
  const gtag = [];
  const window = {};
  const document = {
    createElement: () => ({}), head: { appendChild() {} }, cookie: '', referrer: '',
    getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }],
    addEventListener() {},
  };
  const location = { pathname: '/', search: '', hostname: 'www.jtees.net', protocol: 'https:', origin: 'https://www.jtees.net' };
  new Function('window', 'document', 'location', 'URLSearchParams', src)(window, document, location, URLSearchParams);
  window.fbq = (...a) => fbq.push(a);
  window.gtag = (...a) => gtag.push(a);
  window.jtTrack('quote_submitted', { meta_event_id: 'quote-42' });
  assert.deepStrictEqual(fbq.at(-1), ['track', 'Lead', {}, { eventID: 'quote-42' }]);
  const ga = gtag.find((a) => a[0] === 'event' && a[1] === 'quote_submitted');
  assert.ok(ga, 'GA still gets quote_submitted');
  assert.strictEqual('meta_event_id' in ga[2], false);
});

test('server and browser send to the same pixel', () => {
  const src = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'analytics.js'), 'utf8');
  const browser = src.match(/var META_PIXEL_ID = '(\d+)'/)[1];
  assert.strictEqual(browser, CAPI.DEFAULT_PIXEL_ID);
});

test('a duplicate resubmit answers without an event id', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /return res\.json\(\{ ok: true, duplicate: true \}\);/);
});
