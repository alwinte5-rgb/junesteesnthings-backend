/* Uber Direct (tools/lib/uber-direct.js): the on-demand courier booked from
 * the delivery board.
 *
 * Run: node --test tests/*.test.js
 *
 * What goes wrong with a courier API is money and silence: booking at a price
 * nobody saw, a second booking for the same delivery, a fee read in the wrong
 * unit, a sign-in on every call until the rate limit bites, and a webhook
 * anyone could forge to mark an order delivered. Each has a test here; Uber is
 * faked, and the shapes come from Uber's own SDK (uber/uber-direct-sdk). */

const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const U = require('../tools/lib/uber-direct');

const ENV = { UBER_DIRECT_CLIENT_ID: 'cid', UBER_DIRECT_CLIENT_SECRET: 'csecret', UBER_DIRECT_CUSTOMER_ID: 'cust-1',
  UBER_DIRECT_WEBHOOK_SECRET: 'whkey' };
// Fri 2026-10-02 10:00 Chicago
const NOW = new Date('2026-10-02T15:00:00Z');

function fakeUber(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body });
    const h = handlers.find((x) => url.endsWith(x.path));
    const [status, body] = h ? h.reply(url, init) : [404, { message: 'no fake' }];
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { calls, fetchImpl };
}
const tokenOk = { path: '/oauth/v2/token', reply: () => [200, { access_token: 'tok-1', expires_in: 2592000 }] };
const booking = { id: 7, ref: 'studio:12', date: '2026-10-03', window_start: '12:00', fee: 15, name: 'Ana Reyes',
  phone: '(773) 555-0142', address: { street1: '1 Main St', street2: 'Apt 2', city: 'Chicago', state: 'IL', zip: '60657' } };

test('not configured without all three keys', () => {
  assert.strictEqual(U.createUberDirect({ env: {} }).configured(), false);
  assert.strictEqual(U.createUberDirect({ env: { ...ENV, UBER_DIRECT_CUSTOMER_ID: '' } }).configured(), false);
  assert.strictEqual(U.createUberDirect({ env: ENV }).configured(), true);
});

test('a quote: signed in once, address as Uber JSON, fee read from cents', async () => {
  const f = fakeUber([tokenOk, { path: '/customers/cust-1/delivery_quotes',
    reply: () => [200, { id: 'dqt_1', fee: 1287, currency: 'usd', expires: '2026-10-02T15:15:00Z', dropoff_eta: '2026-10-03T17:30:00Z' }] }]);
  const uber = U.createUberDirect({ env: ENV, fetchImpl: f.fetchImpl, now: () => NOW });
  const q = await uber.quote(booking, { endTime: '15:00' });
  assert.deepStrictEqual(q, { id: 'dqt_1', fee: 12.87, currency: 'usd', expires: '2026-10-02T15:15:00Z', dropoff_eta: '2026-10-03T17:30:00Z' });
  const tokenCall = f.calls[0];
  assert.match(tokenCall.url, /login\.uber\.com\/oauth\/v2\/token$/);
  const tp = new URLSearchParams(tokenCall.body);
  assert.strictEqual(tp.get('grant_type'), 'client_credentials');
  assert.strictEqual(tp.get('scope'), 'eats.deliveries');
  const body = JSON.parse(f.calls[1].body);
  assert.strictEqual(f.calls[1].init.headers.Authorization, 'Bearer tok-1');
  assert.strictEqual(typeof body.dropoff_address, 'string', 'Uber wants the address as a JSON string');
  assert.deepStrictEqual(JSON.parse(body.dropoff_address), { street_address: ['1 Main St', 'Apt 2'], city: 'Chicago', state: 'IL', zip_code: '60657', country: 'US' });
  assert.strictEqual(JSON.parse(body.pickup_address).zip_code, '60657');
  assert.strictEqual(body.dropoff_phone_number, '+17735550142');
  // Sat 12:00–15:00 Chicago (CDT) = 17:00–20:00Z; ready at the shop an hour before.
  assert.strictEqual(body.dropoff_ready_dt, '2026-10-03T17:00:00.000Z');
  assert.strictEqual(body.dropoff_deadline_dt, '2026-10-03T20:00:00.000Z');
  assert.strictEqual(body.pickup_ready_dt, '2026-10-03T16:00:00.000Z');
  await uber.quote(booking, { endTime: '15:00' });
  assert.strictEqual(f.calls.filter((c) => /oauth/.test(c.url)).length, 1, 'the 30-day token is reused');
});

test('a window already under way asks for as-soon-as-possible, deadline at its end', () => {
  const t = U.uberTimes({ date: '2026-10-02', window_start: '09:00' }, '12:00', NOW);
  assert.deepStrictEqual(t, { dropoff_deadline_dt: '2026-10-02T17:00:00.000Z' });
  assert.deepStrictEqual(U.uberTimes({ date: '2026-10-02', window_start: '09:00' }, '10:00', NOW), {});
});

test('shop time to an instant across the DST change', () => {
  assert.strictEqual(U.shopTimeIso('2026-11-02', '09:00'), '2026-11-02T15:00:00.000Z');   // CST
  assert.strictEqual(U.shopTimeIso('2026-10-31', '09:00'), '2026-10-31T14:00:00.000Z');   // CDT
});

