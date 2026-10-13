'use strict';

/* Training time on the Staff card: quiz tries are timed from the signed quiz
 * token, capped like lessons, and what is still to do is listed with its
 * expected time.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TRAINING = require('../tools/lib/training');

const steps = [
  { key: 'lesson:a', type: 'lesson', minutes: 20, title: 'A', done: true },
  { key: 'lesson:b', type: 'lesson', minutes: 10, title: 'B', done: false },
  { key: 'quiz:x', type: 'quiz', quiz: 'x', minutes: 10, done: false, locked: true },
  { key: 'buffer:1', type: 'buffer', minutes: 30 },
];

const orderFor = (key) => Object.fromEntries(TRAINING.quizForPage(key).questions.map((x) => [x.id, x.order]));

test('quiz seconds come from the signed token, for the same helper and quiz only', () => {
  const now = Date.parse('2026-10-13T15:00:00Z');
  const tok = TRAINING.signOrder('k', 'design-2', 5, orderFor('design-2'), now - 7 * 60000);
  assert.strictEqual(TRAINING.quizSeconds('k', tok, 'design-2', 5, now), 420);
  assert.strictEqual(TRAINING.quizSeconds('k', tok, 'design-2', 6, now), null);
  assert.strictEqual(TRAINING.quizSeconds('other', tok, 'design-2', 5, now), null);
  assert.ok(TRAINING.readOrder('k', tok, 'design-2', 5), 'the order still reads');
});

test('a token from before timing, or from the future, has no seconds; a day is the most', () => {
  const now = Date.parse('2026-10-13T15:00:00Z');
  const crypto = require('crypto');
  const body = Buffer.from(JSON.stringify({ k: 'design-2', s: 5, o: orderFor('design-2') })).toString('base64url');
  const old = `${body}.${crypto.createHmac('sha256', 'k').update(body).digest('base64url')}`;
  assert.ok(TRAINING.readOrder('k', old, 'design-2', 5), 'an untimed page still marks');
  assert.strictEqual(TRAINING.quizSeconds('k', old, 'design-2', 5, now), null);
  assert.strictEqual(TRAINING.quizSeconds('k', TRAINING.signOrder('k', 'design-2', 5, orderFor('design-2'), now + 60000), 'design-2', 5, now), null);
  assert.strictEqual(TRAINING.quizSeconds('k', TRAINING.signOrder('k', 'design-2', 5, orderFor('design-2'), now - 3 * 86400000), 'design-2', 5, now), 86400);
});

test('quiz time is capped at 3x its expected minutes per try; untimed tries are skipped', () => {
  const t = TRAINING.timeSpent(steps, new Map(), [], undefined, [
    { quiz_key: 'x', seconds: 480 }, { quiz_key: 'x', seconds: 7200 }, { quiz_key: 'x', seconds: null }, { quiz_key: 'nope', seconds: 60 }]);
  assert.deepStrictEqual(t.quizzes, [{ quiz: 'x', tries: 2, raw: 8 + 120, capped: 8 + 30, expected: 10 }]);
  assert.strictEqual(t.quizMinutes, 38);
});

test('what is still to do lists every unfinished step but buffers, with expected time', () => {
  const t = TRAINING.timeSpent(steps);
  assert.deepStrictEqual(t.outstanding.map((o) => [o.key, o.minutes, o.locked]), [['lesson:b', 10, false], ['quiz:x', 10, true]]);
  assert.strictEqual(t.outstandingMinutes, 20);
});

test('the Staff card shows training; the quiz save stores the seconds', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /\$\{staffTrainingBlock\(s, training\.get\(s\.id\)\)\}/);
  assert.match(src, /ADD COLUMN IF NOT EXISTS seconds INTEGER/);
  assert.match(src, /TRAINING\.quizSeconds\(FORM_TOKEN_KEY, \(req\.body \|\| \{\}\)\._ord, key, actor\.id\)/);
  // A summary that fails to load shows on that card, never breaks the Staff page.
  assert.match(src, /staffTrainingSummary\(s\.id\)\s*\n?\s*\.then\(\(t\) => \[s\.id, t\]\)\.catch/);
});
