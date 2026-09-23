#!/usr/bin/env node
/* Build the public big head cutout reference page, and the PDF of it.
 *
 *   node tools/build-cutout-page.js --vars=~/.jtees-art.json
 *   node tools/build-cutout-page.js --vars=~/.jtees-art.json --pdf
 *
 * WHY THIS IS GENERATED AND NOT HAND-WRITTEN
 *
 * A price on a web page is a promise, and the store of record for these prices
 * is `lumise_printings` — the same rows the quote form and the designer price
 * from. Typing them into HTML makes a second source that is correct exactly
 * once, on the day it is written, and silently wrong from the next time
 * add-cutouts.js runs. So the page is built FROM the live rows: re-run this
 * after any reprice and the page cannot disagree with the till.
 *
 * It reads only ACTIVE rows, so a size that is retired in the designer leaves
 * the page by itself.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * Saturday rush ($50) and large-format freight ($199) are internal: they are
 * exceptions June chooses per job, they live as addons in server.js, and a
 * customer-facing sheet quoting them invites an argument about a charge that
 * usually does not apply. Weekday delivery is not listed either — it is
 * already inside the pack price (tools/lib/cutouts.js, SHIPPING_WEEKDAY), and
 * singles carry it as a visible line on the quote instead.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mysql } = require('./lib/db');

const argv = process.argv.slice(2);
const PDF = argv.includes('--pdf');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: build-cutout-page.js --vars=<file> [--pdf]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
if (!url) { console.error('no MySQL URL'); process.exit(2); }

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public/services/big-head-cutouts.html');
const PRINT = path.join(ROOT, 'public/downloads/big-head-cutout-pricing.html');
const PDF_OUT = path.join(ROOT, 'public/downloads/big-head-cutout-pricing.pdf');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ── Read the store of record ─────────────────────────────────────────────── */

/* Lumise stores `calculate` as base64 of a URL-encoded JSON blob. */
const decode = (b) => JSON.parse(decodeURIComponent(Buffer.from(b, 'base64').toString('utf8')));

const rows = mysql(url,
  "SELECT id,title,calculate,description FROM lumise_printings " +
  "WHERE title LIKE 'Big Head Cutout%' AND active=1 ORDER BY id;", { rows: true });
if (!rows.length) { console.error('no active cutout methods — refusing to write an empty page'); process.exit(1); }

/* Band keys are CEILINGS: the price applies UP TO that quantity. */
const parse = (r) => {
  const c = decode(r.calculate);
  const f = (c.values && c.values.front) || {};
  const bands = Object.keys(f).map(Number).sort((a, b) => a - b)
    .map((q) => ({ upTo: q, price: Number(f[q].price) }));
  const size = Number((r.title.match(/(\d+)\s*in/i) || [])[1]);
  const pack = Number((r.title.match(/(\d+)-pack/i) || [])[1]) || 0;
  return { id: r.id, title: r.title, description: r.description, size, pack, bands };
};

const all = rows.map(parse);
const packs = all.filter((m) => m.pack).sort((a, b) => a.size - b.size);
const singles = all.filter((m) => !m.pack).sort((a, b) => a.size - b.size);
if (!packs.length) { console.error('no pack methods found — refusing to write'); process.exit(1); }

const money = (n) => '$' + (Number.isInteger(n) ? n : n.toFixed(2)).toLocaleString('en-US');
const each = (m) => '$' + (m.bands[0].price / m.pack).toFixed(2);

/* A singles ladder as readable ranges: bands are ceilings, so band i starts one
   above band i-1's ceiling. The last band is open-ended. */
function ranges(m) {
  const out = [];
  let from = 1;
  m.bands.forEach((b, i) => {
    const last = i === m.bands.length - 1;
    out.push({ label: last ? `${from} or more` : (from === b.upTo ? `${from}` : `${from}–${b.upTo}`), price: b.price });
    from = b.upTo + 1;
  });
  return out;
}

/* What ONE cutout costs at quantity `qty`. Bands are CEILINGS, so the band
   that applies is the first whose ceiling the quantity has not passed — NOT the
   last band in the table. Getting this wrong is how the pack comparison first
   shipped saying a sheet of 32 was $256 in singles: that is 32 x the 33-or-more
   rate, a price you cannot buy 32 at. It is 32 x $12 = $384. */
