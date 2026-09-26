'use strict';

/* SMS consent is what makes texting customers legal, and what Twilio's toll-free
   verification reviews. What must never regress:

   - a text is only recorded as consented when a box was actually ticked
   - marketing is its own box, and neither box is pre-ticked
   - the wording on the page is the wording stored with the consent row
   - every customer-facing phone field on jtees.net records consent
   - the designer's endpoint is behind the shared key
   - /sms-terms carries what carriers check for */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  TRANSACTIONAL_TEXT, MARKETING_TEXT, normalizeUsPhone, parseSmsConsent, consentCheckboxesHtml,
} = require('../tools/lib/sms-consent');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'public', 'sms-terms.html'), 'utf8');
const unescape = (s) => s.replace(/&amp;/g, '&');

function routeBody(anchor) {
  const start = server.indexOf(anchor);
  assert.ok(start > 0, `route not found: ${anchor}`);
  return server.slice(start, server.indexOf('\n});', start));
}

test('US phone numbers normalise to E.164; junk does not', () => {
  assert.equal(normalizeUsPhone('(773) 849-1854'), '+17738491854');
  assert.equal(normalizeUsPhone('1-773-849-1854'), '+17738491854');
  assert.equal(normalizeUsPhone('849-1854'), '');
  assert.equal(normalizeUsPhone('(073) 849-1854'), '');
  assert.equal(normalizeUsPhone(null), '');
});

test('no ticked box, or no phone, records nothing', () => {
  assert.equal(parseSmsConsent({ phone: '7738491854' }), null);
  assert.equal(parseSmsConsent({ phone: '7738491854', sms_transactional: '', sms_marketing: 'off' }), null);
  assert.equal(parseSmsConsent({ phone: '', sms_transactional: 'on' }), null);
});

test('each box is read on its own', () => {
  assert.deepEqual(parseSmsConsent({ phone: '773 849 1854', sms_transactional: '1' }),
    { phone: '+17738491854', transactional: true, marketing: false });
  assert.deepEqual(parseSmsConsent({ phone: '773 849 1854', sms_marketing: true }),
    { phone: '+17738491854', transactional: false, marketing: true });
});

test('marketing wording says consent is not a condition of purchase', () => {
  assert.match(MARKETING_TEXT, /not a condition of purchase/);
  for (const t of [TRANSACTIONAL_TEXT, MARKETING_TEXT]) {
    assert.match(t, /STOP/);
    assert.match(t, /Msg & data rates may apply/);
  }
});

test('the rendered boxes are never pre-ticked', () => {
  const html = consentCheckboxesHtml();
  assert.equal((html.match(/type="checkbox"/g) || []).length, 2);
  assert.doesNotMatch(html, /\bchecked\b/);
  assert.match(html, /\/sms-terms/);
});

test('the homepage form shows exactly the stored wording, unticked', () => {
  const plain = unescape(index);
  assert.ok(plain.includes(TRANSACTIONAL_TEXT), 'transactional wording drifted from sms-consent.js');
  assert.ok(plain.includes(MARKETING_TEXT), 'marketing wording drifted from sms-consent.js');
  const block = index.slice(index.indexOf('class="sms-consent"'), index.indexOf('</div>', index.indexOf('class="sms-consent"')));
  assert.doesNotMatch(block, /\bchecked\b/);
});

test('every jtees.net phone entry point records consent', () => {
  const submit = routeBody("app.post('/submit'");
  assert.ok(submit.indexOf('recordSmsConsent(') > 0);
  assert.ok(submit.indexOf('recordSmsConsent(') < submit.indexOf('if (duplicate)'),
    'consent must be recorded before the duplicate early-return');
  assert.match(routeBody("app.post('/q/:code/accept'"), /recordSmsConsent\(parseSmsConsent\(\{ \.\.\.rb, phone: q\.phone \}\)/);
  assert.match(routeBody("app.post('/api/embroidery-quote'"), /recordSmsConsent\(/);
  assert.match(server, /\$\{consentCheckboxesHtml\(\)\}/, 'quote accept form must render the boxes');
});

test('the designer consent endpoint requires the shared key', () => {
  assert.match(server, /app\.post\('\/api\/sms-consent', requireInternalKey,/);
});

test('consent rows are append-only and keep the wording', () => {
  assert.match(server, /CREATE TABLE IF NOT EXISTS sms_consents/);
  assert.match(server, /consent_text\s+TEXT NOT NULL/);
  assert.doesNotMatch(server, /UPDATE sms_consents/);
});

test('only one clientIp exists (a second would silently replace the spoof-safe one)', () => {
  assert.equal((server.match(/^function clientIp\(/gm) || []).length, 1);
});

test('/sms-terms carries what carriers check for', () => {
  assert.match(server, /app\.get\('\/sms-terms'/);
  for (const re of [/STOP/, /HELP/, /Message and data rates may apply/, /not a condition of any purchase/,
    /No mobile information will be\s+shared with third parties/, /privacy\.php/, /info@jtees\.net/,
    /up to 4 messages per month/]) {
    assert.match(terms, re);
  }
});
