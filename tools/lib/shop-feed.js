'use strict';

/* The product cards on jtees.net: categories, best sellers and every active
 * product's price and photo, read from the designer (jt-shop-feed.php) so the
 * cards show live prices and a product switched off there disappears here.
 *
 * The designer's answer is cleaned before it reaches a browser. These cards are
 * written into the page, so every link must stay on design.jtees.net and every
 * photo must be a plain https address. A card that fails is dropped, never
 * repaired into something else, and the homepage keeps its built-in cards when
 * nothing usable is left.
 */

const MAX_CATEGORIES = 16;
const MAX_BEST = 8;
const MAX_PRODUCTS = 2000;

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

/** A real positive amount in dollars, or null ("custom pricing"). */
function price(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : null;
}

/** A product's colours as swatch dots: a name and a plain hex colour each.
 *  The hex goes into a style property, so anything else is dropped. */
const MAX_COLORS = 80;
function colors(v) {
  if (!Array.isArray(v)) return [];
  return v.slice(0, MAX_COLORS).map((c) => ({
    name: text(c && c.name, 40),
    hex: typeof (c && c.hex) === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c.hex) ? c.hex : '',
  })).filter((c) => c.name && c.hex);
}

/** The designer's answer, reduced to cards that are safe to show.
 *  Returns null when the answer is not a feed at all. */
function cleanShopFeed(d) {
  if (!d || d.ok !== true || !Array.isArray(d.categories) || !Array.isArray(d.best)) return null;

  const categories = d.categories.slice(0, MAX_CATEGORIES * 2).map((c) => ({
    name: text(c && c.name, 60),
    image: imageUrl(c && c.image),
    link: designerLink(c && c.link),
    from_price: price(c && c.from_price),
  })).filter((c) => c.name && c.image && c.link).slice(0, MAX_CATEGORIES);

  const best = d.best.slice(0, MAX_BEST * 2).map((p) => ({
    name: text(p && p.name, 120),
    image: imageUrl(p && p.image),
    link: designerLink(p && p.link),
    blurb: text(p && p.blurb, 120),
    from_price: price(p && p.from_price),
    colors: colors(p && p.colors),
  })).filter((p) => p.name && p.image && p.link).slice(0, MAX_BEST);

  /* Every active product's live price and photo, matched to the page cards by
     link. Optional: an older designer sends none, and the cards keep theirs. */
  const raw = Array.isArray(d.products) ? d.products : [];
  const products = raw.slice(0, MAX_PRODUCTS).map((p) => ({
    link: designerLink(p && p.link),
    image: imageUrl(p && p.image),
    from_price: price(p && p.from_price),
    colors: colors(p && p.colors),
  })).filter((p) => /^https:\/\/design\.jtees\.net\/product\.php\?product_id=\d+$/.test(p.link));

  /* Complete only when the designer says so and nothing was cut here: the
     page hides a product card missing from the list only then. */
  const products_complete = d.products_complete === true && raw.length > 0 && raw.length <= MAX_PRODUCTS;

  return { categories, best, products, products_complete };
}

module.exports = { cleanShopFeed };
