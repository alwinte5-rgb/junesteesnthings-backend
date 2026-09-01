'use strict';

/* The decoration rate must be ONE number, whichever engine asks for it.
 *
 * The garment curve had this exact failure twice in one day: the designer and
 * the cart applied it differently, then rounded it differently. Decoration is
 * the other half of every line and had never been checked at all, which is what
 * issue #102 was for.
 *
 * Both engines read the SAME `printings.calculate` blob, but by different
 * routes and with different code:
 *
 *   storefront  app.js  lumise.cart.printing.calc()   walks calculate.values
 *   quote form  server.js tierAt()/bandPrice()        walks `positions`, built
 *                                                     by jt_printing_positions()
 *                                                     in the designer's PHP
 *
 * So this runs all three for real — the shipped JS on both sides and the real
 * PHP transform in between — over one blob, and demands the same rate.
 *
 * The convention that makes this dangerous: decoration bands key on CEILINGS
 * while the garment tiers beside them key on FLOORS. Read one as the other and
 * every band lands one step out, which looks like a small pricing change and is
 * not.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DESIGNER = path.join(ROOT, 'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const appjs = fs.readFileSync(path.join(DESIGNER, 'core/assets/js/app.js'), 'utf8');
const auth = fs.readFileSync(path.join(DESIGNER, 'jt-auth.php'), 'utf8');

/* ---------- 1. the quote engine, lifted from the string it ships as -------- */

function fromEngine(names) {
  const engine = src.slice(src.indexOf('function quotePricingSource()'));
  const body = engine.slice(engine.indexOf('return `') + 8, engine.indexOf('\n`;'));
  return vm.runInThisContext(`(() => { ${body}\n return { ${names.join(', ')} }; })()`);
}
const { tierAt, bandPrice } = fromEngine(['tierAt', 'bandPrice']);

/* ---------- 2. the storefront rule, lifted from the shipped app.js -------- */

function liftCalc() {
  const start = appjs.indexOf('calc : function (qty) {');
  assert.notStrictEqual(start, -1, 'printing.calc not found in app.js');
  let depth = 0;
  for (let i = appjs.indexOf('{', start); i < appjs.length; i++) {
    if (appjs[i] === '{') depth++;
    else if (appjs[i] === '}' && --depth === 0)
      return appjs.slice(appjs.indexOf('function', start), i + 1);
  }
  throw new Error('unbalanced braces reading printing.calc');
}
const calcFn = vm.runInThisContext('(' + liftCalc() + ')');

/** Price one job through the STOREFRONT engine. */
function storefront(blob, qty, { colours = 0, stage = 'front', multi = false } = {}) {
  const states = {};
  /* A real design, not an empty stage: the storefront only charges a fixed
     band when the stage actually carries something (`total_res > 0`), which is
     the same reason an empty product prices at the blank. One image is the
     smallest honest job. */
  states[stage] = { colors: colours > 0 ? new Array(colours).fill('#000') : [],
                    images: 1, vector: 0, clipart: 0, text: 0 };
  global.lumise = {
    fn: { dejson: (v) => v },
    data: { printings: [{ id: 1, calculate: JSON.parse(JSON.stringify(blob)) }] },
    cart: { printing: { current: 1, states_data: states } },
  };
  global.lumise.data.printings[0].calculate.multi = multi;
  return calcFn.call(null, qty);
}

/* ---------- 3. the PHP transform, run by the real interpreter ------------- */

let havePhp = true;
try { execFileSync('php', ['-v'], { stdio: 'ignore' }); } catch { havePhp = false; }

