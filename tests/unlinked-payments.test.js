'use strict';

/* Money that arrived outside the quote flow, and the tax position that has to
 * admit it exists.
 *
 * The design studio at design.jtees.net runs its own Stripe Checkout against
 * THIS webhook, sending its order number as client_reference_id. That fails
 * QUOTE_CODE_RE, so bankStripeSession declines it — correctly, an order is not
 * a quote. Alerting the shop (see stripe-payment-visibility.test.js) stopped
 * the money being invisible, but an email is not a record: it still reached no
 * table, no export and no tax position.
 *
 * Sales tax is filed on RECEIPTS. Revenue that exists only in an inbox
 * understates the ST-1 by exactly that much, and the ST-1 is the number a
 * payment plan gets built on. So the rule this file defends is:
 *
 *   money that arrived is written down, and tax that is UNKNOWN is reported as
 *   unknown — never as zero.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* Keeps the `async` keyword: these are database functions, and a lifted body
   full of `await` will not parse without it. */
function lift(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;

  /* Skip the parameter list before hunting for the body. `opts = {}` is a brace
     too, and matching on it returns a signature with no body — which parses,
     runs, and silently asserts nothing. */
  let i = src.indexOf('(', src.indexOf(name, start));
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

/* ── The table ───────────────────────────────────────────────────────────── */

const DDL = (() => {
  const m = /CREATE TABLE IF NOT EXISTS unlinked_payments \(([\s\S]*?)\n    \)/.exec(src);
  assert.ok(m, 'unlinked_payments table not found in initDB');
  return m[1];
})();

test('unlinked money has somewhere to go', () => {
  assert.match(DDL, /amount\s+NUMERIC\(10,2\) NOT NULL/,
    'the amount is the whole point of the row');
  assert.match(DDL, /stripe_pi/, 'a refund is matched back by payment intent');
});

test('tax_portion is NULLABLE and has no DEFAULT 0', () => {
  /* This is the load-bearing line of the whole change. NULL means "nobody has
     worked out the tax on this yet". 0 means "there was no tax". Writing 0 for
     an unknown asserts something false about a period, and that assertion ends
     up on a filed return. */
  const col = /tax_portion\s+NUMERIC\(10,2\)([^\n]*)/.exec(DDL);
  assert.ok(col, 'tax_portion column missing');
  assert.doesNotMatch(col[1], /NOT NULL/, 'an unknown tax portion must be expressible');
  assert.doesNotMatch(col[1], /DEFAULT\s+0/,
    'defaulting to 0 would silently claim no tax was collected on studio orders');
});

test('a retried webhook cannot become two payments', () => {
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS unlinked_payments_extref_uniq[\s\S]{0,120}ext_ref/,
    'Stripe retries every non-2xx; without this each retry books the money again');
});

test('the quote ledger is left alone', () => {
  /* quote_payments.quote_code is NOT NULL and syncPaidAmount() rolls that
     ledger onto the quote. A payment belonging to no quote cannot live there
     without corrupting a rollup every other reader depends on. */
  assert.match(src, /CREATE TABLE IF NOT EXISTS unlinked_payments/,
    'unlinked money belongs in its own table, not smuggled into quote_payments');
});

/* ── Recording ───────────────────────────────────────────────────────────── */

const RECORD_SRC = lift('recordUnlinkedPayment');

test('the gross is recorded, not a net invented from the quote-flow surcharge', () => {
  /* CARD_FEE is a convention of the quote checkout. The studio's checkout is
     not obliged to share it, so dividing by (1 + CARD_FEE) here would invent a
     fee that may not exist and understate revenue. */
  assert.doesNotMatch(RECORD_SRC, /CARD_FEE/,
    'do not apply the quote-flow card surcharge to a payment from another flow');
});

