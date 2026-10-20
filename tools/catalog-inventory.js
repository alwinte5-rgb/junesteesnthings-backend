#!/usr/bin/env node
/* Is every garment in the catalogue what it says it is, and ready to design on?
 *
 *   <vars json> | node tools/catalog-inventory.js [--json=<file>] [ids...]
 *
 * The vars JSON carries MYSQL_PUBLIC_URL and, for the checks against S&S,
 * SSA_ACCOUNT / SSA_API_KEY — the same object tools/product-art/run.js reads.
 *
 * Read-only. One line per product, live and staged (supplier='ssa-staged'),
 * and a verdict per check — the owner asked on 2026-10-18 for every product to
 * be "analysed for accuracy" before the streetwear batch goes live:
 *
 *   identity    the S&S style resolves, and its brand and style number are in
 *               the product's name (style numbers repeat across brands)
 *   colours     the colour list equals S&S's today, and every swatch is unique
 *               (fix: tools/resync-colours.js, tools/unique-colour-swatches.js)
 *   price       sizes are set and the price is the shop's cost x 2
 *   decoration  the methods offered are the ones its garment class takes
 *               (tools/lib/garments.js decorationsFor)
 *   photos      every colour has a real-photo canvas (tools/product-art)
 *   placements  the placements are its garment's set (tools/lib/placements.js):
 *               a quarter-zip or polo offers chest logos, never a full front
 *               over the zipper
 *   sizes       more than one size is stored as Lumise's size LIST
 *               (`type: 'multiple'`); without it the designer draws a single
 *               quantity box and the customer cannot pick a size
 *   upcharges   each size's extra charge is what S&S's cost difference makes it
 *               (tools/lib/ssa-costs.js + markup.js sizeUpcharge)
 *   listing     the catalogue photo is the owner's listing mockup or one of
 *               THIS style's own S&S colour photos — not another style's
 *   naming      a garment word in S&S's title (apron, polo, vest...) is in the
 *               product's name too: #143 was S&S's bib apron sold as a shirt
 *   copy        the description is long enough to tell a shopper (and a search
 *               engine) what the garment is
 *
 * Shop-made products (no S&S style: signs, buttons, cutouts) are listed but not
 * judged against S&S.
 */
const fs = require('fs');
const { mysql, urlFromStdinJson, dejson } = require('./lib/db');
const { makeClient } = require('./lib/ssa-client');
const { sellPrice, sizeUpcharge } = require('./lib/markup');
const { classify, decorationsFor, resolveRoles } = require('./lib/garments');
const { placementSet, SETS } = require('./lib/placements');
const { decodeStages, photoCoverage, canvasVerdict } = require('./lib/canvas');
/* publish-staged requires this file, so its pattern rule is loaded on use. */
const patterned = (p) => require('./publish-staged').patterned(p);

/* Fit and pattern words: a name may drop the fabric, not the cut a shopper is
   choosing (owner, 2026-10-19: the oversized tee, muscle tee and cropped tee
   all reached the designer as a plain tee). */
const FIT_WORDS = ['cropped', 'crop', 'oversized', 'boxy', 'muscle', 'pocket', 'v-neck', 'raglan', 'tie-dyed', 'tie-dye',
  'dip', 'camo', 'ombre', 'colorblast', 'tall', 'youth', 'toddler', 'infant', 'women\'s', 'zip', 'full-zip', 'quarter-zip'];
/* The garment's shape that a drawing cannot show: a fit word on a drawn canvas. */
const DRAWN_FIT = /\b(crop(ped)?|oversized|boxy|muscle|pocket|raglan|dip.?dye|tie.?dye|ombr[eé]|colou?rblast|camo)\b/i;
/* A fabric weight a description states, in oz. */
const ozOf = (t) => { const m = String(t || '').match(/(\d+(?:\.\d+)?)\s*oz/i); return m ? Number(m[1]) : null; };
const ozAll = (t) => [...String(t || '').matchAll(/(\d+(?:\.\d+)?)\s*oz/gi)].map((m) => Number(m[1]));
const { costBySize, baseCostOf, readSizes, pieceCost } = require('./lib/ssa-costs');
/* ssa-add-products gives the SubliVie poly tees dye sublimation on top of their
   garment class's methods, so it is wanted there, not an extra. */
