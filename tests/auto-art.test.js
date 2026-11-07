/* Every quote to the designer (owner, 2026-11-05: "assign my designer to all
 * the quotes so he can review without me sending").
 * Run: node --test tests/auto-art.test.js */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const STAFF = require('../tools/lib/staff');

const fnAt = (anchor) => {
  const at = src.indexOf(anchor);
  assert.notStrictEqual(at, -1, `${anchor} not found`);
  return src.slice(at, src.indexOf('\n}\n', at));
};

test('the setting is a table of its own, owner-only to change', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS shop_settings/);
  const route = src.slice(src.indexOf("app.post('/admin/settings/auto-art'"), src.indexOf("app.get('/admin/staff'"));
  assert.match(route, /if \(!isOwner\(\)\) return res\.status\(403\)/);
  assert.match(route, /designersOnRoster\(\)\)\.find\(\(d\) => d\.id === id\)/, 'only someone who does design work can be picked');
  assert.strictEqual(STAFF.permForRoute('POST', '/admin/settings/auto-art'), 'owner');
});

test('the sweep sends each open quote once, to that designer, and never overwrites a request', () => {
  const fn = fnAt('async function autoArtSweep(');
  assert.match(fn, /NOT EXISTS \(SELECT 1 FROM art_requests a WHERE a\.quote_code = q\.code\)/);
  assert.match(fn, /ON CONFLICT \(quote_code\) DO NOTHING/);
  assert.match(fn, /if \(!designer\) return 0/, 'an archived designer gets nothing');
  assert.match(src, /q\.cancelled_at IS NULL AND q\.delivered_at IS NULL/);
  assert.match(fn, /One email per sweep/);
});

test('it runs with every notification sweep, so every way a quote is made is covered', () => {
  assert.match(fnAt('async function notifySweep('), /notifyPart\('auto art', autoArtSweep\(\)\)/);
});