test('a failed write is NOT swallowed', () => {
  /* The alert may swallow its own failure — a lost email costs a
     notification. This may not: the only thing that will try again is Stripe's
     retry, and that only happens on a non-2xx. */
  assert.match(RECORD_SRC, /if \(err\.code === '23505'\) return \{ ok: true, duplicate: true \};[\s\S]{0,40}throw err;/,
    'only a duplicate is tolerated; every other write failure must reach Stripe as a retry');
});

test('a duplicate is reported, so it can suppress a second alert', () => {
  assert.match(RECORD_SRC, /duplicate: true/);
});

test('the tax is taken from the payment when the payer stamps it', () => {
  /* The studio computes sales tax at checkout and used to fold it into one
     opaque Stripe line item, so the money arrived with no way to separate
     revenue from tax held for the state. It now stamps jt_tax on the session
     metadata, which travels with the payment — the backend has no access to
     the studio's database, so metadata is the only channel there is. */
  assert.match(RECORD_SRC, /session\.metadata\?\.jt_tax/,
    'read the tax the studio already worked out rather than guessing it');
});

test('an absent stamp stays NULL rather than becoming 0', () => {
  assert.match(RECORD_SRC, /let taxPortion = null;/,
    'a payment from before the stamp existed has an UNKNOWN tax portion, not a zero one');
  assert.match(RECORD_SRC, /Number\.isFinite\(stamped\)/,
    'a malformed stamp must fall back to unknown, never to NaN or 0');
});

test('a refund carries its tax back out', () => {
  assert.match(RECORD_SRC, /amt < 0 && gross > 0 \? -Math\.abs\(stamped\) : stamped/,
    'a negative row with a positive tax portion would leave tax behind on a refunded sale');
});

test('resolving the tax stamps when it was resolved', () => {
  assert.match(src, /CASE WHEN \$16::numeric IS NULL THEN NULL ELSE NOW\(\) END/,
    'resolved_at is what separates "settled at import" from "still to be worked out"');
});

test('the studio order number is kept when it sent one', () => {
  assert.match(RECORD_SRC, /session\.metadata\?\.order_id/,
    'order_id is the only identifier on a Payment Link balance payment');
});

/* ── The tax position ────────────────────────────────────────────────────── */

function runTaxPosition({ collected = [], remitted = [], unlinked = [], unlinkedFails = false }) {
  const sandbox = {
    round2: (n) => Math.round((Number(n) || 0) * 100) / 100,
    pool: {
      query(sql) {
        if (/FROM quote_payments/.test(sql)) return Promise.resolve({ rows: collected });
        if (/FROM tax_remittances/.test(sql)) return Promise.resolve({ rows: remitted });
        if (/FROM unlinked_payments/.test(sql)) {
          return unlinkedFails
            ? Promise.reject(new Error('relation "unlinked_payments" does not exist'))
            : Promise.resolve({ rows: unlinked });
        }
        throw new Error('unexpected query: ' + sql);
      },
    },
  };
  vm.createContext(sandbox);
  return vm.runInContext(lift('taxPositionByMonth') + '\ntaxPositionByMonth', sandbox)();
}

test('quote-ledger tax still totals the way it always did', async () => {
  const pos = await runTaxPosition({
    collected: [{ period: '2026-08', collected: '100.00', gross: '1000.00', payments: '4' }],
    remitted: [{ period: '2026-08', remitted: '40.00', last_paid: '2026-09-20' }],
  });
  assert.strictEqual(pos.months[0].outstanding, 60);
  assert.strictEqual(pos.setAside, 60);
});

test('an unlinked payment with unknown tax does NOT quietly add zero', async () => {
  const pos = await runTaxPosition({
    collected: [{ period: '2026-08', collected: '100.00', gross: '1000.00', payments: '4' }],
    unlinked: [{ period: '2026-08', gross: '535.75', payments: '3',
                 tax_known: '0', tax_unknown: '3' }],
  });
  const m = pos.months[0];
  /* The known tax is still 100 — inventing tax for the studio orders would be
     as wrong as ignoring them. What changes is that the period now SAYS it is
     incomplete. */
  assert.strictEqual(m.outstanding, 100);
  assert.strictEqual(m.undetermined, true, 'the period must declare itself unfinished');
  assert.strictEqual(m.unlinkedGross, 535.75, 'the receipts are visible even when the tax is not');
  assert.strictEqual(pos.undeterminedPayments, 3);
  assert.strictEqual(pos.undeterminedGross, 535.75);
});

