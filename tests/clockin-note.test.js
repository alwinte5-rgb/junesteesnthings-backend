'use strict';

/* The clock-in note (tools/lib/clockin-note.js and sendClockInNote in
 * server.js): the first clock-in of the day posts a Mailbox message from the
 * helper to the owner listing their open tasks and projects, once a day, and
 * never holds up the clock-in.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const NOTE = require('../tools/lib/clockin-note');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function block(signature, end = '\n}\n') {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf(end, at));
}

test('the body follows the helper\'s own morning message', () => {
  const body = NOTE.buildBody({
    name: 'Eleazar',
    tasks: [
      { title: 'EZ Clean Flyer Updates' },
      { title: 'Finishing the Website Mockups (20+ Remaining)' },
      { title: 'Revisions', project_title: 'Christmas 2026: Print the Magic of Christmas' },
    ],
    projects: ['Christmas 2026: Print the Magic of Christmas'],
  });
  assert.strictEqual(body, [
    'Good morning! I am about to clock in. Here are the tasks on my priority today!',
    '',
    'Tasks for Today:',
    '• EZ Clean Flyer Updates',
    '• Finishing the Website Mockups (20+ Remaining)',
    '',
    'Projects to Continue:',
    '• Christmas 2026: Print the Magic of Christmas',
    '',
    'Please let me know if there are other things you need help with! Thank you!',
    '',
    '(Sent automatically when Eleazar clocked in.)',
  ].join('\n'));
});

test('a project step is listed under its project, once', () => {
  const body = NOTE.buildBody({
    name: 'A',
    tasks: [{ title: 'Step 2', project_title: 'Halloween' }, { title: 'Step 3', project_title: 'Halloween' }],
    projects: ['Halloween', 'Christmas'],
  });
  assert.strictEqual(body.split('• Halloween').length - 1, 1);
  assert.match(body, /• Christmas/);
  assert.match(body, /Tasks for Today:\n• Nothing assigned yet/);
});

test('nothing open says so instead of an empty list', () => {
  const body = NOTE.buildBody({ name: 'A' });
  assert.match(body, /Tasks for Today:\n• Nothing assigned yet/);
  assert.match(body, /Projects to Continue:\n• None right now/);
});

test('a long backlog is capped and says how many more', () => {
  const tasks = Array.from({ length: NOTE.MAX_TASKS + 3 }, (_, i) => ({ title: `Task ${i + 1}` }));
  const body = NOTE.buildBody({ name: 'A', tasks });
  assert.match(body, new RegExp(`• Task ${NOTE.MAX_TASKS}\\n• …and 3 more`));
  assert.doesNotMatch(body, new RegExp(`• Task ${NOTE.MAX_TASKS + 1}\\b`));
});

test('titles are flattened to one line', () => {
  const body = NOTE.buildBody({ name: 'A', tasks: [{ title: 'Line one\nline two' }, { title: '   ' }] });
  assert.match(body, /• Line one line two\n/);
  assert.doesNotMatch(body, /•\s*\n/);
});

test('the subject carries the date, composed from parts', () => {
  assert.strictEqual(NOTE.dayLabel('2026-10-23'), 'Fri Oct 23');
  assert.strictEqual(NOTE.subjectFor('Eleazar', '2026-10-23'), "Eleazar: today's tasks (Fri Oct 23)");
  assert.strictEqual(NOTE.subjectFor('', '2026-01-05'), "Helper: today's tasks (Mon Jan 5)");
});

test('clock-in sends the note without waiting on it or failing because of it', () => {
  const route = block("app.post('/admin/clock/in'", '\n});');
  const ins = route.indexOf('INSERT INTO staff_shifts');
  const call = route.indexOf('sendClockInNote(actor.id).catch(');
  assert.ok(ins > -1 && call > ins, 'the note is sent only after the shift row is written');
  assert.doesNotMatch(route, /await sendClockInNote/);
  const dup = route.slice(route.indexOf("'23505'"));
  assert.doesNotMatch(dup, /sendClockInNote/, 'an "already on the clock" press sends nothing');
});

test('the note is once a day, only to the owner, and only from a working helper', () => {
  const fn = block('async function sendClockInNote(');
  assert.match(fn, /WHERE id = \$1 AND active AND archived_at IS NULL/);
  assert.match(fn, /pg_advisory_xact_lock\(hashtext\(\$1\)\)', \[`clockin-note:\$\{me\.id\}`\]/);
  assert.match(fn, /WHERE created_by = \$1 AND subject = \$2/);
  assert.match(fn, /for \(const r of \['owner', author\]\)/);
  assert.match(fn, /assigned_to = \$1 AND done_at IS NULL AND \$\{TASK_STEP_NOW\}/);
  assert.match(fn, /addMailMessage\(client,/);
});
