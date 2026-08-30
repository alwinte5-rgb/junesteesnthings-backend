'use strict';

/* Three faults reported from a real quote, all in the same area:
 *
 *   1. "accept didn't work" — the accept UPDATE is guarded, and when it matched
 *      nothing the handler fell through to a plain redirect. The page reloaded
 *      unchanged and NOTHING said why. A silent refusal is worse than an error:
 *      the customer concludes the button is broken, or that it worked.
 *   2. "it let me pay the deposit" — the pay route is guarded server-side, but
 *      the buttons were still rendered, so the guard could only be discovered by
 *      pressing one. A control that cannot work must not be offered.
 *   3. "there should be an area to pay in full" — a customer who wanted to
 *      settle the whole job was forced through the 50% deposit. The arithmetic
 *      already existed on the balance route; it was simply never offered before
 *      a first payment, where the word "balance" would have been meaningless.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const page = src.slice(src.indexOf("app.get('/q/:code'"),
                       src.indexOf("app.get(['/q/:code/pay/card'"));
const accept = src.slice(src.indexOf("app.post('/q/:code/accept'"));
const pay = src.slice(src.indexOf("app.get(['/q/:code/pay/card'"));

/* ── Accept never fails silently ─────────────────────────────────────────── */

test('a refused acceptance says which reason', () => {
  const body = accept.slice(0, accept.indexOf('} catch'));
  assert.match(body, /\?e=' \+ reason/, 'the redirect must carry a reason');
  assert.match(body, /why\[0\]\.pending \? 'pending'/);
  assert.match(body, /why\[0\]\.already \? 'already'/);
});

test('the successful path returns before the reason lookup', () => {
  /* Without the early return a successful acceptance would fall into the
     "why did it fail" query and redirect with an error on a quote that just
     succeeded. */
  const body = accept.slice(0, accept.indexOf('} catch'));
  assert.match(body, /return res\.redirect\('\/q\/' \+ code\);\s*\}/,
    'the success branch must return before the failure lookup');
});

test('every reason the redirect can carry is rendered', () => {
  /* A reason with no matching branch is a silent failure wearing a query
     string. */
  for (const r of ['pending', 'already', 'gone', 'err']) {
    assert.match(page, new RegExp(`e === '${r}'`),
      `the page must explain e=${r}`);
  }
});

/* ── Nothing that cannot work is offered ─────────────────────────────────── */

test('accept and pay are both hidden while a change is pending', () => {
  /* One expression gates both, so they cannot drift apart: the pay block is its
     `accepted` branch and the accept form is its `else`. */
  assert.match(page, /\$\{paid \|\| q\.requested_items \? '' : accepted \?/,
    'a pending request must suppress both the pay options and the accept form');
});

test('the pending state is explained where the buttons used to be', () => {
  /* Hiding a button without saying why is its own silent failure. */
  assert.match(page, /q\.requested_items \? `<div class="warn" id="changes">/);
  assert.match(page, /on hold until then/,
    'the customer must be told why accepting and paying are unavailable');
});

test('the server still refuses even though the buttons are gone', () => {
  /* The UI is a courtesy; the guard is the rule. A stale tab or a typed URL
     must still be refused. */
  assert.match(accept.slice(0, accept.indexOf('RETURNING')), /AND requested_items IS NULL/);
  assert.match(pay.slice(0, pay.indexOf('const t = quoteTotals')),
    /if \(q\.requested_items\) return res\.redirect/);
});

/* ── Pay in full ─────────────────────────────────────────────────────────── */

test('pay/full is served and owes the same as pay/balance', () => {
  /* Same expression for both, so a deposit flow and a pay-in-full flow can
     never disagree about what is owed. */
  assert.match(pay, /'\/q\/:code\/pay\/full'/, 'the route must exist');
  assert.match(pay, /req\.path\.endsWith\('\/balance'\) \|\| req\.path\.endsWith\('\/full'\)/,
    'full and balance must derive the amount identically');
});

test('the full amount is offered only when a deposit would not cover it', () => {
  /* Below the pay-in-full threshold the deposit IS the total, and offering
     "pay in full" beside an identical figure reads as two different prices. */
  assert.match(page, /\$\{t\.deposit < t\.total \? `/,
    'the pay-in-full block must be conditional on a deposit being partial');
  assert.match(page, /\/pay\/full/, 'and must link to the full-payment route');
});

test('a first full payment is not receipted as a "balance"', () => {
  /* /full reuses the balance branch, which was labelled "Remaining balance" —
     on a first-and-only payment that reads as though something was owed
     beforehand. */
  assert.match(pay, /alreadyPaid > 0 \? `Remaining balance[\s\S]*?: `Payment in full/,
    'the Stripe line item must name what was actually paid');
});
