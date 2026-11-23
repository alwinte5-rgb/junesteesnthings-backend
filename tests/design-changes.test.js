'use strict';
/* "Request changes" reaches the designer, and the library's buttons answer in place (2026-11-23). */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const CHANGES = require('../tools/lib/design-changes');
const { registerDesignLibrary } = require('../tools/lib/design-library');

const ELI = { id: 4, name: 'Eli Reyes', email: 'eli@example.test' };
const ANA = { id: 5, name: 'Ana Cruz', email: 'Ana@example.test' };
function deps(designers, over = {}) {
  const sql = [], mail = []; let rang = 0;
  const client = { query: async (q, p) => { sql.push({ q: q.replace(/\s+/g, ' ').trim(), p }); if (over.fail && q.includes('INSERT')) throw Error('db'); return { rows: [], rowCount: 0 }; }, release() {} };
  return { sql, mail, rang: () => rang, d: { pool: { ...client, connect: async () => client }, designersOnRoster: async () => designers, isValidEmail: (e) => /@/.test(e || ''),
    esc: (s) => String(s).replace(/</g, '&lt;'), notifyNow: () => { rang++; }, pinEmail: async (...a) => { if (over.mailFail) throw Error('mail'); mail.push(a); } } };
}
const REQ = { kind: 'template', id: 7, name: 'Trees', note: 'Make it <b>bigger</b>', submittedBy: '' };

test('the submitting designer gets it; unknown submitters go to every designer', () => {
  assert.deepEqual(CHANGES.designersFor([ELI, ANA], 'ana@EXAMPLE.test'), [ANA]);
  assert.deepEqual(CHANGES.designersFor([ELI, ANA], 'gone@example.test'), [ELI, ANA]);
  assert.deepEqual(CHANGES.designersFor([ELI, ANA], ''), [ELI, ANA]);
});
test('a task, a bell and an email with the note, replacing an older open request', async () => {
  const t = deps([ELI]);
  const r = await CHANGES.requestChanges(t.d, REQ);
  assert.deepEqual(r, { told: 1, emailed: 1, names: ['Eli'] });
  const at = (s) => t.sql.findIndex((x) => x.q.includes(s));
  assert.ok(at('UPDATE staff_tasks SET done_at') > at('BEGIN') && at('INSERT INTO staff_tasks') > at('UPDATE staff_tasks') && at('COMMIT') > at('INSERT INTO staff_tasks'));
  const ins = t.sql[at('INSERT INTO staff_tasks')];
  assert.equal(ins.p[1], 4); assert.equal(ins.p[2], REQ.note);
  assert.equal(JSON.parse(ins.p[4]).resources[0].url, '/admin/artwork?item=template-7');
  assert.equal(t.rang(), 1);
  assert.match(t.mail[0][3], /&lt;b>bigger/, 'the note is escaped in the email');
});
test('a lost email still leaves the task; a lost task is reported', async () => {
  const t = deps([ELI], { mailFail: true });
  assert.deepEqual(await CHANGES.requestChanges(t.d, REQ), { told: 1, emailed: 0, names: ['Eli'] });
  const f = deps([ELI], { fail: true });
  await assert.rejects(CHANGES.requestChanges(f.d, REQ));
  assert.ok(f.sql.some((x) => x.q === 'ROLLBACK')); assert.equal(f.mail.length, 0);
  assert.equal((await CHANGES.requestChanges(deps([]).d, REQ)).told, 0);
});

function lib({ owner = true, designers = [ELI], answer, over } = {}) {
  const routes = new Map(), app = { get(p, ...h) { routes.set('GET ' + p, h); }, post(p, ...h) { routes.set('POST ' + p, h); } };
  const t = deps(designers, over), sent = [], admin = () => {}; let changed = 0;
  registerDesignLibrary(app, { requireAdmin: admin, requireInternalKey: () => {}, rawBody: () => () => {}, isOwner: () => owner, adminPage: (_, b) => b, pageHeader: () => '', esc: String,
    getCatalog: async () => ({ products: [] }), notifyAdd: async () => 0, sendEmail: async () => {}, NOTIFY_EMAIL: '', pool: { query: async () => ({ rows: [], rowCount: 0 }), connect: t.d.pool.connect }, invalidate: () => { changed++; },
    designChanges: t.d, studioFetch: async (url, init) => { sent.push(Object.fromEntries(new URLSearchParams((init || {}).body || ''))); const a = answer ? answer(sent[sent.length - 1]) : { ok: true, item: { kind: 'template', id: 7, name: 'Trees', status: 'changes', settings: {} } }; return { ok: !!a.ok, status: a.ok ? 200 : 400, json: async () => a }; } });
  const call = async (path, body, accept = 'application/json') => { const r = { code: 200, set() { return r; }, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, send(b) { r.body = b; return r; }, redirect(c, u) { r.code = c; r.to = u; } }; const h = routes.get('POST ' + path); assert.equal(h[0], admin); await h[1]({ body, headers: { accept } }, r); return r; };
  return { call, sent, t, routes, changed: () => changed };
}
const FORM = { kind: 'template', id: '7', action: 'changes', name: 'Trees', note: 'Bigger' };

