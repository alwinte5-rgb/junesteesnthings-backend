'use strict';

/* Which orders can be rushed. DTF since the owner's 2026-10-12 rule ("Rush is
   offered on DTF only"), and embroidery again since 2026-11-14 ("embroidery
   can be rushed"); screen printing and cutouts still cannot. One line that
   cannot be rushed sets the date for the whole order, since the customer gets
   one parcel, and a line whose method is unknown counts as one that cannot
   (fail closed). Used by the quote save (a helper's rush is 0 when this says
   no), the quote form's suggestion, and the quote exam's scenarios. */

const RUSHABLE = /\bDTF\b|embroider/i;
const EMBROIDERY = /embroider/i;

/* Owner, 2026-11-14: no same-day and no next-day orders, so the earliest any
   order can be ready is 2 business days out. Embroidery and orders of 50 or
   more pieces take 7 business days and are never ready sooner than 3; their
   rush is spread over those 4 days (6 days out 10%, 5 30%, 4 50%, 3 70%), the
   same steps the designer's checkout charges (jt_rush_pct with 4 steps). */
const EARLIEST_DAYS = 2;
const SLOW_EARLIEST_DAYS = 3;
const LARGE_QTY = 50;
const SLOW_TIERS = [
  { days: 3, pct: 70 },
  { days: 4, pct: 50 },
  { days: 5, pct: 30 },
  { days: 6, pct: 10 },
];

/** May a decoration method with this title be rushed? */
function methodRushable(title) {
  return RUSHABLE.test(String(title || ''));
}

/**
 * May an order be rushed?
 * @param lines  the required lines, each { product: boolean, titles: [method titles] }
 *               (optional lines are left out by the caller: they may never be bought).
 * A line with no product and no method (a fee typed by hand) is ignored; a
 * garment with no method, or a method that cannot be rushed, says no.
 */
function rushAllowed(lines) {
  const real = (lines || []).filter((l) => l && (l.product || (l.titles || []).length));
  return real.length > 0 && real.every((l) => (l.titles || []).length > 0 && l.titles.every(methodRushable));
}

/**
 * Is this the slower kind of order: any embroidery, or 50 or more pieces?
 * @param lines  as rushAllowed, each may also carry qty (pieces on the line).
 */
function slowOrder(lines) {
  const real = (lines || []).filter((l) => l && (l.product || (l.titles || []).length));
  const pieces = real.reduce((n, l) => n + (parseInt(l.qty, 10) || 0), 0);
  return pieces >= LARGE_QTY || real.some((l) => (l.titles || []).some((t) => EMBROIDERY.test(String(t || ''))));
}

/**
 * The rush a needed-by date earns, `days` business days from today.
 *   tiers  the usual ladder (RUSH_TIERS on the server: the first band whose
 *          days the date falls at or under wins). An empty ladder turns rush
 *          off for every order, slow ones too;
 *   slow   slowOrder(): its own steps and floor;
 *   rule   { earliest, slowEarliest, slowTiers } (EARLIEST_DAYS,
 *          SLOW_EARLIEST_DAYS, SLOW_TIERS): passed in so the quote form can
 *          run this same source (toString) with the server's figures.
 * Returns { pct, tooSoon }: tooSoon is a date no rush can buy (same day or
 * next day; under 3 days for a slow order), and then pct is 0.
 */
function rushFor(days, tiers, slow, rule) {
  if (days === null || days === undefined) return { pct: 0, tooSoon: false };
  if (days < (slow ? rule.slowEarliest : rule.earliest)) return { pct: 0, tooSoon: true };
  if (!tiers || !tiers.length) return { pct: 0, tooSoon: false };
  var t = slow ? rule.slowTiers : tiers;
  for (var i = 0; i < t.length; i++) if (days <= t[i].days) return { pct: t[i].pct, tooSoon: false };
  return { pct: 0, tooSoon: false };
}

module.exports = {
  RUSHABLE, EMBROIDERY, EARLIEST_DAYS, SLOW_EARLIEST_DAYS, LARGE_QTY, SLOW_TIERS,
  methodRushable, rushAllowed, slowOrder, rushFor,
};
