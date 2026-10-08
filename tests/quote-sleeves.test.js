/* Sleeve prints on a quote line.
 *
 * The designer already lets a customer print one or both sleeves, and prices
 * each printed stage as another pass of the method (core/cart.php
 * printing_calc_raw). The quote form only offered front / back / both, so a
 * sleeve job could not be quoted at all. These pin that a sleeve:
 *
 *   - adds one more pass of the first decoration's table per sleeve,
 *   - is priced at its own ink count (usually one colour beside a fuller front),
 *   - burns its own screens, at its own ink count, plus the white underbase,
 *   - is checked against the press ceiling as its own pass,
 *   - and that anything but left/right/both adds nothing.
 *
 * Run: node --test tests/quote-sleeves.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const text = vm.runInThisContext(lift('quotePricingSource') + '\nquotePricingSource()');
const { priceLine } = vm.runInThisContext(text + '\n({ priceLine })');

const summary = (() => {
  const top = (name) => { const b = src.slice(src.indexOf('function ' + name + '(')); return b.slice(0, b.indexOf('\n}\n') + 2); };
  return vm.runInThisContext('(function(){' + text + '\n' + top('itemPrints') + '\n' +
    top('decorationSummary') + '\nreturn decorationSummary; })()');
})();

/* One table (multi:false), priced by colour, like the shop's screen printing. */
const SCREEN = {
  id: 22, title: 'Screen Printing', type: 'color', min_order_qty: 0,
  positions: { id: [{ min_qty: 100, colors: { '1-color': 4, '2-color': 5, '3-color': 6 } }] },
};
/* Two groups, like DTF: front, then the cheaper secondary location. */
const DTF = {
  id: 1, title: 'DTF Printing', type: 'fixed', min_order_qty: 0,
  positions: { id: [{ min_qty: 100, price: 7 }], mr8a5dlx: [{ min_qty: 100, price: 5 }] },
};
const screens = { code: 'screens', label: 'Screens', kind: 'per_screen', rate: 25 };
/* noBase: the sleeve arithmetic is pinned without the white base so the
   numbers stay readable; every case marked `withBase` runs the real rule
   (the base on every garment, screen-fees.test.js). */
const base = { qty: 50, product: { price: 3, sizes: [] }, addons: [screens], noBase: true };
const withBase = { noBase: false };

test('no sleeves prices exactly as before', () => {
  const a = priceLine({ ...base, method: SCREEN, colours: 3 });
  const b = priceLine({ ...base, method: SCREEN, colours: 3, sleeves: '' });
  assert.equal(a.lineTotal, b.lineTotal);
  assert.equal(a.decoration, 6);
  assert.equal(a.screens, 3);
});

test('each sleeve is one more pass, at its own ink count', () => {
  const one = priceLine({ ...base, method: SCREEN, colours: 3, sleeves: 'left', sleeveColours: 1 });
  assert.equal(one.decoration, 6 + 4);
  const two = priceLine({ ...base, method: SCREEN, colours: 3, sleeves: 'both', sleeveColours: 1 });
  assert.equal(two.decoration, 6 + 4 + 4);
  assert.equal(two.sleeves, 2);
});

test('a sleeve with no ink count of its own takes the front count', () => {
  const r = priceLine({ ...base, method: SCREEN, colours: 2, sleeves: 'right' });
  assert.equal(r.decoration, 5 + 5);
});

test('sleeves burn their own screens, each with its own underbase', () => {
  const bare = priceLine({ ...base, method: SCREEN, colours: 3, sleeves: 'both', sleeveColours: 1 });
  assert.equal(bare.screens, 3 + 2);
  const based = priceLine({ ...base, method: SCREEN, colours: 3, sleeves: 'both', sleeveColours: 1, ...withBase });
  assert.equal(based.screens, 4 + 2 * 2);
  assert.equal(based.addonLines.find((a) => a.code === 'screens').total, (4 + 4) * 25);
});

test('a multi-group method prices a sleeve on its secondary group', () => {
  const r = priceLine({ ...base, method: DTF, sleeves: 'both' });
  assert.equal(r.decoration, 7 + 5 + 5);
});

