'use strict';

/* Combined training paths run their duties side by side (owner, 2026-11-18:
 * Myra's role now covers June's Tees sales as well as COS software sales, and
 * she trains "side by side"). Each duty is a part: one part's exam never
 * holds the other shut, the apparel half ends in its own sign-off that starts
 * apparel commission, and both combined paths move up to a trained preset.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../tools/lib/training');
const COURSES = require('../tools/lib/courses');
const STAFF = require('../tools/lib/staff');
const { NEXT_PRESET, TRACKS } = require('../tools/lib/tracks');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const gateOf = (steps, pred) => steps.find((s) => s.gate && pred(s));
const passAll = (steps, pred) => Object.fromEntries(steps.filter((s) => s.gate && s.type === 'quiz' && pred(s)).map((s) => [s.quiz, 1]));
const examsAll = (steps, pred) => Object.fromEntries(steps.filter((s) => s.type === 'exam' && pred(s)).map((s) => [s.exam, 1]));
const lessonsDone = (steps, pred) => new Map(steps.filter((s) => s.type === 'lesson' && pred(s)).map((s) => [s.key, { done_at: new Date() }]));

test('June\'s Tees + COS: once Team basics is passed, both halves open at once', () => {
  const steps = T.visibleSteps(undefined, 'sales-software');
  const team = gateOf(steps, (s) => !s.part);
  const p = T.progress(new Map(), { quizzes: { [team.quiz]: 1 } }, undefined, 'sales-software');
  const firstOpen = (part) => p.steps.find((s) => s.part === part && s.type === 'lesson' && !s.locked);
  assert.ok(firstOpen('sales'), 'a sales lesson is open');
  assert.ok(firstOpen('software'), 'a software lesson is open');
  // Fresh, before Team basics: neither half is open yet.
  const fresh = T.progress(new Map(), {}, undefined, 'sales-software');
  assert.ok(fresh.steps.filter((s) => s.part).every((s) => s.locked));
});

test('one half\'s unpassed quiz never locks the other half', () => {
  const steps = T.visibleSteps(undefined, 'sales-software');
  // Every software gate passed, no sales gate past the first: software runs to its end.
  const quizzes = { ...passAll(steps, (s) => !s.part || s.part === 'software') };
  const p = T.progress(new Map(), { quizzes }, undefined, 'sales-software');
  const sw = p.steps.filter((s) => s.part === 'software' && s.type === 'lesson');
  assert.ok(sw.every((s) => !s.locked), 'every software lesson is open');
  const sales = p.steps.filter((s) => s.part === 'sales' && s.type === 'lesson');
  assert.ok(sales.some((s) => s.locked), 'later sales lessons still wait for their own quizzes');
  assert.ok(!sales[0].locked, 'the first sales lesson is open');
});

test('the apparel half ends in its own sign-off, and that is the path\'s ready key', () => {
  assert.equal(T.readyKeyFor('sales-software'), 'signoff:apparel-ready');
  assert.equal(TRACKS['sales-software'].ready, 'signoff:apparel-ready');
  const steps = T.visibleSteps(undefined, 'sales-software');
  const keys = steps.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length, 'no step key twice');
  assert.ok(keys.includes('signoff:software-ready'), 'the software ready sign-off already earned is kept');
  assert.ok(!keys.includes('signoff:ready'), 'and the Sales ready is not on it (#569): that would show the software half signed');
  const ar = steps.find((s) => s.key === 'signoff:apparel-ready');
  assert.equal(ar.part, 'sales');
  // It waits for the sales assessment and the sales lessons, never the software ones.
  const all = passAll(steps, () => true);
  const salesAssessment = steps.find((s) => s.gate && s.part === 'sales' && /assessment/.test(s.module));
  delete all[salesAssessment.quiz];
  const exams = examsAll(steps, () => true);
  let p = T.progress(lessonsDone(steps, (s) => s.part !== 'software'), { quizzes: all, exams }, undefined, 'sales-software');
  let row = p.steps.find((s) => s.key === 'signoff:apparel-ready');
  assert.ok(row.locked && /practical assessment/.test(row.waiting), row.waiting);
  p = T.progress(lessonsDone(steps, (s) => s.part !== 'software'), { quizzes: passAll(steps, () => true), exams }, undefined, 'sales-software');
  row = p.steps.find((s) => s.key === 'signoff:apparel-ready');
  assert.ok(!row.locked, `open once the apparel half is done, software lessons or not: ${row.waiting}`);
  // The owner signs it, not the helper.
  assert.equal(T.mayTick('signoff:apparel-ready', true, undefined, 'sales-software'), true);
  assert.equal(T.mayTick('signoff:apparel-ready', false, undefined, 'sales-software'), false);
});

test('Design + Marketing keeps its ready key, adds a design sign-off, and leaves editing to the video editor', () => {
  assert.equal(T.readyKeyFor('design-marketing'), 'signoff:marketing-ready', 'its own key (#569); those already signed were given it once');
  const steps = T.visibleSteps(undefined, 'design-marketing');
  const keys = steps.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.includes('signoff:design-ready'));
  assert.ok(!keys.includes('lesson:c4-edit'), 'video editing is the editor\'s, not this role\'s');
  assert.deepEqual([...new Set(steps.map((s) => s.part).filter(Boolean))].sort(), ['content', 'design', 'sales']);
});

test('single-course paths lock exactly as before: in order', () => {
  for (const track of ['sales', 'design', 'software', 'content']) {
    const steps = T.visibleSteps(undefined, track);
    assert.ok(steps.every((s) => !s.part || track === 'x'), `${track} has no parts`);
    const p = T.progress(new Map(), {}, undefined, track);
    const mods = [...new Set(p.steps.map((s) => s.module))];
    const firstLockedModule = mods.findIndex((m) => p.steps.filter((s) => s.module === m).every((s) => s.locked || s.type === 'buffer'));
    assert.ok(firstLockedModule > 0, `${track}: the first module is open and a later one is shut`);
    assert.ok(mods.slice(firstLockedModule).every((m) => p.steps.filter((s) => s.module === m && s.type === 'lesson').every((s) => s.locked)),
      `${track}: everything after the first unpassed gate stays shut`);
  }
});

test('both combined paths move up to a trained preset once signed off', () => {
  assert.equal(NEXT_PRESET['dual-sales'], 'dual-sales-trained');
  assert.equal(NEXT_PRESET['design-marketing'], 'design-marketing-trained');
  const t = STAFF.presetPerms('dual-sales-trained');
  assert.deepEqual(t['software.leads'], STAFF.presetPerms('software')['software.leads'], 'keeps the software leads board');
  assert.deepEqual(t['quotes.send'], STAFF.presetPerms('supervised')['quotes.send'], 'apparel side becomes Supervised');
  assert.deepEqual(STAFF.presetPerms('design-marketing-trained')['customers.message'], STAFF.presetPerms('designer')['customers.message']);
  assert.deepEqual(STAFF.presetPerms('design-marketing-trained')['quotes.send'], STAFF.presetPerms('design-marketing')['quotes.send'], 'quotes still come to June');
  for (const n of ['dual-sales-trained', 'design-marketing-trained']) assert.equal(STAFF.presetMatching(STAFF.presetPerms(n)), n);
});

test('changing a helper\'s path also sets that path\'s permissions unless June unticks it', () => {
  assert.match(SRC, /name="apply_preset" value="1" checked/, 'the box is ticked by default');
  assert.match(SRC, /STAFF\.presetOnPathChange\(/, 'the Staff page save uses the one rule');
  assert.equal(STAFF.presetOnPathChange('design', 'sales-software', true), 'dual-sales', 'a new path sets its permissions');
  assert.equal(STAFF.presetOnPathChange('sales-software', 'sales-software', true), null, 'saving the same path never resets anyone');
  assert.equal(STAFF.presetOnPathChange('design', 'sales-software', false), null, 'unticked: permissions stay');
});

test('nobody already trained on June\'s Tees + COS loses ready or commission', () => {
  const rk = T.readyKeyFor('sales-software');
  // A software or design ready never ends training here by itself: a designer moved onto the path is not trained for apparel.
  assert.equal(T.endsTraining(rk, 'signoff:ready', '2026-11-01T00:00:00Z'), false);
  assert.equal(T.endsTraining(rk, 'signoff:apparel-ready', '2026-11-01T00:00:00Z'), true);
  // Other paths: unchanged (the old Sales ready from before role courses still counts).
  assert.equal(T.endsTraining('signoff:closer-ready', 'signoff:ready', '2026-10-01T00:00:00Z'), true);
  assert.equal(T.endsTraining('signoff:closer-ready', 'signoff:ready', '2026-10-20T00:00:00Z'), false);
  // Those already signed ready on the path are given the apparel sign-off once, at startup, with the same date and signer.
  const at = SRC.indexOf("'once:apparel-ready-from-ready'");
  assert.ok(at > 0, 'the one-time grant exists');
  const stmt = SRC.slice(SRC.lastIndexOf('WITH mark AS', at), SRC.indexOf('ON CONFLICT DO NOTHING`', at));
  assert.match(stmt, /RETURNING 1/, 'the marker decides, in the same statement, whether it runs');
  assert.match(stmt, /SELECT t\.staff_id, 'signoff:apparel-ready', t\.done_at, t\.signed_by/);
  assert.match(stmt, /training_track = 'sales-software' AND t\.step_key = 'signoff:ready'/);
  // A trained Sales helper moved onto the path keeps their apparel ready (the Sales course's ready is that sign-off).
  assert.deepEqual(T.carriedReady('sales', 'sales-software'), { from: 'signoff:ready', to: 'signoff:apparel-ready' });
  assert.equal(T.carriedReady('software', 'sales-software'), null, 'a software ready is not an apparel one');
  assert.equal(T.carriedReady('design', 'sales-software'), null);
  assert.equal(T.carriedReady('sales', 'design'), null);
  assert.match(SRC, /TRAINING\.carriedReady\(/, 'the Staff page path change uses it');
  // The Team page and the owner's alert read it the same way as the session.
  const steps = T.progress(new Map([['signoff:apparel-ready', { done_at: '2026-11-01T00:00:00Z' }]]), {}, undefined, 'sales-software').steps;
  assert.equal(T.readyGiven({ steps, readyKey: rk }), true);
  // The software ready says it no longer ends training on this path.
  assert.match(steps.find((s) => s.key === 'signoff:software-ready').hint, /not here/);
});

test('Design + Marketing is not trained until both halves are signed off', () => {
  const track = 'design-marketing';
  const steps = T.visibleSteps(undefined, track);
  const rk = T.readyKeyFor(track);
  const quizzes = passAll(steps, () => true);
  const exams = examsAll(steps, () => true);
  // Sales half finished, design lessons not read and no design sign-off: the final ready stays shut.
  let p = T.progress(lessonsDone(steps, (s) => s.part !== 'design'), { quizzes, exams }, undefined, track);
  let row = p.steps.find((s) => s.key === rk);
  assert.ok(row.locked && /lesson/.test(row.waiting) && /Design sign-off/.test(row.waiting), row.waiting);
  // Every lesson read, design sign-off still missing: shut, and it says why.
  p = T.progress(lessonsDone(steps, () => true), { quizzes, exams }, undefined, track);
  row = p.steps.find((s) => s.key === rk);
  assert.ok(row.locked && row.waiting === 'the Design sign-off', row.waiting);
  // Content quizzes unpassed: shut, even with everything else done.
  const ticks = lessonsDone(steps, () => true);
  ticks.set('signoff:design-ready', { done_at: new Date() });
  const noContent = Object.fromEntries(Object.entries(quizzes).filter(([k]) => !/^content/.test(k)));
  assert.ok(Object.keys(noContent).length < Object.keys(quizzes).length, 'the path has content quizzes');
  p = T.progress(ticks, { quizzes: noContent, exams }, undefined, track);
  row = p.steps.find((s) => s.key === rk);
  assert.ok(row.locked && /quiz/.test(row.waiting), row.waiting);
  // Design sign-off given and every quiz passed: open.
  p = T.progress(ticks, { quizzes, exams }, undefined, track);
  assert.ok(!p.steps.find((s) => s.key === rk).locked);
  // The design sign-off itself waits only for the design half.
  p = T.progress(lessonsDone(steps, (s) => s.part !== 'sales'), { quizzes, exams }, undefined, track);
  assert.ok(!p.steps.find((s) => s.key === 'signoff:design-ready').locked);
});

test('the Artwork workspace is taught in the design course', () => {
  const d8 = COURSES.COURSES['design-core'].modules.find((m) => m.key === 'd8');
  const l = d8.lessons.find((x) => x.id === 'd8-artwork');
  assert.ok(l && /Artwork workspace/.test(l.body));
  assert.ok(d8.quiz.questions.some((q) => q.article === l.article));
});

test('every back-office page a course sends people to exists', () => {
  const libs = fs.readdirSync(path.join(__dirname, '..', 'tools', 'lib')).filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(__dirname, '..', 'tools', 'lib', f), 'utf8'));
  const routes = new Set([SRC, ...libs].flatMap((src) => [...src.matchAll(/app\.(?:get|post)\(\[?'(\/admin[^']*)'(?:, '(\/admin[^']*)')?/g)]
    .flatMap((m) => [m[1], m[2]].filter(Boolean))));
  const known = (p) => routes.has(p) || [...routes].some((r) => r.includes(':') && new RegExp(`^${r.replace(/:[^/]+/g, '[^/]+')}$`).test(p));
  const missing = new Set();
  for (const c of Object.values(COURSES.COURSES)) {
    const text = JSON.stringify(c);
    for (const m of text.matchAll(/\/admin(?:\/[a-z0-9-]+)*/g)) {
      const p = m[0];
      if (p === '/admin/report') continue; // a made-up route in a developer quiz, on purpose
      if (!known(p)) missing.add(`${c.key}: ${p}`);
    }
  }
  assert.deepEqual([...missing], []);
});

