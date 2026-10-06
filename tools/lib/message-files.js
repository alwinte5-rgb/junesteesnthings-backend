'use strict';

/* Files attached to an email from the job page (the owner, 2026-10-06: "send
 * an email to the customer but add her artwork to it ... all communication
 * tracked through here").
 *
 * An attachment is one of three things, and nothing else:
 *   - a file uploaded for the message, signed into FOLDER;
 *   - one of the customer's own artwork files on the job (quote_photos);
 *   - one of the designer's final files on the job (job_art).
 * Each is a URL on THIS shop's Cloudinary in one of those folders, so a posted
 * URL can never make the server fetch, or a customer receive, anything else.
 *
 * The bytes are fetched through Cloudinary's signed download API (the plain
 * delivery URL is refused for PDFs and ZIPs on this account) and attached, so
 * the customer gets the real file, not a link that may not open. */

const FOLDER = 'job_messages';
const FOLDERS = [FOLDER, 'quote_photos', 'job_art'];
const ACCEPT = 'image/*,.pdf,.ai,.eps,.svg,.psd,.tif,.tiff,.zip,.dst,.pes';
const EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf', 'ai', 'eps', 'svg', 'psd', 'tif', 'tiff', 'zip', 'dst', 'pes', 'emb', 'exp'];
const MAX_FILES = 10;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
/* What one email may carry in all. Brevo takes 4 MB a file; above that the
   email goes by Resend, which takes far more (sendEmail decides). */
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const BREVO_FILE_BYTES = 3.5 * 1024 * 1024;
const BREVO_TOTAL_BYTES = 15 * 1024 * 1024;
const PREVIEW = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a file lives, or null if it is not ours / not in an allowed folder. */
function parse(url, cloud) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?((' + FOLDERS.join('|') + ')/[A-Za-z0-9_-]{1,120}\\.([A-Za-z0-9]{2,5}))$').exec(url);
  if (!m) return null;
  const ext = m[4].toLowerCase();
  if (!EXTS.includes(ext)) return null;
  const file = m[2];
  return {
    folder: m[3], ext,
    resourceType: m[1],
    publicId: m[1] === 'raw' ? file : file.replace(/\.[A-Za-z0-9]+$/, ''),
    format: m[1] === 'raw' ? '' : ext,
  };
}

function cleanName(name, ext) {
  let n = String(name || '').replace(/[\u0000-\u001f\u007f<>\\/:*?"|]/g, '_').trim().slice(0, 120) || 'file';
  if (ext && !n.toLowerCase().endsWith('.' + ext)) n += '.' + ext;
  return n;
}

/**
 * The attachments a form posted, checked. `posted` is the JSON the page sends:
 * [{url, name}]. `jobFiles` are the files already on the job ({url, name}).
 * Returns { files: [{url, name, ext, src}], error }.
 */
function pickAttachments(posted, jobFiles, cloud) {
  let list;
  try { list = JSON.parse(String(posted || '[]')); } catch { return { files: [], error: 'bad' }; }
  if (!Array.isArray(list)) return { files: [], error: 'bad' };
  if (list.length > MAX_FILES) return { files: [], error: 'too-many' };
  const onJob = new Map((jobFiles || []).map((f) => [f.url, f]));
  const seen = new Set();
  const files = [];
  for (const it of list) {
    const url = String((it && it.url) || '');
    if (seen.has(url)) continue;
    seen.add(url);
    const src = parse(url, cloud);
    if (!src) return { files: [], error: 'bad' };
    /* A customer's or designer's file only if it is on THIS job; an upload
       only from the message folder. */
    if (src.folder !== FOLDER && !onJob.has(url)) return { files: [], error: 'bad' };
    const name = cleanName(onJob.has(url) ? onJob.get(url).name : it.name, src.ext);
    files.push({ url, name, ext: src.ext, src });
  }
  return { files, error: null };
}

/** Whether Brevo can carry these sizes, or the email must go by Resend. */
function fitsBrevo(sizes) {
  return sizes.every((n) => n <= BREVO_FILE_BYTES) && sizes.reduce((a, n) => a + n, 0) <= BREVO_TOTAL_BYTES;
}

/** A picture of an image attachment for the email body, or ''. Delivered by
 *  Cloudinary resized; image formats are not subject to the PDF/ZIP refusal. */
function previewUrl(url, ext) {
  if (!PREVIEW.includes(ext) || !String(url).includes('/image/upload/')) return '';
  return url.replace('/image/upload/', '/image/upload/c_limit,w_600,q_auto,f_jpg/').replace(/\.[A-Za-z0-9]+$/, '.jpg');
}

module.exports = { FOLDER, FOLDERS, ACCEPT, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, parse, cleanName,
  pickAttachments, fitsBrevo, previewUrl };
