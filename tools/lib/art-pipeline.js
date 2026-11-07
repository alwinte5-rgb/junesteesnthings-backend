'use strict';

/* The artwork pipeline: a paid order reaches the designer, who checks the
 * customer's artwork, fixes it if it needs it, uploads the print-ready files
 * and submits them; the owner approves them or sends them back.
 *
 *   (none) ──request──▶ waiting ──submit──▶ submitted ──approve──▶ approved
 *                        │   ▲                 │                      │
 *                question│   │answer   changes │                      │request
 *                        ▼   │                 ▼                      ▼ (a new round)
 *                     needs_info          changes ──submit──▶ submitted
 *
 *   Every accepted and paid order goes to one designer on its own (autoArtSweep
 *   in server.js). There is no way to close a job without final files (owner,
 *   2026-11-06): the old `review` move is gone, and `reviewed` is kept only so
 *   jobs closed that way before still read as finished. The designer talks to
 *   the customer directly on the job's Messages card; `question` (ask sales)
 *   is no longer offered to them, and kept so an open question can still be
 *   answered.
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
  reviewed:   { label: 'Reviewed by the designer (old step)', tone: 'green' },
};
/* States where the art is finished: off the to-do lists, and nothing owed. */
const DONE_STATES = ['approved', 'reviewed'];

/* Each move: the states it may start from, where it goes, and who may make it.
   `who` is a permission key, or 'owner'. A null `from` entry is "no request yet". */
const MOVES = {
  request:  { from: [null, 'approved', 'reviewed'], to: 'waiting', who: 'art.request' },
  question: { from: ['waiting', 'changes'], to: 'needs_info', who: 'art.work' },
  answer:   { from: ['needs_info'], to: 'waiting', who: 'art.request' },
  submit:   { from: ['waiting', 'changes'], to: 'submitted', who: 'art.work' },
  approve:  { from: ['submitted'], to: 'approved', who: 'owner' },
  changes:  { from: ['submitted'], to: 'changes', who: 'owner' },
};
const FILE_STATES = ['waiting', 'changes', 'needs_info'];

const NOTE_MAX = 10000;
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

/** Was the request now open made automatically (autoArtSweep), not by hand?
 *  The LAST request decides: the owner sending the job by hand over an
 *  automatic one makes it real art work. Mirrors ART_AUTO_SQL in server.js. */
function isAutoRequest(events) {
  const list = Array.isArray(events) ? events : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].action === 'request') return list[i].auto === true;
  }
  return false;
}

/** Was the open automatic request released to the designer on payment (its
 *  last request marked paid)? One made before the accepted-and-paid rule is
 *  not, until autoArtSweep releases it. Mirrors ART_HELD_SQL in server.js. */
function isPaidRequest(events) {
  const list = Array.isArray(events) ? events : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].action === 'request') return list[i].paid === true;
  }
  return false;
}

/** Is this job held from the designer: an automatic request made before the
 *  accepted-and-paid rule, never worked on (still waiting, no files) and not
 *  yet released on payment? The JS twin of ART_HELD_SQL in server.js. */
function isHeld(a) {
  return !!a && a.status === 'waiting' && !(Array.isArray(a.files) && a.files.length)
    && isAutoRequest(a.events) && !isPaidRequest(a.events);
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

module.exports = { STATES, DONE_STATES, MOVES, FILE_STATES, NOTE_MAX, MAX_FILES, FOLDER, ACCEPT, MAX_FILE_BYTES,
  canMove, canAddFile, isAutoRequest, isPaidRequest, isHeld, artUrlOk, cleanName, cleanNote };
