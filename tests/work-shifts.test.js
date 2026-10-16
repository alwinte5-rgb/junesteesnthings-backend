/* Work hours shown in Chicago and Philippines time (owner, 2026-10-14). */
const test = require('node:test');
const assert = require('node:assert');
const W = require('../tools/lib/work-shifts');
const F = require('../tools/lib/team-chat-files');
const STAFF = require('../tools/lib/staff');

const one = (s, monday) => W.occurrences([s], monday)[0];

test('a Chicago shift in daylight time is 13 hours later in Manila', () => {
  const o = one({ weekday: 1, start_min: 9 * 60, end_min: 14 * 60, zone: 'America/Chicago' }, '2026-10-12');
  assert.deepStrictEqual(W.span(o), {
    'America/Chicago': 'Mon, Oct 12, 9:00 AM – 2:00 PM',
    'Asia/Manila': 'Mon, Oct 12, 10:00 PM – Tue, Oct 13, 3:00 AM' });
  assert.strictEqual(W.hoursOf(o), 5);
});

test('after Chicago falls back (Nov 1, 2026) the same shift is 14 hours later', () => {
  const o = one({ weekday: 1, start_min: 9 * 60, end_min: 14 * 60, zone: 'America/Chicago' }, '2026-11-02');
  assert.strictEqual(W.span(o)['Asia/Manila'], 'Mon, Nov 2, 11:00 PM – Tue, Nov 3, 4:00 AM');
});

test('a shift typed in Manila time past midnight', () => {
  const o = one({ weekday: 2, start_min: 21 * 60, end_min: 2 * 60, zone: 'Asia/Manila' }, '2026-10-12');
  assert.strictEqual(W.span(o)['Asia/Manila'], 'Tue, Oct 13, 9:00 PM – Wed, Oct 14, 2:00 AM');
  assert.strictEqual(W.span(o)['America/Chicago'], 'Tue, Oct 13, 8:00 AM – 1:00 PM');
  assert.strictEqual(W.hoursOf(o), 5);
});

test('the week starts on Monday as Chicago sees it', () => {
  assert.strictEqual(W.mondayOf(new Date('2026-10-18T12:00:00Z'), 'America/Chicago'), '2026-10-12');
  assert.strictEqual(W.mondayOf(new Date('2026-10-19T03:00:00Z'), 'America/Chicago'), '2026-10-12', 'Sunday night in Chicago is still that week');
});

test('times from the form', () => {
  assert.strictEqual(W.minutesOf('09:30'), 570);
  assert.strictEqual(W.minutesOf('23:59'), 1439);
  assert.strictEqual(W.minutesOf('24:00'), null);
  assert.strictEqual(W.minutesOf('9am'), null);
  assert.strictEqual(W.cleanNote('<b>a</b>\nb'), 'ba/b b');
});

test('task files must be in the task folder of our own cloud', () => {
  const ok = 'https://res.cloudinary.com/jt/raw/upload/v1/task_files/a.pdf';
  assert.deepStrictEqual(F.pickTaskFiles(JSON.stringify([{ url: ok, name: 'Brief.pdf' }]), 'jt').files, [{ url: ok, name: 'Brief.pdf' }]);
  assert.strictEqual(F.pickTaskFiles(JSON.stringify([{ url: ok.replace('task_files', 'team_chat') }]), 'jt').error, 'bad');
  assert.strictEqual(F.pickTaskFiles(JSON.stringify([{ url: 'https://evil.example/task_files/a.pdf' }]), 'jt').error, 'bad');
  assert.strictEqual(F.pickTaskFiles('not json', 'jt').error, 'bad');
  assert.strictEqual(F.pickTaskFiles(JSON.stringify(Array(11).fill({ url: ok })), 'jt').error, 'too-many');
  assert.deepStrictEqual(F.pickTaskFiles('', 'jt').files, []);
  assert.ok(!F.fileUrlOk(ok, 'jt', 'job_art'), 'no other folder can be asked for');
});