test('each course ends at its own ready key, so a move between paths never borrows one (#569)', () => {
  const ends = (track, key) => T.endsTraining(T.readyKeyFor(track), key, '2026-11-15T00:00:00Z');
  const done = (track, key) => T.progress(new Map([[key, { done_at: '2026-11-15T00:00:00Z' }]]), {}, undefined, track)
    .steps.filter((s) => s.done).map((s) => s.key);
  // Design -> Design + Marketing: the design half is signed, the path is not finished.
  assert.equal(ends('design-marketing', 'signoff:design-ready'), false);
  assert.ok(done('design-marketing', 'signoff:design-ready').includes('signoff:design-ready'));
  // Sales -> Design + Marketing: the Sales ready alone does not finish it either.
  assert.equal(ends('design-marketing', 'signoff:ready'), false);
  // Sales -> June's Tees + COS: the Sales ready is not the software half signed.
  assert.deepEqual(done('sales-software', 'signoff:ready'), []);
  // Back to Sales, a trained helper keeps the Sales ready (carried, same date and signer).
  assert.deepEqual(T.carriedReady('sales-software', 'sales'), { from: 'signoff:apparel-ready', to: 'signoff:ready' });
  assert.deepEqual(T.carriedReady('design-marketing', 'sales'), { from: 'signoff:marketing-ready', to: 'signoff:ready' });
  assert.equal(T.carriedReady('sales', 'design-marketing'), null, 'Sales alone is not Design + Marketing');
  assert.equal(T.carriedReady('sales', 'sales'), null, 'no change, nothing carried');
  // Every path's ready key is one only its own course gives.
  const owner = {};
  for (const t of Object.keys(TRACKS)) if (!['sales-software', 'design-marketing'].includes(t)) {
    const k = T.readyKeyFor(t);
    assert.ok(!owner[k], `${t} and ${owner[k]} share ${k}`);
    owner[k] = t;
  }
});

