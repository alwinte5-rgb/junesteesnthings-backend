/* What an S&S garment is PRICED from: its regular (list) price, with the
   typical colour's size premiums. Outside a sale that is also what this account
   pays (no standing discount; 25 live styles checked 2026-10-18). Built from
   the cheapest colour, a new style's extended-size prices were wrong for good,
   because the hourly sync corrects the base price but never rebuilt the size
   options (Codex #223).

   Shared by ssa-add-products.js (which writes the size options), ssa-sync.js
   (which keeps them current) and catalog-inventory.js (which checks them), so
   the three cannot disagree. */
const { CORE_SIZES } = require('./garments');
const { sizeUpcharge } = require('./markup');
const { median } = require('./team-metrics');

/* REGULAR PRICE ONLY (owner, 2026-10-28: "regular price for everything …
   passing on the sale without labeling them on sale is a problem"; and
   2026-10-23: "dont give them the sale price"). This replaces the 2026-10-18
   rule that passed S&S sales on. A sale is the shop's margin: the shop pays
   customerPrice, but the customer is priced from S&S's list price.

   Passing sales on also broke the size ladder. S&S often discounts only SOME
   colours, and the median across colours landed on the sale price for some
   sizes and the list price for others: the econscious EC3000 charged +$3.78
   for M and L and nothing for XL. */

/** What one S&S product row is priced from: its list price. */
function pieceCost(r) {
  return Number(r.piecePrice || r.customerPrice || r.casePrice || 0);
}

/** { size: cost } from S&S product rows: the typical colour's base cost plus
 *  the typical size premium. The premium is measured INSIDE each colour (its
 *  size against its own cheapest core size) and then the median taken, so a
 *  colour priced differently from the rest — a heather, a sale, a closeout —
 *  cannot make a medium dearer than an XL.
 *
 *  - Only colours that carry a core size set the base and premiums (a
 *    tall-only or extended-only colour would otherwise count its 2XL as a
 *    "base"); with no core size anywhere, every colour counts.
 *  - A size cheaper than the base (XS, some youth) keeps a negative premium.
 *  - The cheapest core size of the result IS the typical base: if colours
 *    disagree on which core size is cheapest, every premium is shifted so the
 *    lowest core premium is zero, rather than pricing above every colour. */
function costBySize(rows) {
  const byColour = new Map();
  for (const r of rows || []) {
    const c = pieceCost(r);
    if (!r.sizeName || !(c > 0)) continue;
    /* colorCode when a row has no name, so unnamed rows of different colours
       are not pooled into one; rows with neither share one bucket. */
    const k = String(r.colorName || r.colorCode || '');
    if (!byColour.has(k)) byColour.set(k, {});
    const sizes = byColour.get(k);
    (sizes[r.sizeName] = sizes[r.sizeName] || []).push(c);
  }
  const colours = [];
  for (const sizes of byColour.values()) {
    const cost = {};
    for (const [z, xs] of Object.entries(sizes)) cost[z] = median(xs);
    const base = baseCostOf(cost);
    if (Number.isFinite(base)) colours.push({ cost, base, core: CORE_SIZES.some((z) => cost[z] > 0) });
  }
  const use = colours.some((c) => c.core) ? colours.filter((c) => c.core) : colours;
  if (!use.length) return {};
  const base = median(use.map((c) => c.base));
  const prem = {};
  for (const c of use) for (const [z, v] of Object.entries(c.cost)) (prem[z] = prem[z] || []).push(v - c.base);
  const typical = {};
  for (const [z, ps] of Object.entries(prem)) typical[z] = median(ps);
  const corePrem = CORE_SIZES.map((z) => typical[z]).filter((v) => v !== undefined && v !== null);
  const shift = corePrem.length ? Math.min(...corePrem) : 0;
  const out = {};
  for (const [z, v] of Object.entries(typical)) out[z] = Math.round((base + v - shift) * 100) / 100;
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
 *  than `guard` (a fraction) off the stored cost, up or down. Costs are list
 *  prices now, so a sale ending is no longer a legitimate jump to excuse — and
 *  excusing rises "to list" let any upward feed glitch through. One-off moves
 *  a person has looked at are written with ssa-sync.js --accept-jumps. */
function jumpHeld(was, cost, guard) {
  if (!(was > 0)) return false;
  return Math.abs(cost - was) / was > guard;
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

module.exports = { CLOSEOUT_MIN, atSanMar, isLightTee, pieceCost, costBySize, baseCostOf, jumpHeld, readSizes, sizeOptions, colourStock, closedColours };
