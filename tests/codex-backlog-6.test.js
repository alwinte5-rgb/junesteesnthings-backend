/* Codex backlog fixes, backend batch 6 (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#7 finishing a stage on the board keeps milestones recorded out of order', () => {
  const mv = after('async function moveJobToStage(', 900);
  assert.match(mv, /keepLater \? c : 'NULL'/, 'keepLater leaves later columns as they are');
  assert.match(after("app.post('/admin/quote/:code/stage'", 1500), /keepLater: String\(\(req\.body && req\.body\.keep_later\)/);
  assert.match(src, /class="knext"[\s\S]{0,300}name="keep_later" value="1"/, 'only the board\'s next button sends it');
  assert.match(after("app.post('/admin/quote/:code/step'", 1500), /keepLater: !clear/, 'ticking forward keeps; unticking still rewinds');
});

test('#123 a payout re-reads sales credit under a row lock; a credit change waits for a running payout', () => {
  const pay = after("app.post('/admin/commission/pay'", 3000);
  assert.ok(pay.indexOf('credited_to = $2 FOR UPDATE') > pay.indexOf('commissionLines(staffId, s)'));
  const set = after('async function setSalesCredit(', 3000);
  assert.match(set, /pg_advisory_xact_lock\(\$1, \$2\)', \[7301, cur\]/, 'the same lock the payout holds');
  assert.ok(set.indexOf('7301, cur') < set.indexOf('UPDATE quotes SET credited_to'));
});

test('#124 missing staff sign-in settings fail the Railway health check, not the storefront', () => {
  const h = after("app.get('/health'", 400);
  assert.match(h, /!cfAccess && \(process\.env\.RAILWAY_ENVIRONMENT_NAME/);
  assert.match(h, /status\(503\)/);
});

test('#105 Clover is acknowledged only after the payment is written down', () => {
  const hook = after("app.post('/webhooks/clover'", 7000);
  assert.ok(!/acknowledge immediately/.test(hook));
  const rec = hook.indexOf('await recordUnlinkedPayment(');
  const ok = hook.indexOf('res.sendStatus(200);', rec);
  assert.ok(rec > -1 && ok > rec, '200 after the write');
  assert.match(hook, /throw e;\s*\}\);\s*res\.sendStatus\(200\);/, 'a failed write is rethrown, not acknowledged');
  assert.match(hook, /if \(!res\.headersSent\) res\.sendStatus\(500\)/);
  assert.match(after('async function getCloverPayment(', 300), /timeout: 15000/);
});

test('#105 a Clover refund is recorded by hand, idempotently, by the owner only', () => {
  const r = after("app.post('/admin/unlinked/:id/refund'", 2600);
  assert.match(r, /pg_advisory_xact_lock\(\$1, \$2\)', \[7302, id\]/);
  assert.match(r, /const delta = round2\(want - Number\(h\.refunded\)\)/, 'books the difference, so a re-save writes nothing');
  assert.match(r, /want > round2\(Number\(p\.amount\)\)/, 'never more than the receipt');
  assert.match(r, /\$1::text/);
  assert.strictEqual(STAFF.ROUTES['POST /admin/unlinked/:id/refund'], 'owner');
});

test('#179 a lead email that could not mark the lead Contacted says so', () => {
  const m = after('async function markLeadResponded(', 900);
  assert.match(m, /return false;/);
  assert.match(after("app.post('/admin/lead/:id/email'", 4000), /if \(!\(await markLeadResponded\(id, actor\)\)\)/);
});
