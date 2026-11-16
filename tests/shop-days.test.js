'use strict';

/* The shop's calendar (owner, 2026-11-16): weekends and holidays closed,
 * 3pm cutoff. tools/lib/shop-days.js.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../tools/lib/shop-days');

const TZ = 'America/Chicago';
const CUT = 15 * 60;

test('the holidays the owner closes for', () => {
  assert.deepStrictEqual(D.shopHolidays(2026), ['2026-01-01', '2026-05-25', '2026-07-04', '2026-09-07',
    '2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2026-12-31']);
  assert.deepStrictEqual(D.shopHolidays(2027).slice(1, 5), ['2027-05-31', '2027-07-04', '2027-09-06', '2027-11-25']);
});

test('closed days', () => {
  assert.strictEqual(D.shopClosed('2026-11-14'), true, 'Saturday');
  assert.strictEqual(D.shopClosed('2026-11-15'), true, 'Sunday');
  assert.strictEqual(D.shopClosed('2026-11-16'), false, 'Monday');
  assert.strictEqual(D.shopClosed('2026-11-26'), true, 'Thanksgiving');
  assert.strictEqual(D.shopClosed('2026-11-27'), true, 'the Friday after');
  assert.strictEqual(D.shopClosed('2026-12-31'), true, "New Year's Eve");
});

test('an order starts today only when open and before 3pm Chicago', () => {
  assert.strictEqual(D.shopStartDay(new Date('2026-11-16T14:59:00-06:00'), CUT, TZ), '2026-11-16');
  assert.strictEqual(D.shopStartDay(new Date('2026-11-16T15:00:00-06:00'), CUT, TZ), '2026-11-17');
  assert.strictEqual(D.shopStartDay(new Date('2026-11-20T16:00:00-06:00'), CUT, TZ), '2026-11-23', 'Fri 4pm -> Mon');
  assert.strictEqual(D.shopStartDay(new Date('2026-11-25T15:30:00-06:00'), CUT, TZ), '2026-11-30', 'Wed 3:30pm before Thanksgiving -> Mon');
  /* 9pm Chicago is already tomorrow in UTC: still Monday's order, after the cutoff. */
  assert.strictEqual(D.shopStartDay(new Date('2026-11-17T03:00:00Z'), CUT, TZ), '2026-11-17');
});

test('days until a date', () => {
  const at = new Date('2026-11-16T10:00:00-06:00');
  assert.strictEqual(D.shopDaysUntil('2026-11-18', at, CUT, TZ), 2);
  assert.strictEqual(D.shopDaysUntil('2026-11-16', at, CUT, TZ), 0);
  assert.strictEqual(D.shopDaysUntil('2026-11-01', at, CUT, TZ), 0, 'past');
  assert.strictEqual(D.shopDaysUntil('', at, CUT, TZ), null);
  assert.strictEqual(D.shopDaysUntil('2026-11-28', at, CUT, TZ), 7, 'Thanksgiving and the Friday after skipped');
});
