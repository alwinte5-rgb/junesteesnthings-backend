/* Where a design can go on each garment, measured on the garment's own photo.
 *
 * Owner, 2026-10-18 — the placement set per garment:
 *
 *   quarter-zips, polos, button-downs, full-zip hoodies, jackets, vests
 *        Left chest · Right chest · Back       (no full front: zipper/placket)
 *   tees, long sleeves, tanks, pullover hoodies and crews
 *        Full front · Left chest · Back
 *   kids, infant bodysuits, totes      Front · Back
 *   caps                               Front only (decided 2026-09-12)
 *
 * Before this every garment had one front box the size of a tee's chest, so a
 * quarter-zip (#136) put its print area straight over the zipper.
 *
 * Boxes are set in INCHES from two lines measured on the photo by
 * tools/product-art/measure.py — the centre line and the shoulder line — with
 * the inch worked out from the body width (an adult body is ~20" across). They
 * are then converted to Lumise edit-zone units, which app.js draws as
 *   centre = image centre + (left, top) × r,   size = (width, height) × r,
 *   r = drawn image width / product_width          (app.js ~10897)
 * so one unit is (image width / product_width) photo pixels, whatever size the
 * canvas is.
 *
 * Stage keys stay compatible with designs already saved: `front` and `back`
 * keep existing; a zip or placket garment's `front` IS its left chest, and the
 * extra placements are new keys (`left_chest`, `right_chest`). The first stage
 * is the one the quote feed shows as the colour's photo, so it is the front.
 *
 * A placement that the review finds wrong for one style is corrected in
 * tools/data/placement-overrides.json, never by editing the rule for everyone.
 */
const { classify, subtype } = require('./garments');

const ZIP_FRONT_RE = /\b(full.?zip|zip.?up|zip hood|zip-front|zip front)\b/i;

/** Which placement set a product gets. */
function placementSet(name) {
  const cls = classify(name);
  /* A beanie is decorated on its folded cuff, not its crown (owner, 2026-10-18). */
  if (cls === 'cap') return subtype(name) === 'beanie' ? 'beanie' : 'cap';
  if (cls === 'bag') return 'bag';
  if (cls === 'apron') return 'open';
  if (cls === 'kids') return 'kids';
  if (cls === 'onesie') return 'onesie';
  if (['qzip', 'polo', 'woven', 'jacket', 'vest'].includes(cls)) return 'open';
  if (cls === 'hoodie' && ZIP_FRONT_RE.test(String(name || ''))) return 'open';
  if (['tee', 'longslv', 'tank', 'hoodie'].includes(cls)) return cls === 'tank' ? 'tank' : 'closed';
  return null;
}

/* Inches. `x` is the box centre's distance from the centre line, toward the
   WEARER's left (the viewer's right) when positive; `top` is the box's top
   edge below the shoulder line, or `cy` its centre. Body width in inches by
   set: what the measured torso width stands for. */
/* What the MEASURED torso width stands for, in inches. measure.py's torso
   reads about a quarter narrower than the real garment on S&S photos (the
   first boxes, sized against 20", covered ~40% of a tee's length — owner,
   2026-10-18: "the full boxes are not long enough"), so these are the real
   body widths x 0.75. */
const BODY_IN = { closed: 15, tank: 14.5, open: 15, kids: 12, onesie: 7.5 };

/* GENEROUS on purpose (owner, 2026-10-18): the boxes are where a customer can
   put a design, and the canvas is a mockup of the garment, not a print spec.
   "I'd rather over place the box than not be able to add things on most of
   the shirt." The full front starts clear of the collar and runs most of the
   body; a chest logo is big enough to read as one. The first set (12x14 at
   3.5", 4" chest) read as a diagram: too short, too near the collar, logos
   too small to place anything in. */
