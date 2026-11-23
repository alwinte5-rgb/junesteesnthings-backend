'use strict';

/* Studio orders have the job page's messages (owner, 2026-11-23: "the customers
 * from the studio need to have the same customer production communicator"),
 * and the cut sheet maker is on the dashboard. End to end: the jtees-e2e
 * harness, run-studiojobs.cjs. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const J = require('../tools/lib/studio-jobs');
const C = require('../tools/lib/cut-sheets');
const I = require('../tools/lib/inbound-email');
const R = require('../tools/lib/text-relay');
const A = require('../tools/lib/owner-alerts');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const QUOTE_CODE_RE = /^(?:[A-Z0-9]{6}|[A-Z0-9]{10})$/;

test('a studio order\'s key can never be a quote code', () => {
  assert.strictEqual(J.keyOf(12), 'STUDIO-12');
  for (const bad of [0, -1, '12a', '', null, undefined, '1234567890', '1.5', ' ', '0012']) assert.strictEqual(J.keyOf(bad), '', String(bad));
  assert.strictEqual(J.idOf('studio-12'), 12);
  assert.strictEqual(J.idOf('AB12CD'), 0);
  for (const id of [1, 12, 999999999]) assert.ok(!QUOTE_CODE_RE.test(J.keyOf(id)));
  assert.strictEqual(J.labelOf('STUDIO-12'), '#12');
  assert.strictEqual(J.labelOf('AB12CD'), 'AB12CD');
  assert.strictEqual(J.adminPath('STUDIO-12'), '/admin/studio/12');
  assert.strictEqual(J.adminPath('AB12CD'), '/admin/production/AB12CD');
});

test('who placed each order is kept, with paid only when money came in', () => {
  const list = J.contacts([{ id: 12, name: 'Kim', email: 'Kim@X.com ', phone: '+1 (312) 555-0199', paid: 20, created: '2026-11-20 10:00:00' },
    { id: 14, name: 'Una', paid: 0, ship_to: { phone: '3125550144' } }, { id: 'x' }], [{ id: 9, email: 'l@x.com' }]);
  assert.deepStrictEqual(list.map((c) => [c.id, c.email, c.phone, c.paid]), [[9, 'l@x.com', '', false], [12, 'kim@x.com', '3125550199', true], [14, '', '3125550144', false]]);
});

test('what can be started: never unpaid, refunded, cancelled, shipped, or waiting on a certificate', () => {
  const o = { status: 'processing', paid: 50, refunded: 0, tax_exempt: '' };
  assert.strictEqual(J.startBlock(o), '');
  assert.strictEqual(J.startBlock({ ...o, refunded: 10 }), '', 'a part refund is still work');
  assert.strictEqual(J.startBlock(null), 'gone');
  assert.strictEqual(J.startBlock({ ...o, paid: 0 }), 'unpaid');
  assert.strictEqual(J.startBlock({ ...o, refunded: 50 }), 'refunded');
  assert.strictEqual(J.startBlock({ ...o, status: 'cancel' }), 'cancelled');
  assert.strictEqual(J.startBlock({ ...o, status: 'shipped' }), 'out');
  assert.strictEqual(J.startBlock({ ...o, tax_exempt: 'pending' }), 'certificate');
  for (const w of ['gone', 'unpaid', 'refunded', 'cancelled', 'out', 'certificate', 'failed']) assert.ok(src.includes(`'stage-${w}': '`), `the board has words for ${w}`);
});

test('money refunded is never shown as owed', () => {
  assert.strictEqual(J.dueOn({ total: 60, paid_amount: 60, refunded: 60 }), 0);
  assert.strictEqual(J.dueOn({ total: 60, paid_amount: 30 }), 30);
});

test('a reply goes to what the shop last wrote about, else the newer', () => {
  const studio = { code: 'STUDIO-12', at: '2026-11-01' }, quote = { code: 'AB12CD', at: '2026-11-10' };
  assert.strictEqual(J.pickJob({ studio, quote }), 'AB12CD');
  assert.strictEqual(J.pickJob({ studio, quote, lastOut: 'STUDIO-12' }), 'STUDIO-12');
  assert.strictEqual(J.pickJob({ studio: { ...studio, at: '2026-11-20' }, quote }), 'STUDIO-12');
  assert.strictEqual(J.pickJob({ studio: { ...studio, at: '2026-11-20' }, quote, lastOut: 'AB12CD' }), 'AB12CD');
  assert.strictEqual(J.pickJob({ studio: null, quote }), 'AB12CD');
  assert.strictEqual(J.pickJob({ studio, quote: null }), 'STUDIO-12');
});

test('email replies: an address of its own, filed only for who the shop wrote to', () => {
  assert.strictEqual(I.replyAddress('STUDIO-12', 'reply.jtees.net'), 'studio-12@reply.jtees.net');
  assert.strictEqual(I.replyAddress('AB12CD', 'reply.jtees.net'), 'order-ab12cd@reply.jtees.net');
  const to = (a) => ({ To: [{ Address: a }] });
  assert.strictEqual(I.studioFrom(to('studio-12@reply.jtees.net'), 'reply.jtees.net'), 12);
  for (const bad of ['studio-0@reply.jtees.net', 'studio-12@evil.com', 'studio-12x@reply.jtees.net', 'order-ab12cd@reply.jtees.net']) assert.strictEqual(I.studioFrom(to(bad), 'reply.jtees.net'), 0, bad);
  assert.strictEqual(I.codeFrom(to('studio-12@reply.jtees.net'), 'reply.jtees.net', QUOTE_CODE_RE), '');
  const keep = src.slice(src.indexOf('async function keepInboundEmail('), src.indexOf('const recentInbound = new Set();'));
  assert.match(keep, /FROM client_emails WHERE quote_code = \$1 AND lower\(trim\(to_email\)\) = \$2 AND status = 'sent'/);
  assert.match(keep, /if \(m\.from && rows\.length\) quote = key;\s+else otherStudio = studioId;/);
});

test('the owner answering STUDIO-12 from her phone never reaches the last texter', () => {
  const now = Date.now(), at = new Date(now - 60000).toISOString();
  const forwards = [{ phone: '+13125550100', quote_code: 'AB12CD', created_at: at }, { phone: '+13125550199', quote_code: 'STUDIO-12', created_at: new Date(now - 3600000).toISOString() }];
  const p = R.pickTarget(forwards, 'studio-12 thank you', QUOTE_CODE_RE, now);
  assert.strictEqual(p.to.quote_code, 'STUDIO-12');
  assert.strictEqual(p.body, 'thank you');
});

test('alerts and permissions: the order page, for whoever sees studio orders', () => {
  const [r] = A.customerAlerts({ replies: [{ code: 'STUDIO-12', name: 'Kim', body: 'hi', last_in: '2026-11-23' }] });
  assert.strictEqual(r.href, '/admin/studio/12#messages');
  const as = (preset) => ({ kind: 'staff', id: 1, perms: STAFF.presetPerms(preset) });
  assert.ok(STAFF.mayUseRoute(as('training'), 'GET', '/admin/studio/:id'));
  assert.ok(!STAFF.mayUseRoute(as('design'), 'GET', '/admin/studio/:id'), 'a designer sees no prices or contact details');
  assert.ok(!STAFF.mayUseRoute(as('training'), 'POST', '/admin/studio/:id/stage'));
  for (const r2 of ['GET /admin/cut-sheets', 'POST /admin/cut-sheets/make', 'GET /admin/cut-sheets/job/:job']) assert.strictEqual(STAFF.ROUTES[r2], 'owner');
  /* A designer may message customers, so each message route checks orders.view itself. */
  assert.match(src, /const messageRoute = async[\s\S]{0,1400}await mayMessageJob\(code\)/);
  assert.match(src, /const repliesHandled = async[\s\S]{0,300}await mayMessageJob\(code\)/);
});

