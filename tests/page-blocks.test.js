'use strict';

/* Product cards, reviews and photos on the service, area and blog pages
 * (2026-10).
 *
 * Google Ads landed on a service page with no photo but the logo, no product
 * and the only reviews 5,600px down. tools/page-blocks.js now writes the
 * blocks into every page listed in assets/data/page-blocks.json. What must hold:
 *   - no page has drifted from the data file (run --write after editing it);
 *   - every service, area and blog page opens the Design Studio from cards
 *     with real photos, and shows reviews before the footer strip;
 *   - every card stays on design.jtees.net and every photo exists;
 *   - the ad pages no longer promise rush, "about a week" or a 12-piece
 *     screen-print minimum.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const PB = require('../tools/page-blocks');
const NAV = require('../tools/site-nav');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const { data } = PB.load();
const marketing = NAV.pages().filter((p) => /^(services|areas|blog|occasions)\//.test(p));

test('every page has the current blocks (else: node tools/page-blocks.js --write)', () => {
  assert.deepStrictEqual(PB.validate(data), []);
  assert.deepStrictEqual(PB.run('check'), []);
});

test('every service, area and blog page is listed, so none is left without products', () => {
  assert.deepStrictEqual(marketing.filter((p) => !data.pages[p]), []);
});

test('each page runs hero, photos, products, reviews, then its copy, FAQ, call to action and related reading', () => {
  for (const rel of marketing) {
    const html = read(rel);
    const at = (n) => html.indexOf(PB.mark(n)[0]);
    assert.ok(at('pb-products') > 0, rel + ': product cards');
    assert.ok(at('pb-reviews') > at('pb-products'), rel + ': reviews follow the products');
    assert.ok((html.match(/class="pb-card"/g) || []).length >= 4, rel + ': at least four cards');
    assert.match(html, /\/assets\/css\/page-blocks\.css/, rel + ': styles linked');
    assert.match(html, /\/assets\/js\/shop-feed\.js/, rel + ': live refresh loaded');
    if (/^(services|areas|occasions)\//.test(rel)) {
      const hero = html.indexOf('<section class="hero"');
      assert.ok(at('pb-hero') > hero, rel + ': hero photo inside the hero');
      assert.ok(at('pb-rating') > hero && at('pb-rating') < at('pb-hero'), rel + ': rating under the pitch');
      assert.ok(at('pb-work') > hero && at('pb-work') < at('pb-products'), rel + ': shop photos straight after the hero');
      const rest = html.slice(html.indexOf(PB.mark('pb-reviews')[1]));
      const faq = rest.search(/<h2>[^<]*(FAQ|Questions)/i);
      const cta = rest.search(/<(section|div) class="cta-band"/);
      const related = rest.indexOf('Related Reading');
      const footer = rest.search(/<footer\b/i);
      assert.ok(cta !== -1 && footer > cta, rel + ': call to action before the footer');
      if (faq !== -1) assert.ok(faq < cta, rel + ': FAQ before the call to action');
      if (related !== -1) {
        assert.ok(related > cta, rel + ': related reading after the call to action');
        assert.ok(!/<section\b/i.test(rest.slice(rest.indexOf('</section>', related), footer)), rel + ': related reading is the last section');
      }
    }
  }
});

test('reviews show once per page, three at a time, a different three on every page', () => {
  const reviews = JSON.parse(read('assets/data/reviews.json')).reviews;
  const seen = new Map();
  for (const rel of marketing) {
    const html = read(rel);
    assert.ok(!html.includes('<!-- review-strip:start'), rel + ': no second reviews strip');
    assert.strictEqual((html.match(/class="pb-reviews"/g) || []).length, 1, rel + ': one reviews section');
    const cards = [...html.matchAll(/<figure class="pb-rv"( hidden)?>[\s\S]*?<b>([^<]*)<\/b>/g)];
    assert.strictEqual(cards.length, reviews.length, rel + ': every review is in the page for the shuffle');
    const shown = cards.filter((c) => !c[1]).map((c) => c[2]).join('|');
    assert.strictEqual(shown.split('|').length, 3, rel + ': three showing before any script');
    assert.ok(!seen.has(shown), `${rel} shows the same three as ${seen.get(shown)}`);
    seen.set(shown, rel);
    assert.match(html, /\/assets\/js\/pb-reviews\.js/, rel + ': shuffle loaded');
  }
  const js = read('assets/js/pb-reviews.js');
  assert.doesNotMatch(js, /innerHTML|fetch\(/, 'the shuffle only toggles cards already in the page');
});

test('every card opens the Design Studio and every photo is on disk', () => {
  for (const rel of marketing) {
    const html = read(rel);
    for (const m of html.matchAll(/<a class="pb-card" href="([^"]+)"/g)) {
      const u = new URL(m[1].replace(/&amp;/g, '&'));
      assert.strictEqual(u.host, 'design.jtees.net', `${rel}: ${m[1]}`);
      assert.strictEqual(u.protocol, 'https:');
    }
    for (const m of html.matchAll(/<img src="(\/assets\/[^"?]+)/g)) {
      assert.ok(fs.existsSync(path.join(PUBLIC, m[1])), `${rel}: missing ${m[1]}`);
    }
  }
});

test('the ad pages make no promise the owner has taken back', () => {
  for (const rel of marketing.filter((p) => /^(services|areas|occasions)\//.test(p))) {
    const body = read(rel).split('<!-- site-header:end -->')[1];
    assert.doesNotMatch(body, /Rush Available/, rel);
    assert.doesNotMatch(body, /about a week/, rel);
    assert.doesNotMatch(body, /\b12\+/, rel);
    assert.doesNotMatch(body, /Grab it curbside/, rel);
    assert.doesNotMatch(body, /24.48 hour/, rel);
    assert.doesNotMatch(body, /fast (local )?turnaround|rush options|same[- ]day|1–2 days|week of graduation/i, rel);
  }
  // the announcement bar is on every page: no rush promise there
  const nav = JSON.parse(read('assets/data/site-nav.json'));
  for (const a of nav.announcement) assert.doesNotMatch(a.text, /rush/i);
});

test('page cards are refreshed from the feed by link, built with DOM calls only', () => {
  const js = read('assets/js/shop-feed.js');
  assert.match(js, /querySelectorAll\('a\.pb-card'\)/);
  assert.match(js, /byLink\[a\.href\]/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
});

test('data-from names the page in the designer_open event', () => {
  assert.strictEqual(PB.fromTag('services/custom-tshirts-chicago.html'), 'svc_custom_tshirts_chicago');
  assert.strictEqual(PB.fromTag('areas/custom-tshirts-lakeview.html'), 'area_custom_tshirts_lakeview');
  assert.strictEqual(PB.fromTag('blog/index.html'), 'blog_index');
});

test('a page whose end marker was lost fails loudly instead of being spliced', () => {
  const { reviews } = PB.load();
  const rel = 'services/embroidery.html';
  const broken = read(rel).replace(PB.mark('pb-products')[1], '');
  assert.throws(() => PB.apply(broken, rel, data, reviews), /start marker without an end marker/);
});

test('a gallery never repeats its main photo and fills its rows', () => {
  const { data } = PB.load();
  const page = (over) => ({ ...data, featured: {}, pages: { 'services/embroidery.html': { ...data.pages['services/embroidery.html'], ...over } } });
  const w = data.pages['services/embroidery.html'].work;
  assert.match(PB.validate(page({ hero: w[0] })).join('\n'), /main photo repeated/);
  assert.match(PB.validate(page({ work: w.slice(0, 5) })).join('\n'), /gallery has 5 photos/);
  assert.deepStrictEqual(PB.validate(page({ work: w.slice(0, 5), short_gallery: 'testing' })), []);
  assert.deepStrictEqual(PB.validate(data), []);
});

test('a blog page with a gallery shows it after the article, before the cards', () => {
  const html = read('blog/church-group-shirts-chicago.html');
  const main = html.indexOf('</main>');
  const work = html.indexOf('<!-- pb-work:start');
  const cards = html.indexOf('<!-- pb-products:start');
  assert.ok(main !== -1 && work > main && cards > work, 'order: article, gallery, cards');
  assert.ok(html.includes('/assets/images/work/church-fire-of-praise.jpg'));
});

test('every page shows the Design Lab, then three category shelves of real products (owner, 2026-10-17)', () => {
  /* Printed-product pages (calendars, pouches) show no apparel shelves:
     tests/print-pages.test.js holds them to that instead. */
  for (const rel of Object.keys(data.pages).filter((r) => !data.pages[r].print)) {
    const html = read(rel);
    const lab = html.indexOf('<section class="pb-lab"');
    const prod = html.indexOf('<section class="pb-products"');
    assert.ok(lab !== -1 && prod > lab, `${rel}: Design Lab before the products`);
    const box = html.slice(prod, html.indexOf('</section>', prod));
    assert.strictEqual((box.match(/class="pb-shelf"/g) || []).length, 3, `${rel}: three shelves`);
    assert.doesNotMatch(box, /\.svg"/, `${rel}: no drawn placeholder cards`);
  }
});

