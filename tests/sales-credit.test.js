'use strict';

/* Shop lead or a salesperson's own (tools/lib/sales-credit.js and where
 * server.js applies it).
 *
 * Owner, 2026-10-06: "I would like any traffic I bring to be considered mine.
 * But if they bring in their own leads that is considered commission." and
 * "Make sure commission/non commission sales are labeled from the start."
 * Decided with the owner: a customer naming a salesperson waits for the
 * owner's OK; reorders stay the salesperson's for 12 months; shop leads a
 * salesperson closes pay a separate, smaller rate; quotes only.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CREDIT = require('../tools/lib/sales-credit');
const STAFF = require('../tools/lib/staff');
const TEAM = require('../tools/lib/team-metrics');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}
const DAY = 86400000;

/* ── Leads ──────────────────────────────────────────────────────────────── */

test('everything that comes to the shop is the shop\'s', () => {
  assert.strictEqual(CREDIT.classifyLead({ by: 'public' }).sale_type, 'shop');
  assert.strictEqual(CREDIT.classifyLead({ by: 'staff', staffId: 3 }).sale_type, 'shop', 'a DM a helper typed in');
  assert.strictEqual(CREDIT.classifyLead({ by: 'owner', foundIt: true }).sale_type, 'shop');
  // Every public door the database knows about defaults to shop.
  assert.match(src, /ALTER TABLE submissions ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'shop'/);
  assert.match(src, /ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'shop'/);
});

test('a customer a helper found is theirs only if the shop never heard of them', () => {
  const mine = CREDIT.classifyLead({ by: 'staff', staffId: 3, foundIt: true, known: '' });
  assert.deepStrictEqual([mine.sale_type, mine.rep_id], ['rep', 3]);
  const known = CREDIT.classifyLead({ by: 'staff', staffId: 3, foundIt: true, known: 'Already a customer (quote AB12CD, 2026-03-01)' });
  assert.deepStrictEqual([known.sale_type, known.rep_id], ['shop', null]);
  assert.match(known.reason, /Already a customer/);
});

test('the known-customer check names what the shop already has', () => {
  assert.strictEqual(CREDIT.knownReason(null), '');
  assert.strictEqual(CREDIT.knownReason({ quote: null, lead: null, studio: null }), '');
  assert.match(CREDIT.knownReason({ quote: { code: 'AB12CD', created_at: '2026-03-01T00:00:00Z' } }), /quote AB12CD, 2026-03-01/);
  assert.match(CREDIT.knownReason({ lead: { id: 4, created_at: '2026-09-01T00:00:00Z' } }), /contacted the shop/);
  assert.match(CREDIT.knownReason({ studio: { created: '2026-05-05' } }), /ordered online/);
});

test('a website customer who names a salesperson waits for the owner', () => {
  const l = CREDIT.classifyLead({ by: 'public', heardRep: { id: 3, typed: 'Ana' } });
  assert.strictEqual(l.sale_type, 'pending');
  assert.strictEqual(l.rep_id, 3);
  const nobody = CREDIT.classifyLead({ by: 'public', heardRep: { id: null, typed: 'someone tall' } });
  assert.strictEqual(nobody.sale_type, 'pending', 'an unmatched name is still a claim for the owner');
  assert.strictEqual(nobody.rep_id, null);
});

test('a typed name matches one salesperson or nobody', () => {
  const reps = [{ id: 1, name: 'Ana Cruz' }, { id: 2, name: 'Ben Ode' }, { id: 3, name: 'Ana Lee' }];
  assert.strictEqual(CREDIT.matchRep('ben', reps), 2);
  assert.strictEqual(CREDIT.matchRep('Ana', reps), null, 'two Anas: the owner decides');
  assert.strictEqual(CREDIT.matchRep('ana lee', reps), 3);
  assert.strictEqual(CREDIT.matchRep('', reps), null);
  assert.strictEqual(CREDIT.matchRep('x', reps), null);
});

test('"how did you hear about us" keys are the same on the page and the server', () => {
  const keys = [...html.matchAll(/<select id="f-heard" name="heard_from">([\s\S]*?)<\/select>/g)][0][1]
    .match(/value="([a-z_]*)"/g).map((v) => v.slice(7, -1)).filter(Boolean);
  assert.deepStrictEqual(keys, Object.keys(CREDIT.HEARD_FROM));
  assert.strictEqual(CREDIT.heardFromIn('rep'), 'rep');
  assert.strictEqual(CREDIT.heardFromIn('<script>'), null);
  assert.match(html, /name="heard_rep" maxlength="80"/);
});

/* ── Quotes ─────────────────────────────────────────────────────────────── */

