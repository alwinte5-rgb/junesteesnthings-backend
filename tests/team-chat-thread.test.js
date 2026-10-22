'use strict';

/* Team chat: a helper's history opened by its link stays theirs, never
 * swapped for the first person on the list (#428). The page itself is
 * exercised in ~/.local/share/jtees-e2e/run-staff.cjs (disabled, then archived).
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const at = src.indexOf("app.get('/admin/team-chat', requireAdmin");
const page = src.slice(at, src.indexOf('\n});', at));

test('the first person on the list is used only when no helper was asked for', () => {
  const fallbacks = page.match(/staffId = people\[0\]\.id/g) || [];
  assert.strictEqual(fallbacks.length, 1);
  assert.match(page, /if \(!channel && !staffId\) staffId = people\[0\]\.id;/);
});

test('an archived helper is named as archived on the list', () => {
  assert.ok(page.includes("' (archived)'"));
});
