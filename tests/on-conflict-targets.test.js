'use strict';

/* An ON CONFLICT (col) aimed at a PARTIAL unique index must repeat the index's
   WHERE clause, or Postgres rejects the whole INSERT: "there is no unique or
   exclusion constraint matching the ON CONFLICT specification".

   That is not a failed dedupe — it is a failed write. The quote form's insert
   was written without the predicate on 2026-09-01 and every enquiry from then
   until 2026-09-26 was refused, showing customers "Something went wrong".
   Unit tests with a mocked pool cannot see this; this test reads the schema the
   code creates and checks every conflict target against it. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// table -> [{ cols, where }] for every partial unique index created in code
const partial = {};
for (const m of server.matchAll(/CREATE UNIQUE INDEX IF NOT EXISTS\s+\w+\s+ON\s+(\w+)\s*\(([^)]*)\)\s*WHERE\s+([^`]+?)`/g)) {
  const [, table, cols, where] = m;
  (partial[table] = partial[table] || []).push({ cols: cols.replace(/\s+/g, ''), where: where.trim() });
}

test('the schema really has partial unique indexes to check against', () => {
  assert.ok(partial.submissions, 'submissions_dedupe_uniq not found — the scan is broken');
});

test('every ON CONFLICT on a partial index repeats its predicate', () => {
  const problems = [];
  for (const m of server.matchAll(/INSERT INTO\s+(\w+)[\s\S]{0,600}?ON CONFLICT\s*\(([^)]*)\)([^\n]*)/g)) {
    const [, table, cols, rest] = m;
    const idx = (partial[table] || []).find(i => i.cols === cols.replace(/\s+/g, ''));
    if (idx && !/^\s*WHERE\b/.test(rest)) problems.push(`${table} (${cols}) needs WHERE ${idx.where}`);
  }
  assert.deepStrictEqual(problems, []);
});
