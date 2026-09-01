/* ONE popup per shortfall.
 *
 * enforce_min() switches a below-minimum order off screen print and says so.
 * calc() is reached several times for a single customer action — the radio's
 * change handler, the cart re-render, the quantity field — and every pass
 * re-reads the chosen method from the radio, so the customer saw the same
 * message twice. The switch must still run on every pass; only the telling is
 * deduplicated.
 *
 * These tests run the REAL function, extracted from the shipped app.js, so a
 * future edit to that file cannot pass a test written against a copy of it.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname,
  '../Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/core/assets/js/app.js');

/* Slice the function body out by matching braces, skipping strings and comments
   so a `{` inside either cannot end the block early. */
function extractBody(src, key) {
  const at = src.indexOf(key);
  assert.ok(at > 0, key + ' not found in app.js');
  let i = src.indexOf('{', at + key.length - 1);
  const start = i + 1;
  let depth = 0;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '*') { i = src.indexOf('*/', i) + 1; continue; }
    if (c === '/' && n === '/') { i = src.indexOf('\n', i); continue; }
    if (c === "'" || c === '"') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, i);
  }
  assert.fail('unbalanced braces while extracting ' + key);
}

const BODY = extractBody(fs.readFileSync(APP, 'utf8'), 'enforce_min : function () {');

const SCREEN = { id: 22, title: 'Screen Printing', calculate: { min_qty: 50 } };
const DTF = { id: 1, title: 'DTF Printing', calculate: {} };

function harness(qty) {
  const notices = [];
  const lumise = {
    data: { printings: [SCREEN, DTF] },
    cart: { qty: qty, printing: { current: SCREEN.id, min_notice: null } },
    fn: { notice: (m) => notices.push(m), dejson: (s) => JSON.parse(s) }
  };
  const $ = () => ({ prop() { return this; } });
  const enforce_min = new Function('lumise', '$',
    'return function () {' + BODY + '};')(lumise, $);
  /* One calc() pass: the radio hands back the chosen method, then enforce runs. */
  const pass = () => { lumise.cart.printing.current = SCREEN.id; return enforce_min(); };
  return { lumise, notices, enforce_min, pass };
}

test('a shortfall is announced exactly once across repeated re-prices', () => {
  const h = harness(12);
  assert.strictEqual(h.pass(), true);
  assert.strictEqual(h.pass(), true);
  assert.strictEqual(h.pass(), true);
  assert.strictEqual(h.notices.length, 1, 'customer must see one popup, not one per pass');
  assert.match(h.notices[0], /Screen Printing needs at least 50 pieces/);
  assert.match(h.notices[0], /now priced as DTF Printing/);
});

test('the switch itself still happens on every pass', () => {
  const h = harness(12);
  h.pass();
  assert.strictEqual(h.lumise.cart.printing.current, DTF.id);
  h.pass();
  assert.strictEqual(h.lumise.cart.printing.current, DTF.id,
    'silencing the notice must not silence the repricing');
});

test('a pass while already on the fallback does not re-arm the notice', () => {
  /* The regression that would bring the double popup straight back: the fallback
     has no minimum, and clearing the latch on that path re-arms every re-price. */
  const h = harness(12);
  h.pass();
  const armed = h.lumise.cart.printing.min_notice;
  assert.ok(armed, 'latch should be set after the first notice');
  h.enforce_min();                       // current is DTF now, min_qty absent
  assert.strictEqual(h.lumise.cart.printing.min_notice, armed, 'latch was cleared');
  h.pass();
  assert.strictEqual(h.notices.length, 1);
});

test('qualifying again re-arms, so a later drop speaks up', () => {
  const h = harness(12);
  h.pass();
  assert.strictEqual(h.notices.length, 1);

  h.lumise.cart.qty = 60;                // customer raises the order
  assert.strictEqual(h.pass(), false, 'at 60 the chosen method stands');
  assert.strictEqual(h.lumise.cart.printing.current, SCREEN.id);
  assert.strictEqual(h.lumise.cart.printing.min_notice, null);

  h.lumise.cart.qty = 12;                // and drops it back
  assert.strictEqual(h.pass(), true);
  assert.strictEqual(h.notices.length, 2, 'a NEW shortfall must be announced');
});

test('an empty quantity grid is still treated as one piece, not as qualifying', () => {
  const h = harness(0);
  assert.strictEqual(h.pass(), true);
  assert.strictEqual(h.notices.length, 1);
});
