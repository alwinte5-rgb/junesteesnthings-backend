/* What the pipeline should do with one product — decided in one pure function,
 * so it can be tested without a database, a supplier or a Cloudinary account.
 *
 * It lives outside run.js because run.js reads stdin the moment it is loaded,
 * and a rule this easy to regress needs a test that can call it directly. The
 * two that matter:
 *
 *   - HEADWEAR IS FRONT ONLY. Decided 2026-09-12. A stage is somewhere a
 *     customer can put a design, so giving a cap a back stage is not an artwork
 *     change — it commits the shop to decorating and pricing a cap back, which
 *     it does not sell.
 *   - A PRODUCT WITH NO DECORATION METHOD NEVER OPENS THE DESIGNER. It shows
 *     "Get a Quote" instead (products.php, $jt_quote_only). Canvas art for it
 *     is invisible to every customer, and for #88 alone that is 115 colourways
 *     of fetching, cutting, encoding and storing that change nothing.
 */
const { classify, standin } = require('../lib/garments');

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

/** Decide one product. `p` is a row with decoded stages/attributes/variations. */
function planFor(p) {
  const sub = standin(p.name);
  if (!sub) return null;                     // the art is already its own garment

  const stages = p.stages || {};
  const attrs = p.attributes || {};
  const vars = p.variations || {};

  const col = Object.values(attrs).find((a) => a && a.type === 'product_color');
  const opts = (col && col.values && col.values.options) || [];

  const wired = Object.values(vars.variations || {}).filter((v) =>
    v && v.cfgstages && v.stages &&
    Object.values(v.stages).some((s) => /^https?:/.test(String(s.image || '')))).length;

  const cls = classify(p.name);
  const sides = Object.keys(stages)
    .filter((s) => s === 'front' || s === 'back')
    .filter((s) => !(cls === 'cap' && s === 'back'));

  const blocked = [];
  if (!p.supplier_style_id || String(p.supplier_style_id) === '0') blocked.push('no supplier style id');
  if (!opts.length) blocked.push('no colour attribute');
  if (new Set(opts.map((o) => o.value)).size !== opts.length)
    blocked.push('duplicate colour swatches — run tools/unique-colour-swatches.js --apply');
  if (!sides.length) blocked.push('no front/back stage to put art on');
  if (!String(p.printings == null ? '' : p.printings).replace(/%7B%7D/g, '').trim())
    blocked.push('no decoration method — this product never opens the designer');

  return {
    id: Number(p.id), name: p.name, sid: p.supplier_style_id, cls, as: sub.as,
    sides, cols: opts.length, wired, blocked,
    done: opts.length > 0 && wired >= opts.length,
    images: opts.length * sides.length,
    folder: 'jtees/product-art/' + p.id + '-' + slug(p.name),
  };
}

module.exports = { planFor, slug };
