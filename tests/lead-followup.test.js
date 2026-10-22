'use strict';

/* A follow-up for a contacted lead (owner, 2026-10-15: "suggest a followup
 * reply. add that to the contacted leads"). End to end: run-leadfu.cjs. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const LEADMAIL = require('../tools/lib/lead-email');
const STAFF = require('../tools/lib/staff');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the follow-up names their enquiry, asks if they still need it, and has no price or date', () => {
  const m = LEADMAIL.followUp({ name: 'Brenda Rodriguez', description: '125 Shirts with 5 designs' }, { signer: 'June', shop: "June's Tees" });
  assert.strictEqual(m.subject, "Following up on your enquiry with June's Tees");
  assert.match(m.body, /^Hi Brenda,/);
  assert.match(m.body, /your request for 125 Shirts with 5 designs\. Are you still looking to get these made\?/);
  assert.doesNotMatch(m.body, /\$\d/);
  const long = LEADMAIL.followUp({ name: '', description: 'x'.repeat(200) });
  assert.match(long.body, /^Hi,/);
  assert.ok(long.body.includes('x'.repeat(67) + '...'), 'a long enquiry is cut short');
});

test('every lead with an email gets Claude; it writes on first open, never from the stock message', () => {
  assert.match(src, /const m = \(contacted \? LEADMAIL\.followUp : LEADMAIL\.infoRequest\)\(l,/);
  // The button is on new leads too, not only contacted ones (owner, 2026-10-22).
  assert.match(src, /<div style="margin:0 0 8px">\s*<button type="button" class="btn" data-lsug="\$\{l\.id\}"[^>]*>\$\{contacted \? 'Suggest a follow-up with Claude' : 'Write a reply with Claude'\}/);
  assert.match(src, /f\.dispatchEvent\(new Event\('jt-open'\)\)">Email them<\/button>/);
  assert.match(src, /box\.addEventListener\('jt-open',function\(\)\{if\(!asked&&!sg\.disabled&&f\.body\.value===f\.body\.defaultValue\)ask\(\);\}\)/);
  // The generic template is not handed to Claude as the draft to keep.
  assert.match(src, /draft:f\.body\.value===f\.body\.defaultValue\?'':f\.body\.value/);
});

test('a new lead is answered, not sent the checklist; gaps come back as [June to fill in]', () => {
  const at = src.indexOf("app.post('/admin/api/lead/:id/suggest-followup'");
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /const note = lastOut\s*\?/);
  assert.match(route, /Answer each question they asked, in the order they asked it/);
  assert.match(route, /Do not send a generic checklist/);
  assert.match(route, /\[June to fill in: what is needed\]/);
  assert.match(route, /FROM kb_articles WHERE kind = 'faq' AND published AND NOT needs_review/);
  assert.match(route, /history, playbook, ask, money: false/);
  assert.match(route, /ask_shop: out\.ask_shop/);
});

test('an email still holding a [June to fill in] gap is never sent', () => {
  for (const t of ['Yes we do. [June to fill in: turnaround] is typical.', 'Price is [owner to fill in: price]', '[ june  to fill in ]']) {
    assert.match(String(LEADMAIL.cleanEmail({ subject: 'Hi', body: t }).error), /Fill in the \[June to fill in\] parts first/, t);
  }
  assert.match(String(LEADMAIL.cleanEmail({ subject: 'Re [June to fill in: x]', body: 'ok' }).error), /Fill in/);
  assert.deepStrictEqual(LEADMAIL.cleanEmail({ subject: 'Hi', body: 'June will fill in the details soon.' }),
    { subject: 'Hi', text: 'June will fill in the details soon.' });
});

test('the suggestion route: same permission as emailing a lead, rate-limited, no money, suggests only', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/api/lead/:id/suggest-followup'], 'customers.message');
  const at = src.indexOf("app.post('/admin/api/lead/:id/suggest-followup'");
  const route = src.slice(at, src.indexOf('\n});', at));
  // A helper who may not see leads (the designer preset) cannot read one through Claude.
  assert.match(route, /actor\.kind === 'staff' && \(actorLevel\('customers\.message'\) === 'off' \|\| actorLevel\('leads\.view'\) !== 'on'\)\) \{\s*return res\.status\(403\)/);
  assert.ok(route.indexOf("actorLevel('leads.view')") < route.indexOf('FROM submissions'), 'checked before anything is read');
  assert.match(route, /if \(recent\.length >= 10\) return res\.status\(429\)/);
  assert.match(route, /money: false/);
  assert.match(route, /WHERE submission_id = \$1/);
  assert.doesNotMatch(route, /sendLeadEmail|sendEmail|INSERT/, 'it never sends or records anything');
});

test('Open leads show two sections: waiting for a reply first, then contacted (owner, 2026-10-22)', () => {
  const at = src.indexOf("app.get('/admin/leads'");
  const page = src.slice(at, src.indexOf('\n});', at));
  const a = page.indexOf('id="to-answer">Waiting for a reply'), b = page.indexOf('id="contacted">Contacted, waiting on them');
  assert.ok(a > 0 && b > a, 'waiting section comes before contacted');
  assert.match(page, /const toAnswer = shown\.filter\(\(l\) => l\.lead_status === 'new'\)/);
  assert.match(page, /const contacted = shown\.filter\(\(l\) => l\.lead_status === 'contacted'\)/);
});
