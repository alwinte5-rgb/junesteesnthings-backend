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
const marketing = NAV.pages().filter((p) => /^(services|areas|blog)\//.test(p));

test('every page has the current blocks (else: node tools/page-blocks.js --write)', () => {
  assert.deepStrictEqual(PB.validate(data), []);
  assert.deepStrictEqual(PB.run('check'), []);
});

test('every service, area and blog page is listed, so none is left without products', () => {
  assert.deepStrictEqual(marketing.filter((p) => !data.pages[p]), []);
});

test('each page shows products after its opening and reviews after the products', () => {
  for (const rel of marketing) {
    const html = read(rel);
    const at = (n) => html.indexOf(PB.mark(n)[0]);
    assert.ok(at('pb-products') > 0, rel + ': product cards');
    assert.ok(at('pb-reviews') > at('pb-products'), rel + ': reviews follow the products');
    assert.ok(at('pb-reviews') < html.indexOf('<!-- review-strip:start'), rel + ': above the footer strip');
    assert.ok((html.match(/class="pb-card"/g) || []).length >= 4, rel + ': at least four cards');
    assert.match(html, /\/assets\/css\/page-blocks\.css/, rel + ': styles linked');
    assert.match(html, /\/assets\/js\/shop-feed\.js/, rel + ': live refresh loaded');
    if (/^(services|areas)\//.test(rel)) {
      assert.ok(at('pb-hero') > html.indexOf('<section class="hero"'), rel + ': hero photo inside the hero');
      assert.ok(at('pb-work') > at('pb-reviews'), rel + ': recent work further down');
    }
  }
});

test('every card opens the Design Studio and every photo is on disk', () => {
  for (const rel of marketing) {
    const html = read(rel);
    for (const m of html.matchAll(/<a class="pb-card" href="([^"]+)"/g)) {
      const u = new URL(m[1].replace(/&amp;/g, '&'));
      assert.strictEqual(u.host, 'design.jtees.net', `${rel}: ${m[1]}`);
      assert.strictEqual(u.protocol, 'https:');
    }
    for (const m of html.matchAll(/<img src="(\/assets\/[^"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(PUBLIC, m[1])), `${rel}: missing ${m[1]}`);
    }
  }
});

test('the ad pages make no promise the owner has taken back', () => {
  for (const rel of marketing.filter((p) => /^(services|areas)\//.test(p))) {
    const body = read(rel).split('<!-- site-header:end -->')[1];
    assert.doesNotMatch(body, /Rush Available/, rel);
    assert.doesNotMatch(body, /about a week/, rel);
    assert.doesNotMatch(body, /\b12\+/, rel);
    assert.doesNotMatch(body, /Grab it curbside/, rel);
    assert.doesNotMatch(body, /24.48 hour/, rel);
    assert.doesNotMatch(body, /fast turnaround|rush options|same[- ]day|1–2 days|week of graduation/i, rel);
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
