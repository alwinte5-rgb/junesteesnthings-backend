/* The job page's "What was ordered" card and schedule (PR #297, owner 2026-10-15). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));

test('the order card: staff link, every ordered size, null lines, prices only for the boards', () => {
  const c = fn('jobOrderCard');
  assert.match(c, /\/q\/\$\{encodeURIComponent\(q\.code\)\}\?staff=1/, 'a staff visit is not counted as the customer opening it');
  assert.match(c, /for \(const k of Object\.keys\(i\.size_mix \|\| \{\}\)\) if \(!keys\.includes\(k\)\) keys\.push\(k\);/);
  assert.match(c, /if \(!i \|\| typeof i !== 'object'\) return '';/);
  assert.match(c, /catalog && !catalog\.failed \? catalog : \{\}/);
  assert.match(c, /\$\{showMoney \? addonRowsFor\(i, ix\) : ''\}/);
});

test('the schedule ticks each step by its own record and never tells a helper to set a date they cannot', () => {
  const s = fn('jobScheduleHtml');
  assert.match(s, /'Order blanks', sched\.blanks_order_by, !!\(q\.blanks_ordered_at \|\| q\.production_at\)/);
  assert.match(s, /'Artwork in', sched\.artwork_by, !!\(q\.artwork_at \|\| q\.production_at\)/);
  assert.match(s, /'Proof approved', sched\.proof_by, !!\(q\.proof_ok_at \|\| q\.production_at\)/);
  assert.match(s, /'On the press', sched\.press_by, !!\(q\.production_at \|\| q\.shipped_at\)/);
  assert.match(s, /const from = q\.production_at \? new Date\(q\.production_at\) : new Date\(\);/);
  assert.match(s, /canSetDate \? ' Set a date above/);
});
