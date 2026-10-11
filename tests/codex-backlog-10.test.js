/* Codex backlog fixes, backend batch 10 (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#161 the designer has a queue for jobs waiting on the customer, and the SOP points at it', () => {
  const q = after('async function artQueues(', 2600);
  assert.match(q, /a\.status = 'needs_info' OR \(q\.proof_sent_at IS NOT NULL AND q\.proof_ok_at IS NULL\)/);
  assert.match(q, /ORDER BY q\.needed_by NULLS LAST/);
  assert.match(q, /return \{ todo, questions, approve, customer \}/);
  assert.match(src, /art\.customer\.length \? section\(`Waiting on the customer \(\$\{art\.customer\.length\}\)`/);
  assert.match(src, /- Each morning, check Waiting on the customer on My Day/);
  assert.match(src, /KB_ADDED\.find\(\(x\) => x\.title === 'Chasing late artwork and approvals'\)/, 'the live SOP is brought up to date');
});

test('#108 each payment keeps whether the sale was exempt when it was banked', () => {
  assert.match(src, /ALTER TABLE quote_payments ADD COLUMN IF NOT EXISTS exempt BOOLEAN/);
  assert.match(src, /UPDATE quote_payments p SET exempt = \(COALESCE\(q\.taxable, q\.tax > 0\) = false\)\s+FROM quotes q WHERE q\.code = p\.quote_code AND p\.exempt IS NULL/);
  const rec = after('async function recordPayment(', 2500);
  assert.match(rec, /exempt = !quoteTaxable\(tq\[0\]\)/);
  assert.match(rec, /tax_portion, created_at, exempt\)/);
  assert.match(after('const { rows: exempt } = await pool.query(', 1200), /WHERE COALESCE\(p\.exempt, COALESCE\(q\.taxable, q\.tax > 0\) = false\)/);
  assert.match(src, /CASE WHEN p\.exempt IS NOT NULL THEN NOT p\.exempt ELSE q\.taxable END AS taxable/, 'the tax export reads it too');
});
