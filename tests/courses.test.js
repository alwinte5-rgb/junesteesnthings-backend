'use strict';

/* The training academy (tools/lib/courses): every course is a full eight-hour
 * day with real buffer time, every quiz passes at 80%, modules open in order,
 * and the lesson page and restart button keep a helper inside their own
 * training.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TRAINING = require('../tools/lib/training');
const COURSES = require('../tools/lib/courses');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

/** Minutes in a course: material and buffer, counted from the data itself. */
function minutesOf(c) {
  let material = c.final.quiz.minutes;
  let buffer = c.final.floating;
  for (const m of c.modules) {
    material += m.lessons.reduce((n, l) => n + l.minutes, 0) + (m.practice || []).reduce((n, x) => n + (x.minutes || 0), 0)
      + (m.quiz ? m.quiz.minutes : 0);
    buffer += m.buffer;
  }
  return { material, buffer, total: material + buffer };
}

test('every course is an eight-hour day with at least an hour of buffer', () => {
  for (const c of Object.values(COURSES.COURSES)) {
    const m = minutesOf(c);
    assert.ok(Math.abs(m.total - 480) <= 10, `${c.key}: ${m.total} minutes, not 8 hours`);
    assert.ok(m.buffer >= 60, `${c.key}: only ${m.buffer} minutes of buffer`);
    for (const mod of c.modules) assert.ok(mod.buffer >= 5, `${c.key}/${mod.key} has no catch-up time`);
  }
});

test('every module teaches something and checks it; every quiz passes at 80%', () => {
  const quizKeys = new Set();
  for (const c of Object.values(COURSES.COURSES)) {
    for (const m of c.modules) {
      assert.ok(m.lessons.length || (m.practice || []).some((x) => x.type === 'exam'), `${m.key} has no lesson`);
      assert.ok(m.quiz || (m.practice || []).some((x) => x.type === 'exam'), `${m.key} is never checked`);
    }
    for (const z of [...c.modules.map((m) => m.quiz).filter(Boolean), c.final.quiz]) {
      assert.ok(!quizKeys.has(z.key), `quiz ${z.key} twice`);
      quizKeys.add(z.key);
      const q = TRAINING.QUIZZES[z.key];
      assert.ok(q, `${z.key} not registered`);
      assert.strictEqual(q.pass, Math.ceil(z.questions.length * 0.8), `${z.key} must pass at 80%`);
      assert.ok(z.questions.length >= 10, `${z.key} is too short to mean anything`);
      const ids = z.questions.map((x) => x.id);
      assert.strictEqual(new Set(ids).size, ids.length, `${z.key}: duplicate question ids`);
      for (const x of z.questions) {
        assert.ok(Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.choices.length, `${z.key}/${x.id}`);
        assert.ok(x.why && x.article, `${z.key}/${x.id} explains itself and names what to re-read`);
        assert.strictEqual(new Set(x.choices).size, x.choices.length, `${z.key}/${x.id}: repeated choice`);
      }
    }
    assert.ok(c.final.quiz.questions.length >= 40, 'the final exam covers the whole course');
  }
  assert.strictEqual(TRAINING.passMark(10), 8);
  assert.strictEqual(TRAINING.passMark(40), 32);
  assert.strictEqual(TRAINING.passMark(7), 6);
});

test('lessons are playbook articles: unique titles, kept as the owner edits them, existing ones really exist', () => {
  const seeded = new Set([...src.matchAll(/^\s+\{ kind: '[a-z]+'.*?title: '((?:[^'\\]|\\.)+)'/gm)].map((m) => m[1].replace(/\\'/g, "'")));
  const added = TRAINING.lessonArticles();
  const titles = added.map((a) => a.title);
  assert.strictEqual(new Set(titles).size, titles.length, 'two lessons share a title');
  for (const t of titles) assert.ok(!seeded.has(t), `"${t}" would collide with an existing article`);
  for (const a of added) {
    assert.strictEqual(a.kind, 'course');
    assert.strictEqual(a.needsReview, true, 'every lesson starts as a draft for the owner to check');
    assert.ok(a.body.length > 400, `"${a.title}" is too thin to be a lesson`);
  }
  for (const c of Object.values(COURSES.COURSES)) {
    for (const l of c.modules.flatMap((m) => m.lessons).filter((x) => x.existing)) {
      assert.ok(seeded.has(l.article), `lesson ${l.id} points at a missing article "${l.article}"`);
    }
  }
  assert.match(src, /KB_ADDED\.push\(\.\.\.TRAINING\.lessonArticles\(\)\);/);
  assert.match(src, /course: 'Training lesson'/);
  // The Playbook's own renderer is all a lesson body may use: no headings, no raw HTML.
  for (const a of added) assert.doesNotMatch(a.body, /^#|<[a-z]/m, `"${a.title}" uses markup the Playbook cannot show`);
});