function positionsFor(blob) {
  const m = auth.match(/function jt_printing_positions\([\s\S]*?\n\}/);
  assert.notStrictEqual(m, null, 'jt_printing_positions not found in jt-auth.php');
  const script = '<?php\n' + m[0] + '\n'
    + '$calc = json_decode(\'' + JSON.stringify(blob).replace(/'/g, "\\'") + '\', true);\n'
    + 'list($p, $c, $u) = jt_printing_positions($calc);\n'
    + 'echo json_encode(array("positions" => $p, "colours" => $c, "unsupported" => $u));\n';
  const file = path.join(os.tmpdir(), 'jt-dec-parity-' + process.pid + '.php');
  fs.writeFileSync(file, script);
  try { return JSON.parse(execFileSync('php', [file], { encoding: 'utf8' })); }
  finally { fs.unlinkSync(file); }
}

/** Price the same job through the QUOTE engine, via the real PHP transform. */
function quote(blob, qty, { colours = 0, stage = 'front' } = {}) {
  const { positions } = positionsFor(blob);
  return tierAt(positions, qty, stage, colours);
}

/* ---------- the live shapes ---------------------------------------------- */

/* DTF Printing (#1) exactly as the live catalogue publishes it, and exactly as
   docs/pricing-2026.md states it. */
const DTF = { type: 'fixed', multi: true, values: { front: {
  11: { price: 26.05 }, 24: { price: 20.30 }, 49: { price: 15.75 },
  99: { price: 11.90 }, 249: { price: 9.50 }, 499: { price: 7.55 },
  999: { price: 6.10 }, 2499: { price: 4.90 }, 7000: { price: 4.00 } } } };

/* Screen Printing (#22): one method, a column per ink count. */
const SCREEN = { type: 'color', values: { front: {
  99:   { '1-color': 3.85, '2-color': 4.60, '3-color': 5.35, 'full-color': 9.10 },
  249:  { '1-color': 3.45, '2-color': 4.10, '3-color': 4.75, 'full-color': 8.20 },
  7000: { '1-color': 2.00, '2-color': 2.40, '3-color': 2.80, 'full-color': 5.00 } } } };

const EDGES = [1, 2, 10, 11, 12, 23, 24, 25, 48, 49, 50, 98, 99, 100,
               248, 249, 250, 498, 499, 500, 6999, 7000, 7001, 20000];

/* ---------- they must agree ---------------------------------------------- */

test('DTF: the storefront and the quote form price every band the same', () => {
  if (!havePhp) return;
  for (const q of EDGES) {
    const a = storefront(DTF, q), b = quote(DTF, q);
    assert.strictEqual(Math.round(a * 100) / 100, Math.round(b * 100) / 100,
      `qty ${q}: store says ${a}, quote says ${b}`);
  }
});

test('DTF: the published rates are the contracted ones', () => {
  /* Guards the direction of the whole thing: agreeing on a wrong number is
     still wrong. These are the Anchorfish 2026 figures. */
  const want = { 1: 26.05, 11: 26.05, 12: 20.30, 25: 15.75, 50: 11.90,
                 100: 9.50, 250: 7.55, 500: 6.10, 1000: 4.90, 2500: 4.00 };
  for (const [q, rate] of Object.entries(want)) {
    assert.strictEqual(storefront(DTF, Number(q)), rate, `storefront at ${q}`);
  }
});

test('bands key on CEILINGS, on both sides', () => {
  /* The band ending at 11 must hold AT 11 and step at 12. Read as floors this
     returns the 1-11 rate at 12 and the 12-24 rate at 11 — every band one step
     out, on a table where one step is $5.75 a shirt. */
  assert.strictEqual(storefront(DTF, 11), 26.05, 'the band holds at its ceiling');
  assert.strictEqual(storefront(DTF, 12), 20.30, 'and steps one above it');
  if (havePhp) {
    assert.strictEqual(quote(DTF, 11), 26.05);
    assert.strictEqual(quote(DTF, 12), 20.30);
  }
});

test('above the largest band, the largest band holds — not zero', () => {
  /* Falling off the end must not price decoration at nothing. */
  assert.strictEqual(storefront(DTF, 20000), 4.00);
  if (havePhp) assert.strictEqual(quote(DTF, 20000), 4.00);
});

test('screen printing agrees at every ink count and every band', () => {
  if (!havePhp) return;
  for (const q of EDGES) {
    for (const c of [1, 2, 3, 4, 7]) {
      const a = storefront(SCREEN, q, { colours: c });
      const b = quote(SCREEN, q, { colours: c });
      assert.strictEqual(Math.round(a * 100) / 100, Math.round(b * 100) / 100,
        `qty ${q}, ${c} colours: store ${a}, quote ${b}`);
    }
  }
});

test('an ink count with no column of its own falls to full-color, on both', () => {
  /* 4 and 7 colours have no column here; both engines must land on the
     full-color backstop rather than inventing a rate or charging nothing. */
  assert.strictEqual(storefront(SCREEN, 50, { colours: 4 }), 9.10);
  if (havePhp) assert.strictEqual(quote(SCREEN, 50, { colours: 4 }), 9.10);
});

test('an ink count off the end of the table never prints for free', () => {
  /* The failure this closes. A band with no full-color backstop and an ink
     count with no column of its own used to price at ZERO on the storefront
     while the quote form charged the base rate — the same order, decorated
     free online. No live band is shaped that way today, which is exactly why
     it needed a test rather than a bug report. */
  const noBackstop = { type: 'color', values: { front: {
    99: { '1-color': 3.85, '2-color': 4.60 } } } };

  const store = storefront(noBackstop, 50, { colours: 5 });
  assert.notStrictEqual(store, 0, 'decoration must never fall through to free');
  assert.strictEqual(store, 3.85, 'it falls back to the band base rate');
  if (havePhp) assert.strictEqual(quote(noBackstop, 50, { colours: 5 }), 3.85,
    'and the quote form agrees');
});

test('with no 1-color column either, both fall back to the cheapest one', () => {
  const odd = { type: 'color', values: { front: {
    99: { '3-color': 6.40, '2-color': 5.10 } } } };
  const store = storefront(odd, 50, { colours: 9 });
  assert.strictEqual(store, 5.10, 'the cheapest column, matching the transform');
  if (havePhp) assert.strictEqual(quote(odd, 50, { colours: 9 }), 5.10);
});

test('every live active method is one the quote engine can actually price', () => {
  /* A band shape the transform does not understand publishes NO bands, and a
     method with no bands reads to every consumer as free decoration rather
     than as an error. That is how screen printing looked unpriced for a week. */
  if (!havePhp) return;
  for (const blob of [DTF, SCREEN]) {
    const { positions, unsupported } = positionsFor(blob);
    assert.strictEqual(unsupported, '', 'the transform must understand this shape');
    assert.ok(Object.keys(positions).length > 0, 'and publish bands for it');
  }
});
