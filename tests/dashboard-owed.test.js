'use strict';

/* The dashboard's "Owed to you", and taking a job off Production.
 *
 * Reported 2026-09-30 from the live dashboard: "It says I have 7 jobs open and
 * I only have 2." The tile counted every accepted quote with a balance, so a
 * DELIVERED job that still showed money owing was counted as a job in hand,
 * beside an In production tile that said 2. And a refunded job counted too: a
 * refund is booked as a negative payment, so paid-versus-total read the money
 * just given back as money owed. The balance reminders already leave refunded
 * and disputed quotes alone; the tile did not.
 *
 * Now jobs in hand are the undelivered ones, delivered jobs that still show a
 * balance are counted apart and named under Needs attention (each linking to
 * its card on the money board, where Record a payment and Settle live), and
 * refunded or disputed quotes are not owed.
 *
 * Same day: "I can't remove any accepted job that hasn't been paid from
 * production" — the job page offered only the stage buttons, so the one way
 * off the board was to walk a dead job through to Delivered. Cancel was on
 * the money board only. It is now on the job page too, the same form, and it
 * comes back to Production.
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
  let i = src.indexOf('(', at);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
/* A route, from its app.* line to the `});` that closes it at column 0. */
function route(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `${anchor} not found in server.js`);
  return src.slice(start, src.indexOf('\n});', start) + 4);
}

const OWING = (/const OWING_JOBS_WHERE = `([^`]*)`;/.exec(src) || [])[1];
const DASH = route("app.get('/dashboard', requireAdmin");

/* ── What counts as owed ────────────────────────────────────────────────── */

test('one definition of a job still owed money', () => {
  assert.ok(OWING, 'OWING_JOBS_WHERE not found in server.js');
  assert.match(OWING, /accepted_at IS NOT NULL AND cancelled_at IS NULL/);
  assert.match(OWING, /total > COALESCE\(paid_amount,0\) \+ COALESCE\(written_off,0\) \+ 0\.005/);
});

test('a refunded or disputed job is not money owed', () => {
  /* As the balance reminders have it: a refund lowers what was paid. */
  assert.match(OWING, /NOT EXISTS \(SELECT 1 FROM quote_payments p WHERE p\.quote_code = quotes\.code AND p\.kind = 'refund'\)/);
  assert.match(OWING, /NOT EXISTS \(SELECT 1 FROM stripe_disputes d WHERE d\.quote_code = quotes\.code\)/);
});

test('jobs in hand are the undelivered ones; delivered ones are counted apart', () => {
  assert.match(DASH, /COUNT\(\*\) FILTER \(WHERE delivered_at IS NULL\)::int AS jobs/);
  assert.match(DASH, /COUNT\(\*\) FILTER \(WHERE delivered_at IS NOT NULL\)::int AS delivered/);
  assert.match(DASH, /FROM quotes WHERE \$\{OWING_JOBS_WHERE\}`, 'owed'\)/);
  assert.match(DASH, /in hand` \+\s+\(owed\.delivered \? ` and \$\{owed\.delivered\} delivered` : ''\)/);
});

test('each delivered job still showing a balance is named, and links to its card', () => {
  assert.match(DASH, /WHERE \$\{OWING_JOBS_WHERE\} AND delivered_at IS NOT NULL/);
  assert.match(DASH, /\.\.\.deliveredOwing\.map\(/);
  assert.match(DASH, /href: `\/quotes#q-\$\{escEmail\(q\.code\)\}`/);
  /* ...and the card is there to land on. */
  assert.match(src, /return `<div class="card" id="q-\$\{q\.code\}">/);
});

/* ── Taking a job off Production ────────────────────────────────────────── */

function cancelForm() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext([
    (/^const round2 = .*;$/m.exec(src) || [])[0],
    (/^const money = .*;$/m.exec(src) || [])[0],
    lift('escEmail'), lift('cancelOrderForm'),
  ].join('\n'), sandbox);
  return sandbox.cancelOrderForm;
}

test('the job page can cancel a job, and says so about money already paid', () => {
  const form = cancelForm();
  const unpaid = form({ code: 'AB12CD34EF', paid_amount: 0 }, 'production');
  assert.match(unpaid, /action="\/quote\/AB12CD34EF\/cancel"/);
  assert.match(unpaid, /<input type="hidden" name="back" value="production">/);
  assert.match(unpaid, /name="reason"/);
  assert.doesNotMatch(unpaid, /has been paid on this job/);

  const paid = form({ code: 'AB12CD34EF', paid_amount: 50 }, 'production');
  assert.match(paid, /\$50\.00 has been paid on this job — refund it separately/);

  assert.doesNotMatch(form({ code: 'AB12CD34EF', paid_amount: 0 }), /name="back"/,
    'the money board sends no back, and lands where it always did');
});

test('the job page offers it, and the money board uses the same form', () => {
  const job = route("app.get('/production/:code', requireAdmin");
  assert.match(job, /Not going ahead\? Cancel this job/);
  assert.match(job, /cancelOrderForm\(q, 'production'\)/);
  assert.match(job, /\$\{q\.cancelled_at \? '' : `/, 'not offered on a job already cancelled');
  assert.match(src, /\$\{q\.cancelled_at \? '' : cancelOrderForm\(q\)\}/);
  assert.strictEqual(src.split('action="/quote/${q.code}/cancel"').length - 1, 1,
    'one cancel form in the file, not a copy per page');
});

test('a cancelled job is off the Production board', () => {
  /* The reason cancelling never cleared it: the board's list checked
     accepted and not delivered, and nothing else. */
  assert.match(src, /const live = rows\.filter\(q => !q\.delivered_at && q\.accepted_at && !q\.cancelled_at\);/);
});

test('a delivered job still owed money has a card with its payment buttons', () => {
  /* The dashboard's links land here; delivered work is otherwise off this board. */
  assert.match(src, /const gOwedDone = gDone\.filter\(\(q\) => q\.accepted_at && balanceOf\(q\) > 0\.005/);
  assert.match(src, /p\.kind === 'refund'\)\s+&& !disputes\.byQuote\.has\(q\.code\)\);/);
  assert.match(src, /group\('Delivered, still owed', [^)]*gOwedDone,/);
});

test('Orders says a delivered job still owes, rather than just "delivered"', () => {
  const orders = route("app.get('/orders', requireAdmin");
  assert.match(orders, /o\.delivered_at && balanceOf\(o\) > 0 \? \['delivered · ' \+ money\(balanceOf\(o\)\) \+ ' still owed'/);
});

test('cancelling from Production comes back to Production', () => {
  const cancel = route("app.post('/quote/:code/cancel', requireAdmin");
  assert.match(cancel,
    /res\.redirect\(String\(\(req\.body && req\.body\.back\) \|\| ''\) === 'production' \? '\/production' : '\/quotes'\)/);
});
