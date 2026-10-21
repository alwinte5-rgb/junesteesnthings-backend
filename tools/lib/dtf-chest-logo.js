/* The DTF chest-logo ladder (owner, 2026-10-21).
 *
 * A chest logo is up to 16 sq in (4" x 4"). Anchorfish bills it from their
 * 16 sq in column, which costs well under the 132 sq in standard print, so
 * quoting a front-only chest logo at the full-front price overcharged it.
 *
 * Rule the owner picked: Anchorfish's 16 sq in cost at the same markup the
 * full front carries in that band (full front x cost16 / cost132), rounded to
 * 5 cents. One hand fix: Anchorfish's 16 sq in cost RISES from 25-49 ($2.58)
 * to 50-99 ($2.73), which would price 50-99 above 36-49, so 50-99 is set to
 * $7.25, just under 36-49's $7.45.
 *
 * Typed, not derived: these are the owner's numbers. If the full-front ladder
 * is re-cut, show her the new chest figures before changing these.
 *
 * Main print only. Beside a bigger print the chest is the additional location
 * and prices from method #1's additional-location ladder (copied as is by
 * tools/add-dtf-chest-logo.js).
 */

/* By band CEILING, like every `printings` table. */
const CHEST_LOGO_LADDER = {
     4: '14.75',
    11: '13.35',
    24: '9.60',
    35: '8.45',
    49: '7.45',
    99: '7.25',
   249: '5.15',
   499: '4.30',
   999: '3.65',
  2499: '3.05',
  7000: '2.50',
};

module.exports = { CHEST_LOGO_LADDER };
