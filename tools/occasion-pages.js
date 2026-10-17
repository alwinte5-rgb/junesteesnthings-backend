'use strict';

/* The holiday, event and new service pages (owner, 2026-10-17: "Christmas,
 * Valentine's day, Easter, mothers day, fathers day, juneteenth ... as new
 * pages loaded with seo and images"; "add sublimation as a service"; "lets
 * add a page for glasswear").
 *
 * Each page is written from public/assets/data/occasion-pages.json in the same
 * shape as the service pages (their styles are read from
 * services/event-decor.html, so the pages always match), then given the same
 * blocks every service page gets: the main photo, the Google rating, shop
 * photos, product cards and reviews (tools/page-blocks.js), and the menu and
 * footer (tools/site-nav.js).
 *
 * A holiday page's "when to order" line comes from the marketing calendar
 * (tools/lib/marketing-calendar.js), so the page and the calendar agree.
 *
 *   node tools/occasion-pages.js --write   write every page
 *   node tools/occasion-pages.js --check   list pages that have drifted (exit 1)
 */

const fs = require('node:fs');
const path = require('node:path');
const { escHtml: esc } = require('./lib/html-escape');
const CAL = require('./lib/marketing-calendar');

const PUBLIC = path.join(__dirname, '..', 'public');
const DATA = path.join(PUBLIC, 'assets', 'data', 'occasion-pages.json');
const SITE = 'https://www.jtees.net';
const TEMPLATE = path.join(PUBLIC, 'services', 'event-decor.html');

/* The service pages' own stylesheet: the first <style> block of the template. */
function baseStyle() {
  const t = fs.readFileSync(TEMPLATE, 'utf8');
  const a = t.indexOf('<style>');
  const b = t.indexOf('</style>', a);
  if (a === -1 || b === -1) throw new Error('services/event-decor.html has no <style> block to copy');
  return t.slice(a, b + '</style>'.length);
}

/* The LocalBusiness block every page carries, copied from the template. */
function businessSchema() {
  const t = fs.readFileSync(TEMPLATE, 'utf8');
  const m = t.match(/<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema\.org",\s*"@type": \["LocalBusiness"[\s\S]*?<\/script>/);
  if (!m) throw new Error('services/event-decor.html has no LocalBusiness schema to copy');
  return m[0];
}

const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

/* Written as the date RULE, never a computed date: the pages are static, and a
   computed "order by" goes stale the day it passes (Halloween's would have
   said "Order by October 17" until Halloween). */
function orderNote(page) {
  if (!page.calendar) return '';
  const o = CAL.OCCASIONS.find((x) => x.id === page.calendar);
  if (!o || !o.note) throw new Error(`${page.path}: calendar "${page.calendar}" has no note in tools/lib/marketing-calendar.js`);
  return `<p class="lead" style="margin-bottom:0"><strong>When to order:</strong> ${esc(o.note)} Order at least 4 weeks ahead: standard turnaround is 7 to 14 business days after you approve the proof.</p>`;
}

function render(page, style, business, now) {
  const url = `${SITE}/${page.path}`;
  const title = page.title;
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
    /* Services have a section to point at; holidays and events have no page
       of their own above them, so they sit straight under Home. */
    ...(page.kind === 'service' ? [{ '@type': 'ListItem', position: 2, name: 'Services', item: `${SITE}/#services` }] : []),
    { '@type': 'ListItem', position: page.kind === 'service' ? 3 : 2, name: strip(page.h1), item: url }] };
  const service = { '@context': 'https://schema.org', '@type': 'Service', serviceType: strip(page.h1).replace(/ in Chicago$/, ''),
    provider: { '@type': 'LocalBusiness', '@id': `${SITE}/#business`, name: "June's Tees & Things" }, areaServed: { '@type': 'City', name: 'Chicago' }, url };
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: page.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  const sections = page.sections.map((s, i) => `<section${i % 2 ? ' class="alt"' : ''}>
  <div class="container">
    ${i === 0 ? `<div class="section-tag">${page.kind === 'service' ? 'The service' : 'Ideas &amp; planning'}</div>\n    ` : ''}<h2>${esc(s.h2)}</h2>
    ${s.p.map((p) => `<p class="lead">${esc(p)}</p>`).join('\n    ')}${i === page.sections.length - 1 ? '\n    ' + orderNote(page) : ''}
  </div>
</section>`).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(page.meta)}" />
  <link rel="canonical" href="${url}" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(page.meta)}" />
  <meta property="og:image" content="${SITE}/assets/images/work/${esc(page.hero)}.jpg" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="June's Tees &amp; Things" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(page.meta)}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
  ${style}
  ${business}
  <script type="application/ld+json">${json(crumbs)}</script>
  <script type="application/ld+json">${json(service)}</script>
  <script type="application/ld+json">${json(faq)}</script>
  <script src="/assets/js/analytics.js"></script>
