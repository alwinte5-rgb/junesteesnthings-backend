'use strict';

/* Business Partners Program, the jtees.net half.
 *
 * Businesses, their logins and the discount codes live on design.jtees.net
 * (jt-partners.php, jt-auth.php), because that is where customers already sign
 * in and where codes are already checked. This side owns quotes, so it owns
 * what a code does to a quote, and the 60-day price on a reorder.
 *
 * Pure functions only: server.js does the I/O.
 */

/** The whole program is off until the owner switches it on. */
function on(env = process.env) {
  return String(env.JT_PARTNERS || '').toLowerCase() === 'on';
}

/* The 60-day price: a reorder of the same job, paid for within this many days
   of the first payment on the original, is charged what the original was. */
const LOCK_DAYS = 60;
const DAY = 24 * 60 * 60 * 1000;

/** When the original's price stops holding, or null when it was never paid. */
function lockUntil(firstPaidAt) {
  const t = firstPaidAt ? new Date(firstPaidAt).getTime() : NaN;
  return Number.isFinite(t) ? new Date(t + LOCK_DAYS * DAY) : null;
}

/** Whether a reorder made at `now` keeps the original's price. Day 60 counts. */
function lockOpen(firstPaidAt, now = new Date()) {
  const until = lockUntil(firstPaidAt);
  return !!until && new Date(now).getTime() <= until.getTime();
}

/** Whole days of the 60 still left (0 once closed). */
function lockDaysLeft(firstPaidAt, now = new Date()) {
  const until = lockUntil(firstPaidAt);
  if (!until) return 0;
  return Math.max(0, Math.ceil((until.getTime() - new Date(now).getTime()) / DAY));
}

/** The code a reorder request carries (the designer checked it: see
 *  jt_biz_reorder_promo), cleaned, or null. REORDER5 is printed on the
 *  thank-you cards; BACKAGAIN is the owner's name for the same thing, a second
 *  row on /admin/discounts with the same rule. Only a sane percentage or
 *  amount gets through, whatever was sent. */
function reorderPromo(p) {
  if (!p || typeof p !== 'object') return null;
  const code = String(p.code || '').toUpperCase();
  const value = Number(p.value);
  if (!/^[A-Z0-9]{3,32}$/.test(code) || !Number.isFinite(value) || value <= 0) return null;
  const min_order = Math.max(0, Number(p.min_order) || 0);
  const min_items = Math.max(0, parseInt(p.min_items, 10) || 0);
  if (p.kind === 'percent' && value <= 100) return { code, kind: 'percent', value, max_discount: Math.max(0, Number(p.max_discount) || 0), min_order, min_items };
  if (p.kind === 'amount' && value <= 1000) return { code, kind: 'amount', value, min_order, min_items };
  return null;
}

/** The lines of a paid job, ready to be the lines of its reorder.
 *
 *  A COPY of what was saved, never sent back through the pricing engine:
 *  `unit_price` on a line is the blended figure the customer saw, and feeding
 *  it back in as typed input re-applies what was blended into it (see the
 *  round-trip rule in AGENTS.md). What the customer turned down is not copied,
 *  so an optional line they declined does not come back. */
function reorderItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((i) => i && typeof i === 'object' && !i.optional)
    .map((i) => JSON.parse(JSON.stringify(i)));
}

/** Whether a customer may type a code on this quote right now. Only before any
 *  money has moved (a code that changes a paid deposit would need the payment
 *  re-collected), and never on a quote the shop is still writing. */
function canEnterCode(q) {
  if (!q) return false;
  if (q.cancelled_at || q.requested_items) return false;
  if (['held', 'draft'].includes(q.status)) return false;
  if (Number(q.paid_amount || 0) > 0) return false;
  return true;
}

/* What the customer is told when a code is refused. Only reasons we know are
   mapped; anything else gets the generic line (AGENTS.md: never guess the
   likeliest specific reason). The studio's own sentences are matched, so the
   wording there can change without a deploy here breaking anything worse
   than falling back to the generic line. */
const PROMO_MESSAGES = {
  invalid: 'That code is not valid. Check the spelling, or text us and we will help.',
  partner: 'This code is for Business Partners. Joining is free and takes a minute at jtees.net/partners. Once you have joined with this quote\'s email, enter the code again.',
  used: 'Your business has already used this code. Thanks for coming back!',
  usedemail: 'Looks like you have already used a discount like this one. Thanks for coming back!',
  min: 'This quote is under that code\'s minimum order.',
  returning: 'This code is for reorders: it works once you have a paid order with us.',
  held: 'This code is already on another open quote of yours. Use it there, or text us and we will move it.',
  stack: 'This quote already has a discount, and codes cannot be added on top of one. Text us if you think the code would save you more.',
  notnow: 'A code can be added only before anything has been paid.',
  generic: 'That code could not be added just now. Please try again, or text us and we will sort it out.',
};

function promoReasonKey(reason) {
  const r = String(reason || '');
  if (!r) return 'generic';
  if (/not valid/i.test(r)) return 'invalid';
  if (/Business Partners/i.test(r)) return 'partner';
  if (/business has already used/i.test(r)) return 'used';
  if (/already used your discount/i.test(r)) return 'usedemail';
  if (/needs an order of at least|needs at least/i.test(r)) return 'min';
  if (/for reorders/i.test(r)) return 'returning';
  return 'generic';
}

function promoMessage(key) {
  return Object.prototype.hasOwnProperty.call(PROMO_MESSAGES, key) ? PROMO_MESSAGES[key] : PROMO_MESSAGES.generic;
}

/** The quote discount a checked code becomes, in the quote's own fields.
 *  A percentage with a cap that the job would exceed is stored as the capped
 *  dollar amount, so the quote never takes more than the code allows. */
function discountForCode(check, gross) {
  const code = String(check.code || '').toUpperCase();
  const value = Math.max(0, Number(check.value) || 0);
  if (check.kind === 'amount') {
    return { kind: 'amt', value: Math.min(value, Math.max(0, Number(gross) || 0)), note: `Code ${code}` };
  }
  const pct = Math.min(100, value);
  const cap = Math.max(0, Number(check.max_discount) || 0);
  const off = Math.round((Number(gross) || 0) * pct) / 100;
  if (cap > 0 && off > cap) return { kind: 'amt', value: cap, note: `Code ${code} (${pct}% off, up to $${cap.toFixed(2)})` };
  return { kind: 'pct', value: pct, note: `Code ${code}` };
}

/* The sitemap lists /partners only while the program is on; listed while
   off, search engines would be sent to a 404. Added once, before </urlset>. */
const SITEMAP_ENTRY = `  <!-- Business Partners Program -->
  <url>
    <loc>https://www.jtees.net/partners</loc>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
`;

function sitemapXml(xml, env = process.env) {
  if (!on(env) || xml.includes('<loc>https://www.jtees.net/partners</loc>')) return xml;
  const end = xml.lastIndexOf('</urlset>');
  return end < 0 ? xml : xml.slice(0, end) + SITEMAP_ENTRY + xml.slice(end);
}

module.exports = {
  on, sitemapXml, LOCK_DAYS, lockUntil, lockOpen, lockDaysLeft, reorderPromo, reorderItems,
  canEnterCode, PROMO_MESSAGES, promoReasonKey, promoMessage, discountForCode,
};
