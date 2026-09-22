'use strict';

/* A method the designer has retired must not still be sellable from the quote form.
 *
 * jt-catalog.php publishes every row in `printings` and marks each one
 * `active`, which is the designer's own "still sold" flag. The quote form's
 * `quotable` filter did not read it, so every decoration method ever
 * superseded stayed in the dropdown next to the one that replaced it:
 *
 *   #2-6, #20, #21  the per-colour screen-print rows consolidated into #22
 *   #25-28          the cutout ladders the full-sheet packs replaced
 *
 * That is not cosmetic. #27 "Big Head Cutout — 24in" quotes a single 24in
 * cutout at $155.15 — the exact number the 8-pack exists to avoid — and #25
 * bottoms out at $6.10 against the live 12in singles ladder's $8.00, so
 * picking the wrong one of two identically-named entries either loses the job
 * or sells it under the current price. June saw it as "there are 2 12, 18, 24
 * inches on the quote page".
 *
 * ANCHORED ON THE FILTER, NOT ON THE FIX. The match below finds
 * `catalog.methods.filter(...)`, which survives reverting the guard — so a
 * regression fails on the assertion that names the real bug, rather than
 * dying with "not found in server.js".
 *
 * Digitizing is exempt ON PURPOSE and that is asserted too: all four DST rows
 * are `active=0` in the designer because they are sold from this form's own
 * control, not the storefront. Filtering THEM on `active` would empty the
 * digitizing picker, so the guard must keep relying on DIGITIZING_METHOD_RE
 * to exclude them instead.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* Lift the real predicate and the real regex out of the file, and run them in
   the host realm — a fresh vm context would give arrays a foreign prototype
   and break deepStrictEqual for no reason (see AGENTS.md). */
function quotablePredicate() {
  const digi = src.match(/const DIGITIZING_METHOD_RE = [^\n]+/);
  assert.ok(digi, 'DIGITIZING_METHOD_RE not found in server.js');

  const filt = src.match(/const quotable = catalog\.methods\.filter\(([\s\S]*?)\);\n/);
  assert.ok(filt, 'the quotable filter was not found in server.js');

  return vm.runInThisContext(
    `(() => { ${digi[0]}; return (${filt[1]}); })()`,
  );
}

const tiers = { front: [{ price: '12.00' }] };

/* Real rows, as jt-catalog.php publishes them. */
const RETIRED = [
  { id: 3,  title: 'Screen Printing — 2 Colors',   active: false, use_for_quoting: true, positions: tiers },
  { id: 21, title: 'Screen Printing — 7 Colors',   active: false, use_for_quoting: true, positions: tiers },
  { id: 25, title: 'Big Head Cutout — 12in',       active: false, use_for_quoting: true, positions: tiers },
  { id: 27, title: 'Big Head Cutout — 24in',       active: false, use_for_quoting: true, positions: tiers },
  { id: 13, title: 'Heat Transfer — Vinyl',        active: false, use_for_quoting: true, positions: tiers },
];

const LIVE = [
  { id: 1,  title: 'DTF Printing',                              active: true, use_for_quoting: true, positions: tiers },
  { id: 22, title: 'Screen Printing',                           active: true, use_for_quoting: true, positions: tiers },
  { id: 31, title: 'Big Head Cutout — 24in, 8-pack (full sheet)', active: true, use_for_quoting: true, positions: tiers },
  { id: 33, title: 'Big Head Cutout — 12in, singles',           active: true, use_for_quoting: true, positions: tiers },
];

test('a retired method is never offered in the quote dropdown', () => {
  const keep = quotablePredicate();
  for (const m of RETIRED) {
    assert.equal(keep(m), false,
      `#${m.id} ${m.title} is active=false in the designer and must not be sellable`);
  }
});

test('the live method that replaced it still is', () => {
  const keep = quotablePredicate();
  for (const m of LIVE) {
    assert.equal(keep(m), true,
      `#${m.id} ${m.title} is active and must stay in the dropdown`);
  }
});

test('the two cutout sizes sold both ways appear exactly twice, never three times', () => {
  const keep = quotablePredicate();
  /* 12in and 18in are legitimately sold as a pack AND as singles. That is two
     entries, which is correct and is NOT what June reported — the third entry
     was the retired ladder. */
  const all = [
    { id: 25, title: 'Big Head Cutout — 12in',                       active: false, use_for_quoting: true, positions: tiers },
    { id: 29, title: 'Big Head Cutout — 12in, 32-pack (full sheet)', active: true,  use_for_quoting: true, positions: tiers },
    { id: 33, title: 'Big Head Cutout — 12in, singles',              active: true,  use_for_quoting: true, positions: tiers },
  ];
  assert.deepStrictEqual(all.filter(keep).map((m) => m.id), [29, 33]);
});

test('digitizing is excluded by name, not by active — or the picker empties', () => {
  const keep = quotablePredicate();
  /* Every DST row really is active=0 in the designer. They must be excluded
     from the decoration list (they are billed once, not per piece) while
     digitizingOptions() keeps offering them from its own control. */
  const dst = { id: 15, title: 'DST Digitizing — one-time, Small/Medium (to 15k stitches)',
                active: false, use_for_quoting: true, positions: { front: [{ price: '30.00' }] } };
  assert.equal(keep(dst), false);

  /* The guard that does it is the title regex, so it still holds for a row
     somebody later marks active. */
  assert.equal(keep(Object.assign({}, dst, { active: true })), false);

  /* And digitizingOptions must NOT have grown an `active` check, which would
     leave the embroidery flow with an empty picker. */
  const digiFn = src.slice(src.indexOf('function digitizingOptions(catalog)'));
  const body = digiFn.slice(0, digiFn.indexOf('\n}'));
  assert.ok(!/\.active\b/.test(body),
    'digitizingOptions must not filter on active: all four DST rows are active=0 by design');
});

test('a method with no price tiers is still left out, with or without active', () => {
  const keep = quotablePredicate();
  assert.equal(keep({ id: 99, title: 'Unpriced Thing', active: true, use_for_quoting: true, positions: {} }), false);
  assert.equal(keep({ id: 98, title: 'Not For Quoting', active: true, use_for_quoting: false, positions: tiers }), false);
});
