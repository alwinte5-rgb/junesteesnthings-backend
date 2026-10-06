'use strict';

/* What a helper cannot do quietly (tools/lib/fraud-signals.js, the route
 * rules in tools/lib/staff.js, and the handlers in server.js that use them).
 *
 * Owner, 2026-10-06: "add something that keeps the worker from deleting
 * quotes and renaming them and any possible fraud against the business. not
 * just in this area but the whole thing." Then: tax stays automatic unless a
 * certificate is loaded, helpers never gain the money and tax permissions
 * however trained, the designer sees only design work, and every cancelled
 * order comes to the owner to follow up.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FRAUD = require('../tools/lib/fraud-signals');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}
function fn(name) {
  const at = src.indexOf(name);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  return src.slice(at, src.indexOf('\n}\n', at));
}
const helper = (perms) => ({ kind: 'staff', id: 7, perms });

/* ── Outside payment ───────────────────────────────────────────────────── */

test('a message asking to be paid outside the shop is caught', () => {
  for (const t of ['Just Cash App me $40', 'send it to my venmo', 'my zelle is 773-555-0100',
                   'You can pay me directly and skip the fee', 'paypal.me/someone', 'pay me on $janedoe',
                   'zelle it to jane@gmail.com']) {
    assert.ok(FRAUD.mentionsOutsidePayment(t), t);
  }
});

test('ordinary messages about paying the shop are not', () => {
  for (const t of ['Your proof is ready. Reply approved to go ahead.',
                   'You can pay the balance on your quote page: https://www.jtees.net/q/AB12CD',
                   'We take card, cash at pickup, or Zelle to the shop.',
                   'Order AB12CD has a balance of $120.00.']) {
    assert.strictEqual(FRAUD.mentionsOutsidePayment(t), '', t);
  }
});

/* ── Quote history ─────────────────────────────────────────────────────── */

test('a renamed quote reads as a customer-details change, first', () => {
  const before = { name: 'Lincoln High', email: 'coach@lhs.org', phone: '7735550100', total: '480.00', status: 'sent' };
  const after = { ...before, email: 'helper@gmail.com', total: 480 };
  const d = FRAUD.quoteDiff(before, after);
  assert.deepStrictEqual(d.map((x) => x.field), ['email'], 'a number stored as text and as a number is the same');
  assert.strictEqual(d[0].kind, 'contact');
  assert.deepStrictEqual(FRAUD.quoteDiff(before, { ...before }), []);
});

test('changed items are named without dumping the lines', () => {
  const a = { items: [{ description: 'Tee', qty: 24, line_total: 300 }] };
  const b = { items: JSON.stringify([{ description: 'Tee', qty: 12, line_total: 150 }]) };
  assert.deepStrictEqual(FRAUD.quoteDiff(a, b).map((x) => x.field), ['items']);
});

test('the history is written before every change that moves a quote or its money', () => {
  assert.match(fn('async function snapshotQuote('), /to_jsonb\(q\.\*\)/);
  for (const [sig, action] of [
    ["app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin", 'edit'],
    ["app.post('/admin/quote/:code/cancel', requireAdmin", 'cancel'],
    ["app.post('/admin/quote/:code/uncancel', requireAdmin", 'restore'],
    ["app.post('/admin/quote/:code/settle', requireAdmin", 'settle'],
    ["app.post('/admin/quote/:code/mark-paid', requireAdmin", 'payment recorded'],
    ["app.post('/admin/quote/:code/correct-payment', requireAdmin", 'payment corrected'],
    ["app.post('/admin/quote/:code/credit', requireAdmin", 'sales credit'],
  ]) {
    assert.match(route(sig), new RegExp(`snapshotQuote\\((?:code|editing), '${action}'`), `${sig} → ${action}`);
  }
  const save = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  assert.ok(save.indexOf("snapshotQuote(editing, 'edit'") < save.indexOf('UPDATE quotes SET name=$2'), 'before the update, so it keeps the old row');
  assert.doesNotMatch(src, /DELETE FROM quote_revisions/, 'nothing deletes history');
  assert.doesNotMatch(src, /DELETE FROM quotes\b/, 'nothing deletes a quote');
});

test('only the owner puts customer details back, and only the details', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/restore-version'], 'owner');
  const r = route("app.post('/admin/quote/:code/restore-version', requireAdmin");
  assert.match(r, /if \(!isOwner\(\)\) return res\.status\(403\)/);
  assert.match(r, /UPDATE quotes SET name = \$2, email = \$3, phone = \$4 WHERE code = \$1/);
});

