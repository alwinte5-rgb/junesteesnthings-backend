'use strict';

/* Email a lead from the Leads page, and Contacted as a lead status (2026-10-07).
 * Run: node --test tests/*.test.js */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../tools/lib/lead-email');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = src.slice(src.indexOf("app.post('/admin/lead/:id/email'"), src.indexOf("app.post('/admin/lead/:id/assign'"));

test('the ready message asks for what a quote needs, by first name, about what they asked', () => {
  const m = M.infoRequest({ name: 'Maria Lopez', description: 'Shirts for a family reunion' }, { signer: 'June', shop: "June's Tees" });
  assert.match(m.body, /^Hi Maria,/);
  assert.match(m.body, /"Shirts for a family reunion"/);
  for (const ask of [/How many pieces/, /colour/, /Where the design goes/, /artwork/, /date you need/]) assert.match(m.body, ask);
  assert.match(m.body, /\nJune\n/);
  assert.match(M.infoRequest({}).body, /^Hi,/, 'no name, no stray space');
  assert.ok(M.infoRequest({ description: 'x'.repeat(300) }).body.includes('...'), 'a long enquiry is shortened');
});

test('the form is checked: subject and message needed, capped, no header injection', () => {
  assert.ok(M.cleanEmail({ subject: '', body: 'hi' }).error);
  assert.ok(M.cleanEmail({ subject: 'Hi', body: '  ' }).error);
  assert.ok(M.cleanEmail({ subject: 'Hi', body: 'x'.repeat(M.LIMITS.body + 1) }).error);
  const ok = M.cleanEmail({ subject: 'Hi\r\nBcc: a@b.c', body: 'Line\r\nTwo' });
  assert.strictEqual(ok.subject, 'Hi Bcc: a@b.c');
  assert.strictEqual(ok.text, 'Line\nTwo');
  assert.strictEqual(M.cleanEmail({ subject: 's'.repeat(400), body: 'a' }).subject.length, M.LIMITS.subject);
});

test('what was typed is escaped for the email', () => {
  const html = M.toHtml('Hi <b>you</b>\nnext line\n\nNew "para"');
  assert.ok(!html.includes('<b>'));
  assert.match(html, /&lt;b&gt;you&lt;\/b&gt;<br>next line/);
  assert.strictEqual((html.match(/<p /g) || []).length, 2);
});

test('the send route: checked, sends before it records, no double send, helpers need full messaging', () => {
  assert.ok(route.length > 200, 'route found');
  assert.match(route, /LEADMAIL\.cleanEmail\(b\)/);
  assert.match(route, /actorLevel\('customers\.message'\) !== 'on'/);
  assert.match(route, /FRAUD\.mentionsOutsidePayment/);
  assert.match(route, /INTERVAL '10 minutes'/, 'a second press sends nothing');
  assert.ok(route.indexOf('await sendEmail(') < route.indexOf('INSERT INTO lead_notes'), 'the note only after a real send');
  assert.ok(route.indexOf('INSERT INTO lead_notes') < route.indexOf('markLeadResponded'), 'then Contacted');
  assert.match(route, /Nothing was recorded/, 'a failure says so');
  assert.strictEqual(STAFF.ROUTES['POST /admin/lead/:id/email'], 'customers.message');
});

test('Contacted: a lead someone has answered, shown on the card and in its own filter, never hidden by default', () => {
  assert.match(src, /l\.dismissed_at \? 'dismissed' : l\.first_response_at \? 'contacted' : 'new'/);
  assert.match(src, /: 'open';\n\s+const inStatus/, 'the Leads page opens on Open (waiting + contacted)');
  assert.match(src, /label: 'Contacted', href: link\(\{ status: 'contacted' \}\)/);
  assert.match(src, /pill\('Contacted', 'blue'\)/);
  assert.match(src, /I already emailed them/);
  assert.match(src, /name="kind" value="email"/, 'that press is an email note, which marks them contacted');
});
