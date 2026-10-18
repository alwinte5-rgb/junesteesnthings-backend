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
const { sellPrice } = require('./lib/markup');
const { classify, decorationsFor, resolveRoles } = require('./lib/garments');
const { placementSet, SETS } = require('./lib/placements');
const { decodeStages, photoCoverage } = require('./lib/canvas');
const { sizeUpcharge } = require('./lib/markup');
const { costBySize, baseCostOf } = require('./lib/ssa-costs');

/* Garment words that must survive from S&S's title into the product's name. A
   name can drop the fabric or the fit; it cannot turn an apron into a shirt. */
const GARMENT_WORDS = ['apron', 'bib', 'polo', 'hoodie', 'hooded', 'jacket', 'vest', 'tank', 'beanie',
  'visor', 'bucket', 'tote', 'backpack', 'duffel', 'bodysuit', 'onesie', 'scrub', 'quarter-zip', 'crewneck',
  'jogger', 'pants', 'shorts', 'sweatpants', 'blanket', 'towel', 'socks', 'scarf', 'gloves', 'bandana', 'cap', 'hat'];
const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').split(/\s+/).filter(Boolean));

/** The quantity attribute's parsed values, or null. */
function sizeValues(attrs) {
  const q = Object.values(attrs || {}).find((a) => a && a.type === 'quantity');
  if (!q) return null;
  let v = q.values;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  return v && typeof v === 'object' ? v : {};
}

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
      const t = o.title || o.value; if (!(t in bySize)) continue;
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
  out.naming = lost.length ? 'S&S calls it "' + style.title + '"' : 'ok';
  return out;
}


/** The keys a garment's stages should have, in order. */
function expectedKeys(set) {
  if (set === 'cap') return ['front'];
  if (set === 'bag') return ['front', 'back'];
  return (SETS[set] || []).map((p) => p.key);
}

/** Every check for one product that needs no network. Exported for tests. */
function localChecks(p, { roleIds = {} } = {}) {
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
  out.sizes = !sv ? 'no size field' : n > 1 && sv.type !== 'multiple' ? n + ' sizes drawn as one quantity box' : 'ok';
  const desc = String(p.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  out.copy = desc.length < 200 ? 'description ' + desc.length + ' chars' : 'ok';
  const roles = decorationsFor(p.name) || [];
  const want = roles.map((r) => roleIds[r]).filter(Number.isFinite).sort((a, b) => a - b);
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
  /* Every colourway too: wire.js's fallback writes one copied box per colour,
     so a product's own stages can be right while a swatch is not. */
  const off = Object.values(((dejson(p.variations) || {}).variations) || {})
    .filter((v) => v && v.cfgstages && v.stages && !same(Object.keys(v.stages))).length;
  out.placements = !set ? 'no placement set for ' + out.cls
    : same(keys) && off ? off + ' colourway(s) without the full placement set'
    : same(keys) ? 'ok'
      : 'has ' + (keys.map((k) => (st[k] && st[k].label) || k).join(' / ') || 'none') + ', wants ' +
        exp.map((k) => ((SETS[set] || []).find((s) => s.key === k) || { label: k }).label).join(' / ');
  return out;
}

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
  let rows = mysql(url, "SELECT id, name, active, IFNULL(supplier,'') supplier, IFNULL(supplier_style_id,0) sid, " +
    "price, IFNULL(supplier_cost,0) cost, attributes, variations, stages, printings, IFNULL(thumbnail_url,'') thumb, " +
    "IFNULL(description,'') description FROM lumise_products " +
    "WHERE active=1 OR supplier='ssa-staged' ORDER BY id;", { rows: true });
  if (ids.length) rows = rows.filter((r) => ids.includes(Number(r.id)));

  const report = [];
  for (const p of rows) {
    const r = { id: Number(p.id), name: p.name, staged: p.supplier === 'ssa-staged', ...localChecks(p, { roleIds }) };
    if (!Number(p.sid)) {
      /* Shop-made: nothing to compare with S&S, but it is still judged — the
         owner switched signs off on 2026-10-18 for having no sizes, shape,
         mockup or price a shopper can see. */
      r.identity = 'shop-made (no S&S style)'; r.colours = '-';
      r.shopmade = 'needs sizes, specs, real mockup and a shown price';
      report.push(r); continue;
    }
    if (ssa) {
      try {
        const st = await ssa('styles/' + Number(p.sid));
        const s = Array.isArray(st) ? st[0] : st;
        const name = String(p.name).toUpperCase();
        r.identity = !s ? 'style ' + p.sid + ' not at S&S'
          : !name.includes(String(s.styleName).toUpperCase()) ? 'name lacks style ' + s.styleName
            : !name.includes(String(s.brandName).split(/\s+/)[0].toUpperCase()) ? 'name lacks brand ' + s.brandName : 'ok';
        const prods = await ssa('products/?styleid=' + Number(p.sid)) || [];
        const ssaCols = new Set(prods.map((x) => x.colorName).filter(Boolean));
        const attrs = dejson(p.attributes) || {};
        const col = Object.values(attrs).find((a) => a && a.type === 'product_color');
        const mine = new Set(((col && col.values && col.values.options) || []).map((o) => o.title));
        const gone = [...mine].filter((c) => !ssaCols.has(c)), added = [...ssaCols].filter((c) => !mine.has(c));
        r.colours = gone.length || added.length ? (gone.length ? '-' + gone.length : '') + (added.length ? ' +' + added.length : '') + ' vs S&S' : 'ok';
        Object.assign(r, ssaChecks(p, s, prods));
      } catch (e) { r.identity = r.identity || 'S&S unreachable: ' + e.message.slice(0, 40); r.colours = r.colours || '?'; }
    }
    report.push(r);
  }

  const CHECKS = ['identity', 'naming', 'colours', 'swatches', 'price', 'sizes', 'upcharges', 'decoration',
    'photos', 'placements', 'listing', 'copy', 'shopmade'];
  const bad = (r) => CHECKS.filter((k) => r[k] && r[k] !== 'ok' && r[k] !== '-' && !String(r[k]).startsWith('shop-made'));
  console.log('CATALOGUE INVENTORY — ' + report.length + ' products (' + report.filter((r) => r.staged).length + ' staged)\n');
  for (const r of report) {
    const b = bad(r);
    console.log('  ' + (b.length ? '✗' : '✓') + ' #' + String(r.id).padStart(3) + (r.staged ? ' S ' : '   ') +
      r.name.slice(0, 46).padEnd(48) + r.set.padEnd(7) + (b.length ? b.map((k) => k + ': ' + r[k]).join(' · ') : 'ready'));
  }
  const tally = {};
  for (const r of report) for (const k of bad(r)) tally[k] = (tally[k] || 0) + 1;
  console.log('\n  ' + report.filter((r) => !bad(r).length).length + ' ready · ' +
    Object.entries(tally).map(([k, n]) => n + ' ' + k).join(' · '));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 1));
}

if (require.main === module) {
  let buf = '';
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => main(buf).catch((e) => { console.error(e.message); process.exit(1); }));
}
module.exports = { localChecks, ssaChecks, expectedKeys };
