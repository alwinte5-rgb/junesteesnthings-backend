'use strict';

/* The team's tools and tasks: the Resources page (links and how to get in,
 * never a password), task progress (Start, then Completed, with a
 * description and how-to), and My Day sections that fold away.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STAFF = require('../tools/lib/staff');
const TRAINING = require('../tools/lib/training');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

test('resources: everyone reads, only the owner edits, and the menu offers it', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/resources'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/resources'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/resources/:id'], 'owner');
  assert.match(src, /\{ key: 'resources',\s+href: '\/admin\/resources',/);
  assert.ok(TRAINING.PAGE_TIPS.resources);
  assert.ok(TRAINING.FEATURES.has('resources'), 'the password-manager step shows now the page exists');
});

test('resources: a helper sees only the tools for everyone and for their own path', () => {
  const page = route("app.get('/admin/resources', requireAdmin");
  assert.match(page, /WHERE \$1::text IS NULL OR audience IN \('all', \$1\)/);
  assert.match(page, /\[owner \? null : TRAINING\.trackOf\(actor\.track\)\]/, 'the path comes from the signed-in helper, never the request');
  assert.match(page, /res\.set\('Cache-Control', 'no-store'\)/);
  assert.match(page, /href="\$\{escEmail\(r\.url\)\}" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(src.slice(src.indexOf('CREATE TABLE IF NOT EXISTS staff_resources'), src.indexOf(')`);', src.indexOf('CREATE TABLE IF NOT EXISTS staff_resources'))),
    /password|secret|token/i, 'no column can hold a login');
});

test('resources: links must be https, every field is capped, and the audience is a known one', () => {
  const start = src.indexOf('const RESOURCE_AUDIENCES = ');
  const code = src.slice(start, src.indexOf("app.get('/admin/resources'", start));
  const ctx = { text: (v, max) => String(v == null ? '' : v).trim().slice(0, max) };
  vm.runInNewContext(`${code}\nthis.f = resourceFromForm;`, ctx);
  const f = ctx.f;
  assert.strictEqual(f({ name: 'COS', url: 'https://coscreatorstudio.com' }).urlOk, true);
  assert.strictEqual(f({ name: 'COS', url: '' }).urlOk, true, 'a tool may have no link');
  for (const bad of ['http://x.com', 'javascript:alert(1)', 'https://x.com/"onmouseover=', 'ftp://x', '//x.com']) {
    assert.strictEqual(f({ name: 'x', url: bad }).urlOk, false, bad);
  }
  assert.strictEqual(f({ name: 'x', audience: '__proto__' }).audience, 'all');
  assert.strictEqual(f({ name: 'x', audience: 'design' }).audience, 'design');
  assert.strictEqual(f({ name: 'x'.repeat(200) }).name.length, 80);
  for (const r of ["app.post('/admin/resources', requireAdmin", "app.post('/admin/resources/:id', requireAdmin"]) {
    assert.match(route(r), /if \(!r\.urlOk\) return back/);
  }
});

test('tasks: a description and how-to, a Start that only the person doing it can press, then Completed', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/tasks/:id/start'], 'any');
  const add = route("app.post('/admin/tasks', requireAdmin");
  assert.match(add, /text\(b\.description, 2000\) \|\| null, text\(b\.how_to, 4000\) \|\| null/);
  const start = route("app.post('/admin/tasks/:id/start', requireAdmin");
  assert.match(start, /if \(!actor \|\| actor\.kind !== 'staff'\) return back/, 'the owner does not start a helper\'s task for them');
  assert.match(start, /AND \(assigned_to = \$2 OR assigned_to IS NULL\)/, 'someone else\'s task is refused');
  assert.match(start, /assigned_to = COALESCE\(assigned_to, \$2\)/, 'an unassigned task becomes theirs');
  assert.match(start, /started_at IS NULL/, 'starting twice keeps the first time');
  assert.match(start, /safeAdminPath\(req\.body && req\.body\.back, '\/admin\/my-day'\)/);
  for (const col of ['description TEXT', 'how_to TEXT', 'started_at TIMESTAMPTZ', 'started_by INTEGER']) assert.ok(src.includes(`'${col}'`), col);
});

test('My Day: task text is escaped, a helper sees Start then Mark completed, and sections fold away', () => {
  const page = route("app.get('/admin/my-day', requireAdmin");
  assert.match(page, /\$\{escEmail\(t\.description\)\}/);
  assert.match(page, /\$\{escEmail\(t\.how_to\)\}/);
  assert.match(page, /me != null && !t\.started_at\s+\? `<form method="post" action="\/admin\/tasks\/\$\{t\.id\}\/start"/);
  assert.match(page, />Start: I accept this task</);
  assert.match(page, /'Mark completed'/);
  assert.match(page, /Completed this week/);
  assert.match(page, /<details class="card md-sec" open data-sec=/);
  assert.match(page, /try\{localStorage\.setItem/, 'a browser that blocks storage still works');
});
