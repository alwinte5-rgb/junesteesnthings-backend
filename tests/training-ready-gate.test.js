'use strict';

/* A course's closing sign-offs (ready starts commission) wait for the final
 * exam and every lesson, not just the module before them.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TRAINING = require('../tools/lib/training');

const PATHS = [['sales', null], ['sales', 'closer'], ['design', null]];

function state(track, role, { finalPassed, skipLesson }) {
  const steps = TRAINING.visibleSteps(undefined, track, role);
  const ticks = new Map();
  for (const s of steps) if (s.type === 'lesson' && s.key !== skipLesson) ticks.set(s.key, { done_at: new Date() });
  const quizzes = {};
  for (const s of steps) if (s.type === 'quiz' && (finalPassed || !/-final$/.test(s.quiz))) quizzes[s.quiz] = 1;
  const exams = {};
  for (const s of steps) if (s.type === 'exam') exams[s.exam] = 1;
  return { steps, p: TRAINING.progress(ticks, { quizzes, exams }, undefined, track, role) };
}

for (const [track, role] of PATHS) {
  const label = `${track}${role ? `+${role}` : ''}`;
  test(`${label}: closing sign-offs stay shut until the final exam is passed`, () => {
    const { p } = state(track, role, { finalPassed: false });
    const finals = p.steps.filter((s) => s.type === 'signoff' && s.module === `${s.course}:final`);
    assert.ok(finals.length, 'the path has closing sign-offs');
    const ready = p.steps.find((s) => s.key === TRAINING.READY_KEY);
    if (ready) assert.strictEqual(TRAINING.stepOpen(p, TRAINING.READY_KEY), false);
    for (const s of finals) {
      assert.strictEqual(s.locked, true, s.key);
      assert.match(s.waiting, /the final exam/, s.key);
    }
  });

  test(`${label}: they open once the exam and every lesson are done, and a missing lesson keeps them shut`, () => {
    const all = state(track, role, { finalPassed: true });
    const finals = all.p.steps.filter((s) => s.type === 'signoff' && s.module === `${s.course}:final`);
    for (const s of finals) assert.strictEqual(s.locked, false, s.key);
    const first = finals[0];
    const lesson = all.steps.find((s) => s.type === 'lesson' && s.course === first.course);
    const one = state(track, role, { finalPassed: true, skipLesson: lesson.key });
    const again = one.p.steps.find((s) => s.key === first.key);
    assert.strictEqual(again.locked, true);
    assert.strictEqual(again.waiting, '1 lesson');
  });
}

test('the sign-off POST refuses a locked step and says what it waits for', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const r = src.slice(src.indexOf("app.post('/admin/training/signoff'"), src.indexOf('\n});', src.indexOf("app.post('/admin/training/signoff'")));
  const gate = r.indexOf('if (!open || open.locked)');
  assert.ok(gate > 0);
  assert.ok(gate < r.indexOf('INSERT INTO staff_training (staff_id, step_key, signed_by)'), 'checked before the write');
  assert.match(r, /waits for \$\{open\.waiting\}/);
});
