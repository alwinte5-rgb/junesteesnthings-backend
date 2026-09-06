#!/usr/bin/env node
/*
 * Recover payments Stripe took that this database never recorded.
 *
 * WHY
 * ---
 * The design studio at design.jtees.net runs its own Stripe Checkout against
 * this backend's webhook, sending its ORDER NUMBER as client_reference_id.
 * That fails QUOTE_CODE_RE, so bankStripeSession declined it — correctly, an
 * order is not a quote — and until now the money reached no table at all. It
 * was alerted by email and then existed only in the Stripe dashboard.
 *
 * Sales tax is filed on RECEIPTS. Every one of those payments is missing from
 * the ST-1, and the ST-1 is the number a payment plan gets built on. This walks
 * Stripe back to a date you choose and writes the missing ones onto the
 * unlinked ledger, so the tax position stops being a guess.
 *
 *   node tools/backfill-unlinked.js                      dry run, last 2 years
 *   node tools/backfill-unlinked.js --since 2024-01-01   dry run from a date
 *   node tools/backfill-unlinked.js --since 2024-01-01 --apply    write it
 *
 * Against production:
 *   railway run --service junesteesnthings-backend \
 *     node tools/backfill-unlinked.js --since 2024-01-01 --apply
 *
 * Nothing is written without --apply. Re-running is safe: rows are keyed on
 * the Stripe object id, so a second run inserts nothing.
 *
 * It also reconciles the other way — every succeeded CHARGE is checked against
 * both ledgers, and anything represented in neither is listed. Those are the
 * ones no automated rule can place, and they need a person.
 *
 * Env: STRIPE_SECRET_KEY, DATABASE_URL
 */

/* Optional: every other tool here reads process.env directly and is run under
   `railway run`, which injects the variables. Loading .env is a convenience for
   running it locally, not a dependency. */
try { require('dotenv').config(); } catch { /* not installed, or no .env */ }
const { Pool } = require('pg');

const KEY = process.env.STRIPE_SECRET_KEY || '';
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const sinceArg = (args[args.indexOf('--since') + 1] || '').match(/^\d{4}-\d{2}-\d{2}$/)
  ? args[args.indexOf('--since') + 1] : null;
const SINCE = sinceArg
  ? Math.floor(new Date(sinceArg + 'T00:00:00Z').getTime() / 1000)
  : Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 730;

const QUOTE_CODE_RE = /^[A-Z0-9]{6}$/;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const money = (n) => '$' + round2(n).toFixed(2);
const day = (unix) => new Date(unix * 1000).toISOString().slice(0, 10);

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => console.log('  \x1b[31m✗\x1b[0m ' + m);
const warn = (m) => console.log('  \x1b[33m!\x1b[0m ' + m);