test('routes: anyone sees the hours, only the owner changes them', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/work-schedule'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/work-schedule'], 'owner');
  assert.strictEqual(STAFF.ROUTES['GET /admin/tasks/:id/file/:n'], 'any');
});

test('a Manila Monday shift lands on the Chicago Sunday before, in the right week', () => {
  const ph = [{ staff_id: 1, weekday: 1, start_min: 9 * 60, end_min: 14 * 60, zone: 'Asia/Manila' }];
  // Week of Mon 2026-10-12 (Chicago). PH Mon Oct 19 9 AM = CT Sun Oct 18 8 PM, so it belongs here.
  const occ = W.weekOccurrences(ph, '2026-10-12', 'America/Chicago');
  assert.strictEqual(occ.length, 1);
  assert.strictEqual(W.dateIn(occ[0].start, 'America/Chicago'), '2026-10-18');
  // PH Mon Oct 12 9 AM is CT Sun Oct 11: the week before, not this one twice.
  assert.ok(occ.every((o) => W.dateIn(o.start, 'America/Chicago') >= '2026-10-12'));
});

test('a Chicago shift stays in its own week, once', () => {
  const ct = [{ staff_id: 1, weekday: 3, start_min: 9 * 60, end_min: 14 * 60, zone: 'America/Chicago' }];
  const occ = W.weekOccurrences(ct, '2026-10-12', 'America/Chicago');
  assert.strictEqual(occ.length, 1);
  assert.strictEqual(W.dateIn(occ[0].start, 'America/Chicago'), '2026-10-14');
});

test('an overnight Sunday shift from last week is found while still running', () => {
  const night = [{ staff_id: 1, weekday: 7, start_min: 22 * 60, end_min: 6 * 60, zone: 'America/Chicago' }];
  const now = W.instantOf('2026-10-19', 2 * 60, 'America/Chicago');   // Mon 2 AM
  const prev = W.weekOccurrences(night, '2026-10-12', 'America/Chicago');
  const live = prev.filter((o) => o.start <= now && o.end > now);
  assert.strictEqual(live.length, 1);
});

test('validDate refuses impossible dates', () => {
  assert.strictEqual(W.validDate('2026-10-12'), '2026-10-12');
  assert.strictEqual(W.validDate('2026-02-31'), null);
  assert.strictEqual(W.validDate('2026-13-45'), null);
  assert.strictEqual(W.validDate('x'), null);
  assert.strictEqual(W.validDate(undefined), null);
});

/* The weeks a shift runs (owner, 2026-10-15: "I added another schedule, but
   it just added to this week's date. Can we send those to next week"). */
test('a shift runs only between its first and last day; no dates is every week', () => {
  const S = require('../tools/lib/work-shifts');
  const mon = { staff_id: 1, weekday: 1, start_min: 540, end_min: 840, zone: 'America/Chicago' };
  const days = (rows, m) => S.occurrences(rows, m).map((o) => S.dateIn(o.start, 'America/Chicago'));
  assert.deepStrictEqual(days([mon], '2026-10-12'), ['2026-10-12'], 'no dates: every week');
  const next = { ...mon, starts_on: '2026-10-19' };
  assert.deepStrictEqual(days([next], '2026-10-12'), [], 'not before its first day');
  assert.deepStrictEqual(days([next], '2026-10-19'), ['2026-10-19']);
  const ending = { ...mon, ends_on: '2026-10-18' };
  assert.deepStrictEqual(days([ending], '2026-10-12'), ['2026-10-12']);
  assert.deepStrictEqual(days([ending], '2026-10-19'), [], 'not after its last day');
  assert.strictEqual(S.inRange({ starts_on: 'junk' }, '2026-10-12'), true, 'an unreadable date limits nothing');
  assert.deepStrictEqual(S.weeksFrom('2026-10-12', 3), ['2026-10-12', '2026-10-19', '2026-10-26']);
});
