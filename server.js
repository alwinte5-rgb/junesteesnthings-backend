require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const crypto     = require('crypto');
/* Runs the shared pricing source (quotePricingSource) so the server prices a
   line with the same characters the browser does. See that function. */
const vm         = require('vm');
const { Pool }   = require('pg');
const { Resend } = require('resend');
const axios      = require('axios');
const cloudinary = require('cloudinary').v2;

/* CLUDINARY_API_SECRET is a typo, and it is the name the secret is actually
   stored under on Railway. #7 removed this fallback as a tidy-up and took
   signed uploads down with it: the correctly-spelled variable has never been
   set, so `/api/cloudinary-signature` began answering 503 and every photo
   upload silently stopped attaching. Keep both spellings until the Railway
   variable is renamed — see README, "Cloudinary". */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET || process.env.CLUDINARY_API_SECRET,
});

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false, // site uses inline scripts and CDN resources throughout
  // Public images are embedded in emails and on design.jtees.net — the default
  // same-origin policy makes browsers/webmail refuse to render them.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: ['https://www.jtees.net', 'https://jtees.net', 'https://design.jtees.net'] }));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    if (req.url && req.url.startsWith('/webhooks/')) req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Grad season pages are retired — redirect old links home.
app.get(['/grad', '/grad/', '/grad/*'], (_req, res) => res.redirect(302, '/'));
// Design Ideas is replaced by the online Design Studio — permanent redirect.
app.get('/design-ideas.html', (_req, res) => res.redirect(301, 'https://design.jtees.net/'));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database ─────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      phone               TEXT NOT NULL,
      email               TEXT NOT NULL,
      description         TEXT,
      photo_url           TEXT,
      hubspot_contact_id  TEXT,
      hubspot_deal_id     TEXT,
      clover_customer_id  TEXT,
      clover_order_id     TEXT,
      status              TEXT DEFAULT 'new',
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Quotes texted from June's phone. The row is the source of truth — Brevo is
  // mirrored best-effort, so a CRM outage can never lose a quote.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id                SERIAL PRIMARY KEY,
      code              TEXT UNIQUE NOT NULL,
      name              TEXT,
      phone             TEXT,
      email             TEXT,
      items             JSONB NOT NULL DEFAULT '[]',
      subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
      notes             TEXT,
      status            TEXT NOT NULL DEFAULT 'sent',
      valid_until       DATE,
      viewed_at         TIMESTAMPTZ,
      accepted_at       TIMESTAMPTZ,
      followed_up_at    TIMESTAMPTZ,
      brevo_contact_id  TEXT,
      brevo_deal_id     TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Added after the first release; ALTERs are idempotent so this is safe to re-run.
  for (const col of [
    'needed_by DATE',                 // when the customer needs it
    'tax NUMERIC(10,2) DEFAULT 0',
    'total NUMERIC(10,2) DEFAULT 0',  // subtotal + tax (card fee is added at payment)
    'deposit NUMERIC(10,2) DEFAULT 0',
    /* An off-the-top discount on the whole job — the "I'll do it for X" that
       actually gets given at the counter. What was ENTERED is stored (percent
       or dollars), not just the resulting figure, so editing the lines later
       re-applies "10% off" instead of silently freezing yesterday's dollars.
       The dollar amount is always derived, in quoteTotals(). */
    "discount_kind TEXT NOT NULL DEFAULT 'amt'",   // 'pct' | 'amt'
    'discount_value NUMERIC(10,2) NOT NULL DEFAULT 0',
    'discount_note TEXT',                          // the reason, shown to them
    'paid_amount NUMERIC(10,2) DEFAULT 0',
    'paid_method TEXT',
    'paid_at TIMESTAMPTZ',
    'stripe_session TEXT',
    'change_request TEXT',            // what the customer asked to change
    'revision INT DEFAULT 1',         // bumped each time June edits it
    'deposit_nudged_at TIMESTAMPTZ',  // accepted but deposit unpaid reminder
    'balance_nudged_at TIMESTAMPTZ',  // deposit in, balance still outstanding
    'reorder_nudged_at TIMESTAMPTZ',  // paid in full months ago, worth asking again
    /* Job milestones. These exist so the intake checklist can be DERIVED rather
       than written down somewhere nobody opens — the steps the database can
       already answer (contact, job, deadline, quote, deposit, balance) are
       computed, and these cover the few it cannot see. */
    'artwork_at TIMESTAMPTZ',         // usable artwork in hand
    'blanks_ordered_at TIMESTAMPTZ',  // blanks ordered from the supplier
    'blanks_in_at TIMESTAMPTZ',       // blanks received and counted
    'proof_sent_at TIMESTAMPTZ',      // proof sent to the customer
    'proof_ok_at TIMESTAMPTZ',        // customer approved the proof
    'production_at TIMESTAMPTZ',      // on the press
    'qc_at TIMESTAMPTZ',              // counted and checked against the order
    'shipped_at TIMESTAMPTZ',         // handed to the carrier / ready for pickup
    'delivered_at TIMESTAMPTZ',       // picked up or shipped
    'ship_by DATE',                   // must leave here by this date
    /* A customer who will not name a date is the normal case, not an error.
       The shop still needs a working date to schedule blanks against, so the
       target is ours and needed_by stays theirs — and 'no fixed date' is a
       real answer that stops the checklist asking forever. */
    'target_date DATE',
    'deadline_flexible BOOLEAN DEFAULT FALSE',
    /* Job costs. Revenue without cost tells you a job was busy, not whether it
       was worth doing — and for a print shop the blanks are most of the cost.
       Kept per quote rather than per line so entering it stays a ten-second
       job; a shop that has to itemise will simply stop entering it. */
    'cost_blanks NUMERIC(10,2) DEFAULT 0',
    'cost_supplies NUMERIC(10,2) DEFAULT 0',   // ink, transfers, thread, packaging
    'cost_outsourced NUMERIC(10,2) DEFAULT 0', // anything sent out
    /* Freight, in or out. Its own line because it belongs to the job but not to
       any garment on it, and on a small order it is often the difference
       between a healthy margin and a thin one. */
    'cost_shipping NUMERIC(10,2) DEFAULT 0',
    'cost_note TEXT',
    'blanks_supplier TEXT',           // who the blanks came from
    'blanks_tracking TEXT',           // inbound tracking for the blanks
    'tracking TEXT',                  // outbound tracking to the customer
    'ship_method TEXT',               // pickup | ground | expedited
  ]) {
    await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS quotes_phone_idx ON quotes (phone)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS quotes_email_idx ON quotes (email)`);

  // Customer reviews. Collected after delivery, shown on the storefront, and
  // fed into aggregateRating schema so search results can show stars.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id           SERIAL PRIMARY KEY,
      token        TEXT UNIQUE NOT NULL,
      name         TEXT,
      email        TEXT,
      phone        TEXT,
      rating       INT,
      title        TEXT,
      body         TEXT,
      product      TEXT,
      source       TEXT DEFAULT 'site',
      order_ref    TEXT,
      quote_code   TEXT,
      approved     BOOLEAN DEFAULT FALSE,
      requested_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS reviews_approved_idx ON reviews (approved, submitted_at DESC)`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`).catch(() => {});
  /* Photos the customer attaches to their review — a picture of the actual
     order is worth more than anything we could write about it. */
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb`).catch(() => {});

  // Marketing opt-outs. Required to honour the one-click unsubscribe that
  // Gmail/Yahoo mandate of bulk senders — an unsubscribe link that does not
  // actually suppress mail is worse than none (it earns spam complaints).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_optouts (
      email       TEXT PRIMARY KEY,
      source      TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grad_orders (
      id             SERIAL PRIMARY KEY,
      order_ref      TEXT UNIQUE NOT NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      status         TEXT DEFAULT 'new',
      parent_name    TEXT,
      student_name   TEXT,
      email          TEXT,
      phone          TEXT,
      school         TEXT,
      event_date     TEXT,
      needed_by      TEXT,
      address        TEXT,
      event_type     TEXT,
      products       JSONB,
      apparel        JSONB,
      designs        JSONB,
      upload_method  TEXT,
      upload_link    TEXT,
      payment_method TEXT,
      notes          TEXT,
      signature      TEXT,
      photos         JSONB DEFAULT '[]'::jsonb,
      admin_notes         TEXT,
      raw_data            JSONB,
      hubspot_contact_id  TEXT,
      hubspot_deal_id     TEXT,
      clover_customer_id  TEXT,
      clover_order_id     TEXT
    )
  `);
  // Add columns if they were added after initial deploy
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT`);
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS hubspot_deal_id TEXT`);
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS clover_customer_id TEXT`);
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS clover_order_id TEXT`);

  /* ── Payment ledger ───────────────────────────────────────────────────────
     quotes.paid_amount was a single mutable number, so a payment could only
     ever be ADDED — a mistyped or duplicated entry could not be corrected, and
     there was no record of what made up the total. One real quote was recorded
     at twice its deposit with no way to walk it back.

     Payments are now append-only rows. Corrections are negative rows, so the
     history survives the fix. quotes.paid_amount is kept as a cached rollup of
     SUM(amount) because a lot of existing code reads it. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_payments (
      id             BIGSERIAL PRIMARY KEY,
      quote_code     TEXT NOT NULL,
      amount         NUMERIC(10,2) NOT NULL,   -- signed; negative = correction
      fee            NUMERIC(10,2) DEFAULT 0,  -- card surcharge included in amount
      method         TEXT NOT NULL,            -- card | zelle | cash | transfer | other
      kind           TEXT NOT NULL DEFAULT 'payment',  -- payment | correction | refund
      source         TEXT NOT NULL DEFAULT 'manual',   -- manual | stripe_redirect | stripe_webhook | backfill
      stripe_session TEXT,
      stripe_pi      TEXT,
      ext_ref        TEXT,             -- Stripe object that makes this row unique
      note           TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`ALTER TABLE quote_payments ADD COLUMN IF NOT EXISTS ext_ref TEXT`).catch(() => {});
  /* ── Overheads ────────────────────────────────────────────────────────────
     Job costs answer "was that job worth doing". They cannot answer "did the
     business make money", because rent is owed whether or not anybody ordered.
     These are the costs that are not attached to a job.

     `recurs` marks a fixed monthly cost (rent, insurance) so it can be rolled
     forward instead of retyped every month and quietly forgotten. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id          BIGSERIAL PRIMARY KEY,
      spent_on    DATE NOT NULL DEFAULT CURRENT_DATE,
      category    TEXT NOT NULL,
      amount      NUMERIC(10,2) NOT NULL,
      vendor      TEXT,
      note        TEXT,
      recurs      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (spent_on)`);

  /* Remembered blank costs, keyed on the normalised garment description —
     quote lines are typed by hand, so there is no product id to key on. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blank_costs (
      cost_key    TEXT PRIMARY KEY,
      label       TEXT,
      unit_cost   NUMERIC(10,2) NOT NULL,
      samples     INT NOT NULL DEFAULT 1,
      last_quote  TEXT,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    )`);

  await pool.query(`CREATE INDEX IF NOT EXISTS quote_payments_code_idx ON quote_payments (quote_code)`);
  /* The idempotency guarantee, and the reason a webhook can be retried safely.
     ext_ref holds whichever Stripe object the row came from — checkout session,
     refund, or dispute. The redirect handler and the webhook race each other on
     every card payment; whichever arrives second hits this and is discarded, so
     money is never counted twice. Stripe also retries webhooks on any non-2xx,
     which without this would duplicate every retried payment. */
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS quote_payments_extref_uniq
                      ON quote_payments (ext_ref) WHERE ext_ref IS NOT NULL`);

  /* ── Sales tax set-aside ──────────────────────────────────────────────────
     Tax collected is not income — it is money held on behalf of the state that
     happens to be sitting in the same bank account. The failure mode is not
     miscalculating it, it is spending it. So each payment carries its own tax
     portion, and remittances are recorded against it; what is left is what
     still has to be set aside. */
  await pool.query(`ALTER TABLE quote_payments ADD COLUMN IF NOT EXISTS tax_portion NUMERIC(10,2) DEFAULT 0`).catch(() => {});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tax_remittances (
      id          BIGSERIAL PRIMARY KEY,
      period      TEXT NOT NULL,           -- '2026-08', the period being paid
      amount      NUMERIC(10,2) NOT NULL,
      paid_at     DATE NOT NULL DEFAULT CURRENT_DATE,
      reference   TEXT,                    -- confirmation number from the state
      note        TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )`);

  /* Backfill the tax portion for payments recorded before this column existed,
     apportioned by how much of the job that payment covered. */
  await pool.query(`
    UPDATE quote_payments p
       SET tax_portion = round(q.tax * (p.amount / NULLIF(q.total,0)), 2)
      FROM quotes q
     WHERE q.code = p.quote_code
       AND COALESCE(p.tax_portion,0) = 0
       AND q.tax > 0 AND q.total > 0`).catch(() => {});

  /* One-time backfill so history does not start empty and the rollup below
     cannot zero out money that was recorded before the ledger existed. */
  await pool.query(`
    INSERT INTO quote_payments (quote_code, amount, method, kind, source, stripe_session, note, created_at)
    SELECT q.code, q.paid_amount, COALESCE(q.paid_method,'other'), 'payment', 'backfill',
           q.stripe_session, 'Backfilled from quotes.paid_amount', COALESCE(q.paid_at, q.created_at)
      FROM quotes q
     WHERE COALESCE(q.paid_amount,0) <> 0
       AND NOT EXISTS (SELECT 1 FROM quote_payments p WHERE p.quote_code = q.code)`);

  console.log('Database ready.');
}

/**
 * Sales tax position, by month — collected, remitted, and what is still held.
 *
 * The period is the month the MONEY ARRIVED, not the month the quote was
 * written: tax is owed on receipts, so a July quote paid in August belongs to
 * August. Corrections and refunds carry their tax back out automatically
 * because they are negative rows in the same ledger.
 */
async function taxPositionByMonth(limit = 24) {
  const { rows: collected } = await pool.query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS period,
            COALESCE(SUM(tax_portion),0) AS collected,
            COALESCE(SUM(amount),0)      AS gross,
            COUNT(*)                     AS payments
       FROM quote_payments
      GROUP BY 1`);
  const { rows: remitted } = await pool.query(
    `SELECT period, COALESCE(SUM(amount),0) AS remitted, MAX(paid_at) AS last_paid
       FROM tax_remittances GROUP BY 1`);

  const byPeriod = {};
  for (const r of collected) {
    byPeriod[r.period] = {
      period: r.period, collected: round2(Number(r.collected)),
      gross: round2(Number(r.gross)), payments: Number(r.payments),
      remitted: 0, last_paid: null,
    };
  }
  for (const r of remitted) {
    byPeriod[r.period] ||= { period: r.period, collected: 0, gross: 0, payments: 0, remitted: 0, last_paid: null };
    byPeriod[r.period].remitted = round2(Number(r.remitted));
    byPeriod[r.period].last_paid = r.last_paid;
  }

  const list = Object.values(byPeriod)
    .map((p) => ({ ...p, outstanding: round2(p.collected - p.remitted) }))
    .sort((a, b) => (a.period < b.period ? 1 : -1))
    .slice(0, limit);

  return {
    months: list,
    // What must be sitting in the bank right now, across every unpaid period.
    setAside: round2(list.reduce((s, p) => s + p.outstanding, 0)),
  };
}

const periodLabel = (p) => {
  const [y, m] = String(p).split('-');
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

/** Recompute quotes.paid_amount from the ledger. The ledger is the truth. */
async function syncPaidAmount(code) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS paid,
            MAX(created_at) FILTER (WHERE amount > 0) AS last_at,
            (ARRAY_AGG(method ORDER BY created_at DESC) FILTER (WHERE amount > 0))[1] AS last_method
       FROM quote_payments WHERE quote_code = $1`, [code]);
  const paid = round2(Number(rows[0]?.paid || 0));
  await pool.query(
    `UPDATE quotes SET paid_amount = $2,
            paid_at = COALESCE($3, paid_at),
            paid_method = COALESCE($4, paid_method)
      WHERE code = $1`,
    [code, paid, rows[0]?.last_at || null, rows[0]?.last_method || null]);
  return paid;
}

/**
 * Append a payment to the ledger and refresh the rollup.
 * Returns { ok, duplicate, paid }. A duplicate stripe_session is not an error —
 * it means the other handler got there first, which is the desired outcome.
 */
async function recordPayment({ code, amount, fee = 0, method, kind = 'payment',
                               source = 'manual', session = null, pi = null,
                               extRef = null, note = null }) {
  /* The tax inside this payment, apportioned by how much of the job it covers.
     Computed at write time so the set-aside figure never has to re-derive
     itself from a quote total that may since have been edited. A correction or
     refund carries its tax back out the same way. */
  let taxPortion = 0;
  try {
    const { rows: tq } = await pool.query(
      'SELECT tax, total FROM quotes WHERE code = $1', [code]);
    if (tq.length && Number(tq[0].total) > 0 && Number(tq[0].tax) > 0) {
      taxPortion = round2(Number(tq[0].tax) * (round2(amount) / Number(tq[0].total)));
    }
  } catch { /* a missing quote is handled by the insert below */ }

  try {
    await pool.query(
      `INSERT INTO quote_payments (quote_code, amount, fee, method, kind, source, stripe_session, stripe_pi, ext_ref, note, tax_portion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [code, round2(amount), round2(fee), method, kind, source, session, pi,
       extRef || session, note, taxPortion]);
  } catch (err) {
    // 23505 = unique_violation on the ext_ref index.
    if (err.code === '23505') return { ok: false, duplicate: true, paid: null };
    throw err;
  }
  const paid = await syncPaidAmount(code);
  return { ok: true, duplicate: false, paid };
}

// ─── Email ────────────────────────────────────────────────────────────────────

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const NOTIFY_EMAIL = process.env.NOTIFICATION_EMAIL;
const FROM_ADDRESS = `June's Tees & Things <${NOTIFY_EMAIL}>`;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://www.jtees.net').replace(/\/+$/, '');
// Every customer-facing message is signed as June. Single constant so the SMS
// templates, quote page and order emails can never drift apart.
const SHOP_NAME = "June's Tees & Things";
const SHOP_SIGNER = 'June';
const SHOP_PHONE = '(773) 849-1854';
const SHOP_EMAIL = process.env.JT_SHOP_EMAIL || NOTIFY_EMAIL;


// Plain-text alternative. Mail with no text/plain part scores measurably worse
// with spam filters, and every message here was HTML-only.
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
             (_m, href, label) => `${label.replace(/<[^>]+>/g, '').trim()} (${href})`)
    .replace(/<\/td>\s*<td[^>]*>/gi, '  ')   // keep table cells apart
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '\u00b7').replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim();
}

// One-click unsubscribe. Gmail and Yahoo have REQUIRED this of bulk senders
// since Feb 2024 (RFC 8058) — marketing mail without it gets spam-foldered,
// which is why the shop's abandoned-cart mail was landing in junk.
// Transactional mail (order receipts) is exempt and passes marketing:false.
function unsubHeaders(to) {
  const token = unsubToken(to);
  const url = `${PUBLIC_BASE_URL}/api/unsubscribe?e=${encodeURIComponent(to)}&t=${token}`;
  return {
    'List-Unsubscribe': `<${url}>, <mailto:${NOTIFY_EMAIL}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/* The secret unsubscribe links are signed with, or '' when none is configured.
   This used to be JT_INTERNAL_KEY with a hardcoded 'jtees' fallback. Two
   problems with that, and the fallback was the smaller one:

   JT_INTERNAL_KEY is the shared secret for design.jtees.net and travels in
   query strings to that host (jt-cron.php?key=, jt-catalog.php?key=), so it
   lands in its access logs — it is the secret most likely to be rotated here.
   But an unsubscribe token has to stay valid for as long as the email sits in
   somebody's inbox, so rotating the shared key would silently invalidate every
   unsubscribe link already delivered. A dead one-click unsubscribe is exactly
   what gets bulk mail spam-foldered (RFC 8058, see above), and nothing would
   surface it until deliverability fell off weeks later.

   UNSUB_TOKEN_SECRET is a dedicated secret that has never travelled in a query
   string. New mail is signed with it; links delivered before it existed were
   signed with JT_INTERNAL_KEY and are still accepted, so nothing already in an
   inbox breaks. It also keeps signing working on a deploy that lands before
   the variable is set. */
function unsubSecret() {
  return process.env.UNSUB_TOKEN_SECRET?.trim() || process.env.JT_INTERNAL_KEY?.trim() || '';
}

/* Every secret a delivered link could legitimately carry, newest first.

   JT_INTERNAL_KEY is here only to honour links sent before UNSUB_TOKEN_SECRET
   existed. Two consequences worth knowing before touching either variable:

   - Accepting it means anyone who can read design.jtees.net's access logs can
     still forge an unsubscribe token. That is exactly today's situation, so it
     is not a regression — but it is why this entry should be deleted once mail
     signed with the old key has aged out of people's inboxes.
   - This tracks whatever JT_INTERNAL_KEY currently *is*. Rotating the shared
     key therefore closes this window early and breaks those older links. Drop
     this entry deliberately before rotating, rather than discovering it. */
function unsubSecrets() {
  const dedicated = process.env.UNSUB_TOKEN_SECRET?.trim();
  /* The secret this one replaced. Rotating UNSUB_TOKEN_SECRET used to kill
     every link already delivered under it in the same instant — there was
     nowhere to keep the outgoing value, so a rotation done for good reasons
     (the secret had leaked into another service's environment) silently broke
     one-click unsubscribe for everything sent since the variable was
     introduced. Gmail and Yahoo require that link to work for bulk senders,
     and the failure does not surface as an error: it surfaces as deliverability
     falling off weeks later, which is exactly the scar the block above records.

     Verification only — never signing. Set it to the outgoing value when you
     rotate, then delete it once mail signed with it has aged out. */
  const previous = process.env.UNSUB_TOKEN_SECRET_PREVIOUS?.trim();
  const legacy = process.env.JT_INTERNAL_KEY?.trim();
  const secrets = [];
  for (const s of [dedicated, previous, legacy]) {
    if (s && !secrets.includes(s)) secrets.push(s);
  }
  return secrets;
}

function signUnsub(email, secret) {
  return crypto.createHmac('sha256', secret)
    .update(String(email).toLowerCase()).digest('hex').slice(0, 32);
}

function unsubToken(email) {
  const secret = unsubSecret();
  // No secret means no signable token. Never fall back to a guessable
  // constant — that makes a valid token forgeable for any address on the list.
  if (!secret) return '';
  return signUnsub(email, secret);
}

/** Constant-time check against every accepted secret. Never true without one. */
function unsubTokenValid(email, token) {
  let ok = false;
  // No early exit: every candidate is checked so the time taken does not
  // reveal which secret matched.
  for (const secret of unsubSecrets()) {
    if (hexEqual(token, signUnsub(email, secret))) ok = true;
  }
  return ok;
}

function unsubFooter(to) {
  const token = unsubToken(to);
  const url = `${PUBLIC_BASE_URL}/api/unsubscribe?e=${encodeURIComponent(to)}&t=${token}`;
  return `<p style="color:#9ca3af;font-size:11px;margin-top:18px;line-height:1.5;">
    June&rsquo;s Tees &amp; Things &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657<br>
    Don't want these emails? <a href="${url}" style="color:#9ca3af;">Unsubscribe</a>.</p>`;
}

/** Has this address opted out of marketing mail? */
async function isUnsubscribed(email) {
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM email_optouts WHERE email = $1 LIMIT 1', [String(email).toLowerCase()]);
    return rows.length > 0;
  } catch { return false; }   // never block a send because the table is unreachable
}

/* Brevo answers a send with `201 Created` and a real messageId even when the
   account has zero send credits left, and then quietly discards the message.
   Nothing throws, so the Resend fallback below never fires and every caller
   believes the mail went out.

   That is not hypothetical. On 2026-08-16 the shared Brevo account burned its
   whole monthly send limit in one day; from then until it was found on 08-19
   every notification the shop sends was accepted and destroyed — including the
   "Deposit paid" alert for quote 731EAC, $141.12 that had banked correctly.
   The money was never at risk; the shop simply was never told, and no log line
   anywhere said so.

   So the balance is polled and Brevo is skipped while it is empty, which is
   what lets Resend actually take over. Any failure to read the balance leaves
   Brevo enabled — an unreachable status endpoint must not stop mail. */
const BREVO_CREDIT_TTL = 5 * 60 * 1000;
let brevoCreditCheckedAt = 0;
/* Starts optimistic: before anything is known, Brevo is tried. After a reading
   lands this holds the last thing the balance actually said. */
let brevoHasCredits = true;

async function brevoCanSend(apiKey) {
  /* The operator's override, for when the balance is not the problem — a
   compromised key being the case it was written for. Costs one env var and
   needs no deploy to undo. */
  if (/^(1|true|yes|on)$/i.test(process.env.JT_DISABLE_BREVO || '')) return false;

  if (Date.now() - brevoCreditCheckedAt < BREVO_CREDIT_TTL) return brevoHasCredits;
  brevoCreditCheckedAt = Date.now();
  try {
    const r = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey },
      signal: AbortSignal.timeout(8000),
    });
    /* An unreadable balance is not news, so it keeps whatever the last real
       reading said rather than flipping back to optimism. Resetting to true
       here would walk straight back into the silent drop every time Brevo's
       status endpoint hiccupped, since sending is exactly what does not fail
       when there are no credits. Staying on Resend costs nothing by comparison. */
    if (!r.ok) return brevoHasCredits;
    const d = await r.json();
    const limit = (d.plan || []).find((p) => p.creditsType === 'sendLimit');
    const ok = !limit || Number(limit.credits) > 0;
    // Said on every re-check while empty: this is the one warning that explains
    // an otherwise silent absence of mail.
    if (!ok) console.error('sendEmail: Brevo send credits exhausted — routing to Resend');
    else if (!brevoHasCredits) console.log('sendEmail: Brevo credits restored — resuming Brevo');
    return (brevoHasCredits = ok);
  } catch {
    return brevoHasCredits;
  }
}

// ─── Brevo email (preferred for customer messages; Resend is the fallback) ───
// marketing:true adds the unsubscribe headers/footer and honours opt-outs.
// Order receipts and shipping notices are transactional and stay exempt.
async function sendEmail({ to, subject, html, replyTo, marketing = false, text }) {
  if (marketing && await isUnsubscribed(to)) {
    console.log(`sendEmail: skipped ${to} (unsubscribed)`);
    return;
  }
  if (marketing) html = html + unsubFooter(to);
  const textContent = text || htmlToText(html);
  const extraHeaders = marketing ? unsubHeaders(to) : {};

  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey && await brevoCanSend(brevoKey)) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: "June's Tees & Things", email: NOTIFY_EMAIL },
          to: [{ email: to }],
          replyTo: { email: replyTo || NOTIFY_EMAIL },
          subject,
          htmlContent: html,
          textContent,
          ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`Brevo ${r.status}: ${t.slice(0, 200)}`);
      }
      return;
    } catch (err) {
      console.error('sendEmail: Brevo failed, falling back to Resend:', err.message);
    }
  }
  if (!resend) throw new Error('Email send failed: Brevo unavailable and no RESEND_API_KEY fallback is configured');
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS, reply_to: replyTo || NOTIFY_EMAIL, to, subject, html,
    text: textContent,
    ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
}

/* ── Brevo breach monitor ─────────────────────────────────────────────────────
   What this exists to catch, because it already happened once and nothing saw
   it: on 2026-08-16 the shared Brevo account sent 7,896 emails in a day — a
   French "Prime Video" phishing run to addresses the shop has never had — and
   burned the whole monthly send limit. Normal traffic here is under 20 a day.
   Nobody noticed for three days, and the way it surfaced was a customer
   payment going unannounced, which is a terrible smoke alarm.

   Two rules make this monitor worth having:

   1. It alerts through Resend DIRECTLY, never through sendEmail(). If Brevo is
      the thing being abused, or is out of credits, routing the warning about
      Brevo through Brevo is how you get silence at exactly the wrong moment.
   2. It alerts on volume, not just on credits hitting zero. Zero credits is
      the aftermath; a spike is the event. By the time the balance is empty the
      damage — reputation, blocklisting, spent limit — is already done. */

const BREVO_ALERT_DAILY_REQUESTS = Number(process.env.JT_BREVO_ALERT_REQUESTS || 250);
const BREVO_ALERT_HARD_BOUNCES   = Number(process.env.JT_BREVO_ALERT_BOUNCES  || 25);
const BREVO_ALERT_SPAM_REPORTS   = Number(process.env.JT_BREVO_ALERT_SPAM     || 8);

/* One alert per condition per day. A breach that trips three thresholds should
   send one email, and an hourly sweep must not turn it into 24. */
const brevoAlertsSent = new Map();
function alertOncePerDay(kind) {
  const today = new Date().toISOString().slice(0, 10);
  if (brevoAlertsSent.get(kind) === today) return false;
  brevoAlertsSent.set(kind, today);
  return true;
}

/** Send without touching Brevo. Returns false rather than throwing. */
async function alertViaResend(subject, innerHtml) {
  if (!resend) {
    console.error('BREACH ALERT could not be sent — no RESEND_API_KEY:', subject);
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS, to: SHOP_EMAIL, reply_to: NOTIFY_EMAIL, subject,
      html: `<div style="font-family:system-ui,sans-serif;max-width:600px">${innerHtml}</div>`,
      text: htmlToText(innerHtml),
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    return true;
  } catch (e) {
    console.error('BREACH ALERT send failed:', e.message);
    return false;
  }
}

async function brevoBreachCheck() {
  const key = process.env.BREVO_API_KEY;
  if (!key) return;
  const H = { 'api-key': key, 'Content-Type': 'application/json' };
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [acctRes, statRes] = await Promise.all([
      fetch('https://api.brevo.com/v3/account', { headers: H, signal: AbortSignal.timeout(10000) }),
      fetch(`https://api.brevo.com/v3/smtp/statistics/aggregatedReport?startDate=${today}&endDate=${today}`,
            { headers: H, signal: AbortSignal.timeout(10000) }),
    ]);

    /* A key that stopped working is worth saying out loud — it is what a
       revocation, or a rotation applied to only half the variables, looks like
       from in here.

       But only if it is real. This alerted on 2026-08-27 and the key was fine
       minutes later: both endpoints answered 200, the key was valid, credits
       were simply 0. One transient 401 had been read as revocation. A monitor
       that cries wolf gets muted, and a muted monitor is worse than none — so a
       single failure now buys a retry, and only two in a row raise the alarm. */
    if (acctRes.status === 401 || statRes.status === 401) {
      await new Promise((r) => setTimeout(r, 3000));
      let stillDead = true;
      try {
        const retry = await fetch('https://api.brevo.com/v3/account',
          { headers: H, signal: AbortSignal.timeout(10000) });
        stillDead = retry.status === 401;
      } catch {
        // Unreachable is not the same as rejected; say nothing.
        stillDead = false;
      }
      if (!stillDead) {
        console.warn('brevoBreachCheck: transient 401 from Brevo, key still valid on retry');
        return;
      }
      if (alertOncePerDay('unauthorized')) {
        await alertViaResend('🚨 Brevo key rejected — jtees.net',
          `<h2 style="color:#b91c1c">Brevo is answering 401 twice over</h2>
           <p>The key in <code>BREVO_API_KEY</code> was rejected, retried, and rejected again.
              Mail is falling back to Resend, but CRM contact and deal sync is failing.</p>
           <p>If you just rotated keys, update the Railway variable. If you did not,
              treat the key as revoked and check the Brevo audit log.</p>
           <p style="color:#6b7280;font-size:13px">Worth knowing: a 401 is an authentication
              failure, <b>not</b> an out-of-credits condition. With no credits Brevo returns
              <code>201</code> and a messageId and then silently discards the mail — which is
              why this app checks the balance separately.</p>`);
      }
      return;
    }

    const alerts = [];
    if (statRes.ok) {
      const st = await statRes.json();
      const reqs = Number(st.requests || 0);
      const hb   = Number(st.hardBounces || 0);
      const spam = Number(st.spamReports || 0);

      if (reqs >= BREVO_ALERT_DAILY_REQUESTS)
        alerts.push([`volume`, `<b>${reqs}</b> emails sent today (alert threshold ${BREVO_ALERT_DAILY_REQUESTS};
                      this shop normally sends fewer than 20).`]);
      if (hb >= BREVO_ALERT_HARD_BOUNCES)
        alerts.push([`bounces`, `<b>${hb}</b> hard bounces today — a sign of mail to addresses that were never yours.`]);
      if (spam >= BREVO_ALERT_SPAM_REPORTS)
        alerts.push([`spam`, `<b>${spam}</b> spam complaints today — this damages delivery for real customer mail.`]);
    }

    if (acctRes.ok) {
      const acct = await acctRes.json();
      const limit = (acct.plan || []).find((pl) => pl.creditsType === 'sendLimit');
      if (limit && Number(limit.credits) <= 0)
        alerts.push([`credits`, `Send credits are <b>exhausted</b>. Brevo will accept mail with a 201 and
                     silently discard it — the app is routing around it to Resend.`]);
    }

    for (const [kind, line] of alerts) {
      if (!alertOncePerDay(kind)) continue;
      await alertViaResend(`🚨 Brevo anomaly (${kind}) — jtees.net`,
        `<h2 style="color:#b91c1c">Something is wrong with the Brevo account</h2>
         <p>${line}</p>
         <p style="margin-top:14px"><b>Check now:</b></p>
         <ul style="line-height:1.7">
           <li>Brevo → Statistics → who the recent sends went to</li>
           <li>Brevo → Settings → API Keys → "last used" per key</li>
           <li>Brevo → Security / audit log → unfamiliar logins</li>
         </ul>
         <p style="color:#6b7280;font-size:13px">If this is an intrusion, revoke every API key. Sending
            continues on Resend; set <code>JT_DISABLE_BREVO=1</code> to stop using Brevo entirely.</p>`);
      console.error(`BREVO BREACH ALERT (${kind}): ${line.replace(/<[^>]+>/g, '')}`);
    }
  } catch (e) {
    // Never throws: a monitor that can break the hourly sweep is a liability.
    console.error('brevoBreachCheck failed:', e.message);
  }
}

// Single source of truth for email validation across all endpoints
function isValidEmail(str) {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(str || '').trim());
}

// Rotating promo code — MUST match the designer's jt_promo_config() on
// design.jtees.net: pool from JT_PROMO_CODES (comma list), index =
// floor(now/1week) % len. Codes are emailed only, never displayed on-page,
// and rotate weekly (the designer also accepts last week's).
function activePromoCode() {
  const pool = (process.env.JT_PROMO_CODES || process.env.JT_PROMO_CODE || 'SAVE10')
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (!pool.length) pool.push('SAVE10');
  return pool[Math.floor(Date.now() / 1000 / 604800) % pool.length];
}
console.log(`Active recovery promo code this week: ${activePromoCode()}`);

function escEmail(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// Shared "design it online" promo appended to customer-facing emails.
// Images live in public/assets/images/email/ and are served from the live site,
// so they only render once the site is deployed.
function designerPromoBlock() {
  const img = (file, alt) =>
    `<td style="padding:0 4px;"><a href="https://design.jtees.net/"><img src="https://www.jtees.net/assets/images/email/${file}" alt="${alt}" width="170" style="width:100%;max-width:170px;border-radius:8px;display:block;" /></a></td>`;
  return `
    <div style="margin-top:28px;padding-top:22px;border-top:1px solid #E5E7EB;">
      <h3 style="color:#0B1F4B;margin:0 0 6px;">Try our new online Design Studio 🎨</h3>
      <p style="color:#374151;margin:0 0 14px;">Put your own design on tees, hoodies and more — create it online and see it instantly.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
        ${img('work-meaq.jpg', 'Custom brand hoodie and hat we printed')}
        ${img('work-ghost.jpg', 'Custom Halloween tee we printed')}
        ${img('work-kennedy.jpg', 'Custom contractor hoodies we printed')}
      </tr></table>
      <p style="text-align:center;margin:18px 0 6px;">
        <a href="https://design.jtees.net/" style="background:#1848B8;color:#fff;font-weight:800;text-decoration:none;padding:13px 28px;border-radius:100px;display:inline-block;">Start Designing &rarr;</a>
      </p>
    </div>`;
}

async function sendNotificationEmail(s) {
  const photoRow = s.photo_url
    ? `<tr><td style="padding:8px;font-weight:bold;vertical-align:top;">Photo</td><td style="padding:8px;"><a href="${escEmail(s.photo_url)}">View Photo</a><br/><img src="${escEmail(s.photo_url)}" style="max-width:300px;margin-top:8px;border-radius:6px;" /></td></tr>`
    : '';
  await sendEmail({
    to:      NOTIFY_EMAIL,
    subject: `New Quote Request — ${s.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#A52429;">New Quote Request</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;font-weight:bold;width:120px;">Name</td><td style="padding:8px;">${escEmail(s.name)}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;"><a href="tel:${escEmail(s.phone)}">${escEmail(s.phone)}</a></td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;"><a href="mailto:${escEmail(s.email)}">${escEmail(s.email)}</a></td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;vertical-align:top;">Description</td><td style="padding:8px;">${escEmail(s.description) || '—'}</td></tr>
          ${photoRow}
        </table>
        <p style="color:#999;font-size:12px;margin-top:24px;">Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
      </div>
    `,
  });
}

async function sendCustomerConfirmationEmail(s) {
  const firstName = escEmail((s.name || '').split(' ')[0]);
  await sendEmail({
    to:      s.email,
    subject: `We got your request, ${(s.name || '').split(' ')[0]}!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#A52429;">Thanks for reaching out!</h2>
        <p>Hi ${firstName},</p>
        <p>We received your quote request and will get back to you within 1 business day.</p>
        <p><strong>What you submitted:</strong></p>
        <p style="background:#f9f9f9;padding:1rem;border-radius:8px;">${escEmail(s.description) || 'No description provided.'}</p>
        <p>Questions? Call or text us at <a href="tel:+17738491854">(773) 849-1854</a></p>
        ${designerPromoBlock()}
        <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees & Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
      </div>
    `,
  });
}

async function sendPaymentReceivedEmail(s, amount) {
  await sendEmail({
    to:      s.email,
    subject: `Payment confirmed — your order is in production!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#A52429;">Payment Received!</h2>
        <p>Hi ${escEmail((s.name || '').split(' ')[0])},</p>
        <p>We received your payment of <strong>$${(amount / 100).toFixed(2)}</strong>. Your order is now in production.</p>
        <p><strong>Estimated delivery:</strong> 2–3 weeks from today.</p>
        <p>We'll reach out when your order is ready for pickup.</p>
        <p>Questions? Call or text us at <a href="tel:+17738491854">(773) 849-1854</a></p>
        ${designerPromoBlock()}
        <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees & Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
      </div>
    `,
  });
}

// ─── Brevo ────────────────────────────────────────────────────────────────────

/* One variable holds the Brevo key, deliberately. This used to prefer
   JTEES_BREVO_MCP_API and fall back to BREVO_API_KEY, which meant the same
   secret lived in two places — and on 2026-08-19 the key was rotated in one of
   them and not the other, so every CRM call authenticated with a dead key
   while sending looked fine. Two homes for one secret is two chances to rotate
   half of it. */
const brevo = axios.create({
  baseURL: 'https://api.brevo.com/v3',
  headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
});

async function syncToBrevo(s) {
  if (isSpamName(s.name)) {
    console.warn('syncToBrevo: skipping spam contact:', s.name);
    return;
  }
  const [firstname, ...rest] = (s.name || '').trim().split(' ');
  await brevo.post('/contacts', {
    email:      s.email,
    attributes: {
      FIRSTNAME: firstname || '',
      LASTNAME:  rest.join(' ') || '',
      SMS:       s.phone || '',
    },
    listIds:        process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
    updateEnabled:  true,
  });
}

// Upsert a tawk.to chat/ticket contact. Chat leads go to their own list when
// BREVO_TAWK_LIST_ID is set, otherwise they fall back to the main list.
async function syncTawkContactToBrevo({ name, email }) {
  if (isSpamName(name)) {
    console.warn('syncTawkContactToBrevo: skipping spam contact:', name);
    return;
  }
  const [firstname, ...rest] = (name || '').trim().split(' ');
  const listId = process.env.BREVO_TAWK_LIST_ID || process.env.BREVO_LIST_ID;
  await brevo.post('/contacts', {
    email,
    attributes:    { FIRSTNAME: firstname || '', LASTNAME: rest.join(' ') || '' },
    listIds:       listId ? [parseInt(listId)] : [],
    updateEnabled: true,
  });
}

// ─── Grad order pricing ───────────────────────────────────────────────────────

const GRAD_PRICES = {
  tee_1to4:      { name: 'Custom Grad Tee (1–4)',            price: 25  },
  tee_5to9:      { name: 'Custom Grad Tee (5–9)',            price: 20  },
  family_1to4:   { name: 'Family Matching Tee (1–4)',        price: 25  },
  family_5to9:   { name: 'Family Matching Tee (5–9)',        price: 20  },
  hoodie:        { name: 'Custom Hoodie',                    price: 45  },
  stole:         { name: 'Graduation Stole',                 price: 45  },
  yard_sign:     { name: 'Yard Sign (18"×12")',              price: 25  },
  banner_4x2:    { name: "Banner (4'×2')",                   price: 45  },
  banner_6x3:    { name: "Banner (6'×3')",                   price: 80  },
  bighead_single:{ name: 'Big Head Cutout — Single',         price: 25  },
  bighead_5pk:   { name: 'Big Head 5-Pack',                  price: 100 },
  mini_standee:  { name: 'Mini Standee (24")',               price: 35  },
  standee:       { name: 'Life-Size Standee (up to 6ft)',    price: 125 },
  arch:          { name: 'Corroplast Arch',                  price: 250 },
  backdrop:      { name: "Vinyl Backdrop Banner (6'×6')",    price: 150 },
  button_4pk:    { name: 'Photo Buttons (set of 4)',         price: 28  },
  button_10pk:   { name: 'Photo Buttons (set of 10)',        price: 60  },
  magnet:        { name: 'Custom Photo Magnets (set of 6)',  price: 25  },
  sticker:       { name: 'Custom Sticker Sheet (10-pack)',   price: 20  },
  chipbag_6:     { name: 'Custom Chip Bags (set of 6)',      price: 18  },
  chipbag_12:    { name: 'Custom Chip Bags (set of 12)',     price: 35  },
  gable_box:     { name: 'Custom Gable Boxes (set of 6)',    price: 22  },
  tumbler:       { name: 'Custom Photo Tumbler',             price: 28  },
  cup_4pk:       { name: 'Custom Cup (set of 4)',            price: 36  },
  can_cooler:    { name: 'Custom Can Coolers (6-Pack)',       price: 60  },
  koozie:        { name: 'Koozies (set of 6)',               price: 35  },
  step_repeat:   { name: "Step-and-Repeat Banner (8'×8')",  price: 200 },
  prom_arch:     { name: 'Prom Arch',                        price: 250 },
  photo_props:   { name: 'Photo Props',                      price: 89  },
  prom_decal:    { name: 'Prom Decal',                       price: 80  },
};

function buildGradLineItems(order) {
  const items = [];
  for (const [key, { name, price }] of Object.entries(GRAD_PRICES)) {
    const qty = order.products[key] || 0;
    if (qty > 0) items.push({ name, price, quantity: qty });
  }
  const shirtQty = order.apparel?.shirt_qty || 0;
  if (shirtQty > 0) {
    const shirtPrice = shirtQty >= 100 ? 9.75 : shirtQty >= 50 ? 14.00 : 18.50;
    items.push({ name: `Custom Shirts (qty: ${shirtQty})`, price: shirtPrice, quantity: shirtQty });
  }
  return items;
}

// ─── HubSpot ──────────────────────────────────────────────────────────────────

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '';

const hubspot = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` },
});

async function createOrUpdateHubSpotContact(s) {
  try {
    const res = await hubspot.post('/crm/v3/objects/contacts', {
      properties: {
        firstname:      s.name.split(' ')[0],
        lastname:       s.name.split(' ').slice(1).join(' ') || '',
        email:          s.email,
        phone:          s.phone,
        hs_lead_status: 'NEW',
      },
    });
    return res.data.id;
  } catch (err) {
    if (err.response?.status === 409) {
      const search = await hubspot.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: s.email }] }],
      });
      return search.data.results[0]?.id;
    }
    throw err;
  }
}

async function createHubSpotDeal(s, contactId) {
  const res = await hubspot.post('/crm/v3/objects/deals', {
    properties: {
      dealname:  `Quote — ${s.name}`,
      dealstage: '3348333265',
      pipeline:  'default',
    },
    associations: [{
      to:    { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
    }],
  });
  return res.data.id;
}

async function addHubSpotNote(s, contactId, dealId) {
  const noteLines = [
    `Description: ${s.description || 'N/A'}`,
    s.photo_url ? `Reference photo: ${s.photo_url}` : null,
  ].filter(Boolean);

  const noteRes = await hubspot.post('/crm/v3/objects/notes', {
    properties: { hs_note_body: noteLines.join('\n'), hs_timestamp: Date.now().toString() },
  });
  const noteId = noteRes.data.id;
  await Promise.all([
    hubspot.put('/crm/v4/associations/notes/contacts/batch/associate/default', {
      inputs: [{ from: { id: noteId }, to: { id: contactId } }],
    }),
    hubspot.put('/crm/v4/associations/notes/deals/batch/associate/default', {
      inputs: [{ from: { id: noteId }, to: { id: dealId } }],
    }),
  ]);
}

async function createHubSpotTask(s, contactId) {
  const taskRes = await hubspot.post('/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Follow up with ${s.name} about quote`,
      hs_task_body:    `Phone: ${s.phone} | Email: ${s.email}`,
      hs_timestamp:    (Date.now() + 86_400_000).toString(),
      hs_task_status:  'NOT_STARTED',
      hs_task_type:    'TODO',
    },
  });
  const taskId = taskRes.data.id;
  await hubspot.put('/crm/v4/associations/tasks/contacts/batch/associate/default', {
    inputs: [{ from: { id: taskId }, to: { id: contactId } }],
  });
}

async function updateHubSpotDealStage(dealId, stage) {
  await hubspot.patch(`/crm/v3/objects/deals/${dealId}`, {
    properties: { dealstage: stage },
  });
}

async function syncToHubSpot(s) {
  const contactId = await createOrUpdateHubSpotContact(s);
  const dealId    = await createHubSpotDeal(s, contactId);
  await Promise.all([
    addHubSpotNote(s, contactId, dealId),
    createHubSpotTask(s, contactId),
  ]);
  return { contactId, dealId };
}

// ─── Clover ───────────────────────────────────────────────────────────────────

const clover = axios.create({ baseURL: 'https://api.clover.com' });
// Read token dynamically on every request so Railway env changes take effect without redeploy
clover.interceptors.request.use(cfg => {
  cfg.headers['Authorization'] = `Bearer ${process.env.CLOVER_API_TOKEN}`;
  return cfg;
});

const MID = () => process.env.CLOVER_MERCHANT_ID;

async function createCloverCustomer(s) {
  const res = await clover.post(`/v3/merchants/${MID()}/customers`, {
    firstName:    s.name.split(' ')[0],
    lastName:     s.name.split(' ').slice(1).join(' ') || '',
    emailAddresses: [{ emailAddress: s.email }],
    phoneNumbers:   [{ phoneNumber: s.phone }],
  });
  return res.data.id;
}

async function createCloverOrder(submissionId, cloverCustomerId, items) {
  // items: [{ name, price (cents), quantity }]

  // 1. Create the order
  const orderRes = await clover.post(`/v3/merchants/${MID()}/orders`, {
    title:    `Quote #${submissionId}`,
    customers: [{ id: cloverCustomerId }],
  });
  const orderId = orderRes.data.id;

  // 2. Add line items
  await Promise.all(items.map(item =>
    clover.post(`/v3/merchants/${MID()}/orders/${orderId}/line_items`, {
      name:     item.name,
      price:    item.price,
      unitQty:  item.quantity,
    })
  ));

  return orderId;
}

async function getCloverInventory() {
  const res = await clover.get(`/v3/merchants/${MID()}/inventory/items`, {
    params: { limit: 100 },
  });
  return res.data.elements || [];
}

async function getCloverPayment(paymentId) {
  const res = await clover.get(`/v3/merchants/${MID()}/payments/${paymentId}`);
  return res.data;
}

async function syncGradToBrevo(order) {
  const [first, ...rest] = (order.parent_name || '').trim().split(' ');

  // 1. Create / update contact
  await brevo.post('/contacts', {
    email:          order.email,
    attributes:     { FIRSTNAME: first || '', LASTNAME: rest.join(' ') || '', SMS: order.phone || '' },
    listIds:        process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
    updateEnabled:  true,
  });

  // 2. Get the contact's numeric ID for deal linking
  const contactRes = await brevo.get(`/contacts/${encodeURIComponent(order.email)}`);
  const contactId  = contactRes.data.id;

  // 3. Build order summary
  const lineItems      = buildGradLineItems(order);
  const estimatedTotal = lineItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemSummary    = lineItems.map(i =>
    `• ${i.name} × ${i.quantity} @ $${i.price.toFixed(2)} = $${(i.price * i.quantity).toFixed(2)}`
  ).join('\n');

  // 4. Design selections
  const eventTypes  = (order.event_type || '').split(',').map(s => s.trim()).filter(Boolean);
  const designMap   = { 'senior-night': 'senior_night', graduation: 'graduation', prom: 'prom' };
  const designLines = eventTypes.map(evt => {
    const key  = designMap[evt] || evt;
    const name = order.designs?.[`${key}_name`] || order.designs?.[key] || '—';
    const img  = order.designs?.[`${key}_img`]  || '';
    return `  ${evt.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${name}${img ? `\n  Image: ${img}` : ''}`;
  }).join('\n');

  // 5. Build full note
  const photoLines = (order.photos || []).length
    ? `\nUPLOADED PHOTOS (${order.photos.length}):\n${order.photos.map((u, i) => `  Photo ${i + 1}: ${u}`).join('\n')}`
    : '\n  No photos uploaded.';

  const noteText = [
    `============================`,
    `GRAD ORDER — ${order.order_ref}`,
    `============================`,
    ``,
    `CUSTOMER`,
    `  Name:    ${order.parent_name}`,
    `  Student: ${order.student_name || '—'}`,
    `  Email:   ${order.email}`,
    `  Phone:   ${order.phone || '—'}`,
    `  Address: ${order.address || '—'}`,
    ``,
    `EVENT`,
    `  Type:      ${order.event_type}`,
    `  Date:      ${order.event_date || '—'}`,
    `  Needed By: ${order.needed_by || '—'}`,
    `  School:    ${order.school || '—'}`,
    `  Colors:    ${order.school_colors || '—'}`,
    ``,
    `DESIGN SELECTED`,
    designLines || '  —',
    ``,
    `ORDER ITEMS`,
    `  ${itemSummary.replace(/\n/g, '\n  ') || 'None'}`,
    ``,
    `  ESTIMATED TOTAL: $${estimatedTotal.toFixed(2)}`,
    `  * Final price confirmed after design review`,
    ``,
    `PAYMENT METHOD: ${order.payment_method || '—'}`,
    ``,
    `PROOF AGREEMENT`,
    `  Signed By: ${order.signature || '—'}`,
    `  Date:      ${order.sign_date || '—'}`,
    order.apparel?.design_notes ? `\nDESIGN NOTES:\n  ${order.apparel.design_notes}` : null,
    order.notes ? `\nSPECIAL INSTRUCTIONS:\n  ${order.notes}` : null,
    photoLines,
  ].filter(l => l !== null).join('\n');

  // 6. Create deal
  const dealRes = await brevo.post('/crm/deals', {
    name:       `Grad Order — ${order.parent_name} (${order.order_ref})`,
    attributes: {
      amount:     parseFloat(estimatedTotal.toFixed(2)),
      close_date: order.needed_by ? new Date(order.needed_by).toISOString() : new Date().toISOString(),
    },
  });
  const dealId = dealRes.data.id;
  console.log('Brevo deal created:', dealId);

  // 7. Link contact to deal
  await brevo.patch(`/crm/deals/${dealId}`, { linkedContactsIds: [contactId] })
    .catch(err => console.error('Brevo contact→deal link failed:', JSON.stringify(err.response?.data || err.message)));

  // 8. Create note linked to contact + deal
  await brevo.post('/crm/notes', {
    text:       noteText,
    contactIds: [contactId],
    dealIds:    [dealId],
  }).then(() => console.log('Brevo note created OK'))
    .catch(err => console.error('Brevo note failed:', JSON.stringify(err.response?.data || err.message)));

  return { contactId, dealId };
}

async function createGradCloverCustomerAndOrder(order) {
  console.log('Clover MID:', MID(), 'Token set:', !!process.env.CLOVER_API_TOKEN);
  try {
    const customerRes = await clover.post(`/v3/merchants/${MID()}/customers`, {
      firstName:      (order.parent_name || '').split(' ')[0],
      lastName:       (order.parent_name || '').split(' ').slice(1).join(' ') || '',
      emailAddresses: [{ emailAddress: order.email }],
      phoneNumbers:   [{ phoneNumber: order.phone }],
    });
    const cloverCustomerId = customerRes.data.id;
    const orderRes = await clover.post(`/v3/merchants/${MID()}/orders`, {
      title:     `Grad Order ${order.order_ref}`,
      customers: [{ id: cloverCustomerId }],
    });
    const cloverOrderId = orderRes.data.id;
    const lineItems = buildGradLineItems(order);
    await Promise.all(lineItems.map(item =>
      clover.post(`/v3/merchants/${MID()}/orders/${cloverOrderId}/line_items`, {
        name:    `${item.name}${item.quantity > 1 ? ` (×${item.quantity})` : ''}`,
        price:   Math.round(item.price * item.quantity * 100), // total in cents
        unitQty: 1000, // 1 unit in Clover milliUnits
      })
    ));
    return { cloverCustomerId, cloverOrderId };
  } catch (err) {
    console.error('Clover error:', err.response?.status, JSON.stringify(err.response?.data || err.message));
    throw err;
  }
}

// ─── Auth (admin routes) ──────────────────────────────────────────────────────

/* ── Staying signed in ───────────────────────────────────────────────────────
   The designer lives on design.jtees.net and these pages on jtees.net. Browsers
   scope a login to one site, so clicking "Quotes" in the designer sidebar used to
   demand a second login. A short-lived token signed with the key both services
   already share (JT_INTERNAL_KEY) carries that session across, and a signed
   cookie then keeps it for 30 days so there is no repeat prompt. */
const ADMIN_COOKIE = 'jt_admin';
const ADMIN_SESSION_DAYS = 30;

const signPayload = (payload, key) =>
  crypto.createHmac('sha256', key).update(String(payload)).digest('hex');

/** Constant-time compare of two hex strings of any length. */
function hexEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** "<expiry>.<hmac>" — valid only until the expiry it carries. */
function makeStamp(ttlMs, key) {
  const exp = Date.now() + ttlMs;
  return `${exp}.${signPayload(exp, key)}`;
}
function checkStamp(stamp, key) {
  const [exp, sig] = String(stamp || '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Date.now()) return false;
  return hexEqual(sig, signPayload(exp, key));
}

function adminCookieValue(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === ADMIN_COOKIE) return decodeURIComponent(v.join('='));
  }
  return '';
}

function setAdminCookie(res) {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret) return;
  const stamp = makeStamp(ADMIN_SESSION_DAYS * 86400 * 1000, secret);
  res.append('Set-Cookie',
    `${ADMIN_COOKIE}=${encodeURIComponent(stamp)}; Path=/; Max-Age=${ADMIN_SESSION_DAYS * 86400}` +
    '; HttpOnly; Secure; SameSite=Lax');
}

/* One-click in from the designer sidebar. The token proves the request came
   from our own admin; the cookie it sets is what actually keeps you signed in. */
app.get('/admin/sso', (req, res) => {
  const shared = process.env.JT_INTERNAL_KEY || '';
  // Only ever redirect within this site — never to an address in the query.
  const raw = String(req.query.to || '/quotes');
  const to = /^\/[A-Za-z0-9/_\-?=&.]*$/.test(raw) && !raw.startsWith('//') ? raw : '/quotes';
  if (!shared || !checkStamp(req.query.t, shared)) {
    return res.status(401).send(quotePage('Link expired', `
      <div class="card">
        <div class="warn">That link has expired.</div>
        <p class="muted" style="margin-top:8px">Open it again from the designer, or sign in directly.</p>
        <p style="margin-top:12px"><a class="btn" href="${to}">Go to the page</a></p>
      </div>`));
  }
  setAdminCookie(res);
  res.redirect(to);
});

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_PASSWORD || '';
  let valid = false;

  // An unexpired signed cookie counts as signed in.
  if (secret && checkStamp(adminCookieValue(req), secret)) return next();

  /* The PASSWORD is the secret; the username is not checked.
     Phone keyboards autocapitalise the first letter, so "Admin" was failing and
     the browser re-prompted forever — an unguessable password is what actually
     protects this, and a case-sensitive username only ever locked out the owner. */
  try {
    const provided = req.headers['authorization'] || '';
    if (secret && provided.startsWith('Basic ')) {
      const decoded = Buffer.from(provided.slice(6), 'base64').toString('utf8');
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      const a = Buffer.from(pass);
      const b = Buffer.from(secret);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    }
  } catch { valid = false; }

  if (!valid) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized — any username, the password is what matters.');
  }
  // Signed in by password: remember it so this is the last prompt for a month.
  setAdminCookie(res);
  next();
}

const orderRateLimit     = makeRateLimit(10, 60 * 60 * 1000);
const signatureRateLimit = makeRateLimit(30, 60 * 60 * 1000);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Form token — fetched by the browser on page load ─────────────────────────
app.get('/api/form-token', signatureRateLimit, (_req, res) => {
  res.json({ token: generateFormToken() });
});

// ── Form submission ──────────────────────────────────────────────────────────

app.post('/submit', makeRateLimit(4, 60 * 60 * 1000), rejectBots, verifyTurnstile, async (req, res) => {
  const { name, phone, email, description, photo_url } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }

  if (String(name).length > 200 || String(phone).length > 50 || String(email).length > 254) {
    return res.status(400).json({ error: 'Input too long.' });
  }
  // US phone: 10 digits, or 11 with leading 1 (formatting characters allowed)
  const phoneDigits = String(phone).replace(/\D/g, '');
  if (phoneDigits.length !== 10 && !(phoneDigits.length === 11 && phoneDigits.startsWith('1'))) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (description && String(description).length > 2000) {
    return res.status(400).json({ error: 'Description too long.' });
  }
  if (photo_url && (
    typeof photo_url !== 'string' ||
    !photo_url.startsWith('https://res.cloudinary.com/')
  )) {
    return res.status(400).json({ error: 'Invalid photo URL.' });
  }

  const s = { name: name.trim(), phone: phone.trim(), email: email.trim().toLowerCase(), description, photo_url };

  // Save to DB first
  let submissionId;
  try {
    const { rows } = await pool.query(
      `INSERT INTO submissions (name, phone, email, description, photo_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [s.name, s.phone, s.email, s.description, s.photo_url]
    );
    submissionId = rows[0].id;
  } catch (err) {
    console.error('DB insert failed:', err.message);
    return res.status(500).json({ error: 'Failed to save submission.' });
  }

  // Fire everything in parallel
  const [emailResult, customerEmailResult, brevoResult, hubspotResult, cloverResult] =
    await Promise.allSettled([
      sendNotificationEmail(s),
      sendCustomerConfirmationEmail(s),
      syncToBrevo(s),
      syncToHubSpot(s),
      createCloverCustomer(s),
    ]);

  if (emailResult.status         === 'rejected') console.error('Notification email failed:', emailResult.reason?.message, JSON.stringify(emailResult.reason?.response?.data ?? emailResult.reason?.response ?? null));
  if (customerEmailResult.status === 'rejected') console.error('Confirmation email failed:', customerEmailResult.reason?.message, JSON.stringify(customerEmailResult.reason?.response?.data ?? customerEmailResult.reason?.response ?? null));
  if (brevoResult.status         === 'rejected') console.error('Brevo sync failed:',         brevoResult.reason?.message, JSON.stringify(brevoResult.reason?.response?.data));
  if (hubspotResult.status       === 'rejected') console.error('HubSpot failed:',            hubspotResult.reason?.message, JSON.stringify(hubspotResult.reason?.response?.data));
  if (cloverResult.status        === 'rejected') console.error('Clover failed:',             cloverResult.reason?.message, JSON.stringify(cloverResult.reason?.response?.data));

  // Persist IDs
  const updates = {};
  if (hubspotResult.status === 'fulfilled') {
    updates.hubspot_contact_id = hubspotResult.value.contactId;
    updates.hubspot_deal_id    = hubspotResult.value.dealId;
  }
  if (cloverResult.status === 'fulfilled') {
    updates.clover_customer_id = cloverResult.value;
  }

  if (updates.hubspot_contact_id !== undefined) {
    pool.query(
      'UPDATE submissions SET hubspot_contact_id=$1, hubspot_deal_id=$2 WHERE id=$3',
      [updates.hubspot_contact_id, updates.hubspot_deal_id ?? null, submissionId]
    ).catch(err => console.error('HubSpot ID update failed:', err.message));
  }
  if (updates.clover_customer_id !== undefined) {
    pool.query(
      'UPDATE submissions SET clover_customer_id=$1 WHERE id=$2',
      [updates.clover_customer_id, submissionId]
    ).catch(err => console.error('Clover ID update failed:', err.message));
  }

  res.json({ ok: true });
});

// ── Create Clover order (called when you approve a quote) ─────────────────────

app.post('/orders/create', requireAdmin, async (req, res) => {
  const { submissionId, items } = req.body;
  // items: [{ name, price (in dollars), quantity }]

  if (!submissionId || !items?.length) {
    return res.status(400).json({ error: 'submissionId and items are required.' });
  }
  for (const item of items) {
    if (!item.name || typeof item.name !== 'string' || item.name.length > 200) {
      return res.status(400).json({ error: 'Each item must have a valid name.' });
    }
    if (typeof item.price !== 'number' || item.price <= 0 || item.price > 100000) {
      return res.status(400).json({ error: 'Each item price must be a positive number up to $100,000.' });
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) {
      return res.status(400).json({ error: 'Each item quantity must be a positive integer.' });
    }
  }

  try {
    const { rows } = await pool.query('SELECT * FROM submissions WHERE id=$1', [submissionId]);
    if (!rows.length) return res.status(404).json({ error: 'Submission not found.' });

    const sub = rows[0];

    const cloverItems = items.map(i => ({
      name:     i.name,
      price:    Math.round(i.price * 100), // convert dollars to cents
      quantity: i.quantity,
    }));

    const orderId = await createCloverOrder(submissionId, sub.clover_customer_id, cloverItems);

    await pool.query(
      'UPDATE submissions SET clover_order_id=$1, status=$2 WHERE id=$3',
      [orderId, 'quoted', submissionId]
    );

    // Update HubSpot deal to "Presentation Scheduled" (= quote sent)
    if (sub.hubspot_deal_id) {
      updateHubSpotDealStage(sub.hubspot_deal_id, 'presentationscheduled')
        .catch(err => console.error('HubSpot stage update failed:', err.message));
    }

    res.json({ ok: true, orderId });
  } catch (err) {
    console.error('Order creation failed:', err.message);
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

// ── Clover payment webhook ─────────────────────────────────────────────────────
// In your Clover Developer Dashboard, set the webhook URL to:
// https://www.jtees.net/webhooks/clover

// GET handler for Clover URL verification
app.get('/webhooks/clover', (_req, res) => res.sendStatus(200));

app.post('/webhooks/clover', async (req, res) => {
  // Verify the request came from Clover using the app secret
  const signature = req.headers['x-clover-auth'];
  if (!process.env.CLOVER_APP_SECRET) {
    console.warn('Clover webhook rejected — CLOVER_APP_SECRET not set');
    return res.sendStatus(503);
  }
  if (!signature) {
    console.warn('Clover webhook rejected — missing signature');
    return res.sendStatus(401);
  }
  // Use raw body (not re-serialized JSON) to avoid serialization mismatch
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto
    .createHmac('sha256', process.env.CLOVER_APP_SECRET)
    .update(rawBody)
    .digest('base64');
  let sigValid = false;
  try {
    sigValid = signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { sigValid = false; }
  if (!sigValid) {
    console.warn('Clover webhook signature mismatch — rejected');
    return res.sendStatus(401);
  }

  res.sendStatus(200); // acknowledge immediately

  const { merchantId, type, id: paymentId } = req.body;

  // Validate merchant and event type
  if (process.env.CLOVER_MERCHANT_ID && merchantId !== process.env.CLOVER_MERCHANT_ID) {
    console.warn('Clover webhook rejected — merchant ID mismatch');
    return;
  }
  if (type !== 'PAYMENT' || !paymentId) return;

  try {
    const payment = await getCloverPayment(paymentId);
    const amount  = payment.amount; // in cents

    // Find the submission by clover order ID
    const { rows } = await pool.query(
      'SELECT * FROM submissions WHERE clover_order_id=$1',
      [payment.order?.id]
    );

    if (!rows.length) return;
    const sub = rows[0];

    // Idempotency check — skip if already marked paid
    if (sub.status === 'paid') return;

    // Update status in DB
    await pool.query('UPDATE submissions SET status=$1 WHERE id=$2', ['paid', sub.id]);

    // Update HubSpot deal to Closed Won
    if (sub.hubspot_deal_id) {
      updateHubSpotDealStage(sub.hubspot_deal_id, 'closedwon')
        .catch(err => console.error('HubSpot deal close failed:', err.message));
    }

    // Confirm to customer via email
    sendPaymentReceivedEmail(sub, amount)
      .catch(err => console.error('Payment email failed:', err.message));

  } catch (err) {
    console.error('Webhook processing failed:', err.message);
  }
});

// ── tawk.to chat webhook ───────────────────────────────────────────────────────
// In the tawk.to dashboard (Administration → Settings → Webhooks), set the URL to:
// https://www.jtees.net/webhooks/tawk
// Enable the "Chat Start" and "Ticket Create" events, and copy the secret key
// it generates into the TAWK_WEBHOOK_SECRET env var on Railway.

app.post('/webhooks/tawk', async (req, res) => {
  const signature = req.headers['x-tawk-signature'];
  if (!process.env.TAWK_WEBHOOK_SECRET) {
    console.warn('tawk webhook rejected — TAWK_WEBHOOK_SECRET not set');
    return res.sendStatus(503);
  }
  if (!signature) {
    console.warn('tawk webhook rejected — missing signature');
    return res.sendStatus(401);
  }
  // Use raw body (not re-serialized JSON) to avoid serialization mismatch
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto
    .createHmac('sha1', process.env.TAWK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  let sigValid = false;
  try {
    sigValid = signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { sigValid = false; }
  if (!sigValid) {
    console.warn('tawk webhook signature mismatch — rejected');
    return res.sendStatus(401);
  }

  res.sendStatus(200); // acknowledge immediately; tawk retries non-2XX for 12 hours

  // chat:* events carry `visitor`; ticket:create carries `requester`
  const { event, visitor, requester } = req.body;
  const contact = visitor || requester;
  if (!contact?.email) return; // anonymous visitor (no pre-chat form) — nothing to sync

  try {
    await syncTawkContactToBrevo(contact);
    console.log(`tawk webhook: synced ${contact.email} to Brevo (${event})`);
  } catch (err) {
    console.error('tawk → Brevo sync failed:', err.response?.data?.message || err.message);
  }
});

// ── Inventory (for building order forms) ──────────────────────────────────────

app.get('/inventory', requireAdmin, async (_req, res) => {
  try {
    const items = await getCloverInventory();
    res.json(items);
  } catch (err) {
    console.error('Inventory fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch inventory.' });
  }
});

// ── Admin dashboard ───────────────────────────────────────────────────────────

app.get('/admin', requireAdmin, (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Admin — June's Tees & Things</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e5e5e5;padding:2rem}
    h1{font-size:1.4rem;margin-bottom:1.5rem;color:#fff}
    h1 span{color:#A52429}
    .toolbar{display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;align-items:center}
    .toolbar select,.toolbar input{background:#1a1a1a;border:1px solid #333;color:#e5e5e5;padding:.5rem .75rem;border-radius:8px;font-size:.85rem}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:1.25rem;margin-bottom:1rem}
    .card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}
    .card-name{font-weight:700;font-size:1rem;color:#fff}
    .badge{display:inline-block;font-size:.65rem;padding:3px 10px;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
    .badge-new{background:#1d4ed8;color:#fff}
    .badge-quoted{background:#d97706;color:#fff}
    .badge-paid{background:#16a34a;color:#fff}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:.2rem}
    .value{font-size:.875rem;color:#e5e5e5;word-break:break-word}
    .value a{color:#A52429}
    .desc{grid-column:1/-1}
    .photo img{max-width:200px;border-radius:8px;margin-top:.4rem}
    .photo{grid-column:1/-1}
    .date{grid-column:1/-1;font-size:.72rem;color:#555;margin-top:.25rem}
    .actions{display:flex;gap:.75rem;margin-top:1rem;flex-wrap:wrap}
    .btn{padding:.5rem 1rem;border-radius:8px;border:none;font-size:.8rem;font-weight:600;cursor:pointer;text-decoration:none}
    .btn-primary{background:#A52429;color:#fff}
    .btn-secondary{background:#2a2a2a;color:#e5e5e5;border:1px solid #444}
    .empty{color:#555;text-align:center;padding:4rem}
    #order-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:100;align-items:center;justify-content:center}
    #order-modal.open{display:flex}
    .modal-box{background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:2rem;width:100%;max-width:520px;max-height:90vh;overflow-y:auto}
    .modal-box h2{margin-bottom:1.25rem;font-size:1.1rem}
    .form-group{margin-bottom:1rem}
    .form-group label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:.3rem}
    .form-group input{width:100%;background:#111;border:1px solid #333;color:#e5e5e5;padding:.6rem .9rem;border-radius:8px;font-size:.875rem}
    .item-row{display:grid;grid-template-columns:1fr 100px 80px 32px;gap:.5rem;margin-bottom:.5rem;align-items:center}
    .item-row input{margin:0}
    .remove-item{background:#333;border:none;color:#999;border-radius:6px;cursor:pointer;font-size:.9rem;height:36px;width:32px}
    #add-item-btn{background:none;border:1px dashed #444;color:#999;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.8rem;width:100%;margin-bottom:1rem}
    .modal-actions{display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.25rem}
  </style>
</head>
<body>
  <h1>June's Tees <span>&</span> Things — Submissions</h1>

  <div class="toolbar">
    <select id="filter-status">
      <option value="">All statuses</option>
      <option value="new">New</option>
      <option value="quoted">Quoted</option>
      <option value="paid">Paid</option>
    </select>
    <input id="search" type="text" placeholder="Search by name or email..." />
  </div>

  <div id="list"><p class="empty">Loading...</p></div>

  <!-- Create Order Modal -->
  <div id="order-modal">
    <div class="modal-box">
      <h2>Create Clover Order</h2>
      <input type="hidden" id="modal-submission-id" />
      <div id="item-rows"></div>
      <button id="add-item-btn" type="button">+ Add Line Item</button>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitOrder()">Create Order</button>
      </div>
    </div>
  </div>

  <script>
    const authHeader = 'Basic ' + btoa('admin:' + prompt('Admin password:'));
    let allRows = [];

    function esc(str) {
      if (str == null) return '';
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
    }

    function statusBadge(s) {
      const map = { new:'badge-new', quoted:'badge-quoted', paid:'badge-paid' };
      return \`<span class="badge \${map[esc(s)]||'badge-new'}">\${esc(s)||'new'}</span>\`;
    }

    function renderRows(rows) {
      const list = document.getElementById('list');
      if (!rows.length) { list.innerHTML = '<p class="empty">No submissions found.</p>'; return; }
      list.innerHTML = rows.map(r => \`
        <div class="card">
          <div class="card-header">
            <div class="card-name">\${esc(r.name)}</div>
            \${statusBadge(r.status)}
          </div>
          <div class="grid">
            <div><div class="label">Phone</div><div class="value"><a href="tel:\${esc(r.phone)}">\${esc(r.phone)}</a></div></div>
            <div><div class="label">Email</div><div class="value"><a href="mailto:\${esc(r.email)}">\${esc(r.email)}</a></div></div>
            <div><div class="label">HubSpot</div><div class="value">\${r.hubspot_contact_id ? '<a href="https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/'+encodeURIComponent(r.hubspot_contact_id)+'" target="_blank">View</a>' : '—'}</div></div>
            <div><div class="label">Clover</div><div class="value">\${r.clover_order_id ? 'Order created' : r.clover_customer_id ? 'Customer only' : '—'}</div></div>
            <div class="desc"><div class="label">Description</div><div class="value">\${esc(r.description)||'—'}</div></div>
            \${r.photo_url && r.photo_url.startsWith('https://res.cloudinary.com/') ? \`<div class="photo"><div class="label">Photo</div><a href="\${esc(r.photo_url)}" target="_blank"><img src="\${esc(r.photo_url)}" /></a></div>\` : ''}
            <div class="date">Submitted \${new Date(r.created_at).toLocaleString('en-US',{timeZone:'America/Chicago'})} CT &nbsp;·&nbsp; ID #\${parseInt(r.id,10)}</div>
          </div>
          <div class="actions">
            \${!r.clover_order_id ? \`<button class="btn btn-primary" onclick="openModal(\${parseInt(r.id,10)})">Create Clover Order</button>\` : ''}
            \${r.hubspot_contact_id ? \`<a class="btn btn-secondary" href="https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/\${esc(r.hubspot_contact_id)}" target="_blank">HubSpot Contact</a>\` : ''}
          </div>
        </div>
      \`).join('');
    }

    function applyFilters() {
      const status = document.getElementById('filter-status').value;
      const search = document.getElementById('search').value.toLowerCase();
      renderRows(allRows.filter(r =>
        (!status || r.status === status) &&
        (!search || r.name.toLowerCase().includes(search) || r.email.toLowerCase().includes(search))
      ));
    }

    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('search').addEventListener('input', applyFilters);

    fetch('/admin/data', { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(rows => { allRows = rows; renderRows(rows); })
      .catch(err => { document.getElementById('list').innerHTML = '<p class="empty">Failed to load: ' + err + '</p>'; });

    // Order modal
    function openModal(submissionId) {
      document.getElementById('modal-submission-id').value = submissionId;
      document.getElementById('item-rows').innerHTML = '';
      addItemRow();
      document.getElementById('order-modal').classList.add('open');
    }

    function closeModal() {
      document.getElementById('order-modal').classList.remove('open');
    }

    function addItemRow() {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = \`
        <input type="text" placeholder="Item name" class="item-name" />
        <input type="number" placeholder="Price $" step="0.01" class="item-price" />
        <input type="number" placeholder="Qty" min="1" value="1" class="item-qty" />
        <button type="button" class="remove-item" onclick="this.parentElement.remove()">✕</button>
      \`;
      document.getElementById('item-rows').appendChild(row);
    }

    document.getElementById('add-item-btn').addEventListener('click', addItemRow);

    async function submitOrder() {
      const submissionId = document.getElementById('modal-submission-id').value;
      const rows = document.querySelectorAll('.item-row');
      const items = [...rows].map(r => ({
        name:     r.querySelector('.item-name').value,
        price:    parseFloat(r.querySelector('.item-price').value),
        quantity: parseInt(r.querySelector('.item-qty').value),
      })).filter(i => i.name && i.price);

      if (!items.length) { alert('Add at least one line item.'); return; }

      const res = await fetch('/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ submissionId: parseInt(submissionId), items }),
      });

      if (res.ok) {
        closeModal();
        location.reload();
      } else {
        const err = await res.json();
        alert('Error: ' + (err.error || 'Unknown error'));
      }
    }
  </script>
</body>
</html>`);
});

app.get('/admin/data', requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0,   0);
    const { rows } = await pool.query(
      'SELECT * FROM submissions ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error('Admin data fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

// ─── Grad 2026 API ────────────────────────────────────────────────────────────

// Simple in-memory rate limiter
// Prefers CF-Connecting-IP (set by Cloudflare) so the real visitor IP is used,
// not Cloudflare's proxy IP. Falls back to req.ip for non-Cloudflare traffic.
function makeRateLimit(maxReqs, windowMs) {
  const store = new Map();
  // Prune expired entries every 15 minutes to prevent unbounded memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store) {
      if (now > entry.reset) store.delete(ip);
    }
  }, 15 * 60 * 1000).unref();

  return (req, res, next) => {
    const ip    = req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || 'unknown';
    const now   = Date.now();
    const entry = store.get(ip) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count++;
    store.set(ip, entry);
    if (entry.count > maxReqs) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}
// ── Bot rejection middleware ───────────────────────────────────────────────────
const BOT_UA_PATTERNS = [
  /^$/,                        // empty user-agent
  /curl\//i,
  /python-requests/i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
  /wget/i,
  /scrapy/i,
  /axios\/[0-9]/i,             // raw axios (not a browser)
  /node-fetch/i,
  /okhttp/i,
];

// Known spam name patterns — catches name-rotating bots
const SPAM_NAME_PATTERNS = [
  /robertwex/i,
  /robert\s*wex/i,
  /aidend\d/i,
  /leonel.*thymn/i,
];

function isSpamName(name) {
  return SPAM_NAME_PATTERNS.some(p => p.test((name || '').trim()));
}

// ── Form token ────────────────────────────────────────────────────────────────
// Short-lived HMAC token that proves the browser loaded the page before submitting.
// Token rotates every 30 minutes; the previous window is also accepted to avoid
// edge-case failures at the boundary.

const FORM_TOKEN_WINDOW_S = 30 * 60;

function generateFormToken() {
  const secret = process.env.FORM_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'dev-insecure';
  const window = Math.floor(Date.now() / 1000 / FORM_TOKEN_WINDOW_S);
  return crypto.createHmac('sha256', secret).update(String(window)).digest('hex');
}

function isValidFormToken(token) {
  if (!token || typeof token !== 'string') return false;
  const secret = process.env.FORM_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'dev-insecure';
  for (let offset = 0; offset <= 1; offset++) {
    const window = Math.floor(Date.now() / 1000 / FORM_TOKEN_WINDOW_S) - offset;
    const expected = crypto.createHmac('sha256', secret).update(String(window)).digest('hex');
    try {
      if (token.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    } catch { /* length mismatch or invalid input */ }
  }
  return false;
}

/* Turnstile — Cloudflare's CAPTCHA replacement, usually invisible to real
   users. rejectBots() catches crude bots (bad UA, honeypot, no cf-ray) but a
   scripted POST with a plausible user agent walks straight through it; order #3
   in this database was a `<script>alert(1)</script>` submission. Turnstile
   verifies the request actually came from a browser that solved a challenge.

   Fails OPEN when TURNSTILE_SECRET_KEY is unset, so the forms keep working
   until the keys are added — a validator that blocks real customers costs more
   than the spam it stops. */
async function verifyTurnstile(req, res, next) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return next();                      // not configured yet

  const token = req.body?.['cf-turnstile-response'] || '';
  if (!token) {
    return res.status(400).json({ error: 'Please complete the human check and try again.' });
  }
  try {
    const form = new URLSearchParams({ secret, response: token });
    // The visitor IP helps Cloudflare score the request; behind the proxy the
    // real one is in cf-connecting-ip.
    const ip = req.headers['cf-connecting-ip'] || req.ip || '';
    if (ip) form.set('remoteip', ip);

    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json();
    if (d.success) return next();
    console.warn('turnstile rejected:', (d['error-codes'] || []).join(','));
    return res.status(400).json({ error: 'That human check did not pass. Please try again.' });
  } catch (err) {
    // Cloudflare unreachable or slow: let the submission through rather than
    // lose a real order to an outage. rejectBots() and the rate limit still apply.
    console.error('turnstile check failed, allowing through:', err.message);
    return next();
  }
}

/** The widget, or nothing at all when Turnstile is not configured. */
function turnstileWidget() {
  const key = process.env.TURNSTILE_SITE_KEY;
  if (!key) return '';
  return `<div class="cf-turnstile" data-sitekey="${escEmail(key)}" data-appearance="interaction-only"
    style="margin-top:12px"></div>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`;
}

/**
 * The status line shared by every photo-upload widget, as client-side source.
 *
 * Defined once and interpolated into both the quote builder and the review
 * form so the two cannot drift, and kept pure — counts in, string out, no DOM —
 * because that is what makes it testable without a browser. See
 * `tests/upload-status.test.js`.
 *
 * The bug it exists to prevent: the review form set an error message in its
 * `.catch()` and then immediately called its redraw, which overwrote the
 * message with the attached-photo count. With nothing attached that count is
 * the empty string, so a failed upload left the status line BLANK. The photo
 * vanished, the form still submitted, and the customer was told nothing. A
 * failure has to be part of what the redraw renders, not something written
 * beside it and lost on the next paint.
 */
function uploadStatusScript() {
  return `
      /* pending: in flight. done: attached. failed: gave up. reason: the most
         recent human-readable cause, or '' if there is nothing to add. */
      function uploadStatus(pending, done, failed, reason){
        var parts = [];
        if (pending) parts.push('Uploading ' + pending + ' photo' + (pending > 1 ? 's' : '') + '\\u2026');
        if (done)    parts.push(done + ' photo' + (done > 1 ? 's' : '') + ' attached');
        if (failed)  parts.push(failed + ' photo' + (failed > 1 ? 's' : '') +
                                ' would not upload' + (reason ? ' \\u2014 ' + reason : ''));
        return parts.join(' \\u00b7 ');
      }`;
}

function rejectBots(req, res, next) {
  // Block requests that bypass Cloudflare entirely — set REQUIRE_CLOUDFLARE=true in Railway
  if (!req.headers['cf-ray']) {
    if (process.env.REQUIRE_CLOUDFLARE === 'true') {
      return res.status(400).json({ error: 'Bad request' });
    }
    console.warn('Non-Cloudflare request to form endpoint:', req.method, req.path, req.headers['user-agent']);
  }

  const ua = req.headers['user-agent'] || '';
  if (!ua || BOT_UA_PATTERNS.some(p => p.test(ua))) {
    return res.status(400).json({ error: 'Bad request' });
  }

  // Honeypot: any submission with this field filled in is a bot
  const hp = req.body?.website || req.body?.url || req.body?.company || '';
  if (hp) return res.status(400).json({ error: 'Bad request' });

  // Form token — proves the browser loaded the page. Set REQUIRE_FORM_TOKEN=true in Railway
  if (process.env.REQUIRE_FORM_TOKEN === 'true') {
    const token = req.body?._token || req.headers['x-form-token'] || '';
    if (!isValidFormToken(token)) {
      console.warn('Form token invalid or missing from', req.headers['cf-connecting-ip'] || req.ip);
      return res.status(400).json({ error: 'Bad request' });
    }
  }

  // Block known spam name patterns
  const submittedName = (req.body?.name || req.body?.parent_name || '').trim();
  if (isSpamName(submittedName)) {
    console.warn('Blocked spam name:', submittedName);
    return res.status(400).json({ error: 'Bad request' });
  }

  next();
}

// Bearer-token admin auth for grad order panel
function requireGradAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const adminToken = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD || '';
  if (!adminToken || !token) return res.status(401).json({ error: 'Unauthorized' });
  let valid = false;
  try {
    valid = token.length === adminToken.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminToken));
  } catch { valid = false; }
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function generateGradRef() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${yy}${mm}-${rand}`;
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validateGradOrder(body) {
  const errors = [];
  if (!body.parent_name || !String(body.parent_name).trim()) errors.push('parent_name is required');
  if (String(body.parent_name || '').length > 100) errors.push('parent_name too long');
  if (!isValidEmail(body.email)) errors.push('valid email is required');
  if (!body.event_type || !String(body.event_type).trim()) errors.push('event_type is required');
  if (String(body.student_name || '').length > 100) errors.push('student_name too long');
  if (String(body.phone || '').length > 30) errors.push('phone too long');
  if (String(body.school || '').length > 200) errors.push('school too long');
  if (String(body.address || '').length > 300) errors.push('address too long');
  if (String(body.notes || '').length > 2000) errors.push('notes too long');
  if (String(body.upload_link || '').length > 500) errors.push('upload_link too long');
  return errors;
}

function buildOrderEmailTable(order) {
  const lineItems = buildGradLineItems(order);
  if (!lineItems.length) return '<p>No items selected.</p>';
  let total = 0;
  const rows = lineItems.map(({ name, price, quantity }) => {
    const subtotal = price * quantity;
    total += subtotal;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escHtml(name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${price.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${subtotal.toFixed(2)}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#0B1F4B;color:#fff;">
        <th style="padding:8px 12px;text-align:left;">Item</th>
        <th style="padding:8px 12px;text-align:center;">Qty</th>
        <th style="padding:8px 12px;text-align:right;">Unit Price</th>
        <th style="padding:8px 12px;text-align:right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#f9f9f9;font-weight:bold;">
        <td colspan="3" style="padding:10px 12px;text-align:right;">Estimated Total</td>
        <td style="padding:10px 12px;text-align:right;color:#0B1F4B;">$${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  <p style="font-size:12px;color:#999;margin-top:6px;">* Final price confirmed after design review. Does not include applicable taxes or rush fees.</p>`;
}

async function sendGradOrderEmail(order) {
  if (!process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) return;

  const sec = (title, content) =>
    `<div style="margin-bottom:28px;">
      <div style="background:#0B1F4B;color:#fff;padding:8px 16px;border-radius:6px 6px 0 0;font-weight:800;font-size:.9rem;letter-spacing:.04em;text-transform:uppercase;">${title}</div>
      <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 6px 6px;padding:16px;">${content}</div>
    </div>`;

  const row = (label, value) =>
    `<tr><td style="padding:5px 8px 5px 0;font-weight:700;white-space:nowrap;vertical-align:top;width:160px;color:#374151;">${label}</td><td style="padding:5px 0;">${value || '—'}</td></tr>`;

  // Design selections
  const eventTypes = (order.event_type || '').split(',').map(s => s.trim()).filter(Boolean);
  const designMap = { 'senior-night': 'senior_night', 'graduation': 'graduation', 'prom': 'prom' };
  const designSection = eventTypes.map(evt => {
    const key = designMap[evt] || evt.replace('-', '_');
    const name = order.designs?.[`${key}_name`];
    const img  = order.designs?.[`${key}_img`];
    const label = evt.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<div style="margin-bottom:12px;">
      <strong>${label}:</strong> ${escHtml(name || order.designs?.[key] || '—')}
      ${img ? `<br/><img src="${escHtml(img)}" alt="${escHtml(name || '')}" style="max-width:220px;margin-top:8px;border-radius:6px;border:1px solid #E5E7EB;" />` : ''}
    </div>`;
  }).join('');

  // Uploaded photos
  const photoHtml = (order.photos || []).length
    ? (order.photos.map((url, i) =>
        `<div style="margin-bottom:10px;">
          <div style="font-size:.82rem;color:#6B7280;margin-bottom:4px;">Photo ${i + 1}: <a href="${escHtml(url)}">${escHtml(url)}</a></div>
          <img src="${escHtml(url)}" alt="Uploaded photo ${i + 1}" style="max-width:300px;border-radius:6px;border:1px solid #E5E7EB;display:block;" />
        </div>`
      ).join(''))
    : '<p style="color:#6B7280;">No photos uploaded.</p>';

  await sendEmail({
    to:      NOTIFY_EMAIL,
    replyTo: order.email || NOTIFY_EMAIL,
    subject: `New Grad Order ${order.order_ref} — ${order.parent_name}`,
    html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;color:#1C1C2E;">
      <div style="background:#0B1F4B;padding:20px 24px;border-radius:10px 10px 0 0;margin-bottom:24px;">
        <div style="color:#F4A623;font-size:.8rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">New Grad Order</div>
        <h1 style="color:#fff;font-size:1.4rem;margin:4px 0 0;">${escHtml(order.order_ref)} &mdash; ${escHtml(order.parent_name)}</h1>
      </div>

      ${sec('Customer Info', `<table style="width:100%;border-collapse:collapse;">
        ${row('Parent / Guardian', escHtml(order.parent_name))}
        ${row('Student', escHtml(order.student_name))}
        ${row('Email', `<a href="mailto:${escHtml(order.email)}">${escHtml(order.email)}</a>`)}
        ${row('Phone', `<a href="tel:${escHtml(order.phone)}">${escHtml(order.phone)}</a>`)}
        ${row('Delivery Address', escHtml(order.address))}
      </table>`)}

      ${sec('Event Info', `<table style="width:100%;border-collapse:collapse;">
        ${row('Event Type', escHtml(order.event_type))}
        ${row('Event Date', escHtml(order.event_date))}
        ${row('Order Needed By', escHtml(order.needed_by))}
        ${row('School', escHtml(order.school))}
        ${row('School Colors', escHtml(order.school_colors))}
      </table>`)}

      ${sec('Design Selected', designSection || '<p style="color:#6B7280;">No design selected.</p>')}

      ${sec('Design Notes & Personalization', order.apparel?.design_notes
        ? `<p style="white-space:pre-wrap;margin:0;">${escHtml(order.apparel.design_notes)}</p>`
        : '<p style="color:#6B7280;">None provided.</p>')}

      ${sec('Items Ordered', buildOrderEmailTable(order))}

      ${order.apparel?.shirt_qty > 0 ? sec('Apparel', `<table style="width:100%;border-collapse:collapse;">
        ${row('Total Shirt Qty', String(order.apparel.shirt_qty))}
      </table>`) : ''}

      ${sec('Payment & Proof Agreement', `<table style="width:100%;border-collapse:collapse;">
        ${row('Payment Method', escHtml(order.payment_method))}
        ${row('Signed By', escHtml(order.signature))}
        ${row('Date Signed', escHtml(order.sign_date))}
      </table>
      <p style="margin-top:12px;font-size:.85rem;color:#6B7280;">Customer agreed to: digital proof within 2 business days, 24-hour approval window, 50% deposit invoice via Clover, 7–14 business day production after deposit.</p>`)}

      ${order.notes ? sec('Special Instructions', `<p style="white-space:pre-wrap;margin:0;">${escHtml(order.notes)}</p>`) : ''}

      ${sec(`Uploaded Photos (${(order.photos || []).length})`, photoHtml)}

    </div>`,
  });
}

async function sendGradOrderConfirmationEmail(order) {
  if ((!process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) || !order.email) return;
  await sendEmail({
    to:      order.email,
    subject: `Your Grad Order is Confirmed — ${order.order_ref}`,
    html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
      <h2 style="color:#0B1F4B;">Thanks, ${escHtml(order.parent_name.split(' ')[0])}! 🎓</h2>
      <p>We've received your grad order and will be in touch soon to confirm your design and next steps.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;font-weight:bold;width:140px;">Order Ref</td><td>${escHtml(order.order_ref)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Student</td><td>${escHtml(order.student_name) || '—'}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Event</td><td>${escHtml(order.event_type)} — ${escHtml(order.event_date) || '—'}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Needed By</td><td>${escHtml(order.needed_by) || '—'}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Payment</td><td>${escHtml(order.payment_method) || '—'}</td></tr>
      </table>
      <h3 style="color:#0B1F4B;">Your Order Summary</h3>
      ${buildOrderEmailTable(order)}
      ${order.apparel?.design_notes ? `<h3 style="color:#0B1F4B;">Your Design Notes</h3><p style="background:#f9f9f9;padding:12px;border-radius:6px;">${escHtml(order.apparel.design_notes)}</p>` : ''}
      ${order.notes ? `<p><strong>Special Instructions:</strong> ${escHtml(order.notes)}</p>` : ''}
      <p style="margin-top:24px;">Questions? Reply to this email or call/text us at <a href="tel:+17738491854">(773) 849-1854</a></p>
      ${designerPromoBlock()}
      <p style="color:#999;font-size:12px;">June's Tees &amp; Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
    </div>`,
  });
}

// Cloudinary public config
app.get('/api/config', signatureRateLimit, (req, res) => {
  res.json({
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '',
    cloudinaryApiKey:    process.env.CLOUDINARY_API_KEY    || '',
    /* The Turnstile SITE key is public by design — it is rendered into the
       widget in the page. The secret key stays server-side and is what actually
       verifies the token. Served here so static pages and the PHP designer can
       pick it up without the key being hard-coded in two more places. */
    turnstileSiteKey:    process.env.TURNSTILE_SITE_KEY    || '',
  });
});

// Cloudinary signed upload
app.post('/api/cloudinary-signature', signatureRateLimit, (req, res) => {
  // Both spellings, for the reason given at cloudinary.config() above.
  const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.CLUDINARY_API_SECRET;
  if (!apiSecret) return res.status(503).json({ error: 'Cloudinary not configured' });
  // Allow the caller to specify the upload folder, but validate against an allowlist
  // so the server retains control over where files can be stored.
  const ALLOWED_FOLDERS = ['grad_orders', 'quote_requests', 'embroidery_quotes', 'review_photos'];
  const requestedFolder = typeof req.body.folder === 'string' ? req.body.folder : '';
  const folder = ALLOWED_FOLDERS.includes(requestedFolder) ? requestedFolder : 'grad_orders';
  // Use the widget's timestamp — overwriting it causes a mismatch since the widget
  // uses its own timestamp for the actual upload request, not the one we return.
  const paramsToSign = { ...req.body, folder };
  if (!paramsToSign.timestamp) paramsToSign.timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
  res.json({ signature, timestamp: paramsToSign.timestamp, folder });
});


// Embroidery order request from design.jtees.net product pages.
// Embroidery files (DST/PES/...) can't render in the online designer, so this
// flow collects the file + size + contact info and June follows up directly.
app.post('/api/embroidery-quote', orderRateLimit, verifyTurnstile, async (req, res) => {
  try {
    const b = req.body || {};
    const name  = String(b.name || '').trim().slice(0, 120);
    const email = String(b.email || '').trim().slice(0, 200);
    const phone = String(b.phone || '').trim().slice(0, 40);
    const size  = String(b.size || '').trim().slice(0, 60);
    const qty   = String(b.qty || '').trim().slice(0, 12);
    const product = String(b.product || '').trim().slice(0, 200);
    const hasFile = b.has_file === true || b.has_file === 'yes';
    const fileUrl = String(b.file_url || '').trim().slice(0, 500);
    const notes = String(b.notes || '').trim().slice(0, 2000);
    if (!name || !size || (!email && !phone)) {
      return res.status(400).json({ error: 'Name, embroidery size, and an email or phone number are required.' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'That email address does not look valid.' });
    }
    if (fileUrl && !fileUrl.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ error: 'Invalid file reference.' });
    }
    const fileRow = fileUrl
      ? `<tr><td style="padding:8px;font-weight:bold;">File</td><td style="padding:8px;"><a href="${escEmail(fileUrl)}">Download uploaded file</a></td></tr>`
      : `<tr><td style="padding:8px;font-weight:bold;">File</td><td style="padding:8px;">None uploaded — digitizing needed</td></tr>`;
    await sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: email || NOTIFY_EMAIL,
      subject: `New EMBROIDERY request — ${name} (${size})`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1848B8;">New Embroidery Request</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;font-weight:bold;width:140px;">Name</td><td style="padding:8px;">${escEmail(name)}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;">${escEmail(phone) || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${escEmail(email) || '—'}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Product</td><td style="padding:8px;">${escEmail(product) || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Embroidery size</td><td style="padding:8px;">${escEmail(size)}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Quantity</td><td style="padding:8px;">${escEmail(qty) || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Has stitch file</td><td style="padding:8px;">${hasFile ? 'Yes' : 'No (digitizing fee applies)'}</td></tr>
            ${fileRow}
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;vertical-align:top;">Notes</td><td style="padding:8px;">${escEmail(notes) || '—'}</td></tr>
          </table>
          <p style="color:#999;font-size:12px;margin-top:24px;">Submitted from design.jtees.net · ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
        </div>`,
    });
    if (email) {
      await sendEmail({
        to: email,
        subject: 'We got your embroidery request!',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#1848B8;">Thanks, ${escEmail(name.split(' ')[0])}!</h2>
            <p>We received your embroidery request (${escEmail(size)}${qty ? ', qty ' + escEmail(qty) : ''}) and will confirm pricing and timing within 1 business day.</p>
            ${hasFile ? '' : '<p>Since you don\'t have a stitch file yet, we\'ll digitize your artwork — the one-time digitizing fee will be included in your quote.</p>'}
            <p>Questions? Call or text <a href="tel:+17738491854">(773) 849-1854</a>.</p>
            ${designerPromoBlock()}
            <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees &amp; Things · Chicago, IL</p>
          </div>`,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('embroidery-quote error:', err.message);
    res.status(500).json({ error: 'Something went wrong — please call or text (773) 849-1854.' });
  }
});


// ─── Internal APIs for design.jtees.net (shared-secret) ──────────────────────

function requireInternalKey(req, res, next) {
  const k = process.env.JT_INTERNAL_KEY;
  if (!k || req.get('X-JT-Key') !== k) return res.status(403).json({ error: 'forbidden' });
  next();
}

// Passwordless login code for customer accounts on the designer site
app.post('/api/send-login-code', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const code = String(req.body.code || '').replace(/\D/g, '').slice(0, 6);
    if (!isValidEmail(email) || code.length !== 6) {
      return res.status(400).json({ error: 'bad input' });
    }
    await sendEmail({
      to: email,
      subject: `${code} is your June's Tees sign-in code`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center;">
          <h2 style="color:#1848B8;">Your sign-in code</h2>
          <div style="font-size:38px;font-weight:900;letter-spacing:10px;color:#0B1F4B;background:#F7F6F3;border-radius:12px;padding:18px 0;margin:14px 0;">${code}</div>
          <p style="color:#374151;">Enter this code on design.jtees.net to sign in. It expires in 15 minutes.</p>
          <p style="color:#999;font-size:12px;">Didn't request this? You can ignore this email.</p>
        </div>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('send-login-code error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

// Upsert any designer-captured email into the Brevo CRM (exit popup, saved
// cart, login, order). Fire-and-forget from the designer's jt_crm_contact().
app.post('/api/crm-contact', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const source = String(req.body.source || 'designer').slice(0, 40);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'bad input' });
    await brevo.post('/contacts', {
      email,
      attributes:    { SOURCE: source },
      listIds:       process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
      updateEnabled: true,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('crm-contact error:', err.response?.data?.message || err.message);
    res.status(500).json({ error: 'sync failed' });
  }
});

// Forward a designer event (cart_updated / order_completed) into Brevo so
// Brevo Automations can trigger workflows off it. Fired by jt-auth.php.
app.post('/api/brevo-event', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const eventName = String(req.body.event || '');
    if (!isValidEmail(email) || !/^[a-z_]{3,40}$/.test(eventName)) {
      return res.status(400).json({ error: 'bad input' });
    }
    const props = {};
    if (req.body.item_count !== undefined) props.item_count = parseInt(req.body.item_count, 10) || 0;
    if (req.body.total !== undefined) props.total = Number(req.body.total) || 0;
    if (req.body.restore_url !== undefined) {
      const url = String(req.body.restore_url);
      if (!url.startsWith('https://design.jtees.net/')) return res.status(400).json({ error: 'bad input' });
      props.restore_url = url;
    }
    await brevo.post('/events', {
      event_name: eventName,
      identifiers: { email_id: email },
      event_properties: props,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('brevo-event error:', err.response?.data?.message || err.message);
    res.status(500).json({ error: 'event failed' });
  }
});

// Cart-recovery sequence email (stage 1-5: immediate/4h/24h/3d/7d), triggered
// by the designer at capture time and by its hourly sweep. Empty carts
// (exit-popup leads with no items) get the welcome/discount variant.
// Dedup guard: the PHP sweep is supposed to send each stage once, but overlapping
// sweeps or retries must not double-email a customer.
const recentCartEmails = new Map(); // "email|stage" -> timestamp
const CART_EMAIL_DEDUP_MS = 6 * 60 * 60 * 1000;
app.post('/api/abandoned-cart-email', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const count = parseInt(req.body.item_count, 10) || 0;
    const total = Number(req.body.total || 0);
    const url = String(req.body.restore_url || '');
    const stage = Math.min(5, Math.max(1, parseInt(req.body.stage, 10) || 2));
    if (!isValidEmail(email) || !url.startsWith('https://design.jtees.net/')) {
      return res.status(400).json({ error: 'bad input' });
    }
    const dedupKey = `${email.toLowerCase()}|${stage}`;
    const lastSent = recentCartEmails.get(dedupKey);
    if (lastSent && Date.now() - lastSent < CART_EMAIL_DEDUP_MS) {
      return res.json({ ok: true, deduped: true });
    }
    if (recentCartEmails.size > 5000) {
      for (const [k, t] of recentCartEmails) if (Date.now() - t > CART_EMAIL_DEDUP_MS) recentCartEmails.delete(k);
    }
    const promoCode = activePromoCode();
    const promoPct = parseInt(process.env.JT_PROMO_PCT, 10) || 10;
    const cartLine = `Your cart at June's Tees &amp; Things has <strong>${count} item${count === 1 ? '' : 's'}</strong>${total ? ` (about $${total.toFixed(2)})` : ''} — including your custom design work. It's saved and ready whenever you are.`;
    const copy = count > 0 ? {
      1: { subject: `Your cart is saved + here's ${promoPct}% off ✅`, heading: `We saved your cart!`, body: `${cartLine} This link works on any device, whenever you're ready — and code <strong style="color:#F0275A;">${promoCode}</strong> takes ${promoPct}% off at checkout.`, cta: `Pick Up Where I Left Off →` },
      2: { subject: `Your custom design is waiting for you 🎨`, heading: `You left something great behind!`, body: cartLine, cta: `Pick Up Where I Left Off →` },
      3: { subject: `Take ${promoPct}% off and finish your order 🎉`, heading: `Here's a little something to help`, body: `${cartLine} Use code <strong style="color:#F0275A;">${promoCode}</strong> at checkout for ${promoPct}% off.`, cta: `Finish My Order →` },
      4: { subject: `Still thinking it over? Your design is safe`, heading: `No rush — it's all saved`, body: `${cartLine} Want a hand with sizing, colors, or bulk pricing? Just reply to this email or text us.`, cta: `See My Saved Cart →` },
      5: { subject: `Last call — your saved cart expires soon ⏳`, heading: `Don't lose your design`, body: `${cartLine} Saved carts are cleared after a while, so grab it before it's gone — code <strong style="color:#F0275A;">${promoCode}</strong> still gets you ${promoPct}% off.`, cta: `Rescue My Cart →` },
    } : {
      1: { subject: `Welcome to June's Tees — here's ${promoPct}% off 🎁`, heading: `Thanks for stopping by!`, body: `Ready when you are: design custom tees, hoodies, hats and more in minutes. Use code <strong style="color:#F0275A;">${promoCode}</strong> for ${promoPct}% off your order.`, cta: `Start Designing →` },
      2: { subject: `Ready to create something custom?`, heading: `Your ideas, printed`, body: `Custom apparel for teams, events, businesses and birthdays — designed by you, printed with love in Chicago. Your ${promoPct}% off code <strong style="color:#F0275A;">${promoCode}</strong> is waiting.`, cta: `Start Designing →` },
      3: { subject: `Your ${promoPct}% off code is still waiting 🎉`, heading: `Don't forget your discount`, body: `Code <strong style="color:#F0275A;">${promoCode}</strong> takes ${promoPct}% off anything you design — tees, hoodies, hats, tote bags and more.`, cta: `Browse Products →` },
      4: { subject: `Need ideas? Custom apparel made easy`, heading: `From idea to printed in days`, body: `Family reunions, team uniforms, memorials, birthdays, business merch — tell us what you're planning and we'll help you design it. Reply to this email or text us anytime.`, cta: `Get Started →` },
      5: { subject: `Last call for your ${promoPct}% off ⏳`, heading: `Your discount is about to expire`, body: `This is the last reminder for code <strong style="color:#F0275A;">${promoCode}</strong> — ${promoPct}% off your custom order. We'd love to make something great with you.`, cta: `Use My Discount →` },
    };
    const c = copy[stage];
    recentCartEmails.set(dedupKey, Date.now());
    await sendEmail({
      to: email,
      marketing: true,
      subject: c.subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#1848B8;">${c.heading}</h2>
          <p style="color:#374151;">${c.body}</p>
          <p style="text-align:center;margin:26px 0;">
            <a href="${escEmail(url)}" style="background:#1848B8;color:#fff;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:100px;display:inline-block;">${c.cta}</a>
          </p>
          <p style="color:#374151;">Questions or want a hand? Just reply, or call/text <a href="tel:+17738491854">(773) 849-1854</a>.</p>
          <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees &amp; Things · Chicago, IL</p>
        </div>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('abandoned-cart-email error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

/* ══ Quotes ═══════════════════════════════════════════════════════════════
   June texts a short link instead of typing prices into a message. The system
   writes the wording, keeps the record, syncs the contact and chases it up —
   she still sends the text herself from her own number, which keeps it personal
   and avoids US A2P 10DLC carrier registration entirely. */

/* Real Google reviews, mirrored from the storefront. Shown on the quote page
   because someone deciding whether to hand money to a small shop they found
   online is exactly who needs the reassurance. */
const SHOP_REVIEWS = [
  {
    "title": "Quality AND friendly",
    "text": "Went there for an order of 30 shirts. First thing I noticed was her friendly smile. She helped with the design and the shirts came out perfect! Highly recommended!",
    "who": "Rob Simpson · Google Review"
  },
  {
    "title": "Decal on a mirror for my event",
    "text": "Thank you so much June for helping me on two separate projects, especially for putting a decal on a mirror for my event. Amazing work every time!",
    "who": "Nyla Pruitt · Google Review"
  },
  {
    "title": "Great job on the hats",
    "text": "Great job on the hats!! We loved them!",
    "who": "Diane Alarcon · Google Review"
  },
  {
    "title": "A very precious memorial sweatshirt",
    "text": "She did a great job — reasonable pricing on a very precious memorial sweatshirt. So thoughtful and professional throughout the whole process.",
    "who": "Dawn Nash · Google Review"
  },
  {
    "title": "Better than ordering online",
    "text": "June was helpful and accommodative to a small embroidery order I had for polos and dress shirts. Quality turned out great! Much better than trying to find a corporate apparel provider online!",
    "who": "Anthony Krcik · Google Review"
  },
  {
    "title": "Fast turnaround",
    "text": "Fast turn around time. Coat turned out great! Easy to work with. Would highly recommend.",
    "who": "Kim Miniscalco · Google Review"
  },
  {
    "title": "Matched my custom request",
    "text": "They were able to match my custom request and are super reasonably priced. Quality work, completed in a timely manner — would absolutely use them again.",
    "who": "Adrianne Hall · Google Review"
  },
  {
    "title": "Family graduation shirts",
    "text": "I called her to make T-shirts for me and my family for my son's college graduation. She was professional, timely, and the quality was outstanding!",
    "who": "Gloria Silmon · Google Review"
  },
  {
    "title": "Extremely talented",
    "text": "Very professional! Extremely talented artist and she's self taught! Whatever you need she delivers!! I absolutely love her work!",
    "who": "Corvina Hollingsworth · Google Review"
  }
];

/** Auto-scrolling review strip. Pauses on hover/touch so it can be read, and
 *  degrades to a plain scrollable row if the animation is unsupported. */
function reviewStrip() {
  const cards = SHOP_REVIEWS.map(r => `
    <div class="rv">
      <div class="stars">★★★★★</div>
      <div class="rv-t">${escEmail(r.title)}</div>
      <div class="rv-x">${escEmail(r.text)}</div>
      <div class="rv-w">${escEmail(r.who)}</div>
    </div>`).join('');
  // Duplicated once so the marquee loops without a visible jump.
  return `
    <div class="card" style="overflow:hidden">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
        <b style="color:#0B1F4B">What customers say</b>
        <span class="muted" style="font-size:12px">${SHOP_REVIEWS.length} Google reviews</span>
      </div>
      <div class="rv-wrap"><div class="rv-track"><div class="rv-set">${cards}</div><div class="rv-set">${cards}</div></div></div>
    </div>`;
}

const REVIEW_CSS = `
.rv-wrap{overflow:hidden}
.rv-wrap::-webkit-scrollbar{display:none}
.rv-track{display:flex;width:max-content;animation:rvscroll 60s linear infinite}
.rv-set{display:flex;gap:10px;padding-right:10px}
.rv-wrap:hover .rv-track{animation-play-state:paused}
.rv-wrap:hover .rv-track,.rv-wrap:active .rv-track{animation-play-state:paused}
.rv{flex:0 0 250px;background:#f7f9fc;border:1px solid #e3e8f2;border-radius:12px;padding:12px 14px}
.rv .stars{color:#F4A623;font-size:13px;letter-spacing:1px}
.rv-t{font-weight:700;font-size:13.5px;color:#0B1F4B;margin:4px 0 3px}
.rv-x{font-size:12.5px;line-height:1.5;color:#46505f;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.rv-w{font-size:11px;color:#8b95a5;margin-top:7px}
@keyframes rvscroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.rv-track{animation:none}}

`;

const QUOTE_CODE_RE = /^[A-Z0-9]{6}$/;

/* ── Quote money rules ────────────────────────────────────────────────────
   All in one place so the quote page, the payment page and the emails can
   never disagree about what someone owes. */

const TAX_RATE   = Number(process.env.JT_TAX_RATE || 0.1025);   // Chicago combined
const CARD_FEE   = Number(process.env.JT_CARD_FEE || 0.04);     // 4% card surcharge
const DEPOSIT_PC = Number(process.env.JT_DEPOSIT_PCT || 0.5);   // 50% deposit
const DEPOSIT_FULL_UNDER = Number(process.env.JT_DEPOSIT_FULL_UNDER || 100); // pay in full below this
const ZELLE_HANDLE = process.env.JT_ZELLE || '(773) 849-1854';
/* Zelle shows the ACCOUNT HOLDER's name at confirmation, which is the legal
   name, not the shop name. Saying so up front stops customers stalling when
   "Andrea Winters" appears instead of "June" or "June's Tees". */
const ZELLE_NAME = process.env.JT_ZELLE_NAME || 'Andrea Winters';
// When the remaining balance is expected. Wording only — nothing enforces it.
const BALANCE_WHEN = process.env.JT_BALANCE_WHEN || 'on pickup or before delivery';

/* ── Brevo pipeline ───────────────────────────────────────────────────────────
   Deals were created and then never touched again, so every quote sat in "New"
   forever — the pipeline showed 17 open deals when only 2 were actually live,
   and paid jobs were indistinguishable from cold enquiries.

   Stage ids come from the "Form" pipeline. They are ids, not names, so they are
   env-overridable rather than hardcoded strings that break silently if the
   pipeline is edited in the Brevo UI. */
const BREVO_PIPELINE = process.env.BREVO_PIPELINE_ID || '69b8f83d72c7290e2e2ad69e';
const BREVO_STAGE = {
  new:       process.env.BREVO_STAGE_NEW       || '240f1684-650d-4582-9e1e-ceb23ea48a63',
  qualifying:process.env.BREVO_STAGE_QUALIFYING|| '1f196442-c903-4941-9c87-ac0b714e6174',
  pending:   process.env.BREVO_STAGE_PENDING   || '593308b5-3572-4a92-8b57-7944c4bb4fa4',
  won:       process.env.BREVO_STAGE_WON       || 'b7065ee8-ec98-40af-bc07-724bef3e7255',
  lost:      process.env.BREVO_STAGE_LOST      || '14d45488-d0a4-4434-8bdf-0efcfae7120e',
};

/**
 * Push a quote's state onto the Brevo CONTACT, and fire a lifecycle event.
 *
 * Brevo Automation workflows cannot be created over the API (that endpoint
 * 404s — they are built in the UI), so what makes automation possible is the
 * data underneath it: an event to trigger on, and attributes to branch and
 * personalise on. Without these a workflow can only send one mail to everyone.
 *
 * `event` is one of the jt_* names the workflows listen for. Fire-and-forget:
 * marketing plumbing must never be able to fail a payment.
 */
async function syncQuoteContact(q, event = null) {
  if (!q || !q.email) return;
  const email = String(q.email).trim().toLowerCase();
  const total = Number(q.total || 0);
  const paid = Number(q.paid_amount || 0);
  const due = round2(Math.max(0, total - paid));

  try {
    // Lifetime value across every quote this address has paid on — the basis
    // for segmenting repeat customers from one-off jobs.
    const { rows: lv } = await pool.query(
      `SELECT COALESCE(SUM(p.amount),0) AS ltv, COUNT(DISTINCT p.quote_code) AS orders
         FROM quote_payments p JOIN quotes q2 ON q2.code = p.quote_code
        WHERE LOWER(q2.email) = $1`, [email]);

    await brevo.post('/contacts', {
      email,
      updateEnabled: true,
      attributes: {
        QUOTE_CODE: q.code,
        QUOTE_TOTAL: round2(total),
        BALANCE_DUE: due,
        QUOTE_STATUS: quoteStage(q),
        QUOTE_URL: quoteLink(q.code),
        LAST_QUOTE_AT: new Date(q.created_at || Date.now()).toISOString().slice(0, 10),
        ...(paid > 0 ? { LAST_PAID_AT: new Date().toISOString().slice(0, 10) } : {}),
        LIFETIME_VALUE: round2(Number(lv[0]?.ltv || 0)),
        ORDERS_COUNT: Number(lv[0]?.orders || 0),
        JOB_SUMMARY: String(quoteSummary(q.items) || '').slice(0, 200),
      },
    });
  } catch (e) {
    console.error(`brevo contact sync failed for ${q.code}:`, e.response?.data?.message || e.message);
  }

  if (!event) return;
  try {
    await brevo.post('/events', {
      event_name: event,
      identifiers: { email_id: email },
      event_properties: {
        quote_code: q.code, total: round2(total), balance_due: due,
        quote_url: quoteLink(q.code),
      },
    });
  } catch (e) {
    console.error(`brevo event ${event} failed for ${q.code}:`, e.response?.data?.message || e.message);
  }
}

/**
 * Work backwards from the customer's deadline to the date each step must START.
 *
 * A deadline on its own tells you nothing useful — "needed by the 20th" does not
 * tell you that blanks had to be ordered on the 8th. Missing a ship date is
 * almost never a surprise on the day; it is a blanks order that slipped a week
 * earlier and nobody noticed. This computes the latest safe date for each step
 * so a slip is visible while there is still time to fix it.
 *
 * All durations are business days and env-tunable — every shop's are different:
 *   JT_LT_BLANKS   blanks delivery from the supplier (default 5)
 *   JT_LT_PRESS    time on the press (3)
 *   JT_LT_QC       counting and checking (1)
 *   JT_LT_PROOF    customer sitting on a proof (2)
 *   JT_SHIP_MIN    transit to the customer (2)
 */
/**
 * Cost memory.
 *
 * Quote lines are typed by hand — `product_id` is null on every line in real
 * data — so there is no id to key a remembered cost on. What there is, is the
 * description: "Men's Polo - Small - Black", "Trucker hat - Black on black".
 * Normalising that down to its garment ("mens polo", "trucker hat") gives a
 * stable key across sizes, colours and typing habits.
 *
 * Sizes, colours and separators are stripped, not just lowercased, because the
 * same garment must not learn a different cost for every size.
 */
/* Trailing \w* matters: "digitizing" and "stitching" are the forms that
   actually get typed, and a trailing \b would fail on both — which silently
   taught blank costs to service lines that have no blanks behind them. */
const COST_SERVICE_WORDS = /\b(digitiz\w*|stitch\w*|setup|set\s*up|design\w*|artwork|fees?|rush|shipping|delivery|labou?r|vector\w*|proof\w*)\b/i;

function costKey(description) {
  let s = String(description || '').toLowerCase();
  s = s.replace(/[’']/g, '');
  s = s.split(/[-–—,(]/)[0];                                  // drop "- Small - Black"
  s = s.replace(/\b(xxs|xs|s|m|l|xl|2xl|3xl|4xl|5xl|xxl|xxxl|small|medium|large|x-?large)\b/g, ' ');
  s = s.replace(/\b(black|white|red|blue|green|navy|grey|gray|pink|purple|yellow|orange|brown|maroon|teal|gold|silver|cream|tan|charcoal|heather|royal)\b/g, ' ');
  s = s.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, 60);
}

/** Garment lines only — a digitising fee has no blank behind it. */
function garmentLines(items) {
  const list = (() => {
    try { return typeof items === 'string' ? JSON.parse(items) : (items || []); }
    catch { return []; }
  })();
  return (Array.isArray(list) ? list : [])
    .filter((i) => Number(i.qty) > 0 && !COST_SERVICE_WORDS.test(String(i.description || '')))
    .map((i) => ({ key: costKey(i.description), qty: Number(i.qty),
                   description: String(i.description || '') }))
    .filter((i) => i.key);
}

/**
 * Learn per-unit costs from the itemised entry.
 *
 * Each line carries its own unit cost, so nothing is apportioned or averaged
 * across a job — a polo and a hoodie on the same order teach their own figures.
 * A rolling average across JOBS still applies, so one odd invoice cannot
 * overwrite what the last five agreed on.
 */
async function learnBlankCosts(items) {
  const list = (() => {
    try { return typeof items === 'string' ? JSON.parse(items) : (items || []); }
    catch { return []; }
  })();
  for (const i of (Array.isArray(list) ? list : [])) {
    const unit = Number(i.unit_cost || 0);
    const key = costKey(i.description);
    if (!(unit > 0) || !key || COST_SERVICE_WORDS.test(String(i.description || ''))) continue;
    try {
      await pool.query(
        `INSERT INTO blank_costs (cost_key, label, unit_cost, samples, updated_at)
         VALUES ($1,$2,$3,1,NOW())
         ON CONFLICT (cost_key) DO UPDATE SET
           unit_cost  = round(((blank_costs.unit_cost * blank_costs.samples) + $3) / (blank_costs.samples + 1), 2),
           samples    = blank_costs.samples + 1,
           label      = EXCLUDED.label,
           updated_at = NOW()`,
        [key, String(i.description || '').slice(0, 80), round2(unit)]);
    } catch (e) {
      console.error('blank cost learn failed:', e.message);
    }
  }
}

/** Sum the itemised line costs. This is what cost_blanks holds. */
function itemisedCost(items) {
  const list = (() => {
    try { return typeof items === 'string' ? JSON.parse(items) : (items || []); }
    catch { return []; }
  })();
  return round2((Array.isArray(list) ? list : [])
    .reduce((s, i) => s + (Number(i.unit_cost || 0) * Number(i.qty || 0)), 0));
}

/**
 * What a job actually made.
 *
 * Margin is computed against the SUBTOTAL, not the total: sales tax was never
 * yours and the card fee is passed through, so counting either as revenue
 * would flatter every job. Costs are what you paid out to deliver it.
 */
function quoteMargin(q) {
  const revenue = round2(Number(q.subtotal || 0));
  const cost = round2(Number(q.cost_blanks || 0) +
                      Number(q.cost_supplies || 0) +
                      Number(q.cost_outsourced || 0) +
                      Number(q.cost_shipping || 0));
  const profit = round2(revenue - cost);
  return {
    revenue, cost, profit,
    pct: revenue > 0 ? Math.round((profit / revenue) * 100) : null,
    entered: cost > 0,
  };
}

/** Short date for operational copy. Module-level so the checklist, the digest
 *  and the quotes page all format a date the same way. */
function dayShort(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function quoteSchedule(q) {
  /* Their date if they gave one, otherwise the target we set ourselves. Blanks
     have to be ordered on a real date either way. */
  const by = q.needed_by || q.target_date;
  if (!by) return null;

  const lt = {
    blanks: parseInt(process.env.JT_LT_BLANKS || '5', 10),
    press:  parseInt(process.env.JT_LT_PRESS  || '3', 10),
    qc:     parseInt(process.env.JT_LT_QC     || '1', 10),
    proof:  parseInt(process.env.JT_LT_PROOF  || '2', 10),
    ship:   parseInt(process.env.JT_SHIP_MIN  || '2', 10),
  };

  const needed = new Date(by);
  const isPickup = String(q.ship_method || '').toLowerCase() === 'pickup';
  const back = (from, days) => addBusinessDays(from, -days);

  // Each date is the LATEST it can happen and still hit the deadline.
  const shipBy   = isPickup ? needed : back(needed, lt.ship);
  const qcBy     = back(shipBy, lt.qc);
  const pressBy  = back(qcBy, lt.press);
  const blanksBy = back(pressBy, 0);          // blanks must be in to press
  const orderBy  = back(blanksBy, lt.blanks); // so ordered this far ahead
  const proofBy  = back(pressBy, lt.proof);   // approval before the press
  const artBy    = back(proofBy, 1);

  const today = new Date(new Date().toDateString());
  const late = (d, done) => !done && d < today;

  return {
    ship_by: shipBy, qc_by: qcBy, press_by: pressBy,
    blanks_in_by: blanksBy, blanks_order_by: orderBy,
    proof_by: proofBy, artwork_by: artBy,
    isPickup,
    /* A step is "at risk" when its latest safe date has passed and it has not
       happened. Reported per step so the digest can name the actual slip. */
    risks: [
      { key: 'artwork', label: 'artwork',        by: artBy,    late: late(artBy, q.artwork_at) },
      { key: 'blanks_order', label: 'blanks order', by: orderBy, late: late(orderBy, q.blanks_ordered_at) },
      { key: 'blanks_in', label: 'blanks arrival', by: blanksBy, late: late(blanksBy, q.blanks_in_at) },
      { key: 'proof',   label: 'proof approval',  by: proofBy,  late: late(proofBy, q.proof_ok_at) },
      { key: 'press',   label: 'press',           by: pressBy,  late: late(pressBy, q.production_at) },
      { key: 'ship',    label: isPickup ? 'ready for pickup' : 'ship',
        by: shipBy, late: late(shipBy, q.shipped_at) },
    ].filter((r) => r.late),
  };
}

/**
 * The order intake checklist, derived rather than documented.
 *
 * A written guide is only as good as the odds somebody opens it, which for a
 * one-person shop mid-job is roughly zero. So the steps live here: most are
 * ANSWERED from data the system already has, and only the handful it genuinely
 * cannot see (artwork in hand, proof approved, on the press, delivered) are
 * stored flags with a one-tap control on the quote card.
 *
 * Returns the steps in order plus the single next action, so the quote card can
 * say what to do rather than what to read.
 */
function quoteChecklist(q) {
  const sched = quoteSchedule(q);
  const total = Number(q.total || 0);
  const paid = Number(q.paid_amount || 0);
  const due = round2(Math.max(0, total - paid));
  const deposit = Number(q.deposit || 0);
  const hasItems = (() => {
    try { const it = typeof q.items === 'string' ? JSON.parse(q.items) : q.items;
          return Array.isArray(it) ? it.length > 0 : !!it; } catch { return false; }
  })();

  /* Eleven steps, not seventeen. The old list had a row for every field the
     system could check, so eight of them were derived and did nothing when
     tapped — which read as "the checklist is broken" rather than "that one is
     automatic". Related steps are now merged: proof sent and proof approved
     became one (approval is what matters), blanks ordered folded into blanks
     received with the order-by date as its warning, and the seven tappable
     steps line up one-for-one with the kanban columns so there is a single
     model of a job rather than two. */
  /* Production only. The list does not begin until a quote is accepted, so the
     pre-acceptance gates and the post-delivery money are not tasks — they are
     context, and they now show as a status strip on the job page. Every step
     here is tappable, which is what removes the "why won't this click"
     confusion the derived rows caused. Order matches the board columns. */
  const steps = [
    { key: 'artwork',  label: 'Artwork in hand',    done: !!q.artwork_at, manual: true,
      hint: 'print-ready file received and checked' },
    { key: 'proofok',  label: 'Proof approved',     done: !!q.proof_ok_at, manual: true,
      hint: 'in writing — this is what protects you on a reprint' },
    { key: 'blanks_in', label: 'Blanks received',   done: !!q.blanks_in_at, manual: true,
      hint: sched && !q.blanks_in_at ? `order by ${dayShort(sched.blanks_order_by)} — the step that quietly kills deadlines`
            : 'counted against the order — shortages surface here, not at the press' },
    { key: 'production', label: 'Printed',          done: !!q.production_at, manual: true,
      hint: sched ? `on the press by ${dayShort(sched.press_by)}` : 'on the press' },
    { key: 'qc',       label: 'Counted & checked',  done: !!q.qc_at, manual: true,
      hint: 'right count, right sizes, no misprints' },
    { key: 'shipped',  label: sched && sched.isPickup ? 'Ready for pickup' : 'Shipped',
      done: !!q.shipped_at, manual: true,
      hint: sched ? `must leave by ${dayShort(sched.ship_by)}` : 'handed to the carrier' },
    { key: 'delivered', label: 'Delivered',         done: !!q.delivered_at, manual: true,
      hint: 'in the customer\'s hands' },
  ];

  const next = steps.find((s) => !s.done) || null;
  const done = steps.filter((s) => s.done).length;
  return { steps, next, done, of: steps.length };
}

/* One tap per milestone the database cannot infer. Idempotent, and it can be
   unticked — a mis-tap must not need a database client to undo. */
app.post('/quote/:code/step', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  /* Every manual step in quoteChecklist() must appear here. Blanks, QC and
     shipping were added to the checklist later and never added to this map, so
     tapping them fell through to the redirect below: the page reloaded, the
     <details> collapsed, and nothing saved. Artwork worked, which is what made
     it look like the checklist half-worked at random. */
  const COLS = { artwork: 'artwork_at', blanks_order: 'blanks_ordered_at',
                 blanks_in: 'blanks_in_at', proof: 'proof_sent_at',
                 proofok: 'proof_ok_at', production: 'production_at',
                 qc: 'qc_at', shipped: 'shipped_at', delivered: 'delivered_at' };
  const col = COLS[String((req.body && req.body.step) || '')];
  const clear = String((req.body && req.body.clear) || '') === '1';
  /* Read from the body, not the query string or a header: the body is the only
     part of the request proven to survive the proxy in front of this route. */
  const asJson = String((req.body && req.body.json) || '') === '1';
  if (!QUOTE_CODE_RE.test(code) || !col) {
    return asJson ? res.status(400).json({ ok: false, error: 'unknown step' })
                  : res.redirect('/quotes');
  }
  /* Answer JSON to fetch so the page does not reload. A full reload collapsed
     the <details> the row lives in, which made a successful save look like the
     checklist had simply shut itself.

     Signalled by a form field rather than the Accept header or a query
     parameter — neither survived the proxy in front of this route, so the
     handler kept falling through to the redirect and the page reloaded
     anyway. */
  const wantsJson = asJson;
  try {
    const { rows } = await pool.query(
      `UPDATE quotes SET ${col} = ${clear ? 'NULL' : 'NOW()'} WHERE code = $1 RETURNING *`, [code]);
    console.log(`quote ${code}: ${col} ${clear ? 'cleared' : 'set'}`);

    /* Delivery is the honest moment to ask. The payment-time ask already sitting
       against this quote was dated on a guess made before the job existed; this
       moves it to a few days after the customer actually had the thing.

       `delivered` is preferred over `shipped` deliberately — on this board
       delivered_at is what "in their hands" means, and asking three days after
       handing a box to a carrier is asking before it arrives. Shipped is
       accepted too, because for local pickup work it is the last step anyone
       records.

       Clearing a step is a correction, not a milestone, so it does nothing. */
    if (!clear && (col === 'delivered_at' || col === 'shipped_at') && rows.length) {
      const q = rows[0];
      rescheduleReviewRequest({
        name: q.name, email: q.email, phone: q.phone,
        product: (Array.isArray(q.items) && q.items[0] && q.items[0].description) || '',
        quote_code: code, days: REVIEW_DAYS_AFTER_DELIVERY(),
      }).catch(() => {});
    }
    if (wantsJson) {
      const cl = rows.length ? quoteChecklist(rows[0]) : null;
      return res.json({
        ok: true, done: !clear,
        progress: cl ? { done: cl.done, of: cl.of } : null,
        next: cl && cl.next ? { label: cl.next.label, hint: cl.next.hint } : null,
      });
    }
  } catch (err) {
    console.error('step update failed:', err.message);
    if (wantsJson) return res.status(500).json({ ok: false });
  }
  res.redirect('/quotes');
});

/** Which stage a quote belongs in, from its own state. Single source of truth
 *  so the pipeline cannot drift from the database again. */
function quoteStage(q) {
  const total = Number(q.total || 0);
  const paid = Number(q.paid_amount || 0);
  if (q.status === 'expired') return 'lost';
  if (total > 0 && paid >= total - 0.005) return 'won';      // paid in full
  if (paid > 0) return 'pending';                             // deposit down
  if (q.accepted_at || q.status === 'accepted') return 'qualifying';
  return 'new';
}

/**
 * Push a quote's current state onto its Brevo deal: stage, amount, name.
 * Fire-and-forget — the CRM must never be able to fail a payment.
 *
 * `amount` is the quote TOTAL. It used to be written as `subtotal`, so every
 * deal understated the job by the tax.
 */
async function syncDealStage(q) {
  if (!q || !q.brevo_deal_id) return;
  const stage = quoteStage(q);
  try {
    await brevo.patch(`/crm/deals/${q.brevo_deal_id}`, {
      attributes: {
        pipeline: BREVO_PIPELINE,
        deal_stage: BREVO_STAGE[stage],
        amount: parseFloat(Number(q.total || 0).toFixed(2)),
      },
    });
  } catch (e) {
    console.error(`brevo stage sync failed for ${q.code}:`, e.response?.data?.message || e.message);
  }
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Tax applies to Illinois work. Toggle per quote; rate is env-configurable so
 *  it can be corrected without a deploy. */
function quoteTax(subtotal, taxable) {
  return taxable ? round2(Number(subtotal) * TAX_RATE) : 0;
}

/** Deposit: half, unless the job is small enough that it is simpler to take it
 *  all up front. Never more than the total. */
function depositFor(total) {
  const t = round2(total);
  if (t <= 0) return 0;
  if (t < DEPOSIT_FULL_UNDER) return t;
  return Math.min(t, round2(t * DEPOSIT_PC));
}

/** Card surcharge — only applied when they actually choose to pay by card. */
function cardFee(amount) { return round2(Number(amount) * CARD_FEE); }

/** Business-day arithmetic in the shop's timezone, mirroring the designer's
 *  jt_business_days() so the two never quote different lead times. */
/* Negative days walk BACKWARDS, which is what backwards-scheduling a deadline
   needs. Without this the loop simply never ran and every computed "start by"
   date silently equalled the deadline itself. */
function addBusinessDays(from, days) {
  const d = new Date(from);
  const step = days < 0 ? -1 : 1;
  let left = Math.abs(days);
  while (left > 0) {
    d.setDate(d.getDate() + step);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}

/** Estimated ready/delivery window, same env knobs the designer uses. */
function deliveryEstimate(from = new Date()) {
  const pmin = parseInt(process.env.JT_PROD_MIN || '7', 10);
  const pmax = parseInt(process.env.JT_PROD_MAX || '10', 10);
  const smin = parseInt(process.env.JT_SHIP_MIN || '2', 10);
  const smax = parseInt(process.env.JT_SHIP_MAX || '5', 10);
  return {
    ready: addBusinessDays(from, pmin),
    deliver_from: addBusinessDays(from, pmin + smin),
    deliver_to: addBusinessDays(from, pmax + smax),
  };
}

/* ── Blank (garment) volume pricing ───────────────────────────────────────
 *
 * Blanks cost the same per piece whatever the order size — there is no supplier
 * break behind this — so every point given away here comes straight off margin.
 * The curve is therefore deliberately shallow at the bottom and only opens up
 * where a flat 2x would put the shop above market on a bid it wants to win.
 *
 * These are FLOORS (>= qty), unlike the decoration tiers in the designer, whose
 * keys are band CEILINGS. The two conventions are opposite and that is a real
 * trap: read one as the other and every band lands one step out. Neither can be
 * changed unilaterally — the ceilings mirror the storefront's own pricing code —
 * so the rule is that this table is the only place floors are used, and it is
 * the reason this comment exists.
 */
const BLANK_TIERS = [
  { min: 3000, pct: 8 },
  { min: 1000, pct: 5 },
  { min:  500, pct: 3 },
  { min:  125, pct: 2 },
];

/* Below this the garment is flat cost x2 with no volume break at all — the
   shop's stated rule, and honest arithmetic: there is no supplier discount
   behind any of this, so a garment break is margin given away rather than a
   saving passed on. It buys competitiveness on the bids where the garment is
   most of the price, which is why anything survives above 125. */
const BLANK_DISCOUNT_MIN_QTY = 125;

/** Percent off the garment for a given piece count. Highest matching floor wins. */
function blankDiscountPct(qty) {
  const q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return 0;
  for (const t of BLANK_TIERS) if (q >= t.min) return t.pct;
  return 0;
}

/** The garment's price at this quantity, after volume pricing. */
function blankPriceFor(base, qty) {
  const b = Number(base);
  if (!Number.isFinite(b) || b <= 0) return 0;
  return round2(b * (1 - blankDiscountPct(qty) / 100));
}

/* Screen printing is not offered below this. Under it the job goes to DTF or
   heat-transfer vinyl, both of which are already priced in the designer. The
   quote form must say so rather than silently pricing a screen job at the
   50-71 rate, which is what a ceiling-keyed table would otherwise do. */
const SCREEN_MIN_QTY = 50;
const SCREEN_METHOD_RE = /screen\s*print/i;

/* Digitizing is billed ONCE PER DESIGN, but a decoration method in this system
   is a per-piece rate multiplied by the line quantity — pick it as the method
   on a 50-piece line and it bills the fee fifty times. So it is not offered as
   a method at all: when an embroidery method is chosen the form asks for it
   separately and it is added to the line once.
   It is also waived whenever the customer supplies a usable file, which is a
   judgement only a person can make, so "no digitizing" stays the default. */
const EMBROIDERY_METHOD_RE = /embroider/i;
const DIGITIZING_METHOD_RE = /digitiz/i;

/** The digitizing fees the catalogue offers, cheapest first. */
function digitizingOptions(catalog) {
  return (catalog.methods || [])
    .filter((m) => DIGITIZING_METHOD_RE.test(m.title || ''))
    .map((m) => {
      const pos = m.positions && (m.positions.front || m.positions[Object.keys(m.positions)[0]]);
      return { id: m.id, title: m.title, price: pos && pos.length ? Number(pos[0].price) : 0 };
    })
    .filter((d) => d.price > 0)
    .sort((a, b) => a.price - b.price);
}

/* ── Add-ons ──────────────────────────────────────────────────────────────
 *
 * Everything chargeable that is not the blank and not the decoration tier.
 * Declarative because the alternative — a branch per add-on inside the pricing
 * code — is how the digitizing bug happened: digitizing was a decoration
 * method, decoration methods are per-piece, so a $30 fee billed $1,500 on a
 * 50-piece line. `kind` states how a charge scales, once, and every surface
 * reads it the same way.
 *
 *   once                  flat, per design, whatever the quantity
 *   per_order             flat, per job
 *   per_piece             x quantity
 *   per_piece_per_colour  x quantity x colours
 *   percent_of_decoration x the decoration subtotal
 *
 * `appliesTo` matches the METHOD TITLE, so an add-on cannot be attached to work
 * it makes no sense for — no rush on a screen-print job that has none of the
 * embroidery capacity constraint, no digitizing on DTF.
 */
const ADDONS = [
  /* Screens. Not optional and not a tick box — every screen-print job burns
     them, so this is attached by the METHOD, not by someone remembering.

     It replaces an `underbase` add-on that charged a flat $25 once however many
     colours or locations the job had. Invoice #16899 (62 shirts, white on
     black, two locations) is four screens: that add-on recovered $25 against
     $80 of screens actually bought. The count now comes from screenCount() in
     quotePricingSource(), so the fee and the screens ordered are one number. */
  { code: 'screens', label: 'Screens', appliesTo: SCREEN_METHOD_RE,
    kind: 'per_screen', rate: 35, auto: 'method',
    note: 'A screen is burned once and then runs the whole job, so it is billed once — not per shirt. (Colours + 1 on a dark garment) x locations, at $35 each.' },
  { code: 'specialty_ink', label: 'Specialty ink (metallic, glitter, waterbase, discharge)',
    appliesTo: SCREEN_METHOD_RE, kind: 'per_piece', rate: 1.50 },
  { code: 'unbagging', label: 'Unbagging', appliesTo: SCREEN_METHOD_RE,
    kind: 'per_piece', rate: 0.50,
    note: 'Charged when the blanks arrive individually bagged and have to be taken out.' },
  { code: 'puff', label: 'Puff / 3D foam', appliesTo: EMBROIDERY_METHOD_RE,
    kind: 'per_piece', rate: 4.50 },
  { code: 'jumbo_hoop', label: 'Jumbo hoop (design over 11")', appliesTo: EMBROIDERY_METHOD_RE,
    kind: 'percent_of_decoration', rate: 50 },
];

/* Rush is per JOB, not per line — the shop is buying back calendar time once,
   however many lines the quote has. Deliberately no 1-day or same-day option:
   the shop does not offer it, and an option that has to be refused is worse
   than no option. Holiday mode doubles the fee, because in season that time is
   genuinely scarcer. */
const RUSH_OPTIONS = [
  { code: '', label: 'Standard turnaround', days: 0, fee: 0 },
  { code: 'rush3', label: 'Rush — 3 business days', days: 3, fee: 10 },
  { code: 'rush2', label: 'Rush — 2 business days', days: 2, fee: 15 },
];
const RUSH_CAVEAT = 'Rush is subject to availability and is confirmed before you pay — never guaranteed at quote time.';

/* Holiday mode: rush costs double and everything takes 3 days longer. One
   switch rather than four settings, so the busy season cannot be half on. It
   is surfaced on the quote form because the failure mode is leaving it on in
   March and quoting every job three days slow. */
const HOLIDAY_MODE = String(process.env.JT_HOLIDAY_MODE || '') === '1';
const HOLIDAY_EXTRA_DAYS = 3;

/* Screens bill separately ONLY once the per-piece tables have had the amortised
   screen charge taken out of them — `tools/reprice-anchorfish-2026.js --apply`.
   Until that has run, the live `printings` tables still carry screens inside the
   per-piece rate, and charging the fee as well bills every screen twice.
   The two changes cannot be made atomic: one is a deploy, the other is a write
   to the Lumise database. So this is the switch that joins them, and it stays
   off until the tables are repriced. Read once, used by both surfaces. */
const SCREEN_FEES_LIVE = String(process.env.JT_SCREEN_FEES || '') === '1';

/** The add-ons available for a method, in the order they should be offered. */
function addonsFor(methodTitle) {
  const t = String(methodTitle || '');
  return t ? ADDONS.filter((a) => a.appliesTo.test(t)) : [];
}

/** The rush fee actually charged, holiday doubling applied. */
function rushFeeFor(code, holiday = HOLIDAY_MODE) {
  const r = RUSH_OPTIONS.find((x) => x.code === String(code || ''));
  if (!r || !r.fee) return 0;
  return round2(r.fee * (holiday ? 2 : 1));
}

/* ── The pricing engine ───────────────────────────────────────────────────
 *
 * ONE implementation of the line-pricing rule, shared by every surface that
 * prices anything: the admin quote form, the save path that writes the money,
 * the customer's edit preview, and the public estimator.
 *
 * Returned as source text rather than defined directly, so the browser and the
 * server run the SAME CHARACTERS. Four copies of a pricing rule is four chances
 * to drift, and drift here means the price on screen is not the price charged.
 * This is the pattern `uploadStatusScript()` already uses, and it is tested the
 * same way — lifted out of this file and executed, so the tests cannot quietly
 * describe code that no longer exists.
 *
 * Pure: figures in, figures out, no DOM and no database. That is what makes it
 * testable without a browser and safe to run in both places.
 */
function quotePricingSource() {
  return `
      /* Blank volume pricing. Tiers are FLOORS (>= qty) — the decoration tiers
         in the designer are CEILINGS. The two conventions are opposite and
         reading one as the other puts every band one step out. */
      function blankPriceAt(base, qty, tiers) {
        var b = parseFloat(base);
        if (!isFinite(b) || b <= 0) return 0;
        var pct = 0;
        for (var i = 0; i < tiers.length; i++) {
          if (qty >= tiers[i].min) { pct = tiers[i].pct; break; }
        }
        return Math.round(b * (1 - pct / 100) * 100) / 100;
      }

      /* The decoration rate for a quantity.
​
         Keys are band CEILINGS — the price applies UP TO that quantity — which
         is what the storefront's own pricing code does. So the winning band is
         the FIRST whose ceiling the quantity still fits inside, and above the
         largest band the largest band's price holds.
​
         This is the single easiest thing in the system to get wrong. Walking
         the list with \`if (qty >= key) price = ...\`, which is how a floor-keyed
         table is read, looks correct and is not: at 100 pieces it returns the
         50-99 rate instead of the 100-249 one, so the customer is charged the
         higher price for ordering more. Every band lands one step out. */
      function tierAt(positions, qty, stage, colours) {
        if (!positions) return 0;
        var keys = Object.keys(positions);
        if (!keys.length) return 0;
        var pos = stage && positions[stage] ? positions[stage]
                : (positions.front || positions[keys[0]]);
        if (!pos || !pos.length) return 0;
        var bands = pos.slice().sort(function (a, b) { return a.min_qty - b.min_qty; });
        for (var i = 0; i < bands.length; i++) {
          if (qty <= bands[i].min_qty) return bandPrice(bands[i], colours);
        }
        return bandPrice(bands[bands.length - 1], colours);
      }

      /* One band's price at a given ink-colour count.

         Screen printing is ONE method with a column per colour count, not seven
         methods — the design decides how many screens it needs, so the count
         cannot be a question asked before anything is drawn. A colour band is
         \`{"1-color":8.45, ... ,"full-color":23.75}\`, keyed exactly as the
         storefront writes and reads it, so the key is built from the count the
         same way here (app.js ~16466) instead of by a second convention.

         Where the storefront falls back to 0 for a column it cannot find, this
         falls back to the band's published \`price\` — the one-colour rate. A $0
         decoration does not look like a failure: the line still totals, it just
         totals to the blank, and the shop finds out after the job is printed. */
      function bandPrice(band, colours) {
        if (!band) return 0;
        if (!band.colors) return band.price;
        /* Clamped before the key is built, not after. A negative or zero count
           is junk, but "-3-color" is simply a column that does not exist, so it
           would fall through to the full-colour backstop and quote the DEAREST
           rate off a malformed input. One colour is the honest floor. */
        var c = parseInt(colours, 10);
        if (!(c > 0)) c = 1;
        var v = band.colors[c + '-color'];
        if (v === undefined) v = band.colors['full-color'];
        return v === undefined ? band.price : Number(v);
      }

      /* How many ink colours a line is printed in.

         The catalogue holds two generations of screen printing at once. The
         consolidated \`color\`-type method has a column per count and must be
         ASKED, because at quote time only a person has seen the artwork. The
         seven legacy per-colour methods carry the count in their own titles
         ("Screen Printing — 2 Colors") and have no picker to read.

         Written once, here, because this figure decides both the decoration
         column and — once screens are billed as one-time fees — how many
         screens the job needs. Two copies of it is two chances for the price on
         screen to differ from the price charged. */
      function colourCount(method, picked) {
        if (!method) return 1;
        if (method.type === 'color') return parseInt(picked, 10) > 0 ? parseInt(picked, 10) : 1;
        /* Double backslashes below are deliberate. This source is returned from
           a template literal, so a single one is eaten before either engine
           compiles the regex — the digit and space classes would both collapse
           to bare letters, match nothing, and price every legacy per-colour
           method as a single colour. */
        return parseInt((String(method.title || '').match(/(\\d+)\\s*Colou?r/i) || [0, 1])[1], 10) || 1;
      }

      /* How many screens a job actually burns.

         Written once, here, for the same reason colourCount() is: this number
         is both what the customer is charged for and what the shop orders from
         Anchorfish. Two copies of it is two chances for the fee on screen to
         differ from the screens bought.

         A screen is per COLOUR and per LOCATION — invoice #16899 is 4 screens
         for a 2-colour job across 2 locations. A dark garment adds one more per
         location for the white underbase; the same invoice's "Ink: Base, White"
         line is what proves the underbase is its own screen rather than part of
         the first colour. */
      function screenCount(colours, locations, dark) {
        var c = parseInt(colours, 10); if (!(c > 0)) c = 1;
        var l = parseInt(locations, 10); if (!(l > 0)) l = 1;
        return (c + (dark ? 1 : 0)) * l;
      }

      /* One add-on's charge. The whole point of the table is that this
         switch exists exactly once. */
      function addonAmount(a, qty, colours, decorationSubtotal, screens) {
        var n = parseFloat(a.rate) || 0;
        var q = parseInt(qty, 10) || 0;
        var c = parseInt(colours, 10) || 1;
        /* Screens fall back to one per colour — one location, light garment —
           rather than to zero. A caller that forgets to pass the count then
           under-bills a two-sided dark job, which someone notices; a zero would
           make the screens free and silently, which is the failure this file
           keeps having to design against. */
        var s = parseInt(screens, 10); if (!(s > 0)) s = c;
        switch (a.kind) {
          case 'once':                  return n;
          case 'per_order':             return n;
          case 'per_piece':             return n * q;
          case 'per_piece_per_colour':  return n * q * c;
          case 'per_screen':            return n * s;
          case 'percent_of_decoration': return (decorationSubtotal || 0) * (n / 100);
          default:                      return 0;
        }
      }

      /* Price one line.
         \`unitOverride\` is a hand-typed each-price: it replaces the computed
         blank+decoration but never the add-ons, because an override is a
         judgement about the work, not a decision to give away the extras. */
      function priceLine(o) {
        var qty = parseInt(o.qty, 10) || 0;
        /* \`o.colours\` is what the admin PICKED, not a settled count — a legacy
           per-colour method ignores it and reads its own title instead. */
        var colours = colourCount(o.method, o.colours);

        /* The garment price. \`blankOverride\` replaces the catalogue price for
           this line — supplier prices move between the day a cost was recorded
           and the day a quote is written, and the alternative to typing the
           real one here is quoting from a stale figure. Volume tiers still
           apply to it, because a typed price is a cost correction, not a
           decision to abandon the pricing rule. */
        var blankBase = o.product ? o.product.price : 0;
        if (o.blankOverride !== null && o.blankOverride !== undefined &&
            o.blankOverride !== '' && isFinite(parseFloat(o.blankOverride)) &&
            parseFloat(o.blankOverride) > 0) {
          blankBase = parseFloat(o.blankOverride);
        }
        var blank = blankBase ? blankPriceAt(blankBase, qty, o.blankTiers || []) : 0;
        /* Both sides, when the job is printed front AND back. The picker used to
           offer only "one location" or "second location" — either/or — so a
           two-sided job could be quoted at one side's price while the designer
           charged both, and the quote came in under the work.

           Positions are read by ORDER, not by name: the group keys are opaque
           ("id", "mr8a5dlx"). A method with two groups (DTF) gives front + the
           cheaper back; a method with one (screen printing, multi:false) doubles
           its only table — which is what the designer does too, because a second
           screen-print location is a second set of screens, not a cheaper pass. */
        var decoration = 0;
        if (o.method) {
          if (o.stage === 'both') {
            var pk = Object.keys(o.method.positions || {});
            decoration = Number(tierAt(o.method.positions, qty, pk[0], colours)) +
                         Number(tierAt(o.method.positions, qty, pk[1] || pk[0], colours));
          } else {
            decoration = Number(tierAt(o.method.positions, qty, o.stage, colours));
          }
        }

        /* A decoration minimum, enforced. Tier keys are CEILINGS, so a quantity
           below the smallest band prices at that band — a 12-piece screen job
           quoted at the 50-99 rate while the shop pays a 50-piece contract
           minimum plus screens. The form already WARNED about this; warning does
           not stop the quote being saved and the money being taken, so the charge
           itself is corrected here.

           Billed as the minimum order it actually triggers, scaled per piece so
           the line arithmetic (unit x qty) still holds. The admin keeps the last
           word through the unit override — this sets the honest default, it does
           not remove a human's ability to decide otherwise.

           Lives in priceLine, not beside it, because this is the source both the
           browser and the save path execute: enforcement written anywhere else
           would apply on one surface and not the other, which is the exact class
           of bug quotePricingSource() exists to prevent.

           min_order_qty comes from the method row itself, which is also where the
           designer reads it (core/cart.php printing_min_qty). One definition in
           the database, read by every engine — not a constant restated in each
           language, which is how the two drift. It is also why this function has
           no free variables: the parity test lifts this source and executes it
           alone, so anything it cannot see would break that guarantee. */
        var decoMin = (o.method && o.method.min_order_qty) ? (parseInt(o.method.min_order_qty, 10) || 0) : 0;
        var belowDecoMin = decoMin > 0 && qty > 0 && qty < decoMin;
        if (belowDecoMin && decoration > 0) {
          decoration = Math.round(decoration * (decoMin / qty) * 100) / 100;
        }

        /* Extended sizes carry an upcharge that applies only to the pieces in
           those sizes — 24 shirts of which 4 are 2XL is not 24 mediums. */
        var sizeUpcharge = 0;
        if (o.sizeMix && o.product && o.product.sizes) {
          for (var sz in o.sizeMix) {
            var n = parseInt(o.sizeMix[sz], 10) || 0;
            if (n <= 0) continue;
            for (var j = 0; j < o.product.sizes.length; j++) {
              if (o.product.sizes[j].size === sz) { sizeUpcharge += n * Number(o.product.sizes[j].upcharge || 0); break; }
            }
          }
        }

        var listUnit = Math.round((blank + decoration) * 100) / 100;
        var hasOverride = o.unitOverride !== null && o.unitOverride !== undefined &&
                          o.unitOverride !== '' && isFinite(parseFloat(o.unitOverride));
        var unit = hasOverride ? parseFloat(o.unitOverride) : listUnit;

        var decorationSubtotal = decoration * qty;

        /* Locations comes from the same \`stage\` the decoration was priced off,
           so the screens billed and the passes charged can never disagree —
           'both' is two locations by the same definition that doubled the
           table above. */
        var locations = (o.stage === 'both') ? 2 : 1;
        var screens = screenCount(colours, locations, !!o.dark);

        var addonLines = [], addonTotal = 0;
        for (var k = 0; k < (o.addons || []).length; k++) {
          var a = o.addons[k];
          var amt = Math.round(addonAmount(a, qty, colours, decorationSubtotal, screens) * 100) / 100;
          if (!amt) continue;
          /* \`count\` rides along so a surface can print "4 x $35" without
             dividing the total back out — a division that would quietly lie the
             moment a rate changed between quoting and rendering. */
          addonLines.push({ code: a.code, label: a.label, kind: a.kind, rate: a.rate,
                            count: (a.kind === 'per_screen' ? screens : null), total: amt });
          addonTotal += amt;
        }

        /* A hand-typed price is taken as final for the garment, so size
           upcharges are not layered on top of it — they are already the
           reason the price was typed. */
        var upcharge = hasOverride ? 0 : sizeUpcharge;
        var lineTotal = Math.round((unit * qty + upcharge + addonTotal) * 100) / 100;
        var listTotal = Math.round((listUnit * qty + sizeUpcharge + addonTotal) * 100) / 100;

        return {
          blank: blank, decoration: decoration, sizeUpcharge: upcharge,
          addonLines: addonLines, addonTotal: Math.round(addonTotal * 100) / 100,
          unit: unit, listUnit: listUnit, manual: hasOverride,
          /* Returned so a surface can SHOW the count it is charging for —
             "4 screens x $35" is checkable by the customer, "$140 setup" is
             not — without re-deriving it and drifting. */
          colours: colours, locations: locations, screens: screens,
          lineTotal: lineTotal, listTotal: listTotal
        };
      }
`;
}

/* The same source, executed here, so Node prices a line with the identical
   code the browser runs. */
const { priceLine, addonAmount, colourCount, screenCount } = (function () {
  const sandbox = {};
  vm.runInNewContext(quotePricingSource() +
    '\nthis.priceLine = priceLine; this.addonAmount = addonAmount;' +
    '\nthis.colourCount = colourCount; this.screenCount = screenCount;', sandbox);
  return sandbox;
})();

/** The whole-job discount as a positive dollar figure.
 *
 *  Clamped to the subtotal and to zero on purpose. A discount bigger than the
 *  work would otherwise invert the total, and because the deposit and the
 *  Stripe charge are both derived from that total, a fat-fingered "500" on a
 *  $400 job would have produced a negative amount to collect rather than a
 *  free one. Percent is also capped at 100 for the same reason. */
function quoteDiscount(subtotal, kind, value) {
  const sub = round2(subtotal);
  let v = Number(value);
  if (!Number.isFinite(v) || v <= 0 || sub <= 0) return 0;
  if (kind === 'pct') v = Math.min(v, 100);
  const raw = kind === 'pct' ? sub * (v / 100) : v;
  return round2(Math.min(Math.max(raw, 0), sub));
}

/** Recompute every figure from the stored lines. Single source of truth.
 *
 *  Order matters and is not arbitrary: the discount comes off BEFORE tax,
 *  because sales tax is owed on what the customer is actually charged, not on
 *  what the job would have cost undiscounted. Taxing the full subtotal would
 *  have the shop remitting tax on money it never collected. */
function quoteTotals(q) {
  const subtotal = round2((q.items || []).reduce((a, i) => a + Number(i.line_total || 0), 0));
  const discount = quoteDiscount(subtotal, q.discount_kind, q.discount_value);
  const net = round2(subtotal - discount);
  const tax = Number(q.tax != null ? q.tax : 0);
  const total = round2(net + tax);
  return { subtotal, discount, net, tax, total, deposit: depositFor(total) };
}



function newQuoteCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/** "24 tees + 12 hoodies" — the {summary} in the text message. */
function quoteSummary(items) {
  const parts = (items || [])
    .filter(i => i && i.description)
    .map(i => {
      const d = String(i.description).trim();
      // A hand-typed description may already start with the quantity.
      const startsWithQty = new RegExp('^' + i.qty + '\\b').test(d);
      return (i.qty > 0 && !startsWithQty) ? `${i.qty} ${d}` : d;
    });
  if (!parts.length) return 'your order';
  if (parts.length <= 2) return parts.join(' + ');
  return `${parts[0]} + ${parts.length - 1} more`;
}

/* The chargeable extras on a line, written so the customer can check them.
 *
 * `unit_price` is deliberately the GARMENT-AND-PRINT price with add-ons taken
 * out (see the save route), so a line carrying any add-on does not foot from
 * qty x unit alone. Until now only digitizing was ever printed, through its own
 * `setup_fee` column — so specialty ink, unbagging, puff and the jumbo hoop all
 * arrived as an unexplained difference between the unit price and the line
 * total, and screens would have joined them at up to $140 a line.
 *
 * A screen fee especially has to show its working: "4 screens x $35" is
 * something a customer can agree with, "$140 setup" is something they query.
 */
function addonNotes(item) {
  const css = 'class="muted" style="font-size:13px;margin-top:3px"';
  const rows = (Array.isArray(item.addons) ? item.addons : [])
    .filter((a) => a && Number(a.total) > 0);

  /* Quotes saved before add-ons were itemised carry digitizing in its own two
     columns and have no `addons` array to read. */
  if (!rows.length) {
    return Number(item.setup_fee) > 0
      ? `<div ${css}>+ ${escEmail(item.setup_label || 'Digitizing')} — ${money(item.setup_fee)} one time</div>`
      : '';
  }

  return rows.map((a) => {
    const n = Number(a.count) || 0;
    const detail =
      a.kind === 'per_screen' && n > 0
        ? `${n} &times; ${money(a.rate)} = ${money(a.total)}, one time`
      : a.kind === 'per_piece'
        ? `${money(a.rate)} each = ${money(a.total)}`
      : a.kind === 'per_piece_per_colour'
        ? `${money(a.rate)} per colour each = ${money(a.total)}`
      : a.kind === 'percent_of_decoration'
        ? `+${Number(a.rate)}% = ${money(a.total)}`
      : `${money(a.total)} one time`;
    return `<div ${css}>+ ${escEmail(a.label)} — ${detail}</div>`;
  }).join('');
}

function quoteLink(code) { return `${PUBLIC_BASE_URL}/q/${code}`; }

function fmtDate(d) {
  if (!d) return '';
  // DATE columns carry no time; timezone-converting them shifts the day back.
  const iso = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m && !(String(d).includes('T') && !(d instanceof Date))) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
}

/** The three message templates. Kept together so the voice stays consistent. */
function quoteMessages(q) {
  const first = String(q.name || '').trim().split(/\s+/)[0] || 'there';
  const link = quoteLink(q.code);
  const until = fmtDate(q.valid_until);
  return {
    initial: `Hi ${first} — ${SHOP_SIGNER} from ${SHOP_NAME}. Your quote for ${quoteSummary(q.items)} is ready:\n${link}\n` +
             (until ? `Good through ${until}. ` : '') + `Tap Accept when you're ready, or text me any changes.`,
    followup: `Hi ${first} — just checking in on your quote: ${link}\n` +
              (until ? `Still good through ${until}. ` : '') + `Happy to adjust quantities or colors — just text back.`,
    accepted: `Got it, ${first} — thank you! You're on the schedule. I'll follow up with an artwork proof and timeline. — ${SHOP_SIGNER}, ${SHOP_PHONE}`,
  };
}

/** Brevo's SMS attribute must be E.164 (+1XXXXXXXXXX) — a bare 10-digit
 *  number is rejected outright with "Invalid phone number", which silently
 *  cost the whole contact sync. Returns '' when it cannot be made valid. */
function toE164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  if (d.length > 11) return '+' + d;      // already international
  return '';                               // too short to be real
}

/** Mirror a quote into Brevo: contact -> deal -> note, same shape as
 *  syncGradToBrevo(). Every call is guarded; the Postgres row already holds the
 *  truth, so a Brevo outage must never surface as a failed quote. */
async function syncQuoteToBrevo(q) {
  const out = { contactId: null, dealId: null };
  const email = String(q.email || '').trim();
  const phone = String(q.phone || '').trim();
  if (!email && !phone) return out;

  const [first, ...rest] = String(q.name || '').trim().split(/\s+/);

  try {
    // Brevo keys contacts on email; fall back to a phone-only contact.
    const attrs = { FIRSTNAME: first || '', LASTNAME: rest.join(' ') || '' };
    const e164 = toE164(phone);
    if (e164) attrs.SMS = e164;
    const body = {
      attributes: attrs,
      listIds: process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
      updateEnabled: true,
    };
    // Brevo identifies a contact by email, or by SMS when there is no email.
    if (email) body.email = email;
    else if (e164) body.SMS = e164;
    else return out;                       // nothing to key on
    await brevo.post('/contacts', body);

    if (email) {
      const c = await brevo.get(`/contacts/${encodeURIComponent(email)}`);
      out.contactId = c.data && c.data.id ? String(c.data.id) : null;
    }
  } catch (err) {
    console.error('quote->brevo contact failed:', err.response?.data?.message || err.message);
  }

  try {
    const lines = (q.items || []).map(i =>
      `  ${i.qty} x ${i.description}` +
      (i.unit_price != null ? ` @ ${money(i.unit_price)}` : '') +
      (i.line_total != null ? ` = ${money(i.line_total)}` : '') +
      (i.manual ? '   [manual price]' : '')
    ).join('\n');
    const noteText =
      `QUOTE ${q.code} — ${money(q.total || q.subtotal)}\n` +
      `${lines}\n` +
      (q.notes ? `\nNOTES:\n  ${q.notes}\n` : '') +
      `\nLink: ${quoteLink(q.code)}` +
      (q.valid_until ? `\nValid until: ${fmtDate(q.valid_until)}` : '');

    const deal = await brevo.post('/crm/deals', {
      name: `Quote — ${q.name || phone || email} (${q.code})`,
      attributes: {
        // The TOTAL, not the subtotal — every deal used to understate the job
        // by the tax, so pipeline value never matched the books.
        amount: parseFloat(Number(q.total || q.subtotal || 0).toFixed(2)),
        pipeline: BREVO_PIPELINE,
        deal_stage: BREVO_STAGE[quoteStage(q)],
        close_date: q.valid_until ? new Date(q.valid_until).toISOString() : new Date().toISOString(),
      },
    });
    out.dealId = deal.data && deal.data.id ? String(deal.data.id) : null;

    if (out.dealId && out.contactId) {
      await brevo.patch(`/crm/deals/${out.dealId}`, { linkedContactsIds: [parseInt(out.contactId)] })
        .catch(e => console.error('quote deal link failed:', e.response?.data?.message || e.message));
    }
    if (out.dealId) {
      await brevo.post('/crm/notes', {
        text: noteText,
        ...(out.contactId ? { contactIds: [parseInt(out.contactId)] } : {}),
        dealIds: [out.dealId],
      }).catch(e => console.error('quote note failed:', e.response?.data?.message || e.message));
    }
  } catch (err) {
    console.error('quote->brevo deal failed:', err.response?.data?.message || err.message);
  }

  return out;
}

/** Push the lead into the Lumise Customers page (separate database, reached
 *  over the shared internal key). Fire-and-forget by design. */
async function syncQuoteToLumise(q) {
  const key = process.env.JT_INTERNAL_KEY;
  if (!key) return;
  try {
    const url = `https://design.jtees.net/jt-contact.php?key=${encodeURIComponent(key)}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: q.name || '', email: q.email || '', phone: q.phone || '',
        note: `Quote ${q.code} — ${money(q.total || q.subtotal)} (${quoteSummary(q.items)})`,
        source: 'quote',
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('quote->lumise failed:', err.message);
  }
}

/* ── Quote routes ────────────────────────────────────────────────────────── */

const QUOTE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f4f6fb;color:#12203c;padding:16px}
.wrap{max-width:640px;margin:0 auto}
h1{font-size:21px;margin-bottom:2px;color:#0B1F4B}
.sub{color:#6b7280;font-size:13px;margin-bottom:16px}
.card{background:#fff;border:1px solid #e3e8f2;border-radius:14px;padding:18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(12,28,60,.05)}
label{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:12px 0 5px}
input,select,textarea{width:100%;padding:12px;border:1px solid #cfd8e8;border-radius:9px;font-size:16px;font-family:inherit;background:#fff}
input:focus,select:focus,textarea:focus{outline:2px solid #1848B8;outline-offset:-1px;border-color:#1848B8}
.row{display:flex;gap:10px}.row>*{flex:1}
button,.btn{display:inline-block;text-align:center;background:#1848B8;color:#fff;border:0;border-radius:100px;padding:14px 26px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;font-family:inherit}
button:active{transform:translateY(1px)}
.btn-ghost{background:#eef1f8;color:#33415c}
.items th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8b95a5;padding:6px 4px;border-bottom:1px solid #e3e8f2}
.items td{padding:9px 4px;border-bottom:1px solid #f0f3f9;vertical-align:top}
.items{width:100%;border-collapse:collapse}
.num{text-align:right;white-space:nowrap}
.tot{font-size:19px;font-weight:800;color:#0B1F4B}
.msg{background:#0B1F4B;color:#e8eefc;border-radius:12px;padding:14px;white-space:pre-wrap;font-size:14px;line-height:1.55;margin:12px 0}
.ok{background:#e7f6ec;border:1px solid #b7e0c4;color:#166534;padding:12px 14px;border-radius:10px;margin-bottom:12px}
.warn{background:#fdecea;border:1px solid #f5c6cb;color:#b71c1c;padding:12px 14px;border-radius:10px;margin-bottom:12px}
.chip{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:3px 10px;border-radius:20px}
.muted{color:#6b7280;font-size:13px}
@media(max-width:560px){.row{flex-direction:column;gap:0}}

/* ── Item lines ──────────────────────────────────────────────────────────
   Each item is a quiet block, not a competing card. Only the essentials show;
   the rest is one tap away, so ten items still read as a list. */
.line{border:1px solid #e6eaf3;border-radius:12px;padding:12px;margin-bottom:10px;background:#fcfdff}
.line-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.line-no{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8b96ad}
.line-x{background:none;border:0;color:#b6bfd0;font-size:22px;line-height:1;padding:0 4px;
  width:auto;cursor:pointer;border-radius:6px}
.line-x:hover{color:#c0392b;background:#fdf0ee}
.line input,.line select{margin:0}
.row-2{gap:8px}
/* Qty / each / total must stay on one line even on a phone — they are short,
   and stacking them is what made the form feel endless. */
.row-tight{display:flex;gap:8px;align-items:center}
.row-tight .q{flex:0 0 78px}
.row-tight .u{flex:1 1 auto;min-width:0}
.row-tight .lt{flex:0 0 88px;text-align:right;font-size:15px;color:#0B1F4B;white-space:nowrap}
.more{background:none;border:0;color:#5a6a86;font-size:13px;padding:8px 0 0;width:auto;
  cursor:pointer;font-weight:600}
.more:hover{color:#1848B8}
.more .caret{font-size:10px;display:inline-block;width:12px}
.extra{padding-top:8px}
@media (max-width:520px){
  .row-2{flex-direction:row}
  .row-2>*{min-width:0}
}

/* ── Checklist rows ──────────────────────────────────────────────────────────
   A whole row is the tap target. The global button rule below turns every
   button into a fat blue pill, which is right for actions and wrong for a
   list, so this resets it back to a flush row. */
.step-row{display:flex;align-items:baseline;gap:9px;width:100%;
  background:none;border:0;border-radius:8px;padding:9px 8px;margin:0;
  text-align:left;font:inherit;font-weight:400;color:inherit;cursor:pointer;
  min-height:38px}
form:has(>.step-row){display:block}
.step-row:hover{background:#eef4ff}
.step-row:active{transform:none;background:#e2ecfd}
.step-auto{cursor:default;opacity:.72}
.step-auto-tag{font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#a8b3c6;
  border:1px solid #dfe5ef;border-radius:4px;padding:1px 4px;margin-left:auto;flex:0 0 auto}
.step-auto:hover{background:none}
.step-tick{font-size:15px;line-height:1;flex:0 0 auto}
.step-label{font-size:13px}
.step-hint{color:#6b7280;font-size:11.5px;flex:1 1 auto;min-width:0}
@media (max-width:640px){
  /* The hint is useful context, not worth wrapping a row for on a phone. */
  .step-hint{display:none}
  .step-row{min-height:44px}
}

/* ── Wide screens ────────────────────────────────────────────────────────────
   Built phone-first, which left a 640px ribbon down the middle of a monitor
   with everything stacked inside it. The column stays put on a phone; on a
   desktop it widens and the detail panels sit side by side instead of in one
   long vertical queue. */
/* ── Kanban ──────────────────────────────────────────────────────────────────
   Columns are production stages, cards are jobs. It scrolls sideways rather
   than wrapping: a stage that moves to the next line stops reading as a
   pipeline, which is the only thing this view is for. */
/* Five columns fit a laptop, so the board reads as a pipeline instead of
   scrolling sideways. Below 900px it falls back to horizontal scroll, which is
   the right behaviour on a phone. */
.kanban{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;padding-bottom:6px}
.kcol{background:#f4f7fc;border:1px solid #e3e8f2;border-radius:12px;padding:9px;min-height:110px;min-width:0}
@media (max-width:900px){
  .kanban{display:flex;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:10px}
  .kcol{flex:0 0 210px}
}
.kcol-head{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:13px;color:#0B1F4B}
.kcount{background:#e3e8f2;border-radius:100px;padding:1px 8px;font-size:11.5px;color:#5a6a86}
.kcol-hint{color:#8a97ad;font-size:10.5px;margin:2px 0 8px}
.kcard{background:#fff;border:1px solid #e3e8f2;border-radius:10px;padding:9px;margin-bottom:8px;
  box-shadow:0 1px 2px rgba(12,28,60,.05)}
.kcard-risk{border-color:#f5c6c0;background:#fffaf9}
.kcard-top{display:flex;justify-content:space-between;gap:6px;align-items:baseline}
.kcard-name{font-weight:700;font-size:13px;color:#0B1F4B;text-decoration:none}
.kcard-name:hover{color:#1848B8;text-decoration:underline}
.kcard-due{font-size:11px;color:#6b7280;white-space:nowrap}
.kcard-sub{font-size:11.5px;color:#6b7280;margin-top:2px}
.kcard-risk-note{font-size:11px;color:#b91c1c;margin-top:4px}
.kmove{display:flex;justify-content:space-between;align-items:center;gap:4px;margin-top:8px}
.kmove form{margin:0}
.kbtn{background:#eef2f9;color:#33415c;border:0;border-radius:8px;padding:5px 11px;font-size:13px;
  font-weight:700;cursor:pointer;line-height:1.2;min-height:30px;display:inline-flex;align-items:center}
.kbtn:hover{background:#dde5f3}
.kbtn-go{background:#1848B8;color:#fff}
.kbtn-go:hover{background:#123a95}
.kbtn-link{font-size:11px;font-weight:600;text-decoration:none;color:#5a6a86;background:none;padding:5px 4px}
.kbtn-link:hover{color:#1848B8;background:none}
.knext{margin:8px 0 0}
.kbtn-next{width:100%;justify-content:center;background:#1848B8;color:#fff;font-size:12.5px;padding:8px 10px}
.kbtn-next:hover{background:#123a95}
.kbtn-sm{padding:4px 9px;font-size:12px;min-height:26px}
.kempty{color:#c2cbdb;text-align:center;font-size:13px;padding:8px 0}

/* The job board is a grid of cards, not one long column. Each card stays a
   whole job — its panels stack inside it — so a card can be read without
   scanning across, and the screen carries three of them side by side. */
.quote-grid{display:grid;gap:14px;align-items:start}
@media (min-width:820px){
  .wrap{max-width:1120px}
  .quote-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (min-width:1320px){
  .wrap{max-width:1560px}
  .quote-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (min-width:1900px){
  .wrap{max-width:1840px}
}
/* Tables inside a narrower card must scroll rather than force the card wide. */
.quote-grid .card table{max-width:100%}
.quote-grid .card details table{display:block;overflow-x:auto}
`;

/* ── The admin shell ─────────────────────────────────────────────────────────
   Every operator page hangs off one nav, because until this existed there were
   eight of them on inconsistent paths with no way between: /quotes, /production,
   /books, /tax.csv, /customer, /admin/reviews, /inventory and /admin. Reviews
   and Inventory were reachable only by typing the URL, and Books only via a
   single "back to jobs" link buried in a table.

   Deliberately NOT added to quotePage(): that shell also renders the public
   quote at /q/:code, and putting Books and the submissions inbox in front of a
   customer is a different kind of bug.

   The routes themselves are not renamed. /production/:code and /admin/reviews
   are already sitting in sent email — the daily digest links to job pages and
   the review alert links to the approval screen — so moving them would break
   links in mail already in June's inbox for no gain. */
const ADMIN_NAV = [
  { key: 'jobs',      href: '/quotes',        label: 'Jobs' },
  { key: 'orders',    href: '/orders',        label: 'Orders' },
  { key: 'customers', href: '/customers',     label: 'Customers' },
  { key: 'leads',     href: '/admin',         label: 'Leads' },
  { key: 'money',     href: '/books',         label: 'Finances' },
  { key: 'reviews',   href: '/admin/reviews', label: 'Reviews' },
];
/* Ordered the way a shop is actually worked, not the way the routes grew:
   work in hand, then money that arrived, then the people it came from, then
   the leads that have not become either yet, then the books, then reputation.

   /inventory is deliberately absent — it answers JSON, not a page, so a nav
   entry would drop June onto a wall of raw Clover data.

   The studio sits outside this list because it is a different application on a
   different domain. It already links here (Quotes, New Quote, Reviews, Sales
   Stats, all SSO'd); this is the return leg, which did not exist — you could
   get from Lumise to the job board and then had no way back except the browser
   history or a bookmark. */
const STUDIO_ADMIN = (process.env.JT_DESIGNER_URL || 'https://design.jtees.net')
  .replace(/\/+$/, '') + '/admin.php';

function adminNav(active) {
  return `<nav style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin:0 0 18px;padding-bottom:10px;border-bottom:1px solid #e3e8f2">
    ${ADMIN_NAV.map(n => `<a href="${n.href}" style="
        text-decoration:none;padding:7px 14px;border-radius:100px;font-size:14px;
        ${n.key === active
          ? 'background:#1848B8;color:#fff;font-weight:700'
          : 'color:#46505f;font-weight:600'}">${n.label}</a>`).join('')}
    <a href="${STUDIO_ADMIN}" target="_blank" rel="noopener" style="
       margin-left:auto;text-decoration:none;padding:7px 14px;border-radius:100px;
       font-size:14px;color:#46505f;font-weight:600;border:1px solid #e3e8f2">Studio &#8599;</a>
  </nav>`;
}

/** Admin pages: the quote shell plus the nav. `active` is an ADMIN_NAV key. */
function adminPage(title, body, active) {
  return quotePage(title, adminNav(active) + body);
}

function quotePage(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escEmail(title)}</title><style>${QUOTE_CSS}${REVIEW_CSS}</style></head><body><div class="wrap">${body}</div></body></html>`;
}

/* The form June opens on her phone. Also serves /quote/:code/edit, pre-filled,
   so editing is the same screen rather than a second thing to maintain. */
app.get(['/quote/new', '/quote/:code/edit'], requireAdmin, async (req, res) => {
  let catalog = { products: [], methods: [] };
  try { catalog = await getCatalog(); } catch (e) { /* form still works manually */ }

  let existing = null;
  const editCode = String(req.params.code || '').toUpperCase();
  if (QUOTE_CODE_RE.test(editCode)) {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [editCode]);
    if (!rows.length) {
      return res.status(404).send(quotePage('Not found',
        `<div class="card"><div class="warn">No quote with that code.</div>
         <a class="btn btn-ghost" href="/quotes">All quotes</a></div>`));
    }
    existing = rows[0];
  }
  const E = existing || {};
  const eItems = (E.items && E.items.length) ? E.items : [null];
  const val = (v) => v == null ? '' : escEmail(String(v));
  const [eFirst, ...eRest] = String(E.name || '').trim().split(/\s+/);

  const prodOpts = catalog.products.map(p =>
    `<option value="${escEmail(String(p.id))}">${escEmail(p.name)} — ${money(p.price)}</option>`
  ).join('');
  /* A decoration can only be offered here if it can be PRICED here: the line
     total is (blank + size upcharge + decoration tier for qty) x qty, so a
     method with no tiers would quote as if decoration were free. The filter is
     therefore right — but it used to drop those methods silently, which is why
     "the printing type we added is missing from the quote page" reads as a bug
     in this page rather than as unfinished setup in the designer. Say what was
     left out and why, so it is fixable without reading this file. */
  /* Digitizing is excluded here on purpose — it has its own control below.
     Left in this list it reads as a decoration you apply to every piece, which
     is exactly how it would then be billed. */
  const quotable = catalog.methods.filter(m =>
    m.use_for_quoting && Object.keys(m.positions || {}).length &&
    !DIGITIZING_METHOD_RE.test(m.title || ''));
  const methodOpts = quotable
    .map(m => `<option value="${m.id}">${escEmail(m.title)}</option>`).join('');

  /* Embroidery run rates are excluded on purpose (the shop prices embroidery
     another way and only its digitizing fees are authoritative), so those are
     not reported as a problem — only methods that COULD be offered and cannot,
     because nobody has priced them yet. */
  /* `unsupported_type` is jt-catalog.php saying it did not understand the
     method's band shape, as opposed to nobody having priced it. The two need
     different fixes and used to look identical from here — screen printing
     read as "unpriced" for a week while its table was fully populated. */
  const untiered = catalog.methods.filter(m =>
    m.use_for_quoting && !Object.keys(m.positions || {}).length);
  const untieredLabel = (m) => m.title +
    (m.unsupported_type ? ` (its ${m.unsupported_type}-type prices could not be read)` : '');

  /* Digitizing is offered on its own control rather than in the method list,
     because it is a one-off per design and the method list is priced per piece. */
  const digiList = digitizingOptions(catalog);
  const digiOpts = digiList.map(d =>
    `<option value="${d.id}">${escEmail(d.title)} — ${money(d.price)}</option>`).join('');

  const catalogNote = !catalog.methods.length
    ? `<div class="warn" style="margin-bottom:10px">The product catalogue could not be
       loaded from the designer, so the dropdowns are empty. Every line can still be
       priced by hand. If this persists, check <code>JT_INTERNAL_KEY</code>.</div>`
    : untiered.length
    ? `<p class="muted" style="margin:-4px 0 10px;font-size:12.5px">
       ${untiered.length} decoration ${untiered.length === 1 ? 'method is' : 'methods are'}
       not listed — ${escEmail(untiered.map(untieredLabel).join(', '))} —
       because ${untiered.length === 1 ? 'it has' : 'they have'} no quantity price tiers set.
       Add tiers in the designer admin under Printings and ${untiered.length === 1 ? 'it' : 'they'}
       will appear here. Products need to be <b>Active</b> in the designer to be listed at all.</p>`
    : '';

  /* One item. Only the three things every line needs are on show — what it is,
     how many, what each costs. Colour notes, photos and the size grid are real
     but occasional, so they sit behind a disclosure rather than stacking seven
     blocks per item down the page. */
  const lineHtml = (n, it) => {
    const hasExtras = it && ((it.details && it.details.length) ||
                             (it.images && it.images.length) || it.size_mix);
    return `
    <div class="line" data-n="${n}">
      <div class="line-head">
        <span class="line-no">Item <b class="ix">${n + 1}</b></span>
        <button type="button" class="line-x" onclick="removeLine(this)" title="Remove this item">&times;</button>
      </div>
      <input name="description${n}" class="d" value="${it ? val(it.description) : ''}"
             placeholder="What is it? e.g. 24 tees, 1 colour front">
      <div class="row row-2" style="margin-top:8px">
        <select name="product${n}" class="p"><option value="">Product (optional)</option>${prodOpts}</select>
        <select name="method${n}" class="m"><option value="">Decoration (optional)</option>${methodOpts}</select>
      </div>
      <div class="row row-tight" style="margin-top:8px">
        <input name="qty${n}" class="q" type="number" inputmode="numeric" min="1"
               value="${it ? val(it.qty) : ''}" placeholder="Qty">
        <input name="unit_price${n}" class="u" type="number" step="0.01" inputmode="decimal"
               value="${it && it.manual ? val(it.unit_price) : ''}" placeholder="Each $">
        <b class="lt">—</b>
      </div>
      <p class="minwarn" style="display:none;margin:6px 0 0;font-size:12.5px;color:#b45309"></p>
      <p class="aonote" style="display:none;margin:6px 0 0;font-size:12px;color:#6b7280"></p>
      <!-- Internal cost split. This form is requireAdmin and the customer's page
           (/q/:code) renders from the stored line total, so nothing here reaches
           them — it is for deciding whether a line is worth taking. -->
      <p class="costnote" style="display:none;margin:6px 0 0;font-size:12px;color:#3f4a5f;
         background:#F6F8FC;border:1px solid #E2E8F4;border-radius:6px;padding:6px 9px"></p>
      <div class="row row-2" style="margin-top:8px">
        <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400">
          <input type="checkbox" name="dark${n}" class="dark" value="1"
                 ${it && it.garment_dark ? 'checked' : ''} style="width:auto;margin:0">
          Dark garment</label>
        <select name="loc${n}" class="loc" style="font-size:13px;padding:6px 7px">
          <option value="">Front only</option>
          <option value="mr8a5dlx"${it && it.stage === 'mr8a5dlx' ? ' selected' : ''}>Back only</option>
          <option value="both"${it && it.stage === 'both' ? ' selected' : ''}>Front + back</option>
        </select>
      </div>
      <div style="margin-top:6px">
        <input name="blank_price${n}" class="bp" type="number" step="0.01" min="0" inputmode="decimal"
               value="${it && it.blank_price ? val(it.blank_price) : ''}"
               style="font-size:13px;padding:6px 7px" placeholder="Garment price each — leave blank for catalogue">
        <p class="muted bpnote" style="margin:3px 0 0;font-size:11.5px"></p>
      </div>
      <!-- Ink colours. Screen printing is ONE method with a column per colour
           count, so the count is the thing that picks the price and nothing on
           this page can infer it — only a person who has seen the artwork
           knows. Options are filled in by calc() from the method's own
           colour_options, so the picker can never offer a column the shop has
           not priced. Hidden for every other method. -->
      <div class="inks" style="display:none;margin-top:8px;padding:8px 10px;background:#f6f8fd;border:1px solid #e3e8f2;border-radius:8px">
        <label style="margin:0 0 4px;font-size:11px">Ink colours in the design</label>
        <select name="colors${n}" class="cols" style="font-size:13px;padding:6px 7px"
                data-v="${it && it.colours ? val(it.colours) : ''}"></select>
        <p class="muted" style="margin:4px 0 0;font-size:11.5px">One screen per colour — the price is banded on this.</p>
      </div>
      <div class="addons" style="margin-top:6px;display:none"></div>
      <div class="digi" style="display:none;margin-top:8px;padding:8px 10px;background:#f6f8fd;border:1px solid #e3e8f2;border-radius:8px">
        <label style="margin:0 0 4px;font-size:11px">Digitizing — one time, not per piece</label>
        <select name="setup${n}" class="su" style="font-size:13px;padding:6px 7px">
          <option value="">No digitizing — they supplied a usable file</option>
          ${digiList.map(d => `<option value="${d.id}"${
            it && String(it.setup_method_id) === String(d.id) ? ' selected' : ''
          }>${escEmail(d.title)} — ${money(d.price)}</option>`).join('')}
        </select>
        <p class="muted" style="margin:4px 0 0;font-size:11.5px">Charged once for the design. Leave as-is to waive it.</p>
      </div>
      <button type="button" class="more" onclick="toggleMore(this)"
        aria-expanded="${hasExtras ? 'true' : 'false'}">
        <span class="caret">${hasExtras ? '&#9662;' : '&#9656;'}</span> Details, photos &amp; sizes</button>
      <div class="extra" style="display:${hasExtras ? 'block' : 'none'}">
        <input name="details${n}" class="dt" value="${it ? val(it.details) : ''}"
               placeholder="Colour, ink, placement — the customer sees this">
        <div class="sizes" style="display:none;margin-top:8px"></div>
        <input type="hidden" name="sizemix${n}" class="sm" value="">
        <div style="margin-top:8px">
          <input type="file" class="fi" accept="image/*" multiple style="padding:8px;font-size:13px">
          <input type="hidden" name="images${n}" class="im" value="${it && it.images ? escEmail(JSON.stringify(it.images)) : ''}">
          <div class="thumbs" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px"></div>
        </div>
      </div>
    </div>`;
  };

  res.send(quotePage('New quote', `
    <h1>${existing ? 'Edit quote ' + escEmail(existing.code) : 'New quote'}</h1>
    <div class="sub">${existing
      ? 'Their link stays the same — it updates the moment you save.'
      : 'Fills in the message for you — you still send it from your phone.'}</div>
    ${existing && existing.change_request ? `<div class="card"><b>They asked for:</b>
      <div class="muted" style="margin-top:6px">"${escEmail(existing.change_request)}"</div></div>` : ''}
    <form method="POST" action="${existing ? '/api/quotes/' + existing.code : '/api/quotes'}" id="qf">
      <div class="card">
        <div class="row">
          <div><label>First name <span style="text-transform:none;font-weight:400">(optional)</span></label>
               <input name="first_name" value="${val(eFirst)}" autocomplete="off"></div>
          <div><label>Last name <span style="text-transform:none;font-weight:400">(optional)</span></label>
               <input name="last_name" value="${val(eRest.join(' '))}" autocomplete="off"></div>
        </div>
        <div class="row">
          <div><label>Mobile <span style="text-transform:none;font-weight:400">(optional)</span></label><input name="phone" type="tel" inputmode="tel" value="${val(E.phone)}" autocomplete="off"></div>
          <div><label>Email <span style="text-transform:none;font-weight:400">(optional)</span></label><input name="email" type="email" value="${val(E.email)}" autocomplete="off"></div>
        </div>
        <p class="muted" style="margin-top:8px">All optional. Leave the name blank for an online or walk-up enquiry and
          the customer is asked for it when they open the quote. Phone or email — either one is enough;
          with neither you still get a link you can show or print.</p>
        <div id="prior"></div>
      </div>

      <div class="card">
        <label style="margin-top:0">Items</label>
        ${catalogNote}
        <div id="lines">${eItems.map((it, ix) => lineHtml(ix, it)).join('')}</div>
        <button type="button" class="btn btn-ghost" style="padding:9px 18px;font-size:14px" onclick="addLine()">+ Add another item</button>
        <table style="width:100%;margin-top:14px;border-top:1px solid #e3e8f2;padding-top:10px">
          <tr><td class="muted">Subtotal</td><td class="num" id="sub">$0.00</td></tr>
          <tr><td class="muted">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              <span>Discount</span>
              <select name="discount_kind" style="width:auto;padding:5px 6px;font-size:13px">
                <option value="amt" ${E.discount_kind === 'pct' ? '' : 'selected'}>$ off</option>
                <option value="pct" ${E.discount_kind === 'pct' ? 'selected' : ''}>% off</option>
              </select>
              <input name="discount_value" type="number" step="0.01" min="0" inputmode="decimal"
                     value="${Number(E.discount_value) > 0 ? val(E.discount_value) : ''}"
                     placeholder="0" style="width:78px;padding:5px 7px;font-size:13px">
              <input name="discount_note" value="${val(E.discount_note)}" maxlength="120"
                     placeholder="Reason — they see this"
                     style="flex:1 1 130px;min-width:110px;padding:5px 7px;font-size:13px">
            </div></td>
            <td class="num" id="disc" style="color:#166534">—</td></tr>
          <tr><td class="muted"><label style="display:inline;margin:0;text-transform:none;letter-spacing:0;font-size:14px;font-weight:400">
            <input type="checkbox" name="taxable" value="1" ${!existing || Number(E.tax) > 0 ? 'checked' : ''} style="width:auto;margin-right:6px" onchange="calc()"> Illinois sales tax</label></td>
            <td class="num" id="tax">$0.00</td></tr>
          <tr><td class="tot">Total</td><td class="num tot" id="tot">$0.00</td></tr>
          <tr><td class="muted" style="padding-top:6px">Deposit to start</td><td class="num" id="dep" style="padding-top:6px">$0.00</td></tr>
        </table>
      </div>

      <div class="card">
        <label>Needed by <span style="text-transform:none;font-weight:400">(optional)</span></label>
        <input name="needed_by" type="date" value="${E.needed_by ? String(E.needed_by).slice(0,10) : ''}">
        <p class="muted" id="eta" style="margin-top:8px"></p>
        <label>Quote good for (days)</label>
        <input name="valid_days" type="number" value="14" inputmode="numeric">
        <label>Notes for the customer</label><textarea name="notes" rows="2" placeholder="Optional">${val(E.notes)}</textarea>
      </div>

      <p class="muted" id="qfstat" style="margin-top:10px;font-size:12.5px"></p>
      <button type="submit" id="qfgo">${existing ? 'Save changes' : 'Create quote &amp; get the message'}</button>
    </form>
    <p style="margin-top:14px"><a class="muted" href="/quotes">View all quotes →</a></p>
    <script>
      var CAT = ${JSON.stringify(catalog)};
      var TAX = ${TAX_RATE}, DEP = ${DEPOSIT_PC}, FULL_UNDER = ${DEPOSIT_FULL_UNDER};
      var n = ${eItems.length};
      function m2(v){ return '$' + (Math.round(v*100)/100).toFixed(2); }

      /* The pricing rule itself — the SAME SOURCE the server runs, so the
         figure on screen and the figure charged cannot drift apart. Do not
         reimplement any of this here; change it in quotePricingSource(). */
${quotePricingSource()}

      var BLANK_TIERS = ${JSON.stringify(BLANK_TIERS)};
      /* Add-ons and digitizing fees, from the same catalogue the server prices
         against, keyed by method id so a line only offers what applies to it. */
      var DIGI = ${JSON.stringify(digiList)};
      var ADDONS = ${JSON.stringify(ADDONS.map((a) => ({
        code: a.code, label: a.label, kind: a.kind, rate: a.rate,
        auto: a.auto || null, note: a.note || null, appliesTo: a.appliesTo.source,
      })))};
      var RUSH = ${JSON.stringify(RUSH_OPTIONS)};
      var HOLIDAY = ${HOLIDAY_MODE ? 'true' : 'false'};
      var SCREEN_FEES_LIVE = ${SCREEN_FEES_LIVE ? 'true' : 'false'};

      /** Which add-ons apply to a method, mirroring addonsFor() on the server. */
      function addonsForTitle(title){
        if (!title) return [];
        return ADDONS.filter(function(a){ return new RegExp(a.appliesTo, 'i').test(title); });
      }

      /* Optional fields stay out of the way until asked for. */
      function toggleMore(btn){
        var box = btn.nextElementSibling;
        var open = box.style.display !== 'none';
        box.style.display = open ? 'none' : 'block';
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        btn.querySelector('.caret').innerHTML = open ? '&#9656;' : '&#9662;';
      }

      /* Adding an item by mistake used to be permanent. */
      function removeLine(btn){
        var lines = document.querySelectorAll('.line');
        if (lines.length <= 1) {          // never leave the form with no item
          var only = lines[0];
          only.querySelectorAll('input,select').forEach(function(el){ el.value = ''; });
          only.querySelector('.thumbs').innerHTML = '';
          calc();
          return;
        }
        btn.closest('.line').remove();
        reindex();
        calc();
      }

      /* Keep the name suffixes 0..n-1 with no gaps, whatever was removed —
         a gap would make the server stop reading at the missing index. */
      function reindex(){
        var lines = document.querySelectorAll('.line');
        lines.forEach(function(L, i){
          L.dataset.n = i;
          L.querySelector('.ix').textContent = i + 1;
          L.querySelectorAll('input,select').forEach(function(el){
            if (el.name) el.name = el.name.replace(/\\d+$/, i);
          });
        });
        n = lines.length;
      }
      /* One tap to charge a returning customer what they paid last time — this
         is what actually stops prices drifting between jobs. */
      function usePrice(v){
        var line = document.querySelector('.line');
        if (!line) return;
        line.querySelector('.u').value = v.toFixed(2);
        calc();
        line.querySelector('.u').scrollIntoView({block:'center', behavior:'smooth'});
      }
      /* Draw a size row for the chosen product so extended-size upcharges are
         applied automatically instead of being forgotten. */
      function buildSizes(L, prod){
        var box = L.querySelector('.sizes');
        var key = prod ? String(prod.id) : '';
        if (box.dataset.for === key) return;
        box.dataset.for = key;
        if (!prod || !prod.sizes || !prod.sizes.length) { box.style.display='none'; box.innerHTML=''; return; }
        box.style.display = 'block';
        /* The grid lives in the collapsed section, so open it — otherwise
           picking a sized product would silently hide the size boxes. */
        var ex = L.querySelector('.extra');
        if (ex && ex.style.display === 'none') {
          var mb = L.querySelector('.more');
          if (mb) toggleMore(mb);
        }
        box.innerHTML = '<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">How many of each size</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          prod.sizes.map(function(sz){
            return '<label style="flex:0 0 62px;text-align:center;margin:0">' +
              '<span style="display:block;font-size:11px;color:#6b7280">' + sz.size +
              (sz.upcharge>0 ? '<br><span style="color:#b45309">+$'+sz.upcharge.toFixed(2)+'</span>' : '<br>&nbsp;') + '</span>' +
              '<input type="number" min="0" inputmode="numeric" class="sz" data-size="'+sz.size+'" data-up="'+sz.upcharge+
              '" style="padding:7px;text-align:center" placeholder="0"></label>';
          }).join('') + '</div>';
        box.querySelectorAll('.sz').forEach(function(el){ el.oninput = calc; });
      }

      function calc(){
        var sub = 0;
        document.querySelectorAll('.line').forEach(function(L){
          var prod = CAT.products.find(function(x){return String(x.id)===L.querySelector('.p').value;});
          var meth = CAT.methods.find(function(x){return String(x.id)===L.querySelector('.m').value;});
          var u    = L.querySelector('.u');
          var qEl  = L.querySelector('.q');
          buildSizes(L, prod);

          var boxes = L.querySelectorAll('.sz');
          var mix = {}, sizeQty = 0, upTotal = 0;
          boxes.forEach(function(el){
            var v = parseInt(el.value,10)||0;
            if (v>0){ mix[el.dataset.size]=v; sizeQty+=v; upTotal += v * parseFloat(el.dataset.up||0); }
          });
          L.querySelector('.sm').value = sizeQty ? JSON.stringify(mix) : '';

          // Sizes drive the quantity when a product is chosen.
          var qty = sizeQty > 0 ? sizeQty : (parseInt(qEl.value,10)||0);
          if (sizeQty > 0) { qEl.value = sizeQty; qEl.readOnly = true; } else { qEl.readOnly = false; }

          /* Digitizing: shown only for embroidery, and added ONCE — never
             multiplied by the quantity, which is the whole reason it is not a
             decoration method. */
          var digiBox = L.querySelector('.digi');
          var su = L.querySelector('.su');
          var isEmb = meth && /embroider/i.test(meth.title);
          if (digiBox) {
            digiBox.style.display = isEmb ? 'block' : 'none';
            if (!isEmb && su) su.value = '';
          }

          /* Ink colours, asked only for a method that prices by them. The seven
             legacy per-colour methods carry the count in their titles and get
             no picker, so the engine reads it from there instead — one rule,
             two data generations. Rebuilt only when the method changes, so
             re-pricing does not reset a chosen count. */
          var inkBox = L.querySelector('.inks');
          var colEl  = L.querySelector('.cols');
          var inks = (meth && meth.type === 'color' && (meth.colour_options || []).length)
                   ? meth.colour_options : null;
          if (inkBox && colEl) {
            var ikey = inks ? String(meth.id) : '';
            if (colEl.dataset.for !== ikey) {
              colEl.dataset.for = ikey;
              colEl.innerHTML = inks ? inks.map(function(c){
                return '<option value="' + c + '">' + c + (c === 1 ? ' colour' : ' colours') + '</option>';
              }).join('') : '';
              /* Restore what this line was saved with, else start at one — never
                 blank. A blank posts as 1 anyway, so a picker showing nothing
                 would quote a 1-colour job while looking like it failed to load. */
              if (inks) {
                var was = parseInt(colEl.dataset.v, 10);
                colEl.value = String(inks.indexOf(was) > -1 ? was : inks[0]);
              }
            }
            inkBox.style.display = inks ? 'block' : 'none';
          }

          /* Offer exactly the add-ons this decoration allows. Rebuilt only when
             the method changes, so ticking one does not wipe the others. */
          var aoBox = L.querySelector('.addons');
          var mkey = meth ? String(meth.id) : '';
          if (aoBox && aoBox.dataset.for !== mkey) {
            aoBox.dataset.for = mkey;
            var avail = addonsForTitle(meth && meth.title);
            /* Anything the method carries automatically — screens — is never
               offered as something to tick, because it is not a decision. */
            avail = avail.filter(function(a){ return !a.auto; });
            aoBox.innerHTML = avail.length
              ? '<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Upgrades</div>' +
                avail.map(function(a){
                  return '<label style="display:flex;align-items:flex-start;gap:6px;margin:0 0 3px;font-size:13px;text-transform:none;letter-spacing:0;font-weight:400">' +
                    '<input type="checkbox" class="ao" name="addon_' + a.code + '${n}" value="1" data-code="' +
                    a.code + '" style="width:auto;margin:3px 0 0"><span>' + a.label +
                    (a.kind === 'per_piece' ? ' <span class="muted">$' + a.rate.toFixed(2) + ' ea</span>'
                     : a.kind === 'percent_of_decoration' ? ' <span class="muted">+' + a.rate + '%</span>'
                     : ' <span class="muted">$' + a.rate.toFixed(2) + '</span>') +
                    '</span></label>';
                }).join('')
              : '';
            aoBox.style.display = avail.length ? 'block' : 'none';
            aoBox.querySelectorAll('.ao').forEach(function(cb){ cb.onchange = calc; });
          }

          /* Collect the add-ons this line has switched on, plus digitizing and
             anything the method carries automatically, into one list the engine
             can price. Mirrors the save route — if these two ever disagree the
             preview and the saved quote disagree, which is the whole reason the
             pricing rule itself lives in one string. */
          var addons = [];
          if (isEmb && su && su.value) {
            var dm = DIGI.find(function(d){ return String(d.id) === su.value; });
            if (dm) addons.push({ code:'digitizing', label:dm.title, kind:'once', rate:dm.price });
          }
          var dark = L.querySelector('.dark');
          var isDark = !!(dark && dark.checked);
          L.querySelectorAll('.ao').forEach(function(cb){
            if (!cb.checked) return;
            var a = ADDONS.find(function(x){ return x.code === cb.dataset.code; });
            if (a) addons.push(a);
          });
          /* Screens are not a choice — a screen-print job burns them whether or
             not anyone ticked anything, so they come from the method. The dark
             garment does not add a CHARGE here, it adds a SCREEN: it is passed
             to priceLine below and screenCount() decides how many. */
          addonsForTitle(meth && meth.title).forEach(function(a){
            if (a.auto !== 'method') return;
            if (a.code === 'screens' && !SCREEN_FEES_LIVE) return;
            if (addons.some(function(x){ return x.code === a.code; })) return;
            addons.push(a);
          });

          var stage = L.querySelector('.loc') ? L.querySelector('.loc').value : '';
          var bpEl = L.querySelector('.bp');
          var r = priceLine({
            product: prod, method: meth, qty: qty, sizeMix: sizeQty ? mix : null,
            colours: colEl ? colEl.value : '',
            stage: stage, addons: addons, blankTiers: BLANK_TIERS,
            dark: isDark,
            blankOverride: bpEl ? bpEl.value : '',
            unitOverride: u.value
          });

          /* Say what the catalogue holds, so a typed garment price is an
             informed correction rather than a guess. */
          var bpNote = L.querySelector('.bpnote');
          if (bpNote) {
            if (!prod) { bpNote.textContent = ''; }
            else if (bpEl && bpEl.value !== '') {
              bpNote.textContent = 'Catalogue has ' + m2(prod.price) + ' — using your ' + m2(parseFloat(bpEl.value) || 0);
              bpNote.style.color = '#b45309';
            } else {
              bpNote.textContent = 'Catalogue: ' + m2(prod.price) + ' each' +
                (r.blank !== prod.price ? ' → ' + m2(r.blank) + ' at this quantity' : '');
              bpNote.style.color = '#6b7280';
            }
          }

          if (prod) u.placeholder = r.listUnit.toFixed(2);
          var lt = r.lineTotal;
          /* Show the override the way the customer will see it: struck-through
             list, then what they actually pay. Only for a genuine reduction —
             a price ABOVE list is a surcharge, not a deal. */
          var cut = (r.manual && prod && r.listTotal > lt);
          L.querySelector('.lt').innerHTML = lt
            ? (cut ? '<span style="color:#9aa3b2;text-decoration:line-through;font-weight:400">' +
                     m2(r.listTotal) + '</span> <span style="color:#166534">' + m2(lt) + '</span>'
                   : m2(lt))
            : '—';

          /* Say what the extras added, so a line total is never unexplained. */
          var aoNote = L.querySelector('.aonote');
          if (aoNote) {
            aoNote.innerHTML = r.addonLines.length
              ? r.addonLines.map(function(a){ return a.label + ' ' + m2(a.total); }).join(' &middot; ')
              : '';
            aoNote.style.display = r.addonLines.length ? 'block' : 'none';
          }

          /* Garment vs decoration, per piece and for the line. The unit price is
             one number, so there was no way to see whether a thin margin came
             from the blank or the printing — which is the decision this form is
             actually for. Shown only when a quantity makes the totals real. */
          var costNote = L.querySelector('.costnote');
          if (costNote) {
            if (!prod || qty <= 0) { costNote.style.display = 'none'; }
            else {
              var gTot = r.blank * qty, dTot = r.decoration * qty;
              var parts = [
                'Garment ' + m2(r.blank) + '/pc = ' + m2(gTot),
                'Printing ' + m2(r.decoration) + '/pc = ' + m2(dTot)
              ];
              if (r.sizeUpcharge) parts.push('Size upcharges ' + m2(r.sizeUpcharge));
              if (r.addonTotal)   parts.push('Extras ' + m2(r.addonTotal));
              /* An override replaces the per-piece price, so the split above is
                 what the job COSTS to build, not what is being charged. Say so
                 rather than showing two sets of numbers that do not reconcile. */
              if (r.manual) parts.push('override in use — line bills ' + m2(lt));
              costNote.innerHTML = '<b>Internal:</b> ' + parts.join(' &nbsp;&middot;&nbsp; ');
              costNote.style.display = 'block';
            }
          }

          sub += lt;

          /* Screen printing has a floor. The tier keys are band ceilings, so a
             20-piece screen job would otherwise quote at the 50-71 rate and look
             perfectly normal — say so instead, and point at what does run. */
          var warn = L.querySelector('.minwarn');
          var tooFew = meth && /screen\\s*print/i.test(meth.title) && qty > 0 && qty < ${SCREEN_MIN_QTY};
          if (warn) {
            warn.style.display = tooFew ? 'block' : 'none';
            warn.textContent = tooFew
              ? 'Screen printing starts at ${SCREEN_MIN_QTY} pieces. For ' + qty +
                ', quote DTF or heat-transfer vinyl instead.' : '';
          }

          /* Name the location in the line itself. A front+back line otherwise reads
             exactly like a front-only one and costs twice as much, so the only
             evidence of what was quoted was a number the customer cannot check. */
          var d = L.querySelector('.d');
          if (!d.value && prod) {
            var where = stage === 'both' ? ' (front + back)'
                      : (stage ? ' (back)' : '');
            d.value = prod.name + (meth ? ' — ' + meth.title : '') + where;
          }
        });
        /* Mirrors quoteDiscount() on the server, clamps included. If these two
           ever disagree the form shows one number and the customer is charged
           another, so keep them in step. */
        var dk = document.querySelector('[name=discount_kind]').value;
        var dv = parseFloat(document.querySelector('[name=discount_value]').value);
        if (!isFinite(dv) || dv <= 0) dv = 0;
        if (dk === 'pct' && dv > 100) dv = 100;
        var disc = (sub <= 0 || dv <= 0) ? 0 : Math.min(dk === 'pct' ? sub*dv/100 : dv, sub);
        disc = Math.round(disc*100)/100;
        var net = sub - disc;

        var tax = document.querySelector('[name=taxable]').checked ? net*TAX : 0;
        var tot = net + tax;
        var dep = tot <= 0 ? 0 : (tot < FULL_UNDER ? tot : tot*DEP);
        document.getElementById('sub').textContent = m2(sub);
        document.getElementById('disc').textContent = disc > 0
          ? '−' + m2(disc) + (dk === 'pct' ? ' (' + dv + '%)' : '') : '—';
        document.getElementById('tax').textContent = m2(tax);
        document.getElementById('tot').textContent = m2(tot);
        document.getElementById('dep').textContent = m2(dep) + (tot>0 && tot<FULL_UNDER ? ' (paid in full)' : ' (50%)');
      }
      function addLine(){
        var tpl = document.getElementById('lines').firstElementChild.cloneNode(true);
        tpl.querySelectorAll('input,select').forEach(function(el){
          /* \\d, not \d — this whole script lives inside a template literal, so a
             single backslash is eaten before the browser ever sees it. It was,
             and /d+$/ matched nothing: every added line kept the first line's
             name, so five items posted as one and the price arrived as NaN. */
          el.name = el.name.replace(/\\d+$/, n); el.value='';
        });
        tpl.querySelector('.lt').textContent = '—';
        tpl.querySelector('.ix').textContent = n + 1;
        tpl.querySelector('.thumbs').innerHTML = '';
        /* Options and the restore hint are data attributes, which cloneNode
           copies and the value-clearing loop above does not touch — left alone
           a new item would inherit item 1's ink count. */
        var ck = tpl.querySelector('.cols');
        if (ck) { ck.innerHTML = ''; ck.dataset.v = ''; ck.dataset.for = ''; }
        // A new item starts tidy: sizes hidden, extras closed.
        var sz = tpl.querySelector('.sizes');
        if (sz) { sz.style.display = 'none'; sz.innerHTML = ''; }
        var ex = tpl.querySelector('.extra');
        if (ex) ex.style.display = 'none';
        var mb = tpl.querySelector('.more');
        if (mb) { mb.setAttribute('aria-expanded', 'false');
                  mb.querySelector('.caret').innerHTML = '&#9656;'; }
        document.getElementById('lines').appendChild(tpl); n++;
        bind();
        tpl.querySelector('.d').focus();
      }
      var CLOUD = ${JSON.stringify(process.env.CLOUDINARY_NAME || '')};
      var CKEY  = ${JSON.stringify(process.env.CLOUDINARY_API_KEY || '')};

${uploadStatusScript()}

      /* Upload through the existing signed-upload endpoint so the API secret
         never reaches the browser. Files go to the allow-listed
         "quote_requests" folder.

         Every failure path here has to end up in upFailed and go through
         saySoon(). This form had no in-flight tracking at all: the save button
         stayed live while uploads were still running, so saving quickly meant
         the hidden field had not been written yet and the photos were dropped
         with nothing said. A ✕ in a 58px thumbnail was the only sign, and it
         did not stop the save. */
      var upPending = 0, upFailed = 0, upReason = '';
      var qfstat = document.getElementById('qfstat');
      var qfgo   = document.getElementById('qfgo');

      function saySoon(){
        var attached = 0;
        document.querySelectorAll('.im').forEach(function(h){
          try { attached += h.value ? JSON.parse(h.value).length : 0; } catch (e) {}
        });
        qfstat.textContent = uploadStatus(upPending, attached, upFailed, upReason);
        qfstat.style.color = upFailed ? '#b45309' : '#6b7280';
        qfgo.disabled = upPending > 0;
        qfgo.style.opacity = upPending > 0 ? '.6' : '';
        /* The button says what it is about to do. Saving with photos missing
           is allowed — a quote is worth more than its reference shots — but it
           must not look like the photos went with it. */
        qfgo.textContent = (!upPending && upFailed)
          ? ${JSON.stringify(existing ? 'Save changes' : 'Create quote')} + ' without the missing photo' + (upFailed > 1 ? 's' : '')
          : ${JSON.stringify(existing ? 'Save changes' : 'Create quote & get the message')};
      }

      function uploadFiles(L, files){
        if (!files.length) return;
        if (!CLOUD || !CKEY) {
          /* Silently returning is how this hid: the admin picked files and
             absolutely nothing happened, on a form that otherwise works. */
          upFailed += files.length;
          upReason = 'photo uploads are not configured on this server';
          saySoon();
          return;
        }
        var hidden = L.querySelector('.im');
        var thumbs = L.querySelector('.thumbs');
        Array.prototype.forEach.call(files, function(file){
          var ph = document.createElement('div');
          ph.style.cssText = 'width:58px;height:58px;border-radius:8px;background:#eef1f8;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6b7280';
          ph.textContent = '…';
          thumbs.appendChild(ph);
          upPending++; saySoon();
          var ts = Math.round(Date.now()/1000);
          fetch('/api/cloudinary-signature', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ folder:'quote_requests', timestamp: ts })
          }).then(function(r){
            /* A 503 from this endpoint is still JSON — {error:'Cloudinary not
               configured'} — so parsing alone never throws, and the missing
               signature was only noticed two steps later when Cloudinary
               rejected the upload. Check the status here. */
            if (!r.ok) throw new Error('signature unavailable');
            return r.json();
          }).then(function(sig){
            if (!sig.signature) throw new Error('signature unavailable');
            var fd = new FormData();
            fd.append('file', file);
            fd.append('api_key', CKEY);
            fd.append('timestamp', sig.timestamp);
            fd.append('folder', sig.folder);
            fd.append('signature', sig.signature);
            return fetch('https://api.cloudinary.com/v1_1/'+CLOUD+'/image/upload', {method:'POST', body:fd});
          }).then(function(r){return r.json();}).then(function(d){
            if(!d.secure_url) throw new Error(d.error ? d.error.message : 'upload failed');
            var list = hidden.value ? JSON.parse(hidden.value) : [];
            list.push(d.secure_url);
            hidden.value = JSON.stringify(list);
            ph.style.background = 'url('+d.secure_url+') center/cover';
            ph.textContent = '';
          }).catch(function(e){
            ph.textContent = '✕'; ph.style.color = '#b71c1c';
            upFailed++;
            upReason = /signature/.test(e && e.message || '')
              ? 'the server would not sign the upload' : 'the upload was rejected';
            console.error('upload failed', e);
          }).then(function(){ upPending--; saySoon(); });
        });
      }

      function bind(){
        document.querySelectorAll('#qf input, #qf select').forEach(function(el){
          if (el.type === 'file') return;
          el.oninput = calc; el.onchange = calc;
        });
        document.querySelectorAll('.fi').forEach(function(fi){
          fi.onchange = function(){ uploadFiles(fi.closest('.line'), fi.files); };
        });
      }
      bind(); calc();
      // Delivery estimate hint
      var eta = ${JSON.stringify(deliveryEstimate())};
      document.getElementById('eta').textContent =
        'Typical turnaround: ready about ' + new Date(eta.ready).toLocaleDateString('en-US',{month:'short',day:'numeric'}) +
        ', delivered ' + new Date(eta.deliver_from).toLocaleDateString('en-US',{month:'short',day:'numeric'}) +
        '–' + new Date(eta.deliver_to).toLocaleDateString('en-US',{month:'short',day:'numeric'}) + '.';
      // Prior pricing for a returning customer
      var t;
      function lookup(){
        clearTimeout(t); t = setTimeout(function(){
          var f = document.forms[0];
          var q = (f.phone.value||f.email.value||'').trim();
          if(q.length < 5){ document.getElementById('prior').innerHTML=''; return; }
          fetch('/api/quotes/prior?q='+encodeURIComponent(q))
            .then(function(r){return r.json();})
            .then(function(d){
              if(!d.found){ document.getElementById('prior').innerHTML=''; return; }
              var lines = (d.lines||[]).map(function(l,ix){
                return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:5px">'+
                  '<span style="font-size:12.5px">'+l.desc+'</span>'+
                  '<button type="button" class="btn btn-ghost" style="padding:4px 10px;font-size:12px;white-space:nowrap"'+
                  ' onclick="usePrice('+l.unit+')">$'+l.unit.toFixed(2)+' ea — use</button></div>';
              }).join('');
              // What the last job made, shown while the next price is being set.
              var mg = '';
              if (d.margin) {
                mg = '<div style="margin-top:6px;font-size:12.5px;color:'+(d.margin.thin?'#b91c1c':'#047857')+'">'+
                     'Last job made <b>'+d.margin.profit+'</b> ('+d.margin.pct+'%)'+
                     (d.margin.thin?' — thin, price this one higher':'')+
                     (d.avg_pct!==null&&d.count>1?' <span style="color:#6b7280">· '+d.avg_pct+'% average</span>':'')+
                     '</div>';
              } else {
                mg = '<div class="muted" style="margin-top:6px;font-size:12px">'+
                     'No costs entered on their last job, so there is no margin to check this price against.</div>';
              }
              document.getElementById('prior').innerHTML =
                '<div class="ok" style="margin-top:12px">'+
                '<b>Returning customer</b> — '+d.count+' quote'+(d.count===1?'':'s')+
                ', quoted '+d.lifetime_quoted+', paid '+d.lifetime_spent+
                ' &middot; <a href="'+d.link+'" target="_blank">full history</a>'+
                mg+
                '<div class="muted" style="margin-top:6px;font-size:12px">Last quoted '+d.when+':</div>'+
                lines+'</div>';
            }).catch(function(){});
        }, 400);
      }
      document.forms[0].phone.addEventListener('input', lookup);
      document.forms[0].email.addEventListener('input', lookup);
    </script>
  `));
});

/* Catalogue from the designer, cached. Falls back to the last good copy so a
   slow designer never blocks quoting. */
let _catCache = { at: 0, data: null };
/* One user agent for every server-to-server call between our own hosts. */
const JT_SERVER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) jtees-server/1.0';

async function getCatalog() {
  if (_catCache.data && Date.now() - _catCache.at < 10 * 60 * 1000) return _catCache.data;
  const key = process.env.JT_INTERNAL_KEY;
  if (!key) return _catCache.data || { products: [], methods: [] };
  try {
    /* Identify as a browser. Cloudflare's bot heuristics 403 unfamiliar user
       agents — that silently killed every Lumise sync earlier in this project —
       and Bot Fight Mode makes it stricter still. Node's default UA is exactly
       what gets challenged, and losing this call means the quote form loses its
       catalogue pricing. */
    const r = await fetch(`https://design.jtees.net/jt-catalog.php?key=${encodeURIComponent(key)}`,
      { headers: { 'User-Agent': JT_SERVER_UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d && d.ok) { _catCache = { at: Date.now(), data: d }; return d; }
    throw new Error('bad payload');
  } catch (err) {
    console.error('catalog fetch failed:', err.message);
    return _catCache.data || { products: [], methods: [] };
  }
}

/** Everything known about one customer, matched across phone and email so a
 *  person quoted by text and one who ordered online resolve to the same record.
 *  Phone matching uses the last 10 digits, since formatting varies wildly. */
async function customerHistory(q) {
  const email = String(q || '').includes('@') ? String(q).trim().toLowerCase() : '';
  const digits = String(q || '').replace(/\D/g, '').slice(-10);
  if (!email && digits.length < 10) return null;

  const { rows } = await pool.query(
    `SELECT * FROM quotes
      WHERE ($1 <> '' AND lower(email) = $1)
         OR ($2 <> '' AND regexp_replace(coalesce(phone,''), '\\D', '', 'g') LIKE '%' || $2)
      ORDER BY created_at DESC`, [email, digits]);
  if (!rows.length) return null;

  const paidRows = rows.filter(r => Number(r.paid_amount || 0) > 0);
  const quoted = rows.reduce((a, r) => a + Number(r.total || r.subtotal || 0), 0);
  const spent = paidRows.reduce((a, r) => a + Number(r.paid_amount || 0), 0);
  const accepted = rows.filter(r => r.accepted_at).length;

  // Per-year, so a glance shows whether they are a repeat buyer or a repeat asker.
  const byYear = {};
  for (const r of rows) {
    const y = new Date(r.created_at).getFullYear();
    byYear[y] = byYear[y] || { quoted: 0, spent: 0, count: 0 };
    byYear[y].quoted += Number(r.total || r.subtotal || 0);
    byYear[y].spent += Number(r.paid_amount || 0);
    byYear[y].count++;
  }

  const name = (rows.find(r => r.name) || {}).name || '';
  return {
    name,
    email: (rows.find(r => r.email) || {}).email || '',
    phone: (rows.find(r => r.phone) || {}).phone || '',
    quotes: rows,
    count: rows.length,
    accepted,
    quoted: round2(quoted),
    spent: round2(spent),
    first: rows[rows.length - 1].created_at,
    last: rows[0].created_at,
    byYear,
  };
}

/* Prior pricing for a returning customer — what keeps a repeat quote consistent. */
app.get('/api/quotes/prior', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 5) return res.json({ found: false });
  const digits = q.replace(/\D/g, '');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE (email <> '' AND lower(email) = lower($1))
           OR ($2 <> '' AND regexp_replace(coalesce(phone,''), '\\D', '', 'g') LIKE '%' || $2)
        ORDER BY created_at DESC LIMIT 25`, [q, digits.slice(-10)]);
    if (!rows.length) return res.json({ found: false });
    const last = rows[0];
    const item = (last.items || [])[0] || {};
    const quoted = rows.reduce((a, r) => a + Number(r.total || r.subtotal || 0), 0);
    // Spent means money actually received, not merely accepted.
    const spent = rows.reduce((a, r) => a + Number(r.paid_amount || 0), 0);

    /* What the last job actually MADE. Repeating a price you lost money on is
       the expensive way to keep a customer, and the margin is only knowable
       here — at the moment the next price is being set. */
    const lastMg = quoteMargin(last);
    const costedRows = rows.filter(r =>
      (Number(r.cost_blanks || 0) + Number(r.cost_supplies || 0) + Number(r.cost_outsourced || 0) + Number(r.cost_shipping || 0)) > 0);
    const avgPct = costedRows.length
      ? Math.round(costedRows.reduce((a, r) => a + (quoteMargin(r).pct || 0), 0) / costedRows.length)
      : null;

    res.json({
      found: true,
      name: last.name || '',
      summary: quoteSummary(last.items),
      unit: item.unit_price != null ? money(item.unit_price) + ' ea' : money(last.total || last.subtotal),
      when: fmtDate(last.created_at),
      count: rows.length,
      lifetime_quoted: money(quoted),
      lifetime_spent: money(spent),
      margin: lastMg.entered
        ? { profit: money(lastMg.profit), pct: lastMg.pct, thin: lastMg.pct < 30 }
        : null,
      avg_pct: avgPct,
      link: `/customer?q=${encodeURIComponent(last.email || last.phone || '')}`,
      // The exact lines they were charged before, so a repeat quote can match.
      lines: (last.items || []).slice(0, 4).map(i => ({
        desc: i.description, qty: i.qty, unit: Number(i.unit_price || 0),
      })),
    });
  } catch (err) {
    console.error('prior lookup failed:', err.message);
    res.json({ found: false });
  }
});

/* Create a quote, then show the ready-to-send message. */
app.post(['/api/quotes', '/api/quotes/:code'], requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const name = [String(b.first_name || '').trim(), String(b.last_name || '').trim()]
      .filter(Boolean).join(' ').slice(0, 120)
      || String(b.name || '').trim().slice(0, 120);
    const phone = String(b.phone || '').trim().slice(0, 40);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);

    const catalog = await getCatalog();

    /* Collect however many item rows the form posted. Any row with a
       description or a quantity counts; a product is optional so a purely
       manual line ("banner, 3ft x 8ft") works exactly as well. */
    const items = [];
    /* Two fields sharing a name arrive as an array. Stringifying one silently
       merges every value into a single field and turns a price into NaN, which
       renders as $0.00 — so read only the first value. */
    const one = (v) => (Array.isArray(v) ? v[0] : v);
    for (let i = 0; i < 40; i++) {
      const desc = String(one(b['description' + i]) || '').trim();
      const qty = parseInt(one(b['qty' + i]), 10) || 0;
      const prod = catalog.products.find(p => String(p.id) === String(one(b['product' + i])));
      const method = catalog.methods.find(m => String(m.id) === String(one(b['method' + i])));
      /* Count a row as real if ANY field was filled in. Previously a line with
         only a price (or only a size mix) was silently dropped, which for a
         single-line quote produced "Add at least one item" and lost the work. */
      const priceTyped = String(one(b['unit_price' + i]) || '').trim() !== '';
      const sizeTyped = String(one(b['sizemix' + i]) || '').trim() !== '';
      const detailTyped = String(one(b['details' + i]) || '').trim() !== '';
      if (!desc && !qty && !prod && !priceTyped && !sizeTyped && !detailTyped) continue;

      /* Size mix, when the product has sizes. The upcharge those extended sizes
         carry is applied by the pricing engine, from this mix and the product's
         own size table — quoting 24 shirts of which 4 are 2XL is NOT the same
         price as 24 mediums, and forgetting that silently eats the difference
         on every order. */
      let mix = null, sizeQty = 0;
      try {
        const parsed = JSON.parse(one(b['sizemix' + i]) || 'null');
        if (parsed && typeof parsed === 'object') {
          mix = {};
          for (const [sz, n] of Object.entries(parsed)) {
            const c = parseInt(n, 10) || 0;
            if (c <= 0) continue;
            mix[sz] = c;
            sizeQty += c;
          }
          if (!sizeQty) mix = null;
        }
      } catch { mix = null; }

      const q = sizeQty > 0 ? sizeQty : (qty || 1);

      const rawUnit = one(b['unit_price' + i]);

      /* Every chargeable extra on this line, assembled from what was posted but
         PRICED FROM THE SERVER'S OWN TABLE. The form posts which add-ons are on,
         never what they cost, so a tampered request cannot name its own price.
         Each is also checked against the method it applies to, so a digitizing
         fee cannot be attached to a screen-print line. */
      const lineAddons = [];
      const methodTitle = method ? String(method.title || '') : '';
      const isEmb = EMBROIDERY_METHOD_RE.test(methodTitle);
      const isScreen = SCREEN_METHOD_RE.test(methodTitle);
      const garmentDark = String(one(b['dark' + i]) || '') === '1';

      const setupId = String(one(b['setup' + i]) || '').trim();
      if (setupId && isEmb) {
        const d = digitizingOptions(catalog).find((x) => String(x.id) === setupId);
        if (d) lineAddons.push({ code: 'digitizing', label: d.title, kind: 'once', rate: d.price });
      }
      for (const a of addonsFor(methodTitle)) {
        if (a.auto) continue;              // attached by the method itself, below
        if (String(one(b[`addon_${a.code}${i}`]) || '') !== '1') continue;
        lineAddons.push({ code: a.code, label: a.label, kind: a.kind, rate: a.rate });
      }
      /* Screens are not a choice — a screen-print job burns them whether or not
         anyone ticked a box, and the garment colour decides how many. Note the
         rate comes from ADDONS here and never from the posted body: the client
         says only WHICH line and how dark the garment is, never what it costs. */
      for (const a of addonsFor(methodTitle)) {
        if (a.auto !== 'method') continue;
        if (a.code === 'screens' && !SCREEN_FEES_LIVE) continue;
        lineAddons.push({ code: a.code, label: a.label, kind: a.kind, rate: a.rate });
      }

      /* Second print location: the posted stage must be one this method really
         has, or it silently prices from the wrong table. */
      const rawStage = String(one(b['loc' + i]) || '').trim();
      const stage = rawStage === 'both'
        ? 'both'
        : ((rawStage && method && method.positions && method.positions[rawStage]) ? rawStage : '');

      /* Ink colours. Read through the SAME colourCount() the browser ran, so a
         line cannot be previewed at one colour count and saved at another —
         which is the whole reason the rule lives in quotePricingSource(). The
         posted value is only consulted for a method that prices by colour; a
         legacy per-colour method reads its own title and ignores it, so this
         cannot be used to buy a 7-colour job at the 1-colour rate. */
      const colours = colourCount(method, one(b['colors' + i]));

      /* A typed garment price. Supplier costs move between the day a cost was
         recorded and the day a quote is written, so this is a correction, not
         a discount — the volume tiers still apply on top of it. Clamped
         positive so a stray minus cannot invert a line. */
      let blankOverride = Number(one(b['blank_price' + i]));
      if (!Number.isFinite(blankOverride) || blankOverride <= 0) blankOverride = null;

      /* THE price calculation — the same source the browser ran. */
      const priced = priceLine({
        product: prod, method, qty: q, sizeMix: mix, colours,
        stage, addons: lineAddons, blankTiers: BLANK_TIERS,
        /* The garment colour is a pricing INPUT, not a charge: it decides how
           many screens screenCount() asks for. Omit it and a dark job silently
           under-bills by one screen per location. */
        dark: garmentDark,
        blankOverride, unitOverride: rawUnit,
      });

      const manual = priced.manual;
      let unit = priced.unit;
      const lineTotal = priced.lineTotal;
      /* Only a genuine reduction is struck through. A manual price ABOVE list is
         a legitimate quote too (rush, awkward artwork), and showing it crossed
         out would advertise a discount that is really a surcharge. */
      const struck = (manual && prod && priced.listTotal > lineTotal) ? priced.listTotal : null;
      const setupFee = round2(priced.addonLines
        .filter((a) => a.code === 'digitizing').reduce((s, a) => s + a.total, 0));
      const setupLabel = (priced.addonLines.find((a) => a.code === 'digitizing') || {}).label || null;

      let description = desc || (prod ? `${prod.name}${method ? ' — ' + method.title : ''}` : 'Custom item');
      if (mix) description += ` (${Object.entries(mix).map(([sz, n]) => `${n} ${sz}`).join(', ')})`;

      /* Only accept our own Cloudinary URLs — these are rendered straight into
         the customer's page, so an arbitrary URL would let anything be embedded. */
      let images = [];
      try {
        const parsed = JSON.parse(one(b['images' + i]) || '[]');
        if (Array.isArray(parsed)) {
          images = parsed
            .filter(u => typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(u))
            .slice(0, 6);
        }
      } catch { images = []; }
      // Fall back to the catalogue photo so a line is never imageless.
      if (!images.length && prod && prod.thumbnail && /^https?:\/\//.test(prod.thumbnail)) {
        images = [prod.thumbnail];
      }

      items.push({
        description,
        details: String(one(b['details' + i]) || '').trim().slice(0, 300),
        images,
        qty: q,
        /* Blended per-piece rate, EXCLUDING every one-off and extra, so
           qty x each plus the extras equals the line total and each part reads
           honestly. Rolling the extras in would make the decoration itself look
           more expensive than it is. */
        unit_price: round2((lineTotal - priced.addonTotal) / q),
        line_total: lineTotal,
        size_mix: mix,
        size_upcharge: priced.sizeUpcharge,
        /* Every extra, itemised, so the customer's page can name each one
           rather than showing an unexplained difference. */
        addons: priced.addonLines,
        garment_dark: garmentDark || null,
        stage: stage || null,
        /* The ink count this line was priced on, kept ONLY for the method that
           has to be asked for it. A legacy per-colour method's count is its
           title; a second copy here is one that can go stale against it. */
        colours: (method && method.type === 'color') ? colours : null,
        /* The typed garment price, kept so re-editing shows what was used
           rather than silently reverting to a catalogue figure known to be
           stale. */
        blank_price: blankOverride,
        /* Kept for the quotes already saved with these fields — the customer
           page and the edit form still read them when `addons` is absent. */
        setup_fee: setupFee || 0,
        setup_label: setupLabel,
        setup_method_id: setupFee ? Number(setupId) : null,
        manual,
        /* What it would have been at catalogue price. Rendered struck through on
           the customer's page when it is higher than what they are being asked
           to pay, so an override reads as the discount it is. */
        list_total: struck,
        product_id: prod ? prod.id : null,
        method_id: method ? method.id : null,
      });
    }

    if (!items.length) {
      const backTo = QUOTE_CODE_RE.test(String(req.params.code || '').toUpperCase())
        ? `/quote/${String(req.params.code).toUpperCase()}/edit` : '/quote/new';
      return res.status(400).send(quotePage('Nothing to quote', `
        <div class="card">
          <div class="warn">Nothing was saved — the quote needs at least one item.</div>
          <p class="muted" style="margin-top:8px">Fill in a description, or pick a product and a quantity.
             A price on its own is enough too.</p>
          <p style="margin-top:12px"><a class="btn" href="${backTo}">Go back</a></p>
        </div>`));
    }

    const subtotal = round2(items.reduce((a, i) => a + i.line_total, 0));

    /* Discount off the top of the job. Stored as entered so that editing the
       lines later re-applies the same deal; the dollar figure is derived here
       and again in quoteTotals(), which is what the customer page, the deposit
       and the Stripe charge all read. */
    const discountKind = one(b.discount_kind) === 'pct' ? 'pct' : 'amt';
    let discountValue = Number(one(b.discount_value));
    if (!Number.isFinite(discountValue) || discountValue < 0) discountValue = 0;
    if (discountKind === 'pct') discountValue = Math.min(discountValue, 100);
    const discountNote = String(one(b.discount_note) || '').trim().slice(0, 120);
    const discount = quoteDiscount(subtotal, discountKind, discountValue);
    const net = round2(subtotal - discount);

    const taxable = b.taxable === '1' || b.taxable === 'on' || b.taxable === true;
    const tax = quoteTax(net, taxable);
    const total = round2(net + tax);
    const deposit = depositFor(total);

    const days = Math.max(1, parseInt(b.valid_days, 10) || 14);
    const validUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const neededBy = String(b.needed_by || '').trim() || null;

    const editing = String(req.params.code || '').toUpperCase();
    let rows;

    if (QUOTE_CODE_RE.test(editing)) {
      /* Edit in place. The code never changes, so the link the customer already
         has updates itself — no need to re-send unless June wants to. Clearing
         change_request marks the request as handled. */
      ({ rows } = await pool.query(
        `UPDATE quotes SET name=$2, phone=$3, email=$4, items=$5, subtotal=$6, tax=$7,
                total=$8, deposit=$9, notes=$10, valid_until=$11, needed_by=$12,
                discount_kind=$13, discount_value=$14, discount_note=$15,
                change_request=NULL, revision=COALESCE(revision,1)+1,
                status = CASE WHEN accepted_at IS NULL THEN 'sent' ELSE status END
          WHERE code=$1 RETURNING *`,
        [editing, name, phone, email, JSON.stringify(items), subtotal, tax, total, deposit,
         String(b.notes || '').trim().slice(0, 2000), validUntil, neededBy,
         discountKind, discountValue, discountNote || null]));
      if (!rows.length) {
        return res.status(404).send(quotePage('Not found',
          `<div class="card"><div class="warn">That quote no longer exists.</div>
           <a class="btn btn-ghost" href="/quotes">All quotes</a></div>`));
      }
    } else {
      let code = newQuoteCode();
      for (let i = 0; i < 5; i++) {
        const { rows: dup } = await pool.query('SELECT 1 FROM quotes WHERE code=$1', [code]);
        if (!dup.length) break;
        code = newQuoteCode();
      }
      ({ rows } = await pool.query(
        `INSERT INTO quotes (code,name,phone,email,items,subtotal,tax,total,deposit,notes,status,valid_until,needed_by,
                             discount_kind,discount_value,discount_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sent',$11,$12,$13,$14,$15) RETURNING *`,
        [code, name, phone, email, JSON.stringify(items), subtotal, tax, total, deposit,
         String(b.notes || '').trim().slice(0, 2000), validUntil, neededBy,
         discountKind, discountValue, discountNote || null]));
    }

    const q = rows[0];
    const code = q.code;

    syncQuoteToBrevo(q).then(ids => {
      if (ids.contactId || ids.dealId) {
        pool.query('UPDATE quotes SET brevo_contact_id=$1, brevo_deal_id=$2 WHERE id=$3',
          [ids.contactId, ids.dealId, q.id]).catch(() => {});
      }
      // After the contact exists, so the attributes land on a real record.
      syncQuoteContact(q, 'jt_quote_sent').catch(() => {});
    }).catch(() => {});
    syncQuoteToLumise(q).catch(() => {});

    const msgs = quoteMessages(q);
    const digits = phone.replace(/[^0-9+]/g, '');
    const smsHref = digits
      ? `sms:${digits}${/iPhone|iPad|Mac/.test(req.get('user-agent') || '') ? '&' : '?'}body=${encodeURIComponent(msgs.initial)}`
      : '';

    res.send(quotePage('Quote ready', `
      <h1>Quote ${escEmail(code)}${q.revision > 1 ? ` <span class="muted" style="font-size:14px">rev ${q.revision}</span>` : ''}</h1>
      <div class="sub">${escEmail(name || phone || email || 'No contact on file')} &middot; ${money(total)}
        &middot; deposit ${money(deposit)} &middot; good through ${fmtDate(validUntil)}</div>
      <div class="card">
        <div class="msg" id="m">${escEmail(msgs.initial)}</div>
        <div class="row">
          <button type="button" onclick="cp()">Copy message</button>
          ${smsHref ? `<a class="btn btn-ghost" href="${escEmail(smsHref)}">Open in Messages</a>` : ''}
        </div>
        <p class="muted" style="margin-top:10px">They see: <a href="${quoteLink(code)}">${quoteLink(code)}</a></p>
      </div>
      <div class="card">
        <a class="btn btn-ghost" href="/quote/${code}/edit">Edit this quote</a>
        ${(phone || email) ? `<a class="btn btn-ghost" href="/q/${code}/vcard">Save to contacts</a>` : ''}
        <a class="btn btn-ghost" href="/quote/new">Another quote</a>
        <a class="btn btn-ghost" href="/quotes">All quotes</a>
      </div>
      <script>
        function cp(){
          var t=document.getElementById('m').innerText;
          (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject())
            .then(function(){alert('Message copied — paste it into a text.');})
            .catch(function(){
              var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);
              a.select();document.execCommand('copy');a.remove();alert('Message copied.');
            });
        }
      </script>
    `));
  } catch (err) {
    console.error('create quote failed:', err.message);
    res.status(500).send(quotePage('Something went wrong',
      `<div class="card"><div class="warn">The quote could not be saved. Please try again.</div>
       <a class="btn btn-ghost" href="/quote/new">Back</a></div>`));
  }
});

/* What the customer opens. Public, no login. Reads like an invoice. */
app.get('/q/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const friendly = (msg) => res.status(404).send(quotePage('Quote not found', `
    <div class="card"><h1>We couldn't find that quote</h1>
    <p class="muted" style="margin-top:8px">${msg}</p>
    <p style="margin-top:14px"><a class="btn" href="tel:+17738491854">Call ${SHOP_SIGNER}</a></p></div>`));
  if (!QUOTE_CODE_RE.test(code)) return friendly('That link looks incomplete — please check the text message.');

  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return friendly('It may have been removed. Text or call and we will resend it.');
    const q = rows[0];

    if (!q.viewed_at) {
      pool.query(`UPDATE quotes SET viewed_at=NOW(),
                  status=CASE WHEN status='sent' THEN 'viewed' ELSE status END WHERE id=$1`, [q.id]).catch(() => {});
    }

    const t = quoteTotals(q);
    const expired = q.valid_until && new Date(q.valid_until) < new Date(new Date().toDateString());
    const accepted = !!q.accepted_at;
    const paid = Number(q.paid_amount || 0) > 0;
    const balanceDue = round2(Math.max(0, Number(t.total) - Number(q.paid_amount || 0)));
    const eta = deliveryEstimate(q.accepted_at ? new Date(q.accepted_at) : new Date());
    /* A DATE column has no time, so converting it through a timezone shifts it
       a day backwards (2026-08-20 rendered as Aug 19). Format the calendar date
       literally; only real timestamps get timezone treatment. */
    const dayFmt = (d) => {
      if (!d) return '';
      const iso = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m) return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const lines = (q.items || []).map(i => {
      const imgs = (i.images || []).filter(u => /^https:\/\//.test(u));
      const gallery = imgs.length ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          ${imgs.map(u => `<a href="${escEmail(u)}" target="_blank" rel="noopener">
            <img src="${escEmail(u)}" alt="" loading="lazy"
                 style="width:74px;height:74px;object-fit:cover;border-radius:8px;border:1px solid #e3e8f2;background:#fff"></a>`).join('')}
        </div>` : '';
      return `
      <tr>
        <td>
          ${escEmail(i.description)}
          ${i.details ? `<div class="muted" style="font-size:13px;margin-top:3px">${escEmail(i.details)}</div>` : ''}
          ${addonNotes(i)}
          ${gallery}
        </td>
        <td class="num">${i.qty}</td>
        <td class="num">${Number(i.list_total) > Number(i.line_total)
          ? `<span style="color:#9aa3b2;text-decoration:line-through">${money(Number(i.list_total) / i.qty)}</span><br>${money(i.unit_price)}`
          : money(i.unit_price)}</td>
        <td class="num">${Number(i.list_total) > Number(i.line_total)
          ? `<span style="color:#9aa3b2;text-decoration:line-through">${money(i.list_total)}</span><br>
             <b style="color:#166534">${money(i.line_total)}</b>`
          : money(i.line_total)}</td>
      </tr>`;
    }).join('');

    res.send(quotePage(`Your quote from ${SHOP_NAME}`, `
      <div class="card">
        <h1>${SHOP_NAME}</h1>
        <div class="sub">Quote ${escEmail(q.code)} &middot; ${fmtDate(q.created_at)}${q.name ? ' &middot; for ' + escEmail(q.name) : ''}</div>

        ${paid ? `<div class="ok"><b>Payment received — ${money(q.paid_amount)}.</b> You're on the schedule. ${SHOP_SIGNER} will follow up with a proof.${
            balanceDue > 0 ? ` A balance of <b>${money(balanceDue)}</b> is due ${BALANCE_WHEN}.` : ' Paid in full — nothing further to pay.'}</div>`
          : accepted ? `<div class="ok"><b>Accepted — thank you!</b> Choose how you'd like to pay the deposit below.</div>` : ''}
        ${(!accepted && expired) ? `<div class="warn">This quote has expired, but prices usually still stand — just text and we'll refresh it.</div>` : ''}

        <table class="items"><thead><tr>
          <th>Item</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Amount</th>
        </tr></thead><tbody>
          ${lines}
          <tr><td colspan="3" class="num muted" style="padding-top:12px">Subtotal</td>
              <td class="num" style="padding-top:12px">${money(t.subtotal)}</td></tr>
          ${t.discount > 0 ? `<tr><td colspan="3" class="num" style="color:#166534">
              ${q.discount_note ? escEmail(q.discount_note) : 'Discount'}${
                q.discount_kind === 'pct' ? ` (${Number(q.discount_value)}% off)` : ''}</td>
              <td class="num" style="color:#166534">&minus;${money(t.discount)}</td></tr>` : ''}
          ${t.tax > 0 ? `<tr><td colspan="3" class="num muted">Sales tax</td><td class="num">${money(t.tax)}</td></tr>` : ''}
          <tr><td colspan="3" class="num tot">Total</td><td class="num tot">${money(t.total)}</td></tr>
          ${!paid ? `<tr><td colspan="3" class="num" style="color:#1848B8;font-weight:700">
              ${t.deposit >= t.total ? 'Due now (paid in full)' : 'Deposit to start (50%)'}</td>
              <td class="num" style="color:#1848B8;font-weight:700">${money(t.deposit)}</td></tr>` : `
            <tr><td colspan="3" class="num muted">Paid ${q.paid_at ? fmtDate(q.paid_at) : ''}</td>
                <td class="num" style="color:#166534">&minus;${money(q.paid_amount)}</td></tr>
            ${balanceDue > 0 ? `<tr><td colspan="3" class="num" style="color:#1848B8;font-weight:700">Balance due</td>
                <td class="num" style="color:#1848B8;font-weight:700">${money(balanceDue)}</td></tr>` : ''}`}
        </tbody></table>

        ${q.notes ? `<p class="muted" style="margin-top:12px">${escEmail(q.notes)}</p>` : ''}

        <div style="margin-top:16px;border-top:1px solid #eef1f8;padding-top:12px">
          ${q.needed_by ? `<p class="muted"><b>You need it by:</b> ${dayFmt(q.needed_by)}</p>` : ''}
          <p class="muted"><b>Estimated:</b> ready ${dayFmt(eta.ready)}, delivered ${dayFmt(eta.deliver_from)}–${dayFmt(eta.deliver_to)}
            ${accepted ? '' : ' once the deposit is in'}.</p>
          ${q.valid_until ? `<p class="muted">Quote good through ${fmtDate(q.valid_until)}.</p>` : ''}
        </div>
      </div>

      ${(paid && balanceDue > 0) ? `
      <div class="card">
        <h1 style="font-size:18px">Balance due — ${money(balanceDue)}</h1>
        <p class="muted" style="margin:6px 0 14px">${money(q.paid_amount)} received, thank you. The rest is due
          ${BALANCE_WHEN}.</p>

        <a class="btn" style="width:100%;margin-bottom:10px" href="/q/${q.code}/pay/balance">
          Card or Apple&nbsp;Pay — ${money(round2(balanceDue + cardFee(balanceDue)))}
        </a>
        <p class="muted" style="margin:-4px 0 14px;font-size:12px">Includes the ${Math.round(CARD_FEE*100)}% card processing fee (${money(cardFee(balanceDue))}).</p>

        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:12px;margin-bottom:10px">
          <b>Zelle — ${money(balanceDue)}</b>
            <span style="background:#1a9c6b;color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;letter-spacing:.04em">SAVE ${money(cardFee(balanceDue))}</span>
            <span class="muted" style="display:block;margin-top:4px;font-size:12.5px">No ${Math.round(CARD_FEE*100)}% card fee.</span>
          <p class="muted" style="margin-top:4px">Send to <b>${escEmail(ZELLE_HANDLE)}</b>, memo <b>${escEmail(q.code)}</b>.<br>
            It will show as <b>${escEmail(ZELLE_NAME)}</b> — that's us.</p>
        </div>
        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:12px">
          <b>Cash on pickup — ${money(balanceDue)}</b> <span class="muted">(no fee)</span>
        </div>
      </div>` : ''}

      ${paid ? '' : accepted ? `
      <div class="card">
        <h1 style="font-size:18px">Pay your ${t.deposit >= t.total ? 'balance' : 'deposit'} — ${money(t.deposit)}</h1>
        <p class="muted" style="margin:6px 0 14px">Whichever is easiest. Nothing else is due until pickup or delivery.</p>

        <a class="btn" style="width:100%;margin-bottom:10px" href="/q/${q.code}/pay/card">
          Card or Apple&nbsp;Pay — ${money(round2(t.deposit + cardFee(t.deposit)))}
        </a>
        <p class="muted" style="margin:-4px 0 14px;font-size:12px">Includes the ${Math.round(CARD_FEE*100)}% card processing fee (${money(cardFee(t.deposit))}).</p>

        <div style="border:2px solid #1a9c6b;border-radius:10px;padding:12px;margin-bottom:10px;background:#f2fbf7">
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <b>Zelle — ${money(t.deposit)}</b>
            <span style="background:#1a9c6b;color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;letter-spacing:.04em">SAVE ${money(cardFee(t.deposit))}</span>
          </div>
          <p class="muted" style="margin-top:5px">No ${Math.round(CARD_FEE*100)}% card fee — you pay the quoted
            ${money(t.deposit)} instead of ${money(round2(t.deposit + cardFee(t.deposit)))}.</p>
          <p class="muted" style="margin-top:6px">Send to <b>${escEmail(ZELLE_HANDLE)}</b> and put <b>${escEmail(q.code)}</b> in the memo.<br>
            It will show as <b>${escEmail(ZELLE_NAME)}</b> — that's us.</p>
        </div>
        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:12px">
          <b>Cash in person — ${money(t.deposit)}</b> <span class="muted">(no fee)</span>
          <p class="muted" style="margin-top:4px">Text ${SHOP_SIGNER} at ${SHOP_PHONE} to arrange.</p>
        </div>
      </div>` : `
      <div class="card">
        <form method="POST" action="/q/${q.code}/accept">
          ${!q.name ? `
          <div class="row">
            <div><label>First name</label><input name="first_name" required autocomplete="given-name"></div>
            <div><label>Last name</label><input name="last_name" autocomplete="family-name"></div>
          </div>` : ''}
          ${!q.email ? `<label>Email <span style="text-transform:none;font-weight:400">(optional — for your receipt)</span></label>
            <input type="email" name="email" autocomplete="email">` : ''}
          ${!q.phone ? `<label>Mobile <span style="text-transform:none;font-weight:400">(optional)</span></label>
            <input type="tel" name="phone" autocomplete="tel">` : ''}
          <label>When do you need it? <span style="text-transform:none;font-weight:400">(optional)</span></label>
          <input type="date" name="needed_by" value="${q.needed_by ? String(q.needed_by).slice(0,10) : ''}">
          <button type="submit" style="width:100%;margin-top:14px">Accept &amp; choose payment</button>
        </form>
        <p class="muted" style="margin-top:10px;text-align:center">Nothing is charged yet — you'll pick how to pay next.</p>

        <!-- Shown BEFORE accepting: how they pay changes what they pay, so
             hiding this until afterwards meant the cheaper option arrived too
             late to be useful. -->
        <div style="border-top:1px solid #e3e8f2;margin-top:14px;padding-top:12px">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">How you can pay</div>
          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:8px;flex-wrap:wrap">
            <span><b>Zelle or cash</b> — ${money(t.deposit)}</span>
            <span style="background:#1a9c6b;color:#fff;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;letter-spacing:.04em">SAVE ${money(cardFee(t.deposit))}</span>
          </div>
          <div class="muted" style="margin-top:6px">Card or Apple&nbsp;Pay — ${money(round2(t.deposit + cardFee(t.deposit)))}
            <span style="font-size:12.5px">(includes the ${Math.round(CARD_FEE*100)}% card fee)</span></div>
        </div>
      </div>`}

      ${(paid || accepted) ? '' : `
      <div class="card">
        <b style="color:#0B1F4B">Need something changed?</b>
        <p class="muted" style="margin:4px 0 10px">Quantities, sizes, colours, artwork — just say the word.
          ${SHOP_SIGNER} updates the quote and <b>this same link refreshes</b>, so there is nothing new to open.</p>
        <form method="POST" action="/q/${q.code}/changes">
          <textarea name="message" rows="3" required
            placeholder="e.g. make it 36 instead of 24, or navy rather than black"></textarea>
          <button type="submit" class="btn-ghost" style="width:100%;margin-top:10px">Send to ${SHOP_SIGNER}</button>
        </form>
      </div>`}

      ${(paid || !accepted) ? '' : `
      <div class="card">
        <b style="color:#0B1F4B">Need a change before we start?</b>
        <p class="muted" style="margin:4px 0 10px">Nothing has been printed yet — tell ${SHOP_SIGNER} and the quote is updated.</p>
        <form method="POST" action="/q/${q.code}/changes">
          <textarea name="message" rows="2" required placeholder="What would you like different?"></textarea>
          <button type="submit" class="btn-ghost" style="width:100%;margin-top:10px">Send to ${SHOP_SIGNER}</button>
        </form>
      </div>`}

      ${q.change_request && !paid ? `
      <div class="card"><div class="ok">Change requested — ${SHOP_SIGNER} is updating this quote.
        <div class="muted" style="margin-top:6px">"${escEmail(q.change_request)}"</div></div></div>` : ''}

      ${(paid && balanceDue <= 0) ? '' : reviewStrip()}

      <div class="card" style="text-align:center">
        <p class="muted">Questions? <a href="tel:+17738491854">${SHOP_PHONE}</a> &middot; ${SHOP_SIGNER}</p>
      </div>
    `));
  } catch (err) {
    console.error('view quote failed:', err.message);
    friendly('Something went wrong on our end. Please text us.');
  }
});

/* Card / Apple Pay via Stripe Checkout.
   Uses the REST API directly rather than adding the stripe package — one
   form-encoded POST is all a Checkout Session needs, and Apple Pay + Google Pay
   appear automatically on supported devices with no extra work.
   The card fee is added as its own visible line so nobody feels surprised. */
app.get(['/q/:code/pay/card', '/q/:code/pay/balance'], async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/q/' + encodeURIComponent(code));
  const secret = process.env.STRIPE_SECRET_KEY;

  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return res.redirect('/q/' + code);
    const q = rows[0];
    const t = quoteTotals(q);
    const alreadyPaid = Number(q.paid_amount || 0);
    /* Same route serves the deposit and the balance: charging the deposit when
       it is already paid, or a balance when nothing is owed, would both be
       wrong, so the amount is derived rather than passed in. */
    const wantsBalance = req.path.endsWith('/balance');
    const amount = wantsBalance
      ? round2(Math.max(0, Number(t.total) - alreadyPaid))
      : t.deposit;
    const fee = cardFee(amount);

    if (!secret) return res.redirect('/q/' + code);
    if (!wantsBalance && alreadyPaid > 0) return res.redirect('/q/' + code);
    if (amount <= 0) return res.redirect('/q/' + code);

    /* Stripe refuses anything under $0.50, and the error it returns is opaque
       ("total amount due must add up to at least $0.50 USD") — which surfaced
       to the customer as a bare "card payment unavailable". Catch it here and
       say what is actually wrong. */
    const chargeable = round2(amount + cardFee(amount));
    if (chargeable < 0.5) {
      return res.status(200).send(quotePage('Too small to charge', `
        <div class="card">
          <div class="warn">This quote totals ${money(t.total)}, which is below the ${money(0.5)} minimum
            a card payment can process.</div>
          <p class="muted">Zelle to <b>${escEmail(ZELLE_HANDLE)}</b> or cash works for an amount this small,
             or ask ${SHOP_SIGNER} to update the quote.</p>
          <p style="margin-top:12px"><a class="btn btn-ghost" href="/q/${q.code}">Back to the quote</a></p>
        </div>`));
    }

    const label = wantsBalance
      ? `Remaining balance — quote ${q.code}`
      : (t.deposit >= t.total ? `Payment in full — quote ${q.code}` : `50% deposit — quote ${q.code}`);

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${PUBLIC_BASE_URL}/q/${q.code}/paid?s={CHECKOUT_SESSION_ID}`);
    form.set('metadata[kind]', wantsBalance ? 'balance' : 'deposit');
    form.set('cancel_url', `${PUBLIC_BASE_URL}/q/${q.code}`);
    form.set('client_reference_id', q.code);
    if (q.email) form.set('customer_email', q.email);
    /* Makes Stripe email its own receipt. Worth having even though the app
       sends a "Payment received" note of its own: the Stripe receipt is the
       one with the card's last four and a permanent receipt URL, it is what a
       customer means when they ask for "a receipt", and it does not depend on
       this app being up — which mattered on 2026-08-16, when every email the
       app sent was accepted and silently discarded for three days.

       In live mode receipt_email sends regardless of the Dashboard's
       "Successful payments" toggle, so this is not waiting on a setting. Where
       the address is only collected at Checkout there is nothing to set here,
       and that toggle is what covers those. */
    if (q.email) form.set('payment_intent_data[receipt_email]', q.email);
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', 'usd');
    form.set('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
    form.set('line_items[0][price_data][product_data][name]', label);
    form.set('line_items[1][quantity]', '1');
    form.set('line_items[1][price_data][currency]', 'usd');
    form.set('line_items[1][price_data][unit_amount]', String(Math.round(fee * 100)));
    form.set('line_items[1][price_data][product_data][name]',
             `Card processing fee (${Math.round(CARD_FEE * 100)}%)`);
    form.set('metadata[quote_code]', q.code);
    /* payment_method_types is deliberately NOT set. Omitting it lets Stripe
       show whatever is enabled under Dashboard > Payment methods — Apple Pay and
       Google Pay appear automatically on supported devices, and PayPal, Link,
       Cash App Pay or Klarna can be switched on there without touching code. */
    form.set('automatic_tax[enabled]', 'false');

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secret,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (!r.ok || !d.url) {
      console.error('stripe session failed:', d.error ? d.error.message : r.status);
      /* 200, not 502 — Cloudflare swaps any 5xx for its own error page, so a
         customer clicking "Pay by card" would see a raw gateway error instead
         of being pointed at Zelle. */
      return res.status(200).send(quotePage('Card payment unavailable', `
        <div class="card"><div class="warn">Card payment isn't available right now.</div>
        <p class="muted">Zelle to <b>${escEmail(ZELLE_HANDLE)}</b> works, or text ${SHOP_SIGNER} at ${SHOP_PHONE}.</p>
        <p style="margin-top:12px"><a class="btn btn-ghost" href="/q/${q.code}">Back to the quote</a></p></div>`));
    }

    await pool.query('UPDATE quotes SET stripe_session=$1 WHERE id=$2', [d.id, q.id]).catch(() => {});
    res.redirect(303, d.url);
  } catch (err) {
    console.error('card pay failed:', err.message);
    res.redirect('/q/' + code);
  }
});

/**
 * Bank a completed Stripe Checkout session, and notify exactly once.
 *
 * Called from TWO places that race each other: the browser redirect to
 * /q/:code/paid, and the /webhooks/stripe handler. The unique index on
 * quote_payments.stripe_session decides the winner — the loser gets
 * `duplicate` and sends nothing, so the customer never gets two receipts and
 * the money is never counted twice.
 *
 * Before this existed there was no webhook at all, so a customer who closed
 * the tab after paying was never recorded: one real $34.40 payment sat in
 * Stripe with 0.00 against the quote and nobody was told.
 *
 * `session` is a Stripe Checkout Session object.
 */
/** Operational alert to the shop. Never throws — an alert must not be able to
 *  fail a webhook and cause Stripe to retry a payment that already banked. */
async function alertShop(subject, innerHtml) {
  return sendEmail({
    to: SHOP_EMAIL,
    subject,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px">${innerHtml}</div>`,
  }).catch((e) => console.error('shop alert failed:', e.message));
}

/* A payment Stripe took that the quote ledger did not claim. Never throws —
   an alert must not fail a webhook and make Stripe retry a settled payment. */
async function alertUnbankedPayment(session, reason) {
  try {
    const gross = round2((session.amount_total || 0) / 100);
    const email = session.customer_details?.email || '';
    const name  = session.customer_details?.name || '';

    /* What this money belongs to, in the order the sources are trustworthy.
       The design studio stamps metadata.order_id on both its checkout sessions
       AND its balance Payment Links — and a Payment Link carries no
       client_reference_id at all, so on a balance payment the metadata is the
       only thing that identifies the order. Without reading it the alert would
       say "reference (none)" for exactly the payments hardest to place. */
    const orderId = String(session.metadata?.order_id || '').trim();
    const ref = String(session.client_reference_id || '').trim();
    const label = orderId ? `design studio order #${orderId}`
                : ref     ? `reference ${ref}`
                          : 'no reference';

    /* The charge carries the receipt URL, not the session, so it costs one
       lookup. Best-effort: a missing receipt link must not cost the alert. */
    let receiptUrl = '';
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : null;
    if (pi && process.env.STRIPE_SECRET_KEY) {
      try {
        const r = await fetch(
          `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(pi)}?expand[]=latest_charge`,
          { headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY },
            signal: AbortSignal.timeout(8000) });
        if (r.ok) receiptUrl = (await r.json())?.latest_charge?.receipt_url || '';
      } catch { /* leave it blank */ }
    }

    /* Same floor as a quote payment. These orders live in the designer's own
       database, so this is the only place on this side that ever learns the
       customer's address — and until 2026-08-27 an order could be paid,
       fulfilled and never asked, because the ask depended on a status nobody
       set. */
    if (orderId) {
      queueReviewRequest({
        name, email, product: '', order_ref: orderId,
        days: REVIEW_DAYS_AFTER_PAYMENT(),
      }).catch(() => {});
    }

    const dash = pi ? `https://dashboard.stripe.com/payments/${encodeURIComponent(pi)}` : '';
    await alertShop(`💳 Stripe payment received — ${money(gross)}${orderId ? ` (order #${orderId})` : ref ? ` (ref ${ref})` : ''}`,
      `<h2 style="color:#1848B8">A payment came in outside the quote flow</h2>
       <p><b>${money(gross)}</b>${name ? ` from ${escEmail(name)}` : ''}${email ? ` &lt;${escEmail(email)}&gt;` : ''}.</p>
       <p style="color:#6b7280">This is <b>${escEmail(label)}</b> — not banked against a quote
          (${escEmail(reason)}). Design studio orders keep their own ledger on design.jtees.net;
          this note exists so the money is never only visible in Stripe.</p>
       ${receiptUrl ? `<p><a href="${receiptUrl}">Customer receipt</a> — forward this if they ask for one.</p>` : ''}
       ${dash ? `<p><a href="${dash}">Open in Stripe →</a></p>` : ''}`);
  } catch (e) {
    console.error('unbanked payment alert failed:', e.message);
  }
}

async function bankStripeSession(session) {
  const code = String(session.client_reference_id || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return { ok: false, reason: 'no quote code' };
  if (session.payment_status !== 'paid') return { ok: false, reason: 'not paid' };

  const gross = round2((session.amount_total || 0) / 100);
  const isBalance = (session.metadata || {}).kind === 'balance';

  /* What the customer owes on the quote is the gross MINUS the card surcharge:
     the quote total never included the fee, so banking the gross would leave
     every card-paid quote looking overpaid. The fee is kept on the row so the
     Stripe payout still reconciles. */
  const net = round2(gross / (1 + CARD_FEE));
  const fee = round2(gross - net);

  const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
  if (!rows.length) return { ok: false, reason: 'unknown quote' };

  const res = await recordPayment({
    code, amount: net, fee, method: 'card', source: 'stripe',
    session: session.id,
    pi: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    note: `${isBalance ? 'Balance' : 'Deposit'} via Stripe Checkout` +
          (fee > 0 ? ` (customer paid ${money(gross)} incl. ${money(fee)} card fee)` : ''),
  });

  if (res.duplicate) return { ok: true, duplicate: true };

  await pool.query(
    `UPDATE quotes SET status='accepted', accepted_at=COALESCE(accepted_at,NOW()),
            stripe_session=$2 WHERE code=$1`, [code, session.id]).catch(() => {});

  const q = { ...rows[0], paid_amount: res.paid };
  const stillDue = round2(Math.max(0, Number(q.total) - Number(res.paid)));

  /* The tax inside this payment, said at the moment the money lands. Setting
     it aside is a habit, and a habit needs the prompt at the point of action —
     not a report you have to remember to open. */
  const taxIn = (Number(q.total) > 0 && Number(q.tax) > 0)
    ? round2(Number(q.tax) * (net / Number(q.total))) : 0;

  sendEmail({
    to: SHOP_EMAIL,
    subject: `💳 ${isBalance ? 'Balance' : 'Deposit'} paid — quote ${code}, ${money(gross)}` +
             (taxIn > 0 ? ` (set aside ${money(taxIn)})` : ''),
    html: `<div style="font-family:system-ui,sans-serif"><h2 style="color:#1848B8">Payment received</h2>
      <p>${escEmail(q.name || '')} paid <b>${money(gross)}</b> by card for quote ${code}
         (${isBalance ? 'remaining balance' : 'deposit'}).</p>
      <p style="color:#6b7280">Applied to quote: ${money(res.paid)} of ${money(q.total)}.
         ${fee > 0 ? `Card fee ${money(fee)}.` : ''}
         ${stillDue > 0 ? `Balance outstanding ${money(stillDue)}.` : 'Paid in full.'}</p>
      ${taxIn > 0 ? `<p style="background:#fff8ed;border:1px solid #fde3c0;border-radius:8px;padding:9px 12px;color:#8a5a00;font-size:13px">
         <b>${money(taxIn)}</b> of this is sales tax — set it aside, it is not income.</p>` : ''}
      <p><a href="${quoteLink(code)}">${quoteLink(code)}</a></p></div>`,
  }).catch((e) => console.error(`payment alert to shop FAILED for quote ${code}:`, e.message));

  const to = q.email || session.customer_details?.email;
  if (to) {
    sendEmail({
      to,
      subject: `Payment received — quote ${code}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
        <h2 style="color:#1848B8">Thank you!</h2>
        <p style="color:#374151;line-height:1.6">We've received <b>${money(gross)}</b> for quote ${code}.
          ${stillDue > 0 ? `A balance of <b>${money(stillDue)}</b> remains, due ${BALANCE_WHEN}.`
                         : 'That settles it in full — nothing further to pay.'}</p>
        <p style="color:#374151;line-height:1.6">You're on the schedule — ${SHOP_SIGNER} will follow up
          with an artwork proof and timeline.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_PHONE}</p></div>`,
    }).catch((e) => console.error(`payment receipt to customer FAILED for quote ${code}:`, e.message));
  }

  if (q.brevo_deal_id) {
    brevo.post('/crm/notes', {
      text: `PAYMENT ${money(gross)} by card on quote ${code}. ` +
            (stillDue > 0 ? `Balance ${money(stillDue)}.` : 'Paid in full.'),
      dealIds: [q.brevo_deal_id],
    }).catch(() => {});
    // Moves the deal to Won on full payment, Pending on a deposit.
    syncDealStage(q).catch(() => {});
  }
  // Fires whether or not a deal exists — the contact is what workflows key on.
  syncQuoteContact({ ...q, paid_amount: res.paid },
    stillDue > 0 ? 'jt_deposit_paid' : 'jt_paid_in_full').catch(() => {});

  /* Ask for a review eventually, whatever else happens to this job. Queued on
     a deposit as well as a balance — the dedupe means the second payment on a
     quote does not add a second ask, and marking the job delivered later moves
     this date rather than creating another. */
  queueReviewRequest({
    name: q.name, email: q.email || session.customer_details?.email,
    phone: q.phone,
    /* Quote line items are JSONB with a `description`, not the `name` the
       designer's order payload uses. Naming the thing they bought is what makes
       the ask read as personal rather than automated. */
    product: (Array.isArray(q.items) && q.items[0] && q.items[0].description) || '',
    quote_code: code, days: REVIEW_DAYS_AFTER_PAYMENT(),
  }).catch(() => {});

  return { ok: true, duplicate: false, paid: res.paid };
}

/* ── Stripe payment webhook ───────────────────────────────────────────────────
   Set the endpoint in the Stripe Dashboard to
   https://www.jtees.net/webhooks/stripe  (event: checkout.session.completed)
   and put the signing secret in STRIPE_WEBHOOK_SECRET.

   Verified manually with crypto rather than the stripe SDK, to avoid adding a
   runtime dependency. Stripe's scheme: the Stripe-Signature header carries
   `t=<unix>,v1=<hex hmac>`, where the HMAC is over `<t>.<raw body>`. */
app.post('/webhooks/stripe', async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('Stripe webhook rejected — STRIPE_WEBHOOK_SECRET not set');
    return res.sendStatus(503);
  }
  const header = req.headers['stripe-signature'];
  if (!header) return res.sendStatus(401);

  const parts = String(header).split(',').reduce((acc, kv) => {
    const [k, v] = kv.split('=');
    if (k === 't') acc.t = v;
    if (k === 'v1') acc.v1.push(v);
    return acc;
  }, { t: null, v1: [] });

  if (!parts.t || !parts.v1.length) return res.sendStatus(401);

  // Reject anything older than 5 minutes — a captured request cannot be replayed.
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t)) > 300) {
    console.warn('Stripe webhook rejected — timestamp outside tolerance');
    return res.sendStatus(401);
  }

  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(parts.t + '.'), raw]))
    .digest('hex');

  const valid = parts.v1.some((sig) => {
    try {
      return sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch { return false; }
  });
  if (!valid) {
    console.warn('Stripe webhook signature mismatch — rejected');
    return res.sendStatus(401);
  }

  // Acknowledge immediately; Stripe retries on any non-2xx, and the work below
  // is idempotent anyway.
  res.sendStatus(200);

  try {
    const event = req.body;
    const obj = event.data?.object;
    if (!obj) return;

    switch (event.type) {

      /* Money in. async_payment_succeeded covers the delayed methods (ACH,
         bank debits) where the session completes before the funds clear. */
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const out = await bankStripeSession(obj);
        console.log(`Stripe ${event.type} for ${obj.client_reference_id}: ` +
          (out.duplicate ? 'already banked (redirect won the race)' :
           out.ok ? `banked ${money(out.paid)}` : `skipped — ${out.reason}`));

        /* A completed session that did NOT bank to a quote is still money that
           arrived, and it used to end here as one log line nobody reads.
           That is how the $35.75 payment for order #10 on 2026-08-11 was only
           ever visible by opening the Stripe dashboard: the design studio sends
           client_reference_id as the order number ("10"), QUOTE_CODE_RE wants
           six characters, so it failed the test and fell out of the flow.

           Not banking it is correct — an order is not a quote and has its own
           ledger. Saying nothing is not. Tell the shop, and hand over the
           Stripe receipt URL so a customer asking "where is my receipt" can be
           answered from the email rather than from the dashboard. */
        if (!out.ok && !out.duplicate) await alertUnbankedPayment(obj, out.reason);
        break;
      }

      /* A delayed payment that later FAILED. Without this the quote would sit
         marked paid on money that never arrived. */
      case 'checkout.session.async_payment_failed': {
        const code = String(obj.client_reference_id || '').toUpperCase();
        console.warn(`Stripe async payment FAILED for quote ${code}`);
        await alertShop(`⚠️ Payment failed — quote ${code}`,
          `<p>A delayed (bank) payment for quote <b>${escEmail(code)}</b> failed after checkout.</p>
           <p>Nothing has been banked. If the quote shows as paid, check it.</p>
           <p><a href="${quoteLink(code)}">${quoteLink(code)}</a></p>`);
        break;
      }

      /* Money back out. A refund is a negative ledger row, which is only
         possible because payments are now history rather than one number. */
      case 'charge.refunded': {
        const refunded = round2((obj.amount_refunded || 0) / 100);
        if (!(refunded > 0)) break;
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : null;
        const { rows } = await pool.query(
          `SELECT quote_code, SUM(amount) AS applied, SUM(fee) AS fee
             FROM quote_payments WHERE stripe_pi = $1 AND amount > 0
            GROUP BY quote_code`, [pi]);
        if (!rows.length) {
          console.warn(`Stripe refund ${obj.id} — no matching quote for PI ${pi}`);
          break;
        }
        const code = rows[0].quote_code;
        /* Reverse the same net/fee split the payment used, so a full refund
           returns the quote to exactly zero paid rather than leaving the fee
           behind. */
        const net = round2(refunded / (1 + CARD_FEE));
        const fee = round2(refunded - net);
        const out = await recordPayment({
          code, amount: -net, fee: -fee, method: 'card', kind: 'refund',
          source: 'stripe', pi, extRef: obj.id + ':' + obj.amount_refunded,
          note: `Refund of ${money(refunded)} via Stripe`,
        });
        if (!out.duplicate) {
          console.log(`Stripe refund for ${code}: -${money(net)} (now ${money(out.paid)})`);
          await alertShop(`↩️ Refund — quote ${code}, ${money(refunded)}`,
            `<p>A refund of <b>${money(refunded)}</b> was issued on quote ${escEmail(code)}.</p>
             <p>Applied to quote: −${money(net)}. Now paid: ${money(out.paid)}.</p>
             <p><a href="${quoteLink(code)}">${quoteLink(code)}</a></p>`);
        }
        break;
      }

      /* Chargeback. Deliberately does NOT move money — a dispute is not a
         refund and may be won. It needs a human, fast: Stripe's response
         window is short and missing it forfeits the money automatically. */
      case 'charge.dispute.created': {
        const amt = round2((obj.amount || 0) / 100);
        const pi = typeof obj.payment_intent === 'string' ? obj.payment_intent : null;
        const { rows } = await pool.query(
          `SELECT quote_code FROM quote_payments WHERE stripe_pi = $1 LIMIT 1`, [pi]);
        const code = rows[0]?.quote_code || 'unknown';
        console.warn(`Stripe DISPUTE opened on ${code} for ${money(amt)}`);
        await alertShop(`🚨 Chargeback opened — ${money(amt)} (quote ${code})`,
          `<p>A customer disputed <b>${money(amt)}</b> on quote <b>${escEmail(code)}</b>.</p>
           <p><b>Respond in the Stripe Dashboard before the deadline</b> — an unanswered
              dispute is lost by default, and the amount is already withheld.</p>
           <p>Reason given: ${escEmail(obj.reason || 'not stated')}.</p>
           <p>No money has been changed on the quote; a dispute is not a refund.</p>`);
        break;
      }

      /* The customer opened checkout and never finished. Not an error — it is
         the single best follow-up signal the shop gets. */
      case 'checkout.session.expired': {
        const code = String(obj.client_reference_id || '').toUpperCase();
        if (!QUOTE_CODE_RE.test(code)) break;
        const { rows } = await pool.query(
          `SELECT code,name,total,paid_amount FROM quotes WHERE code=$1`, [code]);
        const q = rows[0];
        // Only worth a nudge if they still owe — an expired session on a
        // fully paid quote is just an abandoned second tab.
        if (!q || round2(Number(q.total) - Number(q.paid_amount || 0)) <= 0) break;
        console.log(`Stripe checkout expired for ${code} — customer did not finish paying`);
        await alertShop(`🛒 Checkout abandoned — quote ${code}`,
          `<p>${escEmail(q.name || 'A customer')} opened the payment page for quote
              <b>${escEmail(code)}</b> and did not finish.</p>
           <p>Still outstanding: <b>${money(round2(Number(q.total) - Number(q.paid_amount || 0)))}</b>.</p>
           <p>Worth a follow-up — they were one click from paying.</p>
           <p><a href="${quoteLink(code)}">${quoteLink(code)}</a></p>`);
        break;
      }

      default:
        // Everything else is subscribed-but-unhandled; log once so an
        // unexpected event type is visible rather than silently dropped.
        console.log(`Stripe webhook ignored: ${event.type}`);
    }
  } catch (err) {
    console.error('Stripe webhook processing failed:', err.message);
  }
});

/* Stripe sends them back here. Confirm against the API rather than trusting
   the redirect — anyone can visit this URL. */
app.get('/q/:code/paid', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const sid = String(req.query.s || '');
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/');
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (secret && sid.startsWith('cs_')) {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`,
        { headers: { 'Authorization': 'Bearer ' + secret }, signal: AbortSignal.timeout(15000) });
      const d = await r.json();
      if (r.ok && d.client_reference_id === code) {
        /* Same code path as the webhook, so the two cannot disagree about the
           amount, the fee split, or who gets emailed. Whichever arrives first
           banks it; the other is discarded by the ext_ref unique index. */
        await bankStripeSession(d);
      }
    }
  } catch (err) {
    console.error('payment confirm failed:', err.message);
  }
  res.redirect('/q/' + code);
});

/* Customer accepts. Idempotent. */
app.post('/q/:code/accept', orderRateLimit, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/q/' + encodeURIComponent(code));
  try {
    const rb = req.body || {};
    const nb = String(rb.needed_by || '').trim() || null;
    /* Details the customer fills in themselves when the quote went out without
       them — common for online and walk-up enquiries. NULLIF keeps existing
       values intact rather than overwriting them with a blank. */
    const cname = [String(rb.first_name || '').trim(), String(rb.last_name || '').trim()]
      .filter(Boolean).join(' ').slice(0, 120) || null;
    const cemail = String(rb.email || '').trim().toLowerCase().slice(0, 200) || null;
    const cphone = String(rb.phone || '').trim().slice(0, 40) || null;

    const { rows } = await pool.query(
      `UPDATE quotes SET accepted_at=NOW(), status='accepted',
              needed_by = COALESCE($2::date, needed_by),
              name  = COALESCE(NULLIF(name,''),  $3),
              email = COALESCE(NULLIF(email,''), $4),
              phone = COALESCE(NULLIF(phone,''), $5)
        WHERE code=$1 AND accepted_at IS NULL RETURNING *`,
      [code, nb, cname, cemail, cphone]);

    if (rows.length) {                       // first acceptance only
      const q = rows[0];
      const msgs = quoteMessages(q);
      const lines = (q.items || []).map(i =>
        `<tr><td style="padding:8px 4px">${escEmail(i.description)}</td>
             <td style="padding:8px 4px;text-align:right">${i.qty}</td>
             <td style="padding:8px 4px;text-align:right">${money(i.line_total)}</td></tr>`).join('');
      const tt = quoteTotals(q);
      /* This row is labelled "Total", so it has to BE the total. It showed the
         subtotal, which merely looked right while tax was the only thing above
         it; a discounted job would state more than the customer is charged. */
      const table = `<table style="width:100%;border-collapse:collapse;margin:12px 0">${lines}
        ${tt.discount > 0 ? `<tr><td colspan="2" style="padding:8px 4px;text-align:right;color:#166534">
          ${q.discount_note ? escEmail(q.discount_note) : 'Discount'}</td>
          <td style="padding:8px 4px;text-align:right;color:#166534">&minus;${money(tt.discount)}</td></tr>` : ''}
        <tr><td colspan="2" style="padding:8px 4px;text-align:right;font-weight:700;border-top:2px solid #111">Total</td>
        <td style="padding:8px 4px;text-align:right;font-weight:700;border-top:2px solid #111">${money(tt.total)}</td></tr></table>`;
      const payBlock = `
        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:14px;margin:14px 0">
          <p style="margin:0 0 6px"><b>${tt.deposit >= tt.total ? 'Payment due' : 'Deposit to start (50%)'}: ${money(tt.deposit)}</b></p>
          <p style="margin:0;color:#6b7280;font-size:14px">
            Card or Apple Pay: <a href="${quoteLink(q.code)}">${quoteLink(q.code)}</a> (adds ${Math.round(CARD_FEE*100)}% processing)<br>
            Zelle to <b>${escEmail(ZELLE_HANDLE)}</b>, memo <b>${q.code}</b> — no fee
              <span style="color:#9ca3af">(shows as ${escEmail(ZELLE_NAME)})</span><br>
            Cash in person — no fee
          </p>
        </div>`;
      if (q.email) {
        sendEmail({
          to: q.email,
          subject: `Thanks — quote ${q.code} accepted`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#1848B8">Thank you!</h2>
            <p style="color:#374151;line-height:1.6">${escEmail(msgs.accepted)}</p>${table}${payBlock}
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657</p></div>`,
        }).catch(e => console.error('accept email failed:', e.message));
      }
      sendEmail({
        to: SHOP_EMAIL,
        replyTo: q.email || undefined,
        subject: `✅ Quote ${q.code} accepted — ${escEmail(q.name || q.phone)} ${money(tt.total)}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#1848B8">Quote accepted</h2>
          <p style="color:#374151"><b>${escEmail(q.name || '')}</b><br>${escEmail(q.phone || '')}<br>${escEmail(q.email || '')}</p>
          ${table}${q.notes ? `<p style="color:#6b7280">${escEmail(q.notes)}</p>` : ''}</div>`,
      }).catch(e => console.error('accept alert failed:', e.message));

      if (q.brevo_deal_id) {
        brevo.post('/crm/notes', {
          text: `QUOTE ${q.code} ACCEPTED ${new Date().toISOString()} — ${money(q.total)}`,
          dealIds: [q.brevo_deal_id],
        }).catch(() => {});
        syncDealStage(q).catch(() => {});
      }
      syncQuoteContact(q, 'jt_quote_accepted').catch(() => {});

      /* The customer may have just given us their name, email or number for the
         first time (common on online and walk-up enquiries), so push the record
         again — otherwise the CRM keeps the blank version forever. */
      if (cname || cemail || cphone) {
        syncQuoteToBrevo(q).catch(() => {});
        syncQuoteToLumise(q).catch(() => {});
      }
    }
    res.redirect('/q/' + code);
  } catch (err) {
    console.error('accept failed:', err.message);
    res.redirect('/q/' + code);
  }
});

/* Customer asks for a change rather than accepting. Keeps the same code so the
   link they already have keeps working once June edits it. */
app.post('/q/:code/changes', orderRateLimit, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/');
  const msg = String((req.body && req.body.message) || '').trim().slice(0, 1000);
  try {
    const { rows } = await pool.query(
      `UPDATE quotes SET change_request=$2, status='changes'
        WHERE code=$1 AND accepted_at IS NULL RETURNING *`, [code, msg]);
    if (rows.length && msg) {
      const q = rows[0];
      sendEmail({
        to: SHOP_EMAIL,
        replyTo: q.email || undefined,
        subject: `✏️ Change requested — quote ${q.code} (${q.name || q.phone || 'customer'})`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#1848B8">They'd like a change</h2>
          <p style="color:#374151"><b>${escEmail(q.name || '')}</b> ${escEmail(q.phone || '')} ${escEmail(q.email || '')}</p>
          <blockquote style="border-left:3px solid #1848B8;padding-left:12px;color:#374151">${escEmail(msg)}</blockquote>
          <p style="margin-top:16px"><a href="${PUBLIC_BASE_URL}/quote/${q.code}/edit"
             style="background:#1848B8;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:700">Edit this quote →</a></p>
          <p style="color:#6b7280;font-size:13px">Their link stays the same — it updates when you save.</p></div>`,
      }).catch(e => console.error('change alert failed:', e.message));
    }
  } catch (err) {
    console.error('change request failed:', err.message);
  }
  res.redirect('/q/' + code);
});

/* Record a payment that arrived outside Stripe — Zelle, cash, a bank transfer.
   Without this a customer who pays by Zelle stays "unpaid" forever, the deposit
   reminder keeps chasing them, and the balance never reflects reality. */
app.post('/quote/:code/mark-paid', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/quotes');
  const b = req.body || {};
  const method = ['zelle', 'cash', 'transfer', 'other'].includes(String(b.method))
    ? String(b.method) : 'other';

  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return res.redirect('/quotes');
    const q = rows[0];
    const t = quoteTotals(q);

    // Blank amount means "they paid what was due" — deposit, or the balance if
    // a deposit is already in.
    const outstanding = round2(Math.max(0, Number(t.total) - Number(q.paid_amount || 0)));
    const suggested = Number(q.paid_amount || 0) > 0 ? outstanding : t.deposit;
    let amount = String(b.amount || '').trim() === '' ? suggested : round2(Number(b.amount));
    if (!(amount > 0)) return res.redirect('/quotes');
    // Never let a typo record more than is owed.
    amount = Math.min(amount, outstanding || amount);

    /* Through the ledger, so a manual payment appears in history and can be
       corrected later. It used to add straight onto quotes.paid_amount, which
       is why a double-click could not be walked back. */
    await recordPayment({
      code, amount, method, source: 'manual',
      note: String(b.note || '').trim().slice(0, 200) || null,
    });

    const { rows: upd } = await pool.query(
      `UPDATE quotes SET status = 'accepted',
              accepted_at = COALESCE(accepted_at, NOW())
        WHERE code = $1 RETURNING *`, [code]);

    const nq = upd[0];
    const stillDue = round2(Math.max(0, Number(nq.total) - Number(nq.paid_amount)));

    if (nq.email) {
      sendEmail({
        to: nq.email,
        subject: `Payment received — quote ${nq.code}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#1848B8">Thank you!</h2>
          <p style="color:#374151;line-height:1.6">We've received <b>${money(amount)}</b> by
            ${escEmail(method)} for quote ${nq.code}.
            ${stillDue > 0 ? `A balance of <b>${money(stillDue)}</b> remains, due ${BALANCE_WHEN}.`
                           : 'That settles it in full — nothing further to pay.'}</p>
          <p style="color:#374151;line-height:1.6">You're on the schedule. ${SHOP_SIGNER} will follow up
            with an artwork proof and timeline.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_PHONE}</p>
        </div>`,
      }).catch(e => console.error('manual payment receipt failed:', e.message));
    }

    if (nq.brevo_deal_id) {
      brevo.post('/crm/notes', {
        text: `PAYMENT ${money(amount)} via ${method} on quote ${nq.code}. ` +
              (stillDue > 0 ? `Balance ${money(stillDue)}.` : 'Paid in full.'),
        dealIds: [nq.brevo_deal_id],
      }).catch(() => {});
      syncDealStage(nq).catch(() => {});
    }
    syncQuoteContact(nq, stillDue > 0 ? 'jt_deposit_paid' : 'jt_paid_in_full').catch(() => {});
  } catch (err) {
    console.error('mark-paid failed:', err.message);
  }
  res.redirect('/quotes');
});

/**
 * Correct a payment. The missing half of mark-paid.
 *
 * Nothing is ever edited or deleted — a correction is a negative row, so the
 * original entry and the reason for the fix both survive. That matters for a
 * payment record: an amount that can be quietly rewritten is not evidence of
 * anything.
 *
 * Modes:
 *   void=<payment id>   reverse exactly that ledger row
 *   amount=<n>          adjust by a signed amount (negative to reduce)
 *   set=<n>             make the running total equal n (writes the difference)
 */
app.post('/quote/:code/correct-payment', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/quotes');
  const b = req.body || {};
  const note = String(b.note || '').trim().slice(0, 200) || 'Manual correction';

  try {
    const { rows: qr } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!qr.length) return res.redirect('/quotes');

    const { rows: cur } = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS paid FROM quote_payments WHERE quote_code=$1`, [code]);
    const paid = round2(Number(cur[0].paid));

    let delta = 0;
    let sourceNote = note;

    if (b.void) {
      const { rows: p } = await pool.query(
        `SELECT * FROM quote_payments WHERE id=$1 AND quote_code=$2`,
        [Number(b.void) || 0, code]);
      if (!p.length) return res.redirect('/quotes');
      delta = -round2(Number(p[0].amount));
      sourceNote = `Voided payment #${p[0].id} (${money(p[0].amount)} ${p[0].method}) — ${note}`;
    } else if (String(b.set || '').trim() !== '') {
      const target = round2(Number(b.set));
      if (!Number.isFinite(target) || target < 0) return res.redirect('/quotes');
      delta = round2(target - paid);
      sourceNote = `Corrected total to ${money(target)} — ${note}`;
    } else {
      delta = round2(Number(b.amount));
      if (!Number.isFinite(delta)) return res.redirect('/quotes');
    }

    if (delta === 0) return res.redirect('/quotes');

    await recordPayment({
      code, amount: delta, method: String(b.method || 'other'),
      kind: 'correction', source: 'manual', note: sourceNote,
    });

    const total = await syncPaidAmount(code);
    console.log(`Payment corrected on ${code}: ${delta > 0 ? '+' : ''}${money(delta)} → ${money(total)}`);

    if (qr[0].brevo_deal_id) {
      brevo.post('/crm/notes', {
        text: `PAYMENT CORRECTION ${delta > 0 ? '+' : ''}${money(delta)} on quote ${code}. ` +
              `Now ${money(total)} of ${money(qr[0].total)}. ${sourceNote}`,
        dealIds: [qr[0].brevo_deal_id],
      }).catch(() => {});
      // A correction can move a deal back out of Won as well as into it.
      syncDealStage({ ...qr[0], paid_amount: total }).catch(() => {});
    }
    syncQuoteContact({ ...qr[0], paid_amount: total }).catch(() => {});
  } catch (err) {
    console.error('correct-payment failed:', err.message);
  }
  res.redirect('/quotes');
});

/**
 * The books: one screen answering "what did this business actually do".
 *
 * Deliberately separate from the quotes board. That page is for running today's
 * work; this one is for the questions an accountant, a lender or a tax return
 * asks — and mixing the two makes both worse.
 *
 * Everything is derived from the payment ledger, so it reconciles with the bank
 * rather than with what was invoiced.
 */
app.get('/books', requireAdmin, async (req, res) => {
  try {
    const year = /^\d{4}$/.test(String(req.query.year || ''))
      ? Number(req.query.year) : new Date().getFullYear();

    const { rows: months } = await pool.query(
      `WITH pay AS (
         SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS period,
                SUM(amount) AS collected, SUM(tax_portion) AS tax, SUM(fee) AS fees
           FROM quote_payments
          WHERE EXTRACT(YEAR FROM created_at) = $1
          GROUP BY 1),
       job AS (
         SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS period,
                COUNT(*) AS jobs,
                SUM(subtotal) AS sales,
                SUM(cost_blanks + cost_supplies + cost_outsourced + cost_shipping) AS costs,
                COUNT(*) FILTER (WHERE (cost_blanks + cost_supplies + cost_outsourced + cost_shipping) > 0) AS costed
           FROM quotes
          WHERE status <> 'expired' AND EXTRACT(YEAR FROM created_at) = $1
          GROUP BY 1)
       SELECT COALESCE(pay.period, job.period) AS period,
              COALESCE(pay.collected,0) AS collected, COALESCE(pay.tax,0) AS tax,
              COALESCE(pay.fees,0) AS fees, COALESCE(job.jobs,0) AS jobs,
              COALESCE(job.sales,0) AS sales, COALESCE(job.costs,0) AS costs,
              COALESCE(job.costed,0) AS costed
         FROM pay FULL OUTER JOIN job ON pay.period = job.period
        ORDER BY 1`, [year]);

    const T = months.reduce((a, m) => ({
      collected: a.collected + Number(m.collected), tax: a.tax + Number(m.tax),
      fees: a.fees + Number(m.fees), sales: a.sales + Number(m.sales),
      costs: a.costs + Number(m.costs), jobs: a.jobs + Number(m.jobs),
      costed: a.costed + Number(m.costed),
    }), { collected: 0, tax: 0, fees: 0, sales: 0, costs: 0, jobs: 0, costed: 0 });

    const { rows: remitted } = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM tax_remittances
        WHERE EXTRACT(YEAR FROM paid_at) = $1`, [year]);
    const pos = await taxPositionByMonth(60);

    /* Overheads by month, and the recent list for the register below. */
    const { rows: expMonths } = await pool.query(
      `SELECT to_char(date_trunc('month', spent_on), 'YYYY-MM') AS period,
              COALESCE(SUM(amount),0) AS total
         FROM expenses WHERE EXTRACT(YEAR FROM spent_on) = $1
        GROUP BY 1`, [year]);
    const expByPeriod = Object.fromEntries(expMonths.map(r => [r.period, Number(r.total)]));
    const { rows: expByCat } = await pool.query(
      `SELECT category, COALESCE(SUM(amount),0) AS total
         FROM expenses WHERE EXTRACT(YEAR FROM spent_on) = $1
        GROUP BY 1 ORDER BY 2 DESC`, [year]);
    const { rows: expList } = await pool.query(
      `SELECT * FROM expenses WHERE EXTRACT(YEAR FROM spent_on) = $1
        ORDER BY spent_on DESC, id DESC LIMIT 40`, [year]);
    const expTotal = round2(expByCat.reduce((s, r) => s + Number(r.total), 0));

    /* Gross profit is what the jobs made. Net is what the business made —
       rent is owed whether or not anybody ordered. */
    const gross = round2(T.sales - T.costs);
    const net = round2(gross - expTotal);
    const pct = T.sales > 0 && T.costs > 0 ? Math.round((gross / T.sales) * 100) : null;
    const netPct = T.sales > 0 ? Math.round((net / T.sales) * 100) : null;
    const gap = T.jobs - T.costed;

    const { rows: years } = await pool.query(
      `SELECT DISTINCT EXTRACT(YEAR FROM created_at)::int AS y FROM quotes ORDER BY y DESC`);

    const tile = (label, value, colour, sub) => `
      <div style="flex:1 1 150px;background:#fff;border:1px solid #e3e8f2;border-radius:10px;padding:12px">
        <div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">${label}</div>
        <div style="font-size:22px;font-weight:700;color:${colour || '#111827'};margin-top:2px">${value}</div>
        ${sub ? `<div class="muted" style="font-size:11.5px;margin-top:2px">${sub}</div>` : ''}</div>`;

    res.send(adminPage('Books', `<h1>Books — ${year}</h1>
      <div class="sub">${years.map(y => y.y === year
        ? `<b>${y.y}</b>` : `<a href="/books?year=${y.y}" style="color:#1848B8">${y.y}</a>`).join(' &middot; ')}
        &middot; <a href="/quotes" style="color:#1848B8">back to jobs</a></div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
        ${tile('Sales (ex tax)', money(T.sales), '#111827', `${T.jobs} job${T.jobs === 1 ? '' : 's'} · collected ${money(T.collected)}`)}
        ${tile('Job costs', T.costs > 0 ? money(T.costs) : '—', '#111827', gap > 0 ? `${gap} job${gap === 1 ? '' : 's'} not costed` : 'all jobs costed')}
        ${tile('Overheads', expTotal > 0 ? money(expTotal) : '—', '#111827', 'rent, materials, everything else')}
        ${tile('Net profit', (pct === null && expTotal === 0) ? '—' : money(net),
               (pct === null && expTotal === 0) ? '#9ca3af' : net < 0 ? '#b91c1c' : '#047857',
               (pct === null && expTotal === 0) ? 'enter costs to see this'
                 : `gross ${money(gross)} − overheads${netPct !== null ? ` · ${netPct}%` : ''}`)}
      </div>

      <div class="card">
        <h2 style="margin:0 0 8px;font-size:16px">Month by month</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="color:#6b7280;font-size:11px;letter-spacing:.05em;text-transform:uppercase">
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb">Month</td>
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb;text-align:right">Collected</td>
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb;text-align:right">Sales</td>
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb;text-align:right">Job costs</td>
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb;text-align:right">Overheads</td>
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb;text-align:right">Net</td>
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb;text-align:right">Sales tax</td>
            <td style="padding:5px 0;border-bottom:1px solid #e5e7eb;text-align:right">Card fees</td>
          </tr>
          ${(() => {
            /* Months with overheads but no jobs still have to appear — a month
               where rent went out and nothing came in is exactly the month you
               need to see. */
            const periods = [...new Set([...months.map(m => m.period), ...Object.keys(expByPeriod)])].sort();
            const byPeriod = Object.fromEntries(months.map(m => [m.period, m]));
            return periods.map(period => {
              const m = byPeriod[period] || { period, collected: 0, sales: 0, costs: 0, tax: 0, fees: 0, jobs: 0, costed: 0 };
              const ov = expByPeriod[period] || 0;
              const g = round2(Number(m.sales) - Number(m.costs));
              const n = round2(g - ov);
              const known = Number(m.costs) > 0 || ov > 0;
              return `<tr>
                <td style="padding:6px 0">${periodLabel(period)}</td>
                <td style="padding:6px 0;text-align:right;font-variant-numeric:tabular-nums">${money(m.collected)}</td>
                <td style="padding:6px 0;text-align:right;color:#6b7280;font-variant-numeric:tabular-nums">${money(m.sales)}</td>
                <td style="padding:6px 0;text-align:right;color:#6b7280;font-variant-numeric:tabular-nums">${Number(m.costs) > 0 ? money(m.costs) : '—'}</td>
                <td style="padding:6px 0;text-align:right;color:#6b7280;font-variant-numeric:tabular-nums">${ov > 0 ? money(ov) : '—'}</td>
                <td style="padding:6px 0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums;color:${!known ? '#9ca3af' : n < 0 ? '#b91c1c' : '#047857'}">${!known ? '—' : money(n)}${Number(m.costed) < Number(m.jobs) && Number(m.costs) > 0 ? '<span style="color:#b45309">*</span>' : ''}</td>
                <td style="padding:6px 0;text-align:right;color:#8a5a00;font-variant-numeric:tabular-nums">${money(m.tax)}</td>
                <td style="padding:6px 0;text-align:right;color:#9ca3af;font-variant-numeric:tabular-nums">${money(m.fees)}</td>
              </tr>`; }).join('');
          })() || '<tr><td colspan="8" style="padding:10px 0;color:#9ca3af">Nothing recorded for this year.</td></tr>'}
          <tr style="font-weight:700">
            <td style="padding:8px 0;border-top:2px solid #111827">Total</td>
            <td style="padding:8px 0;border-top:2px solid #111827;text-align:right;font-variant-numeric:tabular-nums">${money(T.collected)}</td>
            <td style="padding:8px 0;border-top:2px solid #111827;text-align:right;font-variant-numeric:tabular-nums">${money(T.sales)}</td>
            <td style="padding:8px 0;border-top:2px solid #111827;text-align:right;font-variant-numeric:tabular-nums">${T.costs > 0 ? money(T.costs) : '—'}</td>
            <td style="padding:8px 0;border-top:2px solid #111827;text-align:right;font-variant-numeric:tabular-nums">${expTotal > 0 ? money(expTotal) : '—'}</td>
            <td style="padding:8px 0;border-top:2px solid #111827;text-align:right;font-variant-numeric:tabular-nums;color:${net < 0 ? '#b91c1c' : '#047857'}">${(pct === null && expTotal === 0) ? '—' : money(net)}</td>
            <td style="padding:8px 0;border-top:2px solid #111827;text-align:right;font-variant-numeric:tabular-nums">${money(T.tax)}</td>
            <td style="padding:8px 0;border-top:2px solid #111827;text-align:right;font-variant-numeric:tabular-nums">${money(T.fees)}</td>
          </tr>
        </table>
        <div class="muted" style="font-size:11px;margin-top:10px">
          Collected is money that actually arrived, from the payment ledger — it reconciles with the bank.
          Sales is the work priced before tax. Sales tax is the part of what arrived that belongs to the
          state. Card fees are what the processor took. ${gap > 0 ? `<b style="color:#b45309">${gap} job${gap === 1 ? ' has' : 's have'} no costs entered, so profit is overstated.</b>` : ''}
        </div>
      </div>

      ${(() => {
        /* Sales by month against break-even. The job is "am I above or below the
           line", which is a baseline comparison, so the bars are a diverging
           pair (blue above, red below) with the break-even line as the neutral
           midpoint — NOT red/green, which fails colorblind separation outright
           (deutan dE 4.1; blue-red scores 22.4). Colour is never the only cue:
           every bar is direct-labelled and the axis carries the figure. */
        const monthsWithSales = months.filter(m => Number(m.sales) > 0).length || 1;
        const recurring = round2(expList.filter(e => e.recurs).reduce((a, e) => a + Number(e.amount), 0));
        const marginPct = (T.sales > 0 && T.costs > 0) ? (T.sales - T.costs) / T.sales : null;
        const be = marginPct && marginPct > 0 ? round2(recurring / marginPct) : null;

        const series = months.map(m => ({ period: m.period, sales: Number(m.sales) }));
        if (!series.length) return '';

        const W = 720, H = 210, PL = 58, PR = 16, PT = 14, PB = 30;
        const iw = W - PL - PR, ih = H - PT - PB;
        const peak = Math.max(...series.map(d => d.sales), be || 0, 1);
        const top = Math.ceil(peak * 1.15 / 100) * 100 || 100;
        const y = v => PT + ih - (v / top) * ih;
        const bw = Math.min(56, iw / series.length * 0.6);
        const step = iw / series.length;
        const beY = be ? y(be) : null;

        // Gridlines at round numbers, recessive so the data stays forward.
        const ticks = [0, top / 2, top];

        return `<div class="card" style="margin-top:14px">
          <h2 style="margin:0 0 2px;font-size:16px">Sales against break-even</h2>
          <div class="muted" style="font-size:12px;margin-bottom:10px">
            ${be ? `Break-even is <b>${money(be)}</b> a month — fixed costs of ${money(recurring)} at your ${Math.round(marginPct*100)}% margin.`
                 : 'Enter job costs and monthly overheads to see the break-even line.'}</div>
          <div style="overflow-x:auto">
          <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block"
               role="img" aria-label="Monthly sales compared with break-even">
            ${ticks.map(t => `
              <line x1="${PL}" x2="${W-PR}" y1="${y(t)}" y2="${y(t)}" stroke="#e9edf4" stroke-width="1"/>
              <text x="${PL-8}" y="${y(t)+4}" text-anchor="end" font-size="10.5" fill="#8a97ad">${money(t).replace('.00','')}</text>`).join('')}
            ${series.map((d, i) => {
              const x = PL + step * i + (step - bw) / 2;
              const below = be !== null && d.sales < be;
              const h = Math.max(0, ih + PT - y(d.sales));
              return `
              <rect x="${x}" y="${y(d.sales)}" width="${bw}" height="${h}" rx="4"
                    fill="${below ? '#d03b3b' : '#1848B8'}">
                <title>${periodLabel(d.period)}: ${money(d.sales)}${be ? (below ? ` — ${money(round2(be-d.sales))} below break-even` : ` — ${money(round2(d.sales-be))} above`) : ''}</title>
              </rect>
              <text x="${x + bw/2}" y="${y(d.sales) - 6}" text-anchor="middle" font-size="11" font-weight="700"
                    fill="${below ? '#a32f2f' : '#123a95'}">${money(d.sales).replace('.00','')}</text>
              <text x="${x + bw/2}" y="${H-10}" text-anchor="middle" font-size="10.5" fill="#8a97ad">${periodLabel(d.period).replace(' 20', " '")}</text>`;
            }).join('')}
            ${beY !== null ? `
              <line x1="${PL}" x2="${W-PR}" y1="${beY}" y2="${beY}" stroke="#5a6a86" stroke-width="2" stroke-dasharray="5 4"/>
              <text x="${W-PR}" y="${beY-6}" text-anchor="end" font-size="10.5" font-weight="700" fill="#5a6a86">break-even ${money(be).replace('.00','')}</text>` : ''}
          </svg></div>
          <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:#5a6a86">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#1848B8;margin-right:5px"></span>covers fixed costs</span>
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#d03b3b;margin-right:5px"></span>short of break-even</span>
            <span>${monthsWithSales < 3 ? 'One or two months of trading — the shape gets meaningful from about three.' : ''}</span>
          </div>
        </div>`;
      })()}

      ${(() => {
        /* The point of a books page is a decision, not a number. Everything
           here is derived from what is already recorded — no new input. */
        const monthsWithSales = months.filter(m => Number(m.sales) > 0).length || 1;
        const avgSales = round2(T.sales / monthsWithSales);
        const recurring = round2(expList.filter(e => e.recurs)
          .reduce((a, e) => a + Number(e.amount), 0));
        const marginPct = (T.sales > 0 && T.costs > 0) ? (T.sales - T.costs) / T.sales : null;
        // Sales needed to cover fixed costs at the margin actually achieved.
        const breakEven = marginPct && marginPct > 0 ? round2(recurring / marginPct) : null;
        const coverage = breakEven ? Math.round(avgSales / breakEven * 100) : null;
        const bestM = months.reduce((b, m) => (!b || Number(m.sales) > Number(b.sales)) ? m : b, null);

        return `<div class="card" style="margin-top:14px">
          <h2 style="margin:0 0 4px;font-size:16px">What this tells you</h2>
          <div class="muted" style="font-size:12px;margin-bottom:10px">
            Worked out from what is already recorded — nothing extra to type.</div>

          ${recurring > 0 ? `<div style="padding:9px 0;border-bottom:1px solid #f1f4f9">
            <b>Fixed costs are ${money(recurring)} a month.</b>
            ${breakEven
              ? ` At a ${Math.round(marginPct * 100)}% margin you need <b>${money(breakEven)}</b> of sales a month
                  just to cover them.` + (coverage !== null ? `
                  <span style="color:${coverage >= 100 ? '#047857' : '#b91c1c'}">
                  You are averaging ${money(avgSales)} — ${coverage >= 100 ? `${coverage}% of break-even, covered` : `${coverage}% of break-even, short by ${money(round2(breakEven - avgSales))}`}.</span>` : '')
              : ' Enter job costs on a few jobs and this becomes a break-even figure.'}
          </div>` : ''}

          ${marginPct !== null ? `<div style="padding:9px 0;border-bottom:1px solid #f1f4f9">
            <b>You keep ${Math.round(marginPct * 100)}c of every dollar</b> before overheads.
            ${marginPct < 0.35
              ? '<span style="color:#b91c1c">That is thin for print — worth checking whether the blanks price or the quoted price is the problem.</span>'
              : marginPct > 0.6 ? '<span style="color:#047857">Healthy. Room to absorb a rush or a reprint.</span>'
              : 'A normal range for this trade.'}
            ${gap > 0 ? `<span class="muted"> Based on ${T.jobs - gap} of ${T.jobs} jobs — the rest have no costs entered, so the real figure is lower.</span>` : ''}
          </div>` : `<div style="padding:9px 0;border-bottom:1px solid #f1f4f9">
            <b>No job costs entered yet.</b> Until they are, this page can show what came in but not what you kept.
            <a href="/quotes" style="color:#1848B8">Add costs to a job</a> and every figure here fills in.</div>`}

          ${T.tax > 0 ? `<div style="padding:9px 0;border-bottom:1px solid #f1f4f9">
            <b>${money(pos.setAside)} of your balance is not yours.</b>
            It is sales tax held for the state. Treat the bank balance as
            ${money(pos.setAside)} lighter than it reads.
          </div>` : ''}

          ${bestM && Number(bestM.sales) > 0 ? `<div style="padding:9px 0">
            <b>Best month so far: ${periodLabel(bestM.period)}</b> at ${money(bestM.sales)}.
            ${monthsWithSales > 1 ? `Average is ${money(avgSales)}.` : 'One month of trading — the averages get useful from about three.'}
          </div>` : ''}
        </div>`;
      })()}

      <div class="card" style="margin-top:14px">
        <h2 style="margin:0 0 4px;font-size:16px">Overheads</h2>
        <div class="muted" style="font-size:12px;margin-bottom:10px">
          Costs not attached to a job — rent, utilities, materials that are not garments.
          These are what turn "the jobs made money" into "the business made money".</div>

        <form method="POST" action="/expenses" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;
              background:#f7f9fc;border:1px solid #e3e8f2;border-radius:10px;padding:10px">
          <input type="hidden" name="year" value="${year}">
          <input name="spent_on" type="date" value="${new Date().toISOString().slice(0,10)}" style="flex:0 0 145px;padding:7px">
          <select name="category" style="flex:0 0 130px;padding:7px">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
          <input name="amount" type="number" step="0.01" inputmode="decimal" placeholder="0.00" required style="flex:0 0 100px;padding:7px">
          <input name="vendor" placeholder="who" style="flex:1 1 120px;padding:7px">
          <input name="note" placeholder="note" style="flex:1 1 130px;padding:7px">
          <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:4px;white-space:nowrap">
            <input type="checkbox" name="recurs" value="1" style="width:auto"> monthly</label>
          <button type="submit" style="padding:7px 18px;font-size:14px">Add</button>
        </form>

        ${expByCat.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          ${expByCat.map(c => `<div style="background:#f7f9fc;border:1px solid #e3e8f2;border-radius:8px;padding:6px 12px;font-size:12.5px">
            <span style="color:#6b7280">${escEmail(c.category)}</span>
            <b style="margin-left:6px;font-variant-numeric:tabular-nums">${money(c.total)}</b></div>`).join('')}
        </div>` : ''}

        ${expList.length ? `<details style="margin-top:12px" ${expList.length <= 8 ? 'open' : ''}>
          <summary style="cursor:pointer;color:#1848B8;font-size:13px">${expList.length} entr${expList.length === 1 ? 'y' : 'ies'}</summary>
          <div style="margin-top:8px">
            ${expList.map(e => `
            <form method="POST" action="/expenses/${e.id}"
                  style="display:flex;gap:5px;flex-wrap:wrap;align-items:center;padding:5px 0;border-bottom:1px solid #f1f4f9;font-size:12.5px">
              <input type="hidden" name="year" value="${year}">
              <input name="spent_on" type="date" value="${new Date(e.spent_on).toISOString().slice(0,10)}"
                     style="flex:0 0 132px;padding:5px;font-size:12px">
              <select name="category" style="flex:0 0 118px;padding:5px;font-size:12px">
                ${EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${c === e.category ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
              <input name="amount" type="number" step="0.01" inputmode="decimal" value="${Number(e.amount).toFixed(2)}"
                     style="flex:0 0 88px;padding:5px;font-size:12px;text-align:right">
              <input name="vendor" value="${escEmail(e.vendor || '')}" placeholder="who"
                     style="flex:1 1 110px;padding:5px;font-size:12px">
              <input name="note" value="${escEmail(e.note || '')}" placeholder="note"
                     style="flex:1 1 110px;padding:5px;font-size:12px">
              <label style="font-size:11.5px;color:#6b7280;display:flex;align-items:center;gap:3px;white-space:nowrap">
                <input type="checkbox" name="recurs" value="1" ${e.recurs ? 'checked' : ''} style="width:auto"> monthly</label>
              <button type="submit" class="btn btn-ghost" style="padding:5px 11px;font-size:12px">Save</button>
              <button type="submit" formaction="/expenses/${e.id}/delete" title="delete"
                      onclick="return confirm('Delete this ${money(e.amount)} ${escEmail(e.category)} entry?')"
                      style="border:0;background:none;color:#9ca3af;cursor:pointer;font-size:15px;padding:0 4px">×</button>
            </form>`).join('')}
          </div>
        </details>` : '<div class="muted" style="font-size:12.5px;margin-top:10px">Nothing recorded yet.</div>'}

        ${expList.some(e => e.recurs) ? `<form method="POST" action="/expenses/roll" style="margin-top:10px">
          <button type="submit" class="btn btn-ghost" style="padding:6px 14px;font-size:12.5px">Roll monthly costs into this month</button>
          <span class="muted" style="font-size:11px;margin-left:8px">Copies last month's recurring entries. Skips any category already present.</span>
        </form>` : ''}
      </div>

      <div class="card" style="margin-top:14px">
        <h2 style="margin:0 0 8px;font-size:16px">Sales tax position</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${tile('Collected in ' + year, money(T.tax), '#8a5a00')}
          ${tile('Remitted in ' + year, money(remitted[0].total), '#047857')}
          ${tile('Held right now', money(pos.setAside),
                 pos.setAside > 0 ? '#b45309' : '#047857', 'across all periods')}
        </div>
        <div class="muted" style="font-size:11px;margin-top:10px">
          Held right now spans every period, not just ${year} — it is what should be in the bank today.
          <a href="/tax.csv" style="color:#1848B8">Download the payment-level detail</a>.
        </div>
      </div>`, 'money'));
  } catch (err) {
    console.error('books failed:', err.message);
    res.status(500).send('error');
  }
});

/* The categories a print shop actually spends on. A fixed list beats free text:
   a category typed three different ways cannot be totalled. */
const EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Materials', 'Equipment',
  'Software', 'Insurance', 'Marketing', 'Vehicle', 'Fees', 'Other'];

/* Record an overhead. */
app.post('/expenses', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const amount = round2(Number(b.amount));
  const category = EXPENSE_CATEGORIES.includes(String(b.category)) ? String(b.category) : 'Other';
  if (!(amount > 0)) return res.redirect('/books');
  try {
    await pool.query(
      `INSERT INTO expenses (spent_on, category, amount, vendor, note, recurs)
       VALUES (COALESCE($1::date, CURRENT_DATE), $2, $3, $4, $5, $6)`,
      [String(b.spent_on || '').trim() || null, category, amount,
       String(b.vendor || '').trim().slice(0, 80) || null,
       String(b.note || '').trim().slice(0, 200) || null,
       String(b.recurs || '') === '1']);
  } catch (err) {
    console.error('expense insert failed:', err.message);
  }
  res.redirect('/books' + (b.year ? `?year=${encodeURIComponent(b.year)}` : ''));
});

/* Edit one in place. Overheads are typed by hand, so a wrong figure should be
   correctable where it is shown — unlike payments, where history is evidence
   and a correction has to be a new row. */
app.post('/expenses/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id) || 0;
  const b = req.body || {};
  const amount = round2(Number(b.amount));
  const category = EXPENSE_CATEGORIES.includes(String(b.category)) ? String(b.category) : null;
  if (!id || !(amount > 0)) return res.redirect('/books');
  try {
    await pool.query(
      `UPDATE expenses SET spent_on = COALESCE($2::date, spent_on),
                           category = COALESCE($3, category),
                           amount   = $4,
                           vendor   = $5,
                           note     = $6,
                           recurs   = $7
        WHERE id = $1`,
      [id, String(b.spent_on || '').trim() || null, category, amount,
       String(b.vendor || '').trim().slice(0, 80) || null,
       String(b.note || '').trim().slice(0, 200) || null,
       String(b.recurs || '') === '1']);
  } catch (err) {
    console.error('expense update failed:', err.message);
  }
  res.redirect('/books' + (b.year ? `?year=${encodeURIComponent(b.year)}` : ''));
});

app.post('/expenses/:id/delete', requireAdmin, async (req, res) => {
  const id = Number(req.params.id) || 0;
  try { await pool.query('DELETE FROM expenses WHERE id = $1', [id]); }
  catch (err) { console.error('expense delete failed:', err.message); }
  res.redirect('/books');
});

/* Roll last month's recurring costs into this month. Rent does not stop being
   owed because nobody typed it in, and a monthly cost retyped by hand is a
   monthly cost eventually forgotten. Idempotent: it will not duplicate a
   category already present this month. */
app.post('/expenses/roll', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO expenses (spent_on, category, amount, vendor, note, recurs)
       SELECT date_trunc('month', CURRENT_DATE)::date, e.category, e.amount, e.vendor,
              COALESCE(e.note,'') , TRUE
         FROM expenses e
        WHERE e.recurs
          AND date_trunc('month', e.spent_on) = date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
          AND NOT EXISTS (
            SELECT 1 FROM expenses x
             WHERE x.category = e.category
               AND date_trunc('month', x.spent_on) = date_trunc('month', CURRENT_DATE))`);
    console.log(`recurring expenses rolled forward: ${rowCount}`);
  } catch (err) {
    console.error('expense roll failed:', err.message);
  }
  res.redirect('/books');
});

/* Sales tax detail as CSV, for the ST-1 filing or the bookkeeper. One row per
   payment, because that is the level a state will ask you to substantiate. */
app.get('/tax.csv', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.created_at, p.quote_code, q.name, q.subtotal, q.tax, q.total,
              p.amount, p.method, p.kind,
              CASE WHEN q.total > 0 THEN round(q.tax * (p.amount / q.total), 2) ELSE 0 END AS tax_portion
         FROM quote_payments p JOIN quotes q ON q.code = p.quote_code
        ORDER BY p.created_at`);
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = ['date','quote','customer','job_subtotal','job_tax','job_total',
                  'payment','method','kind','tax_portion_of_payment'];
    const body = rows.map(r => [
      new Date(r.created_at).toISOString().slice(0, 10), r.quote_code, r.name,
      r.subtotal, r.tax, r.total, r.amount, r.method, r.kind, r.tax_portion,
    ].map(esc).join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="jtees-sales-tax-${new Date().toISOString().slice(0,10)}.csv"`);
    res.set('Cache-Control', 'no-store');
    res.send([head.join(','), ...body].join('\n'));
  } catch (err) {
    console.error('tax csv failed:', err.message);
    res.status(500).send('error');
  }
});

/* One tap to add them to the iPhone address book. */
/**
 * Build a receipt from the payment ledger.
 *
 * Every payment is its own line — deposit, balance, card fee, correction — so
 * the customer can see how the total was reached rather than a single number
 * they have to trust. The card surcharge shows as its own line and is NOT part
 * of the quote total, matching how it is banked.
 */
function receiptHtml(q, payments) {
  const rows = payments.filter(p => Number(p.amount) !== 0).map((p) => {
    const when = new Date(p.created_at).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' });
    const label = p.kind === 'refund' ? 'Refund'
                : p.kind === 'correction' ? 'Adjustment'
                : Number(p.amount) < 0 ? 'Adjustment'
                : 'Payment';
    const how = p.method === 'card' ? 'Card' : p.method === 'zelle' ? 'Zelle'
              : p.method === 'cash' ? 'Cash' : p.method === 'transfer' ? 'Bank transfer' : '';
    return `<tr>
      <td style="padding:7px 0;color:#6b7280;font-size:13px">${when}</td>
      <td style="padding:7px 0;color:#374151;font-size:13px">${label}${how ? ` &middot; ${how}` : ''}</td>
      <td style="padding:7px 0;text-align:right;font-variant-numeric:tabular-nums;color:${Number(p.amount) < 0 ? '#b91c1c' : '#111827'}">${money(p.amount)}</td>
    </tr>` + (Number(p.fee) > 0 ? `<tr>
      <td></td>
      <td style="padding:0 0 7px;color:#9ca3af;font-size:12px">Card processing fee (not part of the quote)</td>
      <td style="padding:0 0 7px;text-align:right;color:#9ca3af;font-size:12px;font-variant-numeric:tabular-nums">${money(p.fee)}</td>
    </tr>` : '');
  }).join('');

  const paid = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
  const due = round2(Math.max(0, Number(q.total) - paid));
  const fees = round2(payments.reduce((s, p) => s + Number(p.fee || 0), 0));

  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111827">
    <h2 style="color:#1848B8;margin:0 0 4px">Receipt</h2>
    <p style="margin:0 0 18px;color:#6b7280;font-size:13px">Quote ${escEmail(q.code)}${q.name ? ` &middot; ${escEmail(q.name)}` : ''}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:6px">
      <tr><td colspan="3" style="border-bottom:1px solid #e5e7eb;padding-bottom:6px;
        color:#6b7280;font-size:11px;letter-spacing:.06em;text-transform:uppercase">Payments received</td></tr>
      ${rows || '<tr><td colspan="3" style="padding:10px 0;color:#9ca3af">No payments recorded.</td></tr>'}
    </table>

    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;margin-top:4px">
      <tr><td style="padding:9px 0;color:#6b7280;font-size:13px">Order total</td>
          <td style="padding:9px 0;text-align:right;font-variant-numeric:tabular-nums">${money(q.total)}</td></tr>
      <tr><td style="padding:0 0 9px;color:#6b7280;font-size:13px">Applied to this order</td>
          <td style="padding:0 0 9px;text-align:right;font-variant-numeric:tabular-nums">${money(paid)}</td></tr>
      ${due > 0
        ? `<tr><td style="padding:9px 0;border-top:1px solid #e5e7eb;font-weight:700">Balance due</td>
               <td style="padding:9px 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;font-variant-numeric:tabular-nums">${money(due)}</td></tr>`
        : `<tr><td style="padding:9px 0;border-top:1px solid #e5e7eb;font-weight:700;color:#047857">Paid in full</td>
               <td style="padding:9px 0;border-top:1px solid #e5e7eb;text-align:right;font-weight:700;color:#047857">${money(0)} due</td></tr>`}
    </table>

    ${fees > 0 ? `<p style="color:#9ca3af;font-size:11.5px;margin:12px 0 0">
      Card processing fees of ${money(fees)} are shown separately above and are not part of the order total.</p>` : ''}

    <p style="color:#374151;line-height:1.6;margin:18px 0 0;font-size:14px">
      Thank you — ${SHOP_SIGNER}</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:18px">${SHOP_NAME} &middot; ${SHOP_PHONE}<br>
      <a href="${quoteLink(q.code)}" style="color:#1848B8">${quoteLink(q.code)}</a></p>
  </div>`;
}

/** Send a receipt for a quote. `to` overrides the address on the quote. */
async function sendReceipt(code, to = null) {
  const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
  if (!rows.length) return { ok: false, error: 'no such quote' };
  const q = rows[0];
  const { rows: payments } = await pool.query(
    'SELECT * FROM quote_payments WHERE quote_code=$1 ORDER BY created_at, id', [code]);
  const addr = to || q.email;
  if (!addr) return { ok: false, error: 'no email address on this quote' };
  await sendEmail({
    to: addr,
    subject: `Receipt — quote ${q.code}`,
    html: receiptHtml(q, payments),
  });
  return { ok: true, to: addr, lines: payments.length };
}

/* Admin: send (or re-send) a receipt. ?to= overrides the stored address, for a
   quote taken over the counter where the email arrived only via Stripe. */
app.post('/quote/:code/receipt', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/quotes');
  const to = String((req.body && req.body.to) || req.query.to || '').trim() || null;
  try {
    const out = await sendReceipt(code, to);
    console.log(`receipt for ${code}:`, out.ok ? `sent to ${out.to}` : out.error);
  } catch (err) {
    console.error('receipt failed:', err.message);
  }
  res.redirect('/quotes');
});

app.get('/q/:code/vcard', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.status(400).send('bad code');
  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return res.status(404).send('not found');
    const q = rows[0];
    const [first, ...rest] = String(q.name || '').trim().split(/\s+/);
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:${rest.join(' ')};${first || ''};;;`,
      `FN:${q.name || q.phone || q.email}`,
      q.phone ? `TEL;TYPE=CELL:${q.phone}` : '',
      q.email ? `EMAIL;TYPE=INTERNET:${q.email}` : '',
      `NOTE:${SHOP_NAME} quote ${q.code} — ${quoteSummary(q.items).replace(/[\r\n]+/g, ' ')} — ${money(q.total || q.subtotal)}`,
      'END:VCARD',
    ].filter(Boolean).join('\r\n');
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${(q.name || q.code).replace(/[^a-z0-9]+/gi, '-')}.vcf"`);
    res.send(vcf);
  } catch (err) {
    res.status(500).send('error');
  }
});


/* One customer, everything about them. Reached from the quotes list. */
/* The customer LIST. /customer (singular) is the history for one person and
   needs a ?q= — linking the nav at it sent you straight back to the board,
   which is the bug this replaces.

   Both halves of the shop appear here, merged on email: people who bought
   through a quote live in Postgres, people who ordered through the studio live
   in the designer's MySQL and arrive on the orders feed. Neither list on its
   own is "your customers", and until now neither page pretended to be. */
app.get('/customers', requireAdmin, async (_req, res) => {
  try {
    const { rows: quoteCustomers } = await pool.query(
      `SELECT lower(email) AS email, max(name) AS name,
              count(*) AS jobs, coalesce(sum(paid_amount), 0) AS paid,
              max(created_at) AS last_seen
         FROM quotes
        WHERE email IS NOT NULL AND email <> ''
        GROUP BY lower(email)`);

    const studio = await fetchStudioOrders();
    const byEmail = new Map();

    for (const c of quoteCustomers) {
      byEmail.set(c.email, {
        email: c.email, name: c.name || '', quotes: Number(c.jobs),
        orders: 0, spent: Number(c.paid || 0), last: c.last_seen, source: 'quotes',
      });
    }
    for (const o of studio.orders) {
      const key = String(o.email || '').toLowerCase();
      if (!key) continue;
      const cur = byEmail.get(key);
      if (cur) {
        cur.orders += 1;
        cur.spent += Number(o.paid || 0);
        cur.source = 'both';
        if (!cur.name) cur.name = o.name || '';
        if (o.created && new Date(o.created) > new Date(cur.last)) cur.last = o.created;
      } else {
        byEmail.set(key, {
          email: key, name: o.name || '', quotes: 0, orders: 1,
          spent: Number(o.paid || 0), last: o.created, source: 'studio',
        });
      }
    }

    const people = [...byEmail.values()].sort((a, b) => Number(b.spent) - Number(a.spent));
    const chip = { quotes: ['Quotes', '#eef2fd', '#1848B8'],
                   studio: ['Studio', '#eef1f8', '#46505f'],
                   both:   ['Both',   '#e7f6ec', '#166534'] };

    const rows = people.map((c) => {
      const [label, bg, fg] = chip[c.source];
      return `<tr>
        <td style="padding:9px 6px;border-bottom:1px solid #eef1f8">
          <a href="/customer?q=${encodeURIComponent(c.email)}" style="color:#1848B8;font-weight:600;text-decoration:none">${
            escEmail(c.name || c.email)}</a>
          <div class="muted" style="font-size:12.5px">${escEmail(c.email)}</div></td>
        <td style="padding:9px 6px;border-bottom:1px solid #eef1f8">
          <span class="chip" style="background:${bg};color:${fg}">${label}</span></td>
        <td style="padding:9px 6px;border-bottom:1px solid #eef1f8;text-align:right;white-space:nowrap">${
          c.quotes || '—'}</td>
        <td style="padding:9px 6px;border-bottom:1px solid #eef1f8;text-align:right;white-space:nowrap">${
          c.orders || '—'}</td>
        <td style="padding:9px 6px;border-bottom:1px solid #eef1f8;text-align:right;white-space:nowrap;font-weight:600">${
          money(c.spent)}</td>
      </tr>`;
    }).join('');

    res.send(adminPage('Customers', `<h1>Customers</h1>
      <div class="sub">${people.length} in total &middot; quote customers and studio customers, merged on email${
        studio.error ? ' &middot; <b style="color:#b91c1c">studio list unavailable, showing quotes only</b>' : ''}</div>
      ${people.length ? `<div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead><tr style="text-align:left">
          <th style="padding:6px">Customer</th><th style="padding:6px">Seen in</th>
          <th style="padding:6px;text-align:right">Quotes</th>
          <th style="padding:6px;text-align:right">Orders</th>
          <th style="padding:6px;text-align:right">Paid</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`
        : '<div class="card"><p class="muted">No customers yet.</p></div>'}`, 'customers'));
  } catch (err) {
    console.error('customers list failed:', err.message);
    res.status(500).send(adminPage('Error',
      '<div class="card"><div class="warn">Could not load customers.</div></div>', 'customers'));
  }
});

app.get('/customer', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.redirect('/quotes');
  try {
    const h = await customerHistory(q);
    if (!h) {
      return res.send(quotePage('Not found', `
        <div class="card"><h1>No history for that customer</h1>
        <p class="muted" style="margin-top:8px">${escEmail(q)}</p>
        <p style="margin-top:12px"><a class="btn btn-ghost" href="/quotes">All quotes</a></p></div>`));
    }

    const years = Object.keys(h.byYear).sort().reverse();
    const maxY = Math.max(...years.map(y => h.byYear[y].quoted), 1);

    /* Every payment this customer has made, across all their jobs. It lived on
       the quotes board, where it competed with the money you were trying to
       read; it belongs with the person it describes. */
    const { rows: payHistory } = await pool.query(
      `SELECT p.*, q.name FROM quote_payments p JOIN quotes q ON q.code = p.quote_code
        WHERE p.quote_code = ANY($1) ORDER BY p.created_at DESC`,
      [h.quotes.map(r => r.code)]);
    const payTotal = round2(payHistory.reduce((a, r) => a + Number(r.amount), 0));

    const rows = h.quotes.map(r => {
      const paid = Number(r.paid_amount || 0);
      const total = Number(r.total || r.subtotal || 0);
      const bal = round2(Math.max(0, total - paid));
      const state = paid > 0
        ? (bal > 0 ? `paid ${money(paid)}, ${money(bal)} due` : `paid in full`)
        : (r.accepted_at ? 'accepted, unpaid' : r.status);
      return `
        <tr>
          <td><a href="/q/${r.code}">${escEmail(r.code)}</a>
            <div class="muted" style="font-size:12px">${escEmail(quoteSummary(r.items))}</div></td>
          <td class="num">${fmtDate(r.created_at)}</td>
          <td class="num">${money(total)}</td>
          <td class="num" style="font-size:12.5px;color:${paid > 0 ? '#166534' : '#6b7280'}">${state}</td>
        </tr>`;
    }).join('');

    /* Per-line price history — what this person has actually been charged, so a
       repeat quote can match it instead of relying on memory. */
    const lineHistory = [];
    for (const r of h.quotes) {
      for (const i of (r.items || [])) {
        lineHistory.push({
          desc: i.description, unit: Number(i.unit_price || 0),
          qty: i.qty, when: r.created_at, code: r.code,
        });
      }
    }
    const priceRows = lineHistory.slice(0, 12).map(l => `
      <tr><td>${escEmail(l.desc)}</td>
          <td class="num">${l.qty}</td>
          <td class="num"><b>${money(l.unit)}</b> ea</td>
          <td class="num muted" style="font-size:12px">${fmtDate(l.when)}</td></tr>`).join('');

    res.send(adminPage(h.name || 'Customer', `
      <h1>${escEmail(h.name || h.phone || h.email)}</h1>
      <div class="sub">
        ${h.email ? `<a href="mailto:${escEmail(h.email)}">${escEmail(h.email)}</a> &middot; ` : ''}
        ${h.phone ? `<a href="tel:${escEmail(String(h.phone).replace(/[^0-9+]/g,''))}">${escEmail(h.phone)}</a>` : ''}
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
        <div class="card" style="flex:1 1 150px;margin:0;text-align:center">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Quotes</div>
          <div class="tot" style="font-size:22px">${h.count}</div>
          <div class="muted" style="font-size:12px">${h.accepted} accepted</div>
        </div>
        <div class="card" style="flex:1 1 150px;margin:0;text-align:center">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Quoted</div>
          <div class="tot" style="font-size:22px">${money(h.quoted)}</div>
          <div class="muted" style="font-size:12px">lifetime</div>
        </div>
        <div class="card" style="flex:1 1 150px;margin:0;text-align:center;border-color:#b7e0c4;background:#f6fbf7">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Spent</div>
          <div class="tot" style="font-size:22px;color:#166534">${money(h.spent)}</div>
          <div class="muted" style="font-size:12px">${h.quoted > 0 ? Math.round(h.spent / h.quoted * 100) : 0}% of quoted</div>
        </div>
      </div>

      ${years.length > 1 ? `
      <div class="card">
        <b style="color:#0B1F4B">By year</b>
        <table style="width:100%;margin-top:10px">
          ${years.map(y => {
            const v = h.byYear[y];
            return `<tr>
              <td style="width:52px;font-weight:700;color:#0B1F4B">${y}</td>
              <td style="padding:6px 0">
                <div style="background:#eef1f8;border-radius:4px;height:9px;position:relative">
                  <div style="background:#c3cbd8;height:9px;border-radius:4px;width:${Math.round(v.quoted / maxY * 100)}%"></div>
                  <div style="background:#166534;height:9px;border-radius:4px;width:${Math.round(v.spent / maxY * 100)}%;position:absolute;top:0;left:0"></div>
                </div>
              </td>
              <td class="num muted" style="font-size:12px;white-space:nowrap;padding-left:10px">
                ${money(v.spent)} of ${money(v.quoted)}</td>
            </tr>`;
          }).join('')}
        </table>
        <div class="muted" style="font-size:11px;margin-top:6px">green = paid &middot; grey = quoted</div>
      </div>` : ''}

      ${priceRows ? `
      <div class="card">
        <b style="color:#0B1F4B">What they've been charged</b>
        <div class="muted" style="font-size:12px;margin-bottom:6px">Quote the same price again so it never drifts.</div>
        <table class="items">${priceRows}</table>
      </div>` : ''}

      ${payHistory.length ? `
      <div class="card">
        <b style="color:#0B1F4B">Payment history</b>
        <div class="muted" style="font-size:12px;margin-bottom:8px">
          Every payment across all their jobs — ${money(payTotal)} received in ${payHistory.length} entr${payHistory.length === 1 ? 'y' : 'ies'}.
          Corrections and refunds stay on the record rather than being edited away.</div>
        <table class="items">
          <thead><tr><th>Date</th><th>Quote</th><th>How</th><th class="num">Amount</th></tr></thead>
          <tbody>${payHistory.map(pmt => `<tr>
            <td class="muted" style="white-space:nowrap">${dayShort(pmt.created_at)}</td>
            <td><a href="/production/${escEmail(pmt.quote_code)}" style="color:#1848B8">${escEmail(pmt.quote_code)}</a></td>
            <td class="muted">${escEmail(pmt.method)}${pmt.kind !== 'payment' ? ` · <i>${escEmail(pmt.kind)}</i>` : ''}${
              Number(pmt.fee) > 0 ? ` · fee ${money(pmt.fee)}` : ''}</td>
            <td class="num" style="color:${Number(pmt.amount) < 0 ? '#b91c1c' : '#111827'}">${money(pmt.amount)}</td>
          </tr>${pmt.note ? `<tr><td></td><td colspan="3" class="muted" style="font-size:11px;padding-top:0">${escEmail(String(pmt.note).slice(0,90))}</td></tr>` : ''}`).join('')}</tbody>
        </table>
      </div>` : ''}

      <div class="card">
        <b style="color:#0B1F4B">Quote history</b>
        <table class="items" style="margin-top:8px">
          <thead><tr><th>Quote</th><th class="num">Date</th><th class="num">Total</th><th class="num">Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <p><a class="btn btn-ghost" href="/quotes">← All quotes</a>
         <a class="btn btn-ghost" href="/quote/new">New quote</a></p>
    `, 'customers'));
  } catch (err) {
    console.error('customer page failed:', err.message);
    res.status(500).send(quotePage('Error', '<div class="card"><div class="warn">Could not load that customer.</div></div>'));
  }
});

/* The tracking list. */
/**
 * The production stages, in order. A job sits in the first stage it has not
 * finished, so its column is derived from the same milestone dates the
 * checklist uses — there is no separate "status" field to drift out of step.
 * The checklist is still the detail; this is the shape of the shop floor.
 */
const JOB_STAGES = [
  { key: 'start',  label: 'To start',        cols: [],                            hint: 'accepted, nothing done yet' },
  { key: 'design', label: 'Artwork & proof', cols: ['artwork_at', 'proof_ok_at'], hint: 'file in hand and approved in writing' },
  { key: 'blanks', label: 'Blanks',          cols: ['blanks_in_at'],              hint: 'garments arrived and counted' },
  { key: 'press',  label: 'Press',           cols: ['production_at'],             hint: 'printing or stitching' },
  { key: 'out',    label: 'Check & ship',    cols: ['qc_at', 'shipped_at'],       hint: 'checked and gone' },
  { key: 'done',   label: 'Delivered',       cols: ['delivered_at'],              hint: 'in their hands' },
];

/** The stage a job is sitting in: the last one it has completed. */
function jobStageIndex(q) {
  /* A kanban column means "the work in hand", not "the last thing finished" —
     a job with artwork done and the proof still out belongs in Artwork & proof,
     not back in To start. So the column is the first stage still unfinished,
     with two edges: nothing started at all sits in To start, and everything
     short of delivery is held in the last working column so a shipped job does
     not jump into Delivered (which leaves the board) before it has arrived. */
  if (q.delivered_at) return JOB_STAGES.length - 1;
  const lastWorking = JOB_STAGES.length - 2;
  const started = JOB_STAGES.slice(1).some(st => st.cols.some(c => q[c]));
  if (!started) return 0;
  for (let n = 1; n < JOB_STAGES.length; n++) {
    if (!JOB_STAGES[n].cols.every(c => q[c])) return Math.min(n, lastWorking);
  }
  return lastWorking;
}

/**
 * Move a job to a stage: everything up to and including it is marked done,
 * everything after is cleared. That is what makes moving a card backwards mean
 * what it looks like it means.
 */
app.post('/quote/:code/stage', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const target = JOB_STAGES.findIndex(s => s.key === String((req.body && req.body.stage) || ''));
  const asJson = String((req.body && req.body.json) || '') === '1';
  if (!QUOTE_CODE_RE.test(code) || target < 0) {
    return asJson ? res.status(400).json({ ok: false }) : res.redirect('/production');
  }
  try {
    /* Everything up to and including the target is stamped, everything after is
       cleared — which is what makes moving a card backwards mean what it looks
       like it means. Columns owning several milestones set them together. */
    const sets = JOB_STAGES.slice(1).flatMap((st, i) =>
      st.cols.map(c => `${c} = ${i + 1 <= target ? `COALESCE(${c}, NOW())` : 'NULL'}`)).join(', ');
    const { rows } = await pool.query(
      `UPDATE quotes SET ${sets} WHERE code = $1 RETURNING *`, [code]);
    console.log(`quote ${code}: moved to ${JOB_STAGES[target].label}`);
    if (asJson) {
      const cl = rows.length ? quoteChecklist(rows[0]) : null;
      return res.json({ ok: true, stage: JOB_STAGES[target].key,
                        progress: cl ? { done: cl.done, of: cl.of } : null });
    }
  } catch (err) {
    console.error('stage move failed:', err.message);
    if (asJson) return res.status(500).json({ ok: false });
  }
  res.redirect('/production');
});

/* /quotes is the money board and /production is the work board — the same
   query and sort, different panels. One card carrying money, production,
   costing and history at once was unreadable; splitting the surfaces is what
   makes each one scannable. */
/* ── Design-studio orders on the job board ──────────────────────────────────
   Orders live in the designer's own MySQL, behind its own admin, on its own
   domain. Rather than give this app a second database client — a new runtime
   dependency, and a second writer to the same rows — it reads a JSON feed the
   designer publishes and treats orders as READ-ONLY here. Editing an order
   still happens in one place, which is the only way the two stay honest.

   Cached and short-timeout on purpose: the board is the page June lives in, and
   it must never hang or blank out because the designer is slow. A failed fetch
   shows a visible note, never an empty lane — an empty lane reads as "no
   orders", which is a lie the old setup already told for weeks. */
const STUDIO_BASE = (process.env.JT_DESIGNER_URL || 'https://design.jtees.net').replace(/\/+$/, '');
let _studioCache = { at: 0, orders: [], error: null };

async function fetchStudioOrders() {
  if (Date.now() - _studioCache.at < 60000) return _studioCache;
  const key = process.env.JT_INTERNAL_KEY;
  if (!key) return (_studioCache = { at: Date.now(), orders: [], error: 'JT_INTERNAL_KEY not set' });
  try {
    const r = await fetch(`${STUDIO_BASE}/orders_feed.php?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`feed answered ${r.status}`);
    const d = await r.json();
    return (_studioCache = { at: Date.now(), orders: Array.isArray(d.orders) ? d.orders : [], error: null });
  } catch (e) {
    console.error('studio orders feed failed:', e.message);
    /* Keep whatever was last known good — a stale order list beats no list, as
       long as the page says which it is. */
    return (_studioCache = { at: Date.now(), orders: _studioCache.orders, error: e.message });
  }
}

/** Map an order's single status onto the board's vocabulary. Deliberately
 *  coarse: the designer has no per-step checklist, so pretending it does would
 *  invent progress nobody recorded. */
function studioStage(status) {
  const st = String(status || '').toLowerCase();
  if (st === 'complete') return { label: 'Delivered', color: '#166534', bg: '#e7f6ec' };
  if (st === 'shipped')  return { label: 'Check & ship', color: '#8a5a00', bg: '#fff8ed' };
  return { label: 'Press', color: '#1848B8', bg: '#eef2fd' };
}

function studioOrdersSection(feed, { heading = true } = {}) {
  const rows = feed.orders.map((o) => {
    const stage = studioStage(o.status);
    const owed = round2(Math.max(0, Number(o.total || 0) - Number(o.paid || 0)));
    return `<div class="card" style="padding:12px 14px">
      <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
        <span class="chip" style="background:#eef1f8;color:#46505f">Studio</span>
        <b>Order #${escEmail(String(o.id))}</b>
        <span class="muted">${escEmail(o.name || 'no name')}${o.email ? ' &middot; ' + escEmail(o.email) : ''}</span>
        <span style="margin-left:auto;white-space:nowrap">${money(o.total)}${
          owed > 0 ? ` <span style="color:#b91c1c">&middot; ${money(owed)} due</span>` : ''}</span>
      </div>
      <div style="margin-top:6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="chip" style="background:${stage.bg};color:${stage.color}">${stage.label}</span>
        ${o.tracking ? `<span class="muted" style="font-size:12.5px">tracking ${escEmail(o.tracking)}</span>` : ''}
        <a class="muted" style="font-size:12.5px;margin-left:auto"
           href="${STUDIO_BASE}/admin.php?lumise-page=order&order_id=${encodeURIComponent(o.id)}"
           target="_blank" rel="noopener">Open in studio &rarr;</a>
      </div>
    </div>`;
  }).join('');

  const warn = feed.error
    ? `<div class="warn" style="margin-bottom:10px">Studio orders unavailable right now${
        feed.orders.length ? ' — showing the last known list' : ''}. (${escEmail(feed.error)})</div>`
    : '';

  const empty = (!feed.orders.length && !feed.error)
    ? '<div class="card"><p class="muted">No open studio orders.</p></div>' : '';

  return `${heading ? `<h2 style="margin:22px 0 6px;font-size:19px">Studio orders</h2>
    <div class="sub" style="margin-bottom:10px">Placed online at design.jtees.net &middot; read-only here</div>` : ''}
    ${warn}${rows}${empty}`;
}

async function renderBoard(VIEW, req, res) {
  try {
    const { rows: allRows } = await pool.query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 200');
    /* Fetched alongside the quotes so both halves of the shop appear on one
       page. Never awaited in a way that can fail the board — fetchStudioOrders
       resolves to a stale list plus an error rather than throwing. */
    const studio = await fetchStudioOrders();

    /* Order by what needs attention, not by what arrived last. A board sorted
       by date buries the job that is about to miss its deadline under three
       quotes that came in this morning.
       Rank: behind schedule → deadline soonest → live work → everything else. */
    const rows = allRows.map((q) => {
      const sched = quoteSchedule(q);
      const cl = quoteChecklist(q);
      const done = !!q.delivered_at || !cl.next;
      const byDate = q.needed_by || q.target_date;
      const days = byDate
        ? Math.round((new Date(byDate) - new Date(new Date().toDateString())) / 86400000)
        : null;
      const rank = done ? 4
        : (sched && sched.risks.length) ? 0
        : (days !== null && days <= 7) ? 1
        : (q.accepted_at || Number(q.paid_amount || 0) > 0) ? 2
        : 3;
      return { ...q, _sched: sched, _rank: rank, _days: days };
    }).sort((a, b) => {
      if (a._rank !== b._rank) return a._rank - b._rank;
      if (a._days !== b._days) {
        if (a._days === null) return 1;
        if (b._days === null) return -1;
        return a._days - b._days;
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const atRiskCount = rows.filter(q => q._rank === 0).length;

    /* Payment history per quote, so the card can show how a total was reached
       and offer a correction. Loaded in ONE query, not one per quote. */
    const { rows: payRows } = await pool.query(
      `SELECT * FROM quote_payments ORDER BY quote_code, created_at, id`);
    const payByCode = payRows.reduce((m, p) => { (m[p.quote_code] ||= []).push(p); return m; }, {});

    /* Running totals. Money is counted from the LEDGER, never from the quote
       rows — a quote's total is what was asked for, the ledger is what actually
       arrived, and only the second one belongs in a revenue figure. */
    const { rows: monthly } = await pool.query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS label,
              date_trunc('month', created_at) AS m,
              SUM(amount) AS collected,
              SUM(fee) AS fees,
              COUNT(DISTINCT quote_code) AS jobs
         FROM quote_payments
        GROUP BY 1,2 ORDER BY m DESC LIMIT 12`);

    /* Sales tax, by month, on jobs that have actually been PAID.
       Tax is remitted on money received, not on money invoiced, so an unpaid
       quote must not inflate what you think you owe. The tax portion is
       apportioned by how much of the job has been collected, which is what
       makes part-paid jobs come out right. */
    const { rows: taxRows } = await pool.query(
      `SELECT to_char(date_trunc('month', q.created_at), 'Mon YYYY') AS label,
              date_trunc('month', q.created_at) AS m,
              COUNT(*) FILTER (WHERE q.tax > 0) AS taxable_jobs,
              COALESCE(SUM(q.subtotal),0) AS subtotal,
              COALESCE(SUM(q.tax),0) AS tax_charged,
              COALESCE(SUM(
                CASE WHEN q.total > 0
                     THEN q.tax * LEAST(COALESCE(q.paid_amount,0) / q.total, 1)
                     ELSE 0 END),0) AS tax_collected
         FROM quotes q
        WHERE q.status <> 'expired'
        GROUP BY 1,2 ORDER BY m DESC LIMIT 12`);
    const taxTotal = taxRows.reduce((s, r) => s + Number(r.tax_collected), 0);
    const taxPos = await taxPositionByMonth(24);

    /* Remembered per-unit costs, one lookup for the whole page rather than
       a query per card. */
    const { rows: knownCosts } = await pool.query(
      `SELECT cost_key, unit_cost, samples FROM blank_costs`);
    const costBook = Object.fromEntries(knownCosts.map(r => [r.cost_key, r]));
    const { rows: openAgg } = await pool.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total - COALESCE(paid_amount,0)),0) AS due
         FROM quotes
        WHERE status <> 'expired' AND COALESCE(paid_amount,0) < total`);

    const { rows: quotedAgg } = await pool.query(
      `SELECT to_char(date_trunc('month', created_at), 'Mon YYYY') AS label,
              date_trunc('month', created_at) AS m,
              COUNT(*) AS n, COALESCE(SUM(total),0) AS quoted,
              COALESCE(SUM(subtotal),0) AS sales,
              COALESCE(SUM(cost_blanks + cost_supplies + cost_outsourced + cost_shipping),0) AS costs,
              COUNT(*) FILTER (WHERE (cost_blanks + cost_supplies + cost_outsourced + cost_shipping) > 0) AS costed
         FROM quotes WHERE status <> 'expired' GROUP BY 1,2 ORDER BY m DESC LIMIT 12`);
    const quotedByLabel = Object.fromEntries(quotedAgg.map(r => [r.label, r]));
    const colour = {
      sent: '#eef1f8|#33415c', viewed: '#fff4e0|#8a5a00', changes: '#fdecea|#b45309',
      accepted: '#e7f6ec|#166534', paid: '#1848B8|#ffffff', expired: '#f3f4f6|#6b7280',
    };
    const body = rows.map(q => {
      const expired = q.status !== 'accepted' && q.valid_until && new Date(q.valid_until) < new Date(new Date().toDateString());
      /* "accepted" and "paid" looked identical, so there was no way to see at a
         glance who had actually handed over money. Paid wins over every other
         state. */
      const paid = Number(q.paid_amount || 0) > 0;
      const st = paid ? 'paid' : (expired ? 'expired' : q.status);

      /* Nudges are email-only, so a phone-only quote can never be chased
         automatically — and a quote already chased without reply needs a person
         too. Surface both, with the message ready to copy. */
      const ageDays = (Date.now() - new Date(q.created_at)) / 86400000;
      const noEmail = !q.email;
      const outstanding = round2(Math.max(0, Number(q.total || q.subtotal || 0) - Number(q.paid_amount || 0)));
      const wantsChange = !paid && !!q.change_request;
      const needsText = !paid && !expired && q.phone && (
        (noEmail && ageDays >= 2 && !q.accepted_at) ||
        (q.followed_up_at && !q.accepted_at) ||
        (q.accepted_at && q.deposit_nudged_at)
      );
      const textReason = !needsText ? '' :
        (q.accepted_at ? 'accepted but deposit unpaid'
         : noEmail ? 'no email on file — we cannot chase this one'
         : 'emailed once, no reply');
      const textMsg = needsText ? (q.accepted_at
        ? quoteMessages(q).accepted.replace(/^Got it[^—]*—\s*/, '')
        : quoteMessages(q).followup) : '';
      const [bg, fg] = (colour[st] || colour.sent).split('|');
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <a href="/customer?q=${encodeURIComponent(q.email || q.phone || '')}"
               style="color:#0B1F4B;text-decoration:none"><b>${escEmail(q.name || q.phone || q.email || '—')}</b></a>
            <div class="muted">${escEmail(quoteSummary(q.items))} &middot; ${fmtDate(q.created_at)}</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div class="tot" style="font-size:16px">${money(q.total || q.subtotal)}</div>
            <span class="chip" style="background:${bg};color:${fg}">${paid ? 'paid ' + money(q.paid_amount) : st}</span>
          </div>
        </div>
        ${paid && Number(q.total) > Number(q.paid_amount)
          ? `<div class="muted" style="margin-top:6px;color:#b45309">balance due ${money(round2(Number(q.total) - Number(q.paid_amount)))}</div>`
          : ''}
        ${wantsChange ? `
          <div style="margin-top:10px;background:#eef4ff;border:1px solid #c3d4f8;border-radius:10px;padding:10px 12px">
            <div style="font-weight:700;color:#1848B8;font-size:13px">✏️ Change requested</div>
            <div class="muted" style="font-size:12.5px;margin-top:3px">"${escEmail(q.change_request)}"</div>
            <a class="btn" style="padding:8px 18px;font-size:13px;margin-top:8px;display:inline-block"
               href="/quote/${q.code}/edit">Edit the quote →</a>
          </div>` : ''}
        ${needsText ? `
          <div style="margin-top:10px;background:#fff8e6;border:1px solid #f3dfa8;border-radius:10px;padding:10px 12px">
            <div style="font-weight:700;color:#8a5a00;font-size:13px">📱 Needs a text</div>
            <div class="muted" style="font-size:12.5px;margin-top:2px">${escEmail(textReason)}</div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
              <a class="btn btn-ghost" style="padding:8px 16px;font-size:13px"
                 href="sms:${escEmail(String(q.phone).replace(/[^0-9+]/g, ''))}${/iPhone|iPad|Mac/.test(req.get('user-agent') || '') ? '&' : '?'}body=${encodeURIComponent(textMsg)}">Text ${escEmail(String(q.name || '').split(' ')[0] || 'them')}</a>
              <button type="button" class="btn btn-ghost" style="padding:8px 16px;font-size:13px"
                 onclick="cpq(this)" data-msg="${escEmail(textMsg)}">Copy message</button>
            </div>
          </div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <a class="btn btn-ghost" style="padding:8px 16px;font-size:13px" href="/quote/${q.code}/edit">Edit</a>
          <a class="btn btn-ghost" style="padding:8px 16px;font-size:13px" href="/q/${q.code}" target="_blank" rel="noopener">View as customer</a>
          ${outstanding > 0 ? `<button type="button" class="btn btn-ghost" style="padding:8px 16px;font-size:13px"
             onclick="document.getElementById('mp-${q.code}').style.display='block';this.style.display='none'">Record a payment</button>` : ''}
        </div>
        ${outstanding > 0 ? `
        <form id="mp-${q.code}" method="POST" action="/quote/${q.code}/mark-paid"
              style="display:none;margin-top:10px;background:#f7f9fc;border:1px solid #e3e8f2;border-radius:10px;padding:12px">
          <div class="muted" style="font-size:12.5px;margin-bottom:8px">
            Money received outside the card checkout — Zelle, cash, bank transfer.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select name="method" style="flex:0 0 130px;padding:9px">
              <option value="zelle">Zelle</option>
              <option value="cash">Cash</option>
              <option value="transfer">Bank transfer</option>
              <option value="other">Other</option>
            </select>
            <input name="amount" type="number" step="0.01" inputmode="decimal"
                   placeholder="${money(paid ? outstanding : Number(q.deposit || 0)).replace('$','')}"
                   style="flex:0 0 120px;padding:9px">
            <button type="submit" style="padding:9px 20px;font-size:14px">Record</button>
          </div>
          <input name="note" maxlength="200" placeholder="Zelle confirmation / reference (optional but worth it)"
                 style="width:100%;margin-top:8px;padding:9px">
          <div class="muted" style="font-size:12px;margin-top:6px">
            Leave the amount blank for ${money(paid ? outstanding : Number(q.deposit || 0))}
            (${paid ? 'the remaining balance' : 'the deposit'}). Outstanding: ${money(outstanding)}.
            The reference is what lets you match this to your Zelle statement later.</div>
        </form>` : ''}
        <div class="panels">
        ${(() => {
          const s = q._sched;
          if (VIEW !== 'work' || !s || !s.risks.length) return '';
          return `<div class="panel-wide" style="margin-top:8px;background:#fdecea;border:1px solid #f5c6c0;border-radius:10px;padding:9px 12px">
            <b style="color:#b91c1c;font-size:13px">⚠ Behind schedule</b>
            <div style="color:#b91c1c;font-size:12.5px;margin-top:3px">
              ${s.risks.map(r => `${escEmail(r.label)} was due ${dayShort(r.by)}`).join(' &middot; ')}</div>
            <div class="muted" style="font-size:11.5px;margin-top:3px">
              ${s.isPickup ? 'Ready for pickup' : 'Must ship'} by ${dayShort(s.ship_by)} to hit the deadline.</div>
          </div>`;
        })()}
        ${(() => {
          if (VIEW !== 'work') return '';
          const cl = quoteChecklist(q);
          const pct = Math.round((cl.done / cl.of) * 100);
          /* The whole row is the target, not the tick. A 13px glyph with no
             padding is about a 10×13px hit area — unmissable on a mouse if you
             aim, impossible on the phone this is mostly used on. */
          const rows = cl.steps.map((s) => {
            const inner =
              `<span class="step-tick" style="color:${s.done ? '#047857' : '#9ca3af'}">${s.done ? '☑' : '☐'}</span>
               <span class="step-label" style="color:${s.done ? '#6b7280' : '#111827'};${s.done ? 'text-decoration:line-through' : 'font-weight:600'}">${s.label}</span>
               <span class="step-hint">${escEmail(s.hint)}</span>`;
            return s.manual
              ? `<form method="POST" action="/quote/${q.code}/step" style="margin:0" data-stepform>
                   <input type="hidden" name="step" value="${s.key}">
                   <input type="hidden" name="clear" value="${s.done ? '1' : ''}">
                   <input type="hidden" name="json" value="" data-jsonflag>
                   <button type="submit" class="step-row${s.done ? ' is-done' : ''}"
                           title="${s.done ? 'Tap to undo' : 'Tap to mark done'}">${inner}</button>
                 </form>`
              : `<div class="step-row step-auto${s.done ? ' is-done' : ''}" title="set automatically from your data — nothing to tap">${inner}<span class="step-auto-tag">auto</span></div>`;
          }).join('');
          return `<div style="margin-top:10px;background:#f7f9fc;border:1px solid #e3e8f2;border-radius:10px;padding:10px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
              <div style="font-size:13px" data-next>
                ${cl.next
                  ? `<b style="color:#1848B8">Next: ${escEmail(cl.next.label)}</b>
                     <span class="muted" style="font-size:12px"> — ${escEmail(cl.next.hint)}</span>`
                  : '<b style="color:#047857">Complete — nothing outstanding</b>'}
              </div>
              <span class="muted" style="font-size:11.5px;white-space:nowrap" data-progress>${cl.done}/${cl.of}</span>
            </div>
            <div style="height:4px;background:#e3e8f2;border-radius:3px;margin:7px 0 2px;overflow:hidden">
              <div data-bar style="height:100%;width:${pct}%;background:${pct === 100 ? '#047857' : '#1848B8'};transition:width .2s"></div>
            </div>
            <details style="margin-top:6px">
              <summary style="cursor:pointer;color:#1848B8;font-size:12.5px">Checklist</summary>
              <div style="margin-top:6px;font-size:12.5px">${rows}</div>
              <form method="POST" action="/quote/${q.code}/shipping"
                    style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;border-top:1px solid #e3e8f2;padding-top:8px">
                <select name="ship_method" style="flex:0 0 118px;padding:6px;font-size:12px">
                  ${['', 'pickup', 'ground', 'expedited'].map(v =>
                    `<option value="${v}" ${String(q.ship_method || '') === v ? 'selected' : ''}>${
                      v === '' ? 'how it goes…' : v === 'pickup' ? 'Pickup' : v === 'ground' ? 'Ground' : 'Expedited'}</option>`).join('')}
                </select>
                <input name="tracking" value="${escEmail(q.tracking || '')}" placeholder="tracking number"
                       style="flex:1 1 150px;padding:6px;font-size:12px">
                <input type="hidden" name="prev_tracking" value="${escEmail(q.tracking || '')}">
                <button type="submit" class="btn btn-ghost" style="padding:6px 12px;font-size:12px">Save</button>
              </form>
              <div class="muted" style="font-size:11px;margin-top:6px">
                Ticked boxes are set from the data. Open boxes are yours to tap — tap again to undo.
                Pickup removes transit time from the schedule; a new tracking number emails the customer.</div>
            </details></div>`;
        })()}
        ${(() => {
          if (VIEW !== 'work') return '';
          const mg = quoteMargin(q);
          const good = mg.pct !== null && mg.pct >= 50;
          const thin = mg.pct !== null && mg.pct < 30;
          return `<details style="margin-top:8px">
            <summary style="cursor:pointer;color:#1848B8;font-size:12.5px">
              ${mg.entered
                ? `Margin <b style="color:${thin ? '#b91c1c' : good ? '#047857' : '#b45309'}">${money(mg.profit)} (${mg.pct}%)</b>`
                : '<span style="color:#b45309">Costs not entered</span>'}
            </summary>
            <form method="POST" action="/quote/${q.code}/costs" data-costform="${q.code}"
                  style="background:#f7f9fc;border:1px solid #e3e8f2;border-radius:10px;padding:10px;margin-top:6px">
              ${(() => {
                const list = (() => {
                  try { return typeof q.items === 'string' ? JSON.parse(q.items) : (q.items || []); }
                  catch { return []; }
                })();
                if (!Array.isArray(list) || !list.length) return '<div class="muted" style="font-size:12px">No lines on this quote.</div>';
                return `<table style="width:100%;border-collapse:collapse;font-size:12.5px">
                  <tr style="color:#6b7280;font-size:11px;letter-spacing:.05em;text-transform:uppercase">
                    <td style="padding:3px 0;border-bottom:1px solid #e3e8f2">Line</td>
                    <td style="padding:3px 6px;border-bottom:1px solid #e3e8f2;text-align:right;width:44px">Qty</td>
                    <td style="padding:3px 6px;border-bottom:1px solid #e3e8f2;text-align:right;width:92px">Cost each</td>
                    <td style="padding:3px 0;border-bottom:1px solid #e3e8f2;text-align:right;width:76px">Line cost</td>
                  </tr>
                  ${list.map((it, ix) => {
                    const known = costBook[costKey(it.description)];
                    const isService = COST_SERVICE_WORDS.test(String(it.description || ''));
                    const val = Number(it.unit_cost || 0);
                    return `<tr>
                      <td style="padding:5px 0">${escEmail(String(it.description || '').slice(0, 46))}
                        ${isService ? '<span class="muted" style="font-size:10.5px">service</span>' : ''}</td>
                      <td style="padding:5px 6px;text-align:right;color:#6b7280"
                          data-qty="${Number(it.qty || 0)}">${Number(it.qty || 0)}</td>
                      <td style="padding:5px 6px;text-align:right">
                        <input name="unit_cost" type="number" step="0.01" inputmode="decimal"
                               value="${val > 0 ? val.toFixed(2) : ''}"
                               placeholder="${known ? Number(known.unit_cost).toFixed(2) : '0.00'}"
                               title="${known ? `last time: ${money(known.unit_cost)} each, from ${known.samples} job(s)` : 'not seen before'}"
                               style="width:100%;padding:5px;text-align:right;${known && val <= 0 ? 'background:#eef4ff;border-color:#d3e0fb' : ''}"></td>
                      <td style="padding:5px 0;text-align:right;font-variant-numeric:tabular-nums;color:#6b7280"
                          data-linecost>${val > 0 ? money(val * Number(it.qty || 0)) : '—'}</td>
                    </tr>`;
                  }).join('')}
                  <tr>
                    <td colspan="3" style="padding:6px 0;border-top:1px solid #e3e8f2;text-align:right;color:#6b7280">Materials</td>
                    <td style="padding:6px 0;border-top:1px solid #e3e8f2;text-align:right;font-variant-numeric:tabular-nums"
                        data-materials>${money(itemisedCost(q.items))}</td>
                  </tr>
                  ${[['cost_shipping', 'Shipping / freight', q.cost_shipping],
                     ['cost_supplies', 'Other supplies', q.cost_supplies],
                     ['cost_outsourced', 'Outsourced', q.cost_outsourced]].map(([name, label, val]) => `
                  <tr>
                    <td colspan="2" style="padding:4px 0;color:#6b7280">${label}</td>
                    <td style="padding:4px 6px;text-align:right">
                      <input name="${name}" type="number" step="0.01" inputmode="decimal" data-extra
                             value="${Number(val || 0) > 0 ? Number(val).toFixed(2) : ''}"
                             placeholder="0.00" style="width:100%;padding:5px;text-align:right"></td>
                    <td style="padding:4px 0;text-align:right;color:#6b7280;font-variant-numeric:tabular-nums"
                        data-extraout>${Number(val || 0) > 0 ? money(val) : '—'}</td>
                  </tr>`).join('')}
                  <tr>
                    <td colspan="3" style="padding:6px 0;border-top:1px solid #111827;text-align:right;font-weight:600">Job cost</td>
                    <td style="padding:6px 0;border-top:1px solid #111827;text-align:right;font-weight:700;font-variant-numeric:tabular-nums"
                        data-costtotal>${money(quoteMargin(q).cost)}</td>
                  </tr>
                </table>
                ${(() => {
                  const unseen = list.filter(it => !costBook[costKey(it.description)] &&
                                                   !COST_SERVICE_WORDS.test(String(it.description || '')));
                  const seen = list.length - unseen.length;
                  return seen > 0 ? `<div style="margin-top:6px;font-size:11.5px;color:#1848B8">
                    Greyed-in figures are what these cost last time — type over anything that changed.
                    <button type="button" data-fillsuggested style="margin-left:6px;border:1px solid #1848B8;background:#fff;color:#1848B8;border-radius:6px;padding:2px 9px;font-size:11.5px;cursor:pointer">Use all</button>
                  </div>` : '';
                })()}`;
              })()}
              <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
                <input name="blanks_supplier" value="${escEmail(q.blanks_supplier || '')}"
                       placeholder="supplier" style="flex:0 0 130px;padding:7px">
                <input name="cost_note" maxlength="200" value="${escEmail(q.cost_note || '')}"
                       placeholder="note (optional)" style="flex:1;padding:7px">
                <button type="submit" style="padding:7px 16px;font-size:13px">Save</button>
              </div>
              <div class="muted" style="font-size:11.5px;margin-top:8px">
                ${mg.entered
                  ? `Sales ${money(mg.revenue)} − costs ${money(mg.cost)} = <b>${money(mg.profit)}</b>
                     (${mg.pct}%). ${thin ? '<b style="color:#b91c1c">Thin — check the pricing on the next one like this.</b>'
                       : good ? '<b style="color:#047857">Healthy.</b>' : ''}`
                  : 'Enter what you paid out and this job tells you whether the price was right.'}
                Measured against the sale before tax — tax was never yours, and the card fee is passed through.
              </div>
            </form></details>`;
        })()}
        ${(() => {
          /* The full history lives on the customer profile. What belongs on a
             money board is the correction control and a one-line summary —
             enough to act on, not a ledger to read past. */
          const ps = payByCode[q.code] || [];
          if (VIEW !== 'money' || !ps.length) return '';
          const lines = ps.map(p => {
            const when = new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const neg = Number(p.amount) < 0;
            return `<div style="display:flex;justify-content:space-between;gap:10px;padding:3px 0">
              <span style="color:#6b7280">${when} &middot; ${escEmail(p.method)}${p.kind !== 'payment' ? ` &middot; <i>${escEmail(p.kind)}</i>` : ''}${Number(p.fee) > 0 ? ` &middot; fee ${money(p.fee)}` : ''}</span>
              <span style="font-variant-numeric:tabular-nums;color:${neg ? '#b91c1c' : '#111827'}">${money(p.amount)}</span>
            </div>${p.note ? `<div style="color:#9ca3af;font-size:11px;margin:-2px 0 4px">${escEmail(String(p.note).slice(0, 90))}</div>` : ''}`;
          }).join('');
          const corrections = ps.filter(p => p.kind !== 'payment').length;
          return `<details style="margin-top:10px">
            <summary style="cursor:pointer;color:#1848B8;font-size:12.5px">${ps.length} payment${ps.length===1?'':'s'}${corrections?` · ${corrections} correction${corrections===1?'':'s'}`:''} · <a href="/customer?q=${encodeURIComponent(q.email || q.phone || '')}" style="color:#1848B8">full history</a></summary>
            <div style="background:#f7f9fc;border:1px solid #e3e8f2;border-radius:10px;padding:10px;margin-top:6px;font-size:12.5px">
              ${lines}
              <form method="POST" action="/quote/${q.code}/correct-payment"
                    style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:10px;border-top:1px solid #e3e8f2;padding-top:10px">
                <span class="muted" style="font-size:12px">Correct the total to</span>
                <input name="set" type="number" step="0.01" inputmode="decimal"
                       placeholder="${Number(q.paid_amount || 0).toFixed(2)}" style="flex:0 0 100px;padding:7px">
                <input name="note" maxlength="200" placeholder="why" style="flex:1 1 140px;padding:7px">
                <button type="submit" class="btn btn-ghost" style="padding:7px 14px;font-size:12.5px">Correct</button>
              </form>
              <div class="muted" style="font-size:11px;margin-top:6px">
                Nothing is deleted — a correction is recorded as its own entry.</div>
            </div></details>`;
        })()}
        </div>
        <div class="muted" style="margin-top:8px;font-size:12px">/q/${q.code}
        ${q.phone ? ` &middot; <a class="muted" href="tel:${escEmail(q.phone)}">${escEmail(q.phone)}</a>` : ''}
        ${q.email ? ` &middot; <a class="muted" href="#" onclick="if(confirm('Email a receipt to ${escEmail(q.email)}?')){var f=document.createElement('form');f.method='POST';f.action='/quote/${q.code}/receipt';document.body.appendChild(f);f.submit();}return false;">email receipt</a>` : ''}</div>
      </div>`;
    }).join('');
    const needCount = (body.match(/Needs a text/g) || []).length;
    const changeCount = (body.match(/Change requested/g) || []).length;
    res.send(adminPage(VIEW === 'work' ? 'Production' : 'Quotes',
      `<h1>${VIEW === 'work' ? 'Production' : 'Quotes'}</h1>
      <div class="sub">${rows.length} total${
        atRiskCount ? ` &middot; <b style="color:#b91c1c">${atRiskCount} behind schedule</b>` : ''}${
        changeCount ? ` &middot; <b style="color:#1848B8">${changeCount} awaiting your edit</b>` : ''}${
        needCount ? ` &middot; <b style="color:#8a5a00">${needCount} need a text</b>` : ''}
        &middot; <span class="muted" style="font-size:12px">sorted by what needs attention</span></div>
      <p style="margin-bottom:14px">
        <a class="btn" href="/quote/new">New quote</a>
        <a class="btn btn-ghost" href="/quotes" style="margin-left:8px${VIEW==='money'?';font-weight:800':''}">Money</a>
        <a class="btn btn-ghost" href="/production" style="margin-left:6px${VIEW==='work'?';font-weight:800':''}">Production</a></p>
      <!-- Books moved to the main nav; these two stay because they are the two
           views of THIS board, not separate destinations. -->

      ${VIEW !== 'money' ? '' : `
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:26px;flex-wrap:wrap;align-items:baseline;margin-bottom:4px">
          <div>
            <div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Open orders</div>
            <div style="font-size:24px;font-weight:700">${openAgg[0].n}</div>
          </div>
          <div>
            <div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Outstanding</div>
            <div style="font-size:24px;font-weight:700;color:${Number(openAgg[0].due) > 0 ? '#b45309' : '#047857'}">${money(openAgg[0].due)}</div>
          </div>
          <div>
            <div class="muted" style="font-size:11px;letter-spacing:.06em;text-transform:uppercase">Collected this month</div>
            <div style="font-size:24px;font-weight:700;color:#047857">${money(monthly[0] ? monthly[0].collected : 0)}</div>
          </div>
        </div>
        <details style="margin-top:10px">
          <summary style="cursor:pointer;color:#1848B8;font-size:13px">Monthly totals</summary>
          <table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px">
            <tr style="color:#6b7280;font-size:11px;letter-spacing:.05em;text-transform:uppercase">
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb">Month</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Quoted</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Collected</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Costs</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Profit</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Jobs</td>
            </tr>
            ${monthly.map(m => {
              const qa = quotedByLabel[m.label];
              const sales = Number(qa ? qa.sales : 0);
              const costs = Number(qa ? qa.costs : 0);
              const profit = round2(sales - costs);
              const pct = sales > 0 && costs > 0 ? Math.round((profit / sales) * 100) : null;
              const partial = qa && Number(qa.costed) < Number(qa.n);
              return `<tr>
              <td style="padding:6px 0">${m.label}</td>
              <td style="padding:6px 0;text-align:right;color:#6b7280;font-variant-numeric:tabular-nums">${money(qa ? qa.quoted : 0)}</td>
              <td style="padding:6px 0;text-align:right;font-weight:600;font-variant-numeric:tabular-nums">${money(m.collected)}</td>
              <td style="padding:6px 0;text-align:right;color:#9ca3af;font-variant-numeric:tabular-nums">${costs > 0 ? money(costs) : '—'}</td>
              <td style="padding:6px 0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:${pct === null ? '#9ca3af' : pct < 30 ? '#b91c1c' : '#047857'}">
                ${pct === null ? '—' : `${money(profit)}<span style="font-weight:400;color:#9ca3af"> ${pct}%</span>`}
                ${partial && costs > 0 ? '<span title="some jobs have no costs entered" style="color:#b45309">*</span>' : ''}</td>
              <td style="padding:6px 0;text-align:right;color:#6b7280">${m.jobs}</td>
            </tr>`; }).join('') || '<tr><td colspan="6" style="padding:8px 0;color:#9ca3af">No payments recorded yet.</td></tr>'}
          </table>
          <div class="muted" style="font-size:11px;margin-top:8px">
            Collected comes from the payment ledger — what actually arrived, net of corrections
            and refunds. Quoted is what was asked for in that month, so the two will not match.
            Profit is sales before tax minus what you paid out; a <b>*</b> means some jobs that
            month have no costs entered yet, so the real figure is lower.</div>
        </details>

        <details style="margin-top:8px" ${taxPos.setAside > 0 ? 'open' : ''}>
          <summary style="cursor:pointer;color:#1848B8;font-size:13px">
            Sales tax &middot; <b style="color:${taxPos.setAside > 0 ? '#b45309' : '#047857'}">${money(taxPos.setAside)}</b> to set aside</summary>

          <div style="background:#fff8ed;border:1px solid #fde3c0;border-radius:10px;padding:12px;margin-top:8px">
            <div style="font-size:12px;color:#8a5a00;letter-spacing:.05em;text-transform:uppercase">Hold in the bank right now</div>
            <div style="font-size:28px;font-weight:700;color:#8a5a00;margin:2px 0">${money(taxPos.setAside)}</div>
            <div style="font-size:12px;color:#8a5a00">This is the state's money, not income. ST-1 is due the 20th of the following month.</div>
          </div>

          <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:13px">
            <tr style="color:#6b7280;font-size:11px;letter-spacing:.05em;text-transform:uppercase">
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb">Period</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Collected</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Remitted</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb;text-align:right">Outstanding</td>
              <td style="padding:4px 0;border-bottom:1px solid #e5e7eb"></td>
            </tr>
            ${taxPos.months.map(m => `<tr>
              <td style="padding:7px 0">${periodLabel(m.period)}</td>
              <td style="padding:7px 0;text-align:right;font-variant-numeric:tabular-nums">${money(m.collected)}</td>
              <td style="padding:7px 0;text-align:right;color:#6b7280;font-variant-numeric:tabular-nums">${m.remitted > 0 ? money(m.remitted) : '—'}</td>
              <td style="padding:7px 0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:${m.outstanding > 0 ? '#b45309' : '#047857'}">${m.outstanding > 0 ? money(m.outstanding) : 'clear'}</td>
              <td style="padding:7px 0;text-align:right">
                ${m.outstanding > 0 ? `<form method="POST" action="/tax/remit" style="display:inline-flex;gap:4px;align-items:center"
                     onsubmit="return confirm('Record ${money(m.outstanding)} remitted for ${periodLabel(m.period)}?')">
                  <input type="hidden" name="period" value="${m.period}">
                  <input type="hidden" name="amount" value="${Number(m.outstanding).toFixed(2)}">
                  <input name="reference" placeholder="confirmation #" style="width:110px;padding:5px;font-size:12px">
                  <button type="submit" class="btn btn-ghost" style="padding:5px 10px;font-size:12px">Filed</button>
                </form>` : `<span class="muted" style="font-size:11.5px">${m.last_paid ? 'filed ' + dayShort(m.last_paid) : ''}</span>`}
              </td>
            </tr>`).join('') || '<tr><td colspan="5" style="padding:8px 0;color:#9ca3af">No taxable sales yet.</td></tr>'}
          </table>

          <div class="muted" style="font-size:11px;margin-top:8px">
            Charged at ${(TAX_RATE * 100).toFixed(2)}%. A period counts the month the money
            <b>arrived</b>, not the month the quote was written — tax is owed on receipts.
            Corrections and refunds take their tax back out automatically.
            You are emailed on the 1st, and again on the 15th and 19th if a period is still open.
            Every sale runs through this system, so this is the complete figure for the period.
            <a href="/tax.csv" style="color:#1848B8">Download CSV</a>.</div>
        </details>
      </div>`}

      ${VIEW === 'work' ? (() => {
        /* Kanban: columns are stages, cards are jobs. A job's column comes from
           its milestone dates, so the board and the checklist can never
           disagree. Moving a card is one tap — the arrows, not drag, because
           drag is unreliable on the phone this is used on. */
        /* Accepted work only. An unaccepted quote is a sales problem and belongs
           on the Money board; putting it here is what made To start misleading. */
        const live = rows.filter(q => !q.delivered_at && q.accepted_at);
        /* Delivered is a destination, not a column — a job that reaches it leaves
           the board, so rendering it produced an always-empty sixth column that
           wrapped onto a second row. The move buttons still target it by index. */
        const cols = JOB_STAGES.slice(0, -1).map((st, i) => ({
          ...st, i, jobs: live.filter(q => jobStageIndex(q) === i),
        }));
        return `<div class="kanban">${cols.map(c => `
          <section class="kcol">
            <header class="kcol-head">
              <span>${c.label}</span>
              <span class="kcount">${c.jobs.length}</span>
            </header>
            <div class="kcol-hint">${c.hint}</div>
            ${c.jobs.map(q => {
              const days = q._days;
              const risk = q._sched && q._sched.risks.length;
              const due = days === null ? '' :
                days < 0 ? `<b style="color:#b91c1c">${-days}d late</b>` :
                days === 0 ? '<b style="color:#b45309">today</b>' :
                days <= 3 ? `<b style="color:#b45309">${days}d</b>` : `${days}d`;
              /* The next action finishes the column the card is sitting in, it
                 does not jump to the one after it. Targeting c.i+1 meant a card
                 in Check & ship offered only "✓ Delivered": checked-and-shipped
                 could never be recorded, and one tap stamped delivered_at and
                 dropped the job off the board. A column whose milestones are
                 already set is the one case where the action really is to
                 advance — To start owns none (vacuously done), and Check & ship
                 holds a finished job until it actually arrives. */
              const act = JOB_STAGES[c.i].cols.every(col => q[col])
                ? JOB_STAGES[c.i + 1] : JOB_STAGES[c.i];
              return `<article class="kcard${risk ? ' kcard-risk' : ''}">
                <div class="kcard-top">
                  <a href="/customer?q=${encodeURIComponent(q.email || q.phone || '')}" class="kcard-name">${escEmail(q.name || q.code)}</a>
                  ${due ? `<span class="kcard-due">${due}</span>` : ''}
                </div>
                <div class="kcard-sub">${escEmail(q.code)} · ${money(q.total)}${
                  Number(q.paid_amount||0) < Number(q.total||0) ? ` · <span style="color:#b45309">${money(round2(q.total - (q.paid_amount||0)))} due</span>` : ''}</div>
                ${risk ? `<div class="kcard-risk-note">⚠ ${escEmail(q._sched.risks[0].label)} was due ${dayShort(q._sched.risks[0].by)}</div>` : ''}
                ${act ? `
                <form method="POST" action="/quote/${q.code}/stage" data-stageform class="knext">
                  <input type="hidden" name="stage" value="${act.key}">
                  <input type="hidden" name="json" value="" data-jsonflag>
                  <button type="submit" class="kbtn kbtn-next" title="${escEmail(act.hint)}">
                    ✓ ${escEmail(act.label)}</button>
                </form>` : ''}
                <div class="kmove">
                  ${c.i > 0 ? `<form method="POST" action="/quote/${q.code}/stage" data-stageform>
                    <input type="hidden" name="stage" value="${JOB_STAGES[c.i-1].key}">
                    <input type="hidden" name="json" value="" data-jsonflag>
                    <button type="submit" class="kbtn kbtn-sm" title="Back to ${JOB_STAGES[c.i-1].label}">←</button></form>` : '<span></span>'}
                  <a class="kbtn kbtn-link" href="/production/${q.code}">details</a>
                </div>
              </article>`;
            }).join('') || '<div class="kempty">—</div>'}
          </section>`).join('')}</div>
          ${live.length === 0 ? '<div class="card"><p class="muted">Nothing in production. Delivered jobs drop off this board.</p></div>' : ''}`;
      })() : (body ? `<div class="quote-grid">${body}</div>` : '<div class="card"><p class="muted">No quotes yet.</p></div>')}

      ${studioOrdersSection(studio)}
      <script>
        /* Moving a kanban card posts in the background and re-renders just
           that card into its new column, so the board does not jump back to
           the top on every move. */
        document.querySelectorAll('form[data-stageform]').forEach(function(form){
          form.addEventListener('submit', function(e){
            e.preventDefault();
            var card = form.closest('.kcard');
            if (card.dataset.busy) return;
            card.dataset.busy = '1';
            card.style.opacity = '.45';
            var jf = form.querySelector('[data-jsonflag]');
            if (jf) jf.value = '1';
            fetch(form.action, {
              method: 'POST',
              headers: { 'Accept':'application/json', 'Content-Type':'application/x-www-form-urlencoded' },
              body: new URLSearchParams(new FormData(form)).toString(),
            })
            .then(function(r){
              if (r.redirected || !(r.headers.get('content-type')||'').includes('json')) throw new Error('not json');
              return r.json();
            })
            .then(function(d){
              if (!d || !d.ok) throw new Error('failed');
              // The column layout is server-derived; reload to land it in the
              // right place rather than guessing the new position here.
              location.reload();
            })
            .catch(function(){ form.submit(); });
          });
        });

        /* Ticking a step posts in the background. Submitting the form normally
           reloaded the page, which collapsed the <details> the row lives in —
           so a save that worked looked exactly like the checklist shutting
           itself. Without JS the form still submits the old way. */
        document.querySelectorAll('form[data-stepform]').forEach(function(form){
          form.addEventListener('submit', function(e){
            e.preventDefault();
            var btn = form.querySelector('.step-row');
            var clear = form.querySelector('input[name="clear"]');
            if (btn.dataset.busy) return;
            btn.dataset.busy = '1';
            btn.style.opacity = '.5';

            var jf = form.querySelector('[data-jsonflag]');
            if (jf) jf.value = '1';
            /* URL-encoded, not FormData. FormData posts multipart/form-data,
               which express.urlencoded() does not parse — req.body arrived
               empty, so the step name never reached the handler and it
               redirected. The native form fallback worked precisely because
               browsers send url-encoded, which is what made this look like the
               server was at fault. */
            fetch(form.action, {
              method: 'POST',
              headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams(new FormData(form)).toString(),
            })
            .then(function(r){
              // A redirect back to the board means the JSON branch was missed;
              // treating that as success would leave a stale row on screen.
              if (r.redirected || !(r.headers.get('content-type')||'').includes('json')) {
                throw new Error('not json');
              }
              return r.json();
            })
            .then(function(d){
              if (!d || !d.ok) throw new Error('failed');
              var done = d.done;
              btn.classList.toggle('is-done', done);
              clear.value = done ? '1' : '';
              btn.title = done ? 'Tap to undo' : 'Tap to mark done';
              var tick = btn.querySelector('.step-tick');
              if (tick) { tick.textContent = done ? '☑' : '☐'; tick.style.color = done ? '#047857' : '#9ca3af'; }
              var label = btn.querySelector('.step-label');
              if (label) {
                label.style.textDecoration = done ? 'line-through' : 'none';
                label.style.color = done ? '#6b7280' : '#111827';
                label.style.fontWeight = done ? '400' : '600';
              }
              // The card's own progress and next action, from the server's
              // recomputed checklist rather than guessed at here.
              var card = form.closest('.card');
              if (card && d.progress) {
                var p = card.querySelector('[data-progress]');
                if (p) p.textContent = d.progress.done + '/' + d.progress.of;
                var bar = card.querySelector('[data-bar]');
                if (bar) {
                  var pctv = Math.round(d.progress.done / d.progress.of * 100);
                  bar.style.width = pctv + '%';
                  bar.style.background = pctv === 100 ? '#047857' : '#1848B8';
                }
                var nx = card.querySelector('[data-next]');
                if (nx) nx.innerHTML = d.next
                  ? '<b style="color:#1848B8">Next: ' + d.next.label + '</b>' +
                    '<span class="muted" style="font-size:12px"> — ' + d.next.hint + '</span>'
                  : '<b style="color:#047857">Complete — nothing outstanding</b>';
              }
            })
            .catch(function(){ form.submit(); })   // fall back to a real POST
            .finally(function(){
              delete btn.dataset.busy;
              btn.style.opacity = '';
            });
          });
        });

        /* Line costs multiply themselves. The whole point of itemising is not
           having to work out qty × cost on paper for every line. */
        (function(){
          function money(n){ return '$' + (Math.round(n*100)/100).toFixed(2); }
          function recalc(form){
            var materials = 0;
            form.querySelectorAll('tr').forEach(function(tr){
              var qtyCell = tr.querySelector('[data-qty]');
              var input   = tr.querySelector('input[name="unit_cost"]');
              var out     = tr.querySelector('[data-linecost]');
              if(!qtyCell || !input || !out) return;
              var qty  = Number(qtyCell.getAttribute('data-qty')) || 0;
              /* An empty box uses the remembered figure shown in the
                 placeholder, so the total reflects what will actually be
                 saved once "Use all" is pressed. */
              var unit = input.value !== '' ? Number(input.value)
                                            : Number(input.placeholder) || 0;
              var line = qty * unit;
              out.textContent = line > 0 ? money(line) : '—';
              materials += line;
            });
            var m = form.querySelector('[data-materials]');
            if(m) m.textContent = money(materials);

            // Shipping, supplies and outsourced sit under the same total.
            var extras = 0;
            form.querySelectorAll('input[data-extra]').forEach(function(i){
              var v = Number(i.value) || 0;
              extras += v;
              var out = i.closest('tr') && i.closest('tr').querySelector('[data-extraout]');
              if(out) out.textContent = v > 0 ? money(v) : '—';
            });

            var t = form.querySelector('[data-costtotal]');
            if(t) t.textContent = money(materials + extras);
          }
          document.querySelectorAll('form[data-costform]').forEach(function(form){
            form.addEventListener('input', function(e){
              if(e.target.name === 'unit_cost' || e.target.hasAttribute('data-extra')) recalc(form);
            });
            var fill = form.querySelector('[data-fillsuggested]');
            if(fill) fill.addEventListener('click', function(){
              form.querySelectorAll('input[name="unit_cost"]').forEach(function(i){
                if(i.value === '' && Number(i.placeholder) > 0) i.value = Number(i.placeholder).toFixed(2);
              });
              recalc(form);
            });
            recalc(form);
          });
        })();

        function cpq(btn){
          var t = btn.getAttribute('data-msg');
          (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
            .then(function(){ btn.textContent = 'Copied ✓'; })
            .catch(function(){
              var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);
              a.select();document.execCommand('copy');a.remove();btn.textContent='Copied ✓';
            });
        }
      </script>`, 'jobs'));
  } catch (err) {
    console.error('board render failed:', err.message);
    res.status(500).send(quotePage('Error', '<div class="card"><div class="warn">Could not load the board.</div></div>'));
  }
}

/* Set the working date when the customer would not give one — or record that
   there genuinely is not a deadline, which is a real answer and should stop the
   checklist asking. */
app.post('/quote/:code/target', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/production');
  const b = req.body || {};
  const flexible = String(b.flexible || '') === '1';
  const date = String(b.target_date || '').trim() || null;
  try {
    await pool.query(
      `UPDATE quotes SET target_date = $2::date, deadline_flexible = $3 WHERE code = $1`,
      [code, flexible ? null : date, flexible]);
    console.log(`quote ${code}: ${flexible ? 'marked flexible' : 'target date ' + date}`);
  } catch (err) {
    console.error('target date failed:', err.message);
  }
  res.redirect('/production/' + code);
});

/* One job in full: the checklist detail behind a kanban card. The board is for
   moving work along; this is for the specifics of a single job. */
app.get('/production/:code', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/production');
  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code = $1', [code]);
    if (!rows.length) return res.redirect('/production');
    const q = rows[0];
    const cl = quoteChecklist(q);
    const sched = quoteSchedule(q);
    const si = jobStageIndex(q);

    const stepRows = cl.steps.map((st) => {
      const inner = `<span class="step-tick" style="color:${st.done ? '#047857' : '#9ca3af'}">${st.done ? '☑' : '☐'}</span>
        <span class="step-label" style="color:${st.done ? '#6b7280' : '#111827'};${st.done ? 'text-decoration:line-through' : 'font-weight:600'}">${st.label}</span>
        <span class="step-hint">${escEmail(st.hint)}</span>`;
      return st.manual
        ? `<form method="POST" action="/quote/${q.code}/step" style="margin:0" data-stepform>
             <input type="hidden" name="step" value="${st.key}">
             <input type="hidden" name="clear" value="${st.done ? '1' : ''}">
             <input type="hidden" name="json" value="" data-jsonflag>
             <button type="submit" class="step-row${st.done ? ' is-done' : ''}">${inner}</button>
           </form>`
        : `<div class="step-row step-auto" title="set automatically from your data — nothing to tap">${inner}<span class="step-auto-tag">auto</span></div>`;
    }).join('');

    res.send(adminPage(`${q.code} — production`, `
      <h1>${escEmail(q.name || q.code)}</h1>
      <div class="sub">${escEmail(q.code)} · ${money(q.total)} ·
        <a href="/production" style="color:#1848B8">back to the board</a> ·
        <a href="/customer?q=${encodeURIComponent(q.email || q.phone || '')}" style="color:#1848B8">customer</a></div>

      <div class="card" style="margin-top:12px">
        ${(() => {
          /* The pre-acceptance and money facts that used to be checklist rows.
             Still visible, no longer something you tick. */
          const paid = Number(q.paid_amount || 0);
          const total = Number(q.total || 0);
          const due = round2(Math.max(0, total - paid));
          const costed = (Number(q.cost_blanks || 0) + Number(q.cost_supplies || 0) +
                          Number(q.cost_outsourced || 0) + Number(q.cost_shipping || 0)) > 0;
          const bit = (ok, yes, no, warn) =>
            `<span style="color:${ok ? '#047857' : (warn ? '#b45309' : '#8a97ad')}">${ok ? '✓ ' : ''}${ok ? yes : no}</span>`;
          return `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:12.5px;
                       background:#f7f9fc;border:1px solid #e3e8f2;border-radius:9px;padding:8px 11px;margin-bottom:10px">
            ${bit(!!q.accepted_at, 'Accepted', 'Not accepted yet', true)}
            <span style="color:#dfe5ef">·</span>
            ${due > 0 ? `<span style="color:#b45309"><b>${money(due)}</b> due</span>`
                      : bit(total > 0, 'Paid in full', 'Nothing invoiced', false)}
            <span style="color:#dfe5ef">·</span>
            ${costed ? bit(true, 'Costs in', '', false)
                     : `<a href="/quotes" style="color:#b45309">Costs not entered</a>`}
          </div>`;
        })()}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${JOB_STAGES.map((st, i) => `
            <form method="POST" action="/quote/${q.code}/stage" style="margin:0">
              <input type="hidden" name="stage" value="${st.key}">
              <button type="submit" class="kbtn${i === si ? ' kbtn-go' : ''}"
                      title="${escEmail(st.hint)}">${st.label}</button>
            </form>`).join('')}
        </div>
        ${!q.needed_by ? `
        <form method="POST" action="/quote/${q.code}/target"
              style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#fff8ed;
                     border:1px solid #fde3c0;border-radius:10px;padding:9px 11px;margin-bottom:10px">
          <span style="font-size:12.5px;color:#8a5a00;flex:1 1 100%">
            ${q.deadline_flexible ? 'No fixed date — they are flexible.'
              : q.target_date ? `They gave no date. Working to <b>${dayShort(q.target_date)}</b>.`
              : 'They did not give a date. Set one to work to, so blanks get ordered in time.'}</span>
          <input name="target_date" type="date" value="${q.target_date ? new Date(q.target_date).toISOString().slice(0,10) : ''}"
                 style="flex:0 0 152px;padding:6px;font-size:12px">
          <button type="submit" class="kbtn kbtn-go" style="font-size:12px">Set</button>
          <button type="submit" name="flexible" value="1" class="kbtn" style="font-size:12px">No fixed date</button>
        </form>` : ''}
        ${sched ? `<div class="muted" style="font-size:12px;margin-bottom:10px">
          ${q.needed_by ? `Needed ${dayShort(q.needed_by)}` : `Working to ${dayShort(q.target_date)}`} · ${sched.isPickup ? 'ready by' : 'ship by'} ${dayShort(sched.ship_by)}
          · order blanks by ${dayShort(sched.blanks_order_by)}
          ${sched.risks.length ? `<span style="color:#b91c1c"> · behind on ${sched.risks.map(r=>escEmail(r.label)).join(', ')}</span>` : ''}</div>` : ''}
        <div data-next style="font-size:13px;margin-bottom:6px">
          ${cl.next ? `<b style="color:#1848B8">Next: ${escEmail(cl.next.label)}</b>
            <span class="muted" style="font-size:12px"> — ${escEmail(cl.next.hint)}</span>`
            : '<b style="color:#047857">Complete</b>'}
        </div>
        <div style="height:4px;background:#e3e8f2;border-radius:3px;margin:6px 0 10px;overflow:hidden">
          <div data-bar style="height:100%;width:${Math.round(cl.done/cl.of*100)}%;background:#1848B8;transition:width .2s"></div></div>
        <span class="muted" style="font-size:11.5px" data-progress>${cl.done}/${cl.of}</span>
        <div style="margin-top:8px">${stepRows}</div>
      </div>

      <script>
        document.querySelectorAll('form[data-stepform]').forEach(function(form){
          form.addEventListener('submit', function(e){
            e.preventDefault();
            var btn = form.querySelector('.step-row');
            var clear = form.querySelector('input[name="clear"]');
            var jf = form.querySelector('[data-jsonflag]');
            if (jf) jf.value = '1';
            fetch(form.action, { method:'POST',
              headers:{'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded'},
              body:new URLSearchParams(new FormData(form)).toString() })
            .then(function(r){
              if (r.redirected || !(r.headers.get('content-type')||'').includes('json')) throw new Error('x');
              return r.json(); })
            .then(function(d){
              if(!d||!d.ok) throw new Error('x');
              btn.classList.toggle('is-done', d.done);
              clear.value = d.done ? '1' : '';
              var t=btn.querySelector('.step-tick');
              if(t){t.textContent=d.done?'☑':'☐';t.style.color=d.done?'#047857':'#9ca3af';}
              var l=btn.querySelector('.step-label');
              if(l){l.style.textDecoration=d.done?'line-through':'none';l.style.fontWeight=d.done?'400':'600';}
              if(d.progress){
                var p=document.querySelector('[data-progress]'); if(p)p.textContent=d.progress.done+'/'+d.progress.of;
                var b=document.querySelector('[data-bar]'); if(b)b.style.width=Math.round(d.progress.done/d.progress.of*100)+'%';
              }
              var nx=document.querySelector('[data-next]');
              if(nx) nx.innerHTML = d.next
                ? '<b style="color:#1848B8">Next: '+d.next.label+'</b><span class="muted" style="font-size:12px"> — '+d.next.hint+'</span>'
                : '<b style="color:#047857">Complete</b>';
            })
            .catch(function(){ form.submit(); });
          });
        });
      </script>`, 'jobs'));
  } catch (err) {
    console.error('job detail failed:', err.message);
    res.redirect('/production');
  }
});

app.get('/quotes',     requireAdmin, (req, res) => renderBoard('money', req, res));
app.get('/production', requireAdmin, (req, res) => renderBoard('work',  req, res));

/* Studio orders on their own, for when that is the question being asked. The
   same list also sits at the foot of the job board — this is a view, not a
   second source. */
app.get('/orders', requireAdmin, async (_req, res) => {
  const studio = await fetchStudioOrders();
  const open = studio.orders.filter(o => String(o.status).toLowerCase() !== 'complete').length;
  res.send(adminPage('Studio orders', `<h1>Studio orders</h1>
    <div class="sub">${studio.orders.length} on file${
      open ? ` &middot; <b>${open}</b> still open` : ''} &middot; placed online at design.jtees.net</div>
    <p style="margin-bottom:14px">
      <a class="btn btn-ghost" href="${STUDIO_BASE}/admin.php?lumise-page=orders" target="_blank" rel="noopener">
        Open the studio admin &rarr;</a></p>
    ${studioOrdersSection(studio, { heading: false })}`, 'orders'));
});


/* ══ Reviews ══════════════════════════════════════════════════════════════
   A review request goes out after delivery with a one-tap star link. Happy
   customers (4-5) are then pointed at Google, which is where reviews actually
   help the shop get found; anything lower stays private and comes straight to
   June so a problem can be fixed instead of published. Everything collected is
   held for approval before it appears anywhere. */

const GOOGLE_REVIEW_URL = process.env.JT_GOOGLE_REVIEW_URL || '';

function reviewToken() { return crypto.randomBytes(9).toString('base64url'); }

const STAR = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

/** Approved reviews, newest first. Cached briefly — the storefront asks often. */
let _revCache = { at: 0, rows: [] };
async function approvedReviews(limit = 50) {
  if (Date.now() - _revCache.at < 300000) return _revCache.rows.slice(0, limit);
  try {
    const { rows } = await pool.query(
      `SELECT name, rating, title, body, product, submitted_at
         FROM reviews WHERE approved = TRUE AND rating IS NOT NULL
        ORDER BY submitted_at DESC LIMIT 200`);
    _revCache = { at: Date.now(), rows };
    return rows.slice(0, limit);
  } catch { return _revCache.rows.slice(0, limit); }
}

/* The page a customer lands on from the request email. */
app.get('/review/:token', async (req, res) => {
  const token = String(req.params.token || '');
  const pre = Math.max(0, Math.min(5, parseInt(req.query.r, 10) || 0));
  try {
    const { rows } = await pool.query('SELECT * FROM reviews WHERE token=$1', [token]);
    if (!rows.length) {
      return res.status(404).send(quotePage('Link not found', `
        <div class="card"><h1>That link has expired</h1>
        <p class="muted" style="margin-top:8px">We'd still love your feedback — just reply to our email or
        text ${SHOP_PHONE}.</p></div>`));
    }
    const r = rows[0];
    if (r.submitted_at) {
      return res.send(quotePage('Thank you', `
        <div class="card"><h1>Thanks — we have your review</h1>
        <p class="muted" style="margin-top:8px">You rated us ${STAR(r.rating || 0)}. We appreciate you taking the time.</p>
        ${GOOGLE_REVIEW_URL ? `<p style="margin-top:14px">
          <a class="btn${r.rating >= 4 ? '' : ' btn-ghost'}" href="${escEmail(GOOGLE_REVIEW_URL)}"
             target="_blank" rel="noopener">Share it on Google →</a></p>` : ''}
        </div>`));
    }

    res.send(quotePage('How did we do?', `
      <div class="card">
        <h1>How did we do?</h1>
        <div class="sub">${r.name ? escEmail(String(r.name).split(' ')[0]) + ', your' : 'Your'} feedback helps a small Chicago shop.</div>
        <form method="POST" action="/review/${escEmail(token)}">
          <label>Your rating</label>
          <div class="stars-pick" style="display:flex;gap:6px;margin-bottom:6px">
            ${[1,2,3,4,5].map(n => `
              <label style="flex:1;text-align:center;margin:0;cursor:pointer">
                <input type="radio" name="rating" value="${n}" ${pre === n ? 'checked' : ''} required
                       style="position:absolute;opacity:0;width:0" onchange="pick(${n})">
                <span class="st" data-n="${n}"
                      style="display:block;font-size:30px;line-height:1.1;color:#d6dae5">★</span>
              </label>`).join('')}
          </div>
          <label>A short headline</label>
          <input name="title" maxlength="80" placeholder="e.g. Great job on the hats">
          <label>What stood out?</label>
          <textarea name="body" rows="4" maxlength="1200" placeholder="Anything you'd tell a friend"></textarea>
          <label>Name to show <span style="text-transform:none;font-weight:400">(first name and initial is fine)</span></label>
          <input name="name" value="${escEmail(r.name || '')}" maxlength="60">

          <div id="rvphoto">
            <label style="margin-top:14px">Add a photo <span style="text-transform:none;font-weight:400">(optional)</span></label>
            <p class="muted" style="margin:-2px 0 6px;font-size:13px">A picture of your order says more than we ever could.</p>
            <input type="file" id="rvfi" accept="image/*" multiple style="padding:8px;font-size:13px">
            <div id="rvthumbs" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"></div>
            <p class="muted" id="rvstat" style="margin-top:6px;font-size:12.5px"></p>
          </div>
          <input type="hidden" name="images" id="rvim" value="">

          ${turnstileWidget()}
          <button type="submit" id="rvgo" style="width:100%;margin-top:14px">Send my review</button>
        </form>
        <p class="muted" style="margin-top:10px;text-align:center">We read every one. Nothing is published without your name as you enter it here.</p>
      </div>
      <script>
        function pick(n){
          document.querySelectorAll('.st').forEach(function(s){
            s.style.color = Number(s.dataset.n) <= n ? '#F4A623' : '#d6dae5';
          });
        }
        ${pre ? `pick(${pre});` : ''}

        /* Photo upload. Signed server-side so the API secret never reaches the
           browser, and the submit button is held while uploads are in flight so
           a review cannot be sent with half its photos missing. */
${uploadStatusScript()}

        var CLOUD = ${JSON.stringify(process.env.CLOUDINARY_NAME || '')};
        var CKEY  = ${JSON.stringify(process.env.CLOUDINARY_API_KEY || '')};
        var shots = [], pending = 0, failed = 0, reason = '';
        var fi = document.getElementById('rvfi');
        var go = document.getElementById('rvgo');
        var stat = document.getElementById('rvstat');

        /* Hide the photo field, NOT fi.parentNode — the file input sits
           directly inside <form>, so hiding its parent hid the rating, the
           text boxes and the send button along with it. An unset
           CLOUDINARY_NAME would have taken the entire review page down and
           left customers looking at a heading with no form under it. */
        if (!CLOUD || !CKEY) { document.getElementById('rvphoto').style.display = 'none'; }

        function say(){
          stat.textContent = uploadStatus(pending, shots.length, failed, reason);
          stat.style.color = failed ? '#b45309' : '';
          go.disabled = pending > 0;
          go.style.opacity = pending > 0 ? '.6' : '';
          /* Say what the button will actually do. A review is worth more than
             its photo, so a failure never blocks sending — but it must not be
             sent believing the photo went too. */
          go.textContent = (!pending && failed)
            ? 'Send my review without the photo' + (failed > 1 ? 's' : '')
            : 'Send my review';
          document.getElementById('rvim').value = JSON.stringify(shots);
        }

        fi.onchange = function(){
          Array.prototype.forEach.call(fi.files, function(file){
            /* Both of these used to drop the file on the floor — the type
               check said nothing at all, and the size message was written
               straight to the status line, where the next say() erased it. */
            if (!/^image\\//.test(file.type)) {
              failed++; reason = 'only image files can be attached'; say(); return;
            }
            if (file.size > 10 * 1024 * 1024) {            // 10MB is plenty for a phone photo
              failed++; reason = 'photos must be under 10MB'; say(); return;
            }
            pending++; say();
            var ts = Math.round(Date.now()/1000);
            fetch('/api/cloudinary-signature', {
              method: 'POST', headers: {'Content-Type':'application/json'},
              body: JSON.stringify({ folder: 'review_photos', timestamp: ts })
            }).then(function(r){
              /* A 503 here is JSON too — {error:'Cloudinary not configured'} —
                 so parsing alone never throws and the missing signature was
                 only noticed when Cloudinary rejected the upload two steps
                 later. Check the status. */
              if (!r.ok) throw new Error('signature unavailable');
              return r.json();
            }).then(function(sig){
              if (!sig.signature) throw new Error('signature unavailable');
              var fd = new FormData();
              fd.append('file', file);
              fd.append('api_key', CKEY);
              fd.append('timestamp', sig.timestamp);
              fd.append('folder', sig.folder);
              fd.append('signature', sig.signature);
              return fetch('https://api.cloudinary.com/v1_1/'+CLOUD+'/image/upload',
                { method:'POST', body: fd });
            }).then(function(r){ return r.json(); }).then(function(d){
              /* No else meant a rejection that still came back 200 vanished
                 without even reaching the catch. */
              if (!d.secure_url) throw new Error('upload rejected');
              shots.push(d.secure_url);
              var im = document.createElement('img');
              im.src = d.secure_url.replace('/upload/','/upload/c_fill,w_150,h_150,q_auto,f_auto/');
              im.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:8px';
              document.getElementById('rvthumbs').appendChild(im);
            }).catch(function(e){
              /* Counted, not written to the status line — say() renders it, so
                 it survives the next repaint instead of being wiped by it. */
              failed++;
              reason = /signature/.test(e && e.message || '')
                ? 'our photo service is down right now' : 'the upload was rejected';
            }).then(function(){ pending--; say(); });
          });
          fi.value = '';
        };
      </script>
    `));
  } catch (err) {
    console.error('review page failed:', err.message);
    res.status(500).send(quotePage('Something went wrong',
      `<div class="card"><div class="warn">Please try again shortly.</div></div>`));
  }
});

/* Submission. 4-5 stars are invited to Google; 1-3 stay private and alert June. */
app.post('/review/:token', orderRateLimit, verifyTurnstile, async (req, res) => {
  const token = String(req.params.token || '');
  const b = req.body || {};
  const rating = Math.max(1, Math.min(5, parseInt(b.rating, 10) || 0));

  /* Accept only our own Cloudinary URLs. The browser posts this field, so an
     arbitrary URL would otherwise be stored and later rendered. */
  let shots = [];
  try {
    const parsed = JSON.parse(b.images || '[]');
    if (Array.isArray(parsed)) {
      shots = parsed
        .filter(u => typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(u))
        .slice(0, 6);
    }
  } catch { shots = []; }

  try {
    const { rows } = await pool.query(
      `UPDATE reviews SET rating=$2, title=$3, body=$4, name=COALESCE(NULLIF($5,''), name),
              images=$6::jsonb, submitted_at=NOW()
        WHERE token=$1 AND submitted_at IS NULL RETURNING *`,
      [token, rating,
       String(b.title || '').trim().slice(0, 80),
       String(b.body || '').trim().slice(0, 1200),
       String(b.name || '').trim().slice(0, 60),
       JSON.stringify(shots)]);

    if (rows.length) {
      const r = rows[0];
      _revCache = { at: 0, rows: [] };          // force a refresh
      sendEmail({
        to: SHOP_EMAIL,
        replyTo: r.email || undefined,
        subject: `${rating >= 4 ? '⭐' : '⚠️'} ${rating}-star review — ${r.name || 'customer'}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:${rating >= 4 ? '#166534' : '#b45309'}">${STAR(rating)} ${rating}/5</h2>
          <p><b>${escEmail(r.title || '')}</b></p>
          <p style="color:#374151;line-height:1.6">${escEmail(r.body || '')}</p>
          <p style="color:#6b7280;font-size:13px">${escEmail(r.name || '')} ${escEmail(r.email || '')} ${escEmail(r.phone || '')}</p>
          ${shots.length ? `<p style="margin:10px 0">${shots.map(u =>
            `<img src="${escEmail(u.replace('/upload/', '/upload/c_fill,w_260,h_260,q_auto,f_auto/'))}"
                  width="130" style="border-radius:8px;margin:0 6px 6px 0">`).join('')}</p>` : ''}
          ${rating <= 3 ? `<p style="background:#fdecea;padding:12px;border-radius:8px;color:#b71c1c">
            <b>Reach out today.</b> Nothing is published on jtees.net without your approval, but they were
            offered the Google link like everyone else — so this may go public. You have heard it first,
            which is the whole point of getting this email.</p>` : `
            <p><a href="${PUBLIC_BASE_URL}/admin/reviews">Approve it for the website →</a></p>`}
        </div>`,
      }).catch(e => console.error('review alert failed:', e.message));
    }

    const thanks = (extra) => quotePage('Thank you', `
      <div class="card">
        <h1>Thank you${rows.length && rows[0].name ? ', ' + escEmail(String(rows[0].name).split(' ')[0]) : ''}!</h1>
        <p class="muted" style="margin-top:8px">${extra}</p>
      </div>`);

    /* Everyone is offered Google, whatever they rated.
       This used to appear only at 4+, which is review gating: Google's review
       policy forbids selectively soliciting positive reviews, and the FTC
       Consumer Reviews Rule (in force 2024-10-21) treats it as a deceptive
       practice. It also did not work as intended — an unhappy customer who
       wants to post publicly simply goes to Google directly, so the gate
       suppressed nothing and only cost the shop the chance to respond first.

       What DOES help is already happening above: the alert lands with June the
       moment the rating is submitted, before anything is posted anywhere. The
       warmth of the wording differs by rating, which is honest; the path is
       offered either way, which is the part that matters. */
    if (GOOGLE_REVIEW_URL) {
      const happy = rating >= 4;
      return res.send(quotePage('Thank you', `
        <div class="card" style="text-align:center">
          <div style="font-size:34px;color:#F4A623">${STAR(rating)}</div>
          <h1 style="margin-top:8px">${happy ? 'Thank you!' : 'Thank you for telling us'}</h1>
          <p class="muted" style="margin:8px 0 16px">${happy
            ? 'Would you mind sharing that on Google? It genuinely helps people find a small shop like ours.'
            : `${SHOP_SIGNER} will be in touch personally to put this right — and if you would like to post
               publicly as well, the link is here.`}</p>
          <a class="btn${happy ? '' : ' btn-ghost'}" href="${escEmail(GOOGLE_REVIEW_URL)}"
             target="_blank" rel="noopener" style="width:100%">${
            happy ? 'Post it on Google →' : 'Post a review on Google →'}</a>
          <p class="muted" style="margin-top:12px;font-size:12px">${happy
            ? 'Takes about 20 seconds.'
            : `Or reply to our email, or text ${SHOP_PHONE}.`}</p>
        </div>`));
    }
    res.send(thanks(rating >= 4
      ? 'We really appreciate it.'
      : `Sorry we fell short — ${SHOP_SIGNER} will be in touch personally to put it right.`));
  } catch (err) {
    console.error('review submit failed:', err.message);
    res.status(500).send(quotePage('Something went wrong',
      `<div class="card"><div class="warn">Please try again shortly.</div></div>`));
  }
});

/* ── Queuing a review ask ────────────────────────────────────────────────────
   Two delays, because there are two moments worth asking from and only one of
   them is guaranteed to happen.

   PAYMENT is the floor. It always occurs and always carries an email address,
   so every paying customer gets asked eventually. It is also the less accurate
   moment: the goods do not exist yet.

   DELIVERY is the accurate trigger, and it is optional in practice — the whole
   review system sat at zero rows for its entire life because its only trigger
   was an order status nobody ever set. So delivery does not CREATE the ask, it
   RESCHEDULES the one payment already queued, to a few days after the customer
   actually had the thing in their hands. */
const REVIEW_DAYS_AFTER_PAYMENT  = () =>
  Math.max(0, parseInt(process.env.JT_REVIEW_AFTER_PAYMENT_DAYS || '14', 10));
const REVIEW_DAYS_AFTER_DELIVERY = () =>
  Math.max(0, parseInt(process.env.JT_REVIEW_DELAY_DAYS || '3', 10));

/** The row this order or quote already has waiting, if any. Sent rows are
 *  deliberately excluded: a returning customer should be askable again. */
const PENDING_REVIEW_WHERE = `
  (($1::text IS NOT NULL AND order_ref  = $1)
    OR ($2::text IS NOT NULL AND quote_code = $2))
  AND sent_at IS NULL AND submitted_at IS NULL`;

/** Queue an ask, unless one is already waiting for this order or quote.
 *  Never throws — a review is never worth failing a payment over. */
async function queueReviewRequest({ name, email, phone, product, order_ref, quote_code, days }) {
  if (!isValidEmail(String(email || ''))) return false;
  if (!order_ref && !quote_code) return false;
  try {
    const { rowCount } = await pool.query(
      `INSERT INTO reviews (token,name,email,phone,product,order_ref,quote_code,requested_at)
       SELECT $3,$4,$5,$6,$7,$1,$2, NOW() + ($8 || ' days')::interval
        WHERE NOT EXISTS (SELECT 1 FROM reviews WHERE ${PENDING_REVIEW_WHERE})`,
      [order_ref || null, quote_code || null, reviewToken(), name || '',
       String(email), phone || '', product || '', String(Math.max(0, Number(days) || 0))]);
    if (rowCount) {
      console.log(`review queued for ${order_ref ? 'order ' + order_ref : 'quote ' + quote_code}`
        + ` in ${days} day(s)`);
    }
    return rowCount > 0;
  } catch (e) {
    console.error('review queue failed:', e.message);
    return false;
  }
}

/** Move a waiting ask to `days` from now. Used when delivery is recorded: the
 *  payment-time date was a guess, this one is not. Falls back to queuing if
 *  nothing is waiting — an order paid before this code shipped still gets asked.
 *  A row already sent is left alone; the customer has had their email. */
async function rescheduleReviewRequest({ name, email, phone, product, order_ref, quote_code, days }) {
  try {
    const { rowCount } = await pool.query(
      `UPDATE reviews SET requested_at = NOW() + ($3 || ' days')::interval
        WHERE ${PENDING_REVIEW_WHERE}`,
      [order_ref || null, quote_code || null, String(Math.max(0, Number(days) || 0))]);
    if (rowCount) {
      console.log(`review rescheduled for ${order_ref ? 'order ' + order_ref : 'quote ' + quote_code}`
        + ` to ${days} day(s) out`);
      return true;
    }
    return queueReviewRequest({ name, email, phone, product, order_ref, quote_code, days });
  } catch (e) {
    console.error('review reschedule failed:', e.message);
    return false;
  }
}

/* Ask a customer for a review. Called after delivery. */
async function requestReview({ token, name, email, phone, product, order_ref, quote_code }) {
  if (!isValidEmail(String(email || ''))) return null;
  if (!token) {
    token = reviewToken();
    await pool.query(
      `INSERT INTO reviews (token,name,email,phone,product,order_ref,quote_code,requested_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [token, name || '', email, phone || '', product || '', order_ref || null, quote_code || null]);
  }

  const link = `${PUBLIC_BASE_URL}/review/${token}`;
  const stars = [1,2,3,4,5].map(n =>
    `<a href="${link}?r=${n}" style="text-decoration:none;font-size:30px;color:#F4A623">★</a>`).join(' ');

  const first = name ? escEmail(String(name).split(' ')[0]) : '';

  /* "How did we do?" reads as an automated survey; "How did your order turn
     out?" is a person asking about a specific thing they made.

     The product name is deliberately NOT here. The stored values are supplier
     catalogue names — "Valucap Bio-Washed Classic Dad Hat - VC300A",
     "Comfort Colors T-shirt - Navy Blue", "Shirt with photo" — and no customer
     thinks of their order that way. Naming it made the sentence read like a
     picking list, which is worse than not naming it at all. */
  const subject = `How did your order turn out${first ? ', ' + String(name).split(' ')[0] : ''}?`;

  await sendEmail({
    to: email,
    subject,
    html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:8px">
      <!-- Preview text: what the inbox shows beside the subject. Hidden in the
           body so it never renders twice. -->
      <div style="display:none;max-height:0;overflow:hidden;opacity:0">One tap, no form, no account.</div>

      <p style="color:#374151;line-height:1.7;margin:0 0 14px">${first ? 'Hi ' + first + ',' : 'Hi,'}</p>

      <p style="color:#374151;line-height:1.7;margin:0 0 14px">Your order went out a little while ago —
        I hope it has had some use by now.</p>

      <p style="color:#374151;line-height:1.7;margin:0 0 6px">If it turned out well, would you tap a star?
        One click, no form, no account.</p>

      <p style="text-align:center;margin:20px 0 6px;line-height:1">${stars}</p>
      <p style="text-align:center;margin:0 0 22px"><a href="${link}"
         style="color:#6b7280;font-size:13px;text-decoration:underline">or write a few words &rarr;</a></p>

      <p style="color:#374151;line-height:1.7;margin:0 0 18px">Reviews are genuinely how a small Chicago shop
        gets found instead of a big online printer. It takes about ten seconds and it helps more than you would think.</p>

      <p style="color:#374151;line-height:1.7;margin:0 0 4px">Thank you,</p>
      <p style="color:#111827;line-height:1.7;margin:0 0 22px;font-weight:600">${SHOP_SIGNER}</p>

      <!-- The safety valve stays, but as a P.S. — the second most-read line in
           any email, and the place an unhappy customer will actually see it. -->
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0 0 18px;padding-top:14px;border-top:1px solid #eef1f8">
        <strong>P.S.</strong> If anything was not right, just reply here or text me at ${SHOP_PHONE} —
        I would far rather fix it than leave you unhappy.</p>

      <p style="color:#9ca3af;font-size:12px;margin:0">${SHOP_NAME} &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
    </div>`,
  });
  return token;
}

/* Public feed for the storefront + schema. */
app.get('/api/reviews', async (req, res) => {
  const rows = await approvedReviews(parseInt(req.query.limit, 10) || 20);
  const count = rows.length;
  const avg = count ? Math.round((rows.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : null;
  res.set('Cache-Control', 'public, max-age=600');
  res.json({
    count, average: avg,
    reviews: rows.map(r => ({
      name: r.name, rating: r.rating, title: r.title, body: r.body,
      product: r.product, date: r.submitted_at,
    })),
  });
});

/* June approves what appears publicly. */
app.get('/admin/reviews', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 200`);
    const body = rows.map(r => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <div><b>${escEmail(r.title || '(no headline)')}</b>
            <div class="muted">${escEmail(r.name || 'anonymous')} &middot; ${fmtDate(r.submitted_at)}
              ${r.product ? '&middot; ' + escEmail(r.product) : ''}</div></div>
          <div style="color:#F4A623;white-space:nowrap">${STAR(r.rating || 0)}</div>
        </div>
        <p style="margin-top:8px;color:#46505f">${escEmail(r.body || '')}</p>
      ${(Array.isArray(r.images) && r.images.length) ? `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          ${r.images.filter(u => typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(u))
            .map(u => `<a href="${escEmail(u)}" target="_blank" rel="noopener">
              <img src="${escEmail(u.replace('/upload/', '/upload/c_fill,w_220,h_220,q_auto,f_auto/'))}"
                   style="width:96px;height:96px;object-fit:cover;border-radius:8px;border:1px solid #e3e8f2"
                   loading="lazy"></a>`).join('')}
        </div>` : ''}
        <form method="POST" action="/admin/reviews/${r.id}" style="margin-top:10px;display:flex;gap:8px">
          <button name="action" value="${r.approved ? 'hide' : 'approve'}"
            class="${r.approved ? 'btn-ghost' : ''}" style="padding:8px 18px;font-size:14px">
            ${r.approved ? 'Hide from site' : 'Approve for site'}</button>
          <span class="chip" style="align-self:center;background:${r.approved ? '#e7f6ec' : '#eef1f8'};color:${r.approved ? '#166534' : '#6b7280'}">
            ${r.approved ? 'live' : 'not shown'}</span>
        </form>
      </div>`).join('');
    const live = rows.filter(r => r.approved).length;
    const avg = rows.length ? (rows.reduce((a, r) => a + (r.rating || 0), 0) / rows.length).toFixed(1) : '—';

    /* Customers who paid before any of this was wired up, and were never asked.
       Paid in full only: asking somebody who has put a deposit down is asking
       before the work exists. Nothing sends from rendering this — the ask is
       queued only when June ticks a box and submits, which is the point of
       showing the list at all. */
    const { rows: never } = await pool.query(
      `SELECT q.code, q.name, q.email, q.total, q.paid_amount
         FROM quotes q
        WHERE q.email IS NOT NULL AND q.email <> ''
          AND q.total > 0 AND q.paid_amount >= q.total - 0.005
          AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.quote_code = q.code)
        ORDER BY q.paid_at DESC NULLS LAST, q.id DESC LIMIT 100`);

    const backfill = !never.length ? '' : `
      <div class="card">
        <h2 style="margin:0 0 4px;font-size:18px">Past customers who have never been asked</h2>
        <p class="muted" style="margin:0 0 12px">Paid in full, no review request on file.
           Ticking a box queues the ask on the next hourly sweep — nothing sends from this page.</p>
        <form method="POST" action="/admin/reviews/backfill">
          ${never.map(q => `
            <label style="display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #eef1f8;margin:0;cursor:pointer">
              <input type="checkbox" name="code" value="${escEmail(q.code)}" style="width:auto;margin:0">
              <span style="flex:1"><b>${escEmail(q.code)}</b>
                <span class="muted">&middot; ${escEmail(q.name || 'no name')} &middot; ${escEmail(q.email)}</span></span>
              <span class="muted" style="white-space:nowrap">${money(q.total)}</span>
            </label>`).join('')}
          <button style="margin-top:12px;padding:10px 22px">Queue selected</button>
        </form>
      </div>`;

    res.send(adminPage('Reviews', `<h1>Reviews</h1>
      <div class="sub">${rows.length} received &middot; ${live} live on the site &middot; average ${avg}</div>
      ${backfill}
      ${body || '<div class="card"><p class="muted">No reviews yet.</p></div>'}`, 'reviews'));
  } catch (err) {
    console.error('reviews admin failed:', err.message);
    res.status(500).send(quotePage('Error', '<div class="card"><div class="warn">Could not load reviews.</div></div>'));
  }
});

/* Queue asks for customers who paid before the review flow was wired to
   anything. Registered BEFORE /admin/reviews/:id so 'backfill' is not swallowed
   by the :id route and parsed as NaN. */
app.post('/admin/reviews/backfill', requireAdmin, async (req, res) => {
  const raw = (req.body || {}).code;
  const codes = (Array.isArray(raw) ? raw : [raw])
    .map(c => String(c || '').toUpperCase())
    .filter(c => QUOTE_CODE_RE.test(c));
  let queued = 0;
  for (const code of codes) {
    try {
      const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
      if (!rows.length) continue;
      const q = rows[0];
      /* days: 0 — these jobs are already weeks old, so the ask goes out on the
         next sweep rather than waiting out a delay meant for fresh payments. */
      if (await queueReviewRequest({
        name: q.name, email: q.email, phone: q.phone,
        product: (Array.isArray(q.items) && q.items[0] && q.items[0].description) || '',
        quote_code: code, days: 0,
      })) queued++;
    } catch (e) {
      console.error(`backfill failed for ${code}:`, e.message);
    }
  }
  console.log(`review backfill: queued ${queued} of ${codes.length} selected`);
  res.redirect('/admin/reviews');
});

app.post('/admin/reviews/:id', requireAdmin, async (req, res) => {
  const approve = (req.body || {}).action === 'approve';
  await pool.query('UPDATE reviews SET approved=$2 WHERE id=$1', [parseInt(req.params.id, 10) || 0, approve])
    .catch(e => console.error('review approve failed:', e.message));
  _revCache = { at: 0, rows: [] };
  res.redirect('/admin/reviews');
});

/* ── One-click unsubscribe (RFC 8058) ──────────────────────────────────────
   Gmail/Yahoo require BOTH a GET landing page (for the link in the footer)
   and a POST that unsubscribes without any further interaction (for the
   header button). The token is an HMAC of the address, so an unsubscribe
   link cannot be used to opt out somebody else. */
async function doUnsubscribe(email, source) {
  await pool.query(
    `INSERT INTO email_optouts (email, source) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [String(email).toLowerCase(), source || 'one-click']);
}

app.post('/api/unsubscribe', async (req, res) => {
  const email = String(req.query.e || req.body.e || '').trim().toLowerCase();
  const token = String(req.query.t || req.body.t || '');
  if (!isValidEmail(email) || !unsubTokenValid(email, token)) {
    return res.status(400).json({ error: 'bad token' });
  }
  try {
    await doUnsubscribe(email, 'one-click-post');
    res.json({ ok: true });
  } catch (err) {
    console.error('unsubscribe error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/unsubscribe', async (req, res) => {
  const email = String(req.query.e || '').trim().toLowerCase();
  const token = String(req.query.t || '');
  const page = (title, body) => `<!doctype html><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:12vh auto;padding:0 20px;text-align:center;">
      <h1 style="color:#1848B8;font-size:22px;">${title}</h1>
      <p style="color:#374151;line-height:1.6;">${body}</p>
      <p style="margin-top:26px;"><a href="https://www.jtees.net" style="color:#1848B8;">Back to jtees.net</a></p>
      <p style="color:#9ca3af;font-size:12px;margin-top:30px;">June&rsquo;s Tees &amp; Things &middot; Chicago, IL</p>
    </div>`;
  if (!isValidEmail(email) || !unsubTokenValid(email, token)) {
    return res.status(400).send(page('That link is not valid',
      'Please use the unsubscribe link from a recent email, or reply to any of our emails and we will remove you.'));
  }
  try {
    await doUnsubscribe(email, 'one-click-get');
    res.send(page('You are unsubscribed',
      `We won't send <strong>${escEmail(email)}</strong> any more promotional email. Order receipts for purchases you make will still come through.`));
  } catch (err) {
    console.error('unsubscribe error:', err.message);
    res.status(500).send(page('Something went wrong', 'Please reply to any of our emails and we will remove you by hand.'));
  }
});

/* ── Order emails (transactional — no unsubscribe suppression) ──────────────
   Called by the Lumise designer's save_order() / update_order_status() over
   the shared internal key. Before these existed the shop emailed people who
   ABANDONED a cart but said nothing to people who actually paid. */

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

function orderItemsTable(items) {
  if (!Array.isArray(items) || !items.length) return '';
  const rows = items.map(i => `
    <tr>
      <td style="padding:9px 6px;border-bottom:1px solid #eee;">${escEmail(i.name || 'Custom item')}</td>
      <td style="padding:9px 6px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${money(i.total)}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;">${rows}</table>`;
}

function orderShell({ heading, intro, orderId, items, total, shipping, tax, address, footer }) {
  const lines = [];
  if (Number(shipping) > 0) lines.push(`<tr><td style="padding:3px 6px;text-align:right;color:#6b7280;">Shipping</td><td style="padding:3px 6px;text-align:right;white-space:nowrap;">${money(shipping)}</td></tr>`);
  if (Number(tax) > 0) lines.push(`<tr><td style="padding:3px 6px;text-align:right;color:#6b7280;">Sales tax</td><td style="padding:3px 6px;text-align:right;white-space:nowrap;">${money(tax)}</td></tr>`);
  return `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:8px;">
    <h2 style="color:#1848B8;margin:0 0 4px;">${heading}</h2>
    <p style="color:#6b7280;margin:0 0 18px;font-size:14px;">Order #${escEmail(String(orderId))}</p>
    <p style="color:#374151;line-height:1.6;">${intro}</p>
    ${orderItemsTable(items)}
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${lines.join('')}
      <tr><td style="padding:8px 6px;text-align:right;font-weight:700;border-top:2px solid #111;">Total</td>
          <td style="padding:8px 6px;text-align:right;font-weight:700;border-top:2px solid #111;white-space:nowrap;">${money(total)}</td></tr>
    </table>
    ${address ? `<p style="color:#6b7280;font-size:13px;margin-top:16px;"><strong style="color:#374151;">Ship to</strong><br>${escEmail(address)}</p>` : ''}
    ${footer}
    <p style="color:#9ca3af;font-size:12px;margin-top:26px;border-top:1px solid #eee;padding-top:12px;">
      June&rsquo;s Tees &amp; Things &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657<br>
      Questions? Reply to this email or text (773) 849-1854.</p>
  </div>`;
}

// Customer receipt
app.post('/api/order-confirmation', requireInternalKey, async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'bad email' });
    const name = String(b.name || '').trim();
    await sendEmail({
      to: email,
      subject: `Thanks${name ? ', ' + name.split(' ')[0] : ''}! Order #${b.order_id} is in 🎉`,
      html: orderShell({
        heading: 'Thank you for your order!',
        intro: `We&rsquo;ve got it and we&rsquo;re on it. You&rsquo;ll hear from us again as soon as it ships &mdash; most orders print and go out within 7&ndash;10 business days. Need it sooner? Just reply, rush is often possible.`,
        orderId: b.order_id, items: b.items, total: b.total,
        shipping: b.shipping, tax: b.tax, address: b.address,
        footer: `<p style="color:#374151;line-height:1.6;">We print every order ourselves right here in Chicago &mdash; thanks for supporting a small shop.</p>`,
      }),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('order-confirmation error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

// Shop's own new-order alert
app.post('/api/order-notification', requireInternalKey, async (req, res) => {
  try {
    const b = req.body || {};
    const to = String(b.to || SHOP_EMAIL || '').trim();
    if (!isValidEmail(to)) return res.status(400).json({ error: 'bad recipient' });
    await sendEmail({
      to,
      replyTo: isValidEmail(String(b.email || '')) ? String(b.email) : undefined,
      subject: `🧾 New order #${b.order_id} — ${money(b.total)}`,
      html: orderShell({
        heading: 'New order received',
        intro: `<strong>${escEmail(b.name || 'A customer')}</strong>${b.email ? ` (${escEmail(b.email)})` : ''} just checked out${b.payment ? ` via ${escEmail(b.payment)}` : ''}.`,
        orderId: b.order_id, items: b.items, total: b.total,
        shipping: b.shipping, tax: b.tax, address: b.address,
        footer: `<p style="margin:18px 0;"><a href="https://design.jtees.net/admin.php?lumise-page=order&order_id=${encodeURIComponent(b.order_id)}" style="background:#1848B8;color:#fff;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:100px;display:inline-block;">Open in admin →</a></p>`,
      }),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('order-notification error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

// "Your order shipped" — and the review ask that rides on it.
/* The designer calls this when an order reaches a milestone the customer would
   recognise. `status` says which one:

     shipped   → the customer gets the "on the way" notice, and a review is queued
     complete  → review only, no notice

   Both queue the ask because `shipped` alone never fires in practice: as of
   2026-08-27 no order had ever carried that status — the statuses on file were
   cancel x3 and complete x1 — so the review queue had stayed empty since the
   day it was written. An ask that depends on a status nobody sets is an ask
   that never happens.

   `status` is optional and defaults to 'shipped', so a designer build that
   predates this keeps its old behaviour exactly. */
app.post('/api/order-shipped', requireInternalKey, async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'bad email' });
    const name = String(b.name || '').trim();
    const tracking = String(b.tracking || '').trim();
    const status = String(b.status || 'shipped').trim().toLowerCase();
    /* Only a real shipment gets the shipping notice. Telling someone their
       order "just left our shop" because it was marked complete is a message
       they will read as a mistake, and rightly. */
    if (status === 'shipped') await sendEmail({
      to: email,
      subject: `Your order #${b.order_id} is on the way 📦`,
      html: orderShell({
        heading: 'It&rsquo;s on the way!',
        intro: `${name ? escEmail(name.split(' ')[0]) + ', y' : 'Y'}our order just left our shop.`
          + (tracking
              ? ` Tracking number: <strong>${escEmail(tracking)}</strong>.`
              : ` We&rsquo;ll follow up with tracking as soon as it&rsquo;s available.`),
        orderId: b.order_id, items: b.items, total: b.total,
        shipping: b.shipping, tax: b.tax, address: b.address,
        footer: tracking
          ? `<p style="margin:18px 0;"><a href="https://www.google.com/search?q=${encodeURIComponent(tracking)}" style="background:#1848B8;color:#fff;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:100px;display:inline-block;">Track my package →</a></p>`
          : '',
      }),
    });
    /* Record the ask as DUE rather than holding a timer — a setTimeout would be
       lost on the next deploy, and this service redeploys often. The hourly
       sweep sends it when the date arrives. */
    if (isValidEmail(String(b.email || ''))) {
      const days = REVIEW_DAYS_AFTER_DELIVERY();
      /* The payment already queued an ask against this order; this moves it to
         the delivery delay rather than adding a second. rescheduleReviewRequest
         falls back to queuing when nothing is waiting, which covers orders paid
         before any of this existed. */
      await rescheduleReviewRequest({
        name: b.name || '', email: String(b.email), phone: b.phone || '',
        product: Array.isArray(b.items) && b.items[0] ? b.items[0].name : '',
        order_ref: String(b.order_id || ''), days,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('order-shipped error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

/* Quote nudges. A quote that is sent and then goes quiet is the most common way
   work is lost, so this chases it — but only in ways that respect the customer:
   ONE follow-up, only if they have not accepted, only while the quote is still
   valid, and never to someone who has opted out. June still texts personally;
   this is the safety net for the ones she does not get back to. */
async function sendQuoteFollowUps() {
  const days = Math.max(1, parseInt(process.env.JT_QUOTE_FOLLOWUP_DAYS || '3', 10));
  try {
    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE accepted_at IS NULL
          AND followed_up_at IS NULL
          AND status IN ('sent','viewed')
          AND created_at <= NOW() - ($1 || ' days')::interval
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
          AND email <> ''
        LIMIT 20`, [String(days)]);

    for (const q of rows) {
      // Mark first: a send that throws must not re-fire every hour.
      await pool.query('UPDATE quotes SET followed_up_at=NOW() WHERE id=$1', [q.id]);
      if (await isUnsubscribed(q.email)) continue;

      const msgs = quoteMessages(q);
      const t = quoteTotals(q);
      try {
        await sendEmail({
          to: q.email,
          subject: `Still thinking it over? Quote ${q.code}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#1848B8">Just checking in</h2>
            <p style="color:#374151;line-height:1.6">${escEmail(msgs.followup.split('\n')[0])}</p>
            <p style="text-align:center;margin:22px 0">
              <a href="${quoteLink(q.code)}" style="background:#1848B8;color:#fff;padding:13px 28px;
                 border-radius:100px;text-decoration:none;font-weight:700">View your quote — ${money(t.total)}</a></p>
            <p style="color:#374151;line-height:1.6">Happy to adjust quantities, colours or sizes — just reply
               or text ${SHOP_PHONE}. If the timing is wrong, no problem at all.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_SIGNER} &middot; ${SHOP_PHONE}</p>
          </div>`,
        });
        console.log('quote follow-up sent:', q.code, q.email);
      } catch (e) {
        console.error('quote follow-up failed', q.code, e.message);
      }
    }
  } catch (e) {
    console.error('quote follow-up sweep failed:', e.message);
  }
}

/* Accepted but never paid. This is the expensive one — the customer has said
   yes and is waiting on June, while June is waiting on the deposit and nothing
   moves. One reminder, two days after acceptance. */
async function sendDepositReminders() {
  const days = Math.max(1, parseInt(process.env.JT_DEPOSIT_NUDGE_DAYS || '2', 10));
  try {
    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE accepted_at IS NOT NULL
          AND COALESCE(paid_amount,0) = 0
          AND deposit_nudged_at IS NULL
          AND accepted_at <= NOW() - ($1 || ' days')::interval
          AND email <> ''
        LIMIT 20`, [String(days)]);

    for (const q of rows) {
      await pool.query('UPDATE quotes SET deposit_nudged_at=NOW() WHERE id=$1', [q.id]);
      const t = quoteTotals(q);
      try {
        await sendEmail({
          to: q.email,
          subject: `Ready when you are — deposit for quote ${q.code}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#1848B8">We're ready to start</h2>
            <p style="color:#374151;line-height:1.6">
              ${q.name ? escEmail(String(q.name).split(' ')[0]) + ', thanks' : 'Thanks'} for approving your quote.
              We'll get straight on it as soon as the deposit is in — that's what reserves your spot in the
              print schedule.</p>
            <p style="text-align:center;margin:22px 0">
              <a href="${quoteLink(q.code)}" style="background:#1848B8;color:#fff;padding:13px 28px;
                 border-radius:100px;text-decoration:none;font-weight:700">Pay ${money(t.deposit)} deposit</a></p>
            <p style="color:#374151;line-height:1.6">Card, Apple Pay, Zelle to <b>${escEmail(ZELLE_HANDLE)}</b>
               (shows as ${escEmail(ZELLE_NAME)}), or cash — whichever suits. Questions? Just reply or text ${SHOP_PHONE}.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_SIGNER}</p>
          </div>`,
        });
        console.log('deposit reminder sent:', q.code);
      } catch (e) {
        console.error('deposit reminder failed', q.code, e.message);
      }
    }
  } catch (e) {
    console.error('deposit reminder sweep failed:', e.message);
  }
}

/* Deposit is in, the balance is not, and the job is moving. One reminder so the
   balance is not a surprise on pickup day — and so it is not still outstanding
   after the goods have gone, which is the hardest money to collect. */
async function sendBalanceReminders() {
  const days = Math.max(1, parseInt(process.env.JT_BALANCE_NUDGE_DAYS || '7', 10));
  try {
    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE COALESCE(paid_amount,0) > 0
          AND COALESCE(paid_amount,0) < total
          AND balance_nudged_at IS NULL
          AND paid_at <= NOW() - ($1 || ' days')::interval
          AND status <> 'expired'
          AND email <> ''
        LIMIT 20`, [String(days)]);

    for (const q of rows) {
      // Stamp first: a send that throws must not re-fire every hour.
      await pool.query('UPDATE quotes SET balance_nudged_at=NOW() WHERE id=$1', [q.id]);
      if (await isUnsubscribed(q.email)) continue;

      const due = round2(Math.max(0, Number(q.total) - Number(q.paid_amount || 0)));
      try {
        await sendEmail({
          to: q.email,
          subject: `Balance on quote ${q.code} — ${money(due)}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#1848B8">Nearly there</h2>
            <p style="color:#374151;line-height:1.6">Hi ${escEmail(String(q.name || '').split(' ')[0] || 'there')} —
               your order is moving along. The remaining balance is
               <b>${money(due)}</b>, due ${BALANCE_WHEN}.</p>
            <p style="text-align:center;margin:22px 0">
              <a href="${quoteLink(q.code)}" style="background:#1848B8;color:#fff;padding:13px 28px;
                 border-radius:100px;text-decoration:none;font-weight:700">Pay the balance</a></p>
            <p style="color:#374151;line-height:1.6">Prefer Zelle? Send to ${SHOP_PHONE} and reply to let me know.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_SIGNER} &middot; ${SHOP_PHONE}</p>
          </div>`,
        });
        console.log('balance reminder sent:', q.code, money(due));
      } catch (e) {
        console.error('balance reminder failed', q.code, e.message);
      }
    }
  } catch (e) {
    console.error('balance reminder sweep failed:', e.message);
  }
}

/* A past customer with artwork already on file is the cheapest revenue there is
   — no setup to redo, no price to rediscover. One nudge, months later, and only
   to somebody who actually paid. Marketing, so it honours the opt-out list. */
async function sendReorderNudges() {
  const days = Math.max(30, parseInt(process.env.JT_REORDER_NUDGE_DAYS || '90', 10));
  try {
    const { rows } = await pool.query(
      `SELECT q.* FROM quotes q
        WHERE COALESCE(q.paid_amount,0) >= q.total
          AND q.total > 0
          AND q.reorder_nudged_at IS NULL
          AND q.paid_at <= NOW() - ($1 || ' days')::interval
          AND q.email <> ''
          /* Nothing newer from this customer — a live job means they do not
             need asking, and it would read as though we had not noticed. */
          AND NOT EXISTS (
            SELECT 1 FROM quotes n
             WHERE lower(n.email) = lower(q.email)
               AND n.created_at > q.paid_at)
        LIMIT 20`, [String(days)]);

    for (const q of rows) {
      await pool.query('UPDATE quotes SET reorder_nudged_at=NOW() WHERE id=$1', [q.id]);
      if (await isUnsubscribed(q.email)) continue;

      try {
        await sendEmail({
          to: q.email,
          marketing: true,   // adds the unsubscribe footer and List-Unsubscribe
          subject: `Need another run, ${String(q.name || '').split(' ')[0] || 'there'}?`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#1848B8">Still have your artwork</h2>
            <p style="color:#374151;line-height:1.6">It has been a while since
               ${escEmail(quoteSummary(q.items) || 'your last order')}. Your artwork is still on
               file, so a reorder is quick and there is no setup to redo.</p>
            <p style="color:#374151;line-height:1.6">Just reply with the sizes and quantities you
               need and I will send a quote back.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_SIGNER} &middot; ${SHOP_PHONE}</p>
          </div>`,
        });
        console.log('reorder nudge sent:', q.code, q.email);
      } catch (e) {
        console.error('reorder nudge failed', q.code, e.message);
      }
    }
  } catch (e) {
    console.error('reorder nudge sweep failed:', e.message);
  }
}

/* Expire quotes whose validity has passed, so the list reflects reality
   instead of showing stale "sent" rows forever. */
async function expireOldQuotes() {
  try {
    const r = await pool.query(
      `UPDATE quotes SET status='expired'
        WHERE accepted_at IS NULL AND status IN ('sent','viewed','changes')
          AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE`);
    if (r.rowCount) console.log('quotes expired:', r.rowCount);
  } catch (e) {
    console.error('quote expiry failed:', e.message);
  }
}

/**
 * Daily digest: every live job and the one thing each needs next.
 *
 * This is the intake checklist doing its job without anybody opening it. A
 * written guide only works if you go and read it; this arrives, sorted by
 * deadline, and says what to do. Nothing here is new information — it is the
 * same derived checklist the quotes page shows, pushed instead of pulled.
 *
 * Sends once a day. The guard is a row in the database rather than a timer, so
 * a redeploy cannot cause a second send.
 */
async function sendDailyDigest() {
  try {
    const hour = Number(new Date().toLocaleString('en-US',
      { timeZone: process.env.JT_TIMEZONE || 'America/Chicago', hour: '2-digit', hour12: false }));
    if (hour !== Number(process.env.JT_DIGEST_HOUR || 7)) return;

    await pool.query(`CREATE TABLE IF NOT EXISTS jt_digest_log (
      day DATE PRIMARY KEY, sent_at TIMESTAMPTZ DEFAULT NOW())`);
    const claim = await pool.query(
      `INSERT INTO jt_digest_log (day) VALUES (CURRENT_DATE) ON CONFLICT DO NOTHING RETURNING day`);
    if (!claim.rowCount) return;   // already sent today

    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE status <> 'expired' AND delivered_at IS NULL
        ORDER BY COALESCE(needed_by, target_date) NULLS LAST, created_at`);
    if (!rows.length) return;

    const today = new Date(new Date().toDateString());
    const live = rows.map((q) => {
      const cl = quoteChecklist(q);
      const sched = quoteSchedule(q);
      const days = (q.needed_by || q.target_date)
        ? Math.round((new Date(q.needed_by || q.target_date) - today) / 86400000) : null;
      return { q, cl, sched, days };
    }).filter((x) => x.cl.next);           // nothing to do = not in the digest

    if (!live.length) return;

    const overdue = live.filter((x) => x.days !== null && x.days < 0);
    const soon    = live.filter((x) => x.days !== null && x.days >= 0 && x.days <= 3);

    const row = ({ q, cl, sched, days }) => {
      const when = days === null ? 'no deadline set'
        : days < 0 ? `<b style="color:#b91c1c">${-days}d overdue</b>`
        : days === 0 ? '<b style="color:#b45309">due today</b>'
        : `due in ${days}d`;
      /* The slipped step, named. "Late" on the day is useless; "blanks should
         have been ordered 3 days ago" is still actionable. */
      const risk = sched && sched.risks.length
        ? `<div style="color:#b91c1c;font-size:12px;margin-top:3px">⚠ ${
            sched.risks.map(r => `${escEmail(r.label)} was due ${dayShort(r.by)}`).join(' · ')}</div>`
        : '';
      const shipLine = sched && !sched.risks.length && !q.shipped_at
        ? `<div style="color:#6b7280;font-size:11.5px;margin-top:3px">${
            sched.isPickup ? 'ready for pickup by' : 'must ship by'} ${dayShort(sched.ship_by)}${
            q.blanks_ordered_at ? '' : ` · order blanks by ${dayShort(sched.blanks_order_by)}`}</div>`
        : '';
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eef1f6">
          <a href="${quoteLink(q.code)}" style="color:#1848B8;font-weight:600;text-decoration:none">${escEmail(q.code)}</a>
          <span style="color:#6b7280"> ${escEmail(q.name || '')}</span><br>
          <span style="color:#111827;font-size:13px">${escEmail(cl.next.label)}</span>
          <span style="color:#9ca3af;font-size:12px"> — ${escEmail(cl.next.hint)}</span>
          ${risk}${shipLine}
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eef1f6;text-align:right;white-space:nowrap;font-size:12.5px;color:#6b7280">
          ${when}<br><span style="font-size:11.5px">${cl.done}/${cl.of}</span>
        </td></tr>`;
    };

    const atRisk = live.filter((x) => x.sched && x.sched.risks.length);

    await alertShop(
      (atRisk.length ? `⚠️ ${atRisk.length} job${atRisk.length === 1 ? '' : 's'} at risk · ` : '☕ ') +
        `${live.length} job${live.length === 1 ? '' : 's'} need${live.length === 1 ? 's' : ''} you today` +
        (overdue.length ? ` — ${overdue.length} overdue` : ''),
      `<h2 style="color:#1848B8;margin:0 0 2px">Today's jobs</h2>
       <p style="color:#6b7280;font-size:13px;margin:0 0 14px">
         ${atRisk.length ? `<b style="color:#b91c1c">${atRisk.length} behind schedule</b> &middot; ` : ''}
         ${overdue.length ? `<b style="color:#b91c1c">${overdue.length} overdue</b> &middot; ` : ''}
         ${soon.length ? `${soon.length} due within 3 days &middot; ` : ''}
         ${live.length} open</p>
       <table style="width:100%;border-collapse:collapse">${live.map(row).join('')}</table>
       <p style="margin-top:16px"><a href="${PUBLIC_BASE_URL}/quotes"
         style="background:#1848B8;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">Open the board</a></p>
       <p style="color:#9ca3af;font-size:11.5px;margin-top:14px">
         Each line is the next step for that job. Steps the system can answer are
         ticked automatically; the rest you tap on the quotes page.</p>`);

    console.log(`daily digest sent: ${live.length} jobs, ${overdue.length} overdue`);
  } catch (e) {
    console.error('daily digest failed:', e.message);
  }
}

/**
 * Monthly sales tax check.
 *
 * Fires on the 1st: the month just closed, here is what you collected and must
 * remit. Illinois ST-1 is due the 20th, so it also nags on the 15th and the
 * 19th if the period has not been marked paid.
 *
 * The guard is a row keyed on period+kind rather than a timer, so a redeploy
 * or a second worker cannot double-send, and the reminder survives a restart.
 */
async function taxMonthlyCheck() {
  try {
    const tz = process.env.JT_TIMEZONE || 'America/Chicago';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const hour = now.getHours();
    const dom = now.getDate();
    if (hour !== Number(process.env.JT_DIGEST_HOUR || 7)) return;

    const kind = dom === 1 ? 'close' : dom === 15 ? 'due-soon' : dom === 19 ? 'due-tomorrow' : null;
    if (!kind) return;

    // The period being reported: the previous month.
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const period = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;

    const pos = await taxPositionByMonth(36);
    const row = pos.months.find((m) => m.period === period);
    const outstanding = row ? row.outstanding : 0;
    if (outstanding <= 0) return;    // nothing collected, or already remitted

    await pool.query(`CREATE TABLE IF NOT EXISTS jt_tax_reminders (
      period TEXT NOT NULL, kind TEXT NOT NULL, sent_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (period, kind))`);
    const claim = await pool.query(
      `INSERT INTO jt_tax_reminders (period, kind) VALUES ($1,$2)
       ON CONFLICT DO NOTHING RETURNING period`, [period, kind]);
    if (!claim.rowCount) return;

    const subject = kind === 'close'
      ? `🧾 ${periodLabel(period)} closed — set aside ${money(outstanding)} sales tax`
      : kind === 'due-soon'
        ? `🧾 ${money(outstanding)} sales tax due the 20th (${periodLabel(period)})`
        : `⏰ Sales tax due TOMORROW — ${money(outstanding)} for ${periodLabel(period)}`;

    const others = pos.months.filter((m) => m.period !== period && m.outstanding > 0);

    await alertShop(subject,
      `<h2 style="color:#1848B8;margin:0 0 4px">${periodLabel(period)} sales tax</h2>
       <p style="color:#6b7280;font-size:13px;margin:0 0 16px">
         ${kind === 'close' ? 'The month just closed. This is not income — it is the state\'s money sitting in your account.'
           : kind === 'due-soon' ? 'The Illinois ST-1 is due on the 20th.'
           : '<b style="color:#b91c1c">Due tomorrow.</b> A late ST-1 costs a penalty plus interest.'}</p>

       <table style="width:100%;border-collapse:collapse;font-size:14px">
         <tr><td style="padding:8px 0;color:#6b7280">Collected in ${periodLabel(period)}</td>
             <td style="padding:8px 0;text-align:right;font-variant-numeric:tabular-nums">${money(row.collected)}</td></tr>
         ${row.remitted > 0 ? `<tr><td style="padding:0 0 8px;color:#6b7280">Already remitted</td>
             <td style="padding:0 0 8px;text-align:right;font-variant-numeric:tabular-nums">−${money(row.remitted)}</td></tr>` : ''}
         <tr><td style="padding:10px 0;border-top:2px solid #111827;font-weight:700">To remit</td>
             <td style="padding:10px 0;border-top:2px solid #111827;text-align:right;font-weight:700;font-size:20px;font-variant-numeric:tabular-nums">${money(outstanding)}</td></tr>
       </table>

       ${others.length ? `<p style="color:#b45309;font-size:13px;margin-top:14px">
         <b>Also unpaid:</b> ${others.map((m) => `${periodLabel(m.period)} ${money(m.outstanding)}`).join(' · ')}<br>
         <b>Total to have on hand: ${money(pos.setAside)}</b></p>` : ''}

       <p style="margin-top:18px">
         <a href="https://mytax.illinois.gov" style="background:#1848B8;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block">File on MyTax Illinois</a>
         <a href="${PUBLIC_BASE_URL}/tax.csv" style="color:#1848B8;margin-left:14px">Download the detail</a></p>
       <p style="color:#9ca3af;font-size:11.5px;margin-top:14px">
         Once you have filed, record it on the quotes page so this stops chasing you
         and the running balance stays right.</p>`);

    console.log(`tax reminder sent: ${period} ${kind} ${money(outstanding)}`);
  } catch (e) {
    console.error('tax monthly check failed:', e.message);
  }
}

/* Shipping method and tracking. Method matters beyond record-keeping: a pickup
   has no transit time, so the backwards schedule gives you the extra days back
   instead of chasing you for a ship date that does not exist. */
app.post('/quote/:code/shipping', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/quotes');
  const b = req.body || {};
  const method = ['pickup', 'ground', 'expedited'].includes(String(b.ship_method))
    ? String(b.ship_method) : null;
  const tracking = String(b.tracking || '').trim().slice(0, 120);
  try {
    const { rows } = await pool.query(
      `UPDATE quotes SET ship_method = COALESCE($2, ship_method),
                         tracking    = COALESCE(NULLIF($3,''), tracking)
        WHERE code = $1 RETURNING *`, [code, method, tracking]);

    /* A tracking number is worth nothing sitting in a database — send it. */
    const q = rows[0];
    if (q && tracking && q.email && tracking !== String(b.prev_tracking || '')) {
      sendEmail({
        to: q.email,
        subject: `Your order has shipped — ${q.code}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#1848B8">On its way</h2>
          <p style="color:#374151;line-height:1.6">Your order for quote ${escEmail(q.code)} has shipped.</p>
          <p style="color:#374151;line-height:1.6">Tracking: <b>${escEmail(tracking)}</b></p>
          <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_PHONE}</p></div>`,
      }).catch((e) => console.error('tracking email failed:', e.message));
    }
  } catch (err) {
    console.error('shipping update failed:', err.message);
  }
  res.redirect('/quotes');
});

/* Enter what a job cost. Blank fields are left alone rather than zeroed, so
   filling in the blanks invoice later does not wipe the supplies figure. */
app.post('/quote/:code/costs', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/quotes');
  const b = req.body || {};
  const num = (v) => {
    const s = String(v == null ? '' : v).trim();
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? round2(n) : null;
  };
  try {
    const { rows: cur } = await pool.query('SELECT items FROM quotes WHERE code = $1', [code]);
    if (!cur.length) return res.redirect('/quotes');

    /* Per-line unit costs. Entering a total and apportioning it was wrong:
       a polo and a hoodie on the same order do not cost the same, and asking
       for one number meant doing the multiplication by hand every time.
       The line cost is qty × unit, computed here so nothing has to be worked
       out on paper. */
    const items = (() => {
      try { return typeof cur[0].items === 'string' ? JSON.parse(cur[0].items) : (cur[0].items || []); }
      catch { return []; }
    })();
    const posted = [].concat(b.unit_cost || []);
    const updated = (Array.isArray(items) ? items : []).map((it, ix) => {
      const v = num(posted[ix]);
      return v === null ? it : { ...it, unit_cost: v };
    });
    const blanks = itemisedCost(updated);

    const { rows } = await pool.query(
      `UPDATE quotes SET items           = $2::jsonb,
                         cost_blanks     = $3,
                         cost_supplies   = COALESCE($4, cost_supplies),
                         cost_outsourced = COALESCE($5, cost_outsourced),
                         cost_shipping   = COALESCE($6, cost_shipping),
                         blanks_supplier = COALESCE(NULLIF($7,''), blanks_supplier),
                         cost_note       = COALESCE(NULLIF($8,''), cost_note)
        WHERE code = $1 RETURNING *`,
      [code, JSON.stringify(updated), blanks,
       num(b.cost_supplies), num(b.cost_outsourced), num(b.cost_shipping),
       String(b.blanks_supplier || '').trim().slice(0, 80),
       String(b.cost_note || '').trim().slice(0, 200)]);

    /* Learn from what was just entered, so the next job of the same kind
       arrives pre-filled instead of needing the invoice looked up again. */
    if (rows.length) await learnBlankCosts(updated);
  } catch (err) {
    console.error('cost update failed:', err.message);
  }
  res.redirect('/quotes');
});

/* Record a remittance to the state. Closes the period and stops the chasing. */
app.post('/tax/remit', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const period = String(b.period || '').trim();
  const amount = round2(Number(b.amount));
  if (!/^\d{4}-\d{2}$/.test(period) || !(amount > 0)) return res.redirect('/quotes');
  try {
    await pool.query(
      `INSERT INTO tax_remittances (period, amount, paid_at, reference, note)
       VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5)`,
      [period, amount, String(b.paid_at || '').trim() || null,
       String(b.reference || '').trim().slice(0, 120) || null,
       String(b.note || '').trim().slice(0, 200) || null]);
    console.log(`tax remittance recorded: ${period} ${money(amount)}`);
  } catch (err) {
    console.error('tax remit failed:', err.message);
  }
  res.redirect('/quotes');
});

/* Send review requests that have come due. Runs inside the existing hourly
   sweep — no new scheduler, and it survives deploys because the due date lives
   in the database rather than in a timer. */
async function sendDueReviewRequests() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reviews
        WHERE sent_at IS NULL AND submitted_at IS NULL
          AND requested_at IS NOT NULL AND requested_at <= NOW()
          AND email <> '' LIMIT 25`);
    for (const r of rows) {
      // Never mail someone who has opted out.
      if (await isUnsubscribed(r.email)) {
        await pool.query('UPDATE reviews SET sent_at=NOW() WHERE id=$1', [r.id]);
        continue;
      }
      try {
        await requestReview({
          token: r.token, name: r.name, email: r.email, phone: r.phone,
          product: r.product, order_ref: r.order_ref, quote_code: r.quote_code,
        });
        await pool.query('UPDATE reviews SET sent_at=NOW() WHERE id=$1', [r.id]);
        console.log('review request sent:', r.email);
      } catch (e) {
        console.error('review request failed for', r.email, e.message);
        // Mark it anyway so one bad address cannot block the queue forever.
        await pool.query('UPDATE reviews SET sent_at=NOW() WHERE id=$1', [r.id]);
      }
    }
  } catch (e) {
    console.error('review sweep failed:', e.message);
  }
}

/* Supplier catalogue sync — costs, prices and availability from S&S.
 *
 * Runs once a day rather than hourly: supplier costs move in pennies over
 * weeks, and every run is a few hundred API calls against someone else's rate
 * limit. The day is claimed in the database, not held in memory, so a redeploy
 * mid-afternoon cannot make it run a second time.
 *
 * The work is in tools/ssa-sync.js and is run as a child process on purpose:
 * it is the same command that gets run by hand, so the scheduled path and the
 * manual path cannot drift into behaving differently. It also means a crash
 * there cannot take the web server down with it.
 */
async function runSupplierSync() {
  if (!process.env.SSA_ACCOUNT || !process.env.SSA_API_KEY) return;
  if (String(process.env.JT_SUPPLIER_SYNC || '1') !== '1') return;

  /* Its own table rather than jt_digest_log, whose `day` is a DATE primary key
     — a prefixed string key would not cast, and widening that column to share
     it would change a table the digest depends on. */
  await pool.query(`CREATE TABLE IF NOT EXISTS jt_supplier_sync_log (
    day DATE PRIMARY KEY, ran_at TIMESTAMPTZ DEFAULT NOW())`);
  const claim = await pool.query(
    `INSERT INTO jt_supplier_sync_log (day) VALUES (CURRENT_DATE)
     ON CONFLICT DO NOTHING RETURNING day`);
  if (!claim.rowCount) return;                    // already run today

  const vars = JSON.stringify({
    SSA_ACCOUNT: process.env.SSA_ACCOUNT,
    SSA_API_KEY: process.env.SSA_API_KEY,
    MYSQL_PUBLIC_URL: process.env.MYSQL_PUBLIC_URL || process.env.MYSQL_URL,
  });

  return await new Promise((resolve) => {
    const child = require('child_process').spawn(
      process.execPath, [path.join(__dirname, 'tools', 'ssa-sync.js'), '--apply'],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('close', async (code) => {
      const summary = (out.split('\n').filter((l) => /·/.test(l)).pop() || '').trim();
      console.log('supplier sync:', code === 0 ? (summary || 'ok') : 'exit ' + code);

      /* Tell the shop only when something needs a person: a price the guard
         refused to write, a product deactivated, or a failed run. A quiet
         "nothing changed" email every day trains you to ignore the alert. */
      const notable = out.split('\n').filter((l) =>
        /SKIPPED|DEACTIVATING|NOT ON S&S|BACK IN STOCK/.test(l));
      if (code !== 0 || notable.length) {
        await alertShop(
          code !== 0 ? '⚠️ Supplier sync failed' : '📦 Supplier sync needs a look',
          `<pre style="font-size:13px;white-space:pre-wrap">${escEmail(
            (code !== 0 ? err || out : out).slice(0, 4000))}</pre>`);
      }
      resolve(summary);
    });
    child.stdin.end(vars);
  });
}

// Hourly abandoned-cart sweep trigger (the designer PHP does the real work).
// Self-rescheduling with a timeout so a slow sweep can never overlap the next one.
if (process.env.JT_INTERNAL_KEY) {
  /* Each task is isolated. They used to share one try block, so a slow
     designer — the very first call, over the network — swallowed every task
     after it and the digest, the reminders and the review asks silently did
     not run for that hour. A task that throws should cost only itself. */
  const step = async (name, fn) => {
    try { const out = await fn(); if (out) console.log(name + ':', String(out).trim()); }
    catch (e) { console.error(name + ' failed:', e.message); }
  };

  const runSweep = async () => {
    await step('abandoned-cart sweep', async () => {
      const r = await fetch(
        `https://design.jtees.net/jt-cron.php?key=${encodeURIComponent(process.env.JT_INTERNAL_KEY)}`,
        { signal: AbortSignal.timeout(120000) }
      );
      return r.text();
    });
    await step('review asks', sendDueReviewRequests);
    await step('quote follow-ups', sendQuoteFollowUps);
    await step('deposit reminders', sendDepositReminders);
    await step('balance reminders', sendBalanceReminders);
    await step('reorder nudges', sendReorderNudges);
    await step('expire quotes', expireOldQuotes);
    await step('daily digest', sendDailyDigest);
    await step('tax check', taxMonthlyCheck);
    await step('brevo breach check', brevoBreachCheck);
    await step('supplier sync', runSupplierSync);
    setTimeout(runSweep, 60 * 60 * 1000);
  };
  setTimeout(runSweep, 60 * 60 * 1000);
}

// Submit grad order
app.post('/api/submit-order', orderRateLimit, rejectBots, async (req, res) => {
  // Grad ordering is retired — delete this early return to reactivate the
  // handler below, which is kept intact in case the program returns.
  if (!process.env.GRAD_ORDERS_ENABLED) {
    return res.status(410).json({ success: false, error: 'Grad ordering has ended. Visit https://design.jtees.net/ to place a custom order.' });
  }
  try {
    const body = req.body;
    const errors = validateGradOrder(body);
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

    let photos = [];
    try {
      const raw = Array.isArray(body.photos) ? body.photos : (body.photos_json ? JSON.parse(body.photos_json) : []);
      photos = Array.isArray(raw) ? raw.filter(u => typeof u === 'string' && u.startsWith('https://res.cloudinary.com/')).slice(0, 20) : [];
    } catch { photos = []; }

    const orderRef = generateGradRef();
    // Clamp quantities to a sane range so junk input can't produce
    // negative or absurd totals in emails and CRM records.
    const gradQty = (v) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : 0;
    };
    const products = {
      // Apparel
      tee_1to4: gradQty(body.qty_tee_1to4),
      tee_5to9: gradQty(body.qty_tee_5to9),
      family_1to4: gradQty(body.qty_family_1to4),
      family_5to9: gradQty(body.qty_family_5to9),
      hoodie: gradQty(body.qty_hoodie),
      stole: gradQty(body.qty_stole),
      // Signs & Banners
      yard_sign: gradQty(body.qty_yard_sign),
      banner_4x2: gradQty(body.qty_banner_4x2),
      banner_6x3: gradQty(body.qty_banner_6x3),
      // Cutouts & Standees
      bighead_single: gradQty(body.qty_bighead_single),
      bighead_5pk: gradQty(body.qty_bighead_5pk),
      mini_standee: gradQty(body.qty_mini_standee),
      standee: gradQty(body.qty_standee),
      // Arches & Backdrops
      arch: gradQty(body.qty_arch),
      backdrop: gradQty(body.qty_backdrop),
      // Party Favors
      button_4pk: gradQty(body.qty_button_4pk),
      button_10pk: gradQty(body.qty_button_10pk),
      magnet: gradQty(body.qty_magnet),
      sticker: gradQty(body.qty_sticker),
      chipbag_6: gradQty(body.qty_chipbag_6),
      chipbag_12: gradQty(body.qty_chipbag_12),
      gable_box: gradQty(body.qty_gable_box),
      // Drinkware
      tumbler: gradQty(body.qty_tumbler),
      cup_4pk: gradQty(body.qty_cup_4pk),
      can_cooler: gradQty(body.qty_can_cooler),
      koozie: gradQty(body.qty_koozie),
      // Prom Night
      step_repeat: gradQty(body.qty_step_repeat),
      prom_arch: gradQty(body.qty_prom_arch),
      photo_props: gradQty(body.qty_photo_props),
      prom_decal: gradQty(body.qty_prom_decal),
    };
    const apparel = {
      shirt_qty: gradQty(body.shirt_qty), print_method: body.print_method || '',
      sizes: {
        youth_s: parseInt(body.size_ys) || 0, youth_m: parseInt(body.size_ym) || 0,
        youth_l: parseInt(body.size_yl) || 0, youth_xl: parseInt(body.size_yxl) || 0,
        adult_s: parseInt(body.size_as) || 0, adult_m: parseInt(body.size_am) || 0,
        adult_l: parseInt(body.size_al) || 0, adult_xl: parseInt(body.size_axl) || 0,
        '2xl': parseInt(body.size_2xl) || 0, '3xl': parseInt(body.size_3xl) || 0,
        '4xl': parseInt(body.size_4xl) || 0, '5xl': parseInt(body.size_5xl) || 0,
      },
      design_notes: body.design_notes || '',
    };
    const designs = {
      senior_night: body['design_senior-night'] || '',
      graduation:   body.design_graduation || '',
      prom:         body.design_prom || '',
      senior_night_name: body['design_name_senior-night'] || '',
      graduation_name:   body.design_name_graduation || '',
      prom_name:         body.design_name_prom || '',
      senior_night_img:  body['design_img_senior-night'] || '',
      graduation_img:    body.design_img_graduation || '',
      prom_img:          body.design_img_prom || '',
    };
    const order = {
      order_ref: orderRef, parent_name: String(body.parent_name).trim(),
      student_name: (body.student_name || '').trim(), email: String(body.email).trim().toLowerCase(),
      phone: (body.phone || '').trim(), school: (body.school || '').trim(),
      event_date: body.event_date || '', needed_by: body.needed_by || '',
      address: (body.address || '').trim(), event_type: String(body.event_type).trim(),
      products, apparel, designs,
      upload_method: body.upload_method || '', upload_link: body.upload_link || '',
      payment_method: body.payment_method || '', notes: (body.notes || '').trim(),
      signature: (body.signature || '').trim(), sign_date: (body.sign_date || '').trim(),
      school_colors: (body.school_colors || '').trim(), photos,
    };

    const rawData = {
      school_colors: order.school_colors,
      sign_date: order.sign_date,
      design_selection: designs,
    };

    await pool.query(
      `INSERT INTO grad_orders
        (order_ref, parent_name, student_name, email, phone, school,
         event_date, needed_by, address, event_type, products, apparel,
         designs, upload_method, upload_link, payment_method, notes, signature, photos, raw_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [order.order_ref, order.parent_name, order.student_name, order.email,
       order.phone, order.school, order.event_date, order.needed_by,
       order.address, order.event_type,
       JSON.stringify(order.products), JSON.stringify(order.apparel), JSON.stringify(order.designs),
       order.upload_method, order.upload_link, order.payment_method,
       order.notes, order.signature, JSON.stringify(order.photos), JSON.stringify(rawData)]
    );

    const [emailResult, confirmResult, hubspotResult, cloverResult] = await Promise.allSettled([
      sendGradOrderEmail(order),
      sendGradOrderConfirmationEmail(order),
      syncGradToBrevo(order),
      createGradCloverCustomerAndOrder(order),
    ]);
    if (emailResult.status   === 'rejected') console.error('Grad notification email failed:', emailResult.reason?.message);
    if (confirmResult.status === 'rejected') console.error('Grad confirmation email failed:',  confirmResult.reason?.message);
    if (hubspotResult.status === 'rejected') console.error('Grad Brevo sync failed:',          hubspotResult.reason?.message, JSON.stringify(hubspotResult.reason?.response?.data));
    if (cloverResult.status  === 'rejected') console.error('Grad Clover sync failed:',         cloverResult.reason?.message, JSON.stringify(cloverResult.reason?.response?.data));

    const idUpdates = [];
    const idValues  = [];
    let   idx       = 1;
    if (hubspotResult.status === 'fulfilled') {
      idUpdates.push(`hubspot_contact_id=$${idx++}`, `hubspot_deal_id=$${idx++}`);
      idValues.push(hubspotResult.value.contactId, hubspotResult.value.dealId);
    }
    if (cloverResult.status === 'fulfilled') {
      idUpdates.push(`clover_customer_id=$${idx++}`, `clover_order_id=$${idx++}`);
      idValues.push(cloverResult.value.cloverCustomerId, cloverResult.value.cloverOrderId);
    }
    if (idUpdates.length) {
      idValues.push(orderRef);
      pool.query(
        `UPDATE grad_orders SET ${idUpdates.join(', ')} WHERE order_ref=$${idx}`,
        idValues
      ).catch(err => console.error('Grad ID update failed:', err.message));
    }

    res.json({ success: true, orderRef });
  } catch (err) {
    console.error('Grad order error:', err);
    res.status(500).json({ success: false, error: 'Failed to save order. Please try again.' });
  }
});

// Grad orders admin
app.get('/api/orders', requireGradAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM grad_orders ORDER BY created_at DESC LIMIT 200');
    res.json(rows);
  } catch (err) {
    console.error('Grad orders fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});
const ORDER_REF_RE = /^ORD-\d{4}-[A-F0-9]{6}$/;

function validateOrderRef(req, res, next) {
  if (!ORDER_REF_RE.test(String(req.params.ref || ''))) {
    return res.status(400).json({ error: 'Invalid order reference format' });
  }
  next();
}

app.get('/api/orders/:ref', requireGradAdmin, validateOrderRef, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM grad_orders WHERE order_ref = $1', [req.params.ref]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Grad order fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to load order.' });
  }
});
app.patch('/api/orders/:ref/status', requireGradAdmin, validateOrderRef, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new','in_review','proof_sent','approved','in_production','shipped','complete'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await pool.query('UPDATE grad_orders SET status = $1 WHERE order_ref = $2', [status, req.params.ref]);
    res.json({ success: true });
  } catch (err) {
    console.error('Status update failed:', err.message);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});
app.patch('/api/orders/:ref/notes', requireGradAdmin, validateOrderRef, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    if (typeof admin_notes !== 'string' || admin_notes.length > 5000) return res.status(400).json({ error: 'Invalid notes' });
    await pool.query('UPDATE grad_orders SET admin_notes = $1 WHERE order_ref = $2', [admin_notes, req.params.ref]);
    res.json({ success: true });
  } catch (err) {
    console.error('Notes update failed:', err.message);
    res.status(500).json({ error: 'Failed to update notes.' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

// ─── Global error handler ─────────────────────────────────────────────────────

// Email test — exercises the same Brevo-first path production emails use
app.get('/api/test-email', requireAdmin, async (_req, res) => {
  try {
    await sendEmail({
      to:      NOTIFY_EMAIL,
      subject: 'Email Test — June\'s Tees',
      html:    '<p>Email sending is working correctly.</p>',
    });
    res.json({ success: true, message: `Test email sent to ${NOTIFY_EMAIL}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── 404 catch-all (HTML pages) ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

// Hard-required vars crash the boot; ADMIN_PASSWORD and RESEND_API_KEY stay
// warn-only because a missing one degrades a single feature (admin sign-in,
// the Resend fallback) rather than the storefront itself — crashing the whole
// process over an admin-only misconfiguration would turn that into a customer
// facing outage, which is the opposite of what this check is for.
function validateEnv() {
  /* BREVO_API_KEY is deliberately NOT here. It was, and that made pulling a
     suspect key a choice between leaking and a total outage: unsetting it
     crashed the boot and took the storefront down with it. The app sends fine
     on Resend alone, so a missing Brevo key is a degraded mode, not a fatal
     one — which is what makes "revoke it now, think later" a safe move. */
  const REQUIRED_ENV = ['DATABASE_URL', 'NOTIFICATION_EMAIL'];
  const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]?.trim());
  if (missingEnv.length) {
    console.error('Missing required environment variables:', missingEnv.join(', '));
    process.exit(1);
  }
  /* What actually has to hold is that SOME provider can send. Neither one
     configured is fatal, because silent no-mail is the failure this whole
     area exists to prevent. */
  if (!process.env.BREVO_API_KEY?.trim() && !process.env.RESEND_API_KEY?.trim()) {
    console.error('Missing email provider: set BREVO_API_KEY or RESEND_API_KEY (both absent = no mail can be sent)');
    process.exit(1);
  }
  if (!process.env.BREVO_API_KEY?.trim()) {
    console.warn('WARNING: BREVO_API_KEY is not set — sending via Resend only, and CRM sync is disabled.');
  }
  if (!process.env.RESEND_API_KEY?.trim()) {
    console.warn('WARNING: RESEND_API_KEY is not set — no fallback if Brevo sending fails.');
  }
  if (!process.env.ADMIN_PASSWORD?.trim()) {
    console.warn('WARNING: ADMIN_PASSWORD is not set — admin routes will be inaccessible.');
  }
  // Warn-only for the same reason as the two above: unsubscribe signing
  // degrades marketing email, not the storefront or order receipts, which are
  // transactional and never carry an unsubscribe token.
  if (!unsubSecret()) {
    console.warn('WARNING: neither UNSUB_TOKEN_SECRET nor JT_INTERNAL_KEY is set — ' +
      'marketing email will ship unsubscribe links that cannot be honoured.');
  } else if (!process.env.UNSUB_TOKEN_SECRET?.trim()) {
    console.warn('WARNING: UNSUB_TOKEN_SECRET is not set — unsubscribe links are still ' +
      'signed with JT_INTERNAL_KEY, so rotating that shared key would invalidate every ' +
      'unsubscribe link already delivered. Set UNSUB_TOKEN_SECRET to decouple them.');
  } else if (process.env.JT_INTERNAL_KEY?.trim()) {
    // Not a problem — just the one state that has to end deliberately, since
    // nothing else will ever remind you.
    console.log('unsubscribe: signing with UNSUB_TOKEN_SECRET; still honouring older ' +
      'JT_INTERNAL_KEY links. Remove that fallback once pre-migration mail has aged ' +
      'out, and before rotating JT_INTERNAL_KEY.');
  }
  /* Both of these are states that must END, and nothing but this line will
     ever mention them again. */
  if (process.env.UNSUB_TOKEN_SECRET_PREVIOUS?.trim()) {
    console.log('unsubscribe: also honouring UNSUB_TOKEN_SECRET_PREVIOUS. Delete it ' +
      'once mail signed with the old secret has aged out of inboxes — until then ' +
      'the rotated-away secret still verifies.');
  } else if (process.env.UNSUB_TOKEN_SECRET?.trim()) {
    console.log('unsubscribe: no UNSUB_TOKEN_SECRET_PREVIOUS set. If you rotate ' +
      'UNSUB_TOKEN_SECRET, put the outgoing value there in the same change or every ' +
      'unsubscribe link already delivered stops working the moment it deploys.');
  }
}
validateEnv();

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`Listening on port ${PORT}`)))
  .catch(err => {
    console.error('DB init failed, exiting:', err.message);
    process.exit(1);
  });
