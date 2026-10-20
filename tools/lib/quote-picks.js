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

const PICKS = [
  { key: 'apparel',     label: 'Shirts, hoodies & apparel' },
  { key: 'embroidery',  label: 'Embroidery' },
  { key: 'signs',       label: 'Banners & signs' },
  { key: 'calendar',    label: 'Wall calendars' },
  { key: 'drinkware',   label: 'Mugs & tumblers' },
  { key: 'stickers',    label: 'Stickers & labels' },
  { key: 'table_cover', label: 'Table covers' },
  { key: 'xframe',      label: 'X-frame banners' },
  { key: 'brochure',    label: 'Brochures & flyers' },
  { key: 'pouch',       label: 'Stand-up pouches' },
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

module.exports = { PICKS, MAX_QTY, parsePicks, picksLine };
