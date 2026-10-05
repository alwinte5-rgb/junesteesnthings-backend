'use strict';

/* Proofs: the mockup a customer approves before anything is printed.
 *
 * A helper (or the owner) uploads it from the job page straight to Cloudinary,
 * signed by /admin/api/proof-signature into one fixed folder, and this server
 * keeps only the URL that comes back. That URL is then put in a message to the
 * customer, so it is checked to be OUR account, in THAT folder, and a picture
 * or a PDF a customer can open on a phone: never a file to download and run. */

const FOLDER = 'job_proofs';
const MAX_PER_JOB = 40;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf';
const EXTS = ['jpg', 'jpeg', 'png', 'webp', 'pdf'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** { ext } for a proof URL this shop's Cloudinary holds, or null. */
function parse(url, cloud) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/image/upload/(?:v\\d+/)?' + FOLDER + '/[A-Za-z0-9_-]{1,120}\\.([A-Za-z0-9]{2,5})$').exec(url);
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return EXTS.includes(ext) ? { ext } : null;
}

function proofUrlOk(url, cloud) { return !!parse(url, cloud); }

/** The file's name, made safe to store and show. */
function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120);
}

/** A small picture of the proof (a PDF shows its first page). */
function thumbOf(url, cloud) {
  const p = parse(url, cloud);
  if (!p) return '';
  const t = url.replace('/image/upload/', `/image/upload/c_fit,w_240,h_240,q_auto${p.ext === 'pdf' ? ',pg_1' : ',f_auto'}/`);
  return p.ext === 'pdf' ? t.replace(/\.pdf$/i, '.jpg') : t;
}

/** The text that goes to the customer with the proof link. */
function proofMessage({ first = '', code, url }) {
  const hi = `Hi${first ? ' ' + first : ''}`;
  return `${hi}! Your proof for order ${code} is ready, and we're excited for you to see it: ${url}\n\n` +
    'Take a look at the spelling, colors, size and placement. Reply "approved" and we\'ll get it printing, or just tell us what you\'d like changed.';
}

module.exports = { FOLDER, MAX_PER_JOB, MAX_FILE_BYTES, ACCEPT, proofUrlOk, cleanName, thumbOf, proofMessage };