test('booking: at the quoted price, idempotent per delivery and quote, needs a mobile', async () => {
  const f = fakeUber([tokenOk, { path: '/customers/cust-1/deliveries',
    reply: () => [200, { id: 'del_9', status: 'pending', fee: 1287, tracking_url: 'https://www.ubereats.com/orders/del_9' }] }]);
  const uber = U.createUberDirect({ env: ENV, fetchImpl: f.fetchImpl, now: () => NOW });
  const d = await uber.book(booking, { id: 'dqt_1', fee: 12.87 }, { endTime: '15:00' });
  assert.deepStrictEqual(d, { id: 'del_9', status: 'pending', tracking_url: 'https://www.ubereats.com/orders/del_9', fee: 12.87 });
  const body = JSON.parse(f.calls[1].body);
  assert.strictEqual(body.quote_id, 'dqt_1');
  assert.strictEqual(body.idempotency_key, 'jt-delivery-7-dqt_1');
  assert.strictEqual(body.external_id, 'studio:12');
  assert.strictEqual(body.pickup_phone_number, '+17738491854');
  assert.ok(body.manifest_items.length >= 1 && body.dropoff_name === 'Ana Reyes');
  await assert.rejects(uber.book({ ...booking, phone: '12' }, { id: 'dqt_1', fee: 1 }), /mobile number/);
});

test('a refusal names Uber, the step and Uber\'s own message; a 401 signs in again next time', async () => {
  let n = 0;
  const f = fakeUber([tokenOk, { path: '/customers/cust-1/delivery_quotes', reply: () => (++n === 1
    ? [400, { code: 'address_undeliverable', message: 'The specified location is not in a deliverable area.' }]
    : [401, { message: 'unauthorized' }]) }]);
  const uber = U.createUberDirect({ env: ENV, fetchImpl: f.fetchImpl, now: () => NOW });
  await assert.rejects(uber.quote(booking), /Uber quote failed \(400\): The specified location is not in a deliverable area\./);
  await assert.rejects(uber.quote(booking), /401/);
  await assert.rejects(uber.quote(booking));
  assert.strictEqual(f.calls.filter((c) => /oauth/.test(c.url)).length, 2);
});

test('a quote without a price is an error, never a free delivery', async () => {
  const f = fakeUber([tokenOk, { path: '/customers/cust-1/delivery_quotes', reply: () => [200, { id: 'dqt_2' }] }]);
  await assert.rejects(U.createUberDirect({ env: ENV, fetchImpl: f.fetchImpl, now: () => NOW }).quote(booking), /without a price/);
});

test('the webhook: HMAC of the raw bytes with the signing key, compared in constant time', () => {
  const uber = U.createUberDirect({ env: ENV });
  const raw = Buffer.from(JSON.stringify({ kind: 'event.delivery_status', delivery_id: 'del_9', status: 'delivered' }));
  const good = crypto.createHmac('sha256', 'whkey').update(raw).digest('hex');
  assert.strictEqual(uber.verifyWebhook(raw, good), true);
  assert.strictEqual(uber.verifyWebhook(raw, good.toUpperCase()), true);
  assert.strictEqual(uber.verifyWebhook(Buffer.from(raw.toString() + ' '), good), false, 'a changed body fails');
  assert.strictEqual(uber.verifyWebhook(raw, crypto.createHmac('sha256', 'csecret').update(raw).digest('hex')), false, 'the client secret is not the key');
  assert.strictEqual(uber.verifyWebhook(raw, ''), false);
  assert.strictEqual(uber.verifyWebhook(raw, 'zz'), false);
  assert.strictEqual(U.createUberDirect({ env: { ...ENV, UBER_DIRECT_WEBHOOK_SECRET: '' } }).verifyWebhook(raw, good), false, 'no key, nothing passes');
  assert.match(require('fs').readFileSync(require.resolve('../tools/lib/uber-direct'), 'utf8'), /timingSafeEqual/);
});

test('Uber states map to our booking: picked up is out, delivered is delivered, cancel and return are problems', () => {
  assert.strictEqual(U.uberStatus('pickup_complete').booking, 'out');
  assert.strictEqual(U.uberStatus('dropoff').booking, 'out');
  assert.strictEqual(U.uberStatus('delivered').booking, 'delivered');
  assert.strictEqual(U.uberStatus('pending').booking, null);
  assert.ok(U.uberStatus('canceled').problem && U.uberStatus('returned').problem);
  assert.strictEqual(U.uberStatus('weird').label, 'weird');
});

test('the webhook route verifies before it reads, and books only at a shown, unexpired price', () => {
  const src = require('fs').readFileSync(require.resolve('../server.js'), 'utf8');
  const hook = src.slice(src.indexOf("app.post('/webhooks/uber'"), src.indexOf("app.post('/webhooks/uber'") + 2500);
  assert.ok(hook.indexOf('UBER.verifyWebhook(req.rawBody') < hook.indexOf('const ev = req.body'), 'signature first');
  assert.match(hook, /status\(503\)/);
  const bookRoute = src.slice(src.indexOf("app.post('/admin/delivery/job/:id/uber-book'"), src.indexOf("app.post('/admin/delivery/job/:id/uber-cancel'"));
  assert.match(bookRoute, /new Date\(q\.expires\)\.getTime\(\) <= Date\.now\(\)/);
  assert.match(bookRoute, /await UBER\.cancel\(d\.id\)/, 'a booking that lost the race is called off, not paid twice');
});