test('a sign page links each sign designer that has products, and never an empty one (no drawn cards)', () => {
  const html = read('services/banners-signs.html');
  const row = html.slice(html.indexOf('<p class="pb-links">'), html.indexOf('</p>', html.indexOf('<p class="pb-links">')));
  for (const c of [67, 68, 69, 70, 71, 72]) {
    const linked = new RegExp(`products\\.php\\?category_id=${c}"`).test(row);
    /* 2026-10-20: the sign products are switched off, so 67-71 opened "0 products". */
    assert.strictEqual(linked, !data.empty.includes('c' + c), `category ${c}`);
  }
  assert.ok(PB.shelvesFor(data, data.pages['services/banners-signs.html'], 'services/banners-signs.html').length === 3);
});

/* Owner, 2026-10-17: "is the quote form on all the pages" and "collapse the
   faq's, they are long". */
test('every page with a call to action carries the quote form right after it', () => {
  const v = require('../tools/lib/css-tag').scriptTag('/assets/js/quote-form.js').v;
  for (const rel of marketing) {
    const html = read(rel);
    const cta = html.search(/<(section|div) class="cta-band"/);
    assert.ok(cta !== -1, rel + ': call to action');
    const q = html.indexOf(PB.mark('pb-quote')[0]);
    assert.ok(q > cta, rel + ': quote form after the call to action');
    assert.strictEqual((html.match(/data-jt-quote-form/g) || []).length, 1, rel + ': one form mount');
    assert.ok(html.includes(`<script src="/assets/js/quote-form.js?v=${v}" defer></script>`), rel + ': current quote-form.js');
  }
});

