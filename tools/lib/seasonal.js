'use strict';

/* What the site wears by date: the logo now, the homepage's seasonal blocks
 * next. One dated table, read on every request, so a season starts and ends
 * by itself with nobody touching anything.
 *
 * THE LOGO (owner, 2026-10-25: "change the emblem to the christmas themed one
 * until January 15th and automatically restore the original after this
 * date"). Every page, email and the designer shows the logo through the
 * `logo-current*` addresses, which server.js answers from here with a 1-hour
 * cache. The plain logo files are cached for 30 days by browsers and
 * Cloudflare, so swapping the file behind THEIR address would have shown the
 * old logo for weeks after a season changed. A copy of each everyday file
 * sits at its logo-current name too (tests/seasonal.test.js keeps them equal),
 * for the file checks and as a fallback; the route answers first.
 *
 * Days are Chicago days, both ends included: `to: '2027-01-15'` shows the
 * season through 23:59 on January 15 and the plain logo from midnight.
 */

const BRAND = 'assets/images/brand';

/* The address everything uses -> the everyday file under BRAND. */
const LOGO_FILES = {
  'logo-current.webp': 'logo-2026.webp',
  'logo-current.png': 'logo-2026.png',
  'logo-current-900.png': 'logo-2026-900.png',
  'logo-current-popup.png': 'logo-popup.png',
  /* design.jtees.net's studio: jt_season_logo() there shows this address
     and falls back to its own stored logo when it fails. It exists only in
     season (SEASON_ONLY), so out of season the studio shows whatever logo
     its admin holds, and an outage or a deploy of the studio before this
     backend costs nothing but the emblem. */
  'logo-studio-current.png': 'logo-studio.png',
};
/* Addresses with no everyday file: 404 out of season. */
const SEASON_ONLY = new Set(['logo-studio-current.png']);

/* A season's logo files sit in BRAND/seasonal/<id>/ under the everyday file
   names, one of each. */
const LOGO_SEASONS = [
  { id: 'christmas-2026', from: '2026-10-25', to: '2027-01-15' },
];

/** 'YYYY-MM-DD' for the Chicago day `now` falls on (composed from parts,
 *  never from a locale format). */
