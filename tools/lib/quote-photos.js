'use strict';

/* Artwork a customer sends from their quote page: photos, logos, vector files,
 * embroidery stitch files, the faces for big head cutouts.
 *
 * The file goes from the browser straight to Cloudinary, signed by
 * /api/cloudinary-signature into one fixed folder, and this server only keeps
 * the URL that comes back (with the name the customer gave the file). So the
 * URL is the one thing the browser hands us, and it is checked to be OUR
 * account, in THAT folder, of a type the shop takes: anything else would let a
 * quote page show, and the job page hand the shop, a file nobody here received.
 *
 * The types are the admin quote form's artwork list (server.js, the `.fi`
 * input), so a customer can send anything the shop can attach itself. */

const FOLDER = 'quote_photos';
/* A team's worth of faces fits; the bound is what stops a quote code from
   being used as somebody's file host. */
const MAX_PHOTOS = 30;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/* What the file picker offers. Kept beside the server-side list below so the
   two cannot drift: the page reads this one. */
const ACCEPT = 'image/*,.pdf,.ai,.eps,.svg,.psd,.dst,.emb,.exp,.pes,.zip';

/* Cloudinary's auto upload decides image vs raw from the bytes, so each type
   can arrive under either. `web` is what a browser shows as-is; `paged` is
   rendered by Cloudinary as a picture of its first page. */
const WEB = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'];
const CONVERT = ['heic', 'heif', 'tif', 'tiff', 'bmp', 'psd', 'svg'];
const PAGED = ['pdf', 'ai', 'eps'];
const FILE_ONLY = ['dst', 'emb', 'exp', 'pes', 'zip'];
const ALL = [...WEB, ...CONVERT, ...PAGED, ...FILE_ONLY];

/** The cloud name a URL has to carry, or '' when Cloudinary is not set up. */
function cloudName(env = process.env) {
  return String(env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_NAME || '').trim();
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function parse(url, cloud) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?' + FOLDER + '/[A-Za-z0-9_-]{1,120}\\.([A-Za-z0-9]{2,5})$').exec(url);
  if (!m) return null;
  const ext = m[2].toLowerCase();
  return ALL.includes(ext) ? { type: m[1], ext } : null;
}

/** Whether `url` is a file this shop's Cloudinary holds in the quote folder. */
function photoUrlOk(url, cloud) { return !!parse(url, cloud); }

/** The name the customer's file had, made safe to store and show. */
function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120);
}

/** How to show one file: a picture or a named file, and where each link goes. */
function describe(url, cloud, name = '') {
  const p = parse(url, cloud);
  if (!p) return null;
  const label = cleanName(name) || url.split('/').pop();
  if (p.type === 'raw' || FILE_ONLY.includes(p.ext)) return { url, kind: 'file', ext: p.ext, name: label, thumb: '', view: url };
  const tr = ['c_fill', 'w_160', 'h_160', 'q_auto', WEB.includes(p.ext) ? 'f_auto' : PAGED.includes(p.ext) ? 'pg_1' : '']
    .filter(Boolean).join(',');
  let thumb = url.replace('/image/upload/', `/image/upload/${tr}/`);
  if (!WEB.includes(p.ext)) thumb = thumb.replace(/\.[A-Za-z0-9]+$/, '.jpg');
  /* A PDF or a vector opens as itself; a HEIC or a PSD opens as a picture the
     browser can show, and the job page links the original beside it. */
  const view = PAGED.includes(p.ext) ? url
    : WEB.includes(p.ext) ? url.replace('/image/upload/', '/image/upload/f_auto,q_auto/')
    : url.replace('/image/upload/', '/image/upload/q_auto/').replace(/\.[A-Za-z0-9]+$/, '.jpg');
  return { url, kind: 'image', ext: p.ext, name: label, thumb, view };
}

/** The files on a quote, oldest first, dropping anything malformed. */
function photosOf(q, cloud) {
  const raw = Array.isArray(q && q.customer_photos) ? q.customer_photos : [];
  return raw.filter((p) => p && photoUrlOk(p.url, cloud))
    .map((p) => ({ ...p, ...describe(p.url, cloud, p.name) }));
}

module.exports = { FOLDER, MAX_PHOTOS, MAX_FILE_BYTES, ACCEPT, cloudName, photoUrlOk, cleanName, describe, photosOf };