test('once the tax on an unlinked payment is established it counts', async () => {
  const pos = await runTaxPosition({
    collected: [{ period: '2026-08', collected: '100.00', gross: '1000.00', payments: '4' }],
    unlinked: [{ period: '2026-08', gross: '535.75', payments: '3',
                 tax_known: '49.86', tax_unknown: '0' }],
  });
  assert.strictEqual(pos.months[0].outstanding, 149.86);
  assert.strictEqual(pos.months[0].undetermined, false);
  assert.strictEqual(pos.undeterminedPayments, 0);
});

test('a period with ONLY unlinked money still appears', async () => {
  /* Otherwise a month whose entire revenue came through the studio reads as no
     business at all — the same class of lie as an empty export. */
  const pos = await runTaxPosition({
    unlinked: [{ period: '2026-07', gross: '35.75', payments: '1',
                 tax_known: '0', tax_unknown: '1' }],
  });
  assert.strictEqual(pos.months.length, 1);
  assert.strictEqual(pos.months[0].period, '2026-07');
  assert.strictEqual(pos.months[0].unlinkedGross, 35.75);
  assert.strictEqual(pos.months[0].undetermined, true);
});

test('the set-aside figure never counts undetermined money as remitted-safe', async () => {
  const pos = await runTaxPosition({
    collected: [{ period: '2026-08', collected: '100.00', gross: '1000.00', payments: '4' }],
    remitted: [{ period: '2026-08', remitted: '100.00', last_paid: '2026-09-20' }],
    unlinked: [{ period: '2026-08', gross: '535.75', payments: '3',
                 tax_known: '0', tax_unknown: '3' }],
  });
  /* Outstanding is zero — every penny of KNOWN tax has been paid over. The
     period is still not safe to file, and undeterminedPayments is what says so.
     A caller reading only setAside would think August was closed. */
  assert.strictEqual(pos.months[0].outstanding, 0);
  assert.strictEqual(pos.undeterminedPayments, 3,
    'a closed-looking period with unknown receipts must still be flagged');
});

test('a database without the table yet does not take the tax page down', async () => {
  /* initDB creates it on boot, but the query is guarded so a deploy that races
     the migration degrades to the old behaviour instead of 500ing the books. */
  const pos = await runTaxPosition({
    collected: [{ period: '2026-08', collected: '100.00', gross: '1000.00', payments: '4' }],
    unlinkedFails: true,
  });
  assert.strictEqual(pos.months[0].outstanding, 60 + 40);
  assert.strictEqual(pos.undeterminedPayments, 0);
});

/* ── The records that get filed from ─────────────────────────────────────── */

const TAX_CSV = (() => {
  const start = src.indexOf("app.get('/tax.csv'");
  assert.notStrictEqual(start, -1, '/tax.csv route not found');
  return src.slice(start, src.indexOf("\napp.get(", start + 10));
})();

test('the tax file reports the STORED tax portion, not a fresh calculation', () => {
  /* recordPayment() works the portion out when the money lands and writes it on
     the row, so that editing a quote afterwards cannot rewrite what was
     collected in a period already reported. Recomputing here re-derived it from
     today's quote total, so this file could disagree with the tax page — and
     they are meant to be the same number, filed twice. */
  assert.match(TAX_CSV, /p\.tax_portion/, 'read the recorded figure');
  assert.doesNotMatch(TAX_CSV, /round\(q\.tax \* \(p\.amount \/ q\.total\), 2\)/,
    'recomputing lets a later quote edit silently restate a filed period');
});

