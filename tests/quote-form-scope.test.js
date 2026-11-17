'use strict';

/* The quote form hung for every load (2026-11-17): rushSignOf(), a top-level
   function, read SIZED_BY_NAME_RE while it was declared inside the
   /admin/quote/new handler, so it threw "is not defined" mid-render and the
   page never answered. Top-level helpers must only use top-level names. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').split('\n');
const lineOf = (re) => src.findIndex((l) => re.test(l));

test('SIZED_BY_NAME_RE and PRODUCT_GROUPS are declared before the quote form handler', () => {
  const handler = lineOf(/^app\.get\(\['\/admin\/quote\/new'/);
  assert.ok(handler > 0, 'quote form handler not found');
  for (const re of [/^const PRODUCT_GROUPS = /, /^const SIZED_BY_NAME_RE = /]) {
    const at = lineOf(re);
    assert.ok(at > 0 && at < handler, `${re} must be top level, above the quote form handler`);
  }
  assert.ok(lineOf(/^const SIZED_BY_NAME_RE = /) < lineOf(/^function rushSignOf\(/), 'declared before rushSignOf');
});
