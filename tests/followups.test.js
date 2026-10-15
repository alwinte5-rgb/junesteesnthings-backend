'use strict';

/* "Coming up automatically" on a job's Messages card (2026-10-15): the
 * reminders the hourly sweeps will still send for a job, when, and how, with
 * a Skip each. The list is only worth anything if it says what the sweeps
 * will really do, so each case here is one sweep condition.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../tools/lib/followups');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
/* 2026-10-15 10:00 Chicago (CDT, UTC-5): inside texting hours. */
const NOW = new Date('2026-10-15T15:00:00Z');
const keys = (q, o = {}) => F.upcomingReminders(q, { now: NOW, ...o }).map((r) => r.key);
const base = { code: 'AB12CD', email: 'ada@example.com', phone: '', status: 'sent' };

test('a sent quote not accepted gets a follow-up three days after it was made', () => {
  const [r] = F.upcomingReminders({ ...base, sent_to_customer_at: '2026-10-14T15:00:00Z', created_at: '2026-10-14T15:00:00Z' }, { now: NOW });
  assert.strictEqual(r.key, 'follow-up');
  assert.strictEqual(r.when.toISOString(), '2026-10-17T15:00:00.000Z');
  assert.strictEqual(r.overdue, false);
  assert.deepStrictEqual(r.channels, ['email']);
});

test('no follow-up for a quote never sent, already followed up, or past its last day', () => {
  const q = { ...base, created_at: '2026-10-14T15:00:00Z' };
  assert.deepStrictEqual(keys(q), [], 'never sent and never opened');
  assert.deepStrictEqual(keys({ ...q, status: 'viewed' }), ['follow-up'], 'opened counts as sent');
  assert.deepStrictEqual(keys({ ...q, status: 'viewed', followed_up_at: '2026-10-14T16:00:00Z' }), []);
  assert.deepStrictEqual(keys({ ...q, status: 'viewed', valid_until: '2026-10-16' }), [], 'expires before it would go');
  assert.deepStrictEqual(keys({ ...q, status: 'viewed', cancelled_at: '2026-10-14T16:00:00Z' }), []);
});

test('a reminder that is due at night waits for 9am Chicago', () => {
  /* 2026-10-15 22:00 Chicago = 03:00Z next day: first run is 9am on the 16th (14:00Z). */
  assert.strictEqual(F.nextSendTime(new Date('2026-10-16T03:00:00Z')).toISOString(), '2026-10-16T14:00:00.000Z');
  assert.strictEqual(F.nextSendTime(new Date('2026-10-15T15:20:00Z')).toISOString(), '2026-10-15T16:00:00.000Z');
});

test('the deposit reminder: accepted, nothing paid, never after a refund or a dispute', () => {
  const q = { ...base, phone: '7735550100', accepted_at: '2026-10-15T14:00:00Z', paid_amount: 0 };
  const [r] = F.upcomingReminders(q, { now: NOW });
  assert.strictEqual(r.key, 'deposit-reminder');
  assert.deepStrictEqual(r.channels, ['email', 'text']);
  assert.deepStrictEqual(keys(q, { refunded: true }), []);
  assert.deepStrictEqual(keys(q, { disputed: true }), []);
  assert.deepStrictEqual(keys({ ...q, paid_amount: 50 }), []);
  assert.deepStrictEqual(keys({ ...q, delivered_at: '2026-10-15T14:30:00Z' }), []);
});

test('the balance reminder needs a balance actually owed, the way balanceOf says', () => {
  const q = { ...base, accepted_at: '2026-10-01T14:00:00Z', paid_at: '2026-10-10T14:00:00Z', paid_amount: 50, total: 100, status: 'accepted' };
  assert.deepStrictEqual(keys(q, { balanceDue: 50 }), ['balance-reminder']);
  assert.deepStrictEqual(keys(q, { balanceDue: 0 }), [], 'written off');
  assert.deepStrictEqual(keys({ ...q, status: 'held' }, { balanceDue: 50 }), []);
  assert.deepStrictEqual(keys({ ...q, balance_nudged_at: '2026-10-12T14:00:00Z' }, { balanceDue: 50 }), []);
});

test('an overdue reminder says it goes the next time the sweep runs', () => {
  const [r] = F.upcomingReminders({ ...base, accepted_at: '2026-10-01T14:00:00Z', paid_at: '2026-10-01T14:00:00Z',
    paid_amount: 50, total: 100, status: 'accepted' }, { now: NOW, balanceDue: 50 });
  assert.strictEqual(r.overdue, true);
  assert.strictEqual(r.when.toISOString(), '2026-10-15T15:00:00.000Z');
});

test('the pickup reminder: ready, not collected, pickup only, and not after 30 days', () => {
  const q = { ...base, shipped_at: '2026-10-14T15:00:00Z' };
  assert.deepStrictEqual(keys(q), ['pickup-reminder']);
  assert.deepStrictEqual(keys({ ...q, ship_method: 'pickup' }), ['pickup-reminder']);
  assert.deepStrictEqual(keys({ ...q, ship_method: 'ups' }), [], 'shipped jobs are the delivery board\'s');
  assert.deepStrictEqual(keys({ ...q, shipped_at: '2026-09-01T15:00:00Z' }), [], 'past the 30-day window');
  assert.deepStrictEqual(keys({ ...q, delivered_at: '2026-10-15T14:00:00Z' }), []);
});

test('nobody to reach, nothing listed', () => {
  assert.deepStrictEqual(keys({ ...base, email: '', phone: '', shipped_at: '2026-10-14T15:00:00Z' }), []);
});

test('each reminder\'s stamp column is the one its sweep stamps, so Skip is what sending does', () => {
  const sweeps = { 'follow-up': 'sendQuoteFollowUps', 'deposit-reminder': 'sendDepositReminders',
                   'balance-reminder': 'sendBalanceReminders', 'pickup-reminder': 'sendPickupReminders' };
  for (const [key, fn] of Object.entries(sweeps)) {
    const at = src.indexOf(`async function ${fn}(`);
    assert.ok(at > 0, fn);
    const body = src.slice(at, src.indexOf('\n}\n', at));
    assert.ok(body.includes(`${F.REMINDERS[key].stamp} IS NULL`), `${fn} reads ${F.REMINDERS[key].stamp}`);
    assert.ok(body.includes(`SET ${F.REMINDERS[key].stamp}=NOW()`), `${fn} stamps ${F.REMINDERS[key].stamp}`);
  }
});

test('Skip stamps only a column from the fixed list, never one named by the request', () => {
  const at = src.indexOf("app.post('/admin/quote/:code/skip-reminder'");
  assert.ok(at > 0);
  const r = src.slice(at, src.indexOf('\n});', at));
  assert.match(r, /QUOTE_CODE_RE\.test\(code\)/);
  assert.match(r, /Object\.hasOwn\(FOLLOWUPS\.REMINDERS, key\)/, 'key=constructor must not reach the SQL');
  assert.match(r, /if \(!r\) return res\.redirect/);
  assert.match(r, /COALESCE\(\$\{r\.stamp\}, NOW\(\)\)/, 'a reminder already sent keeps its real time');
});
