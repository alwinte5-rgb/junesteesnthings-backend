'use strict';

/* Customer order-update texts.

   What must hold:
   - every template is GSM-7 and one segment (cost), branded, with STOP (terms)
   - a milestone is texted once, when it is NEWLY reached — moving an old card
     must not re-announce last month's pickup
   - only the furthest new milestone goes out
   - payments are keyed on the payment, not the amount (50/50 deposit+balance)
   - consent is checked before every send, and inbound STOP is recorded
   - inbound texts are signature-verified */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { T, plain, isGsm7 } = require('../tools/lib/sms-templates');
const { twilioSignature, verifyTwilioSignature, classifyInbound } = require('../tools/lib/twilio-webhook');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const worst = {
  code: 'ABCDEF', amount: 12345.67, stillDue: 9999.99, orderId: 1234567, tracking: '9400 1000 0000 0000 0000 00',
};
const all = [
  T.paymentReceived(worst), T.paymentReceived({ ...worst, stillDue: 0 }), T.inProduction(worst),
  T.readyForPickup(worst), T.finished(worst), T.shipped(worst), T.shipped({ code: 'ABCDEF' }),
  T.studioOrderPlaced(worst), T.studioOrderShipped(worst), T.studioOrderShipped({ orderId: 12 }),
];

test('every template is one GSM-7 segment, branded, with an opt-out', () => {
  for (const m of all) {
    assert.ok(isGsm7(m.body), `not GSM-7: ${m.body}`);
    assert.ok(m.body.length <= 160, `${m.body.length} chars: ${m.body}`);
    assert.match(m.body, /^June's Tees: /);
    assert.match(m.body, /Reply STOP to opt out\.$/);
    assert.ok(m.template && m.template.length <= 80);
  }
});

test('customer-supplied text cannot break GSM-7', () => {
  const m = T.shipped({ code: 'ABCDEF', tracking: '“1Z—999” ✓ 📦' });
  assert.ok(isGsm7(m.body), m.body);
  assert.equal(plain('It’s — “ok”'), 'It\'s - "ok"');
});

test('payment texts carry no amount in the dedupe key', () => {
  assert.equal(T.paymentReceived({ code: 'A', amount: 50 }).template,
    T.paymentReceived({ code: 'A', amount: 50 }).template);
  assert.match(server, /ref: 'payment:' \+ session\.id/);
  // Manual payments share the ledger's idempotency key, so a double-click is
  // one payment and one text.
  assert.match(server, /ref: 'payment:' \+ manualRef\(minute\)/);
  assert.match(server, /extRef: manualRef\(minute\)/);
  assert.doesNotMatch(server, /'payment:manual:' \+ nq\.code \+ ':' \+ Date\.now\(\)/);
});

function loadMilestones() {
  const start = server.indexOf('function textQuoteMilestones(');
  assert.ok(start > 0, 'textQuoteMilestones not found');
  const end = server.indexOf('\n}\n', start) + 2;
  const sent = [];
  const ctx = vm.createContext({
    SMS: T, sendCustomerSms: (a) => { sent.push(a); return Promise.resolve('sent'); },
  });
  vm.runInContext(server.slice(start, end) + ';this.f = textQuoteMilestones;', ctx);
  return { f: ctx.f, sent };
}

const base = { code: 'ABC123', phone: '7738491854', ship_method: 'pickup', production_at: null, shipped_at: null };

test('a newly reached pickup texts "ready for pickup" once', () => {
  const { f, sent } = loadMilestones();
  f(base, { ...base, shipped_at: new Date() });
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg.body, /ready for pickup/);
  assert.equal(sent[0].kind, 'transactional');
  assert.equal(sent[0].ref, 'quote:ABC123');
});

test('an already-reached milestone is not re-announced', () => {
  const { f, sent } = loadMilestones();
  const done = { ...base, production_at: new Date(), shipped_at: new Date() };
  f(done, { ...done, delivered_at: new Date() });
  assert.equal(sent.length, 0);
});

test('jumping straight to ship sends only the furthest milestone', () => {
  const { f, sent } = loadMilestones();
  f(base, { ...base, production_at: new Date(), shipped_at: new Date(), ship_method: 'ground', tracking: '1Z9' });
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg.body, /has shipped! Tracking: 1Z9\./);
});

