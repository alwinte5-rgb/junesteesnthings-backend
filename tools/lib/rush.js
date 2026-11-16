'use strict';

/* Which orders can be rushed, and what a rush costs.

   Rushable (owner): DTF (2026-10-12), embroidery (2026-11-14), and since
   2026-11-16 Signs365 signs and banners and Signs365 cutouts. Not screen
   printing, and nothing from SinaLite: its own lead time cannot be shortened.
   One line that cannot be rushed sets the date for the whole order, since the
   customer gets one parcel, and a line whose method is unknown counts as one
   that cannot (fail closed). Used by the quote save (a helper's rush is 0 when
   this says no), the quote form's suggestion (which runs this same source,
   toString, so keep it ES5 apart from the arrows already here), and the quote
   exam's scenarios. */

/* Decoration methods (and Signs365 items picked as a method) that can be
   rushed: DTF, embroidery, and the Signs365 products in server.js
   SUPPLIER_PRODUCT_RE apart from business cards and flyers, which are print,
   not signs. */
const RUSHABLE = /\bDTF\b|embroider|big head cutout|full body cutout|vinyl banner|retractable banner stand|\bposter|window graphic|wall graphic|vehicle graphic|vehicle magnet|acrylic panel|canvas print/i;
const EMBROIDERY = /embroider/i;

/* Owner, 2026-11-14 and 2026-11-16: no same-day and no next-day orders, so
   the earliest any order can be ready is 2 business days out. Everything is
   normally 5 business days, signs included.
   Embroidery takes 7 business days and is never ready sooner than 3; its rush
   uses the same steps as everything else, by days early: 6 days out 10%,
   5 20%, 4 35%, 3 50% (owner, 2026-11-16).
   Orders of 50 or more garment pieces take 7 business days, are never ready
   sooner than 3, and keep their own steps: 6 days 10%, 5 30%, 4 50%, 3 70%
   (owner, 2026-11-16: "keep 50+ as it is"). An order that is both is a 50+
   order. These match the designer's checkout (jt-holiday-rush.php). */
const EARLIEST_DAYS = 2;
const SLOW_EARLIEST_DAYS = 3;
const LARGE_QTY = 50;
const SLOW_TIERS = [
  { days: 3, pct: 70 },
  { days: 4, pct: 50 },
  { days: 5, pct: 30 },
  { days: 6, pct: 10 },
];
const EMBROIDERY_TIERS = [
  { days: 3, pct: 50 },
  { days: 4, pct: 35 },
  { days: 5, pct: 20 },
  { days: 6, pct: 10 },
];

/** May a decoration method with this title be rushed? */
function methodRushable(title) {
  return RUSHABLE.test(String(title || ''));
}

/**
 * May this one line be rushed?
 * @param l  { product: boolean, titles: [method titles], qty, sign }
 *           sign: 'signs365' for a Signs365 sign or banner, 'sinalite' for a
 *           SinaLite item, absent otherwise.
 * A Signs365 sign needs no method; any method on it must be rushable too. A
 * garment needs a method, and every method rushable.
 */
function lineRushable(l) {
  if (l.sign === 'sinalite') return false;
  var titles = l.titles || [];
  if (l.sign === 'signs365') return titles.every(methodRushable);
  return titles.length > 0 && titles.every(methodRushable);
}

/**
 * May an order be rushed?
 * @param lines  the required lines, as lineRushable takes them (optional
 *               lines are left out by the caller: they may never be bought).
 * A line with no product, no method and no sign (a fee typed by hand) is ignored.
 */
function rushAllowed(lines) {
  var real = (lines || []).filter((l) => l && (l.product || l.sign || (l.titles || []).length));
  return real.length > 0 && real.every(lineRushable);
}

/**
 * Which rush rule an order takes: 'large' (50 or more garment pieces),
 * 'embroidery' (any embroidery), or '' (the usual ladder). Sign pieces do not
 * count toward 50, as on the designer.
 */
function rushKind(lines) {
  var real = (lines || []).filter((l) => l && (l.product || l.sign || (l.titles || []).length));
  var pieces = real.filter((l) => !l.sign).reduce((n, l) => n + (parseInt(l.qty, 10) || 0), 0);
  if (pieces >= LARGE_QTY) return 'large';
  return real.some((l) => (l.titles || []).some((t) => EMBROIDERY.test(String(t || '')))) ? 'embroidery' : '';
}

/**
 * The rush a needed-by date earns, `days` open business days away
 * (tools/lib/shop-days.js shopDaysUntil).
 *   tiers  the usual ladder (RUSH_TIERS on the server: the first band whose
 *          days the date falls at or under wins). An empty ladder turns rush
 *          off for every order;
 *   kind   rushKind(): 'large' and 'embroidery' have their own steps and the
 *          3-day floor;
 *   rule   { earliest, slowEarliest, slowTiers, embroideryTiers }: passed in
 *          so the quote form can run this same source with the server's figures.
 * Returns { pct, tooSoon }: tooSoon is a date no rush can buy, and then pct is 0.
 */
function rushFor(days, tiers, kind, rule) {
  if (days === null || days === undefined) return { pct: 0, tooSoon: false };
  if (days < (kind ? rule.slowEarliest : rule.earliest)) return { pct: 0, tooSoon: true };
  if (!tiers || !tiers.length) return { pct: 0, tooSoon: false };
  var t = kind === 'large' ? rule.slowTiers : kind === 'embroidery' ? rule.embroideryTiers : tiers;
  for (var i = 0; i < t.length; i++) if (days <= t[i].days) return { pct: t[i].pct, tooSoon: false };
  return { pct: 0, tooSoon: false };
}

module.exports = {
  RUSHABLE, EMBROIDERY, EARLIEST_DAYS, SLOW_EARLIEST_DAYS, LARGE_QTY, SLOW_TIERS, EMBROIDERY_TIERS,
  methodRushable, lineRushable, rushAllowed, rushKind, rushFor,
};
