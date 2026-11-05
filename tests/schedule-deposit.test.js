'use strict';

/* The deadline starts with the deposit, and only work in hand can be behind
 * (owner, 2026-10-15: "The deadline should move based on when a deposit is
 * made. Also why does my production schedule say 9 behind schedule when I
 * only have 4 orders on my board."). End to end: run-sched.cjs in the harness.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function lift(name) {
  let at = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  return src.slice(at, src.indexOf('\n}\n', at) + 2);
}

/* The risk rules, with deadline alerts switched on (see the test below for off). */
const ctx = { process: { env: {} }, Date, Math, Number, String, parseInt, DEADLINE_ALERTS: true };
vm.createContext(ctx);
vm.runInContext(['addBusinessDays', 'quoteSchedule'].map(lift).join('\n'), ctx);
const daysAgo = (n) => new Date(Date.now() - n * 86400e3);

test('a quote nobody has paid on is never behind, however old its date', () => {
  const due = daysAgo(3);
  assert.strictEqual(ctx.quoteSchedule({ needed_by: due }).risks.length, 0, 'waiting on the customer');
  assert.strictEqual(ctx.quoteSchedule({ needed_by: due, accepted_at: daysAgo(5) }).risks.length, 0, 'accepted, no deposit');
  assert.strictEqual(ctx.quoteSchedule({ needed_by: due, paid_amount: 100, cancelled_at: daysAgo(1) }).risks.length, 0, 'cancelled');
  assert.ok(ctx.quoteSchedule({ needed_by: due, paid_amount: 100 }).risks.length > 0, 'paid and late is behind');
  // The dates still show for a quote: only the warnings wait for the deposit.
  assert.ok(ctx.quoteSchedule({ needed_by: due }).ship_by);
});

test('deadline alerts are off: a paid job past its dates is never behind, and the dates still show (owner, 2026-11-05)', () => {
  const off = { process: { env: {} }, Date, Math, Number, String, parseInt, DEADLINE_ALERTS: false };
  vm.createContext(off);
  vm.runInContext(['addBusinessDays', 'quoteSchedule'].map(lift).join('\n'), off);
  // Paid today with a ready date a week out: start-by is already behind it.
  const fresh = off.quoteSchedule({ target_date: new Date(Date.now() + 7 * 86400e3), paid_amount: 50, accepted_at: new Date() });
  assert.strictEqual(fresh.risks.length, 0, 'a job that just arrived is not late');
  const old = off.quoteSchedule({ needed_by: daysAgo(3), paid_amount: 100 });
  assert.strictEqual(old.risks.length, 0, 'no late warning while the switch is off');
  assert.ok(old.ship_by && old.blanks_order_by, 'the dates are kept');
});

test('with alerts on, a job is not late the day it arrives, only once the shop has had 2 business days', () => {
  // Paid today, ready in a week: start-by (9 business days back) is already past.
  const fresh = ctx.quoteSchedule({ target_date: new Date(Date.now() + 7 * 86400e3), paid_amount: 50, accepted_at: new Date() });
  assert.strictEqual(fresh.risks.length, 0, 'arrived today: not late');
  // The same tight job, accepted two weeks ago and still not started: late.
  const stale = ctx.quoteSchedule({ target_date: new Date(Date.now() + 2 * 86400e3), paid_amount: 50, accepted_at: daysAgo(14) });
  assert.ok(stale.risks.some((r) => r.key === 'start'), 'not started two weeks on is late');
  // No arrival date on file: the old rule.
  assert.ok(ctx.quoteSchedule({ needed_by: daysAgo(3), paid_amount: 100 }).risks.length > 0);
});

test('the project timeline paints no overdue red while alerts are off', () => {
  const P = require('../tools/lib/task-projects');
  const proj = { title: 'T' };
  const steps = [{ state: 'current', starts_on: '2026-10-01', due_on: '2026-10-02', title: 's', step_no: 1 }];
  assert.match(P.timelineSvg(proj, steps, { today: '2026-11-05' }), /#dc2626/, 'on by default');
  assert.doesNotMatch(P.timelineSvg(proj, steps, { today: '2026-11-05', overdue: false }), /#dc2626/);
  assert.match(src, /timelineSvg\(p, steps, \{ today, compact: true, overdue: DEADLINE_ALERTS \}\)/);
  assert.match(src, /timelineSvg\(p, steps, \{ today, overdue: DEADLINE_ALERTS \}\)/);
});

test('the first deposit fills an empty working date, once, and never a date someone gave', () => {
  const sync = lift('syncPaidAmount');
  assert.match(sync, /if \(paid > 0\) await anchorScheduleOnDeposit\(code\)\.catch\(/, 'never fails the payment');
  const anchor = lift('anchorScheduleOnDeposit');
  assert.match(anchor, /MIN\(created_at\) FROM quote_payments p WHERE p\.quote_code = q\.code AND p\.amount > 0/, 'the FIRST deposit');
  assert.match(anchor, /WHERE code = \$1 AND target_date IS NULL AND needed_by IS NULL/, 'only fills an empty date, race-safe');
  assert.match(anchor, /q\.needed_by \|\| q\.target_date \|\| q\.cancelled_at \|\| q\.shipped_at \|\| q\.delivered_at\) return null/);
});

test('the working date is counted on the shop calendar: an evening deposit is not a Sunday', () => {
  const c = { process: { env: {} }, Date, Math, Number, String, parseInt, Intl, SHOP_TZ: 'America/Chicago', CUTOFF_MIN: 14 * 60,
    DELIV: require('../tools/lib/delivery'), deliveryEstimate: () => ({ production_days: [7, 10] }) };
  vm.createContext(c);
  vm.runInContext(['addBusinessDays', 'shopMinutes', 'depositWorkingDate'].map(lift).join('\n'), c);
  // Thu Oct 15 20:30 Chicago is already Friday in UTC: starts Fri Oct 16, ten business days on is Fri Oct 30.
  assert.strictEqual(c.depositWorkingDate({ deposit_at: '2026-10-16T01:30:00Z' }), '2026-10-30');
  // Tue Oct 13 10:00 Chicago, before the cutoff: starts that day, ready Tue Oct 27.
  assert.strictEqual(c.depositWorkingDate({ deposit_at: '2026-10-13T15:00:00Z' }), '2026-10-27');
  // Saturday: starts Monday.
  assert.strictEqual(c.depositWorkingDate({ deposit_at: '2026-10-17T15:00:00Z' }), '2026-11-02');
  // Shipping adds the far end of transit.
  assert.strictEqual(c.depositWorkingDate({ deposit_at: '2026-10-13T15:00:00Z', ship_method: 'ship' }), '2026-11-03');
  const w = lift('depositWorkingDate');
  assert.match(w, /filter\(\(i\) => i && !i\.optional\)/, 'lines they did not take do not count');
});

test('a booked local delivery keeps its day, and old deposits are not given past dates', () => {
  const anchor = lift('anchorScheduleOnDeposit');
  assert.match(anchor, /if \(await DELIVERY\.byRef\('quote:' \+ code\)\.catch\(\(\) => null\)\) return null;/);
  const back = lift('anchorUndatedPaidJobs');
  assert.match(back, /> NOW\(\) - INTERVAL '14 days'/);
  assert.match(src, /console\.log\(`Listening on port \$\{PORT\}`\);\s*\/\*[^*]*\*\/\s*anchorUndatedPaidJobs\(\)/, 'after listen, never holding up boot');
  assert.match(src, /sched0 && sched0\.ship_by >= new Date\(new Date\(\)\.toDateString\(\)\) \? sched0 : null/, 'no past date in the production email');
});
