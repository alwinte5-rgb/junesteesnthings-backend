'use strict';

/* The "10% off for joining our texts" popup on jtees.net (2026-10-18).
 *
 * The popup is a copy of the /texts sign-up form that posts to /texts, so
 * what must hold is that the copy keeps matching the real thing:
 *   - the consent wording is word for word what tools/lib/sms-consent.js
 *     records as agreed to;
 *   - the field names are the ones the /texts handler reads, and its source
 *     ('popup') is one the campaign counts;
 *   - it is on the site's pages, but not the contact, SMS or 404 pages, and
 *     never in the snippets design.jtees.net takes (it has its own popup).
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const NAV = require('../tools/site-nav');
const REINTRO = require('../tools/lib/reintro');
const { TRANSACTIONAL_TEXT, MARKETING_TEXT } = require('../tools/lib/sms-consent');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const JS = read('assets/js/texts-popup.js');
// The script's strings, joined across its + concatenations, entities decoded.
const flat = JS.replace(/'\s*\+\s*\n?\s*'/g, '').replace(/"\s*\+\s*\n?\s*'/g, '').replace(/'\s*\+\s*\n?\s*"/g, '')
  .replace(/\\'/g, "'").replace(/&amp;/g, '&');

test('the consent boxes say exactly what the server records', () => {
  assert.ok(flat.includes(TRANSACTIONAL_TEXT), 'order-updates wording');
  assert.ok(flat.includes(MARKETING_TEXT), 'deals wording');
});

test('it posts the /texts form the server reads, from a counted source', () => {
  assert.match(JS, /<form method="POST" action="\/texts">/);
  for (const name of ['phone', 'email', 'sms_transactional', 'sms_marketing']) {
    assert.match(JS, new RegExp(`name="${name}"`), name);
  }
  assert.match(JS, /name="src" value="popup"/);
  assert.strictEqual(REINTRO.cleanSource('popup'), 'popup', 'popup sign-ups are counted as their own source');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /app\.post\(REINTRO\.SIGNUP_PATH,/, 'the /texts handler it posts to');
  // Only a sign-up the server accepted turns the popup off: the thank-you page
  // sets the flag, the popup's own submit does not.
  assert.match(server, /localStorage\.setItem\('jt_tx_joined'/);
  assert.ok(!/setItem\(KEY_JOINED|store\.set\(KEY_JOINED/.test(JS), 'popup submit does not mark them joined');
});

test('it waits, asks once a fortnight, and never after a sign-up or mid-quote', () => {
  assert.match(JS, /ARM_MS = 6000/);
  assert.match(JS, /AGAIN_MS = 14 \* 86400000/);
  assert.match(JS, /if \(store\.get\(KEY_JOINED\)\) return;/);
  assert.match(JS, /if \(shown \|\| !armed \|\| busy\(\)\) return;/);
  assert.doesNotThrow(() => new Function(JS), 'the script parses');
  // Safari reports a point a few pixels inside the page on exit, not <= 0.
  assert.ok(!/e\.clientY <= 0/.test(JS), 'exit is not limited to clientY <= 0');
  assert.match(JS, /addEventListener\('mouseleave', exit\)/);
  assert.match(JS, /popup=preview/, 'the owner preview link');
});

test('it is on the site pages, not contact, SMS or 404, and not in the shared snippets', () => {
  const v = require('../tools/lib/css-tag').scriptTag('/assets/js/texts-popup.js').v;
  const tag = `<script src="/assets/js/texts-popup.js?v=${v}" defer></script>`;
  for (const rel of NAV.pages()) {
    const html = read(rel);
    if (NAV.NO_POPUP.has(rel)) assert.ok(!html.includes('texts-popup.js'), rel + ': no popup');
    else assert.ok(html.includes(tag), rel + ': current popup script');
  }
  for (const rel of ['contact.html', 'sms-consent.html', '404.html']) assert.ok(NAV.NO_POPUP.has(rel), rel);
  assert.ok(!read('sms-terms.html').includes('texts-popup.js'), 'sms-terms.html: no popup');
  for (const rel of ['assets/data/site-nav.html', 'assets/data/site-footer.html']) {
    assert.ok(!read(rel).includes('texts-popup'), rel + ': design.jtees.net never gets this popup');
  }
});
