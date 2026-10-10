'use strict';

/* Analytics on the customer's quote page (/q/:code).
 *
 * The quote page had no analytics, so quotes opened, accepted, sent back and
 * paid were invisible in GA4. What must hold: each event fires from the
 * redirect that follows the real action; the redirect's values are URL input,
 * so anything off-shape is dropped; nothing in them can break out of the
 * <script> block; and a payment is counted once.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const QA = require('../tools/lib/quote-analytics');

test('accept and change redirects map to their events', () => {
  assert.strictEqual(QA.quoteEvent('AB12CD', { ev: 'accepted' }).name, 'quote_accepted');
  assert.strictEqual(QA.quoteEvent('AB12CD', { ev: 'changes' }).name, 'quote_changes_requested');
  assert.strictEqual(QA.quoteEvent('AB12CD', {}), null);
  assert.strictEqual(QA.quoteEvent('AB12CD', { ev: 'toString' }), null);
});

test('a paid redirect round-trips into one purchase with the banked value', () => {
  const qs = QA.paidQuery({ amount: 104.004, kind: 'balance', sessionId: 'cs_live_a1B2c3D4e5F6g7H8i9' });
  const query = Object.fromEntries(new URLSearchParams(qs.slice(1)));
  const ev = QA.quoteEvent('AB12CD', query);
  assert.strictEqual(ev.name, 'purchase');
  assert.deepStrictEqual(ev.params, {
    transaction_id: `Q-${QA.quoteRef('AB12CD')}-B2c3D4e5F6g7H8i9`, value: 104, currency: 'USD', kind: 'balance', quote_ref: QA.quoteRef('AB12CD'),
  });
  assert.strictEqual(ev.once, 'purchase_q_B2c3D4e5F6g7H8i9');
});

test('forged or broken payment values are dropped', () => {
  const bad = [
    { ev: 'paid', v: '-5', tx: 'abc' },
    { ev: 'paid', v: 'NaN', tx: 'abc' },
    { ev: 'paid', v: '999999', tx: 'abc' },
    { ev: 'paid', v: '20', tx: '' },
    { ev: 'paid', v: '20', tx: '"><script>' },
    { ev: 'paid', v: '20', tx: 'a'.repeat(17) },
  ];
  for (const q of bad) assert.strictEqual(QA.quoteEvent('AB12CD', q), null, JSON.stringify(q));
  assert.strictEqual(QA.quoteEvent('AB12CD', { ev: 'paid', v: '20', tx: 'abc', k: 'evil' }).params.kind, 'deposit');
});

test('the tags cannot be broken out of, whatever the code holds', () => {
  const html = QA.quoteAnalyticsTags('</script><img src=x onerror=alert(1)>', { ev: 'accepted' });
  assert.ok(!/<\/script><img/.test(html));
  assert.strictEqual((html.match(/<\/script>/g) || []).length, 2);
  assert.match(html, /src="\/assets\/js\/analytics\.js"/);
  assert.match(html, /'quote_viewed'/);
  assert.match(html, /"quote_accepted"/);
});

test('the server wires the page and every redirect', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /\$\{quoteAnalyticsTags\(q\.code, req\.query\)\}/);
  assert.match(src, /res\.redirect\('\/q\/' \+ code \+ '\?ev=accepted'\)/);
  assert.match(src, /'\?ev=changes'/);
  assert.match(src, /paidQuery\(\{/);
});

test('the quote code itself never reaches analytics (Codex #138)', () => {
  const tags = QA.quoteAnalyticsTags('AB12CD', { ev: 'paid', v: '104', k: 'balance', tx: 'B2c3D4e5F6g7H8i9' });
  assert.ok(!/"quote_code"/.test(tags) && !tags.includes('Q-AB12CD'), 'no code in params or transaction id');
  assert.match(QA.quoteRef('AB12CD'), /^[0-9a-f]{12}$/);
  const js = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'assets', 'js', 'analytics.js'), 'utf8');
  assert.ok(js.includes("var fbOn = !QUOTE_PAGE &&") && js.includes("if (!QUOTE_PAGE && CLARITY_ID") && js.includes("'/q/:code'"));
});
