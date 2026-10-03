'use strict';

/* The homepage's Shop section: categories and "Ready to Customize" best sellers,
 * read from the designer (jt-shop-feed.php) so a product switched off there
 * disappears here too.
 *
 * The designer's answer is cleaned before it reaches a browser. These cards are
 * written into the page, so every link must stay on design.jtees.net and every
 * photo must be a plain https address. A card that fails is dropped, never
 * repaired into something else, and the homepage keeps its built-in cards when
 * nothing usable is left.
 */

const MAX_CATEGORIES = 16;
const MAX_BEST = 8;

function text(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A link into the designer, or '' — never another site. */
function designerLink(v) {
  if (typeof v !== 'string' || v.length > 300) return '';
  let u;
  try { u = new URL(v); } catch { return ''; }
  return u.protocol === 'https:' && u.host === 'design.jtees.net' ? u.href : '';
}

/** A photo address. Supplier photos still arrive as http:// now and then;
 *  they are upgraded, since the page is https and the hosts serve both. */
function imageUrl(v) {
  if (typeof v !== 'string' || v.length > 500) return '';
  let u;
  try { u = new URL(v.replace(/^http:\/\//i, 'https://')); } catch { return ''; }
  return u.protocol === 'https:' ? u.href : '';
}

/** The designer's answer, reduced to cards that are safe to show.
 *  Returns null when the answer is not a feed at all. */
function cleanShopFeed(d) {
  if (!d || d.ok !== true || !Array.isArray(d.categories) || !Array.isArray(d.best)) return null;

  const categories = d.categories.slice(0, MAX_CATEGORIES * 2).map((c) => ({
    name: text(c && c.name, 60),
    image: imageUrl(c && c.image),
    link: designerLink(c && c.link),
  })).filter((c) => c.name && c.image && c.link).slice(0, MAX_CATEGORIES);

  const best = d.best.slice(0, MAX_BEST * 2).map((p) => {
    const price = Number(p && p.from_price);
    return {
      name: text(p && p.name, 120),
      image: imageUrl(p && p.image),
      link: designerLink(p && p.link),
      blurb: text(p && p.blurb, 120),
      from_price: Number.isFinite(price) && price > 0 && price < 10000 ? Math.round(price * 100) / 100 : null,
    };
  }).filter((p) => p.name && p.image && p.link).slice(0, MAX_BEST);

  return { categories, best };
}

module.exports = { cleanShopFeed };
