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
  assert.ok(keys.includes('signoff:ready'), 'the software ready sign-off already earned is kept');
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
  assert.equal(T.readyKeyFor('design-marketing'), 'signoff:ready', 'nobody already on it loses ready or pay');
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
  assert.match(SRC, /name="apply_preset" value="1" checked/);
  assert.match(SRC, /const presetName = b\.apply_preset === '1' \? STAFF\.presetForTrack\(track\) : null;/);
  assert.match(SRC, /UPDATE staff SET training_track = \$2, perms = \$3 WHERE id = \$1/);
  assert.equal(STAFF.presetForTrack('sales-software'), 'dual-sales');
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
