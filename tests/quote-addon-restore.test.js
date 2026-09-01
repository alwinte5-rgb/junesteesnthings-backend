'use strict';

/* Reopening a quote must not quietly make it cheaper.
 *
 * The optional add-ons — specialty ink, unbagging, puff, the jumbo hoop — are
 * built CLIENT-side from the chosen method, because which ones apply depends on
 * the decoration. They were built unchecked every time, and nothing read the
 * saved `addons` back. So opening a quote to correct a phone number and pressing
 * save dropped every one of them from the total, with no warning and no diff:
 * the customer is re-quoted lower for the same job.
 *
 * Only the dark-garment box survived, because it is server-rendered `checked`,
 * and digitizing survived because its <select> is server-rendered `selected`.
 * That is the shape of the bug — anything rebuilt in the browser was lost.
 *
 * This is the same failure family as the extended-size upcharge fixed the same
 * day: the form displaying one thing while the price says another. Issue #48.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* ---------- what the line carries ---------------------------------------- */

test('a saved line publishes the add-on codes it was priced with', () => {
  const decl = src.match(/const savedAddons = [\s\S]*?\.map\(\(a\) => String\(a\.code\)\);/);
  assert.notStrictEqual(decl, null, 'savedAddons not found in lineHtml');
  const build = vm.runInThisContext(
    `((it) => { ${decl[0]} return savedAddons; })`);

  assert.deepStrictEqual(
    build({ addons: [ { code: 'specialty_ink', total: 75 },
                      { code: 'unbagging', total: 25 } ] }),
    ['specialty_ink', 'unbagging']);

  /* Codes only. The RATES must come from ADDONS at render time, so a rate
     change reaches an edited quote instead of being frozen into the markup. */
  assert.ok(!JSON.stringify(build({ addons: [{ code: 'unbagging', rate: 0.5, total: 25 }] }))
    .includes('0.5'), 'no rates in the attribute');
});

test('an add-on that came to nothing is not resurrected', () => {
  const decl = src.match(/const savedAddons = [\s\S]*?\.map\(\(a\) => String\(a\.code\)\);/)[0];
  const build = vm.runInThisContext(`((it) => { ${decl} return savedAddons; })`);
  assert.deepStrictEqual(build({ addons: [{ code: 'puff', total: 0 }] }), []);
  assert.deepStrictEqual(build({ addons: [{ total: 10 }] }), [], 'a row with no code');
});

test('a line with no add-ons, and a brand-new line, publish nothing', () => {
  const decl = src.match(/const savedAddons = [\s\S]*?\.map\(\(a\) => String\(a\.code\)\);/)[0];
  const build = vm.runInThisContext(`((it) => { ${decl} return savedAddons; })`);
  for (const it of [null, undefined, {}, { addons: null }, { addons: 'nonsense' }]) {
    assert.deepStrictEqual(build(it), [], JSON.stringify(it));
  }
});

test('the attribute is on the line element the rebuild reads from', () => {
  assert.match(src, /<div class="line" data-n="\$\{n\}" data-saved-addons=/,
    'the codes must ride on .line, which is the element calc() holds as L');
});

/* ---------- the rebuild puts them back ----------------------------------- */

/* The restore block, lifted from the shipped browser source and run against a
 * DOM stand-in — so this tests the code that ships, not a description of it. */
const restore = (() => {
  const m = src.match(/var saved = L\.dataset\.savedAddons;[\s\S]*?\n            \}/);
  assert.notStrictEqual(m, null, 'the restore block was not found in calc()');
  return vm.runInThisContext(`((L, aoBox) => { ${m[0]} })`);
})();

function fakeLine(codes) {
  const boxes = codes.map((c) => ({ dataset: { code: c }, checked: false }));
  return {
    L: { dataset: {} },
    aoBox: { querySelectorAll: () => ({ forEach: (f) => boxes.forEach(f) }) },
    boxes,
  };
}

test('the boxes that were saved come back ticked, and only those', () => {
  const f = fakeLine(['specialty_ink', 'unbagging', 'puff']);
  f.L.dataset.savedAddons = 'specialty_ink,puff';
  restore(f.L, f.aoBox);
  assert.deepStrictEqual(f.boxes.map((b) => b.checked), [true, false, true]);
});

test('it is a ONE-SHOT: changing method afterwards does not resurrect them', () => {
  /* The attribute is consumed as it is read. Switching to a method with its
     own add-ons must offer those unticked — carrying the previous method's
     choices across would charge for an upgrade nobody selected. */
  const f = fakeLine(['specialty_ink', 'unbagging']);
  f.L.dataset.savedAddons = 'specialty_ink';
  restore(f.L, f.aoBox);
  assert.strictEqual(f.L.dataset.savedAddons, undefined, 'consumed');

  const g = fakeLine(['puff', 'jumbo_hoop']);
  g.L.dataset = f.L.dataset;            // same line, new method
  restore(g.L, g.aoBox);
  assert.deepStrictEqual(g.boxes.map((b) => b.checked), [false, false]);
});

test('a new line with nothing saved ticks nothing', () => {
  const f = fakeLine(['specialty_ink', 'unbagging']);
  restore(f.L, f.aoBox);
  assert.deepStrictEqual(f.boxes.map((b) => b.checked), [false, false]);
});

test('a saved code the method no longer offers is ignored, not an error', () => {
  /* Methods change. A quote saved with puff, reopened after the method was
     switched to screen printing, must not throw on the way in. */
  const f = fakeLine(['specialty_ink']);
  f.L.dataset.savedAddons = 'puff,jumbo_hoop';
  assert.doesNotThrow(() => restore(f.L, f.aoBox));
  assert.deepStrictEqual(f.boxes.map((b) => b.checked), [false]);
});
