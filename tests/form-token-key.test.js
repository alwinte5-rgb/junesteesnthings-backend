'use strict';

/* Form tokens (proof the browser loaded the page) are HMACs. A missing key
 * must never fall back to a constant anyone can read in this repo. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('form tokens have no hard-coded fallback key', () => {
  assert.ok(!src.includes("'dev-insecure'"), 'no guessable stand-in secret');
  const at = src.indexOf('const FORM_TOKEN_KEY =');
  const decl = src.slice(at, src.indexOf('})();', at));
  assert.match(decl, /process\.env\.FORM_TOKEN_SECRET \|\| process\.env\.ADMIN_PASSWORD \|\| \(\(\) => \{/);
  assert.match(decl, /crypto\.randomBytes\(32\)/, 'missing key is random, not a constant');
  assert.match(decl, /console\.error\(/, 'and it says so');
});

test('signing and checking use the same key', () => {
  for (const fn of ['function generateFormToken(', 'function isValidFormToken(']) {
    const body = src.slice(src.indexOf(fn), src.indexOf('\n}\n', src.indexOf(fn)));
    assert.match(body, /const secret = FORM_TOKEN_KEY;/, fn);
  }
});