test('a sleeve is checked against the press ceiling as its own pass', () => {
  const big = { ...SCREEN, max_screens: 3 };
  const ok = priceLine({ ...base, method: big, colours: 2, sleeves: 'left', sleeveColours: 1, ...withBase });
  assert.equal(ok.overScreens, false);
  const over = priceLine({ ...base, method: big, colours: 1, sleeves: 'left', sleeveColours: 3, ...withBase });
  assert.equal(over.overScreens, true);
  assert.equal(over.passScreens, 4);
});

test('an unknown sleeves value adds nothing', () => {
  const r = priceLine({ ...base, method: SCREEN, colours: 1, sleeves: 'all four' });
  assert.equal(r.decoration, 4);
  assert.equal(r.sleeves, 0);
});

test('the customer page names the sleeves and their ink count', () => {
  const cat = { methods: [SCREEN, DTF] };
  assert.equal(summary({ method_id: 22, stage: '', colours: '3', sleeves: 'both', sleeve_colours: 1 }, cat)[0],
    'Screen Printing — front and both sleeves — 3 colors front, 1 color sleeves');
  assert.equal(summary({ method_id: 1, stage: 'both', sleeves: 'left' }, cat)[0],
    'DTF Printing — front, back and left sleeve');
  assert.equal(summary({ method_id: 1, stage: '' }, cat)[0], 'DTF Printing — front');
});

test('the save route keeps sleeves to the three known values', () => {
  assert.match(src, /\['left', 'right', 'both'\]\.includes\(rawSleeves\)/);
  assert.match(src, /for \(const loc of PRINT_LOCS\)/);
});

test('the pricing source recognises "Screen Printing" as screen printing', () => {
  /* The regex lives in a template literal; a single backslash compiled it to
     /screens*print/ and the press ceiling was never checked. */
  const r = priceLine({ ...base, method: { ...SCREEN, max_screens: 3 }, colours: 3, ...withBase });
  assert.equal(r.overScreens, true);
});

/* Front + back at different ink counts (2026-10-05). */
test('front + back: each side priced and screened at its own count', () => {
  const same = priceLine({ ...base, method: SCREEN, colours: 3, stage: 'both' });
  assert.equal(same.decoration, 12, 'no back count = the front count, as old quotes were priced');
  assert.equal(same.screens, 6);
  const diff = priceLine({ ...base, method: SCREEN, colours: 3, stage: 'both', backColours: 1 });
  assert.equal(diff.decoration, 6 + 4);
  assert.equal(diff.screens, 3 + 1);
  const based = priceLine({ ...base, method: SCREEN, colours: 3, stage: 'both', backColours: 1, ...withBase });
  assert.equal(based.screens, 4 + 2);
});

test('a back count is ignored unless the line is front + back', () => {
  const r = priceLine({ ...base, method: SCREEN, colours: 3, stage: '', backColours: 1 });
  assert.equal(r.decoration, 6);
  assert.equal(r.screens, 3);
});

test('the back is checked against the press ceiling as its own pass', () => {
  const big = { ...SCREEN, max_screens: 3 };
  const r = priceLine({ ...base, method: big, colours: 1, stage: 'both', backColours: 3, ...withBase });
  assert.equal(r.overScreens, true);
});

test('the customer page names different front and back counts', () => {
  const cat = { methods: [SCREEN] };
  assert.equal(summary({ method_id: 22, stage: 'both', colours: '3', back_colours: 1 }, cat)[0],
    'Screen Printing — front and back — 3 colors front, 1 color back');
  assert.equal(summary({ method_id: 22, stage: 'both', colours: '2', back_colours: 2 }, cat)[0],
    'Screen Printing — front and back — 2 colors');
});

test('the save route keeps a back count only on a front + back colour-priced line', () => {
  assert.match(src, /stage === 'both' && method && method\.type === 'color' && rawBack/);
  assert.match(src, /back_colours: backColours \|\| null,/);
});
