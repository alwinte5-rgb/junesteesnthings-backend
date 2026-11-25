/* Quotes board by follow-up stage, and "Follow up now" (owner, 2026-11-24:
 * "I can't tell whats new and what not and who has been contacted. Also is
 * there any way to followup with the quotes after they are sent"). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (needle, n) => { const i = src.indexOf(needle); assert.ok(i > -1, needle); return src.slice(i, i + n); };
const STAFF = require('../tools/lib/staff');

test('the follow-up route is admin-only, staff-gated, claimed once, and honest when nothing went out', () => {
  const r = after("app.post('/admin/quote/:code/follow-up'", 4000);
  assert.match(r, /requireAdmin/);
  assert.match(r, /QUOTE_CODE_RE\.test\(code\)/);
  /* One UPDATE claims it: a double click or two staff send it once. */
  assert.match(r, /followed_up_at IS NULL OR followed_up_at < NOW\(\) - INTERVAL '1 hour'/);
  assert.match(r, /status IN \('sent', 'viewed'\)/);
  assert.match(r, /accepted_at IS NULL AND cancelled_at IS NULL/);
  /* Nothing sent: the stamp goes back, so the board never claims a follow-up. */
  assert.match(r, /if \(!said\.length\) \{[\s\S]*UPDATE quotes SET followed_up_at = \$2, reminders_skipped = \$4/);
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/follow-up'], 'quotes.manage');
  /* A hand follow-up clears an earlier skip; a rollback never undoes another send. */
  assert.match(r, /array_remove\(COALESCE\(reminders_skipped, '\{\}'\), 'follow-up'\)/);
  assert.match(r, /WHERE code = \$1 AND followed_up_at::text = \$3/);
  assert.match(r, /RETURNING \*, followed_up_at::text AS claimed_at/);
}); 

test('the automatic sweep claims each quote and counts from when it was sent', () => {
  const sw = after('async function sendQuoteFollowUps(', 2500);
  assert.match(sw, /WHERE id=\$1 AND followed_up_at IS NULL/);
  assert.match(sw, /if \(!rowCount\) continue;/);
  assert.match(sw, /COALESCE\(sent_to_customer_at, viewed_at, created_at\) <= NOW\(\)/);
  assert.match(src, /FILTER \(WHERE status IN \('sent', 'delivered'\)\) AS last_out/, 'only delivered messages count as contact');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'tools', 'lib', 'staff.js'), 'utf8'),
    /'POST \/admin\/quote\/:code\/follow-up': 'quotes\.manage'/);
});

/* sendQuoteFollowUp against fake senders. */
function load(over = {}) {
  const fn = after('async function sendQuoteFollowUp(', 4000);
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
  const calls = { sms: [], email: [] };
  const ctx = {
    console: { log() {}, error() {} }, Date,
    sendCustomerSms: async (m) => { calls.sms.push(m); return over.sms || 'sent'; },
    sendClientEmail: async (m) => { if (over.emailThrows) throw new Error('x'); calls.email.push(m); },
    isUnsubscribed: async () => !!over.unsub,
    SMS: { quoteFollowup: () => ({ template: 'quote-followup', body: 'hi' }) },
    quoteLink: (c) => 'https://www.jtees.net/q/' + c,
    quoteMessages: () => ({ followup: 'Hi — just checking in' }), quoteTotals: () => ({ total: 100 }),
    money: (n) => '$' + n, escEmail: String, SHOP_PHONE: 'x', SHOP_NAME: 'x', SHOP_SIGNER: 'x',
  };
  vm.createContext(ctx);
  vm.runInContext(body + '\nthis.f = sendQuoteFollowUp;', ctx);
  return { f: ctx.f, calls };
}

test('a follow-up by hand uses its own text ref, so the duplicate guard does not drop it', async () => {
  const { f, calls } = load();
  const q = { code: 'ABCDEF', name: 'Ann', email: 'a@b.co', phone: '3125550199' };
  assert.deepStrictEqual({ ...(await f(q)) }, { text: 'sent', email: 'sent' });
  assert.strictEqual(calls.sms[0].ref, 'quote:ABCDEF', 'the automatic one keeps its ref');
  await f(q, { again: true });
  assert.match(calls.sms[1].ref, /^quote:ABCDEF:fu[0-9a-z]+$/);
  assert.ok(calls.sms[1].ref.length <= 80);
});

test('an unsubscribed email or a failed send is reported, not counted as sent', async () => {
  const q = { code: 'ABCDEF', email: 'a@b.co', phone: '' };
  assert.deepStrictEqual({ ...(await load({ unsub: true }).f(q)) }, { text: 'none', email: 'opted-out' });
  assert.deepStrictEqual({ ...(await load({ emailThrows: true }).f(q)) }, { text: 'none', email: 'failed' });
});

test('the board splits waiting quotes by stage, names held plainly, and shows its messages', () => {
  const board = after('async function renderBoard(', 60000);
  for (const g of ["group('Not sent yet'", "group('New — not followed up yet'", "group('Followed up — no answer yet'", "group('Gone quiet'"]) {
    assert.ok(board.includes(g), g);
  }
  assert.ok(!board.includes("group('Waiting on the customer'"), 'the one long list is gone');
  assert.match(board, /st === 'held' \? 'needs your approval'/);
  assert.match(board, /\+ flash\(req\.query\)/, 'Follow up now and Reinstate results show on the board');
  assert.match(board, /\$\{contactLine\(q\)\}/);
  assert.match(board, /\$\{followUpForm\(q\)\}/);
});

