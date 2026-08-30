'use strict';

/* A quote edited AFTER the customer paid leaves a balance nobody intends to
 * collect — the price was revised, the customer did not underpay.
 *
 * The only tool that existed was recording a NEGATIVE payment. That moves what
 * was COLLECTED, not what is OWED, so it made the gap wider. The real ledger
 * shows the attempt: a −$84.34 row noted "Corrected total to $84.34 — Manual
 * correction". The total was never corrected; only the paid figure moved.
 *
 * The fallback was marking the job delivered so it dropped off the board, which
 * corrupts the schedule and leaves the books expecting money that is not coming.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const round2src = 'const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;';
const balanceOf = vm.runInThisContext(round2src + '\n' + lift('balanceOf') + '\nbalanceOf');

/* ── The arithmetic ──────────────────────────────────────────────────────── */

test('a written-off remainder is not owed', () => {
  const q = { total: 757.50, paid_amount: 385.00, written_off: 372.50 };
  assert.strictEqual(balanceOf(q), 0);
});

test('a partly written-off quote still owes the rest', () => {
  /* Writing off is not the same as closing: a shop can forgive part of a gap. */
  const q = { total: 500, paid_amount: 200, written_off: 100 };
  assert.strictEqual(balanceOf(q), 200);
});

test('the balance never goes negative', () => {
  /* An overpayment plus a write-off must not read as the shop owing money on a
     board whose whole job is showing what is owed TO it. */
  assert.strictEqual(balanceOf({ total: 100, paid_amount: 150, written_off: 0 }), 0);
  assert.strictEqual(balanceOf({ total: 100, paid_amount: 60, written_off: 90 }), 0);
});

test('a missing written_off counts as zero, not NaN', () => {
  /* Every quote written before this column existed has it null. NaN would
     render as "balance due $NaN" on the board. */
  assert.strictEqual(balanceOf({ total: 168.68, paid_amount: 84.34 }), 84.34);
  assert.strictEqual(balanceOf({ total: 168.68, paid_amount: 84.34, written_off: null }), 84.34);
});

test('an explicit total overrides the stored column', () => {
  /* The customer page prices from ITEMS, not from quotes.total, which can be
     stale. Both must reach the same answer through this one function. */
  assert.strictEqual(balanceOf({ total: 999, paid_amount: 100, written_off: 0 }, 300), 200);
});

/* ── The rule the workaround broke ───────────────────────────────────────── */

test('every balance on every surface goes through balanceOf', () => {
  /* A balance computed inline somewhere else is a place a settled quote is
     still chased — and the customer is the one who finds out. */
  const inline = src.match(/Number\(q\.total[^)]*\)\s*-\s*Number\(q\.paid_amount[^)]*\)/g) || [];
  assert.deepStrictEqual(inline, [],
    'no surface may subtract paid from total on its own:\n  ' + inline.join('\n  '));
  assert.ok((src.match(/balanceOf\(/g) || []).length >= 5,
    'the board, customer page, payment route and books should all use it');
});

test('settling records the amount, not just a flag', () => {
  /* Derived at read time it would silently restate itself the next time the
     quote is edited — which is the exact fault this feature exists to fix. */
  const route = src.slice(src.indexOf("app.post('/quote/:code/settle'"));
  assert.match(route, /written_off = COALESCE\(written_off,0\) \+ \$2/,
    'the written-off amount must be stored');
  assert.match(route, /settled_at = NOW\(\), settled_note = \$3/,
    'and the reason recorded — somebody will ask why months later');
});

test('settling prices from the items, not the stored total', () => {
  /* quotes.total can lag behind an edit. Writing off against it would write off
     the wrong number, permanently. */
  const route = src.slice(src.indexOf("app.post('/quote/:code/settle'"));
  assert.match(route, /balanceOf\(q, quoteTotals\(q\)\.total\)/,
    'the amount must come from the same figure the customer sees');
});

test('a quote that owes nothing cannot be settled', () => {
  /* Otherwise a double-click writes off zero and stamps a settled date on a
     quote that was simply paid in full. */
  const route = src.slice(src.indexOf("app.post('/quote/:code/settle'"));
  assert.match(route, /if \(owed <= 0\) return res\.redirect/);
});

test('settling is admin-only', () => {
  assert.match(src, /app\.post\('\/quote\/:code\/settle', requireAdmin/,
    'writing off money must never be reachable by a customer');
});

test('revenue is not touched by a write-off', () => {
  /* Money is counted from the payment ledger. If settling wrote a payment row
     the shop would book income it never received. */
  const route = src.slice(src.indexOf("app.post('/quote/:code/settle'"),
                          src.indexOf("app.post('/quote/:code/receipt'"));
  assert.doesNotMatch(route, /INSERT INTO quote_payments/,
    'a write-off is not a payment and must not enter the ledger');
});