test('no ship method yet means a neutral "finished", not a guess', () => {
  const { f, sent } = loadMilestones();
  f({ ...base, ship_method: null }, { ...base, ship_method: null, shipped_at: new Date() });
  assert.match(sent[0].msg.body, /finished/);
});

test('in production texts on its own; no phone texts nothing', () => {
  const a = loadMilestones();
  a.f(base, { ...base, production_at: new Date() });
  assert.match(a.sent[0].msg.body, /in production/);
  const b = loadMilestones();
  b.f({ ...base, phone: '' }, { ...base, phone: '', shipped_at: new Date() });
  assert.equal(b.sent.length, 0);
});

test('both board routes read the row before updating it', () => {
  for (const anchor of ["app.post('/quote/:code/step'", "app.post('/quote/:code/stage'"]) {
    const start = server.indexOf(anchor);
    const body = server.slice(start, server.indexOf('\n});', start));
    const before = body.indexOf("SELECT * FROM quotes WHERE code = $1");
    const update = body.indexOf('UPDATE quotes SET');
    assert.ok(before > 0 && before < update, `${anchor} must read before it writes`);
    assert.match(body, /textQuoteMilestones\(prev\[0\], rows\[0\]\)/);
  }
});

test('sendCustomerSms checks consent for the right kind before sending', () => {
  const start = server.indexOf('async function sendCustomerSms(');
  const body = server.slice(start, server.indexOf('\n}\n', start));
  const consentAt = body.indexOf('smsConsentFor(to)');
  const sendAt = body.indexOf('twilioSend(to, msg.body)');
  assert.ok(consentAt > 0 && consentAt < sendAt);
  assert.match(body, /kind === 'marketing' \? c\.marketing : c\.transactional/);
  assert.match(body, /ON CONFLICT DO NOTHING RETURNING id/);
  assert.match(body, /twilioCode === 21610/);
});

test('designer consent is recorded before the order confirmation that texts', () => {
  const php = path.join(process.env.HOME || '', 'lumise-designer', 'php_connector.php');
  if (!fs.existsSync(php)) return; // designer repo not checked out alongside
  const src = fs.readFileSync(php, 'utf8');
  assert.ok(src.indexOf("jt_sms_consent($_POST['phone']") < src.indexOf("jt_send_mail('order-confirmation'"));
});

test('Twilio signature: valid passes, tampered fails', () => {
  const url = 'https://www.jtees.net/webhooks/twilio/sms';
  const params = { From: '+17735550100', Body: 'STOP', To: '+18445550100' };
  const sig = twilioSignature('secret-token', url, params);
  assert.ok(verifyTwilioSignature('secret-token', url, params, sig));
  assert.ok(!verifyTwilioSignature('secret-token', url, { ...params, Body: 'START' }, sig));
  assert.ok(!verifyTwilioSignature('other-token', url, params, sig));
  assert.ok(!verifyTwilioSignature('secret-token', url, params, ''));
});

test('matches the official twilio library (getExpectedTwilioSignature, twilio@5)', () => {
  const params = {
    CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234',
    From: '+12349013030', To: '+18005551212',
  };
  assert.equal(
    twilioSignature('12345', 'https://mycompany.com/myapp.php?foo=1&bar=2', params),
    '0/KCTR6DLpKmkAf8muzZqo1nDgQ=');
});

test('inbound keywords', () => {
  assert.equal(classifyInbound(' stop '), 'stop');
  assert.equal(classifyInbound('Unsubscribe.'), 'stop');
  assert.equal(classifyInbound('START'), 'start');
  assert.equal(classifyInbound('help'), 'help');
  assert.equal(classifyInbound('stop by at 3?'), 'message');
});

test('inbound webhook verifies before acting, and records STOP', () => {
  const start = server.indexOf("app.post('/webhooks/twilio/sms'");
  const body = server.slice(start, server.indexOf('\n});', start));
  assert.ok(body.indexOf('verifyTwilioSignature(') < body.indexOf('recordSmsConsent('));
  assert.match(body, /transactional: false, marketing: false \}, \{ source: 'sms-reply:stop' \}/);
  assert.match(body, /sendStatus\(401\)/);
});

test('cart-code text stays within two GSM-7 segments with the longest cart link', () => {
  const m = T.cartCode({ code: 'ABCDEFGHIJKLMNOPQRST', pct: 50,
    restoreUrl: 'https://design.jtees.net/capture-cart.php?restore=' + 'f'.repeat(64) });
  assert.ok(isGsm7(m.body));
  assert.ok(m.body.length <= 306, `${m.body.length} chars`);
  assert.match(m.body, /Reply STOP to opt out\.$/);
});

