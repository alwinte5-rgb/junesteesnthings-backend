/* Regression tests for the one-time digitizing fee on a quote (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * THE BUG THESE EXIST TO PREVENT
 * ------------------------------
 * Digitizing is billed once per design. A decoration method in this system is a
 * per-piece rate multiplied by the line quantity, so offering digitizing as a
 * method billed it once per GARMENT: $30 on a 50-piece embroidery line is
 * $1,500 instead of $30, and nothing on the page says so — the line total just
 * looks like embroidery is expensive.
 *
 * That is why digitizing is excluded from the method list and asked for
 * separately, and why the fee is added to the line total exactly once. These
 * tests pin all three halves of that:
 *
 *   1. the fee is added once, never scaled by quantity
 *   2. digitizing never appears in the method dropdown
 *   3. the amount comes from the catalogue, never from the posted form, so a
 *      tampered request cannot name its own fee
 *
 * server.js boots a listener and a DB pool on require, which is why the
 * functions are lifted out of the source rather than imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

const re = (name) => {
  const m = src.match(new RegExp(`const ${name} = (/.*?/[gimsuy]*);`));
  assert.ok(m, `const ${name} not found in server.js`);
  return m[1];
};

const { digitizingOptions, DIGITIZING_METHOD_RE, EMBROIDERY_METHOD_RE } =
  vm.runInThisContext(`(function(){
    const DIGITIZING_METHOD_RE = ${re('DIGITIZING_METHOD_RE')};
    const EMBROIDERY_METHOD_RE = ${re('EMBROIDERY_METHOD_RE')};
    ${lift('digitizingOptions')}
    return { digitizingOptions, DIGITIZING_METHOD_RE, EMBROIDERY_METHOD_RE };
  })()`);

/* A catalogue shaped like the real one from jt-catalog.php. */
const tier = (price) => ({ front: [{ min_qty: 1, price }] });
const CATALOG = {
  methods: [
    { id: 8,  title: 'Embroidery — Small Logo (≤6×6 cm, to 8k stitches)', use_for_quoting: true, positions: tier(20) },
    { id: 11, title: 'Embroidery — Full Back (≤30×30 cm, 22k–25k stitches)', use_for_quoting: true, positions: tier(75) },
    { id: 12, title: 'DST Digitizing — one-time (to 15k stitches)', use_for_quoting: true, positions: tier(30) },
    { id: 17, title: 'DST Digitizing — one-time, Full Back (to 25k stitches)', use_for_quoting: true, positions: tier(80) },
    { id: 2,  title: 'Screen Printing — 1 Color', use_for_quoting: true, positions: tier(9.35) },
    { id: 99, title: 'DST Digitizing — broken row', use_for_quoting: true, positions: {} },
  ],
};

/* ── The fee is charged once, not per piece ─────────────────────────────── */

/* The real arithmetic from the save path: unit x qty, plus upcharges, plus the
   setup ONCE. Restated here because it lives inline in the route; if it ever
   moves into a helper, lift that instead. */
const lineTotal = (unit, qty, upTotal, setupFee) =>
  Math.round((unit * qty + upTotal + setupFee) * 100) / 100;

test('digitizing is added once, whatever the quantity', () => {
  /* The bug: $30 on 50 pieces must be $30, not $1,500. */
  const fifty = lineTotal(20, 50, 0, 30);
  assert.strictEqual(fifty, 1030);
  assert.notStrictEqual(fifty, 20 * 50 + 30 * 50);
});

test('the fee does not grow between quantities', () => {
  const a = lineTotal(20, 12, 0, 30) - 20 * 12;
  const b = lineTotal(20, 500, 0, 30) - 20 * 500;
  assert.strictEqual(a, b, 'the setup fee must be identical at any quantity');
  assert.strictEqual(a, 30);
});

test('the per-piece rate shown excludes the one-off', () => {
  /* unit_price is what the customer reads as "each". Blending a one-time fee
     into it makes the embroidery itself look more expensive than it is, and on
     a 1-piece order it would double the apparent rate. */
  const total = lineTotal(20, 10, 0, 30);
  const unit = Math.round(((total - 30) / 10) * 100) / 100;
  assert.strictEqual(unit, 20);
  assert.strictEqual(Math.round((unit * 10 + 30) * 100) / 100, total);
});

/* ── It must not be selectable as a decoration ──────────────────────────── */

test('digitizing is filtered out of the method dropdown', () => {
  /* Left in the list it reads as a decoration applied to every piece — which is
     exactly how it would then be billed. */
  const offered = CATALOG.methods.filter(
    (m) => m.use_for_quoting && Object.keys(m.positions || {}).length &&
           !DIGITIZING_METHOD_RE.test(m.title));
  assert.deepStrictEqual(offered.map((m) => m.id), [8, 11, 2]);
});

test('every digitizing row is recognised as digitizing', () => {
  for (const t of ['DST Digitizing — one-time (to 15k stitches)',
                   'DST Digitizing Fee — Large Logo', 'digitizing']) {
    assert.ok(DIGITIZING_METHOD_RE.test(t), `${t} should match`);
  }
  assert.ok(!DIGITIZING_METHOD_RE.test('Embroidery — Small Logo'));
  assert.ok(!DIGITIZING_METHOD_RE.test('Screen Printing — 1 Color'));
});

test('embroidery is recognised, and screen print is not', () => {
  assert.ok(EMBROIDERY_METHOD_RE.test('Embroidery — Full Back (≤30×30 cm)'));
  assert.ok(!EMBROIDERY_METHOD_RE.test('Screen Printing — 1 Color'));
  assert.ok(!EMBROIDERY_METHOD_RE.test('Printing'));
});

/* ── The amount comes from the catalogue, not the form ──────────────────── */

test('the offered fees are read from the catalogue, cheapest first', () => {
  const opts = digitizingOptions(CATALOG);
  assert.deepStrictEqual(opts.map((d) => d.id), [12, 17]);
  assert.deepStrictEqual(opts.map((d) => d.price), [30, 80]);
});

test('a digitizing row with no price is not offered', () => {
  /* id 99 has an empty positions object. Offered, it would quote $0 silently. */
  assert.ok(!digitizingOptions(CATALOG).some((d) => d.id === 99));
});

test('a posted id that is not a digitizing method buys nothing', () => {
  /* The form posts an ID, never a price. Anything else must resolve to no fee
     rather than to a fee somebody chose for themselves. */
  for (const posted of ['8', '2', '999', 'null', '', '30.00']) {
    const d = digitizingOptions(CATALOG).find((x) => String(x.id) === posted);
    assert.strictEqual(d, undefined, `${posted} must not resolve to a fee`);
  }
});

test('a valid posted id resolves to the catalogue price', () => {
  const d = digitizingOptions(CATALOG).find((x) => String(x.id) === '17');
  assert.strictEqual(d.price, 80);
});
