'use strict';

/* A stylesheet link stamped with a hash of the file (?v=<sha1, 8 chars>), so a
 * style change reaches every browser at once instead of after the hour
 * Cloudflare lets them keep the old copy (max-age=3600). On 2026-10-17 the new
 * services ticker showed as flat text until that copy expired.
 *
 *   const css = cssTag('/assets/css/site-nav.css');
 *   css.tag            the <link> to write
 *   css.v              the stamp
 *   css.put(html)      the link in place: an older link (stamped or not) is
 *                      replaced where it stands, so styles after it still win;
 *                      a page with none gets it at the end of <head>
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PUBLIC = path.join(__dirname, '..', '..', 'public');

/* The stamp itself: the first 8 hex of the file's sha1. Photos use it too. */
const assetStamp = (rel) => crypto.createHash('sha1').update(fs.readFileSync(path.join(PUBLIC, rel))).digest('hex').slice(0, 8);

function cssTag(href) {
  const v = assetStamp(href);
  const tag = `<link rel="stylesheet" href="${href}?v=${v}" />`;
  const any = new RegExp(`<link rel="stylesheet" href="${href.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\?v=[0-9a-f]+)?" \\/>`, 'g');
  const put = (html) => {
    if (html.includes(tag)) return html;
    let first = true;
    const out = html.replace(any, () => (first ? ((first = false), tag) : ''));
    return first ? out.replace('</head>', `  ${tag}\n</head>`) : out;
  };
  return { href, v, tag, put };
}

/* The same stamp for a deferred script, for pages that already load it: an
 * existing <script src="…" defer> is re-stamped where it stands, and a page
 * without one is left alone. Used for /assets/js/quote-form.js, whose markup
 * hooks must match the page's HTML (which is never cached). */
function scriptTag(src) {
  const v = assetStamp(src);
  const tag = `<script src="${src}?v=${v}" defer></script>`;
  const any = new RegExp(`<script src="${src.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}(?:\\?v=[0-9a-f]+)?" defer><\\/script>`, 'g');
  const put = (html) => html.replace(any, tag);
  return { src, v, tag, put };
}

module.exports = { cssTag, scriptTag, assetStamp };
