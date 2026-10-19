/* New quote / reorder from a customer, and the board's owed figure (owner,
   2026-10-19). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('owed counts only accepted or paid jobs, never cancelled ones or quotes with no answer', () => {
  const q = after('const { rows: openAgg } = await pool.query(', 900);
  assert.match(q, /status NOT IN \('expired', 'held', 'draft', 'cancelled'\) AND cancelled_at IS NULL/);
  assert.match(q, /AND \(accepted_at IS NOT NULL OR COALESCE\(paid_amount,0\) > 0\)/);
});

test('the quote form fills from ?customer= and copies a job from ?reorder=', () => {
  const f = after('async function quoteFormFromCustomer(query)', 1800);
  assert.ok(after("app.get(['/admin/quote/new'", 12000).includes('await quoteFormFromCustomer(req.query)'), 'the form uses it');
  assert.match(f, /QUOTE_CODE_RE\.test\(reorderCode\)/, 'a reorder code is checked before it is looked up');
  assert.match(f, /PARTNERS\.reorderItems\(src\.items\)/, 'lines are copied the way the partners\' reorder copies them');
  assert.match(f, /customerHistory\(customerKey\)/);
  assert.match(src, /\(!isEdit && !reorderOf\) \|\| quoteTaxable\(E\)/, 'a reorder keeps the job\'s tax exemption');
});

test('a saved reorder records what it reorders, and only a real code', () => {
  const r = after("from_submission_id, created_by, sent_by, held_at, reorder_of)", 1400);
  assert.match(r, /QUOTE_CODE_RE\.test\(String\(one\(b\.reorder_of\) \|\| ''\)\) \? String\(one\(b\.reorder_of\)\) : null/);
});

test('the customer page and the job page link to both', () => {
  const c = after("app.get('/admin/customer', requireAdmin", 9000);
  assert.ok(c.includes('/admin/quote/new?customer=${encodeURIComponent(q)}'));
  assert.ok(c.includes('/admin/quote/new?reorder=${encodeURIComponent(r.code)}'));
  assert.ok(after("app.get('/admin/production/:code'", 16000).includes('/admin/quote/new?reorder=${escEmail(q.code)}'));
});
