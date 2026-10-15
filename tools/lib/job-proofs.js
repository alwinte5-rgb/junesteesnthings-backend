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

/** The text that goes to the customer with the proof links. The links come
    last, each on its own line, so a text can send them as pictures and drop
    them from the words without leaving a sentence hanging (owner, 2026-10-15:
    the 340-character proof message could never go by text). */
function proofMessage({ first = '', code, url, urls }) {
  const list = (urls || [url]).filter(Boolean);
  const hi = `Hi${first ? ' ' + first : ''}`;
  const many = list.length > 1;
  return `${hi}! Your ${many ? `${list.length} proofs` : 'proof'} for order ${code} ${many ? 'are' : 'is'} ready, and we're excited for you to see ${many ? 'them' : 'it'}. ` +
    'Take a look at the spelling, colors, size and placement. Reply "approved" and we\'ll get it printing, or just tell us what you\'d like changed.' +
    '\n\n' + list.join('\n');
}

/** The proof as a picture a phone can take by text (MMS): a PDF as its first
    page. 1200px at q_auto keeps a mockup near 200 KB, so even ten stay well
    under Twilio's 5 MB for the whole message. '' when it is not our proof. */
function mmsUrlOf(url, cloud) {
  const p = parse(url, cloud);
  if (!p) return '';
  return url.replace('/image/upload/', `/image/upload/c_limit,w_1200,h_1200,q_auto${p.ext === 'pdf' ? ',pg_1' : ''},f_jpg/`)
    .replace(/\.[A-Za-z0-9]+$/, '.jpg');
}

const MAX_MMS = 10; // Twilio's limit on pictures in one text

/** A text that carries this job's proof links: the links come out of the
    words and go as pictures instead, in the order the message lists them.
    `proofs` are the job's rows ({ url, name }). Returns { text, media }, each
    media { url: the proof itself (what the job page shows and opens), mms: the
    picture Twilio fetches, name }. A link not in `proofs` stays in the words. */
function proofsForText(text, proofs, cloud) {
  const original = String(text || '');
  let words = original;
  const found = [];
  for (const r of proofs || []) {
    if (!r || !r.url || !original.includes(r.url) || found.some((f) => f.url === r.url)) continue;
    const mms = mmsUrlOf(r.url, cloud);
    if (mms) found.push({ at: original.indexOf(r.url), url: r.url, mms, name: cleanName(r.name) || 'Proof' });
  }
  found.sort((a, b) => a.at - b.at);
  const media = found.slice(0, MAX_MMS).map(({ url, mms, name }) => ({ url, mms, name }));
  for (const m of media) words = words.split(m.url).join('');
  if (media.length) words = words.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text: words, media };
}

module.exports = { FOLDER, MAX_PER_JOB, MAX_FILE_BYTES, ACCEPT, MAX_MMS, proofUrlOk, cleanName, thumbOf, proofMessage, mmsUrlOf, proofsForText };
