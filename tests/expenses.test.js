/* Overheads by month, and monthly costs that carry forward on their own
 * (tools/lib/expenses.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The failure this replaces was quiet: a monthly cost was carried only by a
 * button that copied LAST month, so one month nobody pressed it (September
 * 2026) left every month after it rent-free, and "fixed costs a month" added
 * up every monthly entry in the year. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../tools/lib/expenses');

const rent = { id: 1, day: '2026-08-01', category: 'Rent', amount: 595, recurs: true };
const phone = { id: 2, day: '2026-08-08', category: 'Utilities', amount: 150, note: 'Phone', recurs: true };
const signs = { id: 3, day: '2026-08-28', category: 'Materials', amount: 300, vendor: 'Sign Outlet', recurs: false };
const show = (plan) => plan.map((e) => `${e.day} ${e.category} ${e.amount}`);

test('a missed month heals: August carries into September AND October', () => {
  assert.deepStrictEqual(show(E.planRoll([rent, phone, signs], '2026-10')), [
    '2026-09-01 Rent 595', '2026-09-08 Utilities 150', '2026-10-01 Rent 595', '2026-10-08 Utilities 150',
  ]);
});

test('a one-off cost is never carried', () => {
  assert.ok(!E.planRoll([rent, signs], '2026-10').some((e) => e.category === 'Materials'));
});

test('running it again adds nothing', () => {
  const rows = [rent, phone];
  const once = E.planRoll(rows, '2026-12');
  assert.deepStrictEqual(E.planRoll(rows.concat(once), '2026-12'), []);
});

test('a cost already entered for the month by hand is not added again', () => {
  const typed = { id: 9, day: '2026-09-03', category: 'Rent', amount: 610, recurs: true };
  const plan = E.planRoll([rent, typed], '2026-10');
  assert.deepStrictEqual(show(plan), ['2026-10-03 Rent 610'], 'and October follows the latest figure and day');
});

test('unticking monthly on the latest entry stops it from then on', () => {
  const sep = { id: 5, day: '2026-09-01', category: 'Rent', amount: 595, recurs: false };
  assert.deepStrictEqual(E.planRoll([rent, sep], '2026-12'), []);
});

test('deleting it from one month removes that month only', () => {
  const skips = new Set([`2026-09#${E.seriesKey(rent)}`]);
  assert.deepStrictEqual(show(E.planRoll([rent], '2026-10', skips)), ['2026-10-01 Rent 595']);
});

test('two monthly costs in one category are both carried', () => {
  const claude = { id: 6, day: '2026-08-08', category: 'Software', amount: 100, note: 'Claude', recurs: true };
  const adobe = { id: 7, day: '2026-08-08', category: 'Software', amount: 60, note: 'Adobe', recurs: true };
  assert.strictEqual(E.planRoll([claude, adobe], '2026-09').length, 2);
});

test('the 31st lands on the last day of a shorter month, and a new year follows December', () => {
  const late = { id: 8, day: '2026-01-31', category: 'Rent', amount: 1, recurs: true };
  assert.deepStrictEqual(E.planRoll([late], '2026-03').map((e) => e.day), ['2026-02-28', '2026-03-31']);
  assert.strictEqual(E.nextYm('2026-12'), '2027-01');
});

test('nothing is added past this month', () => {
  assert.ok(E.planRoll([rent], '2026-10').every((e) => e.day <= '2026-10-31'));
  assert.deepStrictEqual(E.planRoll([rent], '2026-08'), []);
});

test('fixed costs a month are this month\'s monthly entries, not the year added up', () => {
  const rows = [rent, phone].concat(E.planRoll([rent, phone], '2026-10'));
  assert.strictEqual(E.fixedMonthly(rows, '2026-10'), 745);
  assert.strictEqual(E.fixedMonthly([], '2026-10'), 0);
});

test('entries grouped by month, newest first, with totals and categories', () => {
  const rows = [rent, phone, signs, { id: 4, day: '2026-09-01', category: 'Rent', amount: 595, recurs: true }];
  const g = E.byMonth(rows);
  assert.deepStrictEqual(g.map((m) => [m.ym, m.total, m.entries.length]), [['2026-09', 595, 1], ['2026-08', 1045, 3]]);
  assert.deepStrictEqual(g[1].categories.map((c) => c.category), ['Rent', 'Materials', 'Utilities']);
  assert.deepStrictEqual(g[1].entries.map((e) => e.id), [3, 2, 1], 'newest day first inside a month');
  assert.strictEqual(E.monthLabel('2026-10'), 'October 2026');
});

test('the server fills months on its own, remembers deletions, and lists by month', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const fin = src.slice(src.indexOf('app.get(FINANCES_PATH'), src.indexOf('app.get(FINANCES_PATH') + 600);
  assert.match(fin, /await rollRecurringExpenses\(\)/, 'Finances fills the months before it counts');
  assert.match(src, /await step\('monthly costs', rollRecurringExpenses\);/, 'and so does the hourly sweep');
  assert.match(src, /pg_advisory_xact_lock\(hashtext\('expenses:roll'\)\)/, 'two at once cannot both add the rent');
  assert.match(src, /INSERT INTO expense_roll_skips/, 'a deleted monthly cost is remembered');
  assert.doesNotMatch(src, /Roll monthly costs into this month<\/button>/, 'no button to forget to press');
  assert.match(src, /EXP\.byMonth\(expList\)/);
  assert.doesNotMatch(src, /expList\.filter\(e => e\.recurs\)\.reduce/, 'fixed costs are not the year summed');
  assert.doesNotMatch(src, /FROM expenses WHERE EXTRACT\(YEAR FROM spent_on\) = \$1\s+ORDER BY spent_on DESC, id DESC LIMIT 40/,
    'a month is never cut off by a row limit');
});