async function stripe(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`https://api.stripe.com/v1/${path}${qs ? '?' + qs : ''}`, {
    headers: { Authorization: 'Bearer ' + KEY },
    signal: AbortSignal.timeout(20000),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(`Stripe ${path} ${r.status}: ${body?.error?.message || ''}`);
  return body;
}

/** Every page of a Stripe list endpoint, oldest first. */
async function* paginate(path, params) {
  let after = null;
  for (;;) {
    const page = await stripe(path, {
      ...params, limit: '100', ...(after ? { starting_after: after } : {}),
    });
    for (const item of page.data) yield item;
    if (!page.has_more || !page.data.length) return;
    after = page.data[page.data.length - 1].id;
  }
}

(async () => {
  console.log(`\nUnrecorded Stripe payments since ${day(SINCE)}` +
              `${APPLY ? '' : '  (DRY RUN — nothing will be written)'}\n` + '-'.repeat(64));

  if (!KEY) { bad('STRIPE_SECRET_KEY is not set'); process.exit(1); }
  if (!process.env.DATABASE_URL) { bad('DATABASE_URL is not set'); process.exit(1); }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const seenQuote = new Set((await pool.query(
      `SELECT DISTINCT stripe_session FROM quote_payments WHERE stripe_session IS NOT NULL`
    )).rows.map((r) => r.stripe_session));
    const seenPI = new Set((await pool.query(
      `SELECT DISTINCT stripe_pi FROM quote_payments WHERE stripe_pi IS NOT NULL`
    )).rows.map((r) => r.stripe_pi));
    const seenUnlinked = new Set((await pool.query(
      `SELECT ext_ref FROM unlinked_payments WHERE ext_ref IS NOT NULL`
    )).rows.map((r) => r.ext_ref));

    ok(`${seenQuote.size} session(s) already on the quote ledger, ` +
       `${seenUnlinked.size} on the unlinked ledger`);

    const found = [];
    let sessions = 0, banked = 0, already = 0, unpaid = 0;

    for await (const s of paginate('checkout/sessions', { 'created[gte]': String(SINCE) })) {
      sessions++;
      if (s.payment_status !== 'paid') { unpaid++; continue; }

      const code = String(s.client_reference_id || '').toUpperCase();
      // Banked against a quote already, by code or by having been seen.
      if (QUOTE_CODE_RE.test(code) || seenQuote.has(s.id)) { banked++; continue; }
      if (seenUnlinked.has(s.id)) { already++; continue; }

      found.push(s);
    }

    console.log(`\n  ${sessions} checkout session(s): ${banked} banked to a quote, ` +
                `${already} already recorded, ${unpaid} not paid, ` +
                `\x1b[1m${found.length} missing\x1b[0m`);

    if (found.length) {
      console.log('');
      let total = 0;
      for (const s of found) {
        const gross = round2((s.amount_total || 0) / 100);
        total += gross;
        const orderRef = String(s.metadata?.order_id || '').trim();
        const ref = orderRef ? `studio #${orderRef}`
                  : (s.client_reference_id || '(no reference)');
        console.log(`    ${day(s.created)}  ${money(gross).padStart(10)}  ${ref}` +
                    `  ${s.customer_details?.email || ''}`);
      }
      console.log(`\n    ${'TOTAL'.padStart(12)}  \x1b[1m${money(total)}\x1b[0m ` +
                  `of receipts missing from the books`);
      warn('The sales tax inside this is UNKNOWN on this side — it is recorded as');
      warn('NULL, not zero, and the tax page will report the period as undetermined');
      warn('until someone reconciles it against the studio\'s own order records.');
    }

    if (APPLY && found.length) {
      let written = 0, dupes = 0;
      for (const s of found) {
        const orderRef = String(s.metadata?.order_id || '').trim() || null;
        const pi = typeof s.payment_intent === 'string' ? s.payment_intent : null;
        try {
          await pool.query(
            `INSERT INTO unlinked_payments
               (amount, currency, channel, order_ref, client_ref, kind, source,
                stripe_session, stripe_pi, ext_ref, customer_email, customer_name,
                reason, note, created_at)
             VALUES ($1,$2,$3,$4,$5,'payment','backfill',$6,$7,$8,$9,$10,$11,$12,$13)`,
            [round2((s.amount_total || 0) / 100),
             String(s.currency || 'usd').toLowerCase(),
             orderRef ? 'studio' : 'unknown', orderRef,
             String(s.client_reference_id || '').trim() || null,
             s.id, pi, s.id,
             s.customer_details?.email || null, s.customer_details?.name || null,
             'no quote code', 'Recovered from Stripe by tools/backfill-unlinked.js',
             new Date(s.created * 1000).toISOString()]);
          written++;
        } catch (err) {
          if (err.code === '23505') { dupes++; continue; }
          throw err;
        }
      }
      ok(`${written} payment(s) written to the unlinked ledger` +
         (dupes ? `, ${dupes} already there` : ''));
    } else if (found.length) {
      console.log(`\n  Re-run with \x1b[1m--apply\x1b[0m to write these.`);
    }

    /* ── The other direction ──────────────────────────────────────────────
       A Checkout Session is not the only way money reaches a Stripe account.
       Walk the charges too and name anything represented in NEITHER ledger,
       so the gap is bounded by what actually settled rather than by what
       happened to have a session. These are not written — a charge with no
       session carries no reference at all, so placing it is a human job. */
    const orphans = [];
    let charges = 0;
    for await (const c of paginate('charges', { 'created[gte]': String(SINCE) })) {
      charges++;
      if (c.status !== 'succeeded') continue;
      const pi = typeof c.payment_intent === 'string' ? c.payment_intent : null;
      if (pi && seenPI.has(pi)) continue;
      const { rows } = await pool.query(
        `SELECT 1 FROM unlinked_payments WHERE stripe_pi = $1 LIMIT 1`, [pi]);
      if (rows.length) continue;
      if (found.some((s) => s.payment_intent === pi)) continue; // covered above
      orphans.push(c);
    }

    console.log(`\n  ${charges} charge(s) checked against both ledgers.`);
    if (orphans.length) {
      warn(`${orphans.length} succeeded charge(s) match NOTHING in either ledger:`);
      for (const c of orphans.slice(0, 25)) {
        console.log(`    ${day(c.created)}  ${money((c.amount || 0) / 100).padStart(10)}  ` +
                    `${c.id}  ${c.billing_details?.email || c.receipt_email || ''}`);
      }
      if (orphans.length > 25) console.log(`    …and ${orphans.length - 25} more`);
      warn('These have no checkout session to identify them. Place them by hand.');
    } else {
      ok('Every succeeded charge is accounted for in one ledger or the other.');
    }

    console.log('');
  } finally {
    await pool.end();
  }
})().catch((e) => { bad(e.message); process.exit(1); });
