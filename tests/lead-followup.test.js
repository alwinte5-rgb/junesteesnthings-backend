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

test('a contacted lead opens on the follow-up with Claude a press away; a new one keeps the info request', () => {
  assert.match(src, /const m = \(contacted \? LEADMAIL\.followUp : LEADMAIL\.infoRequest\)\(l,/);
  assert.match(src, /\$\{contacted \? `<div style="margin:0 0 8px">\s*<button type="button" class="btn" data-lsug=/);
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
