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

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What Cloudinary needs to hand back one of OUR files in one of `folders`:
 *  { url, type: 'image'|'raw', publicId, format }, or null for anything else
 *  (another account, another folder, a URL that is not a plain upload). */
function sourceOf(url, cloud, folders) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?(' + folders.map(esc).join('|') + ')/([A-Za-z0-9_-]{1,120})\\.([A-Za-z0-9]{2,5})$').exec(url);
  if (!m) return null;
  const [, type, folder, id, ext] = m;
  /* Images are named without their extension, raw files with it. */
  return { url, type, format: ext.toLowerCase(), publicId: `${folder}/${id}${type === 'raw' ? '.' + ext : ''}` };
}

/** A file name that is safe to store and show. */
function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f<>/\\]/g, '').trim().slice(0, 120);
}

/**
 * The files to carry from an enquiry onto its quote.
 * @param lead   the submissions row (photo_url)
 * @param texts  media lists of the texts they sent before there was a job,
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
    out.push({ ...src, name: cleanName(name) || `Enquiry file.${src.format}` });
  };
  const photo = lead && sourceOf(lead.photo_url, cloud, LEAD_FOLDERS);
  if (photo) add(photo, `Photo sent with the enquiry.${photo.format}`);
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

module.exports = { LEAD_FOLDERS, TEXT_FOLDER, MAX_FILES, sourceOf, leadFiles, samePerson };
