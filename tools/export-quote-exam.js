'use strict';

/* Read-only export of accepted quotes, for building the quote exam
   (tools/lib/courses: real requests the owner has already quoted).

   Run on the server, where DATABASE_URL is set:
     railway ssh -s junesteesnthings-backend -- node tools/export-quote-exam.js

   Prints JSON to stdout. Names, emails, phones and addresses are never
   selected, and emails and phone numbers written into free text (the request,
   item notes) are blanked, so the output can be pasted into a session. It
   only SELECTs. */

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g;
const scrub = (v) => (typeof v === 'string' ? v.replace(EMAIL, '[email]').replace(PHONE, '[phone]')
  : Array.isArray(v) ? v.map(scrub)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) : v);

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(
      `SELECT q.code, q.created_at::date::text AS created_on, q.items, q.subtotal, q.tax, q.taxable, q.total, q.rush_pct,
              q.discount_kind, q.discount_value, (q.needed_by - q.created_at::date) AS days_to_need,
              s.description AS request
         FROM quotes q LEFT JOIN submissions s ON s.id = q.from_submission_id
        WHERE (q.accepted_at IS NOT NULL OR q.paid_amount > 0)
        ORDER BY q.created_at DESC LIMIT 80`);
    process.stdout.write(JSON.stringify(rows.map(scrub)) + '\n');
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error('export failed:', e.message); process.exit(1); });
