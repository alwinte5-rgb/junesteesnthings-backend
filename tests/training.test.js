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
  for (const s of TRAINING.STEPS) assert.ok(['read', 'do', 'signoff'].includes(s.type), s.key);
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
  assert.ok(later.some((s) => s.key === 'do:eod') && later.some((s) => s.key === 'do:proof'));
  assert.ok(!TRAINING.mayTick('do:eod', true, new Set()), 'a hidden step cannot be ticked');
});

test('work steps tick themselves from real work, never from a stored tick', () => {
  const ticks = new Map([['do:quote', { done_at: new Date() }]]);
  const p = TRAINING.progress(ticks, { leads: 1, quotes: 0, messages: 0 });
  const by = Object.fromEntries(p.steps.map((s) => [s.key, s.done]));
  assert.strictEqual(by['do:lead'], true, 'a lead answered counts');
  assert.strictEqual(by['do:quote'], false, 'a stored tick does not stand in for a quote never built');
  assert.strictEqual(p.done, 1);
  assert.strictEqual(p.next.length, 3);
  assert.strictEqual(p.complete, false);
});

test('training is complete only when every visible step is done', () => {
  const ticks = new Map(TRAINING.visibleSteps().filter((s) => s.type !== 'do').map((s) => [s.key, { done_at: new Date() }]));
  assert.strictEqual(TRAINING.progress(ticks, { leads: 1, quotes: 1, messages: 0 }).complete, false);
  const p = TRAINING.progress(ticks, { leads: 1, quotes: 1, messages: 2 });
  assert.strictEqual(p.complete, true);
  assert.strictEqual(p.done, p.total);
});

test('a helper ticks their reading; only the owner signs off; nobody ticks work by hand', () => {
  assert.strictEqual(TRAINING.mayTick('read:never', false), true);
  assert.strictEqual(TRAINING.mayTick('signoff:ready', false), false);
  assert.strictEqual(TRAINING.mayTick('signoff:ready', true), true);
  assert.strictEqual(TRAINING.mayTick('do:quote', true), false);
  assert.strictEqual(TRAINING.mayTick('read:nope', true), false);
  assert.strictEqual(TRAINING.mayTick('__proto__', true), false);
});

test('the routes enforce the same rules', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/signoff'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/tips-reset'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/feedback'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/training/read'], 'any');
  const read = route("app.post('/admin/training/read', requireAdmin");
  assert.match(read, /if \(!actor \|\| actor\.kind !== 'staff'\)/, 'the owner has no reading to tick');
  assert.match(read, /s\.type !== 'read'/, 'a sign-off cannot be smuggled through the reading form');
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
  assert.match(fn, /\$\{escEmail\(tip\)\}/);
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