/* ── Edit locks ─────────────────────────────────────────────────────────── */

test('a helper cannot rename a quote the customer has, or change an agreed job', () => {
  const sent = { status: 'sent', name: 'Ada Lovelace', email: 'ada@x.com', phone: '(773) 555-0100', items: [{ description: 'Tee', qty: 24, line_total: 300 }], total: '300' };
  const same = { ...sent, phone: '773.555.0100', name: ' Ada  Lovelace ' };
  assert.deepStrictEqual(FRAUD.lockedChanges(sent, same).tried, [], 'formatting is not a change');
  assert.deepStrictEqual(FRAUD.lockedChanges(sent, { ...same, email: 'me@x.com' }).tried, ['the email']);
  assert.deepStrictEqual(FRAUD.lockedChanges(sent, { ...same, items: [{ description: 'Tee', qty: 12, line_total: 150 }], total: 150 }).tried, [],
    'a sent quote not yet accepted can still be repriced');
  const paid = { ...sent, paid_amount: '150.00' };
  assert.deepStrictEqual(FRAUD.lockedChanges(paid, { ...same, items: [{ description: 'Tee', qty: 12, line_total: 150 }], total: 150 }).tried,
    ['the items', 'the total']);
  assert.deepStrictEqual(FRAUD.lockedChanges({ ...sent, status: 'held' }, { ...same, email: 'me@x.com' }).tried, [],
    'a quote the customer has not seen is still the helper\'s to change');
});

test('the quote save refuses a locked change before writing anything', () => {
  const save = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  const lock = save.indexOf('FRAUD.lockedChanges(prior');
  assert.ok(lock > 0 && lock < save.indexOf('UPDATE quotes SET name=$2'));
  assert.match(save, /if \(actor\.kind === 'staff' && prior\)/);
});

/* ── Tax ────────────────────────────────────────────────────────────────── */

test('sales tax is automatic for a helper: the form cannot take it off', () => {
  const save = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  assert.match(save, /const taxable = staffTax\s*\? !\(prior && prior\.taxable === false\)/);
  assert.match(save, /: staffTax \? \(prior\.tax_exempt_ref \|\| null\)/, 'a helper keeps the owner\'s exemption note, never their own');
  assert.match(src, /isOwner\(\) \? '' : ' disabled title="Tax is set automatically"'/, 'the box is locked on the form');
});

test('a certificate a helper attaches waits for the owner and leaves the tax on', () => {
  const r = route("app.post('/admin/quote/:code/certificate', requireAdmin");
  const staffPart = r.slice(r.indexOf('if (!isOwner()) {'), r.indexOf('if (q.taxable !== false)'));
  assert.match(staffPart, /keepCertificate\(v\.cert, \{ source: 'shop', email: q\.email \|\| null, approve: false \}\)/);
  assert.doesNotMatch(staffPart, /attachCertificate|UPDATE quotes/, 'the quote is not touched');
  assert.match(staffPart, /notifyCertificate\(q, cert\)/);
  assert.match(src, /async function keepCertificate\(cert, \{ source, email = null, approve = source === 'shop' \}\)/);
});

/* ── Money ──────────────────────────────────────────────────────────────── */

test('a helper\'s cash payment pays no commission until the owner confirms it', () => {
  const r = route("app.post('/admin/quote/:code/mark-paid', requireAdmin");
  assert.match(r, /UPDATE quote_payments SET recorded_by = \$2, unconfirmed = \$3/);
  assert.match(r, /byStaff \? actor\.id : null, byStaff\]/);
  const lines = fn('async function commissionLines(');
  assert.match(lines, /SUM\(p\.amount\) FILTER \(WHERE NOT p\.unconfirmed\), 0\)::float AS collected/);
  assert.match(lines, /SUM\(p\.amount\) FILTER \(WHERE NOT p\.unconfirmed\)/, 'nor does it make a job paid in full');
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/confirm-payment'], 'owner');
  assert.match(route("app.post('/admin/quote/:code/confirm-payment', requireAdmin"), /if \(!isOwner\(\)\)/);
});

