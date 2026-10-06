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
const { T, plain, isGsm7, PICKUP_ADDRESS, PICKUP_HOURS, PICKUP_STEPS } = require('../tools/lib/sms-templates');
const { twilioSignature, verifyTwilioSignature, classifyInbound } = require('../tools/lib/twilio-webhook');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const worst = {
  code: 'ABCDEF', amount: 12345.67, stillDue: 9999.99, orderId: 1234567, tracking: '9400 1000 0000 0000 0000 00',
};
const all = [
  T.paymentReceived(worst), T.paymentReceived({ ...worst, stillDue: 0 }), T.inProduction(worst),
  T.readyForPickup(worst), T.finished(worst), T.shipped(worst), T.shipped({ code: 'ABCDEF' }),
  T.studioOrderPlaced(worst), T.studioOrderShipped(worst), T.studioOrderShipped({ orderId: 12 }),
  T.studioOrderReady(worst),
];

test('a pickup text says how to get in: call ahead, intercom, 4th floor', () => {
  for (const m of [T.readyForPickup(worst), T.studioOrderReady(worst)]) {
    assert.match(m.body, /an hour before/);
    assert.match(m.body, /intercom for June's Tees/);
    assert.match(m.body, /4th floor/);
    assert.match(m.body, /lobby/);
  }
});

test('every template is one GSM-7 segment, branded, with an opt-out', () => {
  for (const m of all) {
    assert.ok(isGsm7(m.body), `not GSM-7: ${m.body}`);
    /* The pickup texts carry the pickup steps, so they may run to two segments. */
    /* Warm, with a link to the website: two segments is the budget. */
    const max = 306;
    assert.ok(m.body.length <= max, `${m.body.length} chars: ${m.body}`);
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

/* notifyQuoteMilestone, run for real against a fake pool: `already` is the
   client_emails kinds already sent for the quote, which is how an email is
   sent once however often a card moves. */
function liftFn(name) {
  let at = server.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  if (server.slice(at - 6, at) === 'async ') at -= 6;
  let i = server.indexOf('(', at);
  for (let paren = 0; i < server.length; i++) {
    if (server[i] === '(') paren++;
    else if (server[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = server.indexOf('{', i); i < server.length; i++) {
    if (server[i] === '{') depth++;
    else if (server[i] === '}' && --depth === 0) return server.slice(at, i + 1);
  }
  throw new Error('unbalanced ' + name);
}
function loadMilestones({ already = [], due = 0 } = {}) {
  const sent = [];
  const emails = [];
  const ctx = vm.createContext({
    SMS: T, SMS_PICKUP: '3047 N Lincoln Ave, Mon-Fri 10:30am-6pm', PICKUP_ADDRESS, PICKUP_HOURS, PICKUP_STEPS,
    SHOP_SIGNER: 'June', SHOP_NAME: "June's Tees & Things", SHOP_PHONE: '(773) 849-1854',
    sendCustomerSms: (a) => { sent.push(a); return Promise.resolve('sent'); },
    sendClientEmail: async (m) => { emails.push(m); already.push(m.kind); },
    pool: { query: async (sql, args) => ({ rows: /FROM client_emails/.test(sql) && already.includes(args[1]) ? [{ one: 1 }] : [] }) },
    escEmail: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'),
    quoteSummary: () => '24 tees', quoteTotals: () => ({ total: 100 }), balanceOf: () => due,
    money: (n) => '$' + Number(n).toFixed(2), quoteSchedule: () => null, dayShort: (d) => String(d),
    quoteLink: (c) => 'https://www.jtees.net/q/' + c,
  });
  vm.runInContext([liftFn('htmlToText'), liftFn('customerEmailHtml'), liftFn('pickupHowHtml'), liftFn('notifyQuoteMilestone')].join('\n')
    + ';this.f = notifyQuoteMilestone;', ctx);
  return { f: ctx.f, sent, emails };
}

const base = { code: 'ABC123', name: 'Ada Brooks', email: 'ada@example.com', phone: '7738491854',
               ship_method: 'pickup', production_at: null, shipped_at: null, items: [] };

test('a newly reached pickup is told once: a text and an email, "ready for pickup"', async () => {
  const { f, sent, emails } = loadMilestones();
  await f(base, { ...base, shipped_at: new Date() });
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg.body, /is ready! Pickup: 3047 N Lincoln Ave/);
  assert.equal(sent[0].kind, 'transactional');
  assert.equal(sent[0].ref, 'quote:ABC123');
  assert.equal(sent[0].quote, 'ABC123', 'the text is kept on the quote');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, 'ada@example.com');
  assert.match(emails[0].subject, /ready for pickup — ABC123/);
  assert.match(emails[0].html, /3047 N Lincoln Ave, Chicago, IL 60657 &middot; Mon-Fri 10:30am-6pm/, 'the same place and hours the text gives');
  assert.equal(emails[0].kind, 'milestone:ready');
  assert.match(emails[0].preview, /^Hi Ada,\s+Your order \(24 tees\) is ready to pick up/,
    'the job page shows the message, not the heading and the button');
  assert.doesNotMatch(emails[0].preview, /View your order|Ready for pickup/);
  await f(base, { ...base, shipped_at: new Date() });   // moved back and forward again
  assert.equal(emails.length, 1, 'an email per milestone per quote, however often the card moves');
});

test('an already-reached milestone is not re-announced', async () => {
  const { f, sent, emails } = loadMilestones();
  const done = { ...base, production_at: new Date(), shipped_at: new Date() };
  await f(done, { ...done, delivered_at: new Date() });
  assert.equal(sent.length, 0);
  assert.equal(emails.length, 0);
});

test('jumping straight to ship sends only the furthest milestone', async () => {
  const { f, sent, emails } = loadMilestones();
  await f(base, { ...base, production_at: new Date(), shipped_at: new Date(), ship_method: 'ground', tracking: '1Z9' });
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg.body, /is on its way! Tracking: 1Z9\./);
  assert.match(sent[0].msg.body, / jtees\.net\/q\/ABC123 /, 'their order page, as a short branded link');
  assert.equal(emails.length, 1);
  assert.match(emails[0].subject, /has shipped/);
  assert.match(emails[0].html, /Tracking: <b>1Z9<\/b>/);
});

test('no ship method yet means pickup, with the address and how to get in', async () => {
  /* Owner, 2026-10-05: assume pickup when no delivery was chosen. */
  const { f, sent, emails } = loadMilestones();
  await f({ ...base, ship_method: null }, { ...base, ship_method: null, shipped_at: new Date() });
  assert.match(sent[0].msg.body, /is ready! Pickup: 3047 N Lincoln Ave/);
  assert.match(emails[0].subject, /ready for pickup — ABC123/);
  for (const re of [/3047 N Lincoln Ave, Chicago, IL 60657/, /an hour before/, /intercom for June/, /4th floor/, /lobby/]) {
    assert.match(emails[0].html, re);
  }
});

test('local delivery is told it is ready, never that it has shipped', async () => {
  const { f, emails } = loadMilestones();
  await f({ ...base, ship_method: 'local' }, { ...base, ship_method: 'local', shipped_at: new Date() });
  assert.match(emails[0].subject, /Your order is ready — ABC123/);
  assert.doesNotMatch(emails[0].html, /shipped/);
});

test('in production is told on its own; no phone means no text but still the email', async () => {
  const a = loadMilestones();
  await a.f(base, { ...base, production_at: new Date() });
  assert.match(a.sent[0].msg.body, /in production/);
  assert.match(a.emails[0].subject, /in production — ABC123/);
  const b = loadMilestones();
  await b.f({ ...base, phone: '' }, { ...base, phone: '', shipped_at: new Date() });
  assert.equal(b.sent.length, 0);
  assert.equal(b.emails.length, 1);
  const c = loadMilestones();
  await c.f({ ...base, email: '' }, { ...base, email: '', shipped_at: new Date() });
  assert.equal(c.emails.length, 0, 'no address, no email');
});

test('money still owed is said, with the way to pay it', async () => {
  const { f, emails } = loadMilestones({ due: 75 });
  await f(base, { ...base, shipped_at: new Date() });
  assert.match(emails[0].html, /A balance of <b>\$75\.00<\/b> is due at pickup/);
  assert.match(emails[0].html, /https:\/\/www\.jtees\.net\/q\/ABC123/);
});

test('both board routes move a job through one function that reads before it writes', () => {
  const move = liftFn('moveJobToStage');
  assert.ok(move.indexOf("SELECT * FROM quotes WHERE code = $1") < move.indexOf('UPDATE quotes SET'),
    'the row is read before it is updated, so a milestone is told only when newly reached');
  assert.match(move, /notifyQuoteMilestone\(before, after\)/);
  for (const anchor of ["app.post('/admin/quote/:code/step'", "app.post('/admin/quote/:code/stage'"]) {
    const start = server.indexOf(anchor);
    const body = server.slice(start, server.indexOf('\n});', start));
    assert.match(body, /await moveJobToStage\(code, /, `${anchor} goes through moveJobToStage`);
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

test('designer: consent before the held confirmation; confirmation only after payment', () => {
  const dir = path.join(process.env.HOME || '', 'lumise-designer');
  if (!fs.existsSync(dir)) return; // designer repo not checked out alongside
  const conn = fs.readFileSync(path.join(dir, 'php_connector.php'), 'utf8');
  const stripe = fs.readFileSync(path.join(dir, 'inc', 'stripe.php'), 'utf8');
  const ipn = fs.readFileSync(path.join(dir, 'paypal_ipn.php'), 'utf8');
  // save_order runs before the customer pays: it may HOLD, never send.
  assert.ok(conn.indexOf("jt_sms_consent($_POST['phone']") < conn.indexOf('jt_order_mail_hold('));
  assert.doesNotMatch(conn, /jt_send_mail\('order-confirmation'/, 'checkout must not thank an unpaid order');
  assert.doesNotMatch(conn, /jt_send_mail\('order-notification'/, 'the shop alert waits for payment too');
  // Every way money arrives releases it.
  assert.match(stripe, /jt_order_mail_release\(\$order_id\)/);
  assert.match(ipn, /jt_order_mail_release\(\$order\['id'\]\)/);
  assert.ok(!fs.existsSync(path.join(dir, 'placeorder.php')), 'placeorder.php saved orders without payment');
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

test('tracking typed before Shipped is ticked sends nothing until it is', async () => {
  const start = server.indexOf("app.post('/admin/quote/:code/shipping'");
  const body = server.slice(start, server.indexOf('\n});', start));
  assert.match(body, /if \(q && q\.shipped_at && tracking/);
  /* And marking it shipped sends the number that was held back, in the one
     "has shipped" message. */
  const { f, emails } = loadMilestones();
  await f({ ...base, ship_method: 'ground', tracking: '1Z77' },
          { ...base, ship_method: 'ground', tracking: '1Z77', shipped_at: new Date() });
  assert.match(emails[0].html, /Tracking: <b>1Z77<\/b>/);
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
  const staticAt = server.indexOf("app.use(express.static(path.join(__dirname, 'public')");
  const noStoreAt = server.indexOf("app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });");
  assert.ok(staticAt > 0 && noStoreAt > staticAt, 'no-store must be mounted after static and before routes');
  assert.ok(noStoreAt < server.indexOf("app.get('/q/:code'"));
});

test('staff sign-in refuses state-changing requests from other sites', () => {
  const start = server.indexOf('function requireAdmin(');
  const body = server.slice(start, server.indexOf('\n}\n', start));
  assert.match(body, /!\['GET', 'HEAD'\]\.includes\(req\.method\) && fromAnotherSite\(req\)/);
  assert.ok(body.indexOf('fromAnotherSite(req)') < body.indexOf('verifyAccessToken'));
});

test('the cart follow-up: one segment pair, marketing consent, once a month per number', () => {
  const m = T.cartFollowup({ code: 'ABCDEFGHIJKLMNOPQRST', pct: 50,
    restoreUrl: 'https://design.jtees.net/capture-cart.php?restore=' + 'f'.repeat(64) });
  assert.ok(isGsm7(m.body) && m.body.length <= 306, `${m.body.length}`);
  const start = server.indexOf("app.post('/api/sms-cart-followup'");
  const body = server.slice(start, server.indexOf('\n});', start));
  assert.match(body, /^app\.post\('\/api\/sms-cart-followup', requireInternalKey,/);
  assert.match(body, /kind: 'marketing', ref: 'cart-followup:' \+ month/);
  assert.doesNotMatch(body, /recordSmsConsent/, 'a follow-up must never create consent');
});
