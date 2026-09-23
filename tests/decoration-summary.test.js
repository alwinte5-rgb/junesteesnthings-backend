'use strict';

/* The customer's page has to name the printing.
 *
 * A quote showed a garment name, a quantity and a price. On a $18.97 tee the
 * printing was the larger half of that number and the page never mentioned it,
 * so the line read as an expensive blank. The words come from the same stage
 * and colour values that priced it, so the description and the money cannot
 * drift apart.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const fn = (() => {
  const i = src.indexOf('function decorationSummary(item, catalog)');
  assert.ok(i > -1, 'decorationSummary not found in server.js');
  const body = src.slice(i);
  return vm.runInThisContext('(' + body.slice(0, body.indexOf('\n}\n') + 2) + ')');
})();

const DTF = { id: 1, title: 'DTF Printing', type: 'fixed' };
const SCREEN = { id: 22, title: 'Screen Printing', type: 'color' };
const catalog = { methods: [DTF, SCREEN] };

test('a one-decoration line names the method and where it goes', () => {
  assert.deepStrictEqual(fn({ method_id: 1, stage: '' }, catalog), ['DTF Printing — front']);
  assert.deepStrictEqual(fn({ method_id: 1, stage: 'mr8a5dlx' }, catalog), ['DTF Printing — back']);
  assert.deepStrictEqual(fn({ method_id: 1, stage: 'both' }, catalog), ['DTF Printing — front and back']);
});

test('a two-decoration line names both, in order', () => {
  const out = fn({ method_id: 1, stage: '', method2_id: 22, stage2: 'mr8a5dlx', colours2: '1' }, catalog);
  assert.equal(out.length, 2);
  assert.equal(out[0], 'DTF Printing — front');
  assert.equal(out[1], 'Screen Printing — back — 1 colour');
});

test('the colour count is said only where the price turns on it', () => {
  /* Screen printing is priced per colour, so the count belongs on the line.
     DTF is not, and "1 colour" about a full-colour process would be wrong. */
  assert.equal(fn({ method_id: 22, stage: '', colours: '4' }, catalog)[0], 'Screen Printing — front — 4 colours');
  assert.equal(fn({ method_id: 22, stage: '', colours: '1' }, catalog)[0], 'Screen Printing — front — 1 colour');
  assert.equal(fn({ method_id: 1, stage: '', colours: '4' }, catalog)[0], 'DTF Printing — front');
});

test('a line with no decoration says nothing rather than something empty', () => {
  assert.deepStrictEqual(fn({ method_id: null }, catalog), []);
  assert.deepStrictEqual(fn({}, catalog), []);
  /* A method id that no longer resolves must not render a stray dash. */
  assert.deepStrictEqual(fn({ method_id: 999 }, catalog), []);
  assert.deepStrictEqual(fn({ method_id: 1 }, { methods: [] }), []);
});

test('the summary is rendered on the customer line, and escaped', () => {
  assert.ok(/decorationSummary\(i, catalog\)/.test(src), 'the customer line does not call it');
  const block = src.slice(src.indexOf('const deco = decorationSummary(i, catalog);'));
  assert.match(block.slice(0, 400), /escEmail\(d\)/, 'a method title reaches the page unescaped');
});

test('the page says what the each-price covers', () => {
  assert.match(src, /The price each covers the garment/, 'the explanation line is gone');
  assert.match(src, /screens,\s*\n?\s*setup, design — is its own row/,
    'it should name the charges that are billed once rather than per piece');
});
