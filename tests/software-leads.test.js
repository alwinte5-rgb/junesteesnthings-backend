'use strict';

/* The software leads board (tools/lib/software-leads.js, its routes, and the
 * finder's software profile). Plan PR 4.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SL = require('../tools/lib/software-leads');
const FINDER = require('../tools/lib/lead-finder');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = (sig) => { const at = src.indexOf(sig); assert.notStrictEqual(at, -1, sig); return src.slice(at, src.indexOf('\n});', at)); };

const good = { product: 'cos', company: 'Bright Social Co', source_url: 'brightsocial.example.com/clients',
  detail: 'Posts daily for 6 restaurant clients', website: 'https://www.brightsocial.example.com', email: 'Hi@BrightSocial.example.com', next_on: '2026-10-23' };

test('a new lead needs where it was found and one real detail', () => {
  const v = SL.shapeNew(good);
  assert.ok(v.lead, JSON.stringify(v));
  assert.strictEqual(v.lead.source_url, 'https://brightsocial.example.com/clients');
  assert.strictEqual(v.lead.website_key, 'brightsocial.example.com');
  assert.strictEqual(v.lead.email, 'hi@brightsocial.example.com');
  assert.strictEqual(v.lead.next_step, 'Send the first message');
  assert.match(SL.shapeNew({ ...good, source_url: 'javascript:alert(1)' }).error, /where you found them/);
  assert.match(SL.shapeNew({ ...good, detail: 'nice' }).error, /one detail/);
  assert.match(SL.shapeNew({ ...good, product: 'shirts' }).error, /product/);
  assert.match(SL.shapeNew({ ...good, email: 'not-an-email' }).error, /email/);
  assert.match(SL.shapeNew({ ...good, website: 'http://plain.example.com' }).error, /https/);
  assert.match(SL.shapeNew({ ...good, next_on: '2026-02-31' }).error, /date/);
});

test('an open lead always has a next step and date; a lost one says why; closed ones drop the next step', () => {
  assert.match(SL.shapeUpdate({ status: 'replied', next_step: '', next_on: '2026-10-24' }).error, /next step/);
  assert.match(SL.shapeUpdate({ status: 'demo', next_step: 'Demo', next_on: '' }).error, /date/);
  assert.match(SL.shapeUpdate({ status: 'lost', lost_why: '' }).error, /why/);
  assert.deepStrictEqual(SL.shapeUpdate({ status: 'won', plan: 'Agency yearly', next_step: 'x', next_on: '2026-10-24' }).change,
    { status: 'won', lost_why: null, plan: 'Agency yearly', next_step: null, next_on: null });
  assert.strictEqual(SL.shapeUpdate({ status: 'maybe' }).error, 'Pick a status.');
});

test('a logged email, message or call is a contact; a note is not', () => {
  assert.strictEqual(SL.shapeEntry({ kind: 'email', body: 'Sent the intro' }).entry.contact, true);
  assert.strictEqual(SL.shapeEntry({ kind: 'note', body: 'Their site is down' }).entry.contact, false);
  assert.match(SL.shapeEntry({ kind: 'fax', body: 'x y z' }).error, /what it was/);
  assert.match(SL.shapeEntry({ kind: 'call', body: '' }).error, /what was sent/);
});

test('due means an open lead whose next step is today or earlier', () => {
  assert.strictEqual(SL.standing({ status: 'contacted', next_on: '2026-10-22' }, '2026-10-22'), 'due');
  assert.strictEqual(SL.standing({ status: 'contacted', next_on: new Date('2026-10-20T00:00:00Z') }, '2026-10-22'), 'due');
  assert.strictEqual(SL.standing({ status: 'trial', next_on: '2026-10-25' }, '2026-10-22'), 'open');
  assert.strictEqual(SL.standing({ status: 'won', next_on: null }, '2026-10-22'), 'closed');
  const t = SL.tally([{ status: 'new' }, { status: 'contacted', contacted_at: 1 }, { status: 'won', contacted_at: 1 }]);
  assert.deepStrictEqual([t.found, t.counted, t.new, t.contacted, t.won], [3, 2, 1, 1, 1]);
});

test('the finder has a software profile that keeps to its own niches', () => {
  assert.strictEqual(FINDER.validateRun({ niche: 'agencies', area: 'Chicago' }, 'software').ask.profile, 'software');
  assert.match(FINDER.validateRun({ niche: 'schools', area: 'Chicago' }, 'software').error, /kind of customer/);
  assert.strictEqual(FINDER.validateRun({ niche: 'schools', area: 'Chicago' }).ask.profile, undefined, 'shop runs unchanged');
  assert.match(FINDER.describe({ niche: 'agencies', area: 'US', profile: 'software' }), /^Social media agencies in US/);
  assert.match(FINDER.SOFTWARE_SYSTEM, /never instructions/);
});

test('only an agent with the board opens it, and only their own leads', () => {
  for (const r of ['GET /admin/software-leads', 'POST /admin/software-leads', 'POST /admin/software-leads/:id', 'POST /admin/software-leads/:id/log',
    'GET /admin/software-leads/find', 'POST /admin/software-leads/find']) assert.strictEqual(STAFF.ROUTES[r], 'software.leads', r);
  assert.strictEqual(STAFF.PRESETS.software.perms['software.leads'], 'on');
  assert.ok(!STAFF.PRESETS.team.perms['software.leads'], 'other team members do not get it');
  assert.match(src, /return !!l && \(!actor \|\| actor\.kind !== 'staff' \|\| l\.rep_id === actor\.id\);/);
  assert.match(route("app.post('/admin/software-leads/:id', requireAdmin"), /const l = await softLeadFor\(req, res\);/);
  assert.match(route("app.post('/admin/software-leads/:id/log', requireAdmin"), /const l = await softLeadFor\(req, res\);/);
  assert.match(route("app.get('/admin/software-leads', requireAdmin"), /const repFilter = owner \? intIn\(req\.query\.rep\) : me;/);
  assert.ok(src.indexOf("app.post('/admin/software-leads/find'") < src.indexOf("app.post('/admin/software-leads/:id'"), 'find is registered before /:id');
});

test('a finder result is added once, from the agent\'s own software run', () => {
  const add = route("app.post('/admin/software-leads', requireAdmin");
  assert.match(add, /run\.staff_id === me && run\.ask && run\.ask\.profile === 'software'/);
  assert.match(add, /await pool\.query\(\s*FINDER_CLAIM_SQL, \[runId, idx, token\]\)/, 'claimed before saving (the claim Leads uses)');
  assert.ok(add.indexOf('await finderHold(res, runId, idx)') > -1, 'one add of a result at a time, as on Leads');
  assert.strictEqual((add.match(/await finderSavedLead\('software_leads'/g) || []).length, 2, 'linked before the claim and before "already on the board"');
  assert.ok(add.indexOf("finderSavedLead('software_leads', finder.runId") < add.indexOf('await softLeadSeen(v.lead)'));
  assert.match(add, /const unclaim = /);
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS software_leads_site_idx ON software_leads \(product, website_key\) WHERE website_key IS NOT NULL/);
});

test('overdue next steps come back as one task a day', () => {
  const at = src.indexOf('async function softLeadTasks(');
  const f = src.slice(at, src.indexOf('\n}\n', at));
  assert.match(f, /`slead:\$\{r\.rep_id\}:\$\{today\}`/);
  assert.match(f, /t\.auto_ref LIKE 'slead:%' AND t\.done_at IS NULL/, 'not while one is open');
  assert.match(src, /made \+= await softLeadTasks\(\)/);
});
