'use strict';

/* Only DTF can be rushed (owner, 2026-10-12): tools/lib/rush.js, the quote
 * save and the quote form.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RUSH = require('../tools/lib/rush');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('an order is rushable only when every required decorated line is DTF', () => {
  const dtf = { product: true, titles: ['DTF Printing'] };
  assert.strictEqual(RUSH.rushAllowed([dtf]), true);
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: ['DTF Printing', 'DTF Printing'] }]), true);
  for (const other of ['Screen Printing', 'Embroidery', 'Big Head Cutout — 24in, 8-pack (full sheet)', 'Puff print', '']) {
    assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: [other] }]), false, other || 'unknown method');
  }
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: [] }]), false, 'a garment with no method');
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: false, titles: [] }]), true, 'a hand-typed fee line is ignored');
  assert.strictEqual(RUSH.rushAllowed([]), false);
});

test('the save makes a helper\'s rush 0 unless the order is rushable; the owner\'s figure is kept', () => {
  const at = src.indexOf('const rushOk = RUSH.rushAllowed(items.filter((it) => !it.optional)');
  assert.ok(at > 0);
  const lock = src.slice(at, src.indexOf('const rush = round2(subtotal * rushPct / 100);', at));
  assert.match(lock, /: \(wantDate && rushOk \? rushPctFor\(wantDate\) : 0\);/);
  assert.match(lock, /if \(who\.kind === 'staff' && STAFF\.levelOf\(who, 'quotes\.price'\) !== 'on'\)/, 'only for helpers');
});

test('the form suggests rush only when every picked decoration is DTF, and says why not', () => {
  assert.match(src, /var dtfOnly = picked\.length > 0 && picked\.every\(function \(el\) \{ return \/\\bDTF\\b\/i\.test/);
  assert.match(src, /var pct = dtfOnly \? rushSuggest\(days\) : 0;/);
  assert.match(src, /only DTF can be rushed: ask June about the date/);
  assert.match(src, /if \(\/\^\(method\|pr_m_\)\/\.test\(n\)\) rushSync\(true\);/);
});