</head>
<body>
<section class="hero">
  <div class="container">
    <div class="hero-eyebrow">${page.eyebrow}</div>
    <h1>${page.h1}</h1>
    <p>${esc(page.pitch)}</p>
    <div class="hero-btns"><a href="https://design.jtees.net/products.php" class="btn btn-gold">🎨 Design Your Own &rarr;</a><a href="/contact" class="btn btn-outline-white">Request a Quote</a><a href="tel:+17739004592" class="btn btn-outline-white">📞 Call Us</a></div>
    <div class="hero-badges">${page.badges.map((b) => `<span class="hero-badge">${b}</span>`).join('')}</div>
  ${/* the blank line is where page-blocks.js puts the main photo; it keeps the same shape on every run */ ''}
</div>
</section>
${sections}
<section class="alt">
  <div class="container">
    <div class="section-tag">Common questions</div>
    <h2>${esc(strip(page.h1).replace(/ in Chicago$/, ''))} FAQs</h2>
    <div class="faq-list">
      ${page.faq.map((f) => `<details class="faq-item"><summary class="faq-q">${esc(f.q)}</summary><div class="faq-a">${esc(f.a)}</div></details>`).join('\n      ')}
    </div>
  </div>
</section>
<section class="cta-band">
  <div class="container">
    <div class="section-tag">Ready to order?</div>
    <h2>${esc(page.cta.h2)}</h2>
    <p>${esc(page.cta.p)} We reply within one business day.</p>
    <div class="hero-btns" style="justify-content:center"><a href="/contact" class="btn btn-gold">Get a Quote</a><a href="tel:+17739004592" class="btn btn-outline-white">📞 Call Now</a></div>
  </div>
</section>
<section style="background:#fff;padding:3rem 0;border-top:1px solid #E5E7EB;">
  <div class="container">
    <div class="section-tag">Helpful guides</div>
    <h2 style="margin-bottom:1.5rem;">Related Reading</h2>
    <div style="display:flex;flex-wrap:wrap;gap:1rem 3rem;">${page.related.map((r) => `<a href="${esc(r.href)}" style="color:#1848B8;font-weight:600;">&rarr; ${esc(r.label)}</a>`).join('')}</div>
  </div>
</section>
<!--Start of Tawk.to Script-->
<script type="text/javascript">
var Tawk_API=Tawk_API||{}, Tawk_LoadStart=new Date();
(function(){
var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
s1.async=true;
s1.src='https://embed.tawk.to/6ab7385d5cba8d3444b281c7/1k3dr8bcu';
s1.charset='UTF-8';
s1.setAttribute('crossorigin','*');
s0.parentNode.insertBefore(s1,s0);
})();
</script>
<!--End of Tawk.to Script-->
<script src="/assets/js/jt-chat.js?v=20261015b" defer></script>
</body>
</html>
`;
}

const load = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));

/* What every page shares, read once per run: the page-blocks data, the
   template's style and business schema. Checked before any page is built, so
   a typo in a photo key or product id is named, not a bare ENOENT. A page
   that is about to be written for the first time may not exist yet. */
function context() {
  const PB = require('./page-blocks');
  const { data, reviews } = PB.load();
  const mine = new Set(load().pages.map((p) => p.path));
  const bad = PB.validate(data).filter((b) => !(b.endsWith(': no such page') && mine.has(b.slice(0, -': no such page'.length))));
  if (bad.length) throw new Error('occasion-pages.json / page-blocks.json:\n  ' + bad.join('\n  '));
  return { data, reviews, style: baseStyle(), business: businessSchema() };
}

/* The finished page: this file's markup, then the shared blocks, menu and footer. */
function build(page, now, ctx = context()) {
  const PB = require('./page-blocks');
  const NAV = require('./site-nav');
  let html = render(page, ctx.style, ctx.business, now);
  html = PB.apply(html, page.path, ctx.data, ctx.reviews);
  html = NAV.finish(html, page.path);
  return html;
}

function run(mode, now = new Date()) {
  const drifted = [];
  const ctx = context();
  for (const page of load().pages) {
    const file = path.join(PUBLIC, page.path);
    const after = build(page, now, ctx);
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (after !== before) {
      drifted.push(page.path);
      if (mode === 'write') { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, after); }
    }
  }
  return drifted;
}

module.exports = { load, render, build, run };

if (require.main === module) {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  const changed = run(mode);
  if (mode === 'write') console.log(`occasion pages written: ${changed.length}`);
  else if (changed.length) { console.log('occasion pages out of date:\n  ' + changed.join('\n  ') + '\nrun: node tools/occasion-pages.js --write'); process.exit(1); }
  else console.log('every occasion page is current');
}