test('Request changes says who was told, and needs a note', async () => {
  const s = lib();
  assert.match((await s.call('/admin/design-library', { ...FORM, note: ' ' })).body.error, /Review note/);
  assert.equal(s.sent.length, 0);
  const r = await s.call('/admin/design-library', FORM);
  assert.equal(r.code, 200); assert.match(r.body.message, /Sent to Eli/); assert.equal(r.body.status, 'changes');
  assert.match((await lib({ designers: [] }).call('/admin/design-library', FORM)).body.message, /no one was told/);
  const lost = await lib({ over: { fail: true } }).call('/admin/design-library', FORM);
  assert.equal(lost.body.ok, true); assert.equal(lost.body.warn, true); assert.match(lost.body.message, /could not be told/);
});
test('a plain form post still gets a page, and a studio refusal tells nobody', async () => {
  assert.equal((await lib().call('/admin/design-library', FORM, 'text/html')).code, 303);
  const s = lib({ answer: () => ({ ok: false, error: 'No.' }) });
  const r = await s.call('/admin/design-library', FORM);
  assert.equal(r.code, 400); assert.equal(r.body.error, 'No.'); assert.equal(s.t.mail.length, 0);
});
test('delete and restore: owner only, bounded, exact names, one answer per item', async () => {
  for (const p of ['/admin/design-library/delete', '/admin/design-library/restore']) {
    const no = lib({ owner: false }); assert.equal((await no.call(p, { items: '["template-7"]' })).code, 403); assert.equal(no.sent.length, 0);
    for (const items of ['', '[]', '{}', '["products-7"]', '["template-7; DROP"]', '["../template-7"]', JSON.stringify(Array(101).fill('template-7')), '[7]']) {
      const s = lib(); assert.equal((await s.call(p, { items })).code, 400, p + items); assert.equal(s.sent.length, 0);
    }
  }
  const s = lib({ answer: () => ({ ok: true, done: [{ kind: 'template', id: 7 }], failed: [{ item: 'clipart-8', error: 'Gone.' }] }) });
  const r = await s.call('/admin/design-library/delete', { items: '["template-7","clipart-8"]' });
  assert.deepEqual(r.body, { ok: true, done: ['template-7'], failed: [{ item: 'clipart-8', error: 'Gone.' }] });
  assert.deepEqual(s.sent[0], { action: 'delete', items: '["template-7","clipart-8"]' }); assert.equal(s.changed(), 1);
  assert.equal((await lib({ answer: () => { throw Error('offline'); } }).call('/admin/design-library/delete', { items: '["template-7"]' })).code, 503);
  const STAFF = require('../tools/lib/staff');
  for (const p of ['delete', 'restore']) assert.equal(STAFF.mayUseRoute({ kind: 'staff', id: 4, perms: { 'art.work': 'on' } }, 'POST', '/admin/design-library/' + p), false);
});
test('a proof too big for the file storage is sent smaller; the rest are untouched', async () => {
  const vm = require('node:vm');
  const run = async (w, h, size, type, sizes) => {
    const drawn = [];
    const ctx = { URL: { createObjectURL: () => 'u', revokeObjectURL() {} }, Promise, Math, Image: class { set src(v) { this.naturalWidth = w; this.naturalHeight = h; setImmediate(() => this.onload()); } },
      document: { createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob(cb, t) { drawn.push([this.width, this.height, t]); cb({ size: sizes[drawn.length - 1] }); } }) } };
    const fn = vm.runInNewContext('(' + require('../tools/lib/job-proofs').FIT_FN + ')', ctx);
    const file = { type, size }; const out = await fn(file); return { same: out === file, drawn };
  };
  assert.equal((await run(3000, 3000, 2e6, 'image/png', [])).same, true);
  assert.equal((await run(9000, 9000, 2e6, 'application/pdf', [])).same, true);
  assert.deepEqual((await run(9000, 6000, 2e6, 'image/jpeg', [3e6])).drawn, [[4000, 2667, 'image/jpeg']]);
  const png = await run(6000, 6000, 18e6, 'image/png', [14e6, 8e6]);
  assert.deepEqual(png.drawn, [[4000, 4000, 'image/png'], [3000, 3000, 'image/png']]);
});
