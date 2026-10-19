'use strict';
/* The staff agreement every helper signs before the workspace opens. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const A = require('../tools/lib/staff-agreement');
const STAFF = require('../tools/lib/staff');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('changing the wording needs a new VERSION, so everyone signs the new text', () => {
  /* A signature covers only the text it was given. If this fails you changed
     the agreement: bump VERSION in tools/lib/staff-agreement.js (every helper
     then signs again on their next visit) and put the new hash here. */
  assert.strictEqual(A.VERSION, '2026-10-16');
  assert.strictEqual(A.TEXT_HASH, 'd51297bb2252902bbb225dbe3fa15bcafcf522b255ca74f6c35bdbcd3acde6c7');
});

test('the wording carries the clauses the owner asked for', () => {
  const html = A.agreementHtml();
  assert.match(html, /<h2[^>]*>Staff Confidentiality &amp; Ownership Agreement<\/h2>/);
  assert.match(html, /June&#39;s Tees and Things LLC/);
  assert.match(html, /Section 178\.4 of the Philippine Intellectual Property Code/);
  assert.match(html, /laws of the State of Illinois/);
  assert.match(html, /Portfolio use\./);
  assert.match(html, /Logos and trademarks of others\./);
  assert.match(html, /any sensitive or non-public material or information/);
  assert.match(html, /Data Privacy Act of 2012/);
  assert.doesNotMatch(html, /\[[A-Z ]+\]/, 'no placeholder left in the wording');
});

test('a signature needs a full name, a place and the box ticked', () => {
  const ok = A.signatureFromForm({ signed_name: '  Maria   Santos ', location: 'Quezon City, Metro Manila', agree: '1' });
  assert.deepStrictEqual(ok.problems, []);
  assert.deepStrictEqual(ok.signature, { name: 'Maria Santos', location: 'Quezon City, Metro Manila' });

  const bad = A.signatureFromForm({ signed_name: 'M', location: '', agree: '' });
  assert.strictEqual(bad.signature, null);
  assert.strictEqual(bad.problems.length, 3, bad.problems.join(' | '));

  assert.match(A.signatureFromForm({ signed_name: 'x'.repeat(60) + ' ' + 'y'.repeat(60), location: 'Cebu', agree: '1' }).problems[0], /100 characters/);
  assert.match(A.signatureFromForm({ signed_name: '12 34', location: 'Cebu', agree: '1' }).problems[0], /full legal name/);
  /* Some people have one legal name only: they can sign. */
  assert.deepStrictEqual(A.signatureFromForm({ signed_name: 'Sukarno', location: 'Cebu', agree: '1' }).problems, []);
  assert.match(A.signatureFromForm({ signed_name: 'José Dela Cruz', location: '123', agree: '1' }).problems[0] || '', /city and province/);
  assert.deepStrictEqual(A.signatureFromForm({ signed_name: 'José Dela Cruz', location: 'Davao', agree: '1' }).problems, []);
  assert.strictEqual(A.signatureFromForm().signature, null);
});

test('helpers may open and sign it; only the owner opens someone else\'s copy', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/agreement'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/agreement'], 'any');
  assert.strictEqual(STAFF.ROUTES['GET /admin/agreement/:id'], 'owner');
  assert.strictEqual(STAFF.mayUseRoute({ kind: 'staff', perms: {} }, 'GET', '/admin/agreement/:id'), false);
});

test('until it is signed, every staff page sends a helper to the agreement', () => {
  const start = src.indexOf('async function requireAdmin(');
  const body = src.slice(start, src.indexOf('\nconst orderRateLimit', start));
  const gate = body.indexOf('agreementSigned');
  assert.ok(gate > 0, 'requireAdmin checks the agreement');
  assert.ok(gate > body.indexOf('notOnTeam('), 'after the helper is known');
  assert.ok(gate < body.indexOf('mayUseRoute('), 'before any page opens');
  assert.ok(body.indexOf('cfAccess.owners.includes(email)') < gate, 'the owner is passed before it');
  assert.ok(body.indexOf("'/admin/agreement'", gate) > gate, 'and it sends them to the agreement');
  /* What an unsigned helper may still reach: the agreement, and ending a shift. */
  const lit = src.slice(src.indexOf('const AGREEMENT_ROUTES'));
  const open = JSON.parse(lit.slice(lit.indexOf('['), lit.indexOf(']') + 1).replace(/'/g, '"'));
  assert.deepStrictEqual(open.sort(), ['GET /admin/agreement', 'POST /admin/agreement', 'POST /admin/clock/out', 'POST /admin/clock/ping']);
  for (const k of open) assert.ok(STAFF.ROUTES[k], `${k} is a real route`);
  /* The flag comes from the current wording's row. */
  assert.match(src, /staff_agreements a WHERE a\.staff_id = s\.id AND a\.version = \$4/);
});

test('a signed copy is shown in the wording it was signed under', () => {
  const old = JSON.stringify({ title: 'Old title', sections: [{ title: '1. Old', blocks: [{ p: 'Old <clause>' }] }] });
  const html = A.agreementHtml(old);
  assert.match(html, /Old title/);
  assert.match(html, /Old &lt;clause&gt;/);
  assert.doesNotMatch(html, /Illinois/);
  assert.match(A.agreementHtml('not json'), /could not be read/);
  assert.match(src, /agreementHtml\(row\.wording\)/);
  assert.match(src, /agreementHtml\(mine\.wording\)/);
});

test('a signature is stored once per wording, with the text it covered', () => {
  assert.match(src, /UNIQUE \(staff_id, version\)/);
  assert.match(src, /ON CONFLICT \(staff_id, version\) DO NOTHING/);
  const post = src.slice(src.indexOf("app.post('/admin/agreement'"), src.indexOf("app.get('/admin/agreement/:id'"));
  assert.match(post, /actor\.kind !== 'staff'/, 'only a helper signs');
  assert.match(post, /AGREEMENT\.TEXT_HASH, AGREEMENT\.WORDING/);
  /* Success is said only once a row is known to exist. */
  assert.ok(post.indexOf('RETURNING id') > 0 && post.indexOf('if (!done)') < post.indexOf('agreement is signed'));
});

test('the welcome email tells a new hire to sign it first', () => {
  const W = require('../tools/lib/staff-welcome');
  const { html } = W.welcomeEmail({ name: 'Ana Reyes', role: 'Sales', track: 'Sales', wage: 4,
    signInUrl: 'https://www.jtees.net/admin', siteUrl: 'https://www.jtees.net', details: {} });
  assert.match(html, /sign our <b>staff agreement<\/b>/);
  assert.ok(html.indexOf('staff agreement') < html.indexOf('training</b>'), 'before training');
});
