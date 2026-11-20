'use strict';

/* After June approves, the helper's notice says what the approval did and
 * links to it (owner, 2026-11-20: "they get a notification but nothing
 * happens"). Guards: STAFF.mayUseRoute takes a ROUTE PATTERN (a real job path
 * always said no); the To send link must hit the id My Day renders and open
 * it even when folded; a stored notice never links to a list the quote may
 * have left; My Day's Email button cannot resend or offer a refused send.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const STAFF = require('../tools/lib/staff');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const cut = (start, end) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf(end, i)); };
const intInSrc = cut('const intIn = ', '\n');
const code = cut('const MY_DAY_TO_SEND', 'let notifyRunning');
// eslint-disable-next-line no-new-func
const { approvalOutcome, myDaySecKey, MY_DAY_TO_SEND } = new Function('STAFF',
  `${intInSrc}\n${code}; return { approvalOutcome, myDaySecKey, MY_DAY_TO_SEND };`)(STAFF);

const helper = (perms) => ({ kind: 'staff', id: 7, perms });
const seesJobs = helper({ 'quotes.view': 'on', 'leads.view': 'on' });
const toSend = () => `/admin/my-day#sec-${myDaySecKey(MY_DAY_TO_SEND)}`;

test('a helper who can see jobs is linked to the job', () => {
  const sent = approvalOutcome({ kind: 'quote', subject_id: 'JT-123', quote_emailed_at: new Date() }, seesJobs);
  assert.equal(sent.link, '/admin/production/JT-123');
  assert.match(sent.what, /emailed to the customer/);
  assert.equal(approvalOutcome({ kind: 'message', subject_id: 'JT-123' }, seesJobs).link, '/admin/production/JT-123#messages');
});

test('a lead email links to the lead whatever its status now', () => {
  assert.equal(approvalOutcome({ kind: 'lead_email', subject_id: '42' }, seesJobs).link, '/admin/leads?status=all#lead-42');
});

test('an unemailed quote: My Day links to To send only while it is still there; a stored notice links to the job', () => {
  const q = { kind: 'quote', subject_id: 'JT-9', quote_emailed_at: null, quote_to_send: true };
  assert.equal(approvalOutcome(q, seesJobs, true).link, toSend());
  assert.equal(approvalOutcome(q, seesJobs).link, '/admin/production/JT-9', 'a notice is never rewritten');
  assert.equal(approvalOutcome({ ...q, quote_to_send: false }, seesJobs, true).link, '/admin/production/JT-9');
  assert.match(approvalOutcome(q, seesJobs).what, /did not go when it was approved/);
});

test('the To send anchor is the one My Day renders, and a link to it opens a folded section', () => {
  assert.match(src, /const secKey = myDaySecKey;/);
  assert.match(src, /\{ title: MY_DAY_TO_SEND, short: 'To send'/);
  assert.match(src, /function openHash\(\)\{[^}]*t\.open=true;\}\s*openHash\(\);window\.addEventListener\('hashchange',openHash\);/);
});

test('a helper without job access is sent to My Day, not a page that refuses them', () => {
  assert.equal(approvalOutcome({ kind: 'message', subject_id: 'JT-1' }, helper({ 'quotes.view': 'off' })).link, '/admin/my-day');
});

test('My Day Email: the route gate, the send refusal, no resend, and back to My Day', () => {
  assert.match(src, /canEmailQuote = STAFF\.mayUseRoute\(actor, 'POST', '\/admin\/quote\/:code\/email'\)/);
  assert.match(src, /: quoteSendRefusal\(q, 'email'\) \? `<div class="row-sub">/);
  assert.match(src, /name="once" value="1"/);
  const route = cut("app.post('/admin/quote/:code/email'", '\n});');
  assert.match(route, /safeAdminPath\(body\.back, `\/admin\/production\/\$\{code\}`\)/);
  assert.match(route, /body\.once === '1' && q\.emailed_at/);
  assert.ok(route.indexOf('body.once') < route.indexOf('emailQuote(q)'), 'checked before sending');
});

test('the To send list and the outcome read one test, which drops paid quotes', () => {
  const sql = cut('const QUOTE_TO_SEND_SQL', ';');
  assert.match(sql, /COALESCE\(q\.paid_amount, 0\) <= 0/);
  assert.match(sql, /q\.emailed_at IS NULL/);
  assert.equal((src.match(/COALESCE\(\$\{QUOTE_TO_SEND_SQL\}, false\) AS quote_to_send/g) || []).length, 2);
});
