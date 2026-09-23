#!/usr/bin/env node
/* Thumbnails for the shop's OWN products.
 *
 *   node tools/make-product-thumbs.js                       # write the SVGs
 *   node tools/make-product-thumbs.js --vars=~/.jtees-art.json --apply
 *
 * The 103 apparel products carry SSActivewear's photography and all of it
 * resolves. The shop's own products — buttons, cutouts, and the signage added
 * on 2026-09-23 — had no thumbnail at all, so they showed as blanks.
 *
 * WHY DRAWINGS AND NOT PHOTOGRAPHS
 * There is no product photography for any of these in the repo, and a stock
 * photo of someone else's banner is not this shop's banner. These are flat
 * brand-coloured illustrations: honest about being drawings, consistent with
 * each other, and they scale without a CDN. Replace any of them with a real
 * photo the day there is one — the thumbnail_url is just a URL.
 */
const fs = require('fs');
const path = require('path');

const NAVY = '#0B1F4B', PINK = '#F0275A', PAPER = '#f7f6f3', WHITE = '#ffffff';
const S = 400;
const wrap = (body, bg = PAPER) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img">` +
  `<rect width="${S}" height="${S}" fill="${bg}"/>${body}</svg>`;

/* A head silhouette, the same 0.85 ratio the nesting maths uses. */
const head = (cx, cy, h, fill) => {
  const w = h * 0.85, x = (p) => cx - w / 2 + (p / 100) * w, y = (p) => cy - h / 2 + (p / 117.6) * h;
  return `<path d="M${x(50)},${y(2)} C${x(74)},${y(2)} ${x(92)},${y(20)} ${x(95)},${y(44)} ` +
    `C${x(97)},${y(62)} ${x(94)},${y(80)} ${x(86)},${y(94)} C${x(78)},${y(108)} ${x(65)},${y(115.6)} ${x(50)},${y(115.6)} ` +
    `C${x(35)},${y(115.6)} ${x(22)},${y(108)} ${x(14)},${y(94)} C${x(6)},${y(80)} ${x(3)},${y(62)} ${x(5)},${y(44)} ` +
    `C${x(8)},${y(20)} ${x(26)},${y(2)} ${x(50)},${y(2)} Z" fill="${fill}"/>`;
};

