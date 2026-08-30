/* Screens are bought once, so they are billed once.
 *
 * WHAT WENT WRONG
 * ---------------
 * A screen is burned once and then runs the whole job, but the price tables
 * amortised it into the per-piece rate: `p[c-1] * mk + (25 * colours) / band`.
 * Three things follow from that, and all three are wrong.
 *
 *   - A 50-piece job paid the whole setup and a 500-piece job paid a tenth of
 *     it per shirt, so small runs subsidised large ones inside a single rate
 *     card nobody could see into.
 *   - The setup cost was invisible to the customer. "$8.45 each" cannot be
 *     checked; "4 screens x $35" can.
 *   - The old `underbase` add-on charged a FLAT $25 once, no matter how many
 *     colours or locations. Invoice #16899 — 62 shirts, white on black, two
 *     locations — is four screens. At $25 flat the shop recovered $25 against
 *     four screens it had actually paid $80 for.
 *
 * THE RULE
 * --------
 * $35 per screen, charged ONCE per order, where
 *
 *     screens = (design colours + 1 if the garment is dark) x locations
 *
 * The "+1 on darks" is not a surcharge. Invoice #16899 lists "Ink: Base,
 * White", which is the white underbase getting its own screen — so a 1-colour
 * design on black is physically a 2-screen job per location.
 *
 * WHAT THESE PIN
 * --------------
 * 1. screenCount()'s arithmetic, including the junk-input floor.
 * 2. That `per_screen` bills once and never scales with quantity — the exact
 *    bug class that made a $30 digitizing fee bill $1,500 on a 50-piece line.
 * 3. That the per-piece table no longer carries a screen charge, so the two
 *    halves cannot both bill it.
 *
 * Run: node tests/screen-fees.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

/** Lift a top-level `function name(...) {...}` out of server.js by brace depth. */
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

/* runInThisContext, not runInNewContext: values built in a fresh realm carry
   that realm's Array.prototype and deepStrictEqual compares prototypes, which
   fails on arrays that are character-for-character identical. The engine has no
   free variables, so there are no globals to fake. */
const text = vm.runInThisContext(lift('quotePricingSource') + '\nquotePricingSource()');
const { priceLine, addonAmount, screenCount } =
  vm.runInThisContext(text + '\n({ priceLine, addonAmount, screenCount })');

const SCREEN_FEE = 25;
const screensAddon = { code: 'screens', label: 'Screens', kind: 'per_screen', rate: SCREEN_FEE };

/* Method #22 as the catalogue holds it: one `color` table, bands as CEILINGS.
   Rates are print-only — the agreed table with screens taken out. */
const SCREEN = {
  id: 22, title: 'Screen Printing', type: 'color', min_order_qty: 50,
  positions: { front: [
    { min_qty:  99, price: 4.25, colors: { '1-color':4.25, '2-color':5.30, '3-color':6.40, '7-color':10.80, 'full-color':10.80 } },
    { min_qty: 249, price: 3.80, colors: { '1-color':3.80, '2-color':4.75, '3-color':5.85, '7-color':10.15, 'full-color':10.15 } },
    { min_qty: 499, price: 3.35, colors: { '1-color':3.35, '2-color':4.20, '3-color':5.25, '7-color': 9.50, 'full-color': 9.50 } },
  ] },
};
const BLANK = { id: 12, price: 0, sizes: [{ size: 'M', upcharge: 0 }] };

const line = (over) => priceLine(Object.assign({
  product: BLANK, method: SCREEN, qty: 100, colours: 1, stage: 'front',
  addons: [screensAddon], blankTiers: [],
}, over));

/* ── screenCount ─────────────────────────────────────────────────────────── */

test('screens are per colour and per location', () => {
  assert.strictEqual(screenCount(1, 1, false), 1);
  assert.strictEqual(screenCount(3, 1, false), 3);
  assert.strictEqual(screenCount(3, 2, false), 6, 'a second location is a second set of screens');
  assert.strictEqual(screenCount(7, 2, false), 14);
});

