/* The oversized DTF ladder, derived from the standard one.
 *
 * Method #1 "DTF Printing" prices the standard print, which Anchorfish sizes at
 * up to 132 sq in (about 11" x 12"). A 12" x 18" full back is 216 sq in, and
 * Anchorfish bills it from their 252 sq in column. Quoting it at the standard
 * price gave that extra film and ink away.
 *
 * Owner's rule, 2026-10-17: oversized = today's standard price + 1.75 x what
 * Anchorfish charges extra for the bigger print, rounded UP to the next 5
 * cents. 1.75 is the factor that landed 50-99 pieces on $14.00, the price the
 * owner set on the Ink Theory order; with the standard 50-99 cut to $11.00
 * (2026-10-19) it follows to $13.10. Up to 252 sq in; larger is by quote.
 *
 * Derived, not typed, so a change to the standard ladder carries through when
 * the tool is re-run, and the gap between the two always tracks real cost.
 */

/* Anchorfish DTF cost per piece, by band CEILING (the same convention as the
   `printings` tables, opposite to BLANK_TIERS). [132 sq in, 252 sq in], from
   the 2026 contractor sheet. The 1-4 and 5-11 bands both sit inside their
   1-11 column, and 25-35 / 36-49 (2026-10-19) inside their 25-49 one. These are the same figures as DTF[].v[1] and v[2] in
   reprice-anchorfish-2026.js; tests/dtf-oversized.test.js fails if the two
   ever differ. */
const ANCHORFISH_DTF_COST = {
     4: [7.03, 9.38],
    11: [7.03, 9.38],
    24: [5.63, 7.50],
    35: [4.50, 6.00],
    49: [4.50, 6.00],
    99: [3.60, 4.80],
   249: [3.06, 4.08],
   499: [2.60, 3.47],
   999: [2.21, 2.95],
  2499: [1.88, 2.51],
  7000: [1.60, 2.13],
};

const OVERSIZED_FACTOR = 1.75;

/* Rounded up to the next 5 cents. The epsilon stops 14.00 written as
   13.999999 in floating point from rounding up to 14.05. */
const up05 = (x) => Math.ceil(Math.round(x * 2000) / 100 - 1e-9) / 20;

/** { ceiling: "price" } for the oversized main print, from the standard one.
 *  Throws on a band with no Anchorfish cost, rather than pricing it at the
 *  standard rate and silently dropping the surcharge. */
function oversizedLadder(standard) {
  const out = {};
  for (const [ceil, price] of Object.entries(standard)) {
    const cost = ANCHORFISH_DTF_COST[ceil];
    if (!cost) throw new Error('no Anchorfish cost for the <=' + ceil + ' band');
    const p = up05(parseFloat(price) + OVERSIZED_FACTOR * (cost[1] - cost[0]));
    out[ceil] = p.toFixed(2);
  }
  return out;
}

module.exports = { ANCHORFISH_DTF_COST, OVERSIZED_FACTOR, oversizedLadder, up05 };
