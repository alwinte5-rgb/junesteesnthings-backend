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

const ctx = { process: { env: {} }, Date, Math, Number, String, parseInt };
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

test('the first deposit fills an empty working date, once, and never a date someone gave', () => {
  const sync = lift('syncPaidAmount');
  assert.match(sync, /if \(paid > 0\) await anchorScheduleOnDeposit\(code\)\.catch\(/, 'never fails the payment');
  const anchor = lift('anchorScheduleOnDeposit');
  assert.match(anchor, /MIN\(created_at\) FROM quote_payments p WHERE p\.quote_code = q\.code AND p\.amount > 0/, 'the FIRST deposit');
  assert.match(anchor, /WHERE code = \$1 AND target_date IS NULL AND needed_by IS NULL/, 'only fills an empty date, race-safe');
  assert.match(anchor, /q\.needed_by \|\| q\.target_date \|\| q\.cancelled_at \|\| q\.shipped_at \|\| q\.delivered_at\) return null/);
  assert.match(src, /await anchorUndatedPaidJobs\(\)\.catch\(/, 'jobs paid before this get their date at boot');
});

test('the working date: production window from the deposit day, plus transit only when it ships', () => {
  const w = lift('depositWorkingDate');
  assert.match(w, /const pickup = !method \|\| method === 'pickup' \|\| method === 'local';/);
  assert.match(w, /deliveryEstimate\(new Date\(q\.deposit_at\), \{ items, pickup \}\)\.deliver_to/);
  assert.match(w, /filter\(\(i\) => i && !i\.optional\)/, 'lines they did not take do not count');
});