test('a quote takes the label of the lead it answers', () => {
  assert.deepStrictEqual(CREDIT.classifyQuote({ lead: { sale_type: 'rep', rep_id: 3 }, builder: 9 }),
    { sale_type: 'rep', credited_to: 3, reason: 'Their own lead' });
  const shop = CREDIT.classifyQuote({ lead: { sale_type: 'shop', rep_id: null }, builder: 9 });
  assert.deepStrictEqual([shop.sale_type, shop.credited_to], ['shop', 9], 'credited to who built it, at the shop rate');
  assert.strictEqual(CREDIT.classifyQuote({ lead: { sale_type: 'pending', rep_id: 3 }, builder: 9 }).sale_type, 'pending');
  assert.deepStrictEqual([CREDIT.classifyQuote({ builder: null }).sale_type, CREDIT.classifyQuote({ builder: null }).credited_to], ['shop', null]);
});

test('a salesperson\'s customer reordering within 12 months stays theirs', () => {
  const now = Date.parse('2026-10-06T12:00:00Z');
  const first = (daysAgo) => ({ rep_id: 3, code: 'AB12CD', at: new Date(now - daysAgo * DAY).toISOString() });
  const in11 = CREDIT.classifyQuote({ reorder: first(335), lead: { sale_type: 'shop' }, builder: 9, now });
  assert.deepStrictEqual([in11.sale_type, in11.credited_to], ['rep', 3], 'even back through the website');
  const in13 = CREDIT.classifyQuote({ reorder: first(395), lead: null, builder: 9, now });
  assert.deepStrictEqual([in13.sale_type, in13.credited_to], ['shop', 9]);
  assert.strictEqual(CREDIT.REORDER_DAYS, 365);
});

test('the quote save labels a new quote once, from the records', () => {
  const save = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  const at = save.indexOf('CREDIT.classifyQuote(');
  assert.ok(at > 0);
  assert.match(save, /if \(!QUOTE_CODE_RE\.test\(editing\)\) \{\s*try \{/, 'new quotes only: an edit never relabels');
  assert.match(save, /x\.sale_type = 'rep' AND x\.credited_to > 0 AND x\.accepted_at IS NOT NULL/, 'the first ACCEPTED rep sale starts the 12 months');
  assert.ok(at < save.indexOf('setSalesCredit('), 'labelled before any credit the owner names on the form');
});

/* ── Rates and payouts ─────────────────────────────────────────────────── */

test('the rate follows the label', () => {
  const s = { commission_pct: 8, shop_commission_pct: 2 };
  assert.strictEqual(CREDIT.rateFor('rep', s), 8);
  assert.strictEqual(CREDIT.rateFor('shop', s), 2);
  assert.strictEqual(CREDIT.rateFor('pending', s), 0);
  assert.strictEqual(CREDIT.rateFor('bogus', s), 0);
});

test('a sale waiting for the owner is never payable', () => {
  const st = TEAM.commissionState({ paidInFull: true, lastMoneyAt: '2026-01-01', disputeOpen: false, alreadyPaid: false, needsOk: true,
    now: Date.parse('2026-10-06') });
  assert.strictEqual(st, 'needs your OK');
  const lines = src.slice(src.indexOf('async function commissionLines('), src.indexOf('\n}\n', src.indexOf('async function commissionLines(')));
  assert.match(lines, /const pct = CREDIT\.rateFor\(r\.sale_type, rates \|\| \{\}\)/);
  assert.match(lines, /needsOk: r\.sale_type === 'pending'/);
  assert.match(route("app.post('/admin/commission/pay', requireAdmin"), /filter\(\(l\) => l\.state === 'payable' && l\.amount > 0\)/);
});

/* ── Who may change a label ────────────────────────────────────────────── */

test('only the owner relabels, with a reason, and never after it is paid', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/sale-type'], 'owner');
  assert.ok(STAFF.NEVER_STAFF.includes('POST /admin/quote/:code/sale-type'));
  const r = route("app.post('/admin/quote/:code/sale-type', requireAdmin");
  assert.match(r, /if \(!isOwner\(\)\) return res\.status\(403\)/);
  assert.match(r, /if \(q\.sale_type !== 'pending' && !why\)/, 'a relabel says why; approving a claim need not');
  assert.match(r, /NOT EXISTS \(SELECT 1 FROM commission_payouts c WHERE c\.quote_code = \$1\)/);
  assert.match(r, /snapshotQuote\(code, 'sale label'/);
});

test('a helper must say where a hand-added lead came from, and the records decide', () => {
  const r = route("app.post('/admin/leads/add', requireAdmin");
  assert.match(r, /if \(isStaff && !\['shop', 'found'\]\.includes\(origin\)\)/);
  assert.match(r, /CREDIT\.knownReason\(await seenCustomer\(\{ email, phone \}\), fmtDate\)/);
  assert.match(r, /A lead you found needs their email or phone/, 'nothing to check means nothing to claim');
});

test('labels show wherever a lead or sale is listed', () => {
  assert.match(src, /saleTypePill\(l\.sale_type \|\| 'shop'\)/, 'lead cards');
  assert.match(src, /saleTypePill\(q\.sale_type \|\| 'shop'\)/, 'the quote board');
  assert.match(src, /await jobSaleTypeHtml\(q, everyone\)/, 'the job page');
  assert.match(src, /<td>\$\{saleTypePill\(l\.sale_type\)\} <span class="muted">\$\{l\.pct\}%<\/span><\/td>/, 'the owner\'s commission page');
});
