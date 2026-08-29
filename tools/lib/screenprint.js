/* Turn seven per-colour screen-print price tables into the ONE `color`-type
 * table the designer can pick a column from.
 *
 * WHY THIS EXISTS
 * ---------------
 * The catalogue carried a separate printing method per colour count — "Screen
 * Printing — 1 Color" through "— 7 Colors". Seven methods make the customer
 * declare a colour count before they have drawn anything, which is a question
 * only the finished design can answer, and getting it wrong is discovered at
 * the cart.
 *
 * Lumise already has the right shape for this and nobody used it. A `color`-type
 * method holds one row per quantity band with a column per colour count, and
 * both pricing engines (core/assets/js/app.js ~16287 and core/cart.php ~516)
 * read `colors.length` off the real canvas, build the key `N-color`, and fall
 * back to `full-color` when there is no such column. So the design decides the
 * column and the customer is never asked.
 *
 * The prices are NOT invented here. They are the existing per-colour tables
 * pivoted into columns, so the combined method and the rows the quote form
 * still prices from can never disagree.
 *
 * `full-color` MUST exist. Without it a design with more colours than any
 * column silently prices the decoration at $0 in both engines — screen printing
 * for free rather than an error anyone would see.
 */

/** Column key for a colour count, matching what the admin UI writes (main.js:3323). */
const colorKey = (n) => n + '-color';

/**
 * @param {Array<{colors:number, tiers:Array<[number|string, number]>}>} rows
 *        One entry per colour count. `tiers` is [band ceiling, price per piece].
 * @returns {{multi:boolean,type:string,show_detail:string,values:object}}
 */
function colorTable(rows) {
  if (!rows || rows.length === 0) throw new Error('no per-colour tables to combine');

  const sorted = [...rows].sort((a, b) => a.colors - b.colors);
  const bands = sorted[0].tiers.map(([q]) => String(q));

  for (const r of sorted) {
    const mine = r.tiers.map(([q]) => String(q));
    if (mine.join(',') !== bands.join(',')) {
      /* Combining tables banded differently would put one colour count's price
         under another's quantity, which reads as a working price and is not. */
      throw new Error(r.colors + '-colour bands (' + mine.join(',') +
        ') do not match the 1-colour bands (' + bands.join(',') + ')');
    }
  }

  const front = {};
  bands.forEach((band, i) => {
    const cell = {};
    let last = -Infinity;
    for (const r of sorted) {
      const price = Number(r.tiers[i][1]);
      if (!Number.isFinite(price) || price <= 0) {
        throw new Error('no price for ' + r.colors + ' colours at band ' + band);
      }
      /* More colours means another screen, another pass and another wash-up. A
         table where they got cheaper would be a transcription error, and it
         would price the biggest jobs lowest. */
      if (price < last) {
        throw new Error('band ' + band + ': ' + r.colors + ' colours ($' + price +
          ') is cheaper than ' + (r.colors - 1) + ' colours ($' + last + ')');
      }
      last = price;
      cell[colorKey(r.colors)] = price.toFixed(2);
    }
    /* Priced at the widest column the press can actually run. Any design over
       that goes to DTF (the editor recommends it), so this is the backstop that
       keeps an over-range design from decorating for nothing, not an offer to
       screen print a photograph. */
    cell['full-color'] = last.toFixed(2);
    front[band] = cell;
  });

  /* Quantity bands are CEILINGS, and both engines walk them expecting the price
     to fall. One that rises would charge more for ordering more. */
  for (const r of sorted) {
    for (let i = 1; i < r.tiers.length; i++) {
      if (Number(r.tiers[i][1]) > Number(r.tiers[i - 1][1])) {
        throw new Error(r.colors + '-colour price RISES at band ' + r.tiers[i][0]);
      }
    }
  }

  /* `multi:false` — one screen-print table, applied per stage that carries
     artwork. A second print location is a second set of screens, and both
     engines already charge each decorated stage against this same table. */
  return { multi: false, type: 'color', show_detail: '1', values: { front } };
}

module.exports = { colorTable, colorKey };
