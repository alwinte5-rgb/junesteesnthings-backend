/* What the shop sells a blank garment for, relative to what it pays.
 *
 * ONE definition. The multiplier used to be the literal `* 2` written into
 * tools/ssa-sync.js twice and tools/ssa-add-products.js twice — four copies of
 * a number that has to agree, in two files that are edited for different
 * reasons. That is exactly the drift tools/lib exists to prevent, and a
 * repricing that updates three of four copies is a catalogue that disagrees
 * with itself and nobody notices until a margin report.
 *
 * Held at 2.0 — a 50% gross margin on the blank.
 *
 * Briefly moved to 1.6 on 2026-09-14 and put back the same day: at 1.6 the
 * margin is 37.5%, which is $3.77 a garment and $90 on a 24-piece order, and
 * the decision was to leave the garment alone and discount the small-quantity
 * DECORATION instead, where the price actually looks high.
 *
 * This default and the catalogue must not disagree. The sync writes this
 * number on every run, so a default left at 1.6 would have repriced all 102
 * products again overnight and silently undone the revert.
 *
 * The SIZE UPCHARGE follows the same multiple deliberately. A 2XL that costs
 * $3.68 more has to sell for more than $3.68 more or every extended size is
 * sold at a loss; at 1.6 it carries $5.89, which keeps the same margin as the
 * base rather than quietly making big sizes the least profitable thing sold.
 */
const GARMENT_MARKUP = (() => {
  const v = parseFloat(process.env.JT_GARMENT_MARKUP || '2.0');
  /* A markup below 1 sells every garment under cost. Refuse rather than let a
     typo in an env var reprice the catalogue at a loss. */
  if (!Number.isFinite(v) || v < 1) {
    throw new Error('JT_GARMENT_MARKUP must be a number >= 1, got ' +
      JSON.stringify(process.env.JT_GARMENT_MARKUP));
  }
  return v;
})();

/* The markup is capped in DOLLARS (owner, 2026-10-23): a blank sells for the
 * LOWER of cost x GARMENT_MARKUP and cost + GARMENT_CAP. Doubling a $3 tee adds
 * $3; doubling a $28 garment-dyed hoodie added $28, which put the blank alone
 * above other shops' printed price. Cheap blanks are untouched (2x is under the
 * cap until the cost reaches the cap), and every blank above it earns the same
 * $8. Customers said price was why quotes were not accepted. */
const GARMENT_CAP = (() => {
  const v = parseFloat(process.env.JT_GARMENT_CAP || '8');
  if (!Number.isFinite(v) || v < 0) {
    throw new Error('JT_GARMENT_CAP must be a number >= 0, got ' +
      JSON.stringify(process.env.JT_GARMENT_CAP));
  }
  return v;
})();

/** Sell price for a blank costing `cost`, rounded to the cent. */
const sellPrice = (cost) => {
  const c = Number(cost);
  return Math.round(Math.min(c * GARMENT_MARKUP, c + GARMENT_CAP) * 100) / 100;
};

/** What an extended size adds: its own sell price less the base size's, so a
 *  2XL is priced by the same rule as the base. Never negative. */
const sizeUpcharge = (sizeCost, baseCost) =>
  Math.max(0, Math.round((sellPrice(sizeCost) - sellPrice(baseCost)) * 100) / 100);

module.exports = { GARMENT_MARKUP, GARMENT_CAP, sellPrice, sizeUpcharge };
