'use strict';

/* The team size link: a customer ordering for a team or staff shares one link,
 * each person types their name and picks their size, and the totals fill in the
 * size boxes already on the quote page (the customer still presses "Send
 * changes", so pricing a new mix stays the shop's job, exactly as before).
 * Pure helpers; server.js does the I/O. */

const crypto = require('node:crypto');

const MAX_ENTRIES = 500;
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** A link token nobody can guess: 16 characters, about 80 bits. */
function newToken() {
  let t = '';
  for (let i = 0; i < 16; i++) t += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return t;
}
const TOKEN_RE = /^[a-z2-9]{16}$/;

/** A person's name as typed: letters, spaces and name punctuation, 60 max. */
function cleanName(name) {
  return String(name || '').replace(/[^\p{L}\p{M}\p{N} .'’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Counts per line and size: { [lineIndex]: { [size]: n } }, sizes in the
 *  order the line offers them. Entries for a line or size that no longer
 *  exists (the quote was edited) are left out, and reported as `stale`. */
function tally(entries, sizesByLine) {
  const out = {}; let stale = 0;
  for (const e of entries || []) {
    const sizes = sizesByLine[e.line_index];
    if (!sizes || !sizes.includes(e.size)) { stale++; continue; }
    out[e.line_index] = out[e.line_index] || {};
    out[e.line_index][e.size] = (out[e.line_index][e.size] || 0) + (Number(e.qty) || 1);
  }
  for (const ix of Object.keys(out)) {
    const ordered = {};
    for (const s of sizesByLine[ix]) if (out[ix][s]) ordered[s] = out[ix][s];
    out[ix] = ordered;
  }
  return { byLine: out, stale };
}

module.exports = { MAX_ENTRIES, newToken, TOKEN_RE, cleanName, tally };
