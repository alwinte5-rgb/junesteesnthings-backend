'use strict';

/* Pictures and files sent by text (MMS), 2026-10-06: a customer sent a photo
 * and the shop got an empty forward. Twilio's webhook carries NumMedia and
 * MediaUrl0..N / MediaContentType0..N; the files live on Twilio behind the
 * account's credentials, so the server fetches them and keeps a copy on the
 * shop's Cloudinary, where the job page, emails and picture texts can use it.
 * Pure helpers here; the fetching and uploading are in server.js. */

const MAX_MEDIA = 10;
const MAX_BYTES = 10 * 1024 * 1024; // the Cloudinary plan's limit per file

const EXT = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'video/3gpp': '3gp', 'text/vcard': 'vcf', 'text/x-vcard': 'vcf',
};

/** The media a webhook body lists, only from Twilio's own API host. */
function mediaOf(body) {
  const b = body && typeof body === 'object' ? body : {};
  const n = Math.min(parseInt(b.NumMedia, 10) || 0, MAX_MEDIA);
  const out = [];
  for (let i = 0; i < n; i++) {
    const url = String(b['MediaUrl' + i] || '');
    let u;
    try { u = new URL(url); } catch { continue; }
    if (u.protocol !== 'https:' || u.hostname !== 'api.twilio.com') continue;
    const type = String(b['MediaContentType' + i] || '').toLowerCase().split(';')[0].trim();
    out.push({ url: u.href, type, ext: EXT[type] || 'bin' });
  }
  return out;
}

/** Whether Cloudinary should keep it as a picture (shown on the page and sent
 *  on as a picture text) or as a plain file. */
function isPicture(type) {
  return /^image\/(jpe?g|png|gif|webp|heic|heif)$/.test(type);
}

/** A file name for the job's list: "Text photo 2026-10-06 1.jpg". */
function nameFor(i, ext, day) {
  return `Text ${/^(jpg|png|gif|webp|heic|heif)$/.test(ext) ? 'photo' : 'file'} ${day} ${i + 1}.${ext}`;
}

/** A picture's https address resized for a phone or an email, or ''. */
function smallUrl(url) {
  return /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(url)
    ? url.replace('/image/upload/', '/image/upload/c_limit,w_1200,q_auto,f_jpg/').replace(/\.[A-Za-z0-9]+$/, '.jpg') : '';
}

module.exports = { MAX_MEDIA, MAX_BYTES, mediaOf, isPicture, nameFor, smallUrl };