test('a dark garment adds one underbase screen PER LOCATION', () => {
  assert.strictEqual(screenCount(1, 1, true), 2, '1 colour on black is two screens');
  assert.strictEqual(screenCount(3, 1, true), 4);
  assert.strictEqual(screenCount(3, 2, true), 8, 'the underbase is burned for each location');
});

test('invoice #16899: white on black, two locations, is four screens', () => {
  /* 62 shirts. Anchorfish charged 4 screens at $20 = $80 of cost. The retired
     flat-$25 underbase add-on recovered $25 of that. */
  assert.strictEqual(screenCount(1, 2, true), 4);
  assert.strictEqual(screenCount(1, 2, true) * SCREEN_FEE, 100);
});

test('junk colour or location counts floor at one, never zero', () => {
  /* A zero would make the screens free silently, which is the failure mode this
     codebase keeps having to design against. */
  for (const bad of [0, -3, null, undefined, '', 'abc', NaN]) {
    assert.ok(screenCount(bad, 1, false) >= 1, `colours=${String(bad)} must not zero the fee`);
    assert.ok(screenCount(1, bad, false) >= 1, `locations=${String(bad)} must not zero the fee`);
  }
  assert.strictEqual(screenCount(-3, -3, false), 1);
});

/* ── addonAmount ─────────────────────────────────────────────────────────── */

test('per_screen bills rate x screens, and ignores quantity', () => {
  assert.strictEqual(addonAmount(screensAddon, 50, 3, 0, 6), 6 * SCREEN_FEE);
  assert.strictEqual(addonAmount(screensAddon, 5000, 3, 0, 6), 6 * SCREEN_FEE,
    'quantity must not enter it');
});

test('a missing screen count falls back to one per colour, not to zero', () => {
  assert.strictEqual(addonAmount(screensAddon, 100, 4, 0, undefined), 4 * SCREEN_FEE);
  assert.strictEqual(addonAmount(screensAddon, 100, 4, 0, 0), 4 * SCREEN_FEE);
});

/* ── through priceLine ───────────────────────────────────────────────────── */

test('the screen fee is charged ONCE, not per piece', () => {
  /* The digitizing bug in miniature: a one-time fee multiplied by a 50-piece
     line billed $1,500 instead of $30. */
  const small = line({ qty: 50, colours: 3 });
  const big   = line({ qty: 500, colours: 3 });
  assert.strictEqual(small.addonTotal, 3 * SCREEN_FEE);
  assert.strictEqual(big.addonTotal, 3 * SCREEN_FEE, 'ten times the shirts, the same screens');
});

test('priceLine derives locations from the same stage it priced the print off', () => {
  const one  = line({ colours: 2, stage: 'front' });
  const both = line({ colours: 2, stage: 'both' });
  assert.strictEqual(one.locations, 1);
  assert.strictEqual(both.locations, 2);
  assert.strictEqual(both.screens, 4);
  assert.strictEqual(both.addonTotal, 4 * SCREEN_FEE);
  /* And the print itself doubled, because a second screen-print location is a
     second pass — confirmed with Anchorfish 2026-08-30, no shared-setup
     discount on their screen sheet. */
  assert.strictEqual(both.decoration, one.decoration * 2);
});

test('a dark two-sided job bills every screen it burns', () => {
  const r = line({ qty: 62, colours: 1, stage: 'both', dark: true });
  assert.strictEqual(r.screens, 4);
  assert.strictEqual(r.addonTotal, 4 * SCREEN_FEE);
});

test('the line reports the counts it charged, so a surface can show them', () => {
  const r = line({ colours: 3, stage: 'both', dark: true });
  assert.strictEqual(r.colours, 3);
  assert.strictEqual(r.locations, 2);
  assert.strictEqual(r.screens, 8);
  assert.deepStrictEqual(r.addonLines.map((a) => a.code), ['screens']);
  assert.strictEqual(r.addonLines[0].total, 8 * SCREEN_FEE);
});

test('screens ride on top of the print, they do not replace it', () => {
  const r = line({ qty: 100, colours: 3, stage: 'front' });
  assert.strictEqual(r.decoration, 5.85, 'the 100-249 band, 3 colours, print only');
  assert.strictEqual(r.lineTotal, 5.85 * 100 + 3 * SCREEN_FEE);
});