const priceAt = (m, qty) => {
  for (const b of m.bands) if (qty <= b.upTo) return b.price;
  return m.bands[m.bands.length - 1].price;
};

/* ── Drawings ─────────────────────────────────────────────────────────────── */

/* A head is about 0.85 as wide as it is tall — the same ratio tools/lib/cutouts.js
   nests by, so the silhouettes below are in true proportion to each other. */
const RATIO = 0.85;
const headPath = (w, h) => {
  const x = (p) => (p / 100) * w, y = (p) => (p / 117.6) * h;
  return `M${x(50)},${y(2)} C${x(74)},${y(2)} ${x(92)},${y(20)} ${x(95)},${y(44)} ` +
         `C${x(97)},${y(62)} ${x(94)},${y(80)} ${x(86)},${y(94)} ` +
         `C${x(78)},${y(108)} ${x(65)},${y(115.6)} ${x(50)},${y(115.6)} ` +
         `C${x(35)},${y(115.6)} ${x(22)},${y(108)} ${x(14)},${y(94)} ` +
         `C${x(6)},${y(80)} ${x(3)},${y(62)} ${x(5)},${y(44)} ` +
         `C${x(8)},${y(20)} ${x(26)},${y(2)} ${x(50)},${y(2)} Z`;
};

/* Every size at once, drawn to the same scale, so "18 inch" means something. */
function scaleDrawing(sizes) {
  const S = 6.2, GAP = 26, PAD = 18, LABEL = 52;
  const tallest = Math.max(...sizes);
  const w = sizes.reduce((a, t) => a + t * RATIO * S, 0) + GAP * (sizes.length - 1) + PAD * 2;
  const h = tallest * S + LABEL + PAD;
  const base = PAD + tallest * S;
  let x = PAD, parts = '';
  for (const t of sizes) {
    const hw = t * RATIO * S, hh = t * S;
    parts +=
      `<g transform="translate(${x.toFixed(1)},${(base - hh).toFixed(1)})">` +
        `<path d="${headPath(hw, hh)}" fill="url(#cut)" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"/>` +
        `<path d="${headPath(hw, hh)}" fill="none" stroke="#0B1F4B" stroke-width="1" stroke-linejoin="round" opacity=".25"/>` +
      `</g>` +
      `<text x="${(x + hw / 2).toFixed(1)}" y="${(base + 26).toFixed(1)}" text-anchor="middle" ` +
        `font-family="Inter,sans-serif" font-size="17" font-weight="800" fill="#0B1F4B">${t}"</text>` +
      `<text x="${(x + hw / 2).toFixed(1)}" y="${(base + 43).toFixed(1)}" text-anchor="middle" ` +
        `font-family="Inter,sans-serif" font-size="11.5" font-weight="600" fill="#6B7280">tall</text>`;
    x += hw + GAP;
  }
  return `<svg viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" width="100%" role="img" ` +
    `aria-label="The ${sizes.join(', ')} inch big head cutouts drawn to the same scale for comparison" ` +
    `xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="cut" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0%" stop-color="#1b3a78"/><stop offset="100%" stop-color="#0B1F4B"/></linearGradient></defs>` +
    `${parts}</svg>`;
}

/* One pack is one sheet. Schematic, not a cut plan — it shows how many heads
   come in a pack, which is the only thing a customer is buying. */
