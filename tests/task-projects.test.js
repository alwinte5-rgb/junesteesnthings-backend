'use strict';

/* Projects (tools/lib/task-projects.js and their routes in server.js): a
 * campaign split into steps of about two hours, opened one at a time, drawn
 * on a timeline, carrying the same campaign rules every season.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const P = require('../tools/lib/task-projects');
const CAL = require('../tools/lib/marketing-calendar');
const FLOW = require('../tools/lib/task-flow');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}
const season = (id, y) => CAL.datesFor(CAL.OCCASIONS.find((o) => o.id === id), y);
const now = new Date(Date.UTC(2026, 9, 22, 18));

test('work days skip the weekend', () => {
  assert.strictEqual(P.workdayOnOrAfter('2026-10-24'), '2026-10-26', 'Saturday moves to Monday');
  assert.strictEqual(P.addWorkDays('2026-10-23', 1), '2026-10-26', 'Friday + 1 is Monday');
  assert.strictEqual(P.addWorkDays('2026-10-23', 5), '2026-10-30');
  assert.strictEqual(P.addWorkDays('nope', 1), null);
});

test('Christmas 2026 is the written-out project, dated from Oct 23 to Oct 30', () => {
  const p = P.seasonProject(season('christmas', 2026), { now, longDate: CAL.longDate });
  assert.strictEqual(p.title, 'Christmas 2026: Print the Magic of Christmas');
  assert.strictEqual(p.auto_ref, 'mcal:christmas:2026');
  assert.strictEqual(p.key_date, '2026-11-24', 'the shop is closed Nov 25 to 27');
  assert.deepStrictEqual(p.steps.map((s) => s.due_on),
    ['2026-10-23', '2026-10-26', '2026-10-27', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  assert.deepStrictEqual(p.steps.map((s) => s.step_no), [1, 2, 3, 4, 5, 6, 7]);
  for (const s of p.steps) {
    const b = FLOW.shapeBrief(s.brief);
    assert.ok(b.proof_required, `${s.title}: files are proof`);
    assert.match(b.time, /2 hours/, `${s.title}: about two hours`);
    assert.ok(b.done.includes(P.RULES_DONE), `${s.title}: checked against the campaign rules`);
  }
});

test('a preset whose first day has passed starts on the next work day instead', () => {
  const later = new Date(Date.UTC(2026, 9, 28, 18));
  const p = P.seasonProject(season('christmas', 2026), { now: later, longDate: CAL.longDate });
  assert.strictEqual(p.steps[0].due_on, '2026-10-29');
});

test('every other season gets the same seven steps, named for it, from the next work day', () => {
  const e = season('valentines', 2027);
  const p = P.seasonProject(e, { now, longDate: CAL.longDate });
  assert.strictEqual(p.title, "Valentine's Day 2027 campaign");
  assert.strictEqual(p.steps.length, 7);
  assert.strictEqual(p.steps[0].due_on, '2026-10-23');
  assert.strictEqual(p.key_date, CAL.ymd(e.orderBy));
  assert.match(p.steps[0].description, new RegExp(e.push.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.strictEqual(P.seasonProject(season('halloween', 2026), { now, longDate: CAL.longDate }), null, 'orders already closed');
});

test('no step anywhere offers a product we do not sell', () => {
  const all = [P.CHRISTMAS_2026.steps, P.seasonSteps(season('valentines', 2027), { longDate: CAL.longDate })].flat();
  for (const s of all) {
    const words = JSON.stringify(s);
    assert.doesNotMatch(words, /gift wrap|wrapping paper|greeting card|holiday card/i, s.title);
  }
  assert.ok(P.RULES.some((g) => g.items.some((x) => /No gift wrap, no holiday cards/.test(x))));
});

test('steps open one at a time', () => {
  const steps = [{ id: 3, step_no: 3 }, { id: 1, step_no: 1, done_at: new Date() }, { id: 2, step_no: 2 }];
  assert.deepStrictEqual(P.stepStates(steps).map((s) => [s.id, s.state]), [[1, 'done'], [2, 'current'], [3, 'locked']]);
  assert.ok(P.canStart(steps, 2));
  assert.ok(!P.canStart(steps, 3), 'the next one waits');
  assert.ok(!P.canStart(steps, 1), 'a completed one is not started again');
  assert.ok(!P.canStart(steps, 99));
});

test('a step edit needs a title and dates in order', () => {
  assert.deepStrictEqual(P.shapeStepEdit({ title: '  Hero  ', starts_on: '2026-10-26', due_on: '2026-10-27' }),
    { ok: true, step: { title: 'Hero', starts_on: '2026-10-26', due_on: '2026-10-27' } });
  assert.match(P.shapeStepEdit({ title: '', starts_on: '2026-10-26', due_on: '2026-10-27' }).error, /title/);
  assert.match(P.shapeStepEdit({ title: 'x', starts_on: '2026-10-27', due_on: '2026-10-26' }).error, /before/);
  assert.match(P.shapeStepEdit({ title: 'x', starts_on: '26/10', due_on: '2026-10-26' }).error, /date/);
});

test('the timeline escapes every word and marks today and the key date', () => {
  const p = { id: 1, title: '<b>x</b>', key_date: '2026-11-24', key_label: 'Last day <to> order' };
  const steps = [{ id: 1, step_no: 1, title: '<script>', starts_on: '2026-10-23', due_on: '2026-10-23', done_at: new Date() },
    { id: 2, step_no: 2, title: 'Hero', starts_on: '2026-10-26', due_on: '2026-10-26' }];
  const svg = P.timelineSvg(p, steps, { today: '2026-10-26' });
  assert.doesNotMatch(svg, /<script>|<b>x/);
  assert.match(svg, /&lt;script&gt;/);
  assert.match(svg, /Today/);
  assert.match(svg, /Last day &lt;to&gt; order: Tue Nov 24 →/, 'a deadline weeks away is named at the edge');
  assert.match(svg, /href="#step-2"/);
  assert.strictEqual(P.timelineSvg(p, [], { today: '2026-10-26' }), '');
});

test('helpers open only their own project; everything that changes one is the owner\'s', () => {
  for (const r of ['GET /admin/projects', 'GET /admin/projects/:id', 'GET /admin/projects/:id/file/:n']) assert.strictEqual(STAFF.ROUTES[r], 'any', r);
  for (const r of ['POST /admin/projects', 'POST /admin/projects/:id/steps', 'POST /admin/projects/:id/steps/:taskId',
    'POST /admin/projects/:id/files', 'POST /admin/projects/:id/archive', 'POST /admin/projects/:id/guide']) {
    assert.strictEqual(STAFF.ROUTES[r], 'owner', r);
  }
  assert.match(src, /return !!p && \(!actor \|\| actor\.kind !== 'staff' \|\| p\.assigned_to === actor\.id\);/);
  assert.match(route("app.get('/admin/projects/:id', requireAdmin"), /const p = await projectFor\(req, res\);/);
  assert.match(route("app.get('/admin/projects/:id/file/:n', requireAdmin"), /const p = await projectFor\(req, res\);/);
  assert.match(route("app.get('/admin/projects', requireAdmin"), /assigned_to = \$1/);
});

test('a later step cannot be started early, and lists show only the step now', () => {
  assert.match(route("app.post('/admin/tasks/:id/start', requireAdmin"), /if \(!PROJECTS\.canStart\(steps, id\)\)/);
  assert.match(route("app.get('/admin/my-day', requireAdmin"), /AND \$\{TASK_STEP_NOW\}/);
  assert.match(route("app.get('/admin/tasks', requireAdmin"), /AND \$\{TASK_STEP_NOW\}/);
  assert.match(route("app.get('/admin/dashboard', requireAdmin"), /AND \$\{TASK_STEP_NOW\}/);
});

test('a project is saved whole or not at all, once per season', () => {
  const at = src.indexOf('async function saveProject(');
  const body = src.slice(at, src.indexOf('\n}\n', at));
  assert.match(body, /ON CONFLICT \(auto_ref\) DO NOTHING RETURNING id/);
  assert.match(body, /await client\.query\('BEGIN'\)/);
  assert.match(body, /await client\.query\('ROLLBACK'\)/);
});

test('files: only uploads to the task folder, at most 30, downloaded through the signed link', () => {
  assert.match(route("app.post('/admin/projects/:id/files', requireAdmin"), /CHATFILES\.pickTaskFiles\(/);
  assert.match(route("app.post('/admin/projects/:id/files', requireAdmin"), /jsonb_array_length\(files\) \+ \$3 <= \$4/);
  assert.match(route("app.get('/admin/projects/:id/file/:n', requireAdmin"), /CHATFILES\.downloadSource\(f\.url, QPHOTOS\.cloudName\(\), CHATFILES\.TASK_FOLDER\)/);
  assert.match(route("app.post('/admin/projects/:id/guide', requireAdmin"), /\^https:/);
});
