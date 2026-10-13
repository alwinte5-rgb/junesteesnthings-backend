'use strict';

/* How long a helper spent on training (TRAINING.timeSpent), as shown by
 * tools/training-time-report.js.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TRAINING = require('../tools/lib/training');

const steps = [
  { key: 'lesson:a', type: 'lesson', minutes: 20, title: 'A' },
  { key: 'lesson:b', type: 'lesson', minutes: 10, title: 'B' },
  { key: 'lesson:c', type: 'lesson', minutes: 15, title: 'C' },
  { key: 'quiz:x', type: 'quiz', minutes: 10 },
];

test('a lesson left open is capped at 3x expected; both totals are given', () => {
  const times = new Map([
    ['lesson:a', { started_at: '2026-10-05T14:00:00Z', done_at: '2026-10-05T14:14:00Z' }], // 14m
    ['lesson:b', { started_at: '2026-10-05T15:00:00Z', done_at: '2026-10-06T15:00:00Z' }], // a day open
    ['lesson:c', { started_at: '2026-10-06T15:00:00Z', done_at: null }], // opened, not finished
  ]);
  const t = TRAINING.timeSpent(steps, times);
  assert.strictEqual(t.lessons.length, 2);
  assert.strictEqual(t.rawMinutes, 14 + 1440);
  assert.strictEqual(t.cappedMinutes, 14 + 30);
  assert.strictEqual(t.expectedMinutes, 30);
});

test('active days count Chicago days across lessons, quizzes and activity', () => {
  const times = new Map([['lesson:a', { started_at: '2026-10-05T14:00:00Z', done_at: '2026-10-05T14:14:00Z' }]]);
  // 03:00Z on the 7th is still the 6th in Chicago.
  const t = TRAINING.timeSpent(steps, times, ['2026-10-07T03:00:00Z', '2026-10-08T16:00:00Z', 'not a date']);
  assert.strictEqual(t.activeDays, 3);
  assert.strictEqual(t.first.toISOString(), '2026-10-05T14:00:00.000Z');
  assert.strictEqual(t.last.toISOString(), '2026-10-08T16:00:00.000Z');
});

test('nobody who never started has no time and no days', () => {
  const t = TRAINING.timeSpent(steps);
  assert.deepStrictEqual([t.cappedMinutes, t.rawMinutes, t.activeDays, t.first, t.last], [0, 0, 0, null, null]);
});

test('hm reads minutes as hours and minutes', () => {
  assert.strictEqual(TRAINING.hm(0), '0m');
  assert.strictEqual(TRAINING.hm(45), '45m');
  assert.strictEqual(TRAINING.hm(60), '1h');
  assert.strictEqual(TRAINING.hm(200), '3h 20m');
});

test('the report only reads, needs DATABASE_URL, and prints no contact details or answers', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'training-time-report.js'), 'utf8');
  assert.match(src, /if \(!process\.env\.DATABASE_URL\) throw/);
  assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/);
  for (const sql of src.match(/SELECT[^`']*/g) || []) assert.doesNotMatch(sql, /\b(email|phone|answers|address)\b/i);
});
