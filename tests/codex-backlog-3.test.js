/* Codex backlog fixes, backend batch 3 (2026-10-10). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#195 a training restart keeps the window that already earned commission', () => {
  const r = after("app.post('/admin/training/restart'", 2600);
  assert.ok(r.indexOf("'signoff:was-ready-until:'") > -1 && r.indexOf("'signoff:was-ready-until:'") < r.indexOf('DELETE FROM staff_training'), 'kept before the delete');
  assert.match(r, /AND step_key NOT LIKE 'signoff:was-ready-until:%'/);
  const c = after('async function commissionLines(', 2600);
  assert.match(c, /substring\(t\.step_key from 25\)::timestamptz/);
  assert.strictEqual('signoff:was-ready-until:'.length, 24, 'substring starts right after the prefix');
});

test('#221 a failed "email me my design" reaches the error digest', () => {
  const d = after("app.post('/api/design-lead'", 6000);
  assert.match(d, /reportError\('design-lead:email-customer'/);
  assert.match(d, /res\.json\(\{ ok: true, id: savedId, emailed: email \? customerEmailed : null \}\)/);
});

test('#230 a view-only helper on /admin/finances writes nothing', () => {
  const f = after('const canEdit = isOwner();', 900);
  assert.match(f, /if \(canEdit\) await rollRecurringExpenses\(\)/);
  assert.match(f, /!canEdit \? \{ filled: 0, unfinished: \[\], catalogue: true \} : await estimateMissingJobCosts\(\)/);
});

test('#179 emailing a lead needs leads.view as well as messaging', () => {
  const l = after("app.post('/admin/lead/:id/email'", 1200);
  assert.match(l, /actorLevel\('customers\.message'\) !== 'on' \|\| actorLevel\('leads\.view'\) !== 'on'/);
});