test('the Staff page offers the picker to the owner only', () => {
  const card = fnAt('async function autoArtCard(');
  assert.match(card, /if \(!isOwner\(\)\) return ''/);
  assert.match(card, /escEmail\(d\.name\)/);
  assert.match(src, /\$\{await autoArtCard\(\)/);
});

const ART = require('../tools/lib/art-pipeline');
const JOBNOTES = require('../tools/lib/job-notes');

/* Owner, 2026-11-06: every order needs its artwork checked and fixed, so no
 * job closes without final files, and the designer asks the customer. */
test('no job closes without final art: Reviewed and Ask sales are gone', () => {
  assert.strictEqual(ART.MOVES.review, undefined, 'no move closes a job without files');
  assert.strictEqual(ART.canMove('review', 'waiting'), false);
  assert.ok(ART.DONE_STATES.includes('reviewed'), 'jobs closed the old way still read as finished');
  assert.strictEqual(ART.canMove('request', 'reviewed'), true, 'the owner can still send one of those by hand');
  assert.match(src, /art\/work', requireAdmin, artMoveHandler\(\['submit'\]\)/, 'only Submit is open to the designer');
  const card = fnAt('async function jobArtCard(');
  assert.doesNotMatch(card, /value="review"/);
  assert.doesNotMatch(card, /value="question"/);
  assert.doesNotMatch(card, /Ask sales a question/);
  assert.match(card, /href="#messages">Messages<\/a>/, 'the designer is pointed at the customer messages');
  assert.match(src, /<div class="card" id="messages"/, 'the anchor exists');
  assert.match(card, /value="submit"\$\{files\.length \? '' : ' disabled/, 'Submit still needs files');
  assert.match(fnAt('async function artMove('), /AND \(\$6::boolean = FALSE OR jsonb_array_length\(files\) > 0\)/);
});

test('a job reaches the designer only once the quote is accepted and paid', () => {
  assert.match(src, /const ART_PAID_SQL = `q\.accepted_at IS NOT NULL AND COALESCE\(q\.paid_amount, 0\) > 0`/);
  const open = src.slice(src.indexOf('const AUTO_ART_OPEN_SQL'), src.indexOf('const AUTO_REVIEW_LIVE_SQL'));
  assert.match(open, /\$\{ART_PAID_SQL\}/);
  assert.doesNotMatch(open, /valid_until/, 'an unaccepted quote never goes');
  const fn = fnAt('async function autoArtSweep(');
  assert.match(fn, /auto: true, paid: true/);
  assert.match(fn, /events, ack_at\)/, 'no Got it to press on an automatic job');
  assert.match(fn, /\$\{ART_HELD_SQL\('a'\)\}/, 'jobs sent before the rule are released once paid');
  assert.match(fn, /AND EXISTS \(SELECT 1 FROM art_requests a WHERE a\.quote_code = q\.code AND \$\{ART_HELD_SQL\('a'\)\}\)\)/, 'the early stop sees them too');
  assert.match(fn, /AND \$\{AUTO_ART_RELEASE_SQL\} AND \$\{ART_HELD_SQL\('a'\)\}/);
  assert.match(fn, /ORDER BY q\.accepted_at LIMIT 200\)/, 'releases are capped like inserts');
  assert.match(src, /const AUTO_ART_RELEASE_SQL = `\$\{AUTO_REVIEW_LIVE_SQL\} AND \$\{ART_PAID_SQL\} AND q\.accepted_at > NOW\(\) - interval '120 days'`/);
});

test('a job sent before payment is hidden from the designer, not deleted', () => {
  const ev = (extra) => [{ action: 'request', auto: true, ...extra }];
  assert.strictEqual(ART.isPaidRequest(ev({})), false);
  assert.strictEqual(ART.isPaidRequest(ev({ paid: true })), true);
  assert.strictEqual(ART.isPaidRequest([...ev({ paid: true }), { action: 'request', auto: true }]), false, 'the LAST request decides');
  assert.strictEqual(ART.isPaidRequest(null), false);
  assert.match(src, /const ART_HELD_SQL = \(t\) => `\(\$\{t\}\.status = 'waiting' AND jsonb_array_length\(\$\{t\}\.files\) = 0\s+AND \$\{ART_AUTO_SQL\(t\)\} AND NOT \$\{ART_LAST_REQUEST_SQL\(t, 'paid'\)\}\)`/);
  // every place the designer finds work leaves them out
  assert.match(fnAt('async function artQueues('), /AND NOT \$\{ART_HELD_SQL\('a'\)\} ORDER BY a\.updated_at/);
  assert.match(fnAt('async function artUnacked('), /AND NOT \$\{ART_HELD_SQL\('a'\)\}/);
  assert.match(fnAt('async function designJobFor('), /AND NOT \$\{ART_HELD_SQL\('a'\)\}\)/);
  const board = src.slice(src.indexOf("app.get('/admin/design', requireAdmin"), src.indexOf('const SCHEDULED_JOB_SQL'));
  assert.match(board, /AND \(\$1::int IS NULL OR NOT \$\{ART_HELD_SQL\('a'\)\}\)/, 'the owner still sees them');
  const card = fnAt('async function jobArtCard(');
  assert.match(card, /const held = ART\.isHeld\(a\)/);
  assert.match(card, /const mine = canWork && a && !held &&/);
  assert.match(card, /if \(canRequest && \(ART\.canMove\('request', st\) \|\| held\)\)/, 'the owner can send a held job by hand');
  // the server refuses a designer working a held job, not only the page
  assert.match(fnAt('async function artMove('), /AND \(\$5::int IS NULL OR NOT \$\{ART_HELD_SQL\('art_requests'\)\}\)/);
  const fileRoute = src.slice(src.indexOf("app.post('/admin/quote/:code/art/file'"), src.indexOf("app.post('/admin/api/message-file-signature'"));
  assert.match(fileRoute, /AND \(\$4::int IS NULL OR NOT \$\{ART_HELD_SQL\('art_requests'\)\}\)/);
  const queues = fnAt('async function artQueues(');
  assert.strictEqual((queues.match(/NOT \$\{ART_HELD_SQL\('a'\)\}/g) || []).length, 2, 'to-do and held-by-customer lists both');
  // JS twin
  const held = { status: 'waiting', files: [], events: [{ action: 'request', auto: true }] };
  assert.strictEqual(ART.isHeld(held), true);
  assert.strictEqual(ART.isHeld({ ...held, files: [{}] }), false);
  assert.strictEqual(ART.isHeld({ ...held, status: 'submitted' }), false);
  assert.strictEqual(ART.isHeld({ ...held, events: [{ action: 'request', auto: true, paid: true }] }), false);
  assert.strictEqual(ART.isHeld({ ...held, events: [{ action: 'request' }] }), false, 'sent by hand');
  assert.strictEqual(ART.isHeld(null), false);
  assert.match(card, /Waiting for the customer to accept and pay/);
  // and never holds up archiving
  assert.match(fnAt('async function helperOutstanding('), /OR \$\{ART_HELD_SQL\('a'\)\}\)\)/);
  // a switch of designer counts only the ones they can see
  assert.match(fnAt('async function moveAutoReviews('), /RETURNING \$\{ART_HELD_SQL\('a'\)\} AS held/);
});

test('the LAST request decides whether a job is an automatic review', () => {
  const auto = { action: 'request', auto: true };
  assert.strictEqual(ART.isAutoRequest([auto]), true);
  assert.strictEqual(ART.isAutoRequest([auto, { action: 'question' }, { action: 'answer' }]), true);
  assert.strictEqual(ART.isAutoRequest([auto, { action: 'request', by: null }]), false, 'sent by hand over it: real art work');
  assert.strictEqual(ART.isAutoRequest([]), false);
  assert.strictEqual(ART.isAutoRequest(null), false);
  // SQL twin reads the last request, not events -> 0
  assert.match(src, /ORDER BY i DESC LIMIT 1\), ''\) = 'true'/);
  assert.doesNotMatch(src, /events -> 0 ->> 'auto'/);
});