test('popup texting: behind the key, marketing consent required, rate limited before anything', () => {
  const start = server.indexOf("app.post('/api/sms-cart-code'");
  const body = server.slice(start, server.indexOf('\n});', start));
  assert.match(body, /^app\.post\('\/api\/sms-cart-code', requireInternalKey,/);
  assert.ok(body.indexOf('cartSmsAllowed(') < body.indexOf('recordSmsConsent('));
  assert.match(body, /!consent\.marketing\) return res\.status\(400\)/);
  assert.match(body, /kind: 'marketing'/);
  // Only a link back to our own designer can go in the text.
  assert.ok(body.includes('/^https:\\/\\/design\\.jtees\\.net\\/capture-cart\\.php'), 'restore link must be pinned to the designer');
});

test('popup rate limit: 3 per IP per hour, 40 overall', () => {
  const start = server.indexOf('const _cartSmsHits');
  const end = server.indexOf("app.post('/api/sms-cart-code'");
  const ctx = vm.createContext({ Map, Date, String });
  vm.runInContext(server.slice(start, end) + ';this.f = cartSmsAllowed;', ctx);
  const t = 1e12;
  assert.ok(ctx.f('1.1.1.1', t) && ctx.f('1.1.1.1', t) && ctx.f('1.1.1.1', t));
  assert.ok(!ctx.f('1.1.1.1', t), 'fourth from one IP in an hour');
  assert.ok(ctx.f('1.1.1.1', t + 3600001), 'allowed again after an hour');
  let ok = 0;
  for (let i = 0; i < 60; i++) if (ctx.f('10.0.0.' + i, t + 3600002)) ok++;
  assert.ok(ok <= 40, `${ok} allowed in one hour`);
});

test('tracking typed before Shipped is ticked sends nothing until it is', () => {
  const start = server.indexOf("app.post('/quote/:code/shipping'");
  const body = server.slice(start, server.indexOf('\n});', start));
  assert.match(body, /if \(q && q\.shipped_at && tracking/);
  assert.match(server, /textQuoteMilestones\(prev\[0\], rows\[0\]\); emailTrackingOnShip\(prev\[0\], rows\[0\]\);/);
});

test('a send stuck in "sending" is released for retry', () => {
  const start = server.indexOf('async function sendCustomerSms(');
  const body = server.slice(start, server.indexOf('\n}\n', start));
  assert.ok(body.indexOf("error='stuck in sending'") < body.indexOf('INSERT INTO sms_messages'));
});

test('designer copies of the consent wording match what the consent row records', () => {
  const { TRANSACTIONAL_TEXT, MARKETING_TEXT } = require('../tools/lib/sms-consent');
  const dir = path.join(process.env.HOME || '', 'lumise-designer');
  if (!fs.existsSync(dir)) return; // designer repo not checked out alongside
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/&amp;/g, '&');
  for (const f of ['checkout.php', 'product.php']) {
    assert.ok(read(f).includes(TRANSACTIONAL_TEXT), `${f}: order-update wording drifted`);
    assert.ok(read(f).includes(MARKETING_TEXT), `${f}: marketing wording drifted`);
  }
  assert.ok(read('jt-save-popup.php').includes(MARKETING_TEXT), 'popup: marketing wording drifted');
});

test('dynamic pages default to no-store, after static files', () => {
  const staticAt = server.indexOf("app.use(express.static(path.join(__dirname, 'public')));");
  const noStoreAt = server.indexOf("app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });");
  assert.ok(staticAt > 0 && noStoreAt > staticAt, 'no-store must be mounted after static and before routes');
  assert.ok(noStoreAt < server.indexOf("app.get('/q/:code'"));
});

test('admin password auth refuses state-changing requests from other sites', () => {
  const start = server.indexOf('function requireAdmin(');
  const body = server.slice(start, server.indexOf('\n}\n', start));
  assert.match(body, /!\['GET', 'HEAD'\]\.includes\(req\.method\) && origin && !SITE_ORIGINS\.includes\(origin\)/);
  assert.ok(body.indexOf('SITE_ORIGINS.includes(origin)') < body.indexOf("provided.startsWith('Basic ')"));
});