const THUMBS = {
  '3in-buttons':
    `<circle cx="200" cy="200" r="118" fill="${NAVY}"/>` +
    `<circle cx="200" cy="200" r="96" fill="${PINK}"/>` +
    `<circle cx="200" cy="200" r="60" fill="${PAPER}"/>` +
    `<circle cx="172" cy="172" r="18" fill="${WHITE}" opacity=".5"/>`,

  /* Three heads to scale, bottom-aligned, NOT overlapping — the first draft
     had them running into each other and they read as clouds. Widths are
     0.85 x height, so the gaps have to be computed from that, not guessed. */
  'big-head-cutouts': (() => {
    const base = 296, gap = 14, hs = [90, 125, 160];
    const ws = hs.map((h) => h * 0.85);
    let x = (S - (ws.reduce((a, b) => a + b, 0) + gap * (hs.length - 1))) / 2;
    return hs.map((h, i) => {
      const cx = x + ws[i] / 2;
      x += ws[i] + gap;
      return head(cx, base - h / 2, h, NAVY);
    }).join('') + `<rect x="52" y="${base + 8}" width="296" height="9" rx="4" fill="${PINK}"/>`;
  })(),

  'full-body-cutouts':
    head(200, 104, 84, NAVY) +
    `<path d="M200,146 C232,146 252,168 256,206 L262,286 244,286 240,232 236,340 212,340 206,262 194,262 188,340 164,340 160,232 156,286 138,286 144,206 C148,168 168,146 200,146 Z" fill="${NAVY}"/>` +
    `<rect x="150" y="344" width="100" height="14" rx="4" fill="${PINK}"/>`,

  'vinyl-banners':
    `<rect x="46" y="120" width="308" height="160" rx="6" fill="${NAVY}"/>` +
    `<rect x="78" y="156" width="200" height="16" rx="8" fill="${PAPER}" opacity=".85"/>` +
    `<rect x="78" y="190" width="244" height="12" rx="6" fill="${PINK}"/>` +
    `<rect x="78" y="220" width="150" height="12" rx="6" fill="${PAPER}" opacity=".5"/>` +
    [62, 200, 338].map((x) => `<circle cx="${x}" cy="132" r="7" fill="${PAPER}"/><circle cx="${x}" cy="268" r="7" fill="${PAPER}"/>`).join(''),

  'posters-prints':
    `<rect x="112" y="64" width="176" height="240" rx="4" fill="${WHITE}" stroke="${NAVY}" stroke-width="6"/>` +
    `<rect x="140" y="96" width="120" height="96" rx="3" fill="${PINK}"/>` +
    `<rect x="140" y="212" width="120" height="12" rx="6" fill="${NAVY}"/>` +
    `<rect x="140" y="238" width="86" height="10" rx="5" fill="${NAVY}" opacity=".45"/>` +
    `<rect x="140" y="262" width="104" height="10" rx="5" fill="${NAVY}" opacity=".45"/>`,

  'window-wall-graphics':
    `<rect x="70" y="70" width="260" height="260" rx="8" fill="${WHITE}" stroke="${NAVY}" stroke-width="8"/>` +
    `<line x1="200" y1="78" x2="200" y2="322" stroke="${NAVY}" stroke-width="8"/>` +
    `<line x1="78" y1="200" x2="322" y2="200" stroke="${NAVY}" stroke-width="8"/>` +
    `<path d="M92 200 h96 v-96 h-96 z" fill="${PINK}" opacity=".9"/>` +
    `<circle cx="256" cy="256" r="34" fill="${NAVY}" opacity=".85"/>`,

  'vehicle-magnets':
    `<rect x="64" y="128" width="272" height="150" rx="14" fill="${NAVY}"/>` +
    `<rect x="96" y="164" width="150" height="20" rx="10" fill="${PINK}"/>` +
    `<rect x="96" y="198" width="208" height="13" rx="6" fill="${PAPER}" opacity=".85"/>` +
    `<rect x="96" y="226" width="130" height="13" rx="6" fill="${PAPER}" opacity=".5"/>` +
    `<circle cx="300" cy="172" r="20" fill="${PAPER}" opacity=".3"/>`,

  'business-cards-flyers':
    `<rect x="72" y="188" width="228" height="128" rx="8" fill="${NAVY}" opacity=".35"/>` +
    `<rect x="90" y="166" width="228" height="128" rx="8" fill="${NAVY}" opacity=".6"/>` +
    `<rect x="108" y="144" width="228" height="128" rx="8" fill="${NAVY}"/>` +
    `<rect x="132" y="172" width="86" height="12" rx="6" fill="${PINK}"/>` +
    `<rect x="132" y="196" width="140" height="9" rx="4" fill="${PAPER}" opacity=".8"/>` +
    `<rect x="132" y="216" width="112" height="9" rx="4" fill="${PAPER}" opacity=".45"/>`,

  'acrylic-canvas':
    `<rect x="86" y="96" width="228" height="180" rx="4" fill="${NAVY}"/>` +
    `<rect x="104" y="114" width="192" height="144" rx="2" fill="${PINK}" opacity=".9"/>` +
    `<path d="M104 258 L166 178 L212 226 L258 168 L296 214 L296 258 Z" fill="${NAVY}" opacity=".55"/>` +
    `<circle cx="150" cy="148" r="18" fill="${PAPER}" opacity=".9"/>` +
    `<rect x="176" y="288" width="48" height="40" fill="${NAVY}" opacity=".3"/>` +
    `<rect x="140" y="326" width="120" height="10" rx="5" fill="${NAVY}"/>`,
};

const OUT = path.join(__dirname, '..', 'public/assets/images/products');
fs.mkdirSync(OUT, { recursive: true });
for (const [slug, body] of Object.entries(THUMBS)) {
  const f = path.join(OUT, slug + '.svg');
  fs.writeFileSync(f, wrap(body));
  console.log('  wrote ' + path.relative(path.join(__dirname, '..'), f) + '  (' + fs.statSync(f).size + ' bytes)');
}

/* ── wire them to the products ──────────────────────────────────────────── */
const MAP = {
  '3in Buttons': '3in-buttons',
  'Big Head Cutouts': 'big-head-cutouts',
  'Full Body Cutouts': 'full-body-cutouts',
  'Vinyl Banners': 'vinyl-banners',
  'Posters & Prints': 'posters-prints',
  'Window & Wall Graphics': 'window-wall-graphics',
  'Vehicle Magnets': 'vehicle-magnets',
  'Business Cards & Flyers': 'business-cards-flyers',
  'Acrylic & Canvas': 'acrylic-canvas',
};
const BASE = 'https://www.jtees.net/assets/images/products/';

const argv = process.argv.slice(2);
if (!argv.includes('--apply')) {
  console.log('\n  ' + Object.keys(MAP).length + ' products would be pointed at ' + BASE);
  console.log('  dry run — pass --vars=<file> --apply to write');
  process.exit(0);
}
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('--apply needs --vars=<file>'); process.exit(2); }
const { mysql, sq } = require('./lib/db');
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;

console.log('');
for (const [name, slug] of Object.entries(MAP)) {
  const got = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(name) + ';', { rows: true });
  if (!got.length) { console.log('  SKIP (no such product)  ' + name); continue; }
  mysql(url, 'UPDATE lumise_products SET thumbnail_url=' + sq(BASE + slug + '.svg') + ', updated=NOW() WHERE id=' + got[0].id + ';');
  console.log('  #' + got[0].id + '  ' + name + '  ->  ' + slug + '.svg');
}