test('the existing ready sign-offs move to their course\'s key once, at startup (#569)', () => {
  const at = SRC.indexOf("'once:ready-key-per-course'");
  assert.ok(at > 0, 'the one-time rename exists');
  const stmt = SRC.slice(SRC.lastIndexOf('WITH mark AS', at), SRC.indexOf('RETURNING (SELECT count(*) FROM copied)', at));
  assert.match(stmt, /ON CONFLICT DO NOTHING RETURNING 1\),\s*map AS \(SELECT \* FROM unnest\(\$1::text\[\], \$2::text\[\]\)/, 'the marker decides, and the keys are parameters');
  assert.match(stmt, /SELECT t\.staff_id, m\.key, t\.done_at, t\.signed_by/, 'same date and signer');
  assert.match(stmt, /m\.track <> 'design-marketing' AND t\.step_key = \$3 AND t\.done_at >= \$4::timestamptz/,
    'the Sales record on Design + Marketing, and a ready from before role courses, are kept');
  assert.ok(SRC.indexOf("'once:apparel-ready-from-ready'") < at, 'after the apparel grant, which reads the old key');
  for (const [t, k] of Object.entries(T.RENAMED_READY)) assert.equal(T.readyKeyFor(t) === k || t === 'sales-software', true, `${t}: ${k}`);
});