test('corrections, write-offs and moving payments are the owner\'s, twice over', () => {
  for (const [key, sig] of [
    ['POST /admin/quote/:code/correct-payment', "app.post('/admin/quote/:code/correct-payment', requireAdmin"],
    ['POST /admin/quote/:code/settle', "app.post('/admin/quote/:code/settle', requireAdmin"],
    ['POST /admin/unlinked/:id/apply', "app.post('/admin/unlinked/:id/apply', requireAdmin"],
  ]) {
    assert.strictEqual(STAFF.ROUTES[key], 'owner', key);
    assert.ok(STAFF.NEVER_STAFF.includes(key), `${key} can never be granted`);
    assert.match(route(sig), /if \(!isOwner\(\)\)/, `${key} checks again in the handler`);
  }
});

test('a helper\'s discount code stays inside their own limit', () => {
  const trusted = helper(STAFF.presetPerms('trusted'));
  assert.strictEqual(STAFF.discountCodeCap(trusted), 10);
  assert.strictEqual(STAFF.discountCodeCap(helper(STAFF.presetPerms('training'))), 0);
  assert.strictEqual(STAFF.discountCodeCap(helper({ 'quotes.discount': { level: 'on', maxPct: 5 } })), 5);
  const r = route("app.post('/admin/discounts', requireAdmin");
  assert.ok(r.indexOf('STAFF.discountCodeCap(actor)') < r.indexOf('studioFetch('), 'checked before the code exists');
  assert.match(r, /if \(b\.kind !== 'percent'\)/, 'no dollar-off codes from a helper');
});

test('a quote to someone on the team waits for the owner', () => {
  assert.ok(FRAUD.isTeamContact({ email: 'Helper@Gmail.com' }, [{ email: 'helper@gmail.com' }]));
  assert.ok(FRAUD.isTeamContact({ phone: '+1 (773) 555-0100' }, [{ phone: '7735550100' }]));
  assert.ok(!FRAUD.isTeamContact({ email: '', phone: '' }, [{ email: '' }]), 'a blank contact matches nobody');
  const trusted = helper(STAFF.presetPerms('trusted'));
  assert.strictEqual(STAFF.quoteNeedsApproval(trusted, { total: 50, forStaff: true }).held, true);
  assert.strictEqual(STAFF.quoteNeedsApproval(trusted, { total: 50 }).held, false);
});

