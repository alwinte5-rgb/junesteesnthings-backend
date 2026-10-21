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
const SL = require('./sinalite');

const BANNER = SG.bannerTable();
const SIGNS = SF.signsTable().families;
/* SinaLite items (tools/lib/sinalite.js) are stock families too — a ladder by
   quantity for each size and material — with shipping already inside every
   price. They are read on each call rather than once, so a fresh capture of
   SinaLite's prices reaches the next quote without a restart of this module. */
const familyOf = (kind) => SIGNS[kind] || SL.table().families[kind] || null;

/** The largest quantity a sized line is priced at (preview and save). */
const MAX_QTY = SL.MAX_QTY;

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
  /* A SinaLite product is matched by its exact catalogue name first: its names
     ("Wall Calendars", "Table Covers") would otherwise be read by the
     Signs365 patterns below, or by none of them. */
  const sl = SL.kindOf(n);
  if (sl) return sl;
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
  /* One ceiling for every sized item, here where the save prices it, and the
     same one /admin/api/sign-price refuses above (Codex on #293). */
  if (q > MAX_QTY) return { ok: false, error: `More than ${MAX_QTY.toLocaleString('en-US')}: quote it by hand.` };
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

  const fam = familyOf(kind);
  const famDef = SF.FAMILIES[kind];
  /* A SinaLite family is stock-only and has no Signs365 definition. */
  if (!fam || (!famDef && fam.supplier !== 'sinalite')) return { ok: false, error: 'That item is not priced by size.' };
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
    if (q < ladder[0][0]) return { ok: false, min: ladder[0][0], error: `${size.label} ${fam.label.toLowerCase()} have a minimum of ${ladder[0][0]}.` };
    /* Set runs only (owner, 2026-10-20: "staff quote should only select the
       numbers given"). A quantity between SinaLite's runs is refused, naming
       the runs either side, rather than bought as a mix of runs. Any-quantity
       items (typed box on SinaLite) still take any number. */
    if (fam.supplier === 'sinalite' && !fam.any_qty && !ladder.some(([rq]) => rq === q)) {
      const n = (x) => x.toLocaleString('en-US');
      const below = ladder.filter(([rq]) => rq < q).pop();
      const above = ladder.find(([rq]) => rq > q);
      const near = [below, above].filter(Boolean).map(([rq]) => n(rq));
      return { ok: false, runs: ladder.map(([rq]) => rq),
        error: `${fam.label} are sold only in these quantities: ${ladder.map(([rq]) => n(rq)).join(', ')}. ${n(q)} is not one${near.length ? `; use ${near.join(' or ')}` : ''}.` };
    }
    /* SinaLite sells set runs only: a quantity between runs is bought as the
       cheapest mix of runs that covers it; an any-quantity item never costs
       more than the next run's total (sinalite.js eachFor). Signs365 stock
       ladders are bands. */
    const base = fam.supplier === 'sinalite' ? SL.eachFor(ladder, q, fam.any_qty) : ladderPrice(ladder, q);
    /* Never arithmetic on a missing price: null is "cannot price", not $0
       (Codex on #293: a quantity past the run cap priced free). */
    if (!(base > 0)) return { ok: false, error: `${size.label} ${fam.label.toLowerCase()} cannot be priced at ${q.toLocaleString('en-US')}; quote it by hand.` };
    piece = round2(base + upEach);
    const oversized = fam.freight_by_size[`${size.key}:${mat.key}`];
    freight = oversized != null ? oversized : (takeFreight ? fam.freight : 0);
    const sheetLabels = combo ? combo.split('+').map((k) => fam.sheet_upgrades[k].label) : [];
    text = [size.label, mat.label, ...sheetLabels, ...ups.map((u) => u.label)].join(' · ');
    outSpec = { kind, size: size.key, mat: mat.key, up: [...(combo ? combo.split('+') : []), ...ups.map((u) => u.key)] };
    /* A quantity SinaLite does not sell, where a run next to it is the
       better buy: say so, so the shop offers that instead (owner,
       2026-10-15: "if it'll jump that much just recommend the 2500 not
       3000"). */
    const hint = fam.supplier === 'sinalite' && !fam.any_qty ? runHint(ladder, q, upEach) : null;
    return { ok: true, piece, freight, oversized: oversized != null, each: ceil2(piece + freight / q), text, spec: outSpec, ...(hint ? { hint } : {}) };
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

const money2 = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** For a quantity between set runs: the run below when this quantity costs
 *  over 10% more per piece than it, and the run above when that costs no more
 *  in total than this quantity. { qty, options: [{ qty, each, total }], text }
 *  or null; `qty` is the first option. Prices are the sell prices the line
 *  shows (run each plus per-piece upgrades). */
function runHint(ladder, q, upEach = 0) {
  if (!Array.isArray(ladder) || !ladder.length || ladder.some(([rq]) => rq === q)) return null;
  const thisEach = SL.eachFor(ladder, q, false);
  if (!(thisEach > 0)) return null;
  const piece = (each) => round2(each + upEach);
  const thisTotal = round2(piece(thisEach) * q);
  const opt = ([rq, each]) => ({ qty: rq, each: piece(each), total: round2(piece(each) * rq) });
  const options = [];
  const below = ladder.filter(([rq]) => rq < q).pop();
  if (below && piece(thisEach) > piece(below[1]) * 1.1) options.push(opt(below));
  const above = ladder.find(([rq]) => rq > q);
  if (above && opt(above).total <= thisTotal) options.push(opt(above));
  if (!options.length) return null;
  const n = (x) => x.toLocaleString('en-US');
  const say = (o) => o.qty > q
    ? `${n(o.qty)}: ${money2(o.total)} (${money2(o.each)} each), ${o.total < thisTotal ? 'less money' : 'the same money'} for ${n(o.qty - q)} more`
    : `${n(o.qty)}: ${money2(o.total)} (${money2(o.each)} each)`;
  return { qty: options[0].qty, options,
    text: `${n(q)} is not a SinaLite run, so it costs ${money2(piece(thisEach))} each (${money2(thisTotal)}). Recommend ${options.map(say).join(', or ')}.` };
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
  for (const [key, fam] of Object.entries({ ...SIGNS, ...SL.table().families })) {
    out[key] = {
      label: fam.label, sizing: fam.sizing, unit: fam.sizing === 'area' ? 'in' : null,
      /* The smallest quantity any size can be bought at, so the form can say
         "min 25" before anyone types a quantity (owner, 2026-10-15). */
      min: fam.min || null, supplier: fam.supplier || 'signs365',
      /* SinaLite only: the date its prices were read, and whether the table
         is missing, so the sizer can say so. */
      ...(fam.supplier === 'sinalite' ? (() => { const t = SL.table();
        /* The quantities SinaLite sells, shown under the sizer so nobody has
           to guess a run (owner, 2026-10-15: "there are no quantities"). */
        return { stale: !!(t.stale || t.error), captured: t.captured ? String(t.captured).slice(0, 10) : null,
          runs: fam.runs || [], any_qty: !!fam.any_qty }; })() : {}),
      limits: fam.limits || null, sizes: fam.sizes || null,
      materials: fam.materials.map((m) => ({ key: m.key, label: m.label })),
      sheet_upgrades: fam.sheet_upgrades || {},
      upgrades: fam.upgrades.map((u) => ({ key: u.key, label: u.label, only: u.only || null })),
    };
  }
  return out;
}

module.exports = { signKindOf, priceSign, sizerOptions, ladderPrice, runHint, MAX_QTY };
