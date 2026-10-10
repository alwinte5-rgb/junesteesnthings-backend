/* Codex backlog fixes, backend batch 4 (2026-10-10). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#108 a failing tax-position query is reported, not silently zero', () => {
  const f = after('async function taxPositionByMonth(', 6000);
  assert.ok((f.match(/reportError\('tax:position-query'/g) || []).length >= 3);
});
test('#140 an approved held quote whose email failed says so', () => {
  assert.match(after('async function releaseHeldQuote(', 1600), /q\.emailResult = q\.email \? await emailQuote\(q\)/);
  assert.match(src, /The email to the customer did NOT go/);
});
test('#140 the "accept and pay" quote email is not resent on a job with money on it', () => {
  const r = after("app.post('/admin/quote/:code/email'", 1600);
  assert.ok(r.indexOf('Number(q.paid_amount) > 0') > -1 && r.indexOf('Number(q.paid_amount) > 0') < r.indexOf('await emailQuote(q)'));
});
test('#123 a quote credited to a disabled helper keeps that credit on a plain save', () => {
  assert.match(after('function creditField(', 2400), /\(no longer active\)<\/option>/);
  const s = after('async function setSalesCredit(', 1200);
  assert.ok(s.indexOf('Number(cur.credited_to) === to') > -1 && s.indexOf('Number(cur.credited_to) === to') < s.indexOf("'That helper is not active.'"));
});
