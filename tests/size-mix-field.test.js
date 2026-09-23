'use strict';

/* The size grid posts ONE field per line and every reader must name it.
 *
 * The quote form renders a single hidden input per line, `sizemix<N>`, filled
 * by calc() from the visible size boxes. The save route has two readers of it:
 * the line itself, and the loop that totals a RUN before any line is priced.
 *
 * The run loop asked for `sizes<N>` — a field that has never existed. It
 * therefore always parsed nothing, fell through to the qty box, and the two
 * engines disagreed: calc() pooled a run from the real size boxes while the
 * save route pooled it from the qty field. A run whose lines are entered as a
 * size mix could land on a different price band on save than the one on
 * screen, and nothing about it looked wrong.
 *
 * The names are asserted from the source rather than the behaviour because a
 * behavioural test would need the whole Express route; a typo in a field name
 * is exactly the kind of thing that survives every other test in this repo.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the form posts exactly one size field, and it is sizemix', () => {
  const inputs = src.match(/name="([a-z_]*size[a-z_]*)\$\{n\}"/gi) || [];
  assert.equal(inputs.length, 1, 'expected one size input per line, found ' + inputs.length + ': ' + inputs);
  assert.match(inputs[0], /name="sizemix\$\{n\}"/);
});

test('every reader of the size mix names the field the form actually posts', () => {
  /* Any b['...' + i] whose key mentions size must be sizemix. */
  const reads = [...src.matchAll(/b\['([a-z_]*size[a-z_]*)' \+ i\]/gi)].map((m) => m[1]);
  assert.ok(reads.length >= 2, 'expected the line reader and the run-total reader, found ' + reads.length);
  for (const r of reads) {
    assert.equal(r, 'sizemix',
      "a reader asks for b['" + r + "' + i] but the form posts sizemix — that read always returns nothing");
  }
});

test('the run-total loop reads the size mix, not just the qty box', () => {
  /* The loop exists so a run pools on the same number the line bills on. If it
     only ever read qty, a size-mix line would pool wrongly and the comment
     above it would be a lie. */
  const loop = src.slice(src.indexOf('const runTotals = {};'), src.indexOf('for (let i = 0; i < 40; i++) {', src.indexOf('const runTotals = {};') + 400));
  assert.match(loop, /sizemix/, 'the run-total loop no longer reads the size mix at all');
  assert.match(loop, /qty/, 'the run-total loop lost its qty-box fallback');
});
