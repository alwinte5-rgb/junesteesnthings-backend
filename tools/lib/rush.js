'use strict';

/* Only DTF can be rushed (owner, 2026-10-12: "Rush is offered on DTF only.
   Not screen print, embroidery or cutouts"). One line that cannot be rushed
   sets the date for the whole order, since the customer gets one parcel, and
   a line whose method is unknown counts as one that cannot (fail closed).
   Used by the quote save (a helper's rush is 0 when this says no), the quote
   form's suggestion, and the quote exam's scenarios. */

const RUSHABLE = /\bDTF\b/i;

/** May a decoration method with this title be rushed? */
function methodRushable(title) {
  return RUSHABLE.test(String(title || ''));
}

/**
 * May an order be rushed?
 * @param lines  the required lines, each { product: boolean, titles: [method titles] }
 *               (optional lines are left out by the caller: they may never be bought).
 * A line with no product and no method (a fee typed by hand) is ignored; a
 * garment with no method, or any non-DTF method, says no.
 */
function rushAllowed(lines) {
  const real = (lines || []).filter((l) => l && (l.product || (l.titles || []).length));
  return real.length > 0 && real.every((l) => (l.titles || []).length > 0 && l.titles.every(methodRushable));
}

module.exports = { RUSHABLE, methodRushable, rushAllowed };
