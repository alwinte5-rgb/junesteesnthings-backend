/* Archived helpers (owner, 2026-10-15): off every list, records kept. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));

test('the roster leaves archived helpers out unless asked, and old records keep their names', () => {
  const r = fn('staffRoster');
  assert.match(r, /return includeArchived \? rows : rows\.filter\(\(r\) => !r\.archived_at\);/);
  assert.match(r, /if \(r\.archived_at\) ARCHIVED_NAMES\.set\(r\.id, r\.name\)/);
  assert.match(fn('nameOf'), /ARCHIVED_NAMES\.get\(id\)/);
  assert.match(src, /ALTER TABLE staff ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ/);
});

test('archive only a disabled helper with nothing owed or open; enable waits for Restore', () => {
  const a = src.slice(src.indexOf("case 'archive': {"), src.indexOf("case 'enable':"));
  assert.match(a, /if \(s\.active\) return back\(/);
  assert.match(a, /FROM staff_hours WHERE staff_id = \$1 AND paid_at IS NULL/);
  assert.match(a, /FROM staff_tasks WHERE assigned_to = \$1 AND done_at IS NULL/);
  assert.match(a, /FROM art_requests WHERE assigned_to = \$1 AND status <> 'approved'/);
  assert.match(a, /SET archived_at = NOW\(\), active = FALSE/);
  assert.doesNotMatch(a, /DELETE/, 'nothing is deleted');
  assert.match(src, /if \(s\.archived_at\) return back\(res, '\/admin\/staff\?archived=1', 'err', `Restore/);
});
