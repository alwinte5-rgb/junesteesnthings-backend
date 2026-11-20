'use strict';
/* #569: every course closed on signoff:handoff and signoff:ready, so a helper
 * moved between paths saw another course's sign-off as given. Each course now
 * has its own (Sales keeps the old keys); existing ticks are renamed once at
 * startup by the helper's current path. The same rename was run on a real
 * Postgres in ~/.local/share/jtees-e2e/run-course-keys.cjs (27 checks). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../tools/lib/training');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const closing = (track) => T.visibleSteps(undefined, track).filter((s) => s.type === 'signoff' && /(^signoff:([a-z]+-)?(ready|handoff))$/.test(s.key) && !s.partReady).map((s) => s.key);
const given = (keys, track) => T.progress(new Map(keys.map((k) => [k, { done_at: '2026-11-02T00:00:00Z' }])), {}, undefined, track).steps;
const trained = (keys, track) => T.readyGiven({ steps: given(keys, track), readyKey: T.readyKeyFor(track) });

test('no two paths share a closing sign-off key, unless one walks the other\'s course', () => {
  const seen = new Map();
  const walks = (a, b) => (T.TRACKS[a].includes || []).includes(b) || (T.TRACKS[b].includes || []).includes(a);
  for (const track of Object.keys(T.TRACKS)) {
    for (const k of closing(track)) {
      assert.ok(!seen.has(k) || walks(seen.get(k), track), `${k} closes both ${seen.get(k)} and ${track}`);
      if (!seen.has(k)) seen.set(k, track);
    }
  }
  // June's Tees + COS walks the Software course, so its software half is the Software course's.
  assert.ok(closing('sales-software').includes('signoff:software-ready'));
  assert.equal(seen.get(T.READY_KEY), 'sales', 'Sales keeps signoff:ready (commission and the legacy rule read it)');
});

test('Design -> Design + Marketing no longer ends training at once', () => {
  const designer = ['signoff:design-handoff', 'signoff:design-ready'];
  assert.equal(trained(designer, 'design'), true);
  assert.equal(trained(designer, 'design-marketing'), false);
  assert.equal(given(designer, 'design-marketing').find((s) => s.key === 'signoff:design-ready').done, true, 'the Design half shows signed');
});

test('Sales -> June\'s Tees + COS does not show the software half signed', () => {
  const steps = given(['signoff:handoff', 'signoff:ready', 'signoff:apparel-ready'], 'sales-software');
  assert.equal(steps.find((s) => s.key === 'signoff:software-ready').done, false);
  assert.equal(steps.find((s) => s.key === 'signoff:software-handoff').done, false);
});

test('June\'s Tees + COS -> Sales keeps ready: the apparel sign-off carries back', () => {
  assert.deepEqual(T.carriedReady('sales-software', 'sales'), { from: 'signoff:apparel-ready', to: T.READY_KEY });
  assert.deepEqual(T.carriedReady('sales', 'sales-software'), { from: T.READY_KEY, to: 'signoff:apparel-ready' });
  assert.equal(T.carriedReady('design', 'design-marketing'), null, 'the Design ready already is the Design half (same key)');
  assert.equal(T.carriedReady('software', 'sales'), null);
});

test('Sales -> Design + Marketing does not end training at once', () => {
  assert.equal(trained(['signoff:handoff', 'signoff:ready'], 'design-marketing'), false);
});

test('the rename table covers every path whose closing keys moved, and nothing else', () => {
  const r = T.courseKeyRenames();
  const tracks = new Set(r.map((x) => x.track));
  for (const track of Object.keys(T.TRACKS)) {
    const old = track === 'sales' ? [] : [T.READY_KEY, 'signoff:handoff'];
    const moved = old.filter((k) => !T.visibleSteps(undefined, track).some((s) => s.key === k));
    assert.equal(tracks.has(track), moved.length > 0, track);
  }
  for (const x of r) assert.ok(T.visibleSteps(undefined, x.track).some((s) => s.key === x.to), `${x.track}: ${x.to} is on the path`);
});

test('the startup rename runs once, in one transaction, and never overwrites a tick', () => {
  const at = SRC.indexOf("'once:course-ready-keys'");
  assert.ok(at > 0);
  const block = SRC.slice(SRC.lastIndexOf("await client.query('BEGIN')", at), SRC.indexOf("client.release()", at));
  assert.match(block, /ON CONFLICT DO NOTHING`\);\n\s+if \(first\)/, 'the marker decides whether it runs');
  assert.match(block, /TRAINING\.courseKeyRenames\(\)/);
  assert.match(block, /AND NOT EXISTS \(SELECT 1 FROM staff_training x WHERE x\.staff_id = t\.staff_id AND x\.step_key = \$3\)/);
  assert.match(block, /'signoff:apparel-ready'[\s\S]*t\.done_at < \$2::timestamptz/, 'an old June\'s Tees + COS ready keeps ending training');
  assert.match(block, /ROLLBACK/);
  assert.ok(at > SRC.indexOf("'once:apparel-ready-from-ready'"), 'after the earlier apparel grant');
});