test('a helper\'s held or draft quote keeps its lead on the board until the owner answers (owner, 2026-11-24)', () => {
  const LB = require('../tools/lib/lead-board');
  const no = () => false;
  assert.strictEqual(LB.bucketOf({ lead_status: 'contacted', pending_quote: 'ABCDEF1234' }, no), 'answer');
  assert.strictEqual(LB.bucketOf({ lead_status: 'new', pending_quote: 'ABCDEF1234' }, () => true), 'answer');
  assert.strictEqual(LB.bucketOf({ lead_status: 'quoted', pending_quote: 'ABCDEF1234' }, no), 'quoted');
  assert.strictEqual(LB.bucketOf({ lead_status: 'dismissed', pending_quote: 'ABCDEF1234' }, no), 'dismissed', 'a person\'s dismissal stands');
  /* Neither automatic let-go takes a lead whose quote waits. */
  const sweep = after('async function sendLeadFollowUps(', 6000);
  assert.ok((sweep.match(/\$\{LEAD_QUOTE_PENDING\}/g) || []).length >= 2, 'the follow-up sweep and its let-go skip it');
  assert.match(after('async function letGoOldContactsOnce(', 3000), /\$\{LEAD_QUOTE_PENDING\}/);
  assert.match(src, /const LEAD_QUOTE_PENDING = `q\.status IN \('held', 'draft'\) AND q\.cancelled_at IS NULL`;/);
  /* The ones already let go come back once; a lead a person dismissed does not. */
  const fix = after('async function restorePendingQuoteLeadsOnce(', 1600);
  assert.match(fix, /s\.dismiss_reason IN \(\$1::text, \$2::text\)/);
  assert.match(fix, /\[LEADFU\.OLD_CONTACT_REASON, LEADFU\.LET_GO_REASON\]/);
});

test('shop-lead sales are the shop\'s; the owner\'s own credit choices and paid commission are left alone', () => {
  const once = after("('shop-sales-credit-shop')", 1100);
  assert.match(once, /q\.sale_type = 'shop' AND \(q\.credited_to > 0 OR q\.credited_to IS NULL\)/);
  assert.match(once, /a\.action = 'sales credit' AND a\.staff_id IS NULL/);
  /* The boot backfill and the save never hand a shop sale to a helper. */
  assert.match(src, /AND COALESCE\(sale_type, 'shop'\) <> 'shop'`\);/);
  assert.match(src, /staffId && q\.credited_to == null && derivedCredit \? String\(staffId\)/);
  /* Reinstate records a skip, not a follow-up; calls are not replies. */
  assert.match(after("app.post('/admin/quote/:code/reinstate'", 2500), /array_append\(COALESCE\(reminders_skipped, '\{\}'\), 'follow-up'\)/);
  assert.match(src, /FROM sms_messages WHERE quote_code = ANY\(\$1\) AND template <> 'call'/);
  assert.match(once, /commission_payouts/);
  assert.match(once, /a\.action = 'POST \/admin\/quote\/:code\/credit'/);
});

test('one Approvals page: held quotes with no request, designer questions and library designs join it, and the badge counts them (owner, 2026-11-25)', () => {
  assert.match(src, /const ORPHAN_HELD_SQL = `SELECT q\.code/);
  const orphan = after('const ORPHAN_HELD_SQL =', 900);
  assert.match(orphan, /q\.status = 'held' AND q\.cancelled_at IS NULL/);
  assert.match(orphan, /a\.status IN \('pending', 'processing'\)/);
  const page = after("app.get('/admin/approvals'", 6000);
  assert.match(page, /\$\{await teamWaitingCard\(roster\)\}/);
  const card = after('async function teamWaitingCard(', 3500);
  for (const what of ['held quotes', 'designer questions', 'library designs']) assert.ok(card.includes(`read('${what}'`), what);
  assert.match(src, /WHERE a\.status IN \('submitted', 'needs_info'\) AND q\.cancelled_at IS NULL\)\s*\+ \(SELECT COUNT\(\*\) FROM \(\$\{ORPHAN_HELD_SQL\}\) h\) AS n/);
  assert.ok(orphan.includes('q.created_by IS NOT NULL'), 'a partner reorder is not a helper request');
  assert.ok(orphan.includes("<> 'rejected'"), 'a quote sent back waits on the helper, not the owner');
  /* One list: the alert list carries them to the dashboard and the bell. */
  assert.ok(src.includes("part('held quotes', heldP, null)"));
  assert.ok(src.includes("approval: ['art', 'held quotes']"));
  const OA = require('../tools/lib/owner-alerts');
  const [row] = OA.heldAlerts([{ code: 'ABCDEF1234', name: 'Ann', created_by: 6 }], [{ id: 6, name: 'Myra' }]);
  assert.deepStrictEqual([row.group, row.kind, row.ref, row.href], ['approvals', 'approval', 'held:ABCDEF1234', '/admin/quote/ABCDEF1234/edit']);
  assert.match(row.title, /^Myra's quote ABCDEF1234 is held$/);
});
