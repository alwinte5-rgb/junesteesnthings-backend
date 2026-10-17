/* Pinned until addressed (owner, 2026-10-14): art handed to the designer
   until they press Got it, and job messages until the reader addresses them. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../tools/lib/job-notes');
const STAFF = require('../tools/lib/staff');
const ART = require('../tools/lib/art-pipeline');

test('every art move that hands work to the designer asks for a fresh Got it', () => {
  for (const m of J.ART_TO_DESIGNER) {
    assert.strictEqual(J.artAckEffect(m), 'reset', m);
    assert.strictEqual(ART.MOVES[m].to === 'waiting' || ART.MOVES[m].to === 'changes', true, `${m} lands with the designer`);
  }
  for (const m of J.ART_BY_DESIGNER) assert.strictEqual(J.artAckEffect(m), 'ack', m);
  assert.strictEqual(J.artAckEffect('approve'), 'keep');
  assert.strictEqual(J.artAckEffect('nonsense'), 'keep');
  // Every move that lands in a designer state is covered, so none slips past unannounced.
  for (const [k, m] of Object.entries(ART.MOVES)) if (['waiting', 'changes'].includes(m.to)) assert.ok(J.ART_TO_DESIGNER.includes(k), k);
});

test('a message goes to one active person, never to the sender', () => {
  const roster = [{ id: 1, active: true }, { id: 2, active: false }];
  assert.strictEqual(J.recipientFrom('staff:1', roster, 'owner'), 'staff:1');
  assert.strictEqual(J.recipientFrom('owner', roster, 'staff:1'), 'owner');
  assert.strictEqual(J.recipientFrom('staff:1', roster, 'staff:1'), null, 'not to yourself');
  assert.strictEqual(J.recipientFrom('owner', roster, 'owner'), null);
  assert.strictEqual(J.recipientFrom('staff:2', roster, 'owner'), null, 'not a disabled helper');
  assert.strictEqual(J.recipientFrom('staff:9', roster, 'owner'), null, 'not someone off the roster');
  assert.strictEqual(J.recipientFrom('staff:1 OR 1=1', roster, 'owner'), null);
  assert.strictEqual(J.recipientFrom('', roster, 'owner'), null);
});

test('only the person it was sent to can address it, and only once', () => {
  const n = { recipient: 'staff:1', addressed_at: null };
  assert.ok(J.mayAddress(n, 'staff:1'));
  assert.ok(!J.mayAddress(n, 'staff:2'));
  assert.ok(!J.mayAddress(n, 'owner'), 'not even the owner, for someone else');
  assert.ok(!J.mayAddress({ ...n, addressed_at: new Date() }, 'staff:1'));
});

test('reader keys and bodies', () => {
  assert.strictEqual(J.readerOf({ kind: 'staff', id: 4 }), 'staff:4');
  assert.strictEqual(J.readerOf({ kind: 'owner' }), 'owner');
  assert.strictEqual(J.readerOf(null), 'owner');
  assert.strictEqual(J.staffIdOf('staff:12'), 12);
  assert.strictEqual(J.staffIdOf('owner'), null);
  assert.strictEqual(J.cleanBody('  a\r\nb\u0000  '), 'a\nb');
});

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = (head) => { const at = src.indexOf(head); assert.ok(at > 0, head); return src.slice(at, src.indexOf('\n});\n', at)); };

test('the routes are where the permission table says', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/art/ack'], 'art.work');
  assert.strictEqual(STAFF.ROUTES['POST /admin/job-notes'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/job-notes/:id/address'], 'any');
});

test('addressing is checked in the UPDATE itself: the reader, and not already done', () => {
  const r = route("app.post('/admin/job-notes/:id/address', requireAdmin");
  assert.match(r, /WHERE id = \$1 AND recipient = \$2 AND addressed_at IS NULL/);
});

test('a message is only sent about a job the sender, and the reader, can open', () => {
  assert.match(route("app.post('/admin/job-notes', requireAdmin"), /canOpenJob\(code, actor\)/);
  const fn = src.slice(src.indexOf('async function sendJobNote('), src.indexOf('\n}\n', src.indexOf('async function sendJobNote(')));
  assert.match(fn, /canOpenJob\(code, recipientActor\)/);
  assert.match(fn, /interval '10 seconds'/, 'a double click sends once');
});

test('pinned boxes are not foldable sections, and text is escaped', () => {
  for (const name of ['function artPinCard(', 'async function jobNotesPinCard(', 'async function teamJobNotesCard(']) {
    const fn = src.slice(src.indexOf(name), src.indexOf('\n}\n', src.indexOf(name)));
    assert.doesNotMatch(fn, /<details/, `${name} cannot be folded away`);
    assert.doesNotMatch(fn, /\$\{n\.body\}|\$\{last\.note\}/, `${name} never prints a message raw`);
  }
});

test('no top-level function in server.js is defined twice (the later one silently wins)', () => {
  const names = [...src.matchAll(/^(?:async )?function ([A-Za-z0-9_$]+)\(/gm)].map((m) => m[1]);
  const twice = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepStrictEqual(twice, []);
});