const CHEST = { w: 5.5, h: 5.5 };
const SETS = {
  closed: [
    /* 2" higher than first set (owner, 2026-10-24: "the edit box on the hoodie is
       low"). tools/raise-front-box.js moved the products already in the shop. */
    { key: 'front',      label: 'Full front',  side: 'front', w: 14, h: 17, x: 0,    top: 2.5 },
    { key: 'left_chest', label: 'Left chest',  side: 'front', ...CHEST,    x: 4.5,  cy: 6.5 },
    { key: 'back',       label: 'Back',        side: 'back',  w: 14, h: 18, x: 0,    top: 4 },
  ],
  /* A tank's measured "shoulder" is the armpit — the straps are narrower than
     the body — so its boxes start near that line. */
  tank: [
    { key: 'front',      label: 'Full front',  side: 'front', w: 12, h: 16, x: 0,    top: 0.5 },
    { key: 'left_chest', label: 'Left chest',  side: 'front', w: 5, h: 5,  x: 4,    cy: 3 },
    { key: 'back',       label: 'Back',        side: 'back',  w: 12, h: 17, x: 0,    top: -0.5 },
  ],
  /* Clear of the zipper or placket: 4.75" out from the centre line. */
  open: [
    { key: 'front',       label: 'Left chest',  side: 'front', ...CHEST,   x: 4.75,  cy: 6.5 },
    { key: 'right_chest', label: 'Right chest', side: 'front', ...CHEST,   x: -4.75, cy: 6.5 },
    { key: 'back',        label: 'Back',        side: 'back',  w: 14, h: 17, x: 0,  top: 4 },
  ],
  kids: [
    { key: 'front', label: 'Front', side: 'front', w: 11, h: 14, x: 0, top: 1.5 },  // 2" up, as closed
    { key: 'back',  label: 'Back',  side: 'back',  w: 11, h: 15, x: 0, top: 3 },
  ],
  onesie: [
    { key: 'front', label: 'Front', side: 'front', w: 7, h: 8, x: 0, top: 2 },
    { key: 'back',  label: 'Back',  side: 'back',  w: 7, h: 8, x: 0, top: 2 },
  ],
};

const r1 = (n) => Math.round(n * 10) / 10;

/** Pixel boxes {key,label,side,cx,cy,w,h} for one product, from the
 *  measurements of its front and back photos. `m.front` / `m.back` are
 *  measure.py records; `ov` an optional override record. */
function boxesFor(set, m, ov = {}) {
  const out = [];
  const clampBox = (b, mm) => {
    const [x0, y0, x1, y1] = mm.bbox;
    b.w = Math.min(b.w, (x1 - x0) * 0.9); b.h = Math.min(b.h, (y1 - y0) * 0.9);
    b.cx = Math.min(Math.max(b.cx, x0 + b.w / 2), x1 - b.w / 2);
    b.cy = Math.min(Math.max(b.cy, y0 + b.h / 2), y1 - b.h / 2);
    return b;
  };
  if (set === 'cap' || set === 'beanie' || set === 'bag') {
    for (const side of set === 'bag' ? ['front', 'back'] : ['front']) {
      const mm = m[side]; if (!mm || mm.error) continue;
      const [x0, y0, x1, y1] = mm.bbox, bw = x1 - x0, bh = y1 - y0;
      /* A cap: the crown's front panel, above the brim. A tote: the body
         below the handles, a square of most of its width. */
      /* Generous, like the garments (owner: "I'd rather these boxes be too big
         than too small"): a cap gets most of its crown front, a beanie most of
         its folded cuff. */
      const b = set === 'cap'
        ? { w: bw * 0.62, h: bh * 0.42, cx: mm.cx, cy: y0 + bh * 0.38 }
        /* A beanie: across the folded cuff, the bottom quarter of the hat. */
        : set === 'beanie' ? { w: bw * 0.72, h: bh * 0.26, cx: mm.cx, cy: y0 + bh * 0.83 }
        : (() => { const top = mm.shoulder, body = y1 - top, w = mm.torso * 0.74, h = Math.min(w * 1.05, body * 0.8);
          return { w, h, cx: mm.cx, cy: top + body / 2 }; })();
      /* Units differ from the garment sets below: here dx/dy are FRACTIONS of
         the photo's bounding box, not inches — a cap has no body width to
         take an inch from. */
      const o = (ov[side] || {});
      b.cx += (o.dx || 0) * bw; b.cy += (o.dy || 0) * bh; b.w *= o.scale || 1; b.h *= o.scale || 1;
      out.push(clampBox({ key: side, label: side === 'front' ? 'Front' : 'Back', side, ...b }, mm));
    }
    return out;
  }
  const spec = SETS[set]; if (!spec) return out;
  for (const p of spec) {
    let mm = m[p.side]; if (!mm || mm.error) continue;
    /* Sleeves hanging against the body: measure.py's torso is arms + body and
       its shoulder sits at the pocket, so use its separated estimate. Not on a
       tank — no sleeves, so a merged outline IS the body. */
    if (mm.merged && set !== 'tank' && mm.torso_sep) mm = { ...mm, torso: mm.torso_sep, shoulder: mm.shoulder_sep };
    const inch = mm.torso / ((ov.bodyIn) || BODY_IN[set]);
    const o = ov[p.key] || {};
    const w = p.w * inch * (o.scale || 1), h = p.h * inch * (o.scale || 1);
    /* Positive x is the wearer's left, which is the viewer's RIGHT. */
    const cx = mm.cx + (p.x + (o.dx || 0)) * inch;
    let cy = (p.cy !== undefined ? mm.shoulder + p.cy * inch : mm.shoulder + p.top * inch + h / 2) + (o.dy || 0) * inch;
    /* A muscle tank's straps are as wide as its body, so its "shoulder" is the
       strap top, not the armpit, and a box starting above it covers the
       neckline (#272, #340). Never start in the top 12% of a tank. */
    if (set === 'tank' && !o.dy) cy = Math.max(cy, mm.bbox[1] + 0.12 * (mm.bbox[3] - mm.bbox[1]) + h / 2);
    out.push(clampBox({ key: p.key, label: p.label, side: p.side, w, h, cx, cy }, mm));
  }
  return out;
}

