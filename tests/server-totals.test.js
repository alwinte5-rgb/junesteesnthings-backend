'use strict';

/* Totals are the server's, never the request's.
 *
 * AGENTS.md: "Compute totals server-side, always. Never trust a
 * client-submitted total, including discounts." The board carried it as a
 * checklist item whose one condition was "a request submitting its own total
 * is ignored, proven by a test". The code already met it; nothing said so.
 * These pin the three places it matters:
 *
 *   1. quoteTotals(), which the customer page, the payment routes and the
 *      books all read, works every figure out from the stored lines and
 *      ignores any total, subtotal or deposit sitting on the quote.
 *   2. Saving a quote takes no money figure from the request. The lines, the
 *      tax flag and the discount inputs arrive; subtotal, tax, total and
 *      deposit are worked out here.
 *   3. The card payment routes charge what quoteTotals() says and read no
 *      amount from the request.
 *
 * The design studio meets the same rule in its own repo: core/cart.php
 * rebuilds each item's price from the product data, and save_order() sums
 * those rather than any total the page held.
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
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in server.js`);
  let i = src.indexOf('(', start);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function line(re, what) {
  const m = re.exec(src);
  assert.ok(m, `${what} not found in server.js`);
  return m[0];
}
/* A route, from its app.* line to the `});` that closes it at column 0. */
function route(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `${anchor} not found in server.js`);
  const end = src.indexOf('\n});', start);
  assert.notStrictEqual(end, -1, `no end found for ${anchor}`);
  return src.slice(start, end + 4);
}

/* ── 1. The one function every figure comes from ───────────────────────── */

function quoteTotals() {
  /* An empty env, so the deposit settings are the code's defaults (50%, pay
     in full under $100) whatever the machine running this has set. */
  const sandbox = { process: { env: {} } };
  vm.createContext(sandbox);
  vm.runInContext([
    line(/^const round2 = .*;$/m, 'round2'),
    line(/^const DEPOSIT_PC = .*$/m, 'DEPOSIT_PC'),
    line(/^const DEPOSIT_FULL_UNDER = .*$/m, 'DEPOSIT_FULL_UNDER'),
    lift('depositFor'), lift('quoteDiscount'), lift('quoteTotals'),
  ].join('\n'), sandbox);
  return sandbox.quoteTotals;
}

test('every figure is worked out from the lines, whatever total the quote carries', () => {
  /* Stored figures that are wrong: stale from an edit, or written by anything
     other than the save route. Compared field by field, because an object
     built in another vm context never deep-equals one built here. */
  const t = quoteTotals()({
    items: [{ line_total: 180 }, { line_total: 60 }],
    discount_kind: 'pct', discount_value: 10, tax: 0,
    subtotal: 1, total: 1, deposit: 1,
  });
  assert.strictEqual(t.subtotal, 240);
  assert.strictEqual(t.discount, 24, 'the discount is the server\'s arithmetic on its inputs');
  assert.strictEqual(t.total, 216);
  assert.strictEqual(t.deposit, 108, 'half of the worked-out total, not the stored 1');
});

/* ── 2. Saving a quote ──────────────────────────────────────────────────── */

const SAVE = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");

test('saving a quote takes no money figure from the request', () => {
  for (const f of ['total', 'subtotal', 'tax', 'deposit', 'paid_amount', 'line_total', 'amount']) {
    const reads = new RegExp(`\\b(?:b|req\\.body)\\.${f}\\b|\\b(?:b|req\\.body)\\[['"\`]${f}['"\`]`);
    assert.doesNotMatch(SAVE, reads, `the save route reads ${f} from the request`);
  }
});

test('what a saved quote stores is worked out from its lines', () => {
  /* Optional lines are left out until the customer ticks them. */
  assert.match(SAVE, /const subtotal = round2\(items\.filter\(\(i\) => !i\.optional\)\.reduce\(\(a, i\) => a \+ i\.line_total, 0\)\);/);
  assert.match(SAVE, /const tax = quoteTax\(net, taxable\);/);
  assert.match(SAVE, /const total = round2\(net \+ tax\);/);
  assert.match(SAVE, /const deposit = depositFor\(total\);/);
});

/* ── 3. Paying by card ──────────────────────────────────────────────────── */

const PAY = route("app.get(['/q/:code/pay/card'");

test('a card payment charges what the stored quote works out to', () => {
  assert.doesNotMatch(PAY, /req\.(?:query|body)\.(?:amount|total|deposit)\b/, 'no amount from the request');
  assert.match(PAY, /const t = quoteTotals\(q\);/);
  assert.match(PAY, /\? round2\(Math\.max\(0, Number\(t\.total\) - alreadyPaid\)\)\s+: t\.deposit;/);
});