test('a message asking to be paid outside the shop is held, whatever the helper\'s level', () => {
  const r = route("app.post('/admin/quote/:code/message', requireAdmin");
  assert.match(r, /FRAUD\.mentionsOutsidePayment\(/);
  assert.match(r, /\(actorLevel\('customers\.message'\) === 'approval' \|\| outside\)/);
});

test('only the owner moves sales credit; a helper only reads it', () => {
  const save = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  assert.match(save, /const want = actor\.kind === 'owner' && !derivedCredit \? String\(one\(b\.credit_to\) \|\| ''\)\.trim\(\) : '';/,
    'owner only, and never over the credit the records gave a new quote');
  assert.match(fn('function creditField('), /if \(actor\.kind === 'staff'\) \{/);
});

/* ── Cancelling ─────────────────────────────────────────────────────────── */

test('a helper may cancel only what nothing was agreed or paid on', () => {
  assert.ok(FRAUD.staffMayCancel({ status: 'sent' }));
  assert.ok(!FRAUD.staffMayCancel({ status: 'accepted', accepted_at: new Date() }));
  assert.ok(!FRAUD.staffMayCancel({ status: 'sent', paid_amount: '50' }));
});

test('every cancelled job comes to the owner to follow up', () => {
  const r = route("app.post('/admin/quote/:code/cancel', requireAdmin");
  assert.match(r, /if \(!reason\) return back\(res, backTo, 'err'/, 'a helper says why');
  assert.match(r, /kind: 'cancel_request'/, 'an agreed or paid job becomes a request');
  assert.ok(r.indexOf("kind: 'cancel_request'") < r.indexOf("cancelled_at = NOW()"), 'and is not cancelled');
  assert.match(r, /await raiseFollowup\(\{ kind: 'cancelled'/, 'every cancel, owner\'s too');
  assert.ok(r.indexOf("kind = 'cancel_request' AND done_at IS NULL") < r.indexOf("kind: 'cancelled'"), 'a request is closed by the cancel it asked for');
  const raise = fn('async function raiseFollowup(');
  assert.match(raise, /INSERT INTO owner_followups/);
  assert.match(raise, /sendOwnerSms\(/, 'a helper\'s cancel texts the owner');
  assert.match(raise, /if \(!alert \|\| !byStaff\) return;/, 'the owner is not texted about their own');
  assert.strictEqual(STAFF.ROUTES['POST /admin/followups/:id/done'], 'owner');
});

/* ── Never, at any level ───────────────────────────────────────────────── */

test('no preset reaches anything on the never list', () => {
  for (const name of Object.keys(STAFF.PRESETS)) {
    const h = helper(STAFF.presetPerms(name));
    for (const k of STAFF.NEVER_STAFF) {
      const [method, ...rest] = k.split(' ');
      assert.ok(!STAFF.mayUseRoute(h, method, rest.join(' ')), `${name} → ${k}`);
    }
  }
});

/* ── Designer ───────────────────────────────────────────────────────────── */

test('a designer sees only design jobs', () => {
  for (const name of ['design', 'designer']) {
    const d = helper(STAFF.presetPerms(name));
    for (const r of ['/admin/design', '/admin/design/:code', '/admin/my-day', '/admin/playbook', '/admin/team-chat']) {
      assert.ok(STAFF.mayUseRoute(d, 'GET', r), `${name} opens ${r}`);
    }
    for (const r of ['/admin/production', '/admin/production/:code', '/admin/quotes', '/admin/customers', '/admin/customer',
                     '/admin/orders', '/admin/leads', '/admin/dashboard', '/admin/shipping', '/admin/delivery', '/admin/certificates']) {
      assert.ok(!STAFF.mayUseRoute(d, 'GET', r), `${name} is refused ${r}`);
    }
    for (const r of ['/admin/quote/:code/stage', '/admin/quote/:code/mark-paid', '/admin/leads/add', '/admin/api/quotes|/admin/api/quotes/:code']) {
      assert.ok(!STAFF.mayUseRoute(d, 'POST', r), `${name} cannot ${r}`);
    }
  }
});

test('the designer\'s job page carries no money and no contact details', () => {
  const page = route("app.get('/admin/design/:code', requireAdmin");
  assert.match(page, /designJobFor\(code, currentActor\(\)\)/, 'only a job that is with them');
  assert.doesNotMatch(page, /money\(|q\.email|q\.phone|jobCreditCard|jobHistoryCard|costs/);
  assert.match(page, /firstNameOf\(q\.name\)/);
  assert.match(page, /jobMessagesCard\(q, req\.query, \{ design: true \}\)/);
  assert.doesNotMatch(fn('function designSpecCard('), /money\(|unit_price|line_total|addons/);
  const job = fn('async function designJobFor(');
  assert.match(job, /a\.assigned_to IS NULL OR a\.assigned_to = \$2/);
});

test('a designer writes only to the customers of their own jobs', () => {
  for (const sig of ["app.post('/admin/quote/:code/message', requireAdmin", "app.post('/admin/quote/:code/proofs', requireAdmin"]) {
    assert.match(route(sig), /actorLevel\('quotes\.view'\) !== 'on' && !\(await designJobFor\(code, currentActor\(\)\)\)/, sig);
  }
  for (const sig of ["app.post('/admin/quote/:code/email', requireAdmin", "app.post('/admin/quote/:code/receipt', requireAdmin"]) {
    assert.match(route(sig), /if \(actorLevel\('quotes\.view'\) !== 'on'\) return res\.status\(403\)/, `${sig}: no priced quote or receipt`);
  }
});

test('existing designer accounts are moved onto the design page', () => {
  const init = fn('async function initStaffTables(');
  assert.match(init, /perms - 'quotes\.view' - 'customers\.view' - 'orders\.view' - 'production\.stage'/);
  assert.match(init, /\|\| '\{"jobs\.design":"on"\}'::jsonb/);
  assert.match(init, /COALESCE\(perms->/, 'a missing toggle reads as off, not as no row');
});

/* ── Watch list ─────────────────────────────────────────────────────────── */

test('the watch list reads the records actions leave, and goes out once a day', () => {
  const w = fn('async function watchList(');
  for (const needle of ['FROM quote_revisions r', 'WHERE p.unconfirmed', "'quote edit refused'", "'message held: outside payment'", 'FROM staff_ips i']) {
    assert.ok(w.includes(needle), needle);
  }
  const d = fn('async function sendWatchDigest(');
  assert.ok(d.indexOf("'watch digest sent'") < d.indexOf('sendEmail('), 'claimed before it sends');
  assert.match(src, /await step\('team watch list', sendWatchDigest\);/);
});
