'use strict';

/* The owner's view of a helper's training: the answer log, the attempts
 * page, archived restarts and the time line.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TRAINING = require('../tools/lib/training');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

test('the answer log keeps what was picked on every question', () => {
  const key = 'team-1';
  const z = TRAINING.QUIZZES[key];
  const picked = Object.fromEntries(z.questions.map((x, i) => [x.id, String(i === 0 ? (x.answer + 1) % x.choices.length : x.answer)]));
  const r = TRAINING.gradeQuiz(key, picked);
  const log = TRAINING.answerLog(r.results);
  assert.strictEqual(log.length, z.questions.length);
  assert.deepStrictEqual(Object.keys(log[0]).sort(), ['id', 'picked', 'pickedText', 'right']);
  assert.strictEqual(log[0].right, false);
  assert.strictEqual(log[0].pickedText, z.questions[0].choices[(z.questions[0].answer + 1) % z.questions[0].choices.length]);
  assert.ok(log.slice(1).every((x) => x.right));
});

test('the quiz version changes when a question is reworded, and not otherwise', () => {
  const h = TRAINING.quizHash('team-1');
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.strictEqual(TRAINING.quizHash('team-1'), h);
  const q = TRAINING.QUIZZES['team-1'].questions[0];
  const was = q.q;
  q.q = `${was} (reworded)`;
  try { assert.notStrictEqual(TRAINING.quizHash('team-1'), h); } finally { q.q = was; }
  assert.strictEqual(TRAINING.quizHash('no-such-quiz'), null);
});

test('the attempts page is the owner\'s alone, and lists archived tries too', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/training/attempts'], 'owner');
  const r = route("app.get('/admin/training/attempts', requireAdmin");
  assert.match(r, /Object\.prototype\.hasOwnProperty\.call\(TRAINING\.QUIZZES, key\)/, 'only a real quiz key');
  assert.match(r, /WHERE staff_id = \$1 AND quiz_key = \$2 ORDER BY created_at, id/);
  assert.doesNotMatch(r, /archived_at IS NULL/, 'tries before a restart are shown, marked');
  assert.match(r, /before October 2026/, 'old tries say their picks were not recorded');
  assert.match(r, /res\.set\('Cache-Control', 'no-store'\)/);
  assert.match(r, /escEmail\(x\.pickedText\)/, 'the pick is escaped');
});

test('a helper\'s result page sends the owner to the attempts page, never renders theirs as the owner', () => {
  const r = route("app.get('/admin/training/quiz/:key/result/:id', requireAdmin");
  assert.strictEqual(STAFF.ROUTES['GET /admin/training/quiz/:key/result/:id'], 'any');
  assert.match(r, /if \(actor\.kind !== 'staff'\) \{\s*return res\.redirect\(a \? `\/admin\/training\/attempts\?staff=\$\{a\.staff_id\}/);
});

test('every count of passes ignores tries a restart put aside', () => {
  const fn = src.slice(src.indexOf('async function trainingFacts('), src.indexOf('\n}\n', src.indexOf('async function trainingFacts(')));
  assert.match(fn, /FROM staff_quiz_attempts WHERE staff_id = \$1 AND passed AND archived_at IS NULL/);
  assert.match(fn, /WHERE staff_id = \$1 AND passed AND archived_at IS NULL AND scenario = ANY/);
  const qa = src.slice(src.indexOf('async function quizAttempts('), src.indexOf('\n}\n', src.indexOf('async function quizAttempts(')));
  assert.match(qa, /archived_at IS NULL/);
  for (const col of ['answers JSONB', 'quiz_hash TEXT', 'archived_at TIMESTAMPTZ']) {
    assert.match(src, new RegExp(`ALTER TABLE staff_quiz_attempts ADD COLUMN IF NOT EXISTS ${col.replace(' ', ' ')}`));
  }
  assert.match(src, /ALTER TABLE staff_exam_attempts ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
});

test('the owner\'s Training page says whose it is, links each quiz\'s answers and shows the time', () => {
  const r = route("app.get('/admin/training', requireAdmin");
  assert.match(r, /You are viewing \$\{escEmail\(who\.name\)\}'s training\./);
  assert.match(r, /href="\/admin\/training\/attempts\?staff=\$\{staffId\}&amp;quiz=\$\{encodeURIComponent\(s\.quiz\)\}"/);
  assert.match(r, /TRAINING\.timeSpent\(p\.steps/);
  assert.match(r, /Time on training: /);
});

test('the quiz form submits once', () => {
  const r = route("app.get('/admin/training/quiz/:key', requireAdmin");
  assert.match(r, /action="\/admin\/training\/quiz\/\$\{escEmail\(key\)\}" data-once>/);
  assert.match(r, /\$\{SHIP_ONCE_JS\}/);
});

test('finishing a module\'s last lesson goes on to its quiz: progress is read again after the tick', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  const i = src.indexOf("app.post('/admin/training/read'");
  const body = src.slice(i, i + 4000);
  assert.ok(body.indexOf('INSERT INTO staff_training (staff_id, step_key)') < body.indexOf('p = await trainingFor(actor.id).catch(() => p);'));
});
