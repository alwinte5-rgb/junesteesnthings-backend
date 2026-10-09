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
  const seen = new Set(); // Team basics is one quiz object shared by every non-sales course
  for (const c of Object.values(COURSES.COURSES)) {
    for (const m of c.modules) {
      assert.ok(m.lessons.length || (m.practice || []).some((x) => x.type === 'exam'), `${m.key} has no lesson`);
      assert.ok(m.quiz || (m.practice || []).some((x) => x.type === 'exam'), `${m.key} is never checked`);
    }
    for (const z of [...c.modules.map((m) => m.quiz).filter(Boolean), c.final.quiz]) {
      if (seen.has(z)) continue;
      seen.add(z);
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
  // The quote exam gates module 7 like a quiz does...
  const allQuizzes = Object.fromEntries(['s1', 's2', 's3', 's4', 's5'].map((k) => [`sales-${k}`, 1]));
  assert.ok(!TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: allQuizzes }), 'lesson:s7-upsell'));
  assert.ok(TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: allQuizzes, exams: { 'sales-core': 1 } }), 'lesson:s7-upsell'));
  // ...but a module whose exam waits for a feature not switched on does not hold the course shut.
  assert.ok(TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: allQuizzes }, new Set(['resources'])), 'lesson:s7-upsell'));
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
  assert.deepStrictEqual(COURSES.coursesFor('design').map((c) => c.key), ['design-core']);
  assert.deepStrictEqual(COURSES.coursesFor('nope'), []);
  assert.deepStrictEqual(COURSES.coursesFor('__proto__'), []);
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
  assert.match(page, /withTips\(kbRender\(pageMd\[pageNo - 1\]\), seen\)/, 'each page is the Playbook\'s escaped render');
  assert.match(page, /withTips\(escEmail\(c\.q\), seen\)/, 'check-yourself questions are escaped');
  assert.match(page, /<span>\$\{escEmail\(ch\)\}<\/span>/, 'and so are their choices');
  assert.match(page, /\/\^\\\/assets\\\/images\\\/\[a-z0-9\/_-\]\+\\\.\(jpe\?g\|png\|webp\|svg\)\$\/i\.test\(im\.src\)/,
    'a lesson shows only the site\'s own images');
  assert.match(page, /x\.locked && !owner \? `<span class="btn btn-ghost"/, 'next past a closed module never links');
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
  const code = src.slice(start, src.indexOf('/* A course lesson.', start));
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

test('every role\'s training: owner only, a known path or the first one, and every path listed', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/training/paths'], 'owner');
  const page = route("app.get('/admin/training/paths', requireAdmin");
  assert.match(page, /TRAINING_PATHS\.find\(\(x\) => x\.key === String\(req\.query\.path \|\| ''\)\) \|\| TRAINING_PATHS\[0\]/,
    'an unknown ?path= falls back instead of reaching into the list');
  const list = src.slice(src.indexOf('const TRAINING_PATHS = ['), src.indexOf('];', src.indexOf('const TRAINING_PATHS = [')));
  assert.match(list, /key: 'sales', track: 'sales', role: null/);
  assert.match(list, /Object\.entries\(TRAINING\.SALES_ROLES\)\.map/, 'one path per sales role');
  assert.match(list, /key: 'design', track: 'design'/);
  assert.match(src, /href="\/admin\/training\/paths">Every role\\'s training<\/a>/);
});

test('every lesson has photos from the shop and multiple-choice checks with a real answer', () => {
  for (const c of Object.values(COURSES.COURSES)) {
    for (const l of c.modules.flatMap((m) => m.lessons)) {
      assert.ok(l.checks && l.checks.length >= 2, `${l.id} needs at least two check-yourself questions`);
      for (const q of l.checks) {
        assert.ok(Array.isArray(q.choices) && q.choices.length >= 2, `${l.id}: "${q.q}" is not multiple choice`);
        assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length, `${l.id}: "${q.q}" has no valid answer`);
        assert.ok(q.why, `${l.id}: "${q.q}" explains the answer`);
      }
      for (const im of l.images || []) {
        assert.match(im.src, /^\/assets\/images\/[a-z0-9/_-]+\.(jpe?g|png|webp|svg)$/i, `${l.id}: ${im.src}`);
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', im.src)), `${l.id}: ${im.src} is not in public/`);
        assert.ok(im.alt, `${l.id}: every picture says what it shows`);
      }
    }
    for (const m of c.modules) assert.ok(m.icon, `${m.key} has an icon`);
  }
});

test('the call form keeps its checkbox small and its label on one line', () => {
  const fn = src.slice(src.indexOf('function logCallForm('), src.indexOf('\n}\n', src.indexOf('function logCallForm(')));
  assert.match(fn, /name="missed" value="1" style="width:auto;flex:0 0 auto"/);
});

test('lessons read a page at a time, each page with its own questions', () => {
  for (const c of Object.values(COURSES.COURSES)) {
    const seeded = c.modules.flatMap((m) => m.lessons);
    for (const l of seeded) {
      assert.ok(l.pages && l.pages.length >= 1, `${l.id} has no pages`);
      assert.strictEqual(l.pages[0].from, null, `${l.id}: the first page starts at the top`);
      for (const pg of l.pages) assert.ok(pg.checks.length >= 2, `${l.id}: every page asks at least two questions`);
      if (!l.existing) {
        const heads = new Set((l.body.match(/^\*\*[^*\n]+\*\*$/gm) || []).map((h) => h.slice(2, -2)));
        for (const pg of l.pages.slice(1)) assert.ok(heads.has(pg.from), `${l.id}: page heading "${pg.from}" is not in the lesson`);
        const md = TRAINING.lessonPages(l.body, l.pages);
        assert.strictEqual(md.length, l.pages.length, `${l.id}: split into the wrong number of pages`);
        assert.strictEqual(md.join('\n\n'), l.body, `${l.id}: the pages lose or repeat words`);
        for (const pg of md) assert.ok(pg.split(/\s+/).length <= 300, `${l.id}: a page is too long to read in one go`);
      }
    }
  }
  // A heading the owner renamed: the same number of pages, split evenly, nothing lost.
  const body = '**A**\n\none\n\n**B**\n\ntwo\n\n**C**\n\nthree\n\n**D**\n\nfour';
  const even = TRAINING.lessonPages(body, [{ from: null }, { from: 'Renamed' }]);
  assert.strictEqual(even.length, 2);
  assert.strictEqual(even.join('\n\n'), body);
  assert.deepStrictEqual(TRAINING.lessonPages('no headings at all', [{ from: null }, { from: 'X' }]), ['no headings at all']);
  assert.deepStrictEqual(TRAINING.lessonPages('', []), ['']);
  const page = route("app.get('/admin/training/lesson/:id', requireAdmin");
  assert.match(page, /Math\.min\(pages, Math\.max\(1, intIn\(req\.query\.p\) \|\| 1\)\)/, 'the page number is clamped');
  assert.match(page, /!owner && !last \? ''/, 'the finish button is only on the last page');
});

test('every non-sales course opens with Team basics, registered once however many courses share it', () => {
  const TEAM = require('../tools/lib/courses/shared-team');
  const others = Object.values(COURSES.COURSES).filter((c) => c.track !== 'sales');
  assert.ok(others.length >= 1);
  for (const c of others) {
    assert.strictEqual(c.modules[0].quiz, TEAM.MODULE.quiz, `${c.key} opens with the shared module`);
    assert.strictEqual(c.modules[0].lessons, TEAM.MODULE.lessons);
  }
  assert.strictEqual(TRAINING.lessonArticles().filter((a) => /^Team basics /.test(a.title)).length, TEAM.MODULE.lessons.length);
  assert.ok(TRAINING.QUIZZES['team-1']);
  // Salespeople learn the same ground in the Sales course, so they do not take it twice.
  for (const r of [null, ...Object.keys(TRAINING.SALES_ROLES)]) {
    assert.ok(!TRAINING.visibleSteps(undefined, 'sales', r).some((s) => s.key === 'quiz:team-1'));
  }
});

test('the Content course is the content track\'s path: its own sign-offs, the owner\'s gaps, and the promotion step last', () => {
  assert.ok(TRAINING.TRACKS.content);
  assert.deepStrictEqual(COURSES.coursesFor('content').map((c) => c.key), ['content-core']);
  const keys = TRAINING.visibleSteps(undefined, 'content').map((s) => s.key);
  for (const k of ['quiz:team-1', 'signoff:content-edit', 'signoff:content-report', 'quiz:content-final', 'signoff:handoff']) assert.ok(keys.includes(k), k);
  assert.strictEqual(keys[keys.length - 1], TRAINING.READY_KEY);
  // Module 2 stays shut until Team basics is passed.
  assert.ok(!TRAINING.stepOpen(TRAINING.progress(new Map(), {}, undefined, 'content'), 'lesson:c2-why'));
  assert.ok(TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: { 'team-1': 1 } }, undefined, 'content'), 'lesson:c2-why'));
  const gaps = TRAINING.lessonArticles().filter((a) => /^Content course /.test(a.title)).flatMap((a) => TRAINING.ownerGaps(a.body));
  assert.ok(gaps.length >= 5, `${gaps.length} gaps`);
  for (const g of gaps) assert.match(g.token, /owner to fill in/);
  assert.strictEqual(TRAINING.visibleSteps(undefined, 'content').find((s) => s.key === 'lesson:c4-edit').title, 'Editing a short');
  // The path is listed for the owner, and a hired content editor lands on it.
  const list = src.slice(src.indexOf('const TRAINING_PATHS = ['), src.indexOf('];', src.indexOf('const TRAINING_PATHS = [')));
  assert.match(list, /key: 'content', track: 'content'/);
  assert.match(src, /add_track: r\.role === 'designer' \? 'design' : TRAINING\.trackOf\(r\.role\)/);
  assert.strictEqual(TRAINING.trackOf('content'), 'content');
  assert.strictEqual(require('../tools/lib/team-channels').audienceOf('content'), 'content');
});

test('the Ads course is the ads track\'s path: its own sign-offs, the owner\'s gaps, and the promotion step last', () => {
  assert.ok(TRAINING.TRACKS.ads);
  assert.deepStrictEqual(COURSES.coursesFor('ads').map((c) => c.key), ['ads-core']);
  const keys = TRAINING.visibleSteps(undefined, 'ads').map((s) => s.key);
  for (const k of ['quiz:team-1', 'signoff:ads-tracking', 'signoff:ads-terms', 'signoff:ads-report', 'quiz:ads-final', 'signoff:handoff']) assert.ok(keys.includes(k), k);
  assert.strictEqual(keys[keys.length - 1], TRAINING.READY_KEY);
  assert.ok(!TRAINING.stepOpen(TRAINING.progress(new Map(), {}, undefined, 'ads'), 'lesson:a2-judge'));
  assert.ok(TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: { 'team-1': 1 } }, undefined, 'ads'), 'lesson:a2-judge'));
  const gaps = TRAINING.lessonArticles().filter((a) => /^Ads course /.test(a.title)).flatMap((a) => TRAINING.ownerGaps(a.body));
  assert.ok(gaps.length >= 5, `${gaps.length} gaps`);
  for (const g of gaps) assert.match(g.token, /owner to fill in/);
  assert.strictEqual(TRAINING.visibleSteps(undefined, 'ads').find((s) => s.key === 'lesson:a5-terms').title, 'Search terms, negatives and the $40 rule');
  // Ads never send anyone to the back office.
  for (const a of TRAINING.lessonArticles().filter((x) => /^Ads course /.test(x.title))) assert.doesNotMatch(a.body.replace(/\*\*jtees\.net\/quote:\*\*/, ''), /jtees\.net\/quote\b/, a.title);
  const list = src.slice(src.indexOf('const TRAINING_PATHS = ['), src.indexOf('];', src.indexOf('const TRAINING_PATHS = [')));
  assert.match(list, /key: 'ads', track: 'ads'/);
  assert.strictEqual(TRAINING.trackOf('ads'), 'ads', 'a hired ads specialist lands on the ads path');
  assert.strictEqual(require('../tools/lib/team-channels').audienceOf('ads'), 'ads');
});

test('the Bookkeeper course is the bookkeeper track\'s path, and a hired bookkeeper lands on it', () => {
  assert.ok(TRAINING.TRACKS.bookkeeper);
  assert.strictEqual(TRAINING.trackOf('bookkeeper'), 'bookkeeper', 'the hiring role name is the track name');
  assert.deepStrictEqual(COURSES.coursesFor('bookkeeper').map((c) => c.key), ['books-core']);
  const keys = TRAINING.visibleSteps(undefined, 'bookkeeper').map((s) => s.key);
  for (const k of ['quiz:team-1', 'signoff:books-receipts', 'signoff:books-tax', 'signoff:books-close', 'quiz:books-final', 'signoff:handoff']) assert.ok(keys.includes(k), k);
  assert.strictEqual(keys[keys.length - 1], TRAINING.READY_KEY);
  assert.ok(!TRAINING.stepOpen(TRAINING.progress(new Map(), {}, undefined, 'bookkeeper'), 'lesson:b2-money'));
  assert.ok(TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: { 'team-1': 1 } }, undefined, 'bookkeeper'), 'lesson:b2-money'));
  const gaps = TRAINING.lessonArticles().filter((a) => /^Bookkeeper course /.test(a.title)).flatMap((a) => TRAINING.ownerGaps(a.body));
  assert.ok(gaps.length >= 5, `${gaps.length} gaps`);
  for (const g of gaps) assert.match(g.token, /owner to fill in/);
  assert.strictEqual(TRAINING.visibleSteps(undefined, 'bookkeeper').find((s) => s.key === 'lesson:b5-tax').title, 'Illinois sales tax');
  const list = src.slice(src.indexOf('const TRAINING_PATHS = ['), src.indexOf('];', src.indexOf('const TRAINING_PATHS = [')));
  assert.match(list, /key: 'bookkeeper', track: 'bookkeeper'/);
  assert.strictEqual(require('../tools/lib/team-channels').audienceOf('bookkeeper'), 'bookkeeper');
});

test('the Developer course is the developer track\'s path, and a hired developer lands on it', () => {
  assert.strictEqual(TRAINING.trackOf('developer'), 'developer', 'the hiring role name is the track name');
  assert.deepStrictEqual(COURSES.coursesFor('developer').map((c) => c.key), ['dev-core']);
  const keys = TRAINING.visibleSteps(undefined, 'developer').map((s) => s.key);
  for (const k of ['quiz:team-1', 'signoff:dev-rollback', 'signoff:dev-first-pr', 'quiz:dev-final', 'signoff:handoff']) assert.ok(keys.includes(k), k);
  assert.strictEqual(keys[keys.length - 1], TRAINING.READY_KEY);
  assert.ok(!TRAINING.stepOpen(TRAINING.progress(new Map(), {}, undefined, 'developer'), 'lesson:v2-stack'));
  assert.ok(TRAINING.stepOpen(TRAINING.progress(new Map(), { quizzes: { 'team-1': 1 } }, undefined, 'developer'), 'lesson:v2-stack'));
  const gaps = TRAINING.lessonArticles().filter((a) => /^Developer course /.test(a.title)).flatMap((a) => TRAINING.ownerGaps(a.body));
  assert.ok(gaps.length >= 4, `${gaps.length} gaps`);
  for (const g of gaps) assert.match(g.token, /owner to fill in/);
  assert.strictEqual(TRAINING.visibleSteps(undefined, 'developer').find((s) => s.key === 'lesson:v3-incident').title, 'When something breaks');
  // The developer is told how they get Claude Code, and that the repo's rules load with it.
  assert.ok(gaps.some((g) => /Claude account/.test(g.token)), 'June is asked which Claude account the developer uses');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'CLAUDE.md')) && /@AGENTS\.md/.test(fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8')), 'CLAUDE.md loads AGENTS.md');
  const list = src.slice(src.indexOf('const TRAINING_PATHS = ['), src.indexOf('];', src.indexOf('const TRAINING_PATHS = [')));
  assert.match(list, /key: 'developer', track: 'developer'/);
  // Every non-sales hiring role now has a course of its own.
  for (const role of ['content', 'ads', 'bookkeeper', 'developer']) assert.strictEqual(COURSES.coursesFor(TRAINING.trackOf(role)).length, 1, role);
});

test('the Design course keeps the old checklist\'s keys, so a designer\'s ticks and passes still count', () => {
  const keys = TRAINING.visibleSteps(new Set(['proofs']), 'design').map((s) => s.key);
  for (const k of ['do:message', 'do:proof', 'quiz:design', 'signoff:art', 'signoff:handoff', 'signoff:ready']) assert.ok(keys.includes(k), k);
  assert.strictEqual(keys[keys.length - 1], TRAINING.READY_KEY);
  assert.strictEqual(TRAINING.visibleSteps(new Set(['proofs']), 'design').find((s) => s.key === 'do:proof').need, 3);
  // What only the owner knows reaches her Playbook gaps card, and nothing else is a gap.
  const gaps = TRAINING.lessonArticles().filter((a) => /^Design course /.test(a.title)).flatMap((a) => TRAINING.ownerGaps(a.body));
  assert.ok(gaps.length >= 6, `${gaps.length} gaps`);
  for (const g of gaps) assert.match(g.token, /owner to fill in/);
  // Lesson titles lose their "Design course 3a:" prefix on the page.
  assert.strictEqual(TRAINING.visibleSteps(undefined, 'design').find((s) => s.key === 'lesson:d3-dtf').title, 'DTF, embroidery and the rest');
  assert.strictEqual(TRAINING.visibleSteps(undefined, 'design').find((s) => s.key === 'lesson:team-chat').title, 'Team chat and working on your own');
});