test('reviewed counts as finished on the Design jobs list and for archiving', () => {
  assert.match(src, /a\.status <> ALL\(\$2::text\[\]\) OR a\.updated_at > NOW\(\) - interval '14 days'/);
  const out = fnAt('async function helperOutstanding(');
  assert.match(out, /a\.status <> ALL\(\$2::text\[\]\)/);
  assert.match(out, /NOT \(q\.code IS NOT NULL AND \$\{AUTO_REVIEW_LIVE_SQL\}\)/, 'a dead or orphaned automatic review never blocks archiving');
});

test('changing or losing the designer moves their untouched reviews on', () => {
  const mv = fnAt('async function moveAutoReviews(');
  assert.match(mv, /a\.status = 'waiting' AND jsonb_array_length\(a\.files\) = 0 AND \$\{ART_AUTO_SQL\('a'\)\}/);
  assert.match(mv, /\$\{AUTO_REVIEW_LIVE_SQL\}/, 'finished quotes are left alone');
  assert.match(mv, /\(\$4::boolean OR \$\{ART_HELD_SQL\('a'\)\}\)/, 'on a switch only held jobs move: a paid one stays with the designer working it');
  assert.match(mv, /ack_at = NOW\(\), ack_by = NULL/, 'moving it does not ask for a Got it');
  assert.match(mv, /system: true/, 'the history does not read the move as the owner');
  assert.match(fnAt('function autoReviewTarget('), /picked !== leavingId/, 'never back to the one leaving');
  assert.match(fnAt('async function releaseAutoReviews('), /includeSeen: true/);
  const route = src.slice(src.indexOf("app.post('/admin/settings/auto-art'"), src.indexOf("app.get('/admin/staff'"));
  assert.match(route, /moveAutoReviews\(null, id\)/);
  // before every archive check, and whenever design work is switched off
  const sweep = fnAt('async function archiveSettledHelpers(');
  assert.match(sweep, /await releaseAutoReviews\(h\.id, \{ to: autoReviewTarget\(h\.id, picked, designers\) \}\);\s*if \(\(await helperOutstanding/);
  assert.ok(sweep.indexOf('designersOnRoster()') < sweep.indexOf('for (const h of rows)'), 'roster read once per run');
  for (const c of ["case 'disable':", "case 'archive':", "case 'perms':", "case 'preset':"]) {
    const at = src.indexOf(c, src.indexOf('async function helperOutstanding('));
    assert.notStrictEqual(at, -1, c);
    assert.match(src.slice(at, at + 1400), /releaseAutoReviews\(id\)/, c);
  }
  for (const c of ["case 'perms':", "case 'preset':"]) {
    const at = src.indexOf(c, src.indexOf('async function helperOutstanding('));
    assert.match(src.slice(at, at + 900), /lostDesignWork\(s, p(erms)?\) \? \(await releaseAutoReviews\(id\), await autoArtLostNote\(id\)\)/, c);
  }
});

test('the sweep stops before reading the roster when nothing is new', () => {
  const fn = fnAt('async function autoArtSweep(');
  assert.ok(fn.indexOf('if (!due) return 0') < fn.indexOf('designersOnRoster()'));
});

test('design work is lost only when it was there before', () => {
  const ctx = {};
  // fnAt stops before the closing brace, so it is added back here.
  vm.runInNewContext(`${fnAt('function lostDesignWork(')}\n}\nthis.f = lostDesignWork;`, Object.assign(ctx, { STAFF }));
  assert.strictEqual(ctx.f({ perms: { 'art.work': 'on' } }, {}), true);
  assert.strictEqual(ctx.f({ perms: {} }, {}), false, 'a sales helper saved again is not a designer leaving');
  assert.strictEqual(ctx.f({ perms: { 'art.work': 'on' } }, { 'art.work': 'on' }), false);
});

test('new paid orders show on the badge with no Got it to press', () => {
  assert.match(src, /Promise\.all\(\[artUnacked\(me\), artNewPaid\(me\)\]\)/);
  assert.match(fnAt('async function artNewPaid('), /AND \$\{ART_AUTO_SQL\('a'\)\} AND NOT \$\{ART_HELD_SQL\('a'\)\}/);
  assert.match(src, /out\.pinned = \(out\.unacked \|\| 0\) \+ out\.jobnotes/, 'the pin count is only what has a pin card');
  const card = fnAt('async function jobArtCard(');
  assert.match(card, /actorLevel\('customers\.message'\) === 'off'\s+\? 'Need something from the customer\? Ask June in Team chat/, 'a designer who cannot message is not sent to a read-only card');
});

test('automatic moves read as Automatic in the history', () => {
  assert.match(src, /e\.by == null && \(e\.auto \|\| e\.system\) \? 'Automatic'/);
});
