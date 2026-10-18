/* What this account PAYS (customerPrice), not S&S's list price, and the MEDIAN
   colour per size: the same figures tools/ssa-sync.js keeps the catalogue on.
   Built from the list price and the cheapest colour, a new style's extended-size
   prices were wrong for good, because the hourly sync corrects the base price
   but never rebuilt the size options (Codex #223).

   Shared by ssa-add-products.js (which writes the size options), ssa-sync.js
   (which keeps them current) and catalog-inventory.js (which checks them), so
   the three cannot disagree. */
const { CORE_SIZES } = require('./garments');
const { sizeUpcharge } = require('./markup');

/* SALES (owner, 2026-10-18: "if S&S has a sale the customer gets the new
   price"). During a sale customerPrice IS the sale price; outside one it is the
   list price (checked across 25 live styles: this account has no standing
   discount). The sync runs once a day and a blank is bought a day or more after
   the order, so a sale ending soon would sell at the sale price and be bought
   at list. Inside SALE_BUFFER_DAYS of its end a row is costed at list. */
const SALE_BUFFER_DAYS = 4;

/** What one S&S product row costs the shop, sale included unless it is about
 *  to end. `now` is injectable for tests. */
function pieceCost(r, now = Date.now()) {
  const ends = r.saleExpiration ? Date.parse(r.saleExpiration) : NaN;
  if (Number.isFinite(ends) && ends - now < SALE_BUFFER_DAYS * 86400000) {
    return Number(r.piecePrice || r.customerPrice || r.casePrice || 0);
  }
  return Number(r.customerPrice || r.piecePrice || r.casePrice || 0);
}

/** { size: median cost across colours } from S&S product rows. */
function costBySize(rows, now = Date.now()) {
  const per = {};
  for (const r of rows) { const c = pieceCost(r, now); if (r.sizeName && c) (per[r.sizeName] = per[r.sizeName] || []).push(c); }
  const out = {};
  for (const [size, xs] of Object.entries(per)) {
    const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1;
    out[size] = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  return out;
}

/** Cheapest CORE size, as ssa-sync's baseCost(); Infinity when none is priced. */
const baseCostOf = (bySize) => Math.min(...CORE_SIZES.filter((z) => bySize[z]).map((z) => bySize[z]), Infinity);

/** The size field's `values`, rebuilt: every size keeps its place and default,
 *  gets `value` (what the designer and core/cart.php match a quantity on) and
 *  an extra charge from today's cost difference. More than one size is stored
 *  as Lumise's size LIST (`type: 'multiple'`); without it the designer draws a
 *  single quantity box and no size is ever recorded. A size S&S no longer
 *  prices keeps its old charge. */
function sizeOptions(values, bySize, base) {
  const v = values && typeof values === 'object' ? values : {};
  const opts = (v.multiple_options || []).map((o) => {
    const t = o.title || o.value;
    const out = { ...o, title: t, value: o.value || t };
    if (t in bySize && Number.isFinite(base)) {
      const up = sizeUpcharge(bySize[t], base);
      out.price = up > 0 ? up.toFixed(2) : '';
    }
    if (out.min_qty === undefined) out.min_qty = '';
    if (out.max_qty === undefined) out.max_qty = '';
    return out;
  });
  const out = { ...v, multiple_options: opts };
  if (opts.length > 1) {
    out.type = 'multiple';
    if (out.min_qty === undefined) out.min_qty = '1';
    if (out.max_qty === undefined) out.max_qty = '';
  }
  return out;
}

module.exports = { SALE_BUFFER_DAYS, pieceCost, costBySize, baseCostOf, sizeOptions };
