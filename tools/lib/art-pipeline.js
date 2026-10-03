'use strict';

/* The artwork pipeline: sales hands a job to the designer, the designer
 * reviews it (and can ask sales a question), uploads the final print files and
 * submits them, and the owner approves them or sends them back.
 *
 *   (none) ──request──▶ waiting ──submit──▶ submitted ──approve──▶ approved
 *                        │   ▲                 │                      │
 *                question│   │answer   changes │                      │request
 *                        ▼   │                 ▼                      ▼ (a new round)
 *                     needs_info          changes ──submit──▶ submitted
 *
 * One row per job (art_requests.quote_code is unique). Every move is checked
 * here and again in the UPDATE's WHERE, so two people clicking at once cannot
 * skip a step. The history of every move is kept in `events`.
 *
 * Final files go from the browser to Cloudinary, signed by
 * /admin/api/art-signature into one fixed folder; this server keeps the URL.
 * Unlike proofs these are production files, so vectors, PDFs and stitch files
 * are allowed (Cloudinary stores some of them as raw). */

const STATES = {
  waiting:    { label: 'With the designer', tone: 'blue' },
  needs_info: { label: 'Designer has a question', tone: 'amber' },
  submitted:  { label: 'Final art waiting for the owner', tone: 'blue' },
  changes:    { label: 'Owner asked for changes', tone: 'amber' },
  approved:   { label: 'Final art approved', tone: 'green' },
};

/* Each move: the states it may start from, where it goes, and who may make it.
   `who` is a permission key, or 'owner'. A null `from` entry is "no request yet". */
const MOVES = {
  request:  { from: [null, 'approved'], to: 'waiting', who: 'art.request' },
  question: { from: ['waiting', 'changes'], to: 'needs_info', who: 'art.work' },
  answer:   { from: ['needs_info'], to: 'waiting', who: 'art.request' },
  submit:   { from: ['waiting', 'changes'], to: 'submitted', who: 'art.work' },
  approve:  { from: ['submitted'], to: 'approved', who: 'owner' },
  changes:  { from: ['submitted'], to: 'changes', who: 'owner' },
};
const FILE_STATES = ['waiting', 'changes', 'needs_info'];

const NOTE_MAX = 2000;
const MAX_FILES = 30;
const FOLDER = 'job_art';
const ACCEPT = '.ai,.eps,.pdf,.svg,.png,.jpg,.jpeg,.psd,.tif,.tiff,.dst,.pes,.emb,.exp,.zip';
const EXTS = ['ai', 'eps', 'pdf', 'svg', 'png', 'jpg', 'jpeg', 'psd', 'tif', 'tiff', 'dst', 'pes', 'emb', 'exp', 'zip'];
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** May this move be made now? `state` is the row's status, or null for none. */
function canMove(move, state) {
  const m = Object.prototype.hasOwnProperty.call(MOVES, move) ? MOVES[move] : null;
  return !!m && m.from.includes(state == null ? null : state);
}

/** May files be added in this state? */
function canAddFile(state) { return FILE_STATES.includes(state); }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** { type, ext } for a final-art URL this shop's Cloudinary holds, or null. */
function parse(url, cloud) {
  if (typeof url !== 'string' || url.length > 400 || !cloud) return null;
  const m = new RegExp('^https://res\\.cloudinary\\.com/' + esc(cloud) +
    '/(image|raw)/upload/(?:v\\d+/)?' + FOLDER + '/[A-Za-z0-9_-]{1,120}\\.([A-Za-z0-9]{2,5})$').exec(url);
  if (!m) return null;
  const ext = m[2].toLowerCase();
  return EXTS.includes(ext) ? { type: m[1], ext } : null;
}
function artUrlOk(url, cloud) { return !!parse(url, cloud); }

function cleanName(name) {
  return String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120);
}
function cleanNote(note) {
  return String(note || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, NOTE_MAX);
}

module.exports = { STATES, MOVES, FILE_STATES, NOTE_MAX, MAX_FILES, FOLDER, ACCEPT, MAX_FILE_BYTES,
  canMove, canAddFile, artUrlOk, cleanName, cleanNote };
