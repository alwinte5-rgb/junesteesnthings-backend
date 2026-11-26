'use strict';

/* GOOTEN BLANKS IN THE DESIGNER (owner, 2026-11-26: "I just want the blank
 * templates in the designer for viewing and designing").
 *
 * One Gooten product becomes ONE designer product, tagged supplier='gooten',
 * active=0: off the shop and the quote form, opened by its link. The designer
 * lets it be designed on and refuses it at cart and checkout (designer #278);
 * Gooten orders still go through the job page's Send to Gooten button.
 *
 * What comes from Gooten (GET producttemplates, checked against a live answer
 * 2026-11-26): per SKU a template whose every print space is a canvas
 * (Design layers, e.g. 3660 x 1200) with the blank picture under the art
 * (BackgroundImageUrl), pictures over it (OverlayImageUrl: a colour rim, and
 * a grey MASK that hides everything outside the print area), and one Image
 * layer with IncludeInPrint = where the art goes.
 *
 * The designer shows ONE picture per side, under the art. So it gets the
 * blank with the colour overlays flattened on (Cloudinary does it on upload),
 * never the mask (it would grey the print area), and the Image layer's box as
 * the print box.
 *
 * SKUs differ by colour (the same canvas, another rim) and by size or shape
 * (another canvas). Colour is left out: one SKU per size/shape, up to
 * MAX_TEMPLATES, and SKUs whose canvases come out the same are one choice. */

const crypto = require('crypto');
const { enjson, sq } = require('./db');

const SUPPLIER = 'gooten';
const MAX_TEMPLATES = 12;
const PRODUCT_WIDTH = 500;
/* Option names that only change colour or how it is printed, not the canvas. */
const COSMETIC = /colou?r|decoration technique|underbase|accent/i;

/** "Name: Value, Name: Value" (gooten.js variantRows) -> [[name, value]]. */
function optionPairs(options) {
  return String(options || '').split(', ').map((p) => { const i = p.indexOf(': '); return i > 0 ? [p.slice(0, i), p.slice(i + 2)] : null; }).filter(Boolean);
}

/** One SKU per canvas-changing option set: [{ key, label, sku }], label made of
 *  only the options that differ between groups, sorted by name. Plain white wins
 *  as the colour shown, when there is one. */
function pickSkus(rows, max = MAX_TEMPLATES) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!r || !r.sku) continue;
    const shape = optionPairs(r.options).filter(([n]) => !COSMETIC.test(n)).sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify(shape);
    /* Plain white shows the blank best; "White With Black Accents" is not it. */
    const white = optionPairs(r.options).some(([n, v]) => /colou?r/i.test(n) && /^\s*white\s*$/i.test(v));
    const g = groups.get(key);
    if (!g) groups.set(key, { key, shape, sku: r.sku, white });
    else if (white && !g.white) Object.assign(g, { sku: r.sku, white });
  }
  const list = [...groups.values()];
  const names = new Set(list.flatMap((g) => g.shape.map(([n]) => n)));
  const varies = [...names].filter((n) => new Set(list.map((g) => (g.shape.find(([m]) => m === n) || [])[1] || '')).size > 1);
  return {
    total: list.length,
    picked: list.slice(0, max).map((g) => ({
      key: g.key, sku: g.sku,
      label: (varies.length ? g.shape.filter(([n]) => varies.includes(n)) : g.shape).map(([n, v]) => (varies.length === 1 ? v : `${n}: ${v}`)).join(', ').slice(0, 80) || 'Standard',
    })),
  };
}

/** The template's sides that can be designed: [{ name, W, H, bg, overlays, print }],
 *  from gooten.js templateOptions(). A side with no blank picture or no print
 *  box is left out, never guessed. */
