/* SIGNS ON THE QUOTE FORM (owner, 2026-10-08): a banner, yard sign, magnet or
 * any other Signs365 item is quoted by its SIZE, and the server works the price
 * out — the form never sends a price for one. Two reasons:
 *
 *   - helpers cannot change prices (owner: "no price changes only me unless I
 *     grant full access"), so a sign has to price without anyone typing a number;
 *   - one formula, the one the designer sells from (signage.js bannerTable,
 *     sign-families.js), so a quote and the website always agree.
 *
 * Which kind a product is comes from its NAME, the same way PRODUCT_GROUPS
 * files it under Signs. A banner STAND is a fixed item, not sized here.
 *
 * Delivery: Signs365 charges once an ORDER (FREIGHT.standard), so the first
 * sign on a quote carries it, inside its price each — the customer sees one
 * price, never a delivery line that could read as a price changing. A full
 * 48x96 board ships oversized, separately, so that line always carries its own
 * oversized charge instead. */

const SG = require('./signage');
const SF = require('./sign-families');

const BANNER = SG.bannerTable();
const SIGNS = SF.signsTable().families;

/* Name -> kind. First match wins, so the specific names come first. */
const KINDS = [
  ['banner',          /banner/i, /stand|retractable/i],
  ['stretched_canvas', /stretched\s+canvas/i],
  ['yard_sign',       /yard\s*sign/i],
  ['rigid_sign',      /rigid\s*sign/i],
  ['window_graphic',  /window\s*graphic/i],
  ['wall_floor',      /wall|floor\s*graphic/i],
  ['vehicle_magnet',  /vehicle\s*magnet/i],
  ['vehicle_graphic', /vehicle\s*graphic/i],
  ['custom_magnet',   /magnet/i],
  ['photo_panel',     /photo\s*panel|acrylic|canvas\s*print|poster/i],
];

/** The sign kind of a product name, or null for anything that is not sized. */
function signKindOf(name) {
  const n = String(name || '');
  for (const [kind, re, not] of KINDS) if (re.test(n) && !(not && not.test(n))) return kind;
  return null;
}

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : NaN; };
const round2 = (n) => Math.round(n * 100) / 100;
const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;

/** The ladder band for qty: the last [minQty, price] whose minQty <= qty. */
function ladderPrice(ladder, qty) {
  let p = null;
  for (const [min, price] of ladder) if (qty >= min) p = price;
  return p;
}

/**
 * Price one sign line from its spec.
 *   spec: { w, h, size, mat, hang, up: [keys] }  (banner w/h in FEET, area w/h in INCHES)
 *   takeFreight: whether this line carries the order's standard delivery
 * Returns { ok: true, each, piece, freight, text, spec } or { ok: false, error }.
 */
