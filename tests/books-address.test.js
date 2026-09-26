'use strict';

/* /books on this site is shut.
 *
 * The books app moved to https://books.jtees.net on 2026-09-26, and the owner
 * had the old jtees.net/books links deactivated rather than redirected. The
 * proxy that forwarded /books to it is gone, and the site's own Finances page,
 * which that proxy used to hide, moved to FINANCES_PATH. These pin both, so a
 * later edit cannot quietly reopen the old door or strand the Finances link.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
// Code only. The comments explain the history and are allowed to name /books.
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('nothing is mounted or routed under /books', () => {
  assert.doesNotMatch(code, /app\.(use|get|post|put|patch|delete|all)\(\s*['"`]\/books/);
});

test('the books proxy is gone', () => {
  assert.doesNotMatch(code, /BOOKS_ORIGIN/);
  assert.doesNotMatch(code, /books\.railway\.internal/);
});

test('no link, form or redirect still points at /books', () => {
  const stale = code.match(/['"`=}]\/books(?=[\/'"`?#])/g) || [];
  assert.deepStrictEqual(stale, [], 'use FINANCES_PATH for the Finances page');
});

test('the Finances page lives at FINANCES_PATH, and the admin nav links there', () => {
  const declared = code.match(/const FINANCES_PATH = '([^']+)'/);
  assert.ok(declared, 'FINANCES_PATH should be declared');
  assert.ok(!declared[1].startsWith('/books'), 'the Finances page must not live under /books');
  assert.match(code, /app\.get\(FINANCES_PATH, requireAdmin,/);
  assert.match(code, /\{ key: 'money',\s+href: FINANCES_PATH,/);
});

test('FINANCES_PATH is declared before the admin nav reads it', () => {
  // The nav table is built when the module loads; a const declared below it is
  // a TDZ ReferenceError at boot, which takes the whole site down.
  assert.ok(code.indexOf('const FINANCES_PATH') < code.indexOf("key: 'money'"));
});