function sidesOf(options) {
  const o = (options || []).find((x) => x.isDefault) || (options || [])[0];
  if (!o) return [];
  return o.spaces.map((sp) => {
    const byZ = [...sp.layers].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    const design = byZ.filter((l) => /design/i.test(l.type) && l.box);
    const canvas = design.find((l) => l.bg) || design[0];
    const print = byZ.find((l) => /image/i.test(l.type) && l.print && l.box);
    if (!canvas || !canvas.bg || !print) return null;
    const W = canvas.box.x2 - canvas.box.x1, H = canvas.box.y2 - canvas.box.y1;
    const overlays = byZ.filter((l) => l !== canvas && l.overlay && !/mask/i.test(l.overlay) && (l.z ?? 0) > (print.z ?? 0)).map((l) => l.overlay);
    const p = { x1: print.box.x1 - canvas.box.x1, y1: print.box.y1 - canvas.box.y1, x2: print.box.x2 - canvas.box.x1, y2: print.box.y2 - canvas.box.y1 };
    return { name: sp.name || sp.id || 'Front', W, H, bg: canvas.bg, overlays, print: p };
  }).filter(Boolean);
}

/** Same canvas, same pictures, same box: the same designer choice. */
const sideKey = (sides) => JSON.stringify(sides.map((s) => [s.W, s.H, s.bg, s.overlays, s.print]));

const r1 = (n) => Math.round(n * 10) / 10;
/** A designer stage for one side, its picture at `image`. Lumise's edit zone
 *  is in display pixels, measured from the picture's centre. */
function stageOf(side, image) {
  const u = side.W / PRODUCT_WIDTH;
  const { x1, y1, x2, y2 } = side.print;
  return {
    label: side.name, source: 'uploads', overlay: false, url: String(image).split('/').pop(), image,
    edit_zone: { width: r1((x2 - x1) / u), height: r1((y2 - y1) / u), left: r1(((x1 + x2) / 2 - side.W / 2) / u), top: r1(((y1 + y2) / 2 - side.H / 2) / u), radius: '0' },
    product_width: PRODUCT_WIDTH, product_height: r1(side.H / u), template: {},
  };
}

/** Stage keys: front, back, then side2, side3... (designs are saved by key). */
function stagesOf(sides, images) {
  const st = {};
  sides.forEach((s, i) => { st[i === 0 ? 'front' : i === 1 ? 'back' : `side${i + 1}`] = stageOf(s, images[i]); });
  return st;
}

/** The product's columns. `choices` = [{ label, stages }] (one per distinct
 *  canvas). Two or more become a "Template" option whose variations swap the
 *  stages; colour and price stay out of it (preview only, nothing is sold). */
function productColumns({ name, choices }) {
  if (!choices.length) throw new Error('no usable template');
  const attributes = {};
  let variations = '';
  if (choices.length > 1) {
    attributes.GTPL = { id: 'GTPL', name: 'Template', type: 'select', required: true, use_variation: false,
      values: { options: choices.map((c, i) => ({ value: `t${i + 1}`, title: c.label, price: '', default: i === 0 })) } };
    const vs = {};
    choices.forEach((c, i) => {
      vs[String(i + 1)] = { id: String(i + 1), conditions: { GTPL: `t${i + 1}` }, price: '', sku: '', minqty: '', maxqty: '', description: '',
        cfgstages: true, cfgprinting: false, stages: c.stages, printings: null };
    });
    variations = enjson({ default: { GTPL: 't1' }, attrs: ['GTPL'], variations: vs });
  }
  return { name: `${name} (Gooten blank)`.slice(0, 200), stages: enjson(choices[0].stages), attributes: enjson(attributes), variations };
}

