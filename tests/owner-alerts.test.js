'use strict';

/* What needs the owner (tools/lib/owner-alerts.js): the one list the home
 * dashboard, the bell and the menu badges are made from (owner, 2026-11-18:
 * "I don't want to look for things"). Hours, training, team, art and
 * customers, each a row with a stable ref so the bell keeps one notification
 * per thing and clears it once the thing is dealt with.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../tools/lib/owner-alerts');
const NOTIFY = require('../tools/lib/notifications');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const staff = { id: 7, name: 'Myra' };
const H = 3600000;
const NOW = Date.parse('2026-11-18T18:00:00Z'); // Wednesday noon in Chicago
const week = (over = {}) => ({ week: '2026-11-09', shifts: [], flags: [], minutes: 0, timeproofMinutes: 60, hours: [], approval: null, ...over });
const refs = (rows) => rows.map((r) => r.ref);

test('every row kind is a bell kind the owner gets, and none of them emails by default', () => {
  for (const k of ['art', 'hours', 'training', 'team', 'customer']) {
    assert.ok(NOTIFY.kindsFor('owner').includes(k), k);
    assert.equal(NOTIFY.emailOn(k, {}), false, k);
  }
  // "I don't need an email for approvals": library approvals too, unless turned on.
  assert.equal(NOTIFY.emailOn('library', {}), false);
  assert.equal(NOTIFY.emailOn('library', { library: true }), true);
});

test('forgot to clock out: a shift still running past 10 hours or past midnight', () => {
  const running = (startedAgoH, id = 1) => ({ id, started_at: new Date(NOW - startedAgoH * H).toISOString(), ended_at: null });
  const fresh = A.hoursAlerts({ staff, thisWeek: week({ week: '2026-11-16', shifts: [running(2)] }), now: NOW });
  assert.deepEqual(fresh, []);
  const long = A.hoursAlerts({ staff, thisWeek: week({ week: '2026-11-16', shifts: [running(11, 5)] }), now: NOW });
  assert.deepEqual(refs(long), ['open:5']);
  assert.match(long[0].title, /Myra may have forgotten to clock out/);
  assert.equal(long[0].href, '/admin/timeclock?staff=7&week=2026-11-16');
  const overnight = A.hoursAlerts({ staff, thisWeek: week({ week: '2026-11-16', shifts: [running(14, 6)] }), now: NOW });
  assert.match(overnight[0].sub, /past midnight/);
});

test('last week: not approved, approval out of date, TimeProof missing', () => {
  const done = { id: 1, started_at: '2026-11-10T14:00:00Z', ended_at: '2026-11-10T20:00:00Z' };
  const notApproved = A.hoursAlerts({ staff, lastWeek: week({ shifts: [done], minutes: 360 }), now: NOW });
  assert.deepEqual(refs(notApproved), ['approve:7:2026-11-09']);
  assert.match(notApproved[0].title, /need approving/);

  const approved = week({ shifts: [done], minutes: 360, approval: { business: 'jtees', hours: 6 }, hours: [{ business: 'jtees', hours: 6 }] });
  assert.equal(A.weekApproved(approved), true);
  assert.deepEqual(A.hoursAlerts({ staff, lastWeek: approved, now: NOW }), []);

  const moved = { ...approved, minutes: 420 };
  assert.equal(A.weekApproved(moved), false);
  assert.match(A.hoursAlerts({ staff, lastWeek: moved, now: NOW })[0].title, /changed after you approved/);

  const noTp = A.hoursAlerts({ staff, lastWeek: { ...approved, timeproofMinutes: null }, now: NOW });
  assert.deepEqual(refs(noTp), ['tp-missing:7:2026-11-09']);
  // A week with no shifts asks for nothing.
  assert.deepEqual(A.hoursAlerts({ staff, lastWeek: week({ timeproofMinutes: null }), now: NOW }), []);
});

test('TimeProof off, idle and off-clock: one counted row each, dropped once the week is approved', () => {
  const flags = [
    { kind: 'idle', text: '45m on the clock with no activity' },
    { kind: 'idle', text: '1h 10m on the clock with no activity' },
    { kind: 'off-clock', text: '20m of work on 2026-11-17 while clocked out' },
    { kind: 'timeproof', text: 'The clock says 6h, TimeProof says 4h' },
    { kind: 'new-ip', text: 'ignored' },
  ];
  const rows = A.hoursAlerts({ staff, thisWeek: week({ week: '2026-11-16', flags }), now: NOW });
  assert.deepEqual(refs(rows), ['tp-diff:7:2026-11-16', 'idle:7:2026-11-16', 'offclock:7:2026-11-16']);
  assert.match(rows[1].sub, /2 gaps .* 1h 55m in all/);
  const done = { id: 1, started_at: '2026-11-10T14:00:00Z', ended_at: '2026-11-10T20:00:00Z' };
  const approvedLast = week({ shifts: [done], minutes: 360, flags, approval: { business: 'jtees', hours: 6 }, hours: [{ business: 'jtees', hours: 6 }] });
  assert.deepEqual(A.hoursAlerts({ staff, lastWeek: approvedLast, now: NOW }), []);
});

test('older weeks never approved are listed one each', () => {
  const rows = A.hoursAlerts({ staff, unapproved: ['2026-10-26', '2026-11-02'], now: NOW });
  assert.deepEqual(refs(rows), ['approve:7:2026-10-26', 'approve:7:2026-11-02']);
});

test('training: a sign-off due from the owner, and a helper finished but not moved up', () => {
  const progress = { steps: [
    { key: 'signoff:a', type: 'signoff', title: 'First call', done: true, locked: false },
    { key: 'signoff:b', type: 'signoff', title: 'Sends a quote', done: false, locked: false },
    { key: 'signoff:c', type: 'signoff', title: 'Later', done: false, locked: true },
    { key: 'lesson:x', type: 'lesson', title: 'Read', done: false, locked: false },
  ] };
  const rows = A.trainingAlerts({ staff, progress });
  assert.deepEqual(refs(rows), ['signoff:7:signoff:b']);
  assert.equal(rows[0].sub, 'Sends a quote');
  assert.equal(rows[0].href, '/admin/training?staff=7');
  const up = A.trainingAlerts({ staff, progress: { steps: [] }, readyDone: true, nextPreset: 'supervised', nextLabel: 'Supervised' });
  assert.deepEqual(refs(up), ['moveup:7:supervised']);
  assert.match(up[0].sub, /Supervised/);
  assert.deepEqual(A.trainingAlerts({ staff, progress: { steps: [] }, readyDone: false, nextPreset: 'supervised' }), []);
});

test('tasks: overdue, or handed out and not started after two days; daily dates use the shop day', () => {
  const tasks = [
    { id: 1, title: 'Call Ann', due_on: '2026-11-17', assigned_to: 7, started_at: null, created_at: '2026-11-17T12:00:00Z' },
    { id: 2, title: 'Fresh', due_on: null, assigned_to: 7, started_at: null, created_at: new Date(NOW - 1 * 86400000).toISOString() },
    { id: 3, title: 'Stale', due_on: null, assigned_to: 7, started_at: null, created_at: new Date(NOW - 3 * 86400000).toISOString() },
    { id: 4, title: 'Started', due_on: null, assigned_to: 7, started_at: '2026-11-15T12:00:00Z', created_at: '2026-11-10T12:00:00Z' },
    { id: 5, title: 'Due today', due_on: new Date('2026-11-18T00:00:00Z'), assigned_to: null, started_at: null, created_at: '2026-11-01T12:00:00Z' },
  ];
  const rows = A.taskAlerts(tasks, [staff], { today: '2026-11-18', now: NOW });
  assert.deepEqual(refs(rows), ['task-late:1', 'task-idle:3']);
  assert.match(rows[1].sub, /given to Myra 3 days ago/);
});

test('art and library: art to approve keeps the bell ref it always had, so no duplicate after deploy', () => {
  const at = '2026-11-18T15:00:00Z';
  const rows = A.artAlerts({ submitted: [{ quote_code: 'AB12', updated_at: at }],
    questions: [{ quote_code: 'CD34', updated_at: at, name: 'Lee' }],
    library: [{ kind: 'readymade', id: 9, name: 'Mom Life', submitted_by: 'Kim' }] });
  assert.deepEqual(rows.map((r) => [r.kind, r.ref, r.group]), [
    ['approval', `art:AB12:${Date.parse(at)}`, 'approvals'],
    ['art', `art-q:CD34:${Date.parse(at)}`, 'approvals'],
    ['library', 'poll:readymade-9', 'approvals']]);
  assert.equal(rows[2].href, '/admin/design-library?item=readymade-9');
});

test('customers: replies, proofs, notes, changes and chargebacks each have their own ref', () => {
  const rows = A.customerAlerts({
    replies: [{ code: 'AB12', name: 'Ann', last_in: '2026-11-18T10:00:00Z', body: 'hi' }],
    proofOk: [{ code: 'AB12', name: 'Ann', proof_ok_at: '2026-11-18T11:00:00Z' }],
    proofChanges: [{ id: 4, quote_code: 'AB12', name: 'Ann', body: 'Proof changes requested on the quote page: bigger logo' }],
    notes: [{ id: 5, quote_code: 'AB12', name: 'Ann', body: 'Need by Friday' }],
    changes: [{ code: 'AB12', name: 'Ann', change_request: 'size L' }],
    disputes: [{ id: 6, quote_code: null }] });
  assert.deepEqual(refs(rows).map((r) => r.split(':')[0]), ['reply', 'proof-ok', 'proof-chg', 'cnote', 'change', 'dispute']);
  assert.equal(rows[2].sub, '"bigger logo"');
  assert.ok(rows.every((r) => r.kind === 'customer' && r.group === 'customers'));
});

test('notes and follow-ups name who sent them', () => {
  const rows = A.noteAlerts([{ id: 3, quote_code: 'AB12', author: 'staff:7', body: 'Customer wants blue' }],
    [{ id: 2, title: 'Call the school back', quote_code: null }], [staff]);
  assert.deepEqual(refs(rows), ['note:3', 'followup:2']);
  assert.match(rows[0].title, /^Myra left you a note on AB12/);
});

test('badge counts and dashboard groups come from the same rows', () => {
  const rows = [
    { group: 'hours', ref: 'a' }, { group: 'hours', ref: 'b' }, { group: 'training', ref: 'c' },
    { group: 'team', ref: 'd' }, { group: 'approvals', ref: 'e' }, { group: 'nope', ref: 'f' }];
  assert.deepEqual(A.counts(rows), { hours: 2, training: 1, team: 1 });
  assert.deepEqual(Object.keys(A.byGroup(rows)), A.GROUP_KEYS);
});

test('server: every source is read on its own and the bell clears a kind only when its sources were read', () => {
  assert.match(SRC, /async function readOwnerAlerts\(\)/);
  for (const name of ['hours', 'training', 'agreements', 'tasks', 'job notes', 'art', 'design library', 'customers']) {
    assert.ok(SRC.includes(`part('${name}'`), name);
  }
  assert.match(SRC, /if \(sources\.some\(\(s\) => alerts\.failed\.includes\(s\)\)\) continue;/);
  // Staff approvals no longer wait on the art read.
  assert.ok(!SRC.includes('if (appr && art)'));
  // A failing sweep part reaches the error digest.
  assert.match(SRC, /reportError\('notifications', e, `notification part: \$\{name\}`\)/);
  // Menu badges for Hours, Training and Team.
  for (const b of ["badge: 'hours'", "badge: 'training'", "badge: 'team'"]) assert.ok(SRC.includes(b), b);
});
