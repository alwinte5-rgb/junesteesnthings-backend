'use strict';

/* On a sales-role path, training (commission, page tips, inTraining) ends at
 * the role course's ready sign-off, not the Sales course milestone in the
 * middle; a Sales ready given before the change still counts. Lessons are
 * finished only once opened, and a module quiz waits for its lessons.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TRAINING = require('../tools/lib/training');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const fnOf = (sig) => src.slice(src.indexOf(sig), src.indexOf('\n}\n', src.indexOf(sig)));

test('the ready key is the last ready on the path', () => {
  assert.strictEqual(TRAINING.readyKeyFor('sales', null), TRAINING.READY_KEY);
  assert.strictEqual(TRAINING.readyKeyFor('design', null), TRAINING.READY_KEY);
  for (const role of ['closer', 'leadgen', 'accounts']) {
    const key = TRAINING.readyKeyFor('sales', role);
    assert.strictEqual(key, `signoff:${role === 'accounts' ? 'accounts' : role}-ready`);
    const keys = TRAINING.visibleSteps(undefined, 'sales', role).map((s) => s.key);
    assert.ok(keys.indexOf(TRAINING.READY_KEY) < keys.indexOf(key), `${role}: the Sales milestone comes first`);
  }
});

test('commission, the session and restarts all read the path\'s ready key, with the old Sales ready kept', () => {
  assert.match(fnOf('function readyRow('), /step_key = \$\{param\} OR \(\$\{alias\}\.step_key = '\$\{TRAINING\.READY_KEY\}' AND \$\{alias\}\.done_at < '\$\{TRAINING\.LEGACY_READY_BEFORE\}'::timestamptz\)/);
  assert.match(fnOf('async function commissionStartsAt('), /readyRow\('t', '\$2'\)[\s\S]*await readyKeyOf\(staffId\)/);
  const who = fnOf('async function staffByEmail(');
  assert.match(who, /legacy_ready/);
  assert.match(who, /inTraining: !\(s\.legacy_ready \|\| flags\.includes\(TRAINING\.readyKeyFor\(/);
  assert.match(src, /FROM staff_training t WHERE t\.staff_id = \$1 AND \$\{readyRow\('t', '\$2'\)\}\n\s+ORDER BY t\.done_at\n\s+ON CONFLICT DO NOTHING`, \[staffId, await readyKeyOf\(staffId\)\]/, 'a restart keeps the window of whichever ready ended training');
  assert.ok(new Date(TRAINING.LEGACY_READY_BEFORE) > new Date('2026-10-13T00:00:00Z'));
});

test('a module quiz waits for its module\'s lessons; a lesson ticked makes it open', () => {
  const steps = TRAINING.visibleSteps(undefined, 'design');
  const quiz = steps.find((s) => s.type === 'quiz' && s.gate && s.moduleIndex === 0);
  const lessons = steps.filter((s) => s.module === quiz.module && s.type === 'lesson');
  assert.ok(lessons.length >= 2);
  let p = TRAINING.progress(new Map(), {}, undefined, 'design');
  let q = p.steps.find((s) => s.key === quiz.key);
  assert.strictEqual(q.locked, true);
  assert.strictEqual(q.waiting, `${lessons.length} lessons`);
  p = TRAINING.progress(new Map(lessons.map((l) => [l.key, { done_at: new Date() }])), {}, undefined, 'design');
  q = p.steps.find((s) => s.key === quiz.key);
  assert.strictEqual(q.locked, false);
  // The routes say why it is shut.
  assert.match(fnOf('async function quizShutWhy('), /That quiz opens once you finish \$\{s\.waiting\} in this module\./);
});