const CHICAGO = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
function chicagoDay(now = new Date()) {
  const parts = CHICAGO.formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** The logo season on now, or null. */
function logoSeason(now = new Date()) {
  const d = chicagoDay(now);
  return LOGO_SEASONS.find((s) => s.from <= d && d <= s.to) || null;
}

/** The file (relative to public/) to send for a logo-current address, or null
 *  for a name that is not one. */
function logoFile(name, now = new Date()) {
  const plain = LOGO_FILES[name];
  if (!plain) return null;
  const s = logoSeason(now);
  if (!s) return SEASON_ONLY.has(name) ? null : `${BRAND}/${plain}`;
  return `${BRAND}/seasonal/${s.id}/${plain}`;
}

/* THE HOMEPAGE AND THE SHOP MENU BY SEASON (owner, 2026-10-25: a Christmas
 * banner and row "until December 25 ... lets do this for all upcoming large
 * events. Like graduation. Make sure the categories change based on the
 * season").
 *
 * An event shows from its season start (marketing-calendar.js), or `from`,
 * until its last order day: a row for an occasion nobody can still order for
 * sells nothing. `until: 'event'` keeps it up through the occasion itself
 * (owner: Christmas until December 25), and its "order by" note drops off
 * after the last order day. At most two at once, the
 * nearest first. While one is on:
 *   - the homepage shows its banner (when the owner has supplied one) and
 *     its row of products, under the menu;
 *   - the homepage's three category shelves are its `shelves`;
 *   - the Shop menu lists its `shop` categories first.
 * With no event on, the shelves and the menu follow the time of year.
 *
 * server.js applies this as each page is sent (pages are not cached at the
 * edge), so a season starts and ends on its own day with nothing to run. The
 * committed files hold the everyday version.
 *
 * An event's products are `title` + `products` (one row), or `rows` for
 * several; a `large` row shows four big cards. Product ids are
 * page-blocks.json catalog ids; categories are designer
 * category ids (cNN for shelves, NN for the menu).
 */
const HOME_EVENTS = {
  christmas: {
    from: '2026-10-25', until: 'event', // owner: up now with the Christmas logo, until December 25
    /* The banner is the occasion page's own (occasion-pages.json), so one
       record holds its picture and words. */
    banner: 'occasions/christmas-shirts-chicago.html',
    /* Owner, 2026-10-25: "the large 4 cards gifts first then the clothing". */
    rows: [
      { title: 'Christmas gifts', products: ['p523', 'p530', 'p27', 'p154'], large: true },
      { title: 'Matching Christmas clothing', products: ['p21', 'p29', 'p24', 'p12', 'p28', 'p92', 'p17', 'p13'] },
    ],
    shelves: ['c53', 'c52', 'c55'],
    shop: [53, 52, 55, 97, 98],
  },
  'black-history-month': { title: 'Black History Month shirts', products: ['p12', 'p13', 'p21', 'p24', 'p28', 'p17'], shelves: ['c52', 'c53', 'c55'], shop: [52, 53, 55] },
  valentines: { title: "Valentine's Day gifts", products: ['p12', 'p17', 'p24', 'p523', 'p530', 'p27'], shelves: ['c52', 'c58', 'c53'], shop: [52, 97, 98, 58] },
  'senior-night-winter': { title: 'Senior Night big heads', products: ['p188', 'p12', 'p21', 'p28'], shelves: ['c52', 'c53', 'c57'] },
  'senior-night-spring': { title: 'Senior Night big heads', products: ['p188', 'p12', 'p21', 'p28'], shelves: ['c52', 'c53', 'c57'] },
  'senior-night-fall': { title: 'Senior Night big heads', products: ['p188', 'p12', 'p21', 'p28'], shelves: ['c52', 'c53', 'c57'] },
  graduation: { title: 'Graduation shirts & big heads', products: ['p12', 'p13', 'p188', 'p28', 'p21', 'p115'], shelves: ['c52', 'c53', 'c57'], shop: [52, 53, 57] },
  'mothers-day': { title: "Mother's Day gifts", products: ['p17', 'p78', 'p523', 'p530', 'p27', 'p173'], shelves: ['c52', 'c58', 'c54'], shop: [92, 52, 97, 98, 58] },
  weddings: { title: 'Wedding & bachelorette', products: ['p99', 'p78', 'p17', 'p13', 'p27', 'p173'], shelves: ['c54', 'c52', 'c58'], shop: [92, 52, 58] },
  juneteenth: { title: 'Juneteenth shirts', products: ['p12', 'p13', 'p28', 'p92', 'p19', 'p115'], shelves: ['c52', 'c55', 'c54'], shop: [52, 55] },
  'family-reunions': { title: 'Family reunion shirts', products: ['p12', 'p28', 'p92', 'p13', 'p19', 'p27'], shelves: ['c52', 'c55', 'c54'], shop: [52, 55] },
  'chicago-marathon': { title: 'Marathon big heads & cheer shirts', products: ['p188', 'p12', 'p13', 'p19'], shelves: ['c52', 'c54', 'c57'] },
  halloween: { title: 'Halloween shirts', products: ['p12', 'p28', 'p92', 'p21', 'p29', 'p27'], shelves: ['c52', 'c53', 'c55'], shop: [52, 53, 55] },
};
const MAX_EVENTS = 2;

/** An event's banner: { href, src, srcset, width, height, alt } from the
 *  occasion page it names (occasion-pages.json), or null. */
function bannerFor(cfg) {
  if (!cfg.banner) return null;
  const page = require('../occasion-pages').load().pages.find((p) => p.path === cfg.banner);
  if (!page || !page.banner) throw new Error(`seasonal: ${cfg.banner} has no banner in occasion-pages.json`);
  return { href: '/' + page.path, ...page.banner };
}

/** The banner markup, shared by the homepage and the occasion pages: shown
 *  whole, never cropped, because its words are part of the picture. */
function bannerImg(b, { href, cls, from, style = '', imgStyle = '' }) {
  const { escHtml: esc } = require('./html-escape');
  return `<a class="${cls}" href="${esc(href)}" data-from="${esc(from)}"${style ? ` style="${style}"` : ''}><img src="${esc(b.src)}" srcset="${esc(b.srcset)}" sizes="(max-width: 1400px) 100vw, 1400px" width="${Number(b.width)}" height="${Number(b.height)}" alt="${esc(b.alt)}" fetchpriority="high"${imgStyle ? ` style="${imgStyle}"` : ''} /></a>`;
}

/* With no event on: hoodies lead in the cold months, tees and tanks in the
   warm ones. Month numbers 1-12. */
function everyday(month) {
  if (month >= 11 || month <= 3) return { shelves: ['c53', 'c52', 'c57'], shop: [53, 52] };
  if (month >= 5 && month <= 8) return { shelves: ['c52', 'c54', 'c57'], shop: [52] };
  return { shelves: ['c52', 'c53', 'c57'], shop: [52, 53] };
}

/* `from` moves one year's start (it names a date); every other year opens
   on its season start. */
function startOf(e, cal) {
  const season = cal.ymd(e.season);
  return e.cfg.from && e.cfg.from.slice(0, 4) === season.slice(0, 4) && e.cfg.from < season ? e.cfg.from : season;
}

/** The events on today (at most MAX_EVENTS, nearest first): marketing
 *  calendar dates + HOME_EVENTS, each { id, name, page, orderBy, event, end, cfg }. */
function homeEvents(now = new Date()) {
  const cal = require('./marketing-calendar');
  const day = chicagoDay(now);
  /* The calendar picks each occasion's year from a UTC day; hand it noon UTC
     of the Chicago day, so the evening of an event (already tomorrow in UTC)
     still counts as that day. */
  return cal.upcoming(new Date(day + 'T12:00:00Z'))
    .filter((e) => HOME_EVENTS[e.id])
    .map((e) => ({ ...e, cfg: HOME_EVENTS[e.id] }))
    .filter((e) => startOf(e, cal) <= day && day <= cal.ymd(e.cfg.until === 'event' ? e.end : e.orderBy))
    .sort((a, b) => a.event - b.event)
    .slice(0, MAX_EVENTS);
}

/** What the season asks of the homepage shelves and the Shop menu today. */
function seasonPlan(now = new Date()) {
  const events = homeEvents(now);
  const base = everyday(Number(chicagoDay(now).slice(5, 7)));
  const merge = (key) => [...new Set([...events.flatMap((e) => e.cfg[key] || []), ...base[key]])];
  return { events, shelves: merge('shelves').slice(0, 3), shop: merge('shop') };
}

/* The Shop menu's category links, reordered: `order` first, the rest as they
   were. Only the leading run of category links in each Shop list moves. */
const SHOP_RUN = /((?:<a href="https:\/\/design\.jtees\.net\/products\.php\?category_id=\d+" data-from="nav">[^<]*<\/a>)+)/;
function reorderShop(html, order) {
  const fix = (run) => {
    const links = run.match(/<a [^>]*>[^<]*<\/a>/g);
    const id = (l) => Number(/category_id=(\d+)/.exec(l)[1]);
    const rank = (l) => { const i = order.indexOf(id(l)); return i === -1 ? order.length : i; };
    return links.map((l, i) => [l, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([l]) => l).join('');
  };
  return html.replace(/(>Shop<\/button><div class="jtn-dd-m">|<summary>Shop<\/summary>)([\s\S]*?)(?=<a href="(?!https:\/\/design\.jtees\.net\/products\.php\?category_id=))/g,
    (m, head, run) => head + (SHOP_RUN.test(run) ? run.replace(SHOP_RUN, fix) : run));
}

const SEASON_START = '<!-- season-home:start — filled by server.js from tools/lib/seasonal.js; empty in the file -->';
const SEASON_END = '<!-- season-home:end -->';

function homeBlock(events, now) {
  if (!events.length) return '';
  const cal = require('./marketing-calendar');
  const pb = require('../page-blocks');
  const { data } = pb.load();
  const { escHtml: esc } = require('./html-escape');
  const day = chicagoDay(now);
  const parts = events.map((e) => {
    const c = e.cfg, from = `home_${e.id.replace(/[^a-z0-9]+/g, '_')}`;
    const b = bannerFor(c);
    const page = b ? b.href : (e.page || '');
    const banner = b ? bannerImg(b, { href: b.href, cls: 'ss-banner', from }) : '';
    const tag = day <= cal.ymd(e.orderBy) ? `${esc(e.name)} &middot; order by ${esc(cal.longDate(e.orderBy))}` : esc(e.name);
    /* The first row carries the event's name, its order-by note and the link
       to its page; the ones after it just their own heading. */
    const rows = (c.rows || [{ title: c.title, products: c.products }]).map((r, i) => {
      const ids = (r.products || []).filter((id) => data.catalog[id]);
      if (!ids.length) return '';
      const hid = `ss-${esc(e.id)}${i ? '-' + i : ''}-h`;
      return `<section class="pb-products ss-row" aria-labelledby="${hid}">
  <div class="pb-wrap">
    <div class="pb-head">
      <div>${i ? '' : `<div class="pb-tag">${tag}</div>`}<h2 id="${hid}">${esc(r.title)}</h2></div>
      ${!i && page ? `<a class="pb-all" href="${esc(page)}" data-from="${from}">Shop ${esc(e.name)} &rarr;</a>` : ''}
    </div>
    <div class="pb-row${r.large ? ' pb-row-lg ss-row-4' : ''}">
      ${ids.map((id) => pb.card(data.catalog[id], from, 'product')).join('\n      ')}
    </div>
  </div>
</section>`;
    });
    return banner + rows.join('\n');
  });
  return `<style>.ss-banner{display:block;max-width:1400px;margin:0 auto}.ss-banner img{display:block;width:100%;height:auto}.pb-row-lg.ss-row-4{grid-template-columns:repeat(4,1fr)}@media (max-width:900px){.pb-row-lg.ss-row-4{grid-template-columns:repeat(2,1fr)}}</style>
${parts.join('\n')}`;
}

/** A page as it should be sent today: the season's homepage block and shelves,
 *  and the Shop menu in season order. Returns the input untouched when today
 *  changes nothing on it. `rel` is the path under public/ ("index.html"). */
function dressPage(html, rel, now = new Date()) {
  const plan = seasonPlan(now);
  let out = html;
  if (out.includes('class="jtn-dd-m"') || out.includes('<summary>Shop</summary>')) out = reorderShop(out, plan.shop);
  if (rel === 'index.html') {
    const a = out.indexOf(SEASON_START), z = out.indexOf(SEASON_END);
    if (a !== -1 && z > a) out = out.slice(0, a + SEASON_START.length) + '\n' + homeBlock(plan.events, now) + '\n' + out.slice(z);
    const pb = require('../page-blocks');
    const { data } = pb.load();
    const want = plan.shelves.filter((c) => data.rows[c]);
    const [s, e] = pb.mark('pb-shelves');
    const a2 = out.indexOf(s), z2 = out.indexOf(e, a2);
    if (a2 !== -1 && z2 > a2 && want.length === 3) {
      out = out.slice(0, a2 + s.length) + `\n<div class="pb-shelves">\n    ${pb.shelves(data, want, 'home_shop')}\n</div>\n` + out.slice(z2);
    }
  }
  return out;
}

/** A page path under public/ this may dress: an .html file, no dot folders
 *  or files (express.static ignores those) and no way out of public/. */
function isPage(rel) {
  return /^[\w/-][\w./-]*\.html$/.test(rel) && !rel.split('/').some((seg) => seg.startsWith('.'));
}

/* Dressed pages, per Chicago day: rel -> { ver, html (null = unchanged), etag }.
   `ver` is the page file's mtime plus those of the data the dressing reads,
   so a file is read again only when one of them changes or the day turns. A
   page that fails to dress is remembered the same way (sent as it is), so a
   mistake costs one log line, not a re-read on every request. */
const dressed = new Map();
let dressedDay = '';
const DATA_FILES = ['page-blocks.json', 'occasion-pages.json', 'reviews.json'];

/** A page as it should be sent today, or null when today leaves it as it is
 *  (or it is not a page): { html, etag }. */
function dressFile(publicDir, rel, now = new Date()) {
  if (!isPage(rel)) return null;
  const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
  const file = path.join(publicDir, rel);
  if (!file.startsWith(path.join(publicDir, path.sep))) return null;
  let st;
  try { st = fs.statSync(file); } catch { return null; }
  if (!st.isFile()) return null;
  const day = chicagoDay(now);
  if (day !== dressedDay) { dressed.clear(); dressedDay = day; }
  const mt = (f) => { try { return fs.statSync(path.join(publicDir, 'assets', 'data', f)).mtimeMs; } catch { return 0; } };
  const ver = [st.mtimeMs, ...DATA_FILES.map(mt)].join('|');
  let hit = dressed.get(rel);
  if (!hit || hit.ver !== ver) {
    const html = fs.readFileSync(file, 'utf8');
    let out = html;
    try { out = dressPage(html, rel, now); } catch (err) {
      /* A seasonal mistake must never take a page down: send it as it is. */
      console.error('seasonal page', rel, err.message);
    }
    hit = out === html ? { ver, html: null }
      : { ver, html: out, etag: `W/"s-${crypto.createHash('sha1').update(out).digest('base64url').slice(0, 20)}"` };
    dressed.set(rel, hit);
  }
  return hit.html === null ? null : { html: hit.html, etag: hit.etag };
}

module.exports = {
  BRAND, LOGO_FILES, LOGO_SEASONS, SEASON_ONLY, chicagoDay, logoSeason, logoFile,
  HOME_EVENTS, homeEvents, bannerFor, bannerImg, seasonPlan, everyday, reorderShop, dressPage, dressFile, isPage, SEASON_START, SEASON_END,
};
