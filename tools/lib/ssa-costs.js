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

/* A sale end written without a zone is read as UTC, so the buffer starts at
   the same moment on Railway (UTC) and on the Mac (Central) (code review,
   2026-10-18). */
const saleEnd = (t) => {
  if (!t) return NaN;
  const s = String(t);
  return Date.parse(/T\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(s) ? s + 'Z' : s);
};

/** What one S&S product row costs the shop, sale included unless it is about
 *  to end — or, with `list`, its list price whatever the sale. `now` is
 *  injectable for tests. */
function pieceCost(r, now = Date.now(), { list = false } = {}) {
  const ends = saleEnd(r.saleExpiration);
  if (list || (Number.isFinite(ends) && ends - now < SALE_BUFFER_DAYS * 86400000)) {
    return Number(r.piecePrice || r.customerPrice || r.casePrice || 0);
  }
  return Number(r.customerPrice || r.piecePrice || r.casePrice || 0);
}

/** { size: median cost across colours } from S&S product rows. `list` costs
 *  every row at list price, sale or not. */
function costBySize(rows, now = Date.now(), opts = {}) {
  const per = {};
  for (const r of rows) { const c = pieceCost(r, now, opts); if (r.sizeName && c) (per[r.sizeName] = per[r.sizeName] || []).push(c); }
  const out = {};
  for (const [size, xs] of Object.entries(per)) {
    const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1;
    out[size] = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  return out;
}

/** The cost the markup applies to: the cheapest CORE size, so a stocked-out
 *  medium cannot reprice a product off its 4XL; with no core size priced at
 *  all, the cheapest size. Infinity when nothing is priced. */
function baseCostOf(bySize) {
  const core = CORE_SIZES.map((z) => bySize[z]).filter((n) => n > 0);
  const all = Object.values(bySize).filter((n) => n > 0);
  return core.length ? Math.min(...core) : all.length ? Math.min(...all) : Infinity;
}

/** Whether a cost move is held for a person instead of written: a jump larger
 *  than `guard` (a fraction) off the stored cost — unless it is a sale ENDING,
 *  a move UP to the list price. Outside a sale the cost IS the list price, so
 *  excusing any move "to list" switched the guard off whenever no sale was
 *  running, and a feed glitch to $1.50 would have repriced a $15 hoodie
 *  below cost (code review, 2026-10-18). */
function jumpHeld(was, cost, listCost, guard) {
  if (!(was > 0)) return false;
  const saleEnding = cost > was && Math.abs(cost - listCost) < 0.01;
  return Math.abs(cost - was) / was > guard && !saleEnding;
}

/** The product's size field: { key, values, asString }, or null when it has
 *  none. `values` is { unreadable: true } when the stored JSON cannot be read,
 *  so a corrupt field is reported rather than called "ok" or skipped in
 *  silence. Shared by ssa-sync.js and catalog-inventory.js. */
function readSizes(attrs) {
  const key = Object.keys(attrs || {}).find((k) => attrs[k] && attrs[k].type === 'quantity');
  if (!key) return null;
  let v = attrs[key].values;
  const asString = typeof v === 'string';
  if (asString) { try { v = JSON.parse(v); } catch { v = null; } }
  return { key, asString, values: v && typeof v === 'object' ? v : { unreadable: true } };
}

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

/* Discontinued colours (owner, 2026-10-20: "if they become discontinued they
 * need to drop from the catalog"; "low" = below 100).
 *
 * S&S has no discontinued flag on a style. What it has is `closeout` on each
 * warehouse row of a SKU: the colour is being cleared out (all of Bella+Canvas
 * after SanMar bought it, the whole ComfortWash line, odd colours of Gildan
 * 5000). A closeout colour is kept while there is stock to fill an order and
 * dropped once any CORE size (S-XL) of it, across every warehouse, falls below
 * CLOSEOUT_MIN. A colour that is not closeout is never dropped here: an
 * ordinary stock-out restocks. */
const CLOSEOUT_MIN = 100;

/* Brands the shop also buys from SanMar, so an S&S closeout is no reason to drop
   a colour or retire the product (owner, 2026-10-22: "I have access to SanMar so
   lets stop the discontinue thing for the Bella Canvas brand"). SanMar owns
   Bella+Canvas, which is why S&S is clearing it out. */
const SANMAR_BRANDS = /\bbella\s*\+?\s*canvas\b/i;
const atSanMar = (name) => SANMAR_BRANDS.test(String(name || ''));

/* Light tees (the Gildan 3000 Light Cotton and its kind) are not sold (owner,
   2026-10-22: "they are not good and not sold regularly"): never added to the
   shop and never offered in a reply. */
const isLightTee = (name) => /\blight(weight)?\b/i.test(String(name || '')) && /\b(tee|t-shirt)\b/i.test(String(name || ''));

/** { colourName: { closeout, minCore } } from S&S product rows. */
function colourStock(rows) {
  const out = {};
  for (const r of rows || []) {
    const c = r.colorName; if (!c) continue;
    const o = out[c] || (out[c] = { closeout: false, core: {}, all: {} });
    let q = 0;
    for (const w of r.warehouses || []) { q += Number(w.qty) || 0; if (w.closeout) o.closeout = true; }
    if (r.sizeName) o.all[r.sizeName] = (o.all[r.sizeName] || 0) + q;
    if (CORE_SIZES.includes(r.sizeName)) o.core[r.sizeName] = (o.core[r.sizeName] || 0) + q;
  }
  for (const o of Object.values(out)) {
    /* An adult garment is judged on S-XL only: CORE_SIZES also holds youth and
       one-size names, and Bella 3001 White read as empty off a sold-out XS
       while S-XL had 4,000 each. Youth, caps and bags keep their own sizes. */
    const adult = ['S', 'M', 'L', 'XL'].filter((z) => z in o.core);
    /* No core size at all (a 2XL-and-up style): judged on the sizes it has, so
       a well-stocked colour is never read as empty (code review). */
    const qs = adult.length ? adult.map((z) => o.core[z]) : Object.keys(o.core).length ? Object.values(o.core) : Object.values(o.all);
    o.minCore = qs.length ? Math.min(...qs) : 0;
    delete o.core; delete o.all;
  }
  return out;
}

/** Which of a product's colour options to drop: closeout at S&S and under
 *  CLOSEOUT_MIN in a core size. A colour S&S does not list under that name is
 *  left alone (reported by the caller), never guessed at. */
function closedColours(options, stock, min = CLOSEOUT_MIN) {
  return (options || []).filter((o) => {
    const s = stock[o.title];
    return s && s.closeout && s.minCore < min;
  }).map((o) => o.title);
}

module.exports = { SALE_BUFFER_DAYS, CLOSEOUT_MIN, atSanMar, isLightTee, pieceCost, costBySize, baseCostOf, jumpHeld, readSizes, sizeOptions, colourStock, closedColours };
