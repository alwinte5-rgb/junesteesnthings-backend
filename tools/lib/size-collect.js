'use strict';

/* The team size link: a customer ordering for a team or staff shares one link,
 * each person types their name and picks their size, and the totals fill in the
 * size boxes already on the quote page (the customer still presses "Send
 * changes", so pricing a new mix stays the shop's job, exactly as before).
 * Pure helpers; server.js does the I/O. */

const crypto = require('node:crypto');

/* Shirts on one link, counted by quantity, not by row. */
const MAX_ENTRIES = 500;
/* One person can ask for several shirts (a parent for the kids too), but a
   single answer stays a family's worth, not a whole order. */
const MAX_PER_SIZE = 20;
const MAX_PER_ANSWER = 40;
/* Offered on every adult garment, so a parent can add the kids on the same
   link. They are not sizes of that garment: the shop adds a youth line and
   re-prices, so the quote page lists them apart and never fills them in. */
const YOUTH_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL'];
const ADULT_RE = /^(XS|S|M|L|XL|[2-6]XL)$/i;
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

/** What a line's size link offers: its own sizes, plus the youth sizes when
 *  the garment is adult apparel (a cap or a youth tee gets none added). */
function offeredSizes(lineSizes) {
  const own = (lineSizes || []).map(String);
  const adult = own.some((s) => ADULT_RE.test(s.trim()));
  return { own, youth: adult ? YOUTH_SIZES.filter((y) => !own.includes(y)) : [] };
}

/** The size list a page was built from, sent back with the answer. */
function sizesKey(lineSizes) {
  const { own, youth } = offeredSizes(lineSizes);
  return [...own, ...youth].join('|');
}

/** One answer from the link page: a count box per offered size, named
 *  q_<line>_<n> (n = position in own sizes then youth sizes, so no size text
 *  is ever read back from the form). Returns [{ ix, size, qty }] with counts
 *  clamped to 0..MAX_PER_SIZE, or { error: 'changed' | 'none' | 'too_many' }. */
function parsePicks(body, lines) {
  const picks = []; let total = 0;
  for (const l of lines || []) {
    const { own, youth } = offeredSizes(l.sizes);
    /* The boxes are matched by position, so a page built before the shop
       changed the line's sizes must not land its counts on the wrong size. */
    if (String((body || {})[`sizes_${l.ix}`] || '') !== sizesKey(l.sizes)) return { error: 'changed' };
    [...own, ...youth].forEach((size, n) => {
      const raw = String((body || {})[`q_${l.ix}_${n}`] || '').trim();
      const qty = /^\d{1,3}$/.test(raw) ? Math.min(parseInt(raw, 10), MAX_PER_SIZE) : 0;
      if (qty > 0) { picks.push({ ix: l.ix, size, qty }); total += qty; }
    });
  }
  if (!picks.length) return { error: 'none' };
  if (total > MAX_PER_ANSWER) return { error: 'too_many' };
  return picks;
}

/** Counts per line and size: { [lineIndex]: { [size]: n } }, sizes in the
 *  order the line offers them. Entries for a line or size that no longer
 *  exists (the quote was edited) are left out, and reported as `stale`. */
function tally(entries, sizesByLine) {
  const out = {}; const youth = {}; let stale = 0;
  for (const e of entries || []) {
    const sizes = sizesByLine[e.line_index];
    if (sizes && !sizes.includes(e.size) && YOUTH_SIZES.includes(e.size)) {
      youth[e.line_index] = youth[e.line_index] || {};
      youth[e.line_index][e.size] = (youth[e.line_index][e.size] || 0) + (Number(e.qty) || 1);
      continue;
    }
    if (!sizes || !sizes.includes(e.size)) { stale++; continue; }
    out[e.line_index] = out[e.line_index] || {};
    out[e.line_index][e.size] = (out[e.line_index][e.size] || 0) + (Number(e.qty) || 1);
  }
  for (const ix of Object.keys(out)) {
    const ordered = {};
    for (const s of sizesByLine[ix]) if (out[ix][s]) ordered[s] = out[ix][s];
    out[ix] = ordered;
  }
  for (const ix of Object.keys(youth)) {
    const ordered = {};
    for (const s of YOUTH_SIZES) if (youth[ix][s]) ordered[s] = youth[ix][s];
    youth[ix] = ordered;
  }
  return { byLine: out, youth, stale };
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

module.exports = { MAX_ENTRIES, MAX_PER_SIZE, MAX_PER_ANSWER, YOUTH_SIZES, newToken, TOKEN_RE, cleanName,
  offeredSizes, sizesKey, parsePicks, tally, listTotals };
