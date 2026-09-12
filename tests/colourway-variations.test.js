'use strict';

/* Does picking a colour actually change the garment on the canvas?
 *
 * This cannot be answered by reading the database: the row can be perfectly
 * well-formed and the editor still ignore it. It was, twice.
 *
 * So this runs the SHIPPED process_variations out of app.js — not a
 * reimplementation of it — against the real product row, and asserts that
 * selecting a colour returns that colour's artwork.
 *
 * The two failures it would have caught:
 *
 *   1. The colour attribute had no `id`. The designer builds the cart input as
 *      name="'+data.id+'", so it rendered name="undefined" and the value was
 *      never collected. A condition on COL cannot match a value nobody sends.
 *   2. "Loden/ Black" and "Loden/ Khaki" shared #777056, so two different caps
 *      resolved to one variation.
 *
 * The editor's own ajax sits behind Cloudflare and returns 403 to anything that
 * is not a browser, so this is the only way to check it from a terminal.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DESIGNER = path.join(ROOT, 'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise');
const appjs = fs.readFileSync(path.join(DESIGNER, 'core/assets/js/app.js'), 'utf8');
const fx = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'product-164-variations.json'), 'utf8'));

/** The shipped function, lifted verbatim and given the globals it expects. */
function loadProcessVariations(product, variations) {
  const start = appjs.indexOf('process_variations : function(values, el) {');
  assert.notStrictEqual(start, -1, 'process_variations not found in app.js');
  /* Balance braces from the function keyword to its close. */
  const from = appjs.indexOf('{', appjs.indexOf('function', start));
  let depth = 0, end = -1;
  for (let i = from; i < appjs.length; i++) {
    if (appjs[i] === '{') depth++;
    else if (appjs[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  assert.notStrictEqual(end, -1, 'could not find the end of process_variations');
  const body = appjs.slice(from + 1, end);

  /* jQuery is used only for deep clone/merge here. */
  const $ = {
    extend(deep, target, src) {
      if (src === undefined) { src = target; target = deep; deep = false; }
      return Object.assign(target, JSON.parse(JSON.stringify(src === undefined ? {} : src)));
    },
  };
  const lumise = {
    data: { variations },
    ops: { product_data: product },
    cart: { printing: { current: null } },
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function('values', 'el', '$', 'lumise', body);
  return (values, el) => fn(values, el, $, lumise);
}

const product = {
  name: fx.name, description: fx.description, price: fx.price,
  printings: fx.printings, attributes: fx.attributes, stages: fx.stages,
};

test('the fixture is the real product, with unique swatches', () => {
  const vals = Object.values(fx.variations.variations).map((v) => v.conditions.COL);
  assert.strictEqual(new Set(vals).size, vals.length,
    'two colourways share a swatch — they would collapse to one variation');
  assert.ok(vals.length >= 6, 'expected every colourway wired');
});

test('each colourway resolves to its own artwork', () => {
  const run = loadProcessVariations(product, fx.variations);
  const seen = new Set();
  for (const v of Object.values(fx.variations.variations)) {
    const colour = v.conditions.COL;
    const out = run({ COL: colour }, { name: 'COL' });
    assert.strictEqual(out.cfgstages, true,
      colour + ' did not select a variation with its own stages');
    const img = out.stages.front.image;
    assert.match(img, /^https:\/\/res\.cloudinary\.com\//,
      colour + ' resolved to a non-absolute image: ' + img);
    assert.ok(!seen.has(img), 'two colourways share artwork: ' + img);
    seen.add(img);
  }
  assert.strictEqual(seen.size, Object.keys(fx.variations.variations).length);
});

test('the photo is the base layer, not a wash over the design', () => {
  const run = loadProcessVariations(product, fx.variations);
  const first = Object.values(fx.variations.variations)[0];
  const out = run({ COL: first.conditions.COL }, { name: 'COL' });
  /* overlay:true hands the art to canvas.setOverlayImage(), which paints it
     ON TOP of the customer's design — right for a translucent shading map,
     and it would hide the design completely behind a photograph. */
  assert.strictEqual(out.stages.front.overlay, false,
    'the garment photo would be drawn over the design');
});

test('the two caps that used to be indistinguishable now are not', () => {
  const run = loadProcessVariations(product, fx.variations);
  const byName = {};
  for (const v of Object.values(fx.variations.variations)) byName[v.conditions.COL] = v;
  const vals = Object.keys(byName);
  const a = run({ COL: vals[3] }, { name: 'COL' }).stages.front.image;
  const b = run({ COL: vals[4] }, { name: 'COL' }).stages.front.image;
  assert.notStrictEqual(a, b, 'the Loden pair still resolve to the same cap');
});

test('an unknown colour selects no variation rather than the wrong one', () => {
  const run = loadProcessVariations(product, fx.variations);
  const out = run({ COL: '#123456' }, { name: 'COL' });
  assert.notStrictEqual(out.cfgstages, true,
    'a colour with no variation must fall back to the product, not borrow one');
});

test('the stage image is loaded with crossOrigin, or the canvas taints', () => {
  /* Stage art used to be same-origin (core/raws/...), so this did not matter.
     Per-colourway art is served from Cloudinary, and fabric.util.loadImage
     without a crossOrigin argument gives the <img> no crossorigin attribute —
     which taints the canvas the moment it is drawn. lumise.tools.toImage then
     calls s.canvas.toDataURL(), which throws SecurityError, and the design
     screenshot stops saving. Cloudinary already answers with
     access-control-allow-origin: *, so 'anonymous' is all that was missing. */
  const call = appjs.indexOf('fabric.util.loadImage(stage.image');
  assert.notStrictEqual(call, -1, 'the stage image loader moved');
  const after = appjs.slice(call, call + 3000);
  assert.match(after, /\}, *null, *'anonymous'\)/,
    'the stage image is loaded without crossOrigin — the canvas will taint');
});

test('the art is served with permissive CORS, which is what makes that work', () => {
  /* Recorded rather than fetched: a test must not depend on the network. This
     is the header observed on the uploaded art — if the Cloudinary account ever
     stops sending it, crossOrigin="anonymous" starts FAILING the load instead
     of tainting, and the canvas goes blank rather than degrading. */
  const fxUrl = Object.values(fx.variations.variations)[0].stages.front.image;
  assert.match(fxUrl, /^https:\/\/res\.cloudinary\.com\//,
    'art is not on the CDN this assumption is about');
});
