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

/** The shop's view: every size asked for, per line, with no names. Unlike
 *  tally() it keeps sizes the line no longer offers, so nothing a person asked
 *  for goes missing. `rank(size)` orders sizes (unknown sizes go last).
 *  Returns [{ line_index, sizes: [[size, n], ...], total }]. */
function listTotals(entries, rank) {
  const byLine = new Map();
  for (const e of entries || []) {
    const ix = Number(e.line_index);
    if (!byLine.has(ix)) byLine.set(ix, new Map());
    const m = byLine.get(ix);
    m.set(e.size, (m.get(e.size) || 0) + (Number(e.qty) || 1));
  }
  const r = (s) => { const n = rank(s); return n < 0 ? Infinity : n; };
  return [...byLine.keys()].sort((a, b) => a - b).map((ix) => {
    const sizes = [...byLine.get(ix)].sort((a, b) => r(a[0]) - r(b[0]) || String(a[0]).localeCompare(String(b[0])));
    return { line_index: ix, sizes, total: sizes.reduce((t, [, n]) => t + n, 0) };
  });
}

module.exports = { MAX_ENTRIES, newToken, TOKEN_RE, cleanName, tally, listTotals };
