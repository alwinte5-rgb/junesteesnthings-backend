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

});

test('radio values are positions on the page; the signed order maps them back, and picking one position everywhere fails', () => {
  const key = Object.keys(TRAINING.QUIZZES).find((k) => TRAINING.QUIZZES[k].questions.length >= 10);
  const view = TRAINING.quizForPage(key);
  const orders = Object.fromEntries(view.questions.map((x) => [x.id, x.order]));
  const token = TRAINING.signOrder('k', key, 7, orders);
  assert.deepStrictEqual(TRAINING.readOrder('k', token, key, 7), orders);
  for (const bad of [TRAINING.readOrder('other', token, key, 7), TRAINING.readOrder('k', token, key, 8),
    TRAINING.readOrder('k', token, 'team-1' === key ? 'design' : 'team-1', 7), TRAINING.readOrder('k', token.slice(0, -2) + 'xx', key, 7),
    TRAINING.readOrder('k', '', key, 7), TRAINING.readOrder('k', 'x'.repeat(9000), key, 7)]) assert.strictEqual(bad, null);
  // Picking the position that shows the right answer passes.
  const z = TRAINING.QUIZZES[key];
  const right = Object.fromEntries(z.questions.map((x) => [x.id, String(orders[x.id].indexOf(x.answer))]));
  assert.strictEqual(TRAINING.gradeQuiz(key, TRAINING.picksFromPositions(orders, right)).passed, true);
  // The same position everywhere, over many fresh orders, essentially never passes.
  let passes = 0;
  for (let n = 0; n < 200; n++) {
    const o = Object.fromEntries(TRAINING.quizForPage(key).questions.map((x) => [x.id, x.order]));
    const same = Object.fromEntries(z.questions.map((x) => [x.id, '0']));
    if (TRAINING.gradeQuiz(key, TRAINING.picksFromPositions(o, same)).passed) passes++;
  }
  assert.ok(passes <= 2, `${passes} of 200 passed by always picking the top choice`);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /x\.order\.map\(\(i, pos\) => `<label[\s\S]{0,200}value="\$\{pos\}"/);
  assert.match(src, /const tok = TRAINING\.readQuizToken\(FORM_TOKEN_KEY, \(req\.body \|\| \{\}\)\._ord, key, actor\.id\);\n\s+const orders = tok && tok\.orders;\n\s+if \(!orders\) return back\(/);
});