test('FAQs are closed until clicked: <details> with a <summary> question', () => {
  for (const rel of marketing) {
    const html = read(rel);
    assert.ok(!/<div class="faq-(item|q)"/.test(html), rel + ': an FAQ that cannot be closed');
    const items = (html.match(/<details class="faq-item">/g) || []).length;
    assert.strictEqual((html.match(/<summary class="faq-q">/g) || []).length, items, rel + ': every FAQ has a question to click');
    assert.ok(!/<details class="faq-item" open/.test(html), rel + ': FAQs start closed');
  }
  const css = read('assets/css/page-blocks.css');
  assert.match(css, /summary\.faq-q\{list-style:none;cursor:pointer\}/);
});

test('photos the owner pulled from the site stay off it', () => {
  // Numbalums (Northwestern band alumni) polo: not cleared for public posting.
  const pulled = ['embroidered-purple-polo'];
  for (const k of pulled) {
    assert.ok(!fs.existsSync(path.join(PUBLIC, 'assets/images/work', k + '.jpg')), k + ': file still served');
    assert.ok(!(k in data.work), k + ': still listed in page-blocks.json');
    // git grep exits 1 when nothing matches, which is the pass.
    const r = require('node:child_process').spawnSync('git', ['grep', '-l', k, '--', 'public', 'Lumise'], { cwd: path.join(PUBLIC, '..'), encoding: 'utf8' });
    const all = (r.stdout || '').trim();
    assert.strictEqual(all, '', k + ' still named in: ' + all);
  }
});

/* Owner, 2026-10-20: "these are the dedicated pages ... match the services to
   the products". A service page's own products come first, in their own
   section after the Design Lab, larger than the shelf cards. */
test('a service page shows the products it is about first, in their own section', () => {
  for (const [rel, f] of Object.entries(data.featured)) {
    const html = read(rel);
    const feat = html.indexOf('<section class="pb-products pb-featured"');
    /* Owner, 2026-10-20: "do the design lab first". */
    assert.ok(feat > html.indexOf('<section class="pb-lab"') && feat < html.indexOf('<section class="pb-products" aria-labelledby="pb-products-h"'), `${rel}: after the Design Lab, before the category shelves`);
    const box = html.slice(feat, html.indexOf('</section>', feat));
    for (const id of f.products) assert.ok(box.includes(`href="${data.catalog[id].link}"`), `${rel}: shows ${id}`);
    for (const c of f.covers || []) {
      const links = html.slice(html.indexOf('<p class="pb-links">'), html.indexOf('</p>', html.indexOf('<p class="pb-links">')));
      assert.ok(!links.includes(data.catalog[c].link + '"'), `${rel}: ${c} is not linked again below`);
    }
  }
  const sub = read('services/sublimation.html');
  const box = sub.slice(sub.indexOf('pb-featured'), sub.indexOf('</section>', sub.indexOf('pb-featured')));
  assert.match(box, /class="pb-row pb-row-lg"/, 'several products make a row of large cards');
  assert.strictEqual((box.match(/Sublimation Tee/g) || []).length >= 3, true, 'and they are sublimation blanks');
  const bh = read('services/big-head-cutouts.html');
  assert.match(bh, /<div class="pb-feature">[\s\S]*product_id=188[\s\S]*<div class="pb-feature-info">[\s\S]*How it works/, 'big heads: the product beside how it works');
  assert.match(bh, /data-own="1"/, 'and its card keeps its own photo (the feed has only a drawing)');
  assert.match(bh, /<section class="alt" id="pricing">/, 'the "every size and price" link has somewhere to land');
});

test('the feed leaves a card with its own photo alone', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'shop-feed.js'), 'utf8');
  const at = js.indexOf("a.getAttribute('data-own') === '1'");
  assert.ok(at !== -1 && at < js.indexOf('img.src = it.image'), 'checked before the photo is swapped');
});

test('a featured product that is not a product, has no photo, or a missing heading is refused', () => {
  const bad = PB.validate({ ...data, featured: { 'services/sublimation.html': { products: ['c52'] } } });
  assert.ok(bad.some((b) => /c52 is not a product/.test(b)) && bad.some((b) => /needs a heading/.test(b)));
});