function packDrawing(m) {
  const W = 132, H = 178, PADX = 10, PADY = 10;
  const n = m.pack;
  const cols = n >= 24 ? 4 : n >= 8 ? 2 : 1;
  const rowsN = Math.ceil(n / cols);
  const cw = (W - PADX * 2) / cols, ch = (H - PADY * 2) / rowsN;
  const hh = Math.min(ch * 0.88, cw / RATIO * 0.88), hw = hh * RATIO;
  let parts = '', k = 0;
  for (let r = 0; r < rowsN && k < n; r++) {
    for (let c = 0; c < cols && k < n; c++, k++) {
      const cx = PADX + c * cw + (cw - hw) / 2, cy = PADY + r * ch + (ch - hh) / 2;
      parts += `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">` +
        `<path d="${headPath(hw, hh)}" fill="#0B1F4B" opacity=".82"/></g>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" ` +
    `aria-label="One full sheet holding ${n} cutouts at ${m.size} inches" xmlns="http://www.w3.org/2000/svg">` +
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="6" fill="#ffffff" stroke="#E5E7EB" stroke-width="3"/>` +
    `${parts}</svg>`;
}

/* ── Copy ─────────────────────────────────────────────────────────────────── */

const SIZES = [...new Set(all.map((m) => m.size))].sort((a, b) => a - b);
const packOnly = packs.filter((p) => !singles.some((s) => s.size === p.size)).map((p) => p.size);
const bothWays = singles.map((s) => s.size);

const packRows = packs.map((m) => `
        <tr>
          <td><b>${m.size} inch</b></td>
          <td>${m.pack}</td>
          <td class="price">${money(m.bands[0].price)}</td>
          <td class="muted-cell">${each(m)} each</td>
        </tr>`).join('');

const singleTables = singles.map((m) => `
      <div class="ladder">
        <h3>${m.size} inch &mdash; by the single</h3>
        <table class="price-table">
          <thead><tr><th>How many</th><th>Price each</th></tr></thead>
          <tbody>${ranges(m).map((r) => `
            <tr><td>${r.label}</td><td class="price">${money(r.price)}</td></tr>`).join('')}
          </tbody>
        </table>
        ${(() => {
          const p = packs.find((x) => x.size === m.size);
          if (!p) return '';
          const atPack = priceAt(m, p.pack);
          return `<p class="ladder-note">A full sheet of ${p.pack} is ${money(p.bands[0].price)} &mdash;
            ${money(atPack * p.pack)} for the same ${p.pack} bought one at a time.
            Once you are near a dozen, ask about the pack.</p>`;
        })()}
      </div>`).join('');

const packCards = packs.map((m) => `
        <figure class="pack-card">
          ${packDrawing(m)}
          <figcaption><b>${m.size} inch</b><span>${m.pack} to a sheet</span></figcaption>
        </figure>`).join('');

const FAQ = [
  ['What is a big head cutout?',
   `A photo of a face, printed and cut around the outline on 3/16 inch board, so it stands up on its own or gets held up at the event. People bring them to graduations, birthdays, weddings, send-offs and games.`],
  ['What photo do you need from me?',
   `The clearest one you have &mdash; a straight-on shot of the face, as large in the frame as possible. Phone photos are fine. Send it by text or email and we will tell you before we print if it is not going to hold up at the size you want.`],
  ['Why are the 24 and 36 inch sold only by the sheet?',
   `A 24 inch head is about 22 inches across, which is wider than the board a single is cut from, so there is no smaller way to make one. It comes ${packs.find((p) => p.size === 24) ? packs.find((p) => p.size === 24).pack : 8} to a sheet and that sheet is the smallest order.`],
  ['Can I mix sizes in one order?',
   `Yes. Each size is quoted on its own line, and the quantity across the order is what sets the price on each one.`],
  ['Can every cutout be a different face?',
   `Yes &mdash; a pack does not have to be one photo repeated. Send one photo per cutout and say how many of each.`],
  ['How long do they take?',
   `They are printed to order. Ask when you send the photo and we will give you a date before you pay &mdash; we do not quote a turnaround we cannot hold.`],
];

const faqHtml = FAQ.map(([q, a]) => `
        <div class="faq-item">
          <div class="faq-q">${q}</div>
          <div class="faq-a">${a}</div>
        </div>`).join('');

const faqLd = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: FAQ.map(([q, a]) => ({
    '@type': 'Question', name: q.replace(/&mdash;/g, '—'),
    acceptedAnswer: { '@type': 'Answer', text: a.replace(/&mdash;/g, '—').replace(/\s+/g, ' ').trim() },
  })),
});

const offersLd = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Product',
  name: 'Big Head Cutouts', brand: { '@type': 'Brand', name: "June's Tees & Things" },
  description: `Custom big head cutouts printed and contour cut on 3/16 inch board, in ${SIZES.join(', ')} inch sizes. Chicago.`,
  url: 'https://www.jtees.net/services/big-head-cutouts.html',
  offers: packs.map((m) => ({
    '@type': 'Offer', name: `${m.size} inch, ${m.pack}-pack`, price: m.bands[0].price.toFixed(2),
    priceCurrency: 'USD', availability: 'https://schema.org/InStock',
    url: 'https://www.jtees.net/services/big-head-cutouts.html',
  })).concat(singles.map((m) => ({
    '@type': 'Offer', name: `${m.size} inch, single`, price: m.bands[m.bands.length - 1].price.toFixed(2),
    priceCurrency: 'USD', priceSpecification: {
      '@type': 'PriceSpecification', minPrice: m.bands[m.bands.length - 1].price.toFixed(2),
      maxPrice: m.bands[0].price.toFixed(2), priceCurrency: 'USD',
    },
    availability: 'https://schema.org/InStock', url: 'https://www.jtees.net/services/big-head-cutouts.html',
  }))),
});

const breadcrumbLd = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.jtees.net' },
    { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://www.jtees.net' },
    { '@type': 'ListItem', position: 3, name: 'Big Head Cutouts', item: 'https://www.jtees.net/services/big-head-cutouts.html' },
  ],
});

/* ── Page-specific styles, on top of the shared services chrome ───────────── */

const EXTRA_CSS = `
    .dl-bar{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin-top:1.5rem;}
    .scale-figure{background:var(--off-white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:2rem 1.5rem 1.25rem;margin-top:2.5rem;}
    .scale-figure figcaption{font-size:.85rem;color:var(--muted);text-align:center;margin-top:.75rem;}
    .price-table{width:100%;border-collapse:collapse;margin-top:1.25rem;font-size:.95rem;}
    .price-table th{text-align:left;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;padding:0 .75rem .6rem;border-bottom:2px solid var(--border);}
    .price-table td{padding:.8rem .75rem;border-bottom:1px solid var(--border);}
    .price-table tbody tr:last-child td{border-bottom:none;}
    .price-table .price{font-weight:800;color:var(--navy);white-space:nowrap;}
    .price-table .muted-cell{color:var(--muted);font-size:.875rem;white-space:nowrap;}
    .table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}
    .pack-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1.5rem;margin-top:2.5rem;}
    .pack-card{background:var(--white);border:1px solid var(--border);border-radius:var(--radius-lg);padding:1.1rem;text-align:center;}
    .pack-card figcaption{margin-top:.75rem;font-size:.9rem;color:var(--navy);display:flex;flex-direction:column;gap:.15rem;}
    .pack-card figcaption span{font-size:.8rem;color:var(--muted);font-weight:500;}
    .ladders{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2.5rem;margin-top:2rem;}
    .ladder h3{font-size:1.05rem;font-weight:800;color:var(--navy);}
    .ladder-note{font-size:.85rem;color:var(--muted);margin-top:.9rem;line-height:1.6;}
    .note-band{background:var(--off-white);border-left:3px solid var(--gold);border-radius:0 var(--radius) var(--radius) 0;padding:1.1rem 1.25rem;margin-top:2rem;font-size:.9rem;color:var(--text);line-height:1.7;}
    @media(max-width:768px){.ladders{gap:2rem;}.scale-figure{padding:1.25rem .75rem 1rem;}}
    @media print{header,.announcement-bar,.marquee-strip,.mobile-drawer,.drawer-overlay,footer,.cta-band,.dl-bar,.hero-btns{display:none!important;}section{padding:1.25rem 0!important;}}
`;

/* ── Assemble, reusing the real services chrome ───────────────────────────── */

const TEMPLATE = path.join(ROOT, 'public/services/event-decor.html');
const chrome = fs.readFileSync(TEMPLATE, 'utf8');

const heroAt = chrome.indexOf('<section class="hero">');
const footAt = chrome.indexOf('<footer>');
if (heroAt < 0 || footAt < 0) {
  console.error('the services template has moved — expected <section class="hero"> and <footer> in ' + TEMPLATE);
  process.exit(1);
}
let top = chrome.slice(0, heroAt);
const bottom = chrome.slice(footAt);

const TITLE = 'Big Head Cutout Prices Chicago | June’s Tees & Things';
const DESC = `Big head cutout prices in Chicago — ${SIZES.join(', ')} inch, by the single or by the full sheet. ` +
  `Packs from ${money(Math.min(...packs.map((p) => p.bands[0].price)))}. Send a photo, we print and contour cut it. Call (773) 849-1854.`;
const CANON = 'https://www.jtees.net/services/big-head-cutouts.html';

/* Swap the template's own SEO for this page's. Each of these is asserted to
   match exactly once, so a template edit fails the build instead of quietly
   publishing event-decor's metadata on the cutout page. */
const swaps = [
  [/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`],
  [/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${DESC}" />`],
  [/<meta name="keywords" content="[^"]*" \/>/,
   `<meta name="keywords" content="big head cutouts Chicago, big head cutout prices, custom face cutouts Chicago, graduation big heads, big head on a stick Chicago, foam board cutouts Chicago, custom photo cutouts, big head cutout pack, 24 inch big head cutout, life size face cutout Chicago" />`],
  [/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${CANON}" />`],
  [/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${TITLE}" />`],
  [/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${DESC}" />`],
  [/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${CANON}" />`],
  [/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${TITLE}" />`],
  [/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${DESC}" />`],
];
for (const [re, to] of swaps) {
  const hits = top.match(new RegExp(re.source, 'g')) || [];
  if (hits.length !== 1) { console.error('SEO swap matched ' + hits.length + ' times: ' + re); process.exit(1); }
  top = top.replace(re, to);
}

/* The template's BreadcrumbList and Service blocks are about event decor.
   Replace them; the LocalBusiness block above them is page-agnostic, so it stays. */
top = top.replace(/\s*<script type="application\/ld\+json">\s*\{"@context": "https:\/\/schema\.org", "@type": "BreadcrumbList"[\s\S]*?<\/script>/,
  `\n  <script type="application/ld+json">\n  ${breadcrumbLd}\n  </script>`);
top = top.replace(/\s*<script type="application\/ld\+json">\s*\{"@context": "https:\/\/schema\.org", "@type": "Service"[\s\S]*?<\/script>/,
  `\n  <script type="application/ld+json">\n  ${offersLd}\n  </script>\n  <script type="application/ld+json">\n  ${faqLd}\n  </script>`);
top = top.replace('</style>', EXTRA_CSS + '  </style>');

const lowestPack = packs.reduce((a, b) => (a.bands[0].price <= b.bands[0].price ? a : b));
const cheapestEach = packs.reduce((a, b) => (Number(each(a).slice(1)) <= Number(each(b).slice(1)) ? a : b));

const BODY = `<section class="hero">
  <div class="container">
    <div class="hero-eyebrow">Big Head Cutouts &mdash; Chicago</div>
    <h1>Send us a face.<br />We&rsquo;ll make it <em>enormous</em>.</h1>
    <p>Printed and cut around the outline on rigid ${'3/16'}&Prime; board, in ${SIZES.map((s) => s + '&Prime;').join(', ')}.
       Buy one at a time, or a full sheet &mdash; a sheet works out from ${cheapestEach.size}&Prime; at ${each(cheapestEach)} a head.
       Every price on this page is what we charge; nothing is added at the end.</p>
    <div class="hero-btns">
      <a href="sms:+17738491854?&amp;body=Hi%20June%27s%20Tees!%20I%27d%20like%20big%20head%20cutouts." class="btn btn-gold">Text a photo &rarr;</a>
      <a href="tel:+17738491854" class="btn btn-outline-white">(773) 849-1854</a>
    </div>
    <div class="hero-badges">
      <div class="hero-badge">Chicago &mdash; 3047 N Lincoln Ave</div>
      <div class="hero-badge">Curbside pickup</div>
      <div class="hero-badge">Any photo, any face</div>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-tag">Sizes</div>
    <h2>How big is big?</h2>
    <p class="lead">Every size below is drawn to the same scale, so you can see what you are choosing
       before you order. The measurement is the <b>height</b> of the finished cutout.</p>
    <figure class="scale-figure">
      ${scaleDrawing(SIZES)}
      <figcaption>The ${SIZES.map((s) => s + '&Prime;').join(', ')} cutouts, shown in proportion to one another.</figcaption>
    </figure>
  </div>
</section>

<section class="alt">
  <div class="container">
    <div class="section-tag">By the pack</div>
    <h2>A pack is one full sheet</h2>
    <p class="lead">Cutouts are printed on a sheet and cut out of it, so a sheet is the natural unit.
       The price of a pack is the same whether you order one or ten, and delivery is already in it &mdash;
       which makes it the cheapest way to buy at every size.</p>
    <div class="table-wrap">
      <table class="price-table">
        <thead><tr><th>Size</th><th>Cutouts in a pack</th><th>Price per pack</th><th>Works out to</th></tr></thead>
        <tbody>${packRows}
        </tbody>
      </table>
    </div>
    <div class="pack-grid">${packCards}
    </div>
    <div class="note-band">
      <b>The faces do not have to match.</b> A pack is a quantity, not a design &mdash; send one photo per
      cutout and tell us how many of each. ${packOnly.length ? `The ${packOnly.map((s) => s + '&Prime;').join(' and ')} come
      by the sheet only: a ${packOnly[0]}&Prime; head is wider than the board a single is cut from, so there is no
      smaller way to make one.` : ''}
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-tag">By the single</div>
    <h2>Just need a few?</h2>
    <p class="lead">The ${bothWays.map((s) => s + '&Prime;').join(' and ')} are also sold one at a time, for orders
       too small to want a whole sheet. The more you order, the less each one costs.
       Delivery is added to your quote on single cutouts.</p>
    <div class="ladders">${singleTables}
    </div>
  </div>
</section>

<section class="alt">
  <div class="container">
    <div class="section-tag">Ordering</div>
    <h2>What we need from you</h2>
    <div class="two-col">
      <div>
        <p class="lead" style="margin-bottom:0">Text or email the photo and the size. We will tell you
           before anything is printed if the picture will not hold up at the size you picked &mdash;
           that check is free and it is the one thing that ruins a cutout.</p>
      </div>
      <div>
        <ul>
          <li>A straight-on photo of the face, as large in the frame as you can get it</li>
          <li>Phone photos are fine &mdash; a screenshot of a screenshot usually is not</li>
          <li>The size you want, and how many</li>
          <li>The date you need them by</li>
        </ul>
      </div>
    </div>
    <div class="dl-bar">
      <a href="/downloads/big-head-cutout-pricing.pdf" class="btn btn-gold" download>Download this price list (PDF)</a>
      <a href="sms:+17738491854?&amp;body=Hi%20June%27s%20Tees!%20I%27d%20like%20big%20head%20cutouts." class="btn" style="background:var(--navy);color:#fff">Text us a photo</a>
    </div>
  </div>
</section>

<section>
  <div class="container">
    <div class="section-tag">Questions</div>
    <h2>Big head cutouts, answered</h2>
    <div class="faq-list">${faqHtml}
    </div>
  </div>
</section>

<div class="cta-band">
  <div class="container">
    <h2>Got the photo? That is the hard part done.</h2>
    <p>Text it over and we will come back with a price and a date.</p>
    <div class="hero-btns" style="justify-content:center">
      <a href="sms:+17738491854?&amp;body=Hi%20June%27s%20Tees!%20I%27d%20like%20big%20head%20cutouts." class="btn btn-gold">Text (773) 849-1854</a>
      <a href="/#contact" class="btn btn-outline-white">Email us</a>
    </div>
  </div>
</div>

`;

fs.writeFileSync(OUT, top + BODY + bottom);
console.log('wrote ' + path.relative(ROOT, OUT) + '  (' + (top + BODY + bottom).length + ' bytes)');

/* ── The downloadable ─────────────────────────────────────────────────────── */

const PRINT_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" />
<title>Big Head Cutout Prices &mdash; June&rsquo;s Tees &amp; Things</title>
<style>
  @page{size:letter;margin:12mm 15mm;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font:13px/1.55 -apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;color:#374151;}
  .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #0B1F4B;padding-bottom:10px;}
  .head h1{font-size:23px;font-weight:900;color:#0B1F4B;letter-spacing:-.01em;}
  .head .who{text-align:right;font-size:11px;color:#6B7280;line-height:1.5;}
  .head .who b{color:#0B1F4B;font-size:12.5px;display:block;}
  .intro{margin:14px 0 4px;font-size:12.5px;color:#374151;max-width:76%;}
  h2{font-size:12px;font-weight:800;color:#0B1F4B;text-transform:uppercase;letter-spacing:.09em;margin:20px 0 2px;}
  /* Capped so the whole sheet stays ONE page — it is a handout, and a
     second page that holds only a footer gets thrown away or, worse, printed. */
  .scale{margin:10px 0 2px;text-align:center;}
  .scale svg{height:188px;width:auto;max-width:100%;}
  table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px;}
  th{text-align:left;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#6B7280;padding:0 8px 5px;border-bottom:1.5px solid #0B1F4B;}
  td{padding:6px 8px;border-bottom:1px solid #E5E7EB;}
  td.p{font-weight:800;color:#0B1F4B;text-align:right;white-space:nowrap;}
  td.m{color:#6B7280;text-align:right;white-space:nowrap;}
  .cols{display:flex;gap:26px;}
  .cols>div{flex:1;}
  .note{margin-top:14px;padding:9px 11px;background:#f7f6f3;border-left:3px solid #F0275A;font-size:11.5px;line-height:1.6;}
  .foot{margin-top:18px;padding-top:9px;border-top:1px solid #E5E7EB;font-size:10.5px;color:#6B7280;display:flex;justify-content:space-between;}
</style></head><body>
  <div class="head">
    <h1>Big Head Cutouts</h1>
    <div class="who"><b>June&rsquo;s Tees &amp; Things</b>3047 N Lincoln Ave #435, Chicago IL 60657<br />(773) 849-1854 &middot; jtees.net</div>
  </div>
  <p class="intro">Printed and cut around the outline on rigid 3/16&Prime; board, in ${SIZES.map((s) => s + '&Prime;').join(', ')}.
     Send us the photo and the size. The measurement is the height of the finished cutout.</p>
  <div class="scale">${scaleDrawing(SIZES)}</div>

  <h2>By the pack &mdash; one full sheet, delivery included</h2>
  <table>
    <thead><tr><th>Size</th><th>In a pack</th><th style="text-align:right">Per pack</th><th style="text-align:right">Each</th></tr></thead>
    <tbody>${packs.map((m) => `
      <tr><td><b>${m.size}&Prime;</b></td><td>${m.pack}</td><td class="p">${money(m.bands[0].price)}</td><td class="m">${each(m)}</td></tr>`).join('')}
    </tbody>
  </table>

  <h2>By the single</h2>
  <div class="cols">${singles.map((m) => `
    <div>
      <table>
        <thead><tr><th>${m.size}&Prime; &mdash; how many</th><th style="text-align:right">Each</th></tr></thead>
        <tbody>${ranges(m).map((r) => `
          <tr><td>${r.label}</td><td class="p">${money(r.price)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`).join('')}
  </div>

  <div class="note">
    <b>The faces do not have to match.</b> A pack is a quantity, not a design &mdash; send one photo per cutout
    and say how many of each.${packOnly.length ? ` The ${packOnly.map((s) => s + '&Prime;').join(' and ')} come by the sheet only:
    they are wider than the board a single is cut from.` : ''}
    Delivery is included in pack prices and added to the quote on single cutouts.
  </div>

  <div class="foot"><span>Prices current as of ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</span><span>jtees.net/services/big-head-cutouts.html</span></div>
</body></html>`;

fs.mkdirSync(path.dirname(PRINT), { recursive: true });
fs.writeFileSync(PRINT, PRINT_HTML);
console.log('wrote ' + path.relative(ROOT, PRINT));

if (PDF) {
  if (!fs.existsSync(CHROME)) { console.error('Chrome not found at ' + CHROME + ' — skipping PDF'); process.exit(1); }
  execFileSync(CHROME, ['--headless', '--disable-gpu', '--no-pdf-header-footer',
    '--print-to-pdf=' + PDF_OUT, 'file://' + PRINT], { stdio: 'pipe' });
  console.log('wrote ' + path.relative(ROOT, PDF_OUT) + '  (' + fs.statSync(PDF_OUT).size + ' bytes)');
}