test('modules open in order: everything after the first unpassed quiz is locked', () => {
  const p0 = TRAINING.progress(new Map(), {});
  const first = p0.steps.filter((s) => !s.locked).map((s) => s.module);
  assert.deepStrictEqual([...new Set(first)], ['sales-core:s1'], 'only module 1 is open on day one');
  assert.ok(p0.next.every((s) => !s.locked));
  assert.ok(!TRAINING.stepOpen(p0, 'lesson:s2-tour'));
  const p1 = TRAINING.progress(new Map(), { quizzes: { 'sales-s1': 1 } });
  assert.ok(TRAINING.stepOpen(p1, 'lesson:s2-tour'));
  assert.ok(!TRAINING.stepOpen(p1, 'lesson:s3-methods'));
  assert.strictEqual(p1.steps.find((s) => s.key === 'buffer:sales-core:s1').done, true, 'a module\'s buffer is done once its quiz is');
  assert.strictEqual(p1.steps.find((s) => s.key === 'buffer:sales-core:s2').done, false);
  // A module whose exam waits for a later feature does not hold the course shut.
  const allQuizzes = Object.fromEntries(['s1', 's2', 's3', 's4', 's5'].map((k) => [`sales-${k}`, 1]));
  assert.ok(TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: allQuizzes }), 'lesson:s7-upsell'));
  // Buffers are time, not work.
  assert.ok(!p0.steps.filter((s) => s.type === 'buffer').some((s) => p0.next.includes(s)));
  assert.strictEqual(p0.total, p0.steps.filter((s) => s.type !== 'buffer').length);
});

test('the time shown is the course\'s own: expected minutes, and what each finished lesson took', () => {
  const p = TRAINING.progress(new Map(), {}, new Set(['quoteexam', 'eod', 'resources']));
  assert.ok(Math.abs(p.minutes.expected - 480) <= 10, `${p.minutes.expected}`);
  const start = new Date('2026-10-08T15:00:00Z');
  const times = new Map([['lesson:s1-welcome', { started_at: start, done_at: new Date(start.getTime() + 14 * 60000) }],
    ['lesson:s2-tour', { started_at: start, done_at: null }]]);
  const q = TRAINING.progress(new Map(), {}, undefined, 'sales', null, times);
  assert.strictEqual(q.steps.find((s) => s.key === 'lesson:s1-welcome').took, 14);
  assert.strictEqual(q.steps.find((s) => s.key === 'lesson:s2-tour').took, null, 'an open lesson has no time yet');
  assert.strictEqual(q.minutes.took, 14);
});

test('sales roles: three jobs, an unknown one is "no role", and an unwritten role course adds nothing', () => {
  assert.deepStrictEqual(Object.keys(TRAINING.SALES_ROLES), ['leadgen', 'closer', 'accounts']);
  for (const bad of ['', 'nope', '__proto__', 'constructor', null, undefined]) assert.strictEqual(TRAINING.salesRoleOf(bad), null);
  assert.strictEqual(TRAINING.salesRoleOf('leadgen'), 'leadgen');
  assert.deepStrictEqual(COURSES.coursesFor('sales').map((c) => c.key), ['sales-core']);
  assert.deepStrictEqual(COURSES.coursesFor('design'), []);
  for (const r of Object.keys(TRAINING.SALES_ROLES)) {
    const keys = COURSES.coursesFor('sales', r).map((c) => c.key);
    assert.strictEqual(keys[0], 'sales-core', 'every salesperson takes the consolidated course first');
    if (COURSES.COURSES[`sales-${r}`]) assert.deepStrictEqual(keys, ['sales-core', `sales-${r}`]);
  }
  const staff = route("app.post('/admin/staff/:id', requireAdmin");
  assert.match(staff, /const role = TRAINING\.salesRoleOf\(String\(b\.sales_role \|\| ''\)\);/);
  assert.match(src, /ALTER TABLE staff ADD COLUMN IF NOT EXISTS sales_role TEXT/);
  assert.strictEqual(STAFF.ROUTES['POST /admin/staff/:id'], 'owner');
});

