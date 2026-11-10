const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'server.js'), 'utf8');
const helper = src.slice(src.indexOf('async function saveCustomerQuoteNote('), src.indexOf("app.post('/q/:code/note'"));
function load(query) {
  return vm.runInNewContext(helper + '\nsaveCustomerQuoteNote', { pool: { query } });
}
test('customer instructions are persisted in the timeline without changing approval, quantities or money', async () => {
  let calls = [];
  const save = load(async (sql, params) => { calls.push({ sql, params }); return { rows: [{ id: 1 }] }; });
  assert.equal(await save('AB12CD34EF', '  Use our blue logo\nPlease label each bag.  '), true);
  assert.equal(calls[0].params[1], 'Use our blue logo\nPlease label each bag.');
  assert.match(calls[0].sql, /INSERT INTO lead_notes/);
  assert.match(calls[0].sql, /status NOT IN \('held', 'draft'\) AND cancelled_at IS NULL/);
  assert.match(calls[0].sql, /NOT EXISTS/);
  assert.doesNotMatch(calls[0].sql, /UPDATE quotes|requested_items|change_request|accepted_at/);
});
test('blank or malformed notes never write; text is bounded; a failed write propagates', async () => {
  let count = 0;
  const save = load(async (sql, params) => { count++; assert.equal(params[1].length, 2000); return { rows: [] }; });
  for (const raw of ['', '   ', null, {}, ['abc']]) assert.equal(await save('AB12CD34EF', raw), false);
  assert.equal(count, 0);
  assert.equal(await save('AB12CD34EF', 'x'.repeat(3000)), false);
  assert.equal(count, 1);
  await assert.rejects(load(async () => { throw Error('database unavailable'); })('AB12CD34EF', 'blue logo'), /database unavailable/);
});
test('note endpoint rejects private quotes and invalid input, and never claims success on a database error', async () => {
  let route;
  const body = src.slice(src.indexOf("app.post('/q/:code/note'"), src.indexOf("app.post('/q/:code/changes'"));
  let fail = false, exists = true, writes = 0;
  vm.runInNewContext(body, {
    app: { post: (path, limit, fn) => { route = fn; } }, quoteToolRateLimit: () => {},
    QUOTE_CODE_RE: /^[A-Z0-9]{10}$/, quotePage: (title, body) => body,
    pool: { query: async () => { if (fail) throw Error('offline'); return { rows: exists ? [{ code: 'AB12CD34EF' }] : [] }; } },
    saveCustomerQuoteNote: async () => { writes++; }, console: { error: () => {} }
  });
  async function post(code, note) {
    const res = { statusCode: 200, status(n) { this.statusCode = n; return this; }, send(body) { this.body = body; return this; }, redirect(n, url) { this.statusCode = n; this.url = url; } };
    await route({ params: { code }, body: { customer_note: note } }, res); return res;
  }
  assert.equal((await post('bad', 'hello')).statusCode, 404);
  for (const note of ['', {}, 'x'.repeat(2001)]) assert.equal((await post('AB12CD34EF', note)).statusCode, 400);
  exists = false; assert.equal((await post('AB12CD34EF', 'blue')).statusCode, 404); assert.equal(writes, 0);
  exists = true; fail = true; assert.equal((await post('AB12CD34EF', 'blue')).statusCode, 500); assert.equal(writes, 0);
  fail = false; const ok = await post('AB12CD34EF', 'blue'); assert.equal(ok.statusCode, 303); assert.match(ok.url, /note=saved/); assert.equal(writes, 1);
});
test('public notes show only customer notes, with escaped bodies, and notes also save on acceptance', () => {
  assert.match(src, /WHERE quote_code=\$1 AND kind='customer_note'/);
  assert.match(src, /escEmail\(n.body\)/);
  const accept = src.slice(src.indexOf("app.post('/q/:code/accept'"), src.indexOf("app.post('/q/:code/changes'"));
  assert.match(accept, /await saveCustomerQuoteNote\(code, rb.customer_note\)/);
  assert.match(src, /id="accept-note" name="customer_note"/);
});
test('same-count size swaps are detected; estimate includes delivery and postage', () => {
  const text = src.slice(src.indexOf('      function lineChanged('), src.indexOf('      function estimate(){'));
  const changed = vm.runInNewContext(text + '\nlineChanged', { QITEMS: [{ qty: 10, size_mix: { M: 5, '2XL': 5 } }] });
  assert.equal(changed(0, { qty: 10, mix: { M: 4, '2XL': 6 } }), true);
  assert.equal(changed(0, { qty: 10, mix: { M: 5, '2XL': 5, '3XL': 0 } }), false);
  assert.equal(changed(0, { qty: 11, mix: { M: 5, '2XL': 6 } }), true);
  assert.match(src, /var total = net \+ tax \+ delivery \+ \$\{Number\(t.shipping\) \|\| 0\}/);
  assert.match(src, /acceptButton.disabled = window.jtQuoteEditsPending/);
});
test('failed changes return an error and a payment arriving during the request cannot be overwritten', () => {
  const change = src.slice(src.indexOf("app.post('/q/:code/changes'"), src.indexOf("app.post('/admin/quote/:code/mark-paid'"));
  assert.match(change, /WHERE code=\$1 AND cancelled_at IS NULL AND COALESCE\(paid_amount, 0\) = 0/);
  assert.match(change, /return res.status\(500\).send\(quotePage\('Changes not saved'/);
});
test('a digit in an email cannot match unrelated phone numbers in previous quotes', async () => {
  const routeText = src.slice(src.indexOf("app.get('/admin/api/quotes/prior'"), src.indexOf("app.post(['/admin/api/quotes'"));
  let handler, params = [];
  vm.runInNewContext(routeText, { app: { get: (p, auth, fn) => { handler = fn; } }, requireAdmin: () => {},
    pool: { query: async (sql, values) => { params.push(values); return { rows: [] }; } }, console });
  const res = { json: () => {} };
  await handler({ query: { q: 'client1@example.com' } }, res);
  assert.equal(params[0][1], ''); assert.equal(params[1][1], '');
  params = []; await handler({ query: { q: '+1 (773) 555-0199' } }, res);
  assert.equal(params[0][1], '7735550199');
});
test('changes from an older quote version cannot overwrite a newer quote', () => {
  const change = src.slice(src.indexOf("app.post('/q/:code/changes'"), src.indexOf("app.post('/admin/quote/:code/mark-paid'"));
  assert.match(change, /seenRevision !== \(Number\(q.revision\) \|\| 1\)/);
  assert.match(change, /AND COALESCE\(revision, 1\) = \$6::int RETURNING/);
  assert.match(change, /if \(!rows.length\) return res.status\(409\)/);
});
