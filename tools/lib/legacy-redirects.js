'use strict';

/* Old store URLs → where that visitor should land now.

   jtees.net was a Shopify store (/products/…, /pages/…, /policies/…,
   /blogs/…, /collections/…) and before that WooCommerce (/product/…/). Google,
   old posts and old texts still send people to those addresses: GA4 counted
   hundreds of landings on the 404 page between July and October 2026, across
   ~100 different old product slugs. Every one of them was a customer who
   arrived interested and was shown "Page not found".

   Old products are matched by keyword to the designer category that sells the
   same thing now, so someone who followed a hoodie link lands on hoodies. A
   slug that matches nothing goes to all products rather than to a 404. 301, so
   search engines move the old ranking to the new page.

   Pure function, no I/O: the route in server.js only calls it. */

const DESIGN = 'https://design.jtees.net';
const cat = (id) => `${DESIGN}/products.php?category_id=${id}`;
const collection = (slug) => `${DESIGN}/collection.php?c=${slug}`;
const ALL_PRODUCTS = `${DESIGN}/products.php`;

/* First match wins, so the specific comes before the general: "youth hoodie"
   is a kids' product before it is a hoodie, and "graduation t-shirt" is the
   graduation collection before it is a t-shirt. */
const PRODUCT_RULES = [
  [/business-?cards?|\bcards?\b|flyer|postcard/, '/services/graphic-design.html'],
  [/banner|yard-?sign|\bsigns?\b/, '/services/banners-signs.html'],
  [/big-?head|cut-?out/, '/services/big-head-cutouts.html'],
  [/graduat|\bgrad\b|class-of|senior/, collection('graduation')],
  [/reunion/, collection('family-reunion')],
  [/memorial|\brip\b|in-loving|forever-in/, collection('memorial')],
  [/birthday|bday/, collection('birthday')],
  [/church|jesus|\bgod\b|faith|blessed|pastor/, collection('church-groups')],
  [/youth|\bkids?\b|2000b|g185b|g500b|toddler-?tee/, cat(55)],
  [/infant|onesie|bodysuit|\bbaby\b|toddler|newborn/, cat(56)],
  [/hoodie|sweatshirt|crewneck|fleece|g185|g125|g180|18500|18000/, cat(53)],
  [/polo/, cat(59)],
  [/tank/, cat(54)],
  [/\bhats?\b|\bcaps?\b|beanie|trucker|snapback/, cat(57)],
  [/tote|\bbag\b|\bmugs?\b|tumbler|pillow|socks|\bmask\b|frame|koozie|ornament|blanket/, cat(58)],
  [/t-?shirt|\btees?\b|shirt|gildan|bella|3001|5000|2000|64000|jersey/, cat(52)],
];

/* Whole old pages, by exact path (lower-cased, no trailing slash). */
const PAGE_RULES = {
  '/pages/contact': '/#contact',
  '/pages/contact-us': '/#contact',
  '/pages/about': '/#about',
  '/pages/about-us': '/#about',
  '/pages/seller-profile': '/#about',
  '/pages/faq': '/#faq',
  '/pages/faqs': '/#faq',
  '/pages/products': ALL_PRODUCTS,
  '/pages/ccpa-opt-out': `${DESIGN}/privacy.php`,
  '/policies/privacy-policy': `${DESIGN}/privacy.php`,
  '/policies/terms-of-service': `${DESIGN}/terms.php`,
  '/policies/refund-policy': `${DESIGN}/terms.php`,
  '/policies/shipping-policy': `${DESIGN}/terms.php`,
  '/collections': ALL_PRODUCTS,
  '/collections/all': ALL_PRODUCTS,
  '/blogs': '/blog/',
  '/blogs/news': '/blog/',
  '/cart': `${DESIGN}/cart.php`,
  '/account': `${DESIGN}/account.php`,
  '/account/login': `${DESIGN}/account.php`,
  '/search': ALL_PRODUCTS,
};

/** Where an old store path should go now, or null if it is not an old store path. */
function legacyRedirect(rawPath) {
  let p;
  try { p = decodeURIComponent(String(rawPath || '')); } catch { p = String(rawPath || ''); }
  p = p.split('?')[0].toLowerCase().replace(/\/+$/, '') || '/';
  if (p.length > 300) return null;

  if (Object.prototype.hasOwnProperty.call(PAGE_RULES, p)) return PAGE_RULES[p];

  const m = p.match(/^\/(products|product|collections)\/([^/]+)(?:\/.*)?$/);
  if (m) {
    const slug = m[2];
    for (const [re, to] of PRODUCT_RULES) if (re.test(slug)) return to;
    return ALL_PRODUCTS;
  }
  if (/^\/pages\//.test(p)) return '/';
  if (/^\/policies\//.test(p)) return `${DESIGN}/terms.php`;
  if (/^\/blogs\//.test(p)) return '/blog/';
  if (/^\/account\//.test(p)) return `${DESIGN}/account.php`;
  return null;
}

/** The Express paths the route listens on — every prefix legacyRedirect knows. */
const LEGACY_PATHS = [
  '/products', '/products/*', '/product', '/product/*', '/pages', '/pages/*', '/policies', '/policies/*',
  '/blogs', '/blogs/*', '/collections', '/collections/*', '/cart', '/account', '/account/*', '/search',
];

module.exports = { legacyRedirect, LEGACY_PATHS, PRODUCT_RULES, PAGE_RULES };
