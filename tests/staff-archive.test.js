/* Archived helpers (owner, 2026-10-15): off every list, records kept. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)) + 2);

test('listedStaff leaves archived helpers off a list, except the one the page is about', () => {
  const listedStaff = vm.runInNewContext(`(${fn('listedStaff')})`);
  const roster = [{ id: 1, active: true, archived_at: null }, { id: 2, active: false, archived_at: new Date() },
                  { id: 3, active: true, archived_at: null }, { id: 4, active: false, archived_at: null }];
  assert.deepStrictEqual(listedStaff(roster).map((r) => r.id), [1, 3], 'archived and disabled helpers are off a list');
  assert.deepStrictEqual(listedStaff(roster, 2).map((r) => r.id), [1, 2, 3]);
  assert.deepStrictEqual(listedStaff(roster, 4).map((r) => r.id), [1, 3, 4], 'except the one the page is about');
  assert.deepStrictEqual(listedStaff(roster, null, { withDisabled: true }).map((r) => r.id), [1, 3, 4],
    'Staff and Pay still see a disabled helper who is not archived yet, so nothing owed is hidden');
  assert.match(fn('staffRoster'), /archived_at FROM staff/, 'the roster still carries archived helpers, for old records');
});

test('archive: never with wages, commission, bonuses, clocked time or work outstanding; nothing deleted', () => {
  const a = src.slice(src.indexOf("case 'archive': {"), src.indexOf("case 'enable':"));
  const owed = fn('helperOutstanding');
  for (const t of ['staff_hours', 'staff_shifts', 'staff_bonuses', 'commissionLines(', 'staff_tasks', 'art_requests']) assert.ok(owed.includes(t), t);
  assert.ok(fn('archiveHelper').includes('NOT EXISTS (SELECT 1 FROM staff_shifts WHERE staff_id = $1 AND ended_at IS NULL)'), 'checks repeated in the write');
  assert.match(a, /const left = await helperOutstanding\(id\);\s+if \(left\.length\) return/);
  assert.ok(a.includes('if (!rowCount)'));
  assert.doesNotMatch(a + owed + fn('archiveHelper'), /DELETE/);
});

/* Disabling archives at once when nothing is owed (owner, 2026-10-18: "remove
   disabled employees"); with something owed they stay on Staff and Pay. */
test('disable: archived straight away only when nothing is owed or open', () => {
  const d = src.slice(src.indexOf("case 'disable':"), src.indexOf("case 'welcome':"));
  assert.match(d, /UPDATE staff SET active = FALSE WHERE id = \$1/, 'they are locked out first, whatever is owed');
  assert.match(d, /if \(!left\.length && await archiveHelper\(id\)\)/);
  assert.match(d, /return \['an unchecked balance'\]/, 'a failed check counts as owed, so a helper is never archived blind');
});

test('the start-up sweep archives settled disabled helpers, never one restored by hand', () => {
  const sweep = fn('archiveSettledHelpers');
  assert.match(sweep, /NOT active AND archived_at IS NULL/);
  assert.match(sweep, /a\.action = 'helper restored'/, 'a Restore must survive the next deploy');
  assert.match(sweep, /a\.created_at > COALESCE\(\(SELECT MAX\(d\.created_at\)[\s\S]*?'helper disabled'/, 'but only until they are disabled again');
  assert.match(sweep, /try \{[\s\S]*?catch \(e\)/, 'one helper failing does not stop the rest');
  assert.match(src.slice(src.indexOf("case 'disable':"), src.indexOf("case 'welcome':")), /logActivity\(currentActor\(\), 'helper disabled'/);
  assert.match(sweep, /if \(\(await helperOutstanding\(h\.id\)\)\.length\) continue;/);
  assert.match(src, /archiveSettledHelpers\(\)\.catch\(/, 'and it runs after the server starts');
  const restore = src.slice(src.indexOf("case 'unarchive': {"), src.indexOf("case 'enable':"));
  assert.match(restore, /logActivity\(currentActor\(\), 'helper restored', \{ type: 'staff', id \}/, 'the record the sweep reads');
});

test('the Archive confirm never puts a name inside script text', () => {
  const page = fn('renderStaffPage');
  assert.ok(page.includes('data-archive-name="${escEmail(s.name)}"'));
  assert.ok(page.includes("this.dataset.archiveName"));
});

/* My Day by urgency (owner, 2026-10-18): people waiting first, an empty section
   is one word in "Nothing waiting", and the counts across the top jump there. */
test('My Day: urgent first, empty sections folded into one line, counts that open their section', () => {
  const day = src.slice(src.indexOf("app.get('/admin/my-day'"), src.indexOf('/* ── Training ──', src.indexOf("app.get('/admin/my-day'")));
  const order = ['Latest note from the owner', 'Leads waiting for a reply', 'Follow-ups due', 'The designer has a question',
    'Final art to approve', 'Artwork to do', 'Approved, but not emailed', 'Tasks (', 'Jobs with a next step',
    'Waiting on the customer', 'Waiting on the owner', 'Completed this week', "'My earnings'", 'Your training:'];
  const at = order.map((t) => day.indexOf(t));
  at.forEach((n, i) => assert.notStrictEqual(n, -1, order[i]));
  assert.deepStrictEqual([...at].sort((a, b) => a - b), at, 'sections in urgency order');
  assert.match(day, /const full = blocks\.filter\(\(x\) => x\.n == null \|\| x\.n > 0\);/);
  assert.match(day, /Nothing waiting: \$\{escEmail\(nothing\.map\(\(x\) => x\.short\)\.join\(', '\)\)\}/);
  assert.match(day, /href="#sec-\$\{escEmail\(secKey\(x\.title\)\)\}"/);
  assert.match(day, /id="sec-\$\{escEmail\(secKey\(title\)\)\}"/, 'the anchor the count jumps to');
  assert.match(day, /\.md-needs a'\)\.forEach[\s\S]*?d\.open=true/, 'a folded section opens when its count is clicked');
});
