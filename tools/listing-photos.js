#!/usr/bin/env node
/* Per-colour photos for styles S&S only shot on a model.
 *
 *   railway run -s junesteesnthings-backend -- node tools/listing-photos.js --vars=<file>            # dry run
 *   railway run -s junesteesnthings-backend -- node tools/listing-photos.js --vars=<file> --apply
 *   ... --only=356,375
 *
 * The vars file carries MYSQL_PUBLIC_URL; SSA_ACCOUNT / SSA_API_KEY come from
 * the environment (the file's S&S key is stale).
 *
 * A stand-in product (tools/publish-staged.js --standin) is designed on a
 * drawn garment, so it has no canvas photos, and every swatch on its product
 * page showed the one listing photo (owner, 2026-10-19: "are there no images
 * for the other colors?"). S&S has a photo of EVERY colour on a model
 * (colorOnModelFrontImage) — it only lacks the flat one (colorFrontImage)
 * that tools/product-art needs to cut out a canvas.
 *
 * This writes { swatch value: that colour's photo } into the variations blob
 * as `jt_listing`, which lumise-designer's jt_colourway_photos reads where a
 * colour has no canvas photo (#127). Lumise's app.js reads only
 * `variations.variations`, so the designer canvas does not change.
 *
 * Only products with NO canvas photo are touched: a photographed product's
 * colours come from its canvases. Colours are matched by name, as
 * tools/colour-photos.js matches them; an unmatched colour keeps the listing
 * photo and is reported.
 */
const fs = require('fs');
const os = require('os');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./lib/db');
const { photoCoverage } = require('./lib/canvas');
const { makeClient } = require('./lib/ssa-client');
const { parseIds } = require('./lib/ssa-staged');

const CDN = 'https://cdn.ssactivewear.com/';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The product's colour options, [{ title, value }]. */
function colourOptions(attrs) {
  const a = Object.values(attrs || {}).find((x) => x && x.type === 'product_color');
  let v = a && a.values;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  return (v && Array.isArray(v.options) ? v.options : []).filter((o) => o && o.value);
}

/** { swatch value: https photo } from S&S product rows, and the titles it
 *  could not match. Front on a model; a flat front if S&S has one. */
function listingFor(options, rows) {
  const byName = new Map();
  for (const r of rows || []) {
    const img = r.colorFrontImage || r.colorOnModelFrontImage;
    if (r.colorName && img && !byName.has(norm(r.colorName))) byName.set(norm(r.colorName), CDN + String(img).replace(/^\//, ''));
  }
  const map = {}, missing = [];
  for (const o of options) {
    const u = byName.get(norm(o.title));
    if (u) map[String(o.value)] = u; else missing.push(o.title);
  }
  return { map, missing };
}

async function run(buf) {
  const APPLY = process.argv.includes('--apply');
  const onlyArg = process.argv.find((a) => a.startsWith('--only'));
  let ONLY = null;
  try { ONLY = onlyArg ? parseIds(onlyArg.replace(/^--only=?/, '')) : null; }
  catch (e) { console.error(e.message); process.exit(2); }
  const { SSA_ACCOUNT: acct, SSA_API_KEY: key } = process.env;
  if (!acct || !key) { console.error('SSA_ACCOUNT / SSA_API_KEY missing — run under `railway run -s junesteesnthings-backend`'); process.exit(2); }
  const url = urlFromStdinJson(buf);
  const ssa = makeClient(acct, key);

  const rows = mysql(url, "SELECT id, name, attributes, variations, IFNULL(supplier_style_id,0) sid FROM lumise_products " +
    "WHERE active=1 AND supplier='ssa' ORDER BY id;", { rows: true })
    .filter((p) => !ONLY || ONLY.has(Number(p.id)));
  let wrote = 0, failed = 0;
  for (const p of rows) {
    const attrs = dejson(p.attributes) || {}, vars = dejson(p.variations) || {};
    const cov = photoCoverage(attrs, vars);
    if (!cov.colours || cov.withPhotos > 0 || !Number(p.sid)) continue;
    let prods;
    try { prods = await ssa('products/?styleid=' + Number(p.sid)); }
    catch (e) { console.log('#' + p.id + '  S&S unreachable: ' + e.message.slice(0, 60)); failed++; continue; }
    const { map, missing } = listingFor(colourOptions(attrs), Array.isArray(prods) ? prods : []);
    const n = Object.keys(map).length;
    console.log('#' + String(p.id).padEnd(4) + p.name.slice(0, 50).padEnd(52) + n + '/' + cov.colours + ' colours' +
      (missing.length ? '  (no S&S photo: ' + missing.join(', ') + ')' : ''));
    if (!APPLY || !n) continue;
    const bdir = os.homedir() + '/jtees-backups';
    fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(bdir + '/listing-' + p.id + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json',
      JSON.stringify({ id: p.id, variations: p.variations }));
    mysql(url, 'UPDATE lumise_products SET variations=' + sq(enjson(Object.assign({}, vars, { jt_listing: map }))) +
      ' WHERE id=' + Number(p.id) + ';');
    wrote++;
  }
  console.log('\n' + (APPLY ? wrote + ' product(s) written' : 'dry run — pass --apply to write') + (failed ? ', ' + failed + ' unreachable' : ''));
  if (failed) process.exit(1);
}

if (require.main === module) {
  const vf = (process.argv.find((a) => a.startsWith('--vars=')) || '').slice(7);
  const go = (b) => run(b).catch((e) => { console.error(e.message); process.exit(1); });
  if (vf) go(fs.readFileSync(vf.replace(/^~/, os.homedir()), 'utf8'));
  else { let b = ''; process.stdin.on('data', (d) => (b += d)); process.stdin.on('end', () => go(b)); }
}

module.exports = { listingFor, colourOptions };
