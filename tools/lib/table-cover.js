'use strict';

/* THE 6 FT TABLE COVER (owner, 2026-10-21): a YCC Linens fitted polyester
 * blank, DTF printed in our shop on one side (front) or two sides (front and
 * back). The ONE place its prices live: tools/add-table-cover.js writes them
 * into the quote engine, and tools/occasion-pages.js prints them on
 * /print/table-covers.html, so the page and a quote cannot disagree
 * (tests/table-cover.test.js holds the two together).
 *
 * Band CEILINGS -> price each, all-in (the cover and its delivery included):
 *   1 side:  $75 for 1-2 covers, $65 each from 3.
 *   2 sides: $110 for 1 cover, $95 each for 2, $80 each from 3 (owner,
 *            2026-10-21, replacing $90 / $80 / $80). */
const ONE_SIDE = { 1: 75, 2: 75, 7000: 65 };
const TWO_SIDES = { 1: 110, 2: 95, 7000: 80 };

const BLANK_COST = 12.99;   // YCC Linens 6 ft fitted polyester, 1-19 (2026-10-20), for job costs

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

module.exports = { ONE_SIDE, TWO_SIDES, BLANK_COST, COLORS, priceEach };
