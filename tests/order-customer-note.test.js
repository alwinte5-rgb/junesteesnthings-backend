'use strict';
/* The checkout Comments box on the Design Studio was never saved (2026-10-29).
 * The designer now sends it with the shop's order email as customer_note; the
 * email shows it, escaped, and a needed-by date goes into the subject. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const at = src.indexOf("app.post('/api/order-notification'");
const route = src.slice(at, src.indexOf('\n});', at));

test('the shop order email shows the customer note, escaped and capped', () => {
  assert.match(route, /const customerNote = String\(b\.customer_note \|\| ''\)[^;]*\.slice\(0, 1000\);/);
  assert.match(route, /<b>Customer note:<\/b><br>\$\{escEmail\(customerNote\)\.replace\(/);
});

test('a needed-by date is in the subject', () => {
  const re = new RegExp(route.match(/\(\/(\^Needed by: [^/]*\\\/[^/]*\\\/[^)]*\))\/m/)[1], 'm');
  assert.strictEqual(re.exec('Needed by: 11/09/2026\nnavy please')[1], '11/09/2026');
  assert.strictEqual(re.exec('please hurry'), null);
  assert.match(route, /\$\{neededBy \? ` — NEEDED BY \$\{neededBy\}` : ''\}/);
});
