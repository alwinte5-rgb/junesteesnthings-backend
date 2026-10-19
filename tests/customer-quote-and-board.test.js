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

test('a saved reorder starts from the job it copies, only for the same customer', () => {
  const save = after("app.post(['/admin/api/quotes', '/admin/api/quotes/:code']", 120000);
  assert.match(save, /const reorderOf = reorderSrc && sameCustomer\(reorderSrc, \{ email, phone \}\) \? reorderSrc : null;/);
  assert.match(save, /const basis = prior \|\| reorderOf;/);
  assert.match(save, /const priorItems = \(basis && Array\.isArray\(basis\.items\)\)/, 'a helper re-saving the job\'s own prices is not a change');
  assert.match(save, /\? !\(basis && basis\.taxable === false\)/, 'a helper keeps the job\'s exemption');
  assert.match(save, /reorderOf \? reorderOf\.code : null,/, 'only a checked reorder is recorded');
  assert.match(save, /reorderOf && !taxable && reorderOf\.tax_certificate_id/, 'with its certificate');
});

test('the partners\' portal does not hand a customer the shop\'s draft reorder', () => {
  assert.match(after("app.post('/api/reorder'", 2500), /AND status <> 'draft'/);
});

test('owed leaves out refunded and disputed jobs, as the board does', () => {
  const q = after('const { rows: openAgg } = await pool.query(', 1400);
  assert.match(q, /p\.kind = 'refund'/);
  assert.match(q, /stripe_disputes d WHERE d\.quote_code = quotes\.code AND d\.status NOT IN \('won', 'warning_closed'\)/);
});

test('the customer page and the job page link to both', () => {
  const c = after("app.get('/admin/customer', requireAdmin", 9000);
  assert.ok(c.includes('/admin/quote/new?customer=${encodeURIComponent(q)}'));
  assert.ok(c.includes('/admin/quote/new?reorder=${encodeURIComponent(r.code)}'));
  assert.ok(c.includes('const lastOrder = h.quotes.find(isOrdered);'), 'Reorder offers the last job they ordered, not the last quote');
  assert.ok(after("app.get('/admin/production/:code'", 16000).includes('/admin/quote/new?reorder=${escEmail(q.code)}'));
});