test('the lesson page: a known lesson id only, closed modules stay closed, and opening it starts the clock', () => {
  const page = route("app.get('/admin/training/lesson/:id', requireAdmin");
  assert.match(page, /if \(!\/\^\[a-z0-9-\]\{1,60\}\$\/\.test\(id\)\)/, 'the id is checked before anything else');
  assert.match(page, /if \(s && s\.locked\) return back/, 'a helper cannot read ahead of their module');
  assert.match(page, /INSERT INTO staff_lesson_time \(staff_id, step_key\) VALUES \(\$1, \$2\) ON CONFLICT DO NOTHING', \[actor\.id, key\]/);
  assert.match(page, /p = await trainingFor\(actor\.id\)/, 'a helper only ever sees their own path');
  assert.match(page, /res\.set\('Cache-Control', 'no-store'\)/);
  assert.match(page, /withTips\(kbRender\(a\.body\), seen\)/, 'the body is the Playbook\'s escaped render');
  assert.match(page, /withTips\(escEmail\(c\.a\), seen\)/);
  const read = route("app.post('/admin/training/read', requireAdmin");
  assert.match(read, /ON CONFLICT \(staff_id, step_key\) DO UPDATE SET done_at = COALESCE\(staff_lesson_time\.done_at, NOW\(\)\)/,
    'finishing twice keeps the first finish time');
  assert.match(src, /CREATE TABLE IF NOT EXISTS staff_lesson_time/);
});

test('quizzes in a closed module cannot be opened or handed in', () => {
  const get = route("app.get('/admin/training/quiz/:key', requireAdmin");
  assert.match(get, /if \(!owner && !\(await quizOpenFor\(actor, key\)\)\) return back/);
  const post = route("app.post('/admin/training/quiz/:key', requireAdmin");
  assert.match(post, /if \(!\(await quizOpenFor\(actor, key\)\.catch\(\(\) => false\)\)\) return back/);
  assert.match(post, /quizStep\(key, actor\.track, actor\.role\)/, 'the helper\'s own path, never one from the form');
});

test('restart: the owner only, a ticked confirmation, one transaction, page tips kept', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/restart'], 'owner');
  const r = route("app.post('/admin/training/restart', requireAdmin");
  assert.match(r, /if \(String\(b\.confirm \|\| ''\) !== '1'\) return back/);
  assert.match(r, /await client\.query\('BEGIN'\)/);
  assert.match(r, /DELETE FROM staff_training WHERE staff_id = \$1 AND step_key NOT LIKE 'tip:%'/);
  assert.match(r, /DELETE FROM staff_quiz_attempts WHERE staff_id = \$1/);
  assert.match(r, /DELETE FROM staff_lesson_time WHERE staff_id = \$1/);
  assert.match(r, /ROLLBACK/);
});

test('prospects are counted from the leads they registered as found', () => {
  const fn = src.slice(src.indexOf('async function trainingFacts('), src.indexOf('\n}\n', src.indexOf('async function trainingFacts(')));
  assert.match(fn, /action IN \('lead registered as theirs', 'found lead was already known'\)\)::int AS prospects/);
  assert.match(src, /logActivity\(actor, label\.sale_type === 'rep' \? 'lead registered as theirs' : 'found lead was already known'/,
    'the actions counted are the ones the Add a lead form really logs');
});

test('tooltips: the first use of a term, escaped, never inside a tag or a link', () => {
  const start = src.indexOf('const TIP_DEFS = ');
  const code = src.slice(start, src.indexOf('/** A lesson step in any course', start));
  const ctx = { TRAINING, escEmail: (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  vm.runInNewContext(`${code}\nthis.withTips = withTips;`, ctx);
  const out = ctx.withTips('<p>DTF has no minimum. DTF again. <a href="/x">DTF link</a> a <b title="DTF">deposit</b></p>');
  assert.strictEqual((out.match(/class="tip"/g) || []).length, 2, 'once per term: DTF and deposit');
  assert.match(out, /<a href="\/x">DTF link<\/a>/, 'link words are left alone');
  assert.match(out, /<b title="DTF">/, 'attributes are never touched');
  assert.match(out, /data-tip="Direct-to-film/);
  assert.doesNotMatch(ctx.withTips('rushed undeposited'), /class="tip"/, 'part of a word is not a term');
  for (const def of Object.values(TRAINING.glossary())) assert.doesNotMatch(def, /[<>]/);
  assert.match(src, /\.tip:hover::after,\.tip:focus::after\{content:attr\(data-tip\)/);
});
