'use strict';

/* Quiz answers are spread across the choices, and the page shows the choices
 * in a new order on each try (tools/lib/training.js balanced, quizForPage).
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TRAINING = require('../tools/lib/training');
const COURSES = require('../tools/lib/courses');

test('always picking the same letter fails every quiz, in every course', () => {
  const keys = Object.keys(TRAINING.QUIZZES);
  assert.ok(keys.length > 20);
  for (const key of keys) {
    const z = TRAINING.QUIZZES[key];
    const widest = Math.max(...z.questions.map((x) => x.choices.length));
    for (let letter = 0; letter < widest; letter++) {
      const picked = Object.fromEntries(z.questions.map((x) => [x.id, String(Math.min(letter, x.choices.length - 1))]));
      assert.strictEqual(TRAINING.gradeQuiz(key, picked).passed, false, `${key}: always choice ${'ABCDE'[letter]} passes`);
    }
  }
});

test('no quiz has more than half its answers in one spot', () => {
  for (const [key, z] of Object.entries(TRAINING.QUIZZES)) {
    const at = {};
    for (const x of z.questions) at[x.answer] = (at[x.answer] || 0) + 1;
    assert.ok(Math.max(...Object.values(at)) <= Math.ceil(z.questions.length / 2), `${key}: ${JSON.stringify(at)}`);
  }
});

test('turning the choices round keeps each question\'s right answer and its choices', () => {
  const src = new Map();
  for (const c of Object.values(COURSES.COURSES)) {
    for (const z of [...c.modules.map((m) => m.quiz), c.final && c.final.quiz].filter(Boolean)) src.set(z.key, z);
  }
  for (const [key, z] of Object.entries(TRAINING.QUIZZES)) {
    const was = src.get(key);
    if (!was) continue;
    z.questions.forEach((x, i) => {
      const o = was.questions[i];
      assert.strictEqual(x.choices[x.answer], o.choices[o.answer], `${key} ${x.id}`);
      assert.deepStrictEqual([...x.choices].sort(), [...o.choices].sort(), `${key} ${x.id}`);
    });
  }
});

test('the page shows every choice once, in a fresh order, and sends back the stored index', () => {
  const key = Object.keys(TRAINING.QUIZZES)[0];
  const seen = new Set();
  for (let n = 0; n < 20; n++) {
    const view = TRAINING.quizForPage(key);
    for (const x of view.questions) assert.deepStrictEqual([...x.order].sort((a, b) => a - b), x.choices.map((_, i) => i));
    assert.ok(!view.questions.some((x) => 'answer' in x), 'no answer on the page');
    seen.add(view.questions.map((x) => x.order.join('')).join('|'));
  }
  assert.ok(seen.size > 1, 'the order changes between tries');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /x\.order\.map\(\(i\) => `<label[\s\S]{0,200}value="\$\{i\}"[\s\S]{0,120}escEmail\(x\.choices\[i\]\)/);
});
