'use strict';

/* One new-quote form makes one quote (tools/lib/quote-form-key.js and where
 * server.js applies it).
 *
 * Owner, 2026-10-15: "Duplicate quotes are created if I go back through the
 * system and add information." Saving a new quote, pressing Back to the still
 * filled form, adding a detail and saving again inserted a second quote.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const QF = require('../tools/lib/quote-form-key');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const KEY = '3f2b8c1e-9a4d-4e7b-8c21-0d5e6f7a8b9c';

test('a form key must look like a UUID; anything else is ignored', () => {
  assert.strictEqual(QF.formKeyOf(KEY), KEY);
  assert.strictEqual(QF.formKeyOf(KEY.toUpperCase()), KEY);
  assert.strictEqual(QF.formKeyOf([KEY, 'other']), KEY);
  for (const bad of ['', undefined, null, 'abc', KEY + 'x', "' OR 1=1 --", { k: KEY }]) {
    assert.strictEqual(QF.formKeyOf(bad), '', String(bad));
  }
});

test('the second save joins the first quote when it only adds details', () => {
  const first = [{ code: 'AB12CD34EF', email: '', phone: '' }];
  assert.strictEqual(QF.pickQuoteForKey(first, { email: 'a@b.com', phone: '773 555 0100' }), 'AB12CD34EF');
  const withEmail = [{ code: 'AB12CD34EF', email: 'A@B.com', phone: '' }];
  assert.strictEqual(QF.pickQuoteForKey(withEmail, { email: ' a@b.com ', phone: '' }), 'AB12CD34EF');
  const withPhone = [{ code: 'AB12CD34EF', email: '', phone: '(773) 555-0100' }];
  assert.strictEqual(QF.pickQuoteForKey(withPhone, { email: '', phone: '+1 773 555 0100' }), 'AB12CD34EF');
  // Clearing a detail is still the same quote, not a new one.
  assert.strictEqual(QF.pickQuoteForKey(withEmail, { email: '', phone: '' }), 'AB12CD34EF');
});

test('reusing the form for someone else makes a new quote', () => {
  const saved = [{ code: 'AB12CD34EF', name: 'Alice', email: 'a@b.com', phone: '7735550100' }];
  assert.strictEqual(QF.pickQuoteForKey(saved, { email: 'c@d.com', phone: '' }), null);
  assert.strictEqual(QF.pickQuoteForKey(saved, { email: '', phone: '3125550199' }), null);
  // Newest first: going Back again for the second customer finds theirs.
  const both = [{ code: 'NEW0000002', email: 'c@d.com', phone: '' }, ...saved];
  assert.strictEqual(QF.pickQuoteForKey(both, { email: 'c@d.com', phone: '3125550199' }), 'NEW0000002');
  assert.strictEqual(QF.pickQuoteForKey([], { email: 'a@b.com' }), null);
});

test('nothing in common: email on one save, only a phone on the other, is someone else', () => {
  // Code review: Alice by email, then Bob by phone alone, must not overwrite Alice.
  const alice = [{ code: 'AB12CD34EF', name: 'Alice', email: 'a@x.com', phone: '' }];
  assert.strictEqual(QF.pickQuoteForKey(alice, { name: 'Bob', email: '', phone: '3125550199' }), null);
  assert.strictEqual(QF.pickQuoteForKey(alice, { name: 'Alice', email: '', phone: '3125550199' }), null);
});

test('no contact to compare: the name decides', () => {
  const noContact = [{ code: 'AB12CD34EF', name: 'Alice Smith', email: '', phone: '' }];
  assert.strictEqual(QF.pickQuoteForKey(noContact, { name: 'alice  smith', email: 'a@x.com' }), 'AB12CD34EF');
  assert.strictEqual(QF.pickQuoteForKey(noContact, { name: '', email: 'a@x.com' }), 'AB12CD34EF');
  assert.strictEqual(QF.pickQuoteForKey(noContact, { name: 'Bob', email: 'b@x.com' }), null);
  const blank = [{ code: 'AB12CD34EF', name: '', email: '', phone: '' }];
  assert.strictEqual(QF.pickQuoteForKey(blank, { name: 'Bob', phone: '3125550199' }), 'AB12CD34EF');
});

test('only a NEW quote form carries a key; edits and the quote exam do not', () => {
  assert.match(SRC, /!isEdit && !exam \? `<input type="hidden" name="form_key"/);
  assert.match(SRC, /\(req\.params\.code \|\| one\(b\.exam_scenario\)\) \? ''/);
});

test('a finished quote (cancelled, accepted, paid) is never joined', () => {
  const at = SRC.indexOf("a.detail->>'form_key' = $2");
  assert.ok(at > 0, 'form-key lookup not found');
  const sql = SRC.slice(at, SRC.indexOf('LIMIT 10', at));
  for (const cond of ['q.cancelled_at IS NULL', "<> 'cancelled'", 'q.accepted_at IS NULL', 'COALESCE(q.paid_amount, 0) = 0']) {
    assert.ok(sql.includes(cond), 'lookup must exclude: ' + cond);
  }
});

test('the save route turns a known key into an edit, before anything reads the code', () => {
  const route = SRC.indexOf("app.post(['/admin/api/quotes', '/admin/api/quotes/:code']");
  assert.ok(route > 0, 'quote save route not found');
  const lookup = SRC.indexOf('if (again) req.params.code = again;', route);
  assert.ok(lookup > route, 'key lookup missing from the save route');
  // Every place the route reads the code comes after the lookup.
  for (const reader of ['const savingCode = String(req.params.code', 'const priorCode = String(req.params.code',
    'const editing = String(req.params.code']) {
    const at = SRC.indexOf(reader, route);
    assert.ok(at > lookup, reader + ' must come after the form-key lookup');
  }
  // Serialised, so a double click cannot slip two inserts past the lookup.
  const hold = SRC.indexOf('await holdQuoteForm(formKey, res);', route);
  assert.ok(hold > route && hold < lookup, 'the lock must be taken before the lookup');
});

test('the first save records its key, awaited and reported, only when it inserted', () => {
  const insert = SRC.indexOf('INSERT INTO quotes (code,name,phone,email,items');
  const record = SRC.indexOf('QFORM.QUOTE_FORM_ACTION, code', insert);
  assert.ok(insert > 0 && record > insert, 'key not recorded after the insert');
  const block = SRC.slice(record - 600, record + 300);
  assert.match(block, /!QUOTE_CODE_RE\.test\(editing\)/);
  assert.match(block, /await pool\.query\(/);
  assert.match(block, /reportError\('quote-form-key'/);
});

test('the lock lets go when the response ends, however it ends', async () => {
  const start = SRC.indexOf('const quoteFormLocks = new Map();');
  const end = SRC.indexOf('\n}\n', SRC.indexOf('async function holdQuoteForm', start)) + 3;
  const vm = require('node:vm');
  const holdQuoteForm = vm.runInThisContext('(() => {' + SRC.slice(start, end) + 'return holdQuoteForm; })()');
  const { EventEmitter } = require('node:events');
  const a = new EventEmitter();
  const b = new EventEmitter();
  await holdQuoteForm(KEY, a);
  let bIn = false;
  const second = holdQuoteForm(KEY, b).then(() => { bIn = true; });
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(bIn, false, 'second save ran while the first held the form');
  a.emit('close');
  await second;
  assert.strictEqual(bIn, true);
  b.emit('finish');
  b.emit('close');
});

test('a stuck save does not hold the next one forever', () => {
  assert.match(SRC, /const QUOTE_FORM_WAIT_MS = \d+;/);
  assert.match(SRC, /Promise\.race\(\[before,/);
});
