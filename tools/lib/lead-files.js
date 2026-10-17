'use strict';

/* A photo or file sent with an enquiry, carried onto the quote made from it
 * (owner, 2026-10-15: "a photo sent with a lead should carry into its quote
 * and into production").
 *
 * An enquiry's photo lands in the folder its form uploads to (the website
 * form, the embroidery form), and a picture texted before there was a job
 * lands in the message folder. A quote's customer files only count when they
 * sit in quote_photos (tools/lib/quote-photos.js checks the folder, so a
 * customer cannot point their quote at somebody else's file). So each one is
 * COPIED into quote_photos when the quote is made, and from then on it is an
 * ordinary customer file: on the quote, the job page, the production board,
 * the design page and the downloads.
 *
 * This file only decides which files and checks they are ours; server.js
 * fetches and uploads them (carryLeadFiles). */

/* Where enquiry uploads land: the signature route's folders for the website
   and embroidery forms, and the message folder for texted pictures. */
const LEAD_FOLDERS = ['quote_requests', 'embroidery_quotes'];
const TEXT_FOLDER = 'job_messages';
/* An enquiry with more than this is unusual; the rest stay on the lead. */
const MAX_FILES = 10;

const QPHOTOS = require('./quote-photos');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What Cloudinary needs to hand back one of OUR files in one of `folders`:
 *  { url, type: 'image'|'raw', publicId, format }, or null for anything else
 *  (another account, another folder, a URL that is not a plain upload, or a
 *  type the job's files cannot show, such as a video: copied, it would sit
 *  in quote_photos unseen and undeletable). `format` is what the signed
 *  download wants: '' for a raw file, whose id already ends in it, as in
 *  QPHOTOS.downloadSource. `ext` is the file's own extension. */
function sourceOf(url, cloud, folders) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?(' + folders.map(esc).join('|') + ')/([A-Za-z0-9_-]{1,120})\\.([A-Za-z0-9]{2,5})$').exec(url);
  if (!m) return null;
  const [, type, folder, id, extRaw] = m;
  const ext = extRaw.toLowerCase();
  if (!QPHOTOS.EXTENSIONS.includes(ext)) return null;
  /* Images are named without their extension, raw files with it. */
  return { url, type, ext, format: type === 'raw' ? '' : ext, publicId: `${folder}/${id}${type === 'raw' ? '.' + extRaw : ''}` };
}

/**
 * The files to carry from an enquiry onto its quote.
 * @param lead   the submissions row (photo_url)
 * @param texts  media lists of the texts they sent before there was a job
 *               (only when the lead's phone is the quote's: see samePhone),
 *               oldest first: [[{ url, name }], ...] (sms_messages.media)
 * @param cloud  this shop's Cloudinary cloud name
 * @returns [{ url, type, publicId, format, name }], at most MAX_FILES, no repeats
 */
function leadFiles({ lead, texts = [], cloud }) {
  const out = [];
  const seen = new Set();
  const add = (src, name) => {
    if (!src || seen.has(src.url) || out.length >= MAX_FILES) return;
    seen.add(src.url);
    out.push({ ...src, name: QPHOTOS.cleanName(name) || `Enquiry file.${src.ext}` });
  };
  const photo = lead && sourceOf(lead.photo_url, cloud, LEAD_FOLDERS);
  if (photo) add(photo, `Photo sent with the enquiry.${photo.ext}`);
  for (const list of texts) {
    for (const m of Array.isArray(list) ? list : []) add(m && sourceOf(m.url, cloud, [TEXT_FOLDER]), m && m.name);
  }
  return out;
}

/** Whether a lead and a quote are the same customer, by email or by the last
 *  ten digits of the phone. The files end up on the customer's own quote
 *  page, so a quote pointed at somebody else's lead must not get theirs. */
function samePerson(lead, quote) {
  const email = (x) => String((x && x.email) || '').trim().toLowerCase();
  const phone = (x) => String((x && x.phone) || '').replace(/\D/g, '').slice(-10);
  return Boolean((email(lead) && email(lead) === email(quote)) || (phone(lead).length === 10 && phone(lead) === phone(quote)));
}

/** The 10 digits both share, or '' — texts are matched by phone, so they
 *  only carry when the quote has the lead's own number (a lead matched on
 *  email alone may carry somebody else's phone). */
function samePhone(lead, quote) {
  const phone = (x) => String((x && x.phone) || '').replace(/\D/g, '').slice(-10);
  return phone(lead).length === 10 && phone(lead) === phone(quote) ? phone(lead) : '';
}

module.exports = { LEAD_FOLDERS, TEXT_FOLDER, MAX_FILES, sourceOf, leadFiles, samePerson, samePhone };
