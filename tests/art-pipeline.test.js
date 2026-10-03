'use strict';

/* The artwork pipeline (tools/lib/art-pipeline.js and its routes in server.js):
 * sales -> designer -> owner, each move from the right state by the right person.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ART = require('../tools/lib/art-pipeline');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('moves only from the states the flow allows', () => {
  assert.ok(ART.canMove('request', null) && ART.canMove('request', 'approved'));
  assert.ok(!ART.canMove('request', 'waiting'), 'a job already with the designer is not sent twice');
  assert.ok(ART.canMove('question', 'waiting') && ART.canMove('answer', 'needs_info'));
  assert.ok(!ART.canMove('submit', 'needs_info'), 'no submitting while a question is open');
  assert.ok(ART.canMove('submit', 'changes'));
  assert.ok(ART.canMove('approve', 'submitted') && !ART.canMove('approve', 'waiting'), 'only submitted art is approved');
  assert.ok(!ART.canMove('__proto__', 'waiting') && !ART.canMove('nope', null));
  for (const m of Object.values(ART.MOVES)) assert.ok(ART.STATES[m.to], m.to);
  assert.ok(ART.canAddFile('waiting') && !ART.canAddFile('submitted') && !ART.canAddFile('approved'));
});

test('who makes each move: sales, the designer, the owner', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/art/request'], 'art.request');
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/art/work'], 'art.work');
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/art/file'], 'art.work');
  assert.strictEqual(STAFF.ROUTES['POST /admin/api/art-signature'], 'art.work');
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/art/decide'], 'owner');
  assert.match(src, /'\/admin\/quote\/:code\/art\/request', requireAdmin, artMoveHandler\(\['request', 'answer'\]\)/);
  assert.match(src, /'\/admin\/quote\/:code\/art\/work', requireAdmin, artMoveHandler\(\['question', 'submit'\]\)/);
  assert.match(src, /'\/admin\/quote\/:code\/art\/decide', requireAdmin, artMoveHandler\(\['approve', 'changes'\]\)/);
  assert.strictEqual(STAFF.PRESETS.training.perms['art.request'], 'on');
  assert.strictEqual(STAFF.PRESETS.design.perms['art.work'], 'on');
  assert.ok(!STAFF.PRESETS.design.perms['art.request'] && !STAFF.PRESETS.training.perms['art.work']);
});

test('every move re-checks the state in SQL, a designer touches only their own, and submit needs files', () => {
  const fn = src.slice(src.indexOf('async function artMove('), src.indexOf('\n}\n', src.indexOf('async function artMove(')));
  assert.match(fn, /WHERE quote_code = \$1 AND status = ANY\(\$4::text\[\]\)/);
  assert.match(fn, /AND \(\$5::int IS NULL OR assigned_to IS NULL OR assigned_to = \$5\)/);
  assert.match(fn, /jsonb_array_length\(files\) > 0/);
  assert.match(fn, /WHERE art_requests\.status = 'approved'/, 'a new round only after approval');
  assert.match(fn, /SET artwork_at = COALESCE\(artwork_at, NOW\(\)\)/, 'approval records artwork in hand, once');
});

test('final files: our cloud, the art folder, production types only; signed behind sign-in', () => {
  const ok = 'https://res.cloudinary.com/jtees/image/upload/v1/job_art/logo_final.ai';
  assert.ok(ART.artUrlOk(ok, 'jtees'));
  assert.ok(ART.artUrlOk(ok.replace('/image/', '/raw/').replace('.ai', '.dst'), 'jtees'));
  for (const bad of [ok.replace('job_art', 'job_proofs'), ok.replace('/jtees/', '/x/'), ok.replace('.ai', '.exe'),
    ok.replace('.ai', '.html'), ok.replace('/image/', '/video/'), ok + '?a=1', 'javascript:alert(1)']) {
    assert.ok(!ART.artUrlOk(bad, 'jtees'), bad);
  }
  assert.ok(!ART.artUrlOk(ok, ''));
  assert.strictEqual(ART.cleanNote('a\u0000b\r\nc'), 'ab\nc');
  assert.strictEqual(ART.cleanNote('x'.repeat(5000)).length, ART.NOTE_MAX);
  const sig = src.slice(src.indexOf("app.post('/admin/api/art-signature', requireAdmin"), src.indexOf('\n});', src.indexOf("app.post('/admin/api/art-signature', requireAdmin")));
  assert.match(sig, /api_sign_request\(\{ folder: ART\.FOLDER, timestamp \}, apiSecret\)/);
  assert.doesNotMatch(sig, /req\.body/);
});

test('the card escapes what people typed and the file names', () => {
  const card = src.slice(src.indexOf('async function jobArtCard('), src.indexOf('\n}\n', src.indexOf('async function jobArtCard(')));
  assert.match(card, /\$\{escEmail\(e\.note\)\}/);
  assert.match(card, /escEmail\(f\.name \|\| 'File'\)/);
  assert.match(card, /escEmail\(f\.url\)/);
  assert.match(card, /ART\.artUrlOk\(f\.url, cloud\)/, 'a stored file is re-checked before it is linked');
});
