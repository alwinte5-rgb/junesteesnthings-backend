'use strict';

/* A Business Partner's brand files: the logos and artwork they upload once on
 * their account, which the shop then sees on every job and reorder for that
 * business, so nobody has to send the same logo twice.
 *
 * Same shape as quote photos (tools/lib/quote-photos.js): the browser uploads
 * straight to Cloudinary, signed into ONE folder, and only the URL that comes
 * back is kept, after checking it is our account, that folder, and a file type
 * the shop takes. The business lives on the designer; its id is the key here. */

const QPHOTOS = require('./quote-photos');

const FOLDER = 'business_files';
const MAX_PER_BUSINESS = 30;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function fileUrlOk(url, cloud) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return false;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?' + FOLDER + '/[A-Za-z0-9_-]{1,120}\\.([A-Za-z0-9]{2,5})$').exec(url);
  return !!m && QPHOTOS.EXTENSIONS.includes(m[2].toLowerCase());
}

/** A small picture of the file: images and PDF/AI/EPS (first page) through
 *  Cloudinary; '' for files it cannot draw (embroidery, zip), which the page
 *  shows by name. */
function thumbOf(url, cloud) {
  if (!fileUrlOk(url, cloud) || !/\/image\/upload\//.test(url)) return '';
  const ext = url.split('.').pop().toLowerCase();
  if (['dst', 'emb', 'exp', 'pes', 'zip'].includes(ext)) return '';
  const paged = ['pdf', 'ai', 'eps'].includes(ext);
  return url.replace('/image/upload/', `/image/upload/c_fit,w_240,h_240,q_auto${paged ? ',pg_1' : ',f_auto'}/`)
    .replace(/\.[A-Za-z0-9]+$/, '.jpg');
}

/** A file name to show, from what the customer's computer called it. */
function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f<>"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

module.exports = { FOLDER, MAX_PER_BUSINESS, ACCEPT: QPHOTOS.ACCEPT, MAX_FILE_BYTES: QPHOTOS.MAX_FILE_BYTES, fileUrlOk, thumbOf, cleanName };
