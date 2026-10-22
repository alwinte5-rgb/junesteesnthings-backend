'use strict';

/* The back-office tour (tools/lib/tour.js, its routes and My Day card). */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const TOUR = require('../tools/lib/tour');
const STAFF = require('../tools/lib/staff');
const TRAINING = require('../tools/lib/training');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('a helper sees only the stops their permissions open', () => {
  const none = TOUR.stopsFor(() => false).map((s) => s.key);
  assert.ok(!none.includes('leads') && !none.includes('design') && !none.includes('schedule'));
  assert.ok(['myday', 'clock', 'tasks', 'projects', 'bell', 'chat', 'mailbox', 'playbook', 'mystats'].every((k) => none.includes(k)));
  assert.ok(TOUR.stopsFor((p) => p === 'jobs.design').some((s) => s.key === 'design'));
});

test('a stop is done when opened, or by itself once the work is real', () => {
  const stops = TOUR.stopsFor(() => false);
  const p0 = TOUR.progress(stops, new Set(), {});
  assert.strictEqual(p0.done, 0);
  assert.strictEqual(p0.next.key, 'myday');
  const p1 = TOUR.progress(stops, new Set(['tour:myday']), { clocked: true, taskDone: true, chatted: false });
  assert.strictEqual(p1.done, 3);
  assert.strictEqual(p1.next.key, 'projects');
  const all = TOUR.progress(stops, new Set(stops.map((s) => TOUR.stepKey(s.key))), {});
  assert.ok(all.finished && !all.next);
  assert.ok(!TOUR.progress([], new Set(), {}).finished, 'no stops is not finished');
});

test('every stop points at a screen the helper can open, and each key is unique', () => {
  const keys = TOUR.STOPS.map((s) => s.key);
  assert.strictEqual(new Set(keys).size, keys.length);
  for (const s of TOUR.STOPS) {
    const route = `GET ${s.href.split(/[?#]/)[0]}`;
    assert.ok(STAFF.ROUTES[route], `${s.key}: ${route} is a known page`);
    if (s.needs) assert.ok(STAFF.PERMISSIONS[s.needs], `${s.key}: ${s.needs} is a permission`);
  }
});

test('the tour is any helper\'s, ticks only their own row, and opens only a known stop', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/tour'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/tour/:key'], 'any');
  const at = src.indexOf("app.post('/admin/tour/:key', requireAdmin");
  const r = src.slice(at, src.indexOf('\n});', at));
  assert.match(r, /const stop = TOUR\.byKey\(/);
  assert.match(r, /if \(!stop\) return res\.redirect\('\/admin\/tour'\);/);
  assert.match(r, /\[actor\.id, TOUR\.stepKey\(stop\.key\)\]/);
  assert.match(r, /!stop\.needs \|\| STAFF\.levelOf\(actor, stop\.needs\) !== 'off'/, 'a stop whose screen they cannot open is not ticked (run-tour.cjs checks it live)');
  assert.match(r, /return res\.redirect\(stop\.href\);/, 'only ever to a stop\'s own fixed screen');
});

test('restarting training keeps the tour', () => {
  assert.strictEqual((src.match(/step_key NOT LIKE 'tour:%'/g) || []).length, 2, 'neither archived nor deleted');
});

test('page tips cover the screens helpers use every day', () => {
  for (const k of ['mailbox', 'notifications', 'clock', 'mystats', 'design', 'schedule']) assert.ok(TRAINING.PAGE_TIPS[k], k);
});