function priceSign(kind, spec, qty, takeFreight) {
  const q = Math.max(1, parseInt(qty, 10) || 1);
  const up = Array.isArray(spec.up) ? spec.up.map(String) : [];

  if (kind === 'banner') {
    const w = num(spec.w), h = num(spec.h);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return { ok: false, error: 'Pick the banner width and height.' };
    const mat = BANNER.materials.find((m) => m.key === String(spec.mat));
    if (!mat) return { ok: false, error: 'Pick the banner vinyl.' };
    const key = `${w}x${h}`;
    const base = (BANNER.prices[mat.key] || {})[key];
    if (base == null) return { ok: false, error: `No price for a ${w} ft × ${h} ft banner. The short side can be up to ${BANNER.max.short} ft and the long side up to ${BANNER.max.long} ft.` };
    const fin = BANNER.finishing[key] || {};
    const hang = BANNER.hanging.find((x) => x.key === String(spec.hang)) || BANNER.hanging[0];
    let finish = fin[hang.key] || 0;
    const slits = up.includes('wind_slits') && fin.wind_slits != null;
    if (slits) finish += fin.wind_slits;
    const freight = takeFreight ? BANNER.freight : 0;
    const piece = round2(base + finish);
    return {
      ok: true, piece, freight, each: ceil2(piece + freight / q),
      text: `${w} ft wide × ${h} ft tall · ${mat.label} · ${hang.label}${slits ? ' · wind slits' : ''}`,
      spec: { kind, w, h, mat: mat.key, hang: hang.key, up: slits ? ['wind_slits'] : [] },
    };
  }

  const fam = SIGNS[kind];
  const famDef = SF.FAMILIES[kind];
  if (!fam || !famDef) return { ok: false, error: 'That item is not priced by size.' };
  const mat = fam.materials.find((m) => m.key === String(spec.mat));
  if (!mat) return { ok: false, error: `Pick the ${fam.label.toLowerCase()} material.` };
  /* Per-piece upgrades offered on this material; anything else posted is ignored. */
  const ups = fam.upgrades.filter((u) => up.includes(u.key) && (!u.only || u.only.includes(mat.key)));
  const upEach = ups.reduce((s, u) => s + (u.price || 0), 0);
  let piece, text, outSpec, freight;

  if (fam.sizing === 'stock') {
    const size = fam.sizes.find((s) => s.key === String(spec.size));
    if (!size) return { ok: false, error: `Pick a ${fam.label.toLowerCase()} size.` };
    const combo = Object.keys(fam.sheet_upgrades || {}).filter((k) => up.includes(k)).sort().join('+');
    const ladder = ((fam.prices[mat.key] || {})[size.key] || {})[combo];
    if (!ladder) return { ok: false, error: `${size.label} is not made in that material.` };
    if (q < ladder[0][0]) return { ok: false, error: `${size.label} ${fam.label.toLowerCase()} have a minimum of ${ladder[0][0]}.` };
    piece = round2(ladderPrice(ladder, q) + upEach);
    const oversized = fam.freight_by_size[`${size.key}:${mat.key}`];
    freight = oversized != null ? oversized : (takeFreight ? fam.freight : 0);
    const sheetLabels = combo ? combo.split('+').map((k) => fam.sheet_upgrades[k].label) : [];
    text = [size.label, mat.label, ...sheetLabels, ...ups.map((u) => u.label)].join(' · ');
    outSpec = { kind, size: size.key, mat: mat.key, up: [...(combo ? combo.split('+') : []), ...ups.map((u) => u.key)] };
    return { ok: true, piece, freight, oversized: oversized != null, each: ceil2(piece + freight / q), text, spec: outSpec };
  }

  const w = num(spec.w), h = num(spec.h);
  if (!(w > 0) || !(h > 0)) return { ok: false, error: 'Type the width and height in inches.' };
  const base = SF.areaPrice(famDef, famDef.materials.find((m) => m.key === mat.key), w, h);
  if (base == null) {
    const L = fam.limits;
    return { ok: false, error: `No price for ${w}" × ${h}". Sizes run from ${L.min}" up to ${L.max_w}" × ${L.max_h}", with the short side no more than ${L.max_short}".` };
  }
  piece = round2(base + upEach);
  freight = takeFreight ? fam.freight : 0;
  text = [`${w}" wide × ${h}" tall`, mat.label, ...ups.map((u) => u.label)].join(' · ');
  outSpec = { kind, w, h, mat: mat.key, up: ups.map((u) => u.key) };
  return { ok: true, piece, freight, each: ceil2(piece + freight / q), text, spec: outSpec };
}

/** What the form needs to draw a sizer for each kind (no prices: the server prices). */
function sizerOptions() {
  const out = {
    banner: {
      label: 'Banner', unit: 'ft', max: BANNER.max,
      materials: BANNER.materials, hanging: BANNER.hanging,
      upgrades: [{ key: 'wind_slits', label: 'Wind slits' }],
    },
  };
  for (const [key, fam] of Object.entries(SIGNS)) {
    out[key] = {
      label: fam.label, sizing: fam.sizing, unit: fam.sizing === 'area' ? 'in' : null,
      limits: fam.limits || null, sizes: fam.sizes || null,
      materials: fam.materials.map((m) => ({ key: m.key, label: m.label })),
      sheet_upgrades: fam.sheet_upgrades || {},
      upgrades: fam.upgrades.map((u) => ({ key: u.key, label: u.label, only: u.only || null })),
    };
  }
  return out;
}

module.exports = { signKindOf, priceSign, sizerOptions, ladderPrice };
