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
const FALLBACKS = 2;
const PRODUCT_WIDTH = 500;
/* Option names that only change colour or how it is printed, not the canvas. */
/* A mask is told by its own folder or file name, never the product's folder
   (product-facemasks/ would make every overlay a "mask"). */
const isMask = (u) => { try { const parts = new URL(u).pathname.split('/'); const file = parts.pop() || '';
  return parts.some((d) => /^masks?$/i.test(d)) || /mask|clip/i.test(file); } catch { return true; } };
const COSMETIC = /colou?r|decoration technique|underbase|accent/i;

/** "Name: Value, Name: Value" (gooten.js variantRows) -> [[name, value]]. */
function optionPairs(options) {
  /* Split only where the next "Name: " starts: a value may hold a comma. */
  return String(options || '').split(/, (?=[^,:]{1,40}: )/).map((p) => { const i = p.indexOf(': '); return i > 0 ? [p.slice(0, i), p.slice(i + 2)] : null; }).filter(Boolean);
}

/** One group per canvas-changing option set: [{ key, label, skus }], label made
 *  of only the options that differ between groups. `skus` is that group's SKUs
 *  to try in turn (plain white first, then up to FALLBACKS more): one colour
 *  whose template cannot be read must not lose the whole size. */
function pickSkus(rows, max = MAX_TEMPLATES) {
  const groups = new Map();
  for (const r of rows || []) {
    if (!r || !r.sku) continue;
    const shape = optionPairs(r.options).filter(([n]) => !COSMETIC.test(n)).sort(([a], [b]) => a.localeCompare(b));
    const key = JSON.stringify(shape);
    /* Plain white shows the blank best; "White With Black Accents" is not it. */
    const white = optionPairs(r.options).some(([n, v]) => /colou?r/i.test(n) && /^\s*white\s*$/i.test(v));
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, shape, white: [], other: [] }));
    (white ? g.white : g.other).push(r.sku);
  }
  const list = [...groups.values()];
  const names = new Set(list.flatMap((g) => g.shape.map(([n]) => n)));
  const varies = [...names].filter((n) => new Set(list.map((g) => (g.shape.find(([m]) => m === n) || [])[1] || '')).size > 1);
  return {
    total: list.length,
    picked: list.slice(0, max).map((g) => ({
      key: g.key, skus: [...g.white, ...g.other].slice(0, 1 + FALLBACKS), sku: [...g.white, ...g.other][0],
      label: (varies.length ? g.shape.filter(([n]) => varies.includes(n)) : g.shape).map(([n, v]) => (varies.length === 1 ? v : `${n}: ${v}`)).join(', ').slice(0, 80) || 'Standard',
    })),
  };
}

/** The template's sides that can be designed: [{ name, W, H, bg, overlays: [{ url, box }], print }],
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
    const rel = (b) => ({ x1: b.x1 - canvas.box.x1, y1: b.y1 - canvas.box.y1, x2: b.x2 - canvas.box.x1, y2: b.y2 - canvas.box.y1 });
    /* Each overlay keeps its own box: it is placed there, scaled, never centred
       at whatever size its file happens to be. A mask (Gooten keeps them in a
       Masks folder; "mask"/"clip" in the name) would grey the print area. */
    const overlays = byZ.filter((l) => l !== canvas && l.overlay && l.box && !isMask(l.overlay) && (l.z ?? 0) > (print.z ?? 0))
      .map((l) => ({ url: l.overlay, box: rel(l.box) }));
    const p = rel(print.box);
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

/** Stage keys by position: front, back, then side3, side4... (designs are
 *  saved by key; Lumise takes any key, e.g. #14's random ids). */
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
  /* Cut by characters, not UTF-16 units: half an emoji is not storable. */
  return { name: Array.from(`${name} (Gooten blank)`).slice(0, 200).join(''), stages: enjson(choices[0].stages), attributes: enjson(attributes), variations };
}

/** Insert or update by Gooten product id, in one transaction under a named
 *  lock for that product, so two adds at once make one row. Never touches any
 *  other supplier's row. `keepName`: an update leaves the name alone (the
 *  catalog that names it could not be read). */
