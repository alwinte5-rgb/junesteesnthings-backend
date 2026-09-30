/* A quote reopened for editing shows what was saved (2026-09-30).
 *
 * Run: node --test tests/*.test.js
 *
 * The owner: "when the quote is reopened it is different". A real-browser
 * round trip (run-admin-post.cjs: fill, save, reopen, compare every field)
 * found four causes; these pin each fix.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('lines are stored in the order they were entered, though priced required-first', () => {
  assert.match(src, /formPos\.push\(i\);\s*items\.push\(\{/);
  assert.match(src, /const at = new Map\(items\.map\(\(it, k\) => \[it, formPos\[k\]\]\)\);\s*items\.sort\(\(x, y\) => at\.get\(x\) - at\.get\(y\)\);/);
  assert.ok(src.indexOf('items.sort((x, y) => at.get(x) - at.get(y));') < src.indexOf("const subtotal = round2(items.filter((i) => !i.optional)"),
    'sorted back before anything is stored');
});

test('an added item gets its own number, so its upgrades, colour and design choice post as its own', () => {
  const fn = src.slice(src.indexOf('function addLine(){'), src.indexOf("document.getElementById('lines').appendChild(tpl); n++;"));
  assert.match(fn, /tpl\.dataset\.n = n;/);
  assert.match(fn, /delete tpl\.dataset\.savedAddons; delete tpl\.dataset\.savedSizes; delete tpl\.dataset\.savedColour;/);
});

test('"Quote good for (days)" reopens at the days left, so a re-save keeps the date', () => {
  assert.match(src, /<input name="valid_days" type="number" value="\$\{validDaysLeft\}"/);
  assert.match(src, /return left >= 1 \? left : 14;/);
});

test('the discount reads back as typed', () => {
  assert.match(src, /val\(String\(Number\(E\.discount_value\)\)\)/);
});