/** A pixel box on a photo of width W, height H -> a Lumise edit_zone. */
function toEditZone(b, W, H, productWidth = 400) {
  const u = W / productWidth;
  return { width: r1(b.w / u), height: r1(b.h / u), left: r1((b.cx - W / 2) / u), top: r1((b.cy - H / 2) / u), radius: '0' };
}

/** Stages for one colour: every placement in `boxes`, each drawn on that
 *  side's photo. `base` is the product's existing stages (its front/back
 *  carry product_width/height and anything else Lumise stored). */
function stagesFor(base, boxes, images, sizes) {
  const st = {};
  for (const b of boxes) {
    const src = base[b.side] || base.front || {};
    const img = images[b.side]; if (!img) continue;
    const { W, H } = sizes[b.side];
    const pw = src.product_width || 400;
    st[b.key] = Object.assign({}, JSON.parse(JSON.stringify(src)), {
      label: b.label, source: 'uploads', overlay: false,
      url: String(img).split('/').pop(), image: img,
      edit_zone: toEditZone(b, W, H, pw), product_width: pw,
    });
  }
  return st;
}

const isPhoto = (s) => /^https:\/\//.test(String((s && s.image) || ''));

/** The stand-in drawing per side: the product's own stage when it is not a
 *  photo, else the first old colourway still carrying one. After a run the
 *  product's stages are the DEFAULT colourway's, so its back can be that
 *  colour's photo; copied onto a colour with no back photo it would show a
 *  white back on a navy tote (code review, 2026-10-18). */
function standins(stages, oldVars) {
  const pool = [stages || {}, ...Object.values((oldVars && oldVars.variations) || {}).map((v) => (v && v.stages) || {})];
  const out = {};
  for (const side of ['front', 'back']) {
    const s = pool.map((st) => st[side]).find((x) => x && !isPhoto(x));
    if (s) out[side] = s;
  }
  return out;
}

/** A side the photos do not cover keeps its stand-in drawing (`base` is
 *  standins()) instead of vanishing. S&S has no back photo of most totes, and the
 *  rewire of 2026-10-18 took the Back off five totes and the EC1000 tee (#177)
 *  that way: a customer could no longer design on the back. Only front/back
 *  are kept: they are the sides a photo replaces. */
function keepUncovered(base, boxes, st) {
  const covered = new Set(boxes.filter((b) => st[b.key]).map((b) => b.side));
  for (const side of ['front', 'back']) {
    if (base[side] && !covered.has(side) && !st[side]) st[side] = JSON.parse(JSON.stringify(base[side]));
  }
  return st;
}

module.exports = { placementSet, boxesFor, toEditZone, stagesFor, keepUncovered, standins, SETS, BODY_IN, ZIP_FRONT_RE };
