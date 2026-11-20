'use strict';

/* The quote form hung for every load (2026-11-17): rushSignOf(), a top-level
   function, read SIZED_BY_NAME_RE while it was declared (at column 0, so it
   looked top level) inside the /admin/quote/new handler. It threw "is not
   defined" mid-render and the page never answered. The rule this guards:
   nothing outside the quote form handler may use a name declared inside it. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').split('\n');

test('no name declared inside the quote form handler is used outside it', () => {
  const start = lines.findIndex((l) => /^app\.get\(\['\/admin\/quote\/new'/.test(l));
  assert.ok(start > 0, 'quote form handler not found');
  const end = lines.findIndex((l, i) => i > start && /^\}\);/.test(l));
  assert.ok(end > start, 'end of the quote form handler not found');
  /* Unindented declarations inside the handler: the ones that look global. */
  const names = [];
  for (let i = start + 1; i < end; i++) {
    const m = /^(?:const|let|var|function|async function)\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
    if (m) names.push(m[1]);
  }
  const outside = lines.slice(0, start).concat(lines.slice(end + 1)).join('\n');
  const leaks = names.filter((n) => new RegExp(`\\b${n.replace(/\$/g, '\\$')}\\b`).test(outside));
  assert.deepStrictEqual(leaks, [], `declared inside the quote form handler but used outside it: ${leaks.join(', ')}`);
});

test('the names the rush reads are top level', () => {
  const at = (re) => lines.findIndex((l) => re.test(l));
  const handler = at(/^app\.get\(\['\/admin\/quote\/new'/);
  for (const re of [/^const PRODUCT_GROUPS = /, /^const SIZED_BY_NAME_RE = /]) {
    assert.ok(at(re) > 0 && at(re) < handler, `${re} must be above the quote form handler`);
  }
});