const SUBLIMATED = /^SubliVie/i;
const sublimationId = (methods) => { const m = (methods || []).find((x) => /^sublimation/i.test(String(x.title || ''))); return m ? Number(m.id) : null; };

/* Garment words that must survive from S&S's title into the product's name. A
   name can drop the fabric or the fit; it cannot turn an apron into a shirt. */
const GARMENT_WORDS = ['apron', 'bib', 'polo', 'hoodie', 'hooded', 'jacket', 'vest', 'tank', 'beanie',
  'visor', 'bucket', 'tote', 'backpack', 'duffel', 'bodysuit', 'onesie', 'scrub', 'quarter-zip', 'crewneck',
  'jogger', 'pants', 'shorts', 'sweatpants', 'blanket', 'towel', 'socks', 'scarf', 'gloves', 'bandana', 'cap', 'hat'];
const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').split(/\s+/).filter(Boolean));

/** The quantity attribute's parsed values, or null. Unreadable is its own
 *  answer ({ unreadable: true }): read as {} it had no sizes to fault and the
 *  audit called a corrupt field "ok" (code review, 2026-10-18). */
const sizeValues = (attrs) => { const s = readSizes(attrs); return s && s.values; };

/** S&S-side checks for one product, from its style record and product rows.
 *  Exported for tests. */
function ssaChecks(p, style, prods) {
  const out = {};
  const attrs = dejson(p.attributes) || {};
  /* upcharges */
  const bySize = costBySize(prods || []), base = baseCostOf(bySize);
  const opts = ((sizeValues(attrs) || {}).multiple_options) || [];
  if (!isFinite(base)) out.upcharges = 'S&S gives no core-size cost';
  else {
    const off = [];
    for (const o of opts) {
      const t = o.title || o.value;
      /* A stored "2X" that S&S calls "2XL" is never repriced by the sync
         either, so it is a fault, not a pass (code review, 2026-10-18). */
      if (!(t in bySize)) { if (opts.length > 1) off.push(t + ' not a size at S&S'); continue; }   // one size has no extra charge to get wrong
      const want = sizeUpcharge(bySize[t], base), have = Number(o.price) || 0;
      if (Math.abs(want - have) > 0.05) off.push(t + ' ' + (have ? '+' + have.toFixed(2) : '+0') + ' (S&S: +' + want.toFixed(2) + ')');
    }
    out.upcharges = off.length ? off.join(', ') : 'ok';
  }
  /* listing */
  const thumb = String(p.thumb || '');
  const m = thumb.match(/Images\/(?:Color|ModelColor)\/(\d+)_/);
  const sm = thumb.match(/Images\/Style\/(\d+)_/);   // S&S's main photo of a style, by style id
  const own = new Set((prods || []).flatMap((r) => [r.colorFrontImage, r.colorSideImage, r.colorBackImage, r.colorOnModelFrontImage])
    .map((u) => (String(u || '').match(/\/(\d+)_/) || [])[1]).filter(Boolean));
  out.listing = !thumb || thumb === 'NULL' ? 'no catalogue photo'
    : /res\.cloudinary\.com\/[^/]+\/image\/upload\/(v\d+\/)?jtees\/listing\//.test(thumb) ? 'ok'
    : m ? (own.has(m[1]) ? 'ok' : 'photo ' + m[1] + ' is not one of this style\'s')
    : sm ? (Number(sm[1]) === Number(p.sid) ? 'ok' : 'style photo ' + sm[1] + ' is not style ' + p.sid)
    : 'not an S&S or listing photo';
  /* naming */
  const have = words(p.name), title = words(style && style.title);
  /* "Hoodie" is how a shopper says S&S's "Hooded Sweatshirt". */
  if (have.has('hoodie')) have.add('hooded');
  const lost = GARMENT_WORDS.filter((w) => title.has(w) && !have.has(w));
  const lostFit = FIT_WORDS.filter((w) => title.has(w) && !have.has(w) && !(w === 'crop' && have.has('cropped')));
  out.naming = lost.length || lostFit.length ? 'S&S calls it "' + style.title + '"' : 'ok';
  /* description: a fabric weight we state must be S&S's. */
  const ours = ozOf(String(p.description || '').replace(/<[^>]+>/g, ' ')), theirs = ozOf(String((style && style.description) || '').replace(/<[^>]+>/g, ' '));
  /* S&S states US and Canadian weights ("7.4 oz./yd² (US), 12.4 oz./L yd
     (CA)") in either order, so ours is right when it is any weight S&S gives. */
  const theirAll = ozAll(String((style && style.description) || '').replace(/<[^>]+>/g, ' '));
  out.description = ours != null && theirs != null && !theirAll.some((t) => Math.abs(ours - t) <= 0.05)
    ? 'says ' + ours + ' oz, S&S says ' + theirs + ' oz' : 'ok';
  return out;
}


