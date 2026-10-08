'use strict';

/* Training (tools/lib/training.js and its routes in server.js): who can tick
 * what, steps that tick themselves from real work, and page tips.
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

test('every step has a unique key and a known type', () => {
  const keys = TRAINING.STEPS.map((s) => s.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  for (const s of TRAINING.STEPS) assert.ok(['read', 'do', 'signoff', 'quiz'].includes(s.type), s.key);
  assert.ok(keys.includes(TRAINING.READY_KEY), 'training ends with the "ready" sign-off');
  assert.strictEqual(TRAINING.STEPS[TRAINING.STEPS.length - 1].key, TRAINING.READY_KEY);
});

test('every reading step points at an article the playbook really seeds, by its exact title', () => {
  const seeded = new Set([...src.matchAll(/^\s+\{ kind: '[a-z]+'.*?title: '((?:[^'\\]|\\.)+)'/gm)].map((m) => m[1].replace(/\\'/g, "'")));
  for (const s of TRAINING.STEPS.filter((x) => x.type === 'read')) {
    assert.ok(seeded.has(s.article), `${s.key}: no seeded article titled "${s.article}"`);
  }
});

test('a step waiting for a later feature stays hidden until it ships', () => {
  const now = TRAINING.visibleSteps(new Set());
  assert.ok(!now.some((s) => s.needs), 'nothing asks for work the workspace cannot do yet');
  const later = TRAINING.visibleSteps(new Set(['eod', 'proofs']));
  assert.ok(later.some((s) => s.key === 'do:eod'));
  assert.ok(TRAINING.visibleSteps(new Set(['proofs']), 'design').some((s) => s.key === 'do:proof'), 'the proof step is the designer\'s');
  assert.ok(!TRAINING.mayTick('do:eod', true, new Set()), 'a hidden step cannot be ticked');
});

test('work steps tick themselves from real work, never from a stored tick', () => {
  const ticks = new Map([['do:message', { done_at: new Date() }], ['do:prospects', { done_at: new Date() }]]);
  const p = TRAINING.progress(ticks, { leads: 1, messages: 0, prospects: 2 });
  const by = Object.fromEntries(p.steps.map((s) => [s.key, s.done]));
  assert.strictEqual(by['do:lead'], true, 'a lead answered counts');
  assert.strictEqual(by['do:message'], false, 'a stored tick does not stand in for a message never written');
  assert.strictEqual(by['do:prospects'], false, 'three prospects are needed, not two');
  assert.strictEqual(TRAINING.progress(new Map(), { prospects: 3 }).steps.find((s) => s.key === 'do:prospects').done, true);
  assert.strictEqual(p.done, 1);
  assert.strictEqual(p.complete, false);
});

test('training is complete only when every visible step is done', () => {
  const steps = TRAINING.visibleSteps();
  const ticks = new Map(steps.filter((s) => ['lesson', 'read', 'signoff'].includes(s.type)).map((s) => [s.key, { done_at: new Date() }]));
  const quizzes = Object.fromEntries(steps.filter((s) => s.type === 'quiz').map((s) => [s.quiz, 1]));
  assert.strictEqual(TRAINING.progress(ticks, { leads: 1, messages: 1, prospects: 2, quizzes }).complete, false);
  const p = TRAINING.progress(ticks, { leads: 1, messages: 2, prospects: 3, quizzes });
  assert.strictEqual(p.complete, true);
  assert.strictEqual(p.done, p.total);
});

test('a helper ticks their reading; only the owner signs off; nobody ticks work by hand', () => {
  assert.strictEqual(TRAINING.mayTick('lesson:s1-welcome', false), true);
  assert.strictEqual(TRAINING.mayTick('read:never', false, undefined, 'design'), true);
  assert.strictEqual(TRAINING.mayTick('signoff:ready', false), false);
  assert.strictEqual(TRAINING.mayTick('signoff:ready', true), true);
  assert.strictEqual(TRAINING.mayTick('do:lead', true), false);
  assert.strictEqual(TRAINING.mayTick('buffer:sales-core:s1', false), false, 'a buffer is time, not a tick');
  assert.strictEqual(TRAINING.mayTick('quiz:sales-s1', true), false);
  assert.strictEqual(TRAINING.mayTick('read:nope', true), false);
  assert.strictEqual(TRAINING.mayTick('__proto__', true), false);
});

test('the routes enforce the same rules', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/signoff'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/tips-reset'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/feedback'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/read'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/restart'], 'owner');
  assert.strictEqual(STAFF.ROUTES['GET /admin/training/lesson/:id'], 'any');
  const read = route("app.post('/admin/training/read', requireAdmin");
  assert.match(read, /if \(!actor \|\| actor\.kind !== 'staff'\)/, 'the owner has no reading to tick');
  assert.match(read, /!\['read', 'lesson'\]\.includes\(s\.type\)/, 'a sign-off cannot be smuggled through the reading form');
  assert.match(read, /if \(!TRAINING\.stepOpen\(p, key\)\)/, 'a lesson in a closed module cannot be ticked');
  assert.match(read, /\[actor\.id, key\]/, 'a helper ticks only their own steps');
  const sign = route("app.post('/admin/training/signoff', requireAdmin");
  assert.match(sign, /s\.type !== 'signoff'/);
});

test('page tips: a known page only, back only within the site, and never for the owner', () => {
  const tip = route("app.post('/admin/training/tip', requireAdmin");
  assert.match(tip, /Object\.prototype\.hasOwnProperty\.call\(TRAINING\.PAGE_TIPS, key\)/);
  assert.match(tip, /safeAdminPath\(b\.back, '\/admin\/my-day'\)/);
  const fn = src.slice(src.indexOf('function pageTip('), src.indexOf('\n}\n', src.indexOf('function pageTip(')));
  assert.match(fn, /a\.kind !== 'staff' \|\| !a\.inTraining/);
  assert.match(fn, /\$\{withTips\(escEmail\(tip\)\)\}/);
  assert.match(src, /<main class="adm-page"><div class="wrap">\$\{pageTip\(key\)\}\$\{body\}/);
});

test('every page tip belongs to a real menu entry', () => {
  const nav = src.slice(src.indexOf('const ADMIN_NAV = ['), src.indexOf('];', src.indexOf('const ADMIN_NAV = [')));
  const keys = new Set([...nav.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]));
  for (const k of Object.keys(TRAINING.PAGE_TIPS)) assert.ok(keys.has(k), `tip for unknown page "${k}"`);
});

test('placeholders the owner still has to fill in are found; links are not placeholders', () => {
  assert.deepStrictEqual(TRAINING.placeholders('ready in [standard turnaround] days, under [X] days, [X] again'),
    ['standard turnaround', 'X']);
  assert.deepStrictEqual(TRAINING.placeholders('see [the guide](https://example.com)'), []);
  assert.deepStrictEqual(TRAINING.placeholders(''), []);
});

test('coaching notes are escaped, and a helper only ever reads their own', () => {
  const row = src.slice(src.indexOf('function coachingRow('), src.indexOf('\n}\n', src.indexOf('function coachingRow(')));
  assert.match(row, /\$\{escEmail\(n\.body\)\}/);
  const page = route("app.get('/admin/training', requireAdmin");
  assert.match(page, /: actor\.id;/, 'a helper\'s page is always their own, whatever ?staff= says');
});

test('AI prompts are a playbook kind with a copy button, and the AI rules are drafted for the owner', () => {
  assert.match(src, /prompt: 'AI prompt'/);
  assert.match(src, /a\.kind === 'prompt' \? 'Copy the prompt'/);
  assert.match(src, /title: 'AI rules', needsReview: true/);
  assert.match(src, /Never remove a watermark/);
  assert.match(src, /SELECT \$1, \$2, \$3, \$4, \$5, \$6, \$7\s/, 'needsReview reaches the needs_review column');
});

test('the quiz is marked on the server; its step ticks only from a passing attempt', () => {
  const z = TRAINING.QUIZZES['sales-s1'];
  assert.ok(z.questions.length >= 8 && z.pass <= z.questions.length);
  for (const x of z.questions) {
    assert.ok(Number.isInteger(x.answer) && x.answer >= 0 && x.answer < x.choices.length, x.id);
    assert.ok(x.why, `${x.id} explains the answer`);
  }
  const ids = z.questions.map((x) => x.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  // The page copy carries no answers.
  assert.ok(TRAINING.quizForPage('sales-s1').questions.every((x) => !('answer' in x) && !('why' in x)));
  assert.strictEqual(TRAINING.quizForPage('__proto__'), null);
  assert.strictEqual(TRAINING.gradeQuiz('nope', {}), null);

  const all = Object.fromEntries(z.questions.map((x) => [x.id, String(x.answer)]));
  assert.deepStrictEqual([TRAINING.gradeQuiz('sales-s1', all).score, TRAINING.gradeQuiz('sales-s1', all).passed], [z.questions.length, true]);
  const bad = { ...all, [ids[0]]: '9', [ids[1]]: '-1', [ids[2]]: 'x' };
  delete bad[ids[3]];
  const r = TRAINING.gradeQuiz('sales-s1', bad);
  assert.strictEqual(r.score, z.questions.length - 4, 'out-of-range, junk and missing picks are wrong, not errors');
  assert.strictEqual(r.passed, r.score >= z.pass);

  assert.strictEqual(TRAINING.mayTick('quiz:sales-s1', true), false, 'nobody ticks the quiz by hand');
  const none = TRAINING.progress(new Map([['quiz:sales-s1', { done_at: new Date() }]]), {});
  assert.strictEqual(none.steps.find((s) => s.key === 'quiz:sales-s1').done, false, 'a stored tick does not stand in for a pass');
  const passed = TRAINING.progress(new Map(), { quizzes: { 'sales-s1': 1 } });
  assert.strictEqual(passed.steps.find((s) => s.key === 'quiz:sales-s1').done, true);
});

test('quiz routes: a helper hands in their own; answers stay off the helper page', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/training/quiz/:key'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/quiz/:key'], 'any');
  const post = route("app.post('/admin/training/quiz/:key', requireAdmin");
  assert.match(post, /actor\.kind !== 'staff'/, 'the owner does not take the quiz');
  assert.match(post, /\[actor\.id, key, r\.score/, 'an attempt is stored against the signed-in helper only');
  const page = route("app.get('/admin/training/quiz/:key', requireAdmin");
  const helperView = page.slice(page.indexOf('TRAINING.quizForPage(key)'));
  assert.doesNotMatch(helperView, /\.answer\b|\.why\b/, 'the helper page never prints answers');
  assert.match(src, /CREATE TABLE IF NOT EXISTS staff_quiz_attempts/);
  // Retakes are allowed, so the marked page never gives the answers away.
  const marked = post.slice(post.indexOf('res.send(adminPage('));
  assert.doesNotMatch(marked, /answerText|x\.why|pickedText/, 'the result never shows the answer, the reason or the pick');
  assert.match(marked, /Re-read/);
});

test('every quiz question points at a playbook article that really exists', () => {
  const seeded = new Set([...src.matchAll(/^\s+\{ kind: '[a-z]+'.*?title: '((?:[^'\\]|\\.)+)'/gm)].map((m) => m[1].replace(/\\'/g, "'")));
  for (const a of TRAINING.lessonArticles()) seeded.add(a.title);
  for (const [key, z] of Object.entries(TRAINING.QUIZZES)) {
    for (const x of z.questions) assert.ok(seeded.has(x.article), `${key}/${x.id}: no article "${x.article}"`);
  }
});

test('commission starts at the "ready" sign-off, and a recorded payout never disappears', () => {
  const fn = src.slice(src.indexOf('async function commissionLines('), src.indexOf('\n}\n', src.indexOf('async function commissionLines(')));
  assert.match(fn, /t\.step_key = \$2\s+AND q\.created_at >= t\.done_at/, 'only quotes created after the sign-off earn');
  assert.match(fn, /OR EXISTS \(SELECT 1 FROM commission_payouts c WHERE c\.staff_id = \$1 AND c\.quote_code = q\.code\)/);
  assert.match(fn, /\[staffId, TRAINING\.READY_KEY\]/);
  assert.match(TRAINING.visibleSteps(undefined, 'sales').find((s) => s.key === TRAINING.READY_KEY).hint, /Commission starts here/);
});


test('two training paths: each ends with "ready", shares the basics, and keeps its own work', () => {
  const sales = TRAINING.visibleSteps(undefined, 'sales').map((s) => s.key);
  const design = TRAINING.visibleSteps(undefined, 'design').map((s) => s.key);
  for (const path of [sales, design]) assert.strictEqual(path[path.length - 1], TRAINING.READY_KEY);
  for (const k of ['do:message', 'signoff:handoff']) assert.ok(sales.includes(k) && design.includes(k), k);
  for (const k of ['do:lead', 'do:prospects', 'quiz:sales-s1', 'lesson:s8-prospect']) assert.ok(!design.includes(k), `designer is not asked to ${k}`);
  for (const k of ['do:proof', 'read:cos', 'read:blog', 'quiz:design', 'signoff:art']) assert.ok(design.includes(k) && !sales.includes(k), k);
  assert.match(TRAINING.visibleSteps(undefined, 'design').find((s) => s.key === TRAINING.READY_KEY).title, /proofs/);
  assert.strictEqual(TRAINING.trackOf('nope'), 'sales');
  assert.strictEqual(TRAINING.trackOf('__proto__'), 'sales');
  assert.strictEqual(TRAINING.mayTick('read:blog', false, undefined, 'sales'), false, 'a step off your path cannot be ticked');
  assert.strictEqual(TRAINING.mayTick('read:blog', false, undefined, 'design'), true);
  // The routes pass the helper's own path, never one from the form.
  assert.match(route("app.post('/admin/training/read', requireAdmin"), /stepByKey\(key, undefined, actor\.track, actor\.role\)/);
  assert.match(route("app.post('/admin/training/signoff', requireAdmin"), /await pathFor\(staffId\)/);
});

test('every artwork quiz question points at a real article, and its answers are valid', () => {
  const seeded = new Set([...src.matchAll(/^\s+\{ kind: '[a-z]+'.*?title: '((?:[^'\\]|\\.)+)'/gm)].map((m) => m[1].replace(/\\'/g, "'")));
  const z = TRAINING.QUIZZES.design;
  assert.ok(z.questions.length >= 8 && z.pass <= z.questions.length);
  for (const x of z.questions) {
    assert.ok(seeded.has(x.article), `${x.id}: no article "${x.article}"`);
    assert.ok(x.answer >= 0 && x.answer < x.choices.length, x.id);
  }
});

test('proofs: our cloud, the proofs folder, a picture or PDF only; uploads signed behind sign-in', () => {
  const P = require('../tools/lib/job-proofs');
  const ok = 'https://res.cloudinary.com/jtees/image/upload/v1759430000/job_proofs/abc_DEF-123.png';
  assert.ok(P.proofUrlOk(ok, 'jtees'));
  assert.ok(P.proofUrlOk(ok.replace('.png', '.pdf'), 'jtees'));
  for (const bad of [ok.replace('/jtees/', '/other/'), ok.replace('job_proofs', 'quote_photos'), ok.replace('.png', '.svg'),
    ok.replace('.png', '.html'), ok.replace('/image/', '/raw/'), ok.replace('https://', 'http://'), ok + '?x=1',
    'https://res.cloudinary.com/jtees/image/upload/c_fill,w_9/job_proofs/a.png', 'javascript:alert(1)', ok.repeat(5)]) {
    assert.ok(!P.proofUrlOk(bad, 'jtees'), bad.slice(0, 80));
  }
  assert.ok(!P.proofUrlOk(ok, ''), 'no cloud configured accepts nothing');
  assert.match(P.thumbOf(ok.replace('.png', '.pdf'), 'jtees'), /pg_1\/.*\.jpg$/);
  assert.match(P.proofMessage({ first: 'Ada', code: 'AB12CD', url: ok }), /^Hi Ada! Your proof for order AB12CD is ready, and we're excited for you to see it: https:/);

  assert.strictEqual(STAFF.ROUTES['POST /admin/api/proof-signature'], 'proofs.upload');
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/proofs'], 'proofs.upload');
  const sig = route("app.post('/admin/api/proof-signature', requireAdmin");
  assert.match(sig, /api_sign_request\(\{ folder: PROOFS\.FOLDER, timestamp \}, apiSecret\)/, 'signs only the server\'s folder and time');
  assert.doesNotMatch(sig, /req\.body/, 'nothing the caller sends is signed');
  const add = route("app.post('/admin/quote/:code/proofs', requireAdmin");
  assert.match(add, /PROOFS\.proofUrlOk\(url, QPHOTOS\.cloudName\(\)\)/);
  assert.match(add, /< \$5/, 'a job holds a bounded number of proofs');
  const card = src.slice(src.indexOf('async function jobProofsCard('), src.indexOf('\n}\n', src.indexOf('async function jobProofsCard(')));
  assert.match(card, /escEmail\(r\.name \|\| 'Proof'\)/);
  assert.match(card, /escEmail\(r\.url\)/);
  // A trainee's proof message is held like any other message: same route, same gate.
  assert.match(card, /\?proof=\$\{r\.id\}#messages/);
  assert.match(src, /await markProofsSent\(a\.subject_id, p\.text\);/, 'held proofs are marked sent only when the owner sends them');
  assert.ok(STAFF.PRESETS.design.perms['customers.message'] === 'approval' && STAFF.PRESETS.design.perms['proofs.upload'] === 'on');
  assert.ok(!STAFF.PRESETS.design.perms['quotes.send'], 'a designer in training does not send quotes');
});
