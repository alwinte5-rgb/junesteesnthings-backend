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
  const r = after("app.post('/admin/quote/:code/follow-up'", 3000);
  assert.match(r, /requireAdmin/);
  assert.match(r, /QUOTE_CODE_RE\.test\(code\)/);
  /* One UPDATE claims it: a double click or two staff send it once. */
  assert.match(r, /followed_up_at IS NULL OR followed_up_at < NOW\(\) - INTERVAL '1 hour'/);
  assert.match(r, /status IN \('sent', 'viewed'\)/);
  assert.match(r, /accepted_at IS NULL AND cancelled_at IS NULL/);
  /* Nothing sent: the stamp goes back, so the board never claims a follow-up. */
  assert.match(r, /if \(!said\.length\) \{[\s\S]*UPDATE quotes SET followed_up_at = \$2 WHERE code = \$1/);
  assert.strictEqual(STAFF.ROUTE_PERMS ? STAFF.ROUTE_PERMS['POST /admin/quote/:code/follow-up'] : 'quotes.manage', 'quotes.manage');
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
