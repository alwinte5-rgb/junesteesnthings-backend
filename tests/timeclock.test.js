'use strict';

/* The timeclock (tools/lib/timeclock.js): idle gaps, cut time, work while
 * clocked out, lesson time flags, TimeProof, long and overnight shifts, and
 * the routes it needs.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const C = require('../tools/lib/timeclock');
const STAFF = require('../tools/lib/staff');

const T = (hm, day = '2026-10-13') => new Date(`${day}T${hm}:00-05:00`); // Chicago (CDT)
const shift = (a, b, extra = {}) => ({ started_at: T(a), ended_at: b ? T(b) : null, ...extra });

test('idle gaps are 30 minutes or more with no activity, start and end included', () => {
  const sh = shift('09:00', '12:00');
  const pings = [T('09:05'), T('09:20'), T('10:10'), T('11:00')];
  const g = C.idleGaps(sh, pings);
  assert.deepStrictEqual(g.map((x) => x.minutes), [50, 50, 60]);
  assert.strictEqual(C.idleGaps(sh, [T('09:10'), T('09:35'), T('10:00'), T('10:25'), T('10:50'), T('11:15'), T('11:40')]).length, 0);
});

test('a shift counts its length less the minutes cut', () => {
  assert.strictEqual(C.shiftMinutes(shift('09:00', '12:00')), 180);
  assert.strictEqual(C.shiftMinutes(shift('09:00', '12:00', { cut_minutes: 50 })), 130);
  assert.strictEqual(C.shiftMinutes(shift('09:00', null), T('09:45').getTime()), 45);
});

test('work while clocked out is flagged once it reaches 5 minutes in a day', () => {
  const shifts = [shift('09:00', '10:00')];
  const pings = [T('09:30'), ...[0, 1, 2, 3, 4].map((m) => T(`20:0${m}`)), T('21:00', '2026-10-14')];
  assert.deepStrictEqual(C.offClock(shifts, pings), [{ day: '2026-10-13', minutes: 5 }]);
});

test('the Welcome lesson open over 2 hours is flagged; a skimmed lesson too', () => {
  const f = C.flags({ lessons: [
    { title: 'Welcome', expected: 30, started_at: T('02:12'), done_at: T('04:18') },
    { title: 'Quotes', expected: 25, started_at: T('05:00'), done_at: T('05:03') },
    { title: 'Short', expected: 5, started_at: T('06:00'), done_at: T('06:01') },
    { title: 'Normal', expected: 20, started_at: T('07:00'), done_at: T('07:22') }] });
  assert.deepStrictEqual(f.map((x) => x.kind), ['lesson-slow', 'lesson-fast']);
  assert.match(f[0].text, /"Welcome" open 2h 6m against 30m expected/);
});

test('TimeProof is compared with the clock after cuts, within 30 minutes', () => {
  const shifts = [shift('09:00', '17:00', { cut_minutes: 60 })]; // 7h
  assert.strictEqual(C.flags({ shifts, pings: [], timeproofMinutes: 420 }).filter((x) => x.kind === 'timeproof').length, 0);
  const f = C.flags({ shifts, pings: [], timeproofMinutes: 360 }).filter((x) => x.kind === 'timeproof');
  assert.strictEqual(f.length, 1);
  assert.match(f[0].text, /clock is 1h more/);
});

test('long, overnight and overlapping shifts and a new address are flagged', () => {
  const shifts = [
    { started_at: T('20:00'), ended_at: T('09:00', '2026-10-14'), start_ip: '1.1.1.1' },
    { started_at: T('08:00', '2026-10-14'), ended_at: T('10:00', '2026-10-14'), start_ip: '2.2.2.2' }];
  const kinds = C.flags({ shifts, pings: [], knownIps: ['1.1.1.1'] }).map((x) => x.kind);
  for (const k of ['long', 'overnight', 'overlap', 'new-ip']) assert.ok(kinds.includes(k), k);
  // The first address a helper ever uses is not "new".
  assert.ok(!C.flags({ shifts: [shifts[0]], pings: [] }).some((x) => x.kind === 'new-ip'));
});

test('datetime-local values are read on the shop clock', () => {
  assert.strictEqual(C.fromLocalInput('2026-10-13T09:30').toISOString(), '2026-10-13T14:30:00.000Z');
  assert.strictEqual(C.fromLocalInput('2026-01-13T09:30').toISOString(), '2026-01-13T15:30:00.000Z');
  assert.strictEqual(C.toLocalInput(new Date('2026-10-13T14:30:00Z')), '2026-10-13T09:30');
  assert.strictEqual(C.fromLocalInput('9:30'), null);
  assert.strictEqual(C.hoursOf(130), 2.17);
});

test('helpers reach only their own clock; reviewing and approving are the owner\'s', () => {
  for (const r of ['GET /admin/clock', 'POST /admin/clock/in', 'POST /admin/clock/out', 'POST /admin/clock/ping']) assert.strictEqual(STAFF.ROUTES[r], 'any', r);
  for (const r of ['GET /admin/timeclock', 'POST /admin/timeclock/shift', 'POST /admin/timeclock/shift/:id', 'POST /admin/timeclock/timeproof', 'POST /admin/timeclock/approve']) {
    assert.strictEqual(STAFF.ROUTES[r], 'owner', r);
  }
});

test('approval works the hours out from the shifts, and paid weeks stay locked', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = src.indexOf("app.post('/admin/timeclock/approve'");
  const body = src.slice(i, src.indexOf('\n});', i));
  assert.match(body, /const hours = TIMECLOCK\.hoursOf\(w\.minutes\)/);
  assert.doesNotMatch(body, /Number\(b\.hours\)/, 'never a figure from the form');
  assert.match(body, /WHERE staff_hours\.paid_at IS NULL/);
  assert.match(body, /if \(w\.open\)/);
  // Only things a person does count as activity, never background fetches.
  assert.match(src, /req\.headers\['sec-fetch-mode'\] === 'navigate'/);
  assert.match(src, /if \(isPersonActivity\(req\)\) notePing\(staff\.id\);/);
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS staff_shifts_open ON staff_shifts \(staff_id\) WHERE ended_at IS NULL/);
});

test('the clock-in minute and a shift from the week before are not "clocked out"', () => {
  // Pinged at the top of the clock-in minute, seconds before started_at.
  const sh = { started_at: new Date('2026-10-13T14:30:40Z'), ended_at: new Date('2026-10-13T16:00:00Z') };
  const before = [0, 1, 2, 3].map((m) => new Date(Date.parse('2026-10-13T14:20:00Z') + m * 60000));
  assert.deepStrictEqual(C.offClock([sh], [...before, new Date('2026-10-13T14:30:00Z')]), []);
  // Sunday 11pm to Monday 2am: Monday's pings are covered by last week's shift.
  const cover = { started_at: T('23:00', '2026-10-11'), ended_at: T('02:00', '2026-10-12') };
  const monday = [5, 6, 7, 8, 9, 10].map((m) => T(`00:${String(m).padStart(2, '0')}`, '2026-10-12'));
  assert.ok(C.flags({ pings: monday }).some((f) => f.kind === 'off-clock'));
  assert.ok(!C.flags({ pings: monday, coveringShifts: [cover] }).some((f) => f.kind === 'off-clock'));
  // The off-clock flag sits at noon on the shop clock, not the server's.
  const f = C.flags({ pings: monday }).find((x) => x.kind === 'off-clock');
  assert.strictEqual(C.toLocalInput(f.at), '2026-10-12T12:00');
});

test('an approved week says so instead of offering the same Approve again (owner, 2026-10-15)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /const upToDate = !!w\.approval && Math\.abs\(approved - clockHours\) <= 0\.01;/);
  assert.match(src, /paid \|\| !w\.shifts\.length \|\| upToDate \? '' : `<form method="post" action="\/admin\/timeclock\/approve"/);
  assert.match(src, /\$\{w\.approval \? 'Approve again' : 'Approve'\} \$\{clockHours\} hours/);
});
