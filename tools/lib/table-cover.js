'use strict';

/* THE 6 FT TABLE COVER (owner, 2026-10-21; repriced 2026-10-28): a 6 ft
 * polyester table cover printed in our shop on one side (front) or two sides
 * (front and back). Ivory and white covers are sublimated (the ink is dyed
 * into the fabric, no feel); every other color is DTF printed. The ONE place
 * its prices live: tools/add-table-cover.js writes them into the quote
 * engine, and tools/occasion-pages.js prints them on
 * /print/table-covers.html, so the page and a quote cannot disagree
 * (tests/table-cover.test.js holds the two together).
 *
 * Band CEILINGS -> price each, all-in (the cover and its delivery included).
 * Owner, 2026-10-28: small steps up to 9 covers (the old ladder dropped $30 a
 * cover between 1 and 3 for the same cost), real breaks at 50 and 100. The
 * page calls them estimates; the quote is the final price.
 *   1 side:  $75 (1-4), $70 (5-9), $60 (10-49), $52 (50-99), $45 (100+).
 *   2 sides: $105, $95, $85, $75, $65. */
const ONE_SIDE = { 4: 75, 9: 70, 49: 60, 99: 52, 7000: 45 };
const TWO_SIDES = { 4: 105, 9: 95, 49: 85, 99: 75, 7000: 65 };

/* The bands as the page shows them, built from the ceilings so they cannot
   drift: [first quantity, label], e.g. [5, '5–9'], and the last '100+'. */
const CEILINGS = Object.keys(ONE_SIDE).map(Number).sort((a, b) => a - b);
const BANDS = CEILINGS.map((c, i) => {
  const from = i ? CEILINGS[i - 1] + 1 : 1;
  return [from, i === CEILINGS.length - 1 ? from + '+' : from === c ? String(c) : from + '–' + c];
});

/* Sublimation needs a white or light polyester; these covers get it, the rest DTF. */
const SUBLIMATED = ['White', 'Ivory'];

const BLANK_COST = 15.39;   // 6 ft polyester cover, 220 gsm, regular price (2026-10-28), for job costs

/* The cover colors YCC Linens sells the 6 ft fitted cover in, exactly as its
 * product page's color picker names them (read in Chrome 2026-10-21,
 * ycclinens.com/6-ft-fitted-polyester-tablecloth-rectangular-canary-yellow).
 * Stock moves (Black was out that day), so the page says we confirm stock.
 * Re-read if YCC adds or drops a color. */
const COLORS = ['White', 'Black', 'Navy Blue', 'Gray', 'Red', 'Blush', 'Champagne', 'Hunter Green',
  'Ivory', 'Pastel Yellow', 'Royal Blue', 'Burgundy', 'Eggplant', 'Gold', 'Lavender', 'Orange',
  'Purple', 'Teal', 'Tiffany', 'Light Blue', 'Fuchsia', 'Canary Yellow', 'Chocolate Brown', 'Sage',
  'Dusty Blue', 'Dusty Rose', 'Mint', 'Emerald Green', 'Terracotta', 'Olive Green'];

/** Price each for `qty` covers printed on `sides` (1 or 2), or null. */
function priceEach(qty, sides) {
  const q = Math.floor(Number(qty));
  const t = sides === 2 ? TWO_SIDES : sides === 1 ? ONE_SIDE : null;
  if (!t || !(q >= 1)) return null;
  const c = Object.keys(t).map(Number).sort((a, b) => a - b).find((x) => q <= x);
  return c == null ? null : t[c];
}

module.exports = { ONE_SIDE, TWO_SIDES, BANDS, SUBLIMATED, BLANK_COST, COLORS, priceEach };