/** The keys a garment's stages should have, in order. */
function expectedKeys(set) {
  if (set === 'cap' || set === 'beanie') return ['front'];
  if (set === 'bag') return ['front', 'back'];
  return (SETS[set] || []).map((p) => p.key);
}

/** Every check for one product that needs no network. Exported for tests. */
function localChecks(p, { roleIds = {}, cats = null, treeSlugs = null, subId = null } = {}) {
  const out = {};
  const attrs = dejson(p.attributes) || {};
  const col = Object.values(attrs).find((a) => a && a.type === 'product_color');
  const opts = (col && col.values && col.values.options) || [];
  const sizes = Object.values(attrs).find((a) => a && a.type !== 'product_color');
  out.colourCount = opts.length;
  out.swatches = new Set(opts.map((o) => o.value)).size === opts.length ? 'ok' : 'duplicate swatch values';
  out.price = !sizes ? 'no sizes'
    : (Number(p.cost) > 0 && Math.abs(Number(p.price) - sellPrice(Number(p.cost))) > 0.02)
      ? 'price ' + p.price + ' is not cost ' + p.cost + ' x 2' : 'ok';

  const set = placementSet(p.name);
  out.cls = classify(p.name); out.set = set || '-';

  const sv = sizeValues(attrs);
  const n = ((sv && sv.multiple_options) || []).length;
  out.sizes = !sv ? 'no size field' : sv.unreadable ? 'size field unreadable'
    : n > 1 && sv.type !== 'multiple' ? n + ' sizes drawn as one quantity box' : 'ok';
  const desc = String(p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  out.copy = desc.length < 200 ? 'description ' + desc.length + ' chars' : 'ok';
  const roles = decorationsFor(p.name) || [];
  const want = roles.map((r) => roleIds[r]).filter(Number.isFinite);
  if (roles.length && Number.isFinite(subId) && SUBLIMATED.test(p.name) && !want.includes(subId)) want.push(subId);
  want.sort((a, b) => a - b);
  let have = [];
  try { const o = JSON.parse(decodeURIComponent(String(p.printings || ''))); have = o && typeof o === 'object' ? Object.keys(o).map((k) => Number(String(k).replace(/\D/g, ''))) : []; } catch { /* legacy csv */ }
  have = have.filter(Number.isFinite).sort((a, b) => a - b);
  const missing = want.filter((id) => !have.includes(id)), extra = have.filter((id) => !want.includes(id));
  out.decoration = !want.length ? 'no rule for class ' + out.cls
    : (missing.length || extra.length) ? (missing.length ? 'missing ' + missing.join(',') : '') + (extra.length ? ' extra ' + extra.join(',') : '') : 'ok';

  const cov = photoCoverage(attrs, dejson(p.variations) || {});
  out.photos = !cov.colours ? 'no colours' : cov.withPhotos < cov.colours ? cov.withPhotos + '/' + cov.colours + ' colours have photos' : 'ok';

  const st = decodeStages(p.stages) || {};
  const keys = Object.keys(st), exp = expectedKeys(set);
  const same = (ks) => exp.every((k) => ks.includes(k)) && ks.every((k) => exp.includes(k));
  /* A product set up by hand in the Lumise admin has generated stage ids
     (#14 Bella+Canvas 3001: 'ZWEnsr7gXm', 'mr83j4pl'). Renaming them would
     orphan saved designs, so its Front / Back labels are what is judged. */
  const label = (k) => ((SETS[set] || []).find((s) => s.key === k) || { label: k.charAt(0).toUpperCase() + k.slice(1) }).label;
  const sameLabels = keys.length === exp.length && keys.every((k, i) => st[k] && st[k].label === label(exp[i]));
  /* Every colourway too: wire.js's fallback writes one copied box per colour,
     so a product's own stages can be right while a swatch is not. */
  const off = Object.values(((dejson(p.variations) || {}).variations) || {})
    .filter((v) => v && v.cfgstages && v.stages && !same(Object.keys(v.stages))).length;
  out.placements = !set ? 'no placement set for ' + out.cls
    : (same(keys) || sameLabels) && off ? off + ' colourway(s) without the full placement set'
    : same(keys) || sameLabels ? 'ok'
      : 'has ' + (keys.map((k) => (st[k] && st[k].label) || k).join(' / ') || 'none') + ', wants ' +
        exp.map((k) => ((SETS[set] || []).find((s) => s.key === k) || { label: k }).label).join(' / ');
  /* canvas: what the designer draws under a customer's design. */
  const v = canvasVerdict(p);
  const pat = (Number(cov.withPhotos) === 0) ? patterned(p) : null;
  out.canvas = v.verdict === 'bad' ? 'wrong garment drawing (' + v.art + ')'
    : v.verdict === 'unusable' ? 'unusable: ' + v.why
    : v.verdict === 'borrowed' ? 'drawn as ' + v.sub.looks
    : v.real ? 'ok'
    : pat ? 'drawing cannot show its pattern (' + pat + ')'
    : DRAWN_FIT.test(p.name) ? 'generic drawing for a ' + p.name.match(DRAWN_FIT)[0] + ' garment'
    : 'drawing (no real photo)';
  /* category: filed exactly where the tree says. */
  if (cats && treeSlugs) {
    const want = new Set(treeSlugs(p.name)), have = new Set(cats);
    const missing = [...want].filter((x) => !have.has(x)), extra = [...have].filter((x) => x.startsWith('custom-') && !want.has(x) && x !== 'custom-sustainable-apparel' && !/banners|signs|graphics|panels|cutouts|displays/.test(x));
    out.category = !want.size && !have.size ? 'in no category'
      : missing.length || extra.length ? (missing.length ? 'missing ' + missing.join(', ').replace(/custom-/g, '') : '') + (extra.length ? ' extra ' + extra.join(', ').replace(/custom-/g, '') : '') : 'ok';
  }
  /* swatch photos: every colour shows its own photo on the product page. */
  const vars = dejson(p.variations) || {};
  const photoKeys = new Set();
  for (const vv of Object.values(vars.variations || {})) {
    if (!vv || !vv.cfgstages || !vv.conditions) continue;
    const hex = String(Object.values(vv.conditions)[0] || '').toLowerCase();
    if (Object.values(vv.stages || {}).some((x) => /^https:\/\//.test(String((x && x.image) || '')))) photoKeys.add(hex);
  }
  for (const k of Object.keys(vars.jt_listing || {})) photoKeys.add(String(k).toLowerCase());
  const noPhoto = opts.filter((o) => !photoKeys.has(String(o.value).toLowerCase())).map((o) => o.title);
  out.swatchPhotos = opts.length < 2 ? 'ok' : noPhoto.length ? noPhoto.length + '/' + opts.length + ' colours show another colour\'s photo' : 'ok';
  return out;
}

/** The checks against S&S's live record, written onto the report row `r`.
 *  Shared with tools/publish-staged.js, so a product is audited the same way
 *  before it goes live as in the whole-catalogue run (owner, 2026-10-19: keep
 *  the audit for future products). */
async function compareWithSsa(r, p, ssa, { style } = {}) {
  let done = false;
  try {
    const st = style || await ssa('styles/' + Number(p.sid));
    const s = Array.isArray(st) ? st[0] : st;
    const name = String(p.name).toUpperCase();
    r.identity = !s ? 'style ' + p.sid + ' not at S&S'
      : !name.includes(String(s.styleName).toUpperCase()) ? 'name lacks style ' + s.styleName
        : !name.includes(String(s.brandName).split(/\s+/)[0].toUpperCase()) ? 'name lacks brand ' + s.brandName : 'ok';
    const prods = await ssa('products/?styleid=' + Number(p.sid)) || [];
    /* Only colours S&S prices: ssa-add-products skips an unpriced one. */
    const ssaCols = new Set(prods.filter((x) => x.sizeName && pieceCost(x) > 0).map((x) => x.colorName).filter(Boolean));
    const attrs = dejson(p.attributes) || {};
    const col = Object.values(attrs).find((a) => a && a.type === 'product_color');
    const mine = new Set(((col && col.values && col.values.options) || []).map((o) => o.title));
    const gone = [...mine].filter((c) => !ssaCols.has(c)), added = [...ssaCols].filter((c) => !mine.has(c));
    r.colours = gone.length || added.length ? (gone.length ? '-' + gone.length : '') + (added.length ? ' +' + added.length : '') + ' vs S&S' : 'ok';
    Object.assign(r, ssaChecks(p, s, prods));
    done = true;
  } catch (e) {
    /* A failure part-way must not leave identity 'ok' with naming, weight
       and upcharges never judged: the publish gate would pass it. */
    r.identity = 'S&S audit incomplete: ' + String(e.message).slice(0, 40); r.colours = r.colours || '?';
  }
  if (!done && r.identity === 'ok') r.identity = 'S&S audit incomplete';
  return r;
}

const CHECKS = ['identity', 'naming', 'description', 'colours', 'swatches', 'swatchPhotos', 'price', 'sizes', 'upcharges', 'decoration',
  'photos', 'placements', 'canvas', 'category', 'listing', 'copy', 'shopmade'];
/* Findings that are reported but are not faults (owner, 2026-10-20, after
   checking the flagged products by hand: "they all have the image loaded
   fine", "the canvas drawings look fine", "I think we need to loosen the
   audit a bit"): a short description, a colour opening on the product's
   drawing or default photo instead of its own, and a drawing that IS the
   garment (or a generic fit of it, as on the Bayside oversized styles). A
   wrong garment, an unusable canvas, a drawing that cannot show a pattern, and
   a cropped cut on a full-length drawing (owner, 2026-10-19: "cropped tee but
   full shirt" — cropped_tshirt exists for it) stay faults. */
const NOTE_CHECKS = new Set(['copy', 'photos', 'swatchPhotos']);
const NOTE_CANVAS = /^(drawing \(no real photo\)|generic drawing for an? (?!crop))/i;
const isNote = (k, v) => NOTE_CHECKS.has(k) || (k === 'canvas' && NOTE_CANVAS.test(String(v)));
const flagged = (r) => CHECKS.filter((k) => r[k] && r[k] !== 'ok' && r[k] !== '-' && !String(r[k]).startsWith('shop-made'));
/** The checks a report row fails. */
const bad = (r) => flagged(r).filter((k) => !isNote(k, r[k]));
/** The checks a report row only notes. */
const noted = (r) => flagged(r).filter((k) => isNote(k, r[k]));

/* Credentials come in on stdin as one JSON object, as for
   tools/product-art/run.js — never on the command line, where `ps` shows them. */
async function main(buf) {
  let e = {};
  try { e = JSON.parse(buf || '{}'); } catch { console.error('stdin is not JSON'); process.exit(2); }
  const url = urlFromStdinJson(buf);
  const argv = process.argv.slice(2);
  const ids = argv.filter((a) => /^\d+$/.test(a)).map(Number);
  const jsonOut = (argv.find((a) => a.startsWith('--json=')) || '').slice(7);
  const ssa = e.SSA_ACCOUNT && e.SSA_API_KEY ? makeClient(e.SSA_ACCOUNT, e.SSA_API_KEY) : null;
  if (!ssa) console.log('no SSA credentials — identity and colour checks against S&S are skipped\n');

  const methods = mysql(url, 'SELECT id, title FROM lumise_printings ORDER BY id;', { rows: true });
  const { ids: roleIds } = resolveRoles(methods);
  const subId = sublimationId(methods);
  let rows = mysql(url, "SELECT id, name, active, IFNULL(supplier,'') supplier, IFNULL(supplier_style_id,0) sid, " +
    "price, IFNULL(supplier_cost,0) cost, attributes, variations, stages, printings, IFNULL(thumbnail_url,'') thumb, " +
    "IFNULL(description,'') description FROM lumise_products " +
    "WHERE active=1 OR supplier='ssa-staged' ORDER BY id;", { rows: true });
  if (ids.length) rows = rows.filter((r) => ids.includes(Number(r.id)));
  const { treeSlugs } = require('./categorise-products');
  const catsBy = {};
  for (const c of mysql(url, "SELECT r.item_id id, c.slug FROM lumise_categories_reference r JOIN lumise_categories c ON c.id=r.category_id WHERE r.type='products';", { rows: true }))
    (catsBy[c.id] = catsBy[c.id] || []).push(c.slug);

  const report = [];
  for (const p of rows) {
    /* A staged style is filed when it is published (publish-staged.js), so
       only a live product's categories are judged. */
    const staged = p.supplier === 'ssa-staged';
    const r = { id: Number(p.id), name: p.name, staged, ...localChecks(p, { roleIds, subId, cats: staged ? null : catsBy[p.id] || [], treeSlugs }) };
    if (!Number(p.sid)) {
      /* Shop-made: nothing to compare with S&S, but it is still judged — the
         owner switched signs off on 2026-10-18 for having no sizes, shape,
         mockup or price a shopper can see. */
      r.identity = 'shop-made (no S&S style)'; r.colours = '-';
      const lacks = [r.sizes !== 'ok' && 'sizes', r.copy !== 'ok' && 'specs',
        (!p.thumb || p.thumb === 'NULL') && 'real mockup', !(Number(p.price) > 0) && 'a shown price'].filter(Boolean);
      r.shopmade = lacks.length ? 'needs ' + lacks.join(', ') : 'ok';
      report.push(r); continue;
    }
    if (ssa) await compareWithSsa(r, p, ssa);
    report.push(r);
  }

  console.log('CATALOGUE INVENTORY — ' + report.length + ' products (' + report.filter((r) => r.staged).length + ' staged)\n');
  for (const r of report) {
    const b = bad(r);
    console.log('  ' + (b.length ? '✗' : '✓') + ' #' + String(r.id).padStart(3) + (r.staged ? ' S ' : '   ') +
      r.name.slice(0, 46).padEnd(48) + r.set.padEnd(7) + (b.length ? b.map((k) => k + ': ' + r[k]).join(' · ') : 'ready'));
  }
  const tally = {};
  for (const r of report) for (const k of bad(r)) tally[k] = (tally[k] || 0) + 1;
  const notes = {};
  for (const r of report) for (const k of noted(r)) notes[k] = (notes[k] || 0) + 1;
  console.log('\n  ' + report.filter((r) => !bad(r).length).length + ' ready · ' +
    Object.entries(tally).map(([k, n]) => n + ' ' + k).join(' · ') +
    '\n  notes, not faults: ' + (Object.entries(notes).map(([k, n]) => n + ' ' + k).join(' · ') || 'none'));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
}

if (require.main === module) {
  let buf = '';
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => main(buf).catch((e) => { console.error(e.message); process.exit(1); }));
}
module.exports = { localChecks, ssaChecks, compareWithSsa, bad, noted, isNote, CHECKS, sublimationId, expectedKeys };