test('only the studio\'s own cut sheet files are ever linked', () => {
  const base = 'https://design.example', job = 'a1'.repeat(12);
  const s = (k) => `${base}/data/orders/cutsheets/${job}/sheet1-${k}.pdf`;
  const good = { print: s('print'), cut: s('cut'), combined: s('combined'), count: 3 };
  assert.deepStrictEqual(C.shape({ status: 'done', sheets: [good], skipped: [['a.png', 'no shape']] }, base, job), { status: 'done', sheets: [good], skipped: ['a.png (no shape)'] });
  for (const bad of ['javascript:alert(1)', 'https://evil.example/x.pdf', `${base}/data/orders/cutsheets/${job}/../../x/sheet1-print.pdf`, `${base}/data/orders/cutsheets/${'b2'.repeat(12)}/sheet1-print.pdf`]) {
    assert.strictEqual(C.shape({ status: 'done', sheets: [{ ...good, print: bad }] }, base, job).status, 'failed', bad);
  }
  assert.strictEqual(C.shape({ status: 'failed', errors: [] }, base, job).errors.length, 1, 'a failure always says something');
  assert.strictEqual(C.shape(null, base, job).status, 'failed');
  assert.strictEqual(C.shape({ status: 'working' }, base, job).status, 'working');
  const page = C.pageHtml({ pageHeader: () => '' });
  assert.doesNotMatch(page, /innerHTML/);
});
