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

test('a review-only quote can be closed: Reviewed, only on an automatic request', () => {
  assert.strictEqual(ART.canMove('review', 'waiting'), true);
  assert.strictEqual(ART.canMove('review', 'submitted'), false);
  assert.strictEqual(ART.MOVES.review.to, 'reviewed');
  assert.strictEqual(ART.MOVES.review.autoOnly, true);
  assert.ok(ART.DONE_STATES.includes('reviewed'));
  assert.strictEqual(ART.canMove('request', 'reviewed'), true, 'the owner can still send a reviewed quote by hand');
  assert.strictEqual(JOBNOTES.artAckEffect('review'), 'ack');
  // the route takes it, under the designer's permission
  assert.match(src, /art\/work', requireAdmin, artMoveHandler\(\['question', 'submit', 'review'\]\)/);
  // the UPDATE refuses it on a request sent by hand
  const fn = fnAt('async function artMove(');
  assert.match(fn, /AND \(\$9::boolean = FALSE OR \$\{ART_AUTO_SQL\('art_requests'\)\}\)/);
  assert.match(fn, /!!m\.autoOnly\]/);
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
  assert.match(mv, /\(\$4::boolean OR a\.ack_at IS NULL\)/, 'a review the designer took on stays with them on a switch');
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

test('the owner never sees the designer-only Reviewed step', () => {
  assert.match(src, /const autoReview = !!a && me != null && ART\.isAutoRequest\(a\.events\)/);
  assert.match(src, /e\.by == null && \(e\.auto \|\| e\.system\) \? 'Automatic'/);
});
