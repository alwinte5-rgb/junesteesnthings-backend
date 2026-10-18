/* Is a product's DESIGN CANVAS the garment it actually is?
 *
 * Lived inline in tools/canvas-audit.js. tools/publish-staged.js asks the same
 * question before a staged product goes live, so both read this one copy — a
 * product cannot pass the publish check and then fail the audit.
 *
 * `stages` names the base artwork the designer draws under the customer's
 * design. It is not the catalogue photo, so a product can look right in the
 * shop and still put the design on the wrong silhouette in the editor. */
const { classify, standin } = require('./garments');

/* Which base-art files are ACCEPTABLE for each garment class. A tee drawn on
   the women's tee art is fine; a cap drawn on a tee is not. */
const OK_ART = {
  cap:     [/hat/],
  bag:     [/bag/],
  vest:    [/vest/],
  jacket:  [/jacket|windbreak/],
  qzip:    [/hoodie|sweatshirt|premium/],
  hoodie:  [/hoodie|sweatshirt/],
  polo:    [/polo/],
  woven:   [/premium|woven|twill|polo/],
  onesie:  [/onesie|kids_babies/],
  kids:    [/kids_babies|basic_tshirt|onesie/],
  tank:    [/tank/],
  longslv: [/long_sleeve/],
  tee:     [/basic_tshirt|women_tshirt|premium|v_neck/],
};

const decodeStages = (b) => { try { return JSON.parse(decodeURIComponent(Buffer.from(String(b || ''), 'base64').toString('utf8'))); }
  catch { return null; } };

/** { verdict: 'ok' | 'borrowed' | 'bad' | 'unusable', cls, why?, art?, sub? }
 *  for a product row { name, stages }. */
function canvasVerdict(p) {
  const st = decodeStages(p.stages);
  if (!st || !Object.keys(st).length) return { verdict: 'unusable', why: 'no stages at all' };
  /* The REAL photograph (tools/product-art: an https `image`, drawn under the
     design) is the garment itself, whatever its file is called — the right
     garment by construction. */
  const real = Object.values(st).filter((s) => s && /^https:\/\//.test(String(s.image || '')));
  if (real.length && real.length === Object.keys(st).length) return { verdict: 'ok', cls: classify(p.name), real: true };
  const art = Object.values(st).map((s) => String((s && s.url) || '')).join(' ');
  if (!art.trim()) return { verdict: 'unusable', why: 'stages carry no artwork url' };
  const cls = classify(p.name);
  if (cls === 'unknown') return { verdict: 'unusable', why: 'cannot tell what garment this is' };
  if ((OK_ART[cls] || []).some((re) => re.test(art))) {
    /* The family is right. That is not the same as the garment being right:
       one hat.png stands in for every beanie, visor and trucker, and a vest is
       drawn with sleeves — artwork that does not exist yet, not a SQL fix. */
    const sub = standin(p.name);
    return sub ? { verdict: 'borrowed', cls, sub } : { verdict: 'ok', cls };
  }
  return { verdict: 'bad', cls, art: art.replace(/products\//g, '').replace(/\.png/g, '') };
}

/** How many of a product's colours have a real-photo canvas (a cfgstages
 *  variation carrying an https image), from its decoded attributes and
 *  variations. { colours, withPhotos } — equal when every colour has one. */
function photoCoverage(attrs, vars) {
  const col = Object.values(attrs || {}).find((a) => a && a.type === 'product_color');
  const opts = (col && col.values && col.values.options) || [];
  const wired = new Set(Object.values((vars && vars.variations) || {})
    .filter((v) => v && v.cfgstages && v.stages &&
      Object.values(v.stages).every((s) => /^https:\/\//.test(String((s && s.image) || ''))))
    .map((v) => Object.values(v.conditions || {})[0]));
  return { colours: opts.length, withPhotos: opts.filter((o) => wired.has(o.value)).length };
}

module.exports = { OK_ART, canvasVerdict, decodeStages, photoCoverage };
