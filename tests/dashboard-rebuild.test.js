'use strict';

/* The dashboard, rebuilt (dashboard plan, Part 4, 2026-11-06).
 *
 * Important things first: what customers and the team are waiting on, then
 * money in and out, how the shop is doing, the Production board in numbers,
 * and the to-do list folded. A panel that fails says so instead of reading
 * "All clear" or $0, and the Money panel reads the same months as Finances.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const STAFF = require('../tools/lib/staff');

function block(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `${anchor} not found in server.js`);
  return src.slice(start, src.indexOf('\n}', start) + 2);
}
function route(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `${anchor} not found in server.js`);
  return src.slice(start, src.indexOf('\n});', start) + 4);
}
const DASH = route("app.get('/admin/dashboard', requireAdmin");

/* ── The order of the page ──────────────────────────────────────────────── */

test('the page runs: needs you now, money, how we are doing, production, to-do, then leads and payments', () => {
  const at = (s) => { const i = DASH.indexOf(s); assert.notStrictEqual(i, -1, s); return i; };
  const order = ['id="needs"', 'id="money"', 'id="doing"', 'id="production"', 'id="todo"', 'Latest leads', 'Recent payments'];
  for (let i = 1; i < order.length; i++) assert.ok(at(order[i - 1]) < at(order[i]), `${order[i - 1]} before ${order[i]}`);
});

