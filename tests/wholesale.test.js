'use strict';

/* Wholesale connector, the pure rules (tools/lib/wholesale.js).
 *
 * Run: node --test tests/wholesale.test.js
 *
 * The connector must never decide a price, accept a quote or take a payment;
 * every status it reports is derived from the quote and its payments. These
 * tests pin that derivation, what a partner may see of a quote, and the
 * credential, signature and idempotency rules the API contract promises.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const W = require('../tools/lib/wholesale');

const NOW = new Date('2026-11-14T12:00:00Z');
const req = (o = {}) => ({ public_id: 'wr_x', ...o });
const quote = (o = {}) => ({ code: 'ABCDEF1234', status: 'sent', total: 500, paid_amount: 0, revision: 1,
  valid_until: '2026-11-30', items: [], ...o });

test('status: nothing linked, or a draft/held quote, reads as requested', () => {
  assert.strictEqual(W.statusOf(req(), null, NOW), 'requested');
  assert.strictEqual(W.statusOf(req(), quote({ status: 'draft' }), NOW), 'requested');
  assert.strictEqual(W.statusOf(req(), quote({ status: 'held' }), NOW), 'requested');
});

test('status: the quote and its money decide every step', () => {
  const s = (q) => W.statusOf(req(), quote(q), NOW);
  assert.strictEqual(s({}), 'quoted');
  assert.strictEqual(s({ valid_until: '2026-11-13' }), 'expired');
  assert.strictEqual(s({ valid_until: '2026-11-14' }), 'quoted', 'the last valid day still counts');
  assert.strictEqual(s({ accepted_at: NOW }), 'awaiting_payment');
  assert.strictEqual(s({ accepted_at: NOW, valid_until: '2026-11-01' }), 'awaiting_payment', 'acceptance outlives the valid-until');
  assert.strictEqual(s({ accepted_at: NOW, paid_amount: 250 }), 'deposit_paid');
  assert.strictEqual(s({ accepted_at: NOW, paid_amount: 500 }), 'paid');
  assert.strictEqual(s({ paid_amount: 250, artwork_at: NOW }), 'in_production');
  assert.strictEqual(s({ paid_amount: 500, qc_at: NOW }), 'ready');
  assert.strictEqual(s({ paid_amount: 500, shipped_at: NOW }), 'shipped');
  assert.strictEqual(s({ paid_amount: 500, delivered_at: NOW }), 'delivered');
  assert.strictEqual(s({ cancelled_at: NOW, paid_amount: 500 }), 'cancelled');
});

test('status: production marks with NO payment never read as in production', () => {
  // Payment before production: a stage button pressed early must not tell the
  // business their job is being made.
  assert.strictEqual(W.statusOf(req(), quote({ accepted_at: NOW, artwork_at: NOW }), NOW), 'awaiting_payment');
  assert.strictEqual(W.statusOf(req(), quote({ accepted_at: NOW, qc_at: NOW }), NOW), 'awaiting_payment');
});

test('status: the request\'s own cancel/decline wins', () => {
  assert.strictEqual(W.statusOf(req({ cancelled_at: NOW }), quote(), NOW), 'cancelled');
  assert.strictEqual(W.statusOf(req({ declined_at: NOW }), null, NOW), 'declined');
});

test('quote view: a whitelist; shop-only fields never leave', () => {
  const q = quote({
    items: [{ description: 'Gildan 5000', qty: 24, size_mix: { M: 12, L: 12 }, unit_price: 9.5, line_total: 228,
      blank_price: 3.11, unit_override: 9, manual: true, product_id: 7, list_total: 300,
      addons: [{ code: 'x', label: 'Back print', total: 48 }], images: ['https://res.cloudinary.com/a.png', 'javascript:alert(1)'] }],
    notes: 'internal', promo_code: 'MAIL15', discount_note: 'Partner',
  });
  const v = W.quoteView(q, { subtotal: 228, total: 244.53, tax: 16.53, deposit: 122.27 }, 'https://www.jtees.net/q/ABCDEF1234');
  const json = JSON.stringify(v);
  for (const k of ['blank_price', 'unit_override', 'product_id', 'list_total', '"manual"', 'internal']) {
    assert.ok(!json.includes(k), `${k} must not reach a partner`);
  }
  assert.deepStrictEqual(v.lines[0].extras, [{ label: 'Back print', amount: 48 }]);
  assert.deepStrictEqual(v.lines[0].mockups, ['https://res.cloudinary.com/a.png']);
  assert.strictEqual(v.pricing.total, 244.53);
  assert.strictEqual(v.payment.state, 'unpaid');
  assert.strictEqual(v.payment.balance, 244.53);
});

test('quote view: none for a draft or held quote', () => {
  assert.strictEqual(W.quoteView(quote({ status: 'draft' }), {}, 'u'), null);
  assert.strictEqual(W.quoteView(quote({ status: 'held' }), {}, 'u'), null);
});

const good = () => ({ external_ref: 'batch-1001', lines: [{ product: 'Black tee, front print', qty: 24, sizes: { M: 12, L: 12 } }] });

test('request: a good one parses, sizes add up to the quantity', () => {
  const r = W.parseRequest(good());
  assert.ok(r.value, JSON.stringify(r.error));
  assert.strictEqual(r.value.lines[0].qty, 24);
  const bad = good(); bad.lines[0].qty = 25;
  assert.strictEqual(W.parseRequest(bad).error.code, 'invalid_field');
});

test('request: unknown fields, prices and oversize input are refused', () => {
  assert.strictEqual(W.parseRequest({ ...good(), price: 1 }).error.code, 'unknown_field', 'a partner cannot send a price');
  const withPrice = good(); withPrice.lines[0].unit_price = 1;
  assert.strictEqual(W.parseRequest(withPrice).error.code, 'unknown_field');
  assert.ok(W.parseRequest({ ...good(), lines: Array(51).fill(good().lines[0]) }).error);
  assert.ok(W.parseRequest({ ...good(), external_ref: 'x'.repeat(81) }).error);
  const q0 = good(); delete q0.lines[0].sizes; q0.lines[0].qty = 0;
  assert.ok(W.parseRequest(q0).error);
  const art = good(); art.lines[0].artwork_urls = ['http://example.com/a.png'];
  assert.ok(W.parseRequest(art).error, 'artwork must be https');
  assert.ok(W.parseRequest(null).error);
  assert.ok(W.parseRequest([]).error);
});

test('idempotency: same body in a different key order hashes the same', () => {
  const a = W.parseRequest(good()).value;
  const b = W.parseRequest({ lines: [{ sizes: { L: 12, M: 12 }, qty: 24, product: 'Black tee, front print' }], external_ref: 'batch-1001' }).value;
  assert.strictEqual(W.bodyHash(a), W.bodyHash(b));
  assert.strictEqual(W.idempotencyKey('short'), null);
  assert.strictEqual(W.idempotencyKey('order-1001-v1'), 'order-1001-v1');
});

test('keys: only the hash is checked, timing-safe, and a wrong key fails', () => {
  const { key, prefix } = W.newApiKey();
  assert.strictEqual(W.keyPrefix(key), prefix);
  const h = W.hashKey(key);
  assert.ok(W.keyMatches(key, h));
  assert.ok(!W.keyMatches(key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A'), h));
  assert.ok(!W.keyMatches(key, ''));
  assert.strictEqual(W.keyPrefix('jtw_nothex_x'), null);
});

test('webhook signatures: fresh and correct only', () => {
  const secret = W.partnerSecret('m'.repeat(40), 3);
  assert.notStrictEqual(secret, W.partnerSecret('m'.repeat(40), 4), 'each partner has its own secret');
  assert.strictEqual(W.partnerSecret('short', 3), null, 'a weak master secret is refused');
  const body = '{"a":1}';
  const now = Date.UTC(2026, 10, 14);
  const h = W.signatureHeader(secret, body, now);
  assert.ok(W.verifySignature(secret, h, body, now));
  assert.ok(!W.verifySignature(secret, h, '{"a":2}', now), 'tampered body');
  assert.ok(!W.verifySignature(secret, h, body, now + (W.SIG_TOLERANCE_S + 1) * 1000), 'replayed late');
  assert.ok(!W.verifySignature(W.partnerSecret('m'.repeat(40), 4), h, body, now), 'another partner\'s secret');
});

test('webhook URLs: https on a public host only', () => {
  assert.ok(W.webhookUrl('https://app.example.com/hooks/jt'));
  for (const u of ['http://app.example.com/x', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x',
    'https://[::1]/x', 'https://db.railway.internal/x', 'https://printer.local/x', 'ftp://x.com/a']) {
    assert.strictEqual(W.webhookUrl(u), null, u);
  }
});

test('retries: eight tries, then give up', () => {
  const t0 = Date.UTC(2026, 10, 14);
  assert.strictEqual(W.nextAttemptAt(0, t0).getTime() - t0, 60e3);
  assert.ok(W.nextAttemptAt(W.RETRY_MINUTES.length - 1, t0));
  assert.strictEqual(W.nextAttemptAt(W.RETRY_MINUTES.length, t0), null);
});

test('off unless switched on', () => {
  assert.strictEqual(W.on({}), false);
  assert.strictEqual(W.on({ JT_WHOLESALE: 'ON' }), true);
});
