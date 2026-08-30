'use strict';

/* Records the shop can keep.
 *
 * Everything lives in one Postgres database on Railway — fine to run from, poor
 * to KEEP records in: one account, one card on file, one bad afternoon away from
 * being the only copy. Tax records, disputes and "what did I pay you in March"
 * all need to survive this app.
 *
 * Plain CSV, by month, downloaded by hand. No dependency and no format that
 * needs this application to read it back.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
const monthRange = vm.runInThisContext(lift('monthRange') + '\nmonthRange');
const csvEsc = vm.runInThisContext(
  src.match(/^const csvEsc = [\s\S]*?\n\};$/m)[0] + '\ncsvEsc');

/* ── The month window ────────────────────────────────────────────────────── */

test('a month is a half-open range, so nothing is counted twice', () => {
  /* [from, to) — a payment at 00:00 on the 1st belongs to the new month, not to
     both. Using BETWEEN with a month end would double-count that row across two
     exports and the totals would not reconcile. */
  const r = monthRange('2026-08');
  assert.strictEqual(r.from, '2026-08-01');
  assert.strictEqual(r.to, '2026-09-01');
});

test('December rolls the year, not the month', () => {
  const r = monthRange('2026-12');
  assert.strictEqual(r.to, '2027-01-01');
});

test('a bad month exports everything rather than nothing', () => {
  /* An empty CSV reads as "no business that month", which is a lie a person
     could act on. Returning null means the route drops the WHERE and sends the
     lot — obviously wrong rather than quietly wrong. */
  for (const bad of ['', 'august', '2026-13-01', '26-08', null, undefined, '2026/08']) {
    assert.strictEqual(monthRange(bad), null, `${String(bad)} must not parse`);
  }
});

/* ── The CSV itself ──────────────────────────────────────────────────────── */

test('a customer name with a comma cannot break the file', () => {
  /* "Martin, Melissa" unescaped shifts every later column by one, silently, for
     that row only — the kind of corruption found months later in a spreadsheet
     nobody reconciled. */
  assert.strictEqual(csvEsc('Martin, Melissa'), '"Martin, Melissa"');
  assert.strictEqual(csvEsc('He said "yes"'), '"He said ""yes"""');
  assert.strictEqual(csvEsc('line one\nline two'), '"line one\nline two"');
  assert.strictEqual(csvEsc('plain'), 'plain');
  assert.strictEqual(csvEsc(null), '');
  assert.strictEqual(csvEsc(0), '0', 'zero is a number, not an empty cell');
});

test('exports are admin-only and never cached', () => {
  /* They carry names, emails, phone numbers and money. */
  for (const r of ['/exports', '/exports/quotes.csv', '/exports/payments.csv', '/exports/expenses.csv']) {
    assert.match(src, new RegExp(`app\\.get\\('${r.replace(/\//g, '\\/')}', requireAdmin`),
      `${r} must require admin`);
  }
  const send = src.slice(src.indexOf('function sendCsv'));
  assert.match(send.slice(0, 400), /Cache-Control', 'no-store'/);
  assert.match(send.slice(0, 400), /Content-Disposition/);
});

test('the payments export reports net of the card fee', () => {
  /* Gross minus the processing fee is what actually reached the bank. An export
     that only shows gross overstates income by the fee on every card payment. */
  const route = src.slice(src.indexOf("app.get('/exports/payments.csv'"));
  assert.match(route, /round2\(Number\(p\.amount \|\| 0\) - Number\(p\.fee \|\| 0\)\)/);
  assert.match(route, /'net'/, 'and the column must be named');
});

test('the quotes export carries the written-off and balance figures', () => {
  /* Otherwise a settled job exports as though it were still owed, and the
     records disagree with the board. */
  const route = src.slice(src.indexOf("app.get('/exports/quotes.csv'"));
  assert.match(route, /'written_off','balance'/);
  assert.match(route, /balanceOf\(q, t\.total\)/, 'through the shared balance rule');
});

test('the quotes export prices from items, not the stored total', () => {
  /* quotes.total can lag an edit; quoteTotals is what the customer was shown. */
  const route = src.slice(src.indexOf("app.get('/exports/quotes.csv'"));
  assert.match(route, /const t = quoteTotals\(q\)/);
});

/* ── The board no longer hides live work ─────────────────────────────────── */

test('an old job that still owes money is always loaded', () => {
  /* The board took the 200 most recent quotes, so past 200 an unpaid job would
     drop off silently. Nobody chases what they cannot see. The cap now applies
     only to work that is finished AND settled AND not awaiting a reply. */
  const board = src.slice(src.indexOf('async function renderBoard'));
  const q = board.slice(0, board.indexOf('ORDER BY created_at DESC`)') + 40);
  assert.match(q, /COALESCE\(paid_amount,0\) \+ COALESCE\(written_off,0\) < total/,
    'anything still owed must bypass the limit');
  assert.match(q, /requested_items IS NOT NULL/,
    'a quote awaiting an edit must bypass it too');
  assert.match(q, /cancelled_at IS NULL AND delivered_at IS NULL/,
    'live work must bypass it');
  assert.match(q, /LIMIT 200\) AS finished/,
    'the cap should apply to finished work only');
});
