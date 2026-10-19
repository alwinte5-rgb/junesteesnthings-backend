/* One email a day to the shop, and Team chat alerts capped at two a day
   (owner, 2026-10-19). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const D = require('../tools/lib/shop-digest');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('only the shop\'s own inboxes are held, whatever the case or spacing', () => {
  const shop = ['june@jtees.net', undefined, 'Orders@jtees.net'];
  assert.ok(D.isShopAddress(' June@JTees.net ', shop));
  assert.ok(D.isShopAddress('orders@jtees.net', shop));
  assert.ok(!D.isShopAddress('customer@example.com', shop));
  assert.ok(!D.isShopAddress('', shop) && !D.isShopAddress(undefined, shop));
});

test('on unless switched off; the hour follows the morning digest', () => {
  assert.ok(D.on({}));
  assert.ok(!D.on({ JT_SHOP_DIGEST: 'off' }) && !D.on({ JT_SHOP_DIGEST: '0' }));
  assert.strictEqual(D.dueHour({}), 7);
  assert.strictEqual(D.dueHour({ JT_DIGEST_HOUR: '9' }), 9);
  assert.strictEqual(D.dueHour({ JT_DIGEST_HOUR: 'x' }), 7);
});

test('the summary lists every item, escapes subjects and keeps who to reply to', () => {
  const m = D.build([
    { subject: 'Proof approved: <Ann>', html: '<p>ok</p>', reply_to: null, created_at: '2026-10-19T12:00:00Z' },
    { subject: 'Email from Bo', html: '<p>hi</p>', reply_to: 'bo@example.com', created_at: '2026-10-19T13:00:00Z' },
  ], { esc, when: () => 'Mon 7:00 AM' });
  assert.strictEqual(m.subject, "June's Tees daily summary: 2 updates");
  assert.ok(m.html.includes('Proof approved: &lt;Ann&gt;') && !m.html.includes('<Ann>'));
  assert.ok(m.html.includes('mailto:bo@example.com'));
  assert.ok(m.html.includes('<p>ok</p>') && m.html.includes('<p>hi</p>'));
});

test('a runaway day is cut off and says so', () => {
  const items = Array.from({ length: D.MAX_ITEMS + 5 }, (_, i) => ({ subject: 's' + i, html: 'x'.repeat(D.MAX_ITEM_HTML + 10), created_at: 0 }));
  const m = D.build(items, { esc, when: () => '' });
  assert.ok(m.html.includes('And 5 more, not shown'));
  assert.ok(m.html.includes('(cut short here)'));
});

test('sendEmail holds shop mail unless urgent, marketing or carrying files, and sends if the hold fails', () => {
  assert.match(after('async function sendEmail(', 400), /urgent = false \}\) \{\s*if \(!urgent && !marketing && await holdForShopDigest\(/);
  const h = after('async function holdForShopDigest(', 1200);
  assert.match(h, /SHOPDIGEST\.on\(\)/);
  assert.match(h, /attachments\.some\(\(a\) => a && a\.content\)\)\) return false;/);
  assert.match(h, /SHOPDIGEST\.isShopAddress\(to, \[NOTIFY_EMAIL, SHOP_EMAIL\]\)/);
  assert.match(h, /catch \(e\) \{[\s\S]*return false;/, 'a failed hold sends now');
});

test('a failed payout is not held for the morning', () => {
  assert.match(after('async function reportFailedPayout', 6000), /to: SHOP_EMAIL, urgent: true,[^\n]*\n\s*subject: `⚠️ Stripe payout failed/);
});

test('the summary goes once a day, after the other morning emails, and puts items back if it fails', () => {
  const f = after('async function sendShopDigest()', 2400);
  assert.match(f, /if \(hour < SHOPDIGEST\.dueHour\(\)\) return '';/);
  assert.match(f, /action = 'daily summary sent' AND subject_id = \$1/);
  assert.match(f, /UPDATE shop_digest_items SET sent_at = NOW\(\) WHERE to_addr = \$1 AND sent_at IS NULL\s*RETURNING/);
  assert.match(f, /UPDATE shop_digest_items SET sent_at = NULL WHERE id = ANY\(\$1\)/);
  assert.match(f, /urgent: true/, 'the summary itself is not held');
  const sweep = after("await step('supplier sync', runSupplierSync);", 300);
  assert.match(sweep, /await step\('daily summary', sendShopDigest\);/);
});

test('team chat alerts: at most two a person a day, one email for all their conversations', () => {
  assert.match(src, /const CHAT_ALERTS_PER_DAY = 2;/);
  const f = after('async function sendChatAlerts()', 3600);
  assert.match(f, /WHERE team_chat_alert_days\.n < \$3`, \[reader, day, CHAT_ALERTS_PER_DAY\]/);
  assert.match(f, /if \(!allowed\) continue;/);
  assert.ok(f.indexOf('if (!allowed) continue;') < f.indexOf('INSERT INTO team_chat_reads'), 'nothing is claimed past the limit');
  assert.strictEqual((f.match(/await sendEmail\(/g) || []).length, 1, 'one email per person per run');
});