function upsertSql(gootenId, cols, { thumb, description, author, keepName = false }) {
  const id = Number(gootenId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('bad Gooten product id');
  const set = `${keepName ? '' : `name=${sq(cols.name)}, `}description=${sq(description)}, stages=${sq(cols.stages)}, attributes=${sq(cols.attributes)}, ` +
    `variations=${sq(cols.variations)}, thumbnail_url=${sq(thumb)}, updated=NOW()`;
  return [
    /* A named lock per Gooten product serializes two adds across processes
       (gap locks from SELECT ... FOR UPDATE on a missing row deadlock instead).
       If it cannot be had in 20s, the subquery error aborts the batch before
       anything is written. */
    `DO IF(GET_LOCK('jt-gooten-blank-${id}', 20) = 1, 0, (SELECT 1 UNION ALL SELECT 2));`,
    'START TRANSACTION;',
    `UPDATE lumise_products SET ${set} WHERE supplier=${sq(SUPPLIER)} AND supplier_style_id=${id};`,
    'INSERT INTO lumise_products (name, price, product, thumbnail, thumbnail_url, template, description, stages, variations, attributes, printings, ' +
      '`order`, active, author, created, updated, supplier, supplier_style_id, supplier_cost) ' +
      `SELECT ${sq(cols.name)}, 0, 0, '', ${sq(thumb)}, '', ${sq(description)}, ${sq(cols.stages)}, ${sq(cols.variations)}, ${sq(cols.attributes)}, '', ` +
      `990, 0, ${sq(author)}, NOW(), NOW(), ${sq(SUPPLIER)}, ${id}, 0 FROM DUAL ` +
      `WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_products WHERE supplier=${sq(SUPPLIER)} AND supplier_style_id=${id}) AS t);`,
    'COMMIT;',
    `DO RELEASE_LOCK('jt-gooten-blank-${id}');`,
  ].join('\n');
}

/** A stable Cloudinary name for one flattened picture: the same Gooten
 *  pictures always give the same name, so a re-run reuses the upload. */
function pictureId(gootenId, bg, overlays = []) {
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
function designerStore({ cloudinary, mysql, url, cloudReady, client = true }) {
  /* `client`: the mysql binary exists (db.js MYSQL). Without it every add would
     upload its pictures and then fail; it is refused before any upload. */
  const ready = () => !!(url && cloudReady && mysql && cloudinary && client);
  /** The flattened picture's address (shown at most 1600px wide). `side` is a
   *  sidesOf() side: the blank, its canvas size W x H, and overlays with boxes
   *  on that canvas. The blank is uploaded plain first, to learn its real pixel
   *  size; each overlay is then scaled into its box at that size. */
  async function picture(publicId, side) {
    const { bg, overlays = [], W } = side;
    for (const u of [bg, ...overlays.map((o) => o.url)]) if (!gootenPicture(u)) throw new Error('a template picture is not on a Gooten host');
    let r = await cloudinary.uploader.upload(bg, { public_id: `${publicId}-bg`, overwrite: false, resource_type: 'image' });
    if (overlays.length) {
      const k = Number(r && r.width) / W;
      if (!(k > 0)) throw new Error('Cloudinary gave no picture size');
      const ups = await Promise.all(overlays.map((ov, i) => cloudinary.uploader.upload(ov.url, { public_id: `${publicId}-o${i + 1}`, overwrite: false, resource_type: 'image' })));
      const layers = [];
      for (let i = 0; i < overlays.length; i++) {
        const o = ups[i];
        const b = overlays[i].box;
        layers.push({ overlay: String(o.public_id).replace(/\//g, ':'), width: Math.round((b.x2 - b.x1) * k), height: Math.round((b.y2 - b.y1) * k), crop: 'scale' },
          { flags: 'layer_apply', gravity: 'north_west', x: Math.round(b.x1 * k), y: Math.round(b.y1 * k) });
      }
      r = await cloudinary.uploader.upload(bg, { public_id: publicId, overwrite: false, resource_type: 'image', transformation: layers });
    }
    const out = String(r && r.secure_url || '');
    if (!/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(out)) throw new Error('Cloudinary gave no picture address');
    return out.replace('/image/upload/', '/image/upload/c_limit,w_1600/');
  }
  /** Writes the product, then reads it back: the write is proven by the
   *  stored print areas' fingerprint (stages is base64, so it reads back
   *  exactly; a name can come back escaped). `mysql` is db.js mysqlAsync: it
   *  never blocks the web server. An error after the write began carries
   *  `maybeWritten`, so the page never says "not written" when it may be. */
  async function save(gootenId, cols, { thumb, description, keepName = false }) {
    /* The designer's own vendor id, as its live products carry it. On this
       shop that is the EMPTY string (lib.php loads by author = vendor_id, and
       the staged S&S rows are written with ''), so '' is a real value; only
       SQL NULL is not. */
    /* The author MOST live products share (one odd row cannot decide it);
       NULL authors are not a value and are never counted. */
    const [a] = await mysql(url, 'SELECT author, COUNT(*) AS n FROM lumise_products WHERE active=1 AND author IS NOT NULL GROUP BY author ORDER BY n DESC LIMIT 1;', { rows: true });
    if (!a || typeof a.author !== 'string') throw new Error('no designer product to take the author from');
    try {
      await mysql(url, upsertSql(gootenId, cols, { thumb, description, author: a.author, keepName }));
      const got = await mysql(url, `SELECT id, MD5(stages) AS h FROM lumise_products WHERE supplier=${sq(SUPPLIER)} AND supplier_style_id=${Number(gootenId)} ORDER BY id;`, { rows: true });
      const want = crypto.createHash('md5').update(cols.stages).digest('hex');
      if (got.length !== 1 || got[0].h !== want) throw new Error(got.length > 1 ? 'more than one designer product has this Gooten id' : 'the designer product could not be confirmed');
      return Number(got[0].id);
    } catch (e) { e.maybeWritten = true; throw e; }
  }
  return { ready, picture, save };
}

module.exports = { gootenPicture, designerStore, SUPPLIER, MAX_TEMPLATES, FALLBACKS, isMask, PRODUCT_WIDTH, optionPairs, pickSkus, sidesOf, sideKey, stageOf, stagesOf, productColumns, upsertSql, pictureId };
