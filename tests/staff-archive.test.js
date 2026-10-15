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
  const roster = [{ id: 1, archived_at: null }, { id: 2, archived_at: new Date() }, { id: 3, archived_at: null }];
  assert.deepStrictEqual(listedStaff(roster).map((r) => r.id), [1, 3]);
  assert.deepStrictEqual(listedStaff(roster, 2).map((r) => r.id), [1, 2, 3]);
  assert.match(fn('staffRoster'), /archived_at FROM staff/, 'the roster still carries archived helpers, for old records');
});

test('archive: never with wages, commission, bonuses, clocked time or work outstanding; nothing deleted', () => {
  const a = src.slice(src.indexOf("case 'archive': {"), src.indexOf("case 'enable':"));
  for (const t of ['staff_hours', 'staff_shifts', 'staff_bonuses', 'commissionLines(', 'staff_tasks', 'art_requests']) assert.ok(a.includes(t), t);
  assert.ok(a.includes('NOT EXISTS (SELECT 1 FROM staff_shifts WHERE staff_id = $1 AND ended_at IS NULL)'), 'checks repeated in the write');
  assert.ok(a.includes('if (!rowCount)'));
  assert.doesNotMatch(a, /DELETE/);
});

test('the Archive confirm never puts a name inside script text', () => {
  const page = fn('renderStaffPage');
  assert.ok(page.includes('data-archive-name="${escEmail(s.name)}"'));
  assert.ok(page.includes("this.dataset.archiveName"));
});