test('needs you now has a customers group and a "from your team" group', () => {
  assert.match(DASH, /Customers <span class="muted">/);
  assert.match(DASH, /id="team">From your team/);
  assert.match(DASH, /owner \? many\(`SELECT \*, \(status = 'processing'\) AS interrupted FROM staff_approvals\s+WHERE status = 'pending' OR \(status = 'processing' AND COALESCE\(claimed_at, created_at\) < NOW\(\) - INTERVAL '10 minutes'\)/,
    'the owner\'s, and the same list as /admin/approvals, interrupted ones included');
  assert.match(DASH, /mail && mail\.unreadThreads/, 'a team conversation with something new is its own row');
});

test('paid orders not started and left checkouts are on the customers list', () => {
  assert.match(DASH, /jobStageIndex\(q\) === 0 && Number\(q\.paid_amount \|\| 0\) > 0/);
  assert.match(DASH, /studioLane\(o\) === 0 && !hidden\.has\(`order:\$\{Number\(o\.id\)\}`\)/);
  assert.match(DASH, /!hidden\.has\(`checkout:\$\{Number\(a\.id\)\}`\)/, 'a checkout removed from the board stays off here');
});

test('the to-do list shows five and folds the rest; projects fold too', () => {
  assert.match(DASH, /const TASKS_SHOWN = 5;/);
  assert.match(DASH, /tasks\.slice\(0, TASKS_SHOWN\)/);
  assert.match(DASH, /<a href="\/admin\/tasks">all tasks &rarr;<\/a>/);
  assert.doesNotMatch(DASH, /pill\('overdue'/, 'no overdue pills (Part 1)');
  assert.match(DASH, /<details><summary class="card-title" style="cursor:pointer">Projects/);
});

test('money and how-we-are-doing are the owner\'s only', () => {
  assert.match(DASH, /owner \? safe\(moneyThisAndLast\(\), null, 'money in and out'\) : Promise\.resolve\(undefined\)/);
  assert.match(DASH, /owner \? safe\(howWeAreDoing\(\), null, 'how we are doing'\) : Promise\.resolve\(undefined\)/);
  assert.match(DASH, /\$\{money2 === undefined \? '' :/);
  assert.match(DASH, /\$\{doing === undefined \? '' :/);
});

/* ── A failure says so ──────────────────────────────────────────────────── */

test('a failed panel is named in a banner, and never reads "All clear"', () => {
  assert.match(DASH, /failed\.push\(what\);\s*return fallback;/);
  assert.match(DASH, /Couldn&rsquo;t load: \$\{escEmail\(\[\.\.\.new Set\(failed\)\]\.join\(', '\)\)\}\.<\/b>\s*Numbers below may be incomplete/);
  assert.match(DASH, /: customersFailed\.length \? '' : emptyState\('All clear\. No customer is waiting on you\.'\)/);
  assert.match(DASH, /if \(studioFeed\.error && studioFeed\.error !== 'JT_INTERNAL_KEY not set'\) failed\.push\('studio orders'\);/,
    'a studio feed error shows the same way; a copy with no studio key is not an alarm');
  assert.match(DASH, /value: failed\.includes\('money in'\) \? '—'/, 'a tile that could not load reads a dash, not $0');
  assert.match(DASH, /'money in'\),/, 'the tile and the Money panel fail under their own names');
  assert.match(DASH, /updated \$\{escEmail\(updatedAt\)\}/, 'the time it was read is shown');
});

/* ── From your team, decided in place ───────────────────────────────────── */

test('a request is decided on the dashboard with what it says on screen, then goes back there', () => {
  assert.match(DASH, /<input type="hidden" name="back" value="\/admin\/dashboard#team">/);
  assert.match(DASH, /approvalBody\(a, a\.kind === 'lead_email' \? apLeadBy\[a\.subject_id\] : apQuoteBy\[a\.subject_id\]\)/,
    'the wording of a held message or email is shown before Approve and send');
  assert.match(DASH, /\$\{a\.interrupted \|\| apFailed \? '' : `<form method="post"/, 'no buttons when it was interrupted, or its details could not be read');
  const r = route("app.post('/admin/approvals/:id', requireAdmin");
  assert.match(r, /const backTo = safeAdminPath\(\(req\.body \|\| \{\}\)\.back, '\/admin\/approvals'\);/);
  assert.doesNotMatch(r, /back\(res, '\/admin\/approvals'/, 'every answer goes to backTo');
  assert.strictEqual(STAFF.ROUTES['POST /admin/approvals/:id'], 'owner', 'still the owner\'s alone');
});

/* ── Money: the same months as Finances ─────────────────────────────────── */

test('Finances and the dashboard read one month query', () => {
  assert.match(route('app.get(FINANCES_PATH, requireAdmin'), /const months = await financeMonths\(year\);/);
  assert.match(route('app.get(FINANCES_PATH, requireAdmin'), /const expMonths = await expenseMonths\(year\);/);
  const both = block('async function moneyThisAndLast(');
  assert.match(both, /financeMonths\(y\), expenseMonths\(y\)/);
  assert.match(both, /fm\.quotes_collected/, 'quote money from the same reading, not a second query');
});

function moneyWith(rowsFor) {
  const sandbox = {
    round2: (n) => Math.round((Number(n) || 0) * 100) / 100,
    EXP: require('../tools/lib/expenses'),
    financeMonths: async (y) => rowsFor.finance[y] || [],
    expenseMonths: async (y) => rowsFor.expense[y] || [],
    pool: { query: async () => ({ rows: [rowsFor.months] }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(`this.f = async ${block('function moneyThisAndLast(')}`, sandbox);
  return sandbox.f;
}

test('in, out and kept, this month and last', async () => {
  const f = moneyWith({
    months: { now: '2026-11', last: '2026-10' },
    finance: { 2026: [{ period: '2026-11', collected: '1500', quotes_collected: '1200', costs: '400' },
                      { period: '2026-10', collected: '900', quotes_collected: '900', costs: '0' }] },
    expense: { 2026: [{ period: '2026-11', total: '700', staff: '300' }] },
  });
  const { now, last } = await f();
  assert.strictEqual(now.in.total, 1500);
  assert.strictEqual(now.in.quotes, 1200);
  assert.strictEqual(now.in.other, 300, 'studio and other is what no quote claimed');
  assert.strictEqual(now.out.costs, 400);
  assert.strictEqual(now.out.staff, 300);
  assert.strictEqual(now.out.overheads, 400, 'other costs leave staff pay out, so it is not counted twice');
  assert.strictEqual(now.out.total, 1100);
  assert.strictEqual(now.kept, 400);
  assert.strictEqual(last.in.total, 900);
  assert.strictEqual(last.out.total, 0, 'a month with nothing booked is $0 out');
  assert.strictEqual(last.kept, 900);
});

test('January reads December from the year before', async () => {
  const f = moneyWith({
    months: { now: '2027-01', last: '2026-12' },
    finance: { 2027: [{ period: '2027-01', collected: '100', quotes_collected: '100', costs: '0' }],
               2026: [{ period: '2026-12', collected: '250', quotes_collected: '250', costs: '50' }] },
    expense: {},
  });
  const { now, last } = await f();
  assert.strictEqual(now.in.total, 100);
  assert.strictEqual(last.in.total, 250);
  assert.strictEqual(last.kept, 200);
});

/* ── How we are doing ───────────────────────────────────────────────────── */

function doingWith(rows) {
  const sandbox = { round2: (n) => Math.round((Number(n) || 0) * 100) / 100, pool: { query: async () => ({ rows }) } };
  vm.createContext(sandbox);
  vm.runInContext(`this.f = async ${block('function howWeAreDoing(')}`, sandbox);
  return sandbox.f;
}

test('orders, average order, quotes won and leads answered, against the 30 days before', async () => {
  const f = doingWith([
    { name: 'now', quote_orders: 3, quote_value: '900', studio_orders: 1, studio_value: '100', sent: 10, won: 4, leads: 8, answered: 6 },
    { name: 'before', quote_orders: 0, quote_value: '0', studio_orders: 0, studio_value: '0', sent: 0, won: 0, leads: 0, answered: 0 },
  ]);
  const { now, before } = await f();
  assert.strictEqual(now.orders, 4);
  assert.strictEqual(now.avg, 250);
  assert.strictEqual(now.won, 0.4);
  assert.strictEqual(now.answered, 0.75);
  assert.strictEqual(before.orders, 0);
  assert.strictEqual(before.avg, null, 'no orders: no average, not $0');
  assert.strictEqual(before.won, null);
  assert.strictEqual(before.answered, null);
});

test('the trend figures compare like with like', () => {
  const f = block('async function howWeAreDoing(');
  assert.match(f, /q\.accepted_at >= w\.a AND q\.accepted_at < w\.b\s+AND q\.status NOT IN \('held', 'draft'\) AND q\.cancelled_at IS NULL\)::int AS won/,
    'won is acceptances in the window, not a young cohort judged early');
  assert.match(f, /s\.created_at < LEAST\(w\.b, NOW\(\) - interval '1 day'\)/, 'a lead counts once it has had its day');
  assert.match(f, /u\.order_ref IS NOT NULL AND u\.created_at >= w\.a AND u\.created_at < w\.b\) AS studio_value/,
    'studio money and studio orders read the same rows');
});

test('the mailbox lists each new conversation once, and every one of them', () => {
  const m = block('async function mailDashboard(');
  assert.match(m, /const unreadAll = threads\.filter\(\(t\) => t\.unread\)\.slice\(0, 20\);/);
  assert.match(m, /const unreadThreads = unreadAll\.map/);
  assert.match(DASH, /mail\.readRows \?/, 'the Mailbox card lists the rest, not the new ones again');
});
