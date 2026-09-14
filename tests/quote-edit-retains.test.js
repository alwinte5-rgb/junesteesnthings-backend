'use strict';

/* Reopening a quote must bring every field back.
 *
 * `product_id` and `method_id` were saved with each line the whole time and
 * never read back: the option lists were ONE string shared by every line, with
 * no `selected` anywhere and nothing setting the value afterwards. So an edit
 * reopened with no garment and no decoration, everything downstream priced from
 * a line that had neither, and the totals collapsed.
 *
 * This is the audit that should have been run the first time rather than fixing
 * one field: every key the save writes, checked against what the form reads
 * back. A field saved and never restored is data loss that looks like a
 * rounding error.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the option builders mark the saved choice selected', () => {
  const prod = src.match(/const prodOpts = \(sel\) =>[\s\S]*?\.join\(''\);/);
  const meth = src.match(/const methodOpts = \(sel\) =>[\s\S]*?\.join\(''\);/);
  assert.ok(prod, 'prodOpts is not per-line — a shared string cannot mark a selection');
  assert.ok(meth, 'methodOpts is not per-line');
  for (const [name, m] of [['product', prod], ['method', meth]]) {
    assert.match(m[0], /selected/, name + ' options never mark anything selected');
    assert.match(m[0], /String\((?:p|m)\.id\) === String\(sel\)/,
      name + ' compares as strings — a numeric id from the database and a string '
      + 'from the form would never match otherwise');
  }
});

test('the line passes the saved ids in', () => {
  assert.match(src, /\$\{prodOpts\(it && it\.product_id\)\}/, 'product_id is not passed to the options');
  assert.match(src, /\$\{methodOpts\(it && it\.method_id\)\}/, 'method_id is not passed to the options');
});

test('every field the save writes is read back by the form', () => {
  const push = src.match(/items\.push\(\{[\s\S]*?\n      \}\);/g).pop();
  const saved = [...push.matchAll(/^\s{8}([a-z_]+):/gm)].map((m) => m[1]);
  assert.ok(saved.length > 10, 'could not read the saved field list');

  /* The WHOLE of lineHtml, to its closing `};` — a fixed-size slice cut the
     function in half and reported fields as lost that are restored further
     down, which would have sent someone hunting a bug that was not there. */
  const start = src.indexOf('const lineHtml');
  const form = src.slice(start, src.indexOf('\n  };', start));
  /* Derived or display-only: recomputed from the fields above on every render,
     so restoring them would be storing an answer twice. */
  const DERIVED = new Set(['line_total', 'list_total', 'unit_price', 'size_upcharge',
    'blank_price', 'colour_hex', 'setup_fee', 'setup_label', 'unit_override']);

  const missing = saved.filter((k) => !DERIVED.has(k) && !form.includes('it.' + k));
  assert.deepStrictEqual(missing, [],
    'saved but never restored, so an edit loses them: ' + missing.join(', '));
});