/** Insert or update by Gooten product id. Never touches any other supplier's row. */
function upsertSql(gootenId, cols, { thumb, description, author }) {
  const id = Number(gootenId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('bad Gooten product id');
  const set = `name=${sq(cols.name)}, description=${sq(description)}, stages=${sq(cols.stages)}, attributes=${sq(cols.attributes)}, ` +
    `variations=${sq(cols.variations)}, thumbnail_url=${sq(thumb)}, updated=NOW()`;
  return [
    `UPDATE lumise_products SET ${set} WHERE supplier=${sq(SUPPLIER)} AND supplier_style_id=${id};`,
    'INSERT INTO lumise_products (name, price, product, thumbnail, thumbnail_url, template, description, stages, variations, attributes, printings, ' +
      '`order`, active, author, created, updated, supplier, supplier_style_id, supplier_cost) ' +
      `SELECT ${sq(cols.name)}, 0, 0, '', ${sq(thumb)}, '', ${sq(description)}, ${sq(cols.stages)}, ${sq(cols.variations)}, ${sq(cols.attributes)}, '', ` +
      `990, 0, ${sq(author)}, NOW(), NOW(), ${sq(SUPPLIER)}, ${id}, 0 FROM DUAL ` +
      `WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_products WHERE supplier=${sq(SUPPLIER)} AND supplier_style_id=${id}) AS t);`,
  ].join('\n');
}

/** A stable Cloudinary name for one flattened picture: the same Gooten
 *  pictures always give the same name, so a re-run reuses the upload. */
function pictureId(gootenId, bg, overlays) {
  return `gooten-blanks/${Number(gootenId)}-${crypto.createHash('sha256').update(JSON.stringify([bg, overlays])).digest('hex').slice(0, 20)}`;
}

/* Cloudinary is asked to fetch only Gooten's own picture hosts (seen live:
   az412349.cdn.gooten.com), never an address an answer could point anywhere. */
function gootenPicture(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && (/(^|\.)gooten\.com$/i.test(x.hostname) || /^gtnadminassets\.blob\.core\.windows\.net$/i.test(x.hostname));
  } catch { return false; }
}

/** Where the blanks go: Cloudinary for pictures, the designer's MySQL for the
 *  product. `cloudinary` is the configured v2 SDK, `mysql(url, sql, opts)` and
 *  `url` from db.js. Both injected, so tests use fakes. */
function designerStore({ cloudinary, mysql, url, cloudReady }) {
  const ready = () => !!(url && cloudReady && mysql && cloudinary);
  /** The flattened picture's address (shown at most 1600px wide). */
  async function picture(publicId, bg, overlays = []) {
    for (const u of [bg, ...overlays]) if (!gootenPicture(u)) throw new Error('a template picture is not on a Gooten host');
    const layers = [];
    for (let i = 0; i < overlays.length; i++) {
      const o = await cloudinary.uploader.upload(overlays[i], { public_id: `${publicId}-o${i + 1}`, overwrite: false, resource_type: 'image' });
      layers.push({ overlay: String(o.public_id).replace(/\//g, ':') }, { flags: 'layer_apply' });
    }
    const r = await cloudinary.uploader.upload(bg, { public_id: publicId, overwrite: false, resource_type: 'image',
      ...(layers.length ? { transformation: layers } : {}) });
    const out = String(r && r.secure_url || '');
    if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(out)) throw new Error('Cloudinary gave no picture address');
    return out.replace('/image/upload/', '/image/upload/c_limit,w_1600/');
  }
  /** Writes the product, then reads its id back: the write is proven, not assumed. */
  function save(gootenId, cols, { thumb, description }) {
    const a = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0];
    if (!a) throw new Error('no designer product to take the author from');
    mysql(url, upsertSql(gootenId, cols, { thumb, description, author: a.author }));
    const got = mysql(url, `SELECT id, name FROM lumise_products WHERE supplier=${sq(SUPPLIER)} AND supplier_style_id=${Number(gootenId)};`, { rows: true });
    if (got.length !== 1 || got[0].name !== cols.name) throw new Error('the designer product could not be confirmed');
    return Number(got[0].id);
  }
  return { ready, picture, save };
}

module.exports = { gootenPicture, designerStore, SUPPLIER, MAX_TEMPLATES, PRODUCT_WIDTH, optionPairs, pickSkus, sidesOf, sideKey, stageOf, stagesOf, productColumns, upsertSql, pictureId };
