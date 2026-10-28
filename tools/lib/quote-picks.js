'use strict';

/* WHAT THE CUSTOMER NEEDS, ticked on the quote form (owner, 2026-10-20).
 *
 * The form (public/assets/js/quote-form.js) shows a box per item, with a
 * quantity box beside it. /submit reads only the keys below, caps each
 * quantity, and writes the picks as the first line of the enquiry's
 * description ("Items: Wall calendars (50), Mugs & tumblers"), so they show
 * wherever the enquiry already does: /admin/leads, the shop email and Brevo.
 * No new column: the description is what every one of those reads.
 *
 * The browser keeps its own copy of this list (it is a static file);
 * tests/quote-picks.test.js fails if the two differ. */

/* Calendars and pouches are off for now (owner, 2026-10-20): no way to
   design a calendar yet, and pouches start at 500. */
const PICKS = [
  { key: 'apparel',     label: 'Shirts, hoodies & apparel' },
  { key: 'embroidery',  label: 'Embroidery' },
  { key: 'signs',       label: 'Banners & signs' },
  { key: 'drinkware',   label: 'Mugs & tumblers' },
  { key: 'stickers',    label: 'Roll labels' },
  { key: 'table_cover', label: 'Table covers' },
  { key: 'xframe',      label: 'X-frame banners' },
  { key: 'brochure',    label: 'Brochures & flyers' },
  { key: 'other',       label: 'Something else' },
];
/* The most of one item anyone is quoted (tools/lib/sinalite.js MAX_QTY). */
const MAX_QTY = 100000;

const ticked = (v) => v === true || v === 1 || /^(1|on|true|yes)$/i.test(String(v == null ? '' : v).trim());

/** The picks in a /submit body, in list order: [{ key, label, qty }].
 *  Only known keys; a quantity that is not a whole number from 1 to MAX_QTY
 *  is dropped rather than refused, so a typo never loses the enquiry. */
function parsePicks(body) {
  const b = body || {};
  const out = [];
  for (const p of PICKS) {
    if (!ticked(b['pick_' + p.key])) continue;
    const raw = String(b['pick_' + p.key + '_qty'] == null ? '' : b['pick_' + p.key + '_qty']).replace(/[,\s]/g, '');
    const n = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
    out.push({ key: p.key, label: p.label, qty: n >= 1 && n <= MAX_QTY ? n : null });
  }
  return out;
}

/** "Items: Wall calendars (50), Mugs & tumblers" — or '' with none. */
function picksLine(picks) {
  if (!picks || !picks.length) return '';
  return 'Items: ' + picks.map((p) => p.label + (p.qty ? ' (' + p.qty.toLocaleString('en-US') + ')' : '')).join(', ');
}

/* "Need it sooner?" (owner, 2026-10-28): small orders take 5–7 business
   days, so anything sooner is a rush, quoted with a fee the owner sets. The
   box (rush_needed) and an optional date (rush_by, YYYY-MM-DD from the
   browser's date picker) put a RUSH line at the very top of the enquiry. A
   date that is not a real calendar date, or is more than a year out, is
   dropped rather than refused, so a bad date never loses the enquiry. */
function parseRush(body, now = new Date()) {
  const b = body || {};
  if (!ticked(b.rush_needed)) return null;
  const raw = String(b.rush_by == null ? '' : b.rush_by).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  let by = '';
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const real = d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (real && d.getTime() >= today - 864e5 && d.getTime() <= today + 366 * 864e5) by = raw;
  }
  return { by };
}

/** "⚡ RUSH: needs it in under 5 business days, by Tue, Nov 3, 2026" — or ''. */
function rushLine(rush) {
  if (!rush) return '';
  let when = '';
  if (rush.by) {
    const [y, mo, d] = rush.by.split('-').map(Number);
    when = ', by ' + new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US',
      { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  return '\u26A1 RUSH: needs it in under 5 business days' + when + ' (rush fee applies)';
}

module.exports = { PICKS, MAX_QTY, parsePicks, picksLine, parseRush, rushLine };
