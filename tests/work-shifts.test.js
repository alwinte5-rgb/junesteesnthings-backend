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
