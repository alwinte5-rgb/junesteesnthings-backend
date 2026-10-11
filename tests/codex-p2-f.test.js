/* Codex P2 backlog, backend chunk F (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../tools/lib/hiring');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#143 deliveries: freed on cancel and hourly, delivered is said once, review ask moves', () => {
  assert.match(after("app.post('/admin/quote/:code/cancel'", 4000), /DELIVERY\.cancelRef\('quote:' \+ code, 'system', 'quote cancelled'\)/);
  assert.match(src, /await step\('delivery reconcile'/);
  const st = after("app.post('/admin/delivery/job/:id/status'", 1800);
  assert.match(st, /status === 'delivered' && !\(was && was\.status === 'delivered'\)/);
  assert.match(st, /moveJobToStage\(b\.ref\.slice\(6\), JOB_STAGES\.length - 1, \{ notify: false, keepLater: true \}\)/);
});
test('#143 manual booking: accepted jobs, one write, CRM updated; a shop target wins', () => {
  const r = after("app.post('/admin/delivery/new'", 3500);
  assert.match(r, /AND accepted_at IS NOT NULL/);
  assert.match(r, /total = COALESCE\(\$4::numeric, total\), deposit = COALESCE\(\$5::numeric, deposit\)/);
  assert.match(r, /syncQuoteToBrevo\(upd\[0\]/);
  assert.match(after('function quoteReadyYmd(', 700), /return target \? \(target < today \? today : target\) : est;/);
});
test('#158/#173 hiring: started round 2 keeps its clock, new link extends it, everyone gets round 2', () => {
  assert.match(after('async function reportUnfinishedRound2()', 800), /c\.expires_at < NOW\(\) AND c\.started_at IS NULL/);
  assert.match(after("app.post('/admin/hiring/:id/link'", 2500), /WHERE parent_id = \$1 AND stage = 2 AND submitted_at IS NULL AND started_at IS NULL/);
  assert.equal(H.round2Questions({ follow_up: [] }).length, 2);
  assert.doesNotMatch(H.round2System({ role: 'designer' }), /passed a first test/);
  assert.match(src, /Round 2 opened late for/);
});