test('the tax file is escaped like every other export', () => {
  /* It had its own local escaper that handled quotes and commas but NOT the
     leading =/+/-/@ that Excel, Numbers and Sheets all evaluate. Every other
     export goes through csvEsc, which does. */
  assert.match(TAX_CSV, /sendCsv\(res,/,
    'use the shared writer so the formula-injection guard applies here too');
});

test('the tax file includes money that belongs to no quote', () => {
  assert.match(TAX_CSV, /FROM unlinked_payments/,
    'the ST-1 is filed on everything taken in, not on everything that had a quote');
});

test('an unknown tax portion exports BLANK, never 0', () => {
  assert.match(TAX_CSV, /tax_portion == null \? '' :/,
    'a blank cell asks the bookkeeper a question; a zero answers it wrongly');
});

test('unlinked receipts have a full export of their own', () => {
  assert.match(src, /app\.get\('\/exports\/unlinked\.csv'/,
    'the Stripe identifiers are what make the studio order findable');
  assert.match(src, /app\.get\('\/exports\/unlinked\.csv', requireAdmin/,
    'it carries customer names and money — admin only, like every other export');
});

test('a month with only unlinked money still shows on the records page', () => {
  assert.match(src, /would not\n       appear at all otherwise|seen\.has\(u\.ym\)/,
    'otherwise a month whose revenue all came through the studio reads as no business');
});

/* ── Clover ──────────────────────────────────────────────────────────────── */

const CLOVER = (() => {
  const start = src.indexOf("app.post('/webhooks/clover'");
  assert.notStrictEqual(start, -1, 'clover webhook not found');
  return src.slice(start, src.indexOf('\napp.', start + 10));
})();

test('a Clover payment is written down, not just emailed', () => {
  /* `submissions` has no amount column at all. The handler fetched the amount,
     put it in a customer email, flipped a status to 'paid' and stored no figure
     anywhere — so Clover revenue existed in this database only as a boolean. */
  assert.match(CLOVER, /recordUnlinkedPayment\(/,
    'the amount must reach a table, not only an inbox');
});

test('the payment is recorded BEFORE the submission is matched', () => {
  /* Both early returns below it — no matching submission, and already marked
     paid — used to drop the payment entirely. Money that arrived is a fact
     independent of whether this side can match it to a row. */
  const record = CLOVER.indexOf('recordUnlinkedPayment');
  const bail   = CLOVER.indexOf('if (!rows.length) return;');
  assert.ok(record !== -1 && bail !== -1);
  assert.ok(record < bail,
    'a payment with no matching enquiry is still a payment, and still carries tax');
});

test('an unmatched Clover payment says so rather than looking ordinary', () => {
  assert.match(CLOVER, /clover payment with no matching enquiry/,
    'the reason column is what makes it findable later');
});

test('a Clover payment cannot be booked twice', () => {
  assert.match(CLOVER, /extRef: `clover:\$\{paymentId\}`/,
    'the Clover payment id is what makes the row unique');
});

test('a failed Clover write is escalated, not just logged', () => {
  /* This handler acks 200 at the top, so throwing earns no retry — only an
     unhandled rejection. That makes the error table the only way anyone finds
     out a payment went unrecorded. */
  assert.match(CLOVER, /recordError\('clover-payment-unrecorded'/,
    'a lost payment must reach the digest the shop actually reads');
});

/* ── Refunds ─────────────────────────────────────────────────────────────── */

test('a refund of an unlinked payment comes back out of the same ledger', () => {
  assert.match(src, /no quote claimed the original payment[\s\S]{0,700}FROM unlinked_payments WHERE stripe_pi/i,
    'otherwise the books keep money that was given back');
});

test('an unmatchable refund is still reported rather than dropped silently', () => {
  assert.match(src, /no matching quote or unlinked payment for PI/,
    'the 08-16 lesson: code that decides nothing is wrong and says nothing');
});
