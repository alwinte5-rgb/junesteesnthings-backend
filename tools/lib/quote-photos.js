'use strict';

/* Photos a customer sends from their quote page: the faces for big head
 * cutouts, a logo, a picture of the shirt they mean.
 *
 * The file goes from the browser straight to Cloudinary, signed by
 * /api/cloudinary-signature into one fixed folder, and this server only keeps
 * the URL that comes back. So the URL is the one thing the browser hands us,
 * and it is checked to be OUR account, an image, in THAT folder: anything else
 * would let a quote page show, and the job page hand the shop, a file nobody
 * here received. */

const FOLDER = 'quote_photos';
/* A team's worth of faces fits; the bound is what stops a quote code from
   being used as somebody's photo host. */
const MAX_PHOTOS = 30;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** The cloud name a URL has to carry, or '' when Cloudinary is not set up. */
function cloudName(env = process.env) {
  return String(env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_NAME || '').trim();
}

/** Whether `url` is an image this shop's Cloudinary holds in the quote folder. */
function photoUrlOk(url, cloud) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return false;
  const esc = cloud.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^https://res\\.cloudinary\\.com/' + esc +
    '/image/upload/(?:v\\d+/)?' + FOLDER + '/[A-Za-z0-9_-]{1,120}\\.(?:jpe?g|png|webp|heic|heif|gif|avif|pdf)$', 'i');
  return re.test(url);
}

/** The photos on a quote, oldest first, dropping anything malformed. */
function photosOf(q, cloud) {
  const raw = Array.isArray(q && q.customer_photos) ? q.customer_photos : [];
  return raw.filter((p) => p && photoUrlOk(p.url, cloud));
}

const isPdf = (url) => /\.pdf$/i.test(url);

/** A square thumbnail, converted to a format every browser shows (HEIC is not).
 *  A PDF is drawn from its first page: Cloudinary renders it when asked for a
 *  .jpg of the same file. */
function thumbUrl(url, px = 160) {
  const t = url.replace('/image/upload/', `/image/upload/c_fill,w_${px},h_${px},q_auto,${isPdf(url) ? 'pg_1' : 'f_auto'}/`);
  return isPdf(url) ? t.replace(/\.pdf$/i, '.jpg') : t;
}

/** The full file in a viewable format, for the link that opens it. A PDF opens
 *  as itself. */
function viewUrl(url) {
  return isPdf(url) ? url : url.replace('/image/upload/', '/image/upload/f_auto,q_auto/');
}

module.exports = { isPdf, FOLDER, MAX_PHOTOS, MAX_FILE_BYTES, cloudName, photoUrlOk, photosOf, thumbUrl, viewUrl };