/* ── the deploy/reprice ordering guard ───────────────────────────────────── */

test('the fee is gated until the tables are repriced, on BOTH surfaces', () => {
  /* The per-piece tables and the fee cannot change atomically — one is a deploy,
     the other is a write to the Lumise database. Ship the fee while the tables
     still amortise screens and every screen bills twice. The flag is what joins
     them, and it has to gate the browser preview and the save route alike or
     one surface quotes a price the other does not charge. */
  assert.ok(/const SCREEN_FEES_LIVE = String\(process\.env\.JT_SCREEN_FEES/.test(src),
    'SCREEN_FEES_LIVE must be read from JT_SCREEN_FEES');
  const gates = src.split('!SCREEN_FEES_LIVE').length - 1;
  assert.ok(gates >= 2,
    `the screens add-on is gated in ${gates} place(s); it must be gated in both ` +
    'the browser preview and the save route');
});

/* ── the rate card no longer carries a screen charge ─────────────────────── */

test('the reprice tool prices print only — screens are not folded back in', () => {
  /* Anchored on the declarations, not on the formula they guard: if someone
     rewrites the formula this still resolves and the assertion below names the
     regression, rather than dying with "not found" and reporting a rename. */
  const tool = fs.readFileSync(path.join(ROOT, 'tools', 'reprice-anchorfish-2026.js'), 'utf8');
  const grab = (anchor, end) => {
    const i = tool.indexOf(anchor);
    assert.notStrictEqual(i, -1, `${anchor} not found in reprice-anchorfish-2026.js`);
    return tool.slice(i, tool.indexOf(end, i) + end.length);
  };
  const sandbox = { up05: (n) => Math.ceil(n * 20 - 1e-9) / 20 };
  vm.createContext(sandbox);
  vm.runInContext(grab('const SP = {', '};') + '\n' + grab('const spPrice =', ';') +
    '\nthis.spPrice = spPrice;', sandbox);

  /* The agreed card, print only, from docs/pricing-2026.md. If a screen charge
     creeps back into the base every one of these rises.
     Repriced 2026-08-30: markups cut to 2.13/2.09/2.05/2.03/2.02/2.02, anchoring
     1 colour at 50-99 on $3.85. The old anchor put a 100-piece two-location job
     at $14.64/pc, the top of what this trade quotes for one colour on a basic
     tee, and the second location is already billed at full rate because
     Anchorfish gives no shared-setup discount. */
  const AGREED = {
    1: [3.85, 3.45, 3.05, 2.70, 2.40, 2.00],
    3: [5.80, 5.30, 4.75, 4.35, 3.90, 3.50],
    7: [9.80, 9.25, 8.60, 8.15, 7.70, 7.30],
  };
  const FLOORS = [50, 100, 250, 500, 1000, 2500];
  for (const c of [1, 3, 7]) {
    FLOORS.forEach((f, i) => {
      assert.strictEqual(sandbox.spPrice(f, c), AGREED[c][i],
        `${c} colour at the ${f} band should be print-only $${AGREED[c][i].toFixed(2)}`);
    });
  }
});

/* This file has always defined its own SCREEN_FEE and priced against that, so
 * every assertion above would still pass if server.js quietly billed a different
 * number. The fee is the most-compared line on a quote and the thinnest margin
 * in the system; it should not be possible to move it without a test saying so.
 */
test('the fee this file tests is the fee server.js actually charges', () => {
  const m = src.match(/code: 'screens'[\s\S]{0,200}?rate: (\d+(?:\.\d+)?)/);
  assert.ok(m, "could not find the screens add-on's rate in server.js");
  assert.strictEqual(Number(m[1]), SCREEN_FEE,
    `server.js bills $${m[1]} a screen but this file tests $${SCREEN_FEE}. ` +
    'Change both, and docs/pricing-2026.md with them.');
});

test('the customer-facing note quotes the same fee', () => {
  assert.ok(src.includes('at $' + SCREEN_FEE + ' each.'),
    `the screens note must say "at $${SCREEN_FEE} each" — a note that quotes a ` +
    'stale price is read by the customer and contradicts the number beside it');
});
