'use strict';

/* One menu and one review strip on every jtees.net page (2026-10).
 *
 * The homepage, the service/area pages and the blog had grown three different
 * menus, and only quote pages showed reviews. Both now come from one source
 * each (assets/data/site-nav.json, assets/data/reviews.json), written into the
 * pages by tools/site-nav.js. What must hold:
 *   - no page has drifted from the menu file (run --write after editing it);
 *   - every menu link goes somewhere real;
 *   - no page keeps an old header script that breaks without the old header;
 *   - the review list is valid, its photos exist, and the quote page reads it.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const NAV = require('../tools/site-nav');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');

test('every page has the current menu (else: node tools/site-nav.js --write)', () => {
  assert.deepStrictEqual(NAV.run('check'), []);
  for (const rel of NAV.pages()) {
    const html = read(rel);
    assert.strictEqual(html.split(NAV.START).length - 1, 1, rel + ': exactly one menu');
    assert.doesNotMatch(html, /<div class="announcement-bar"|<header\b|class="mobile-drawer"/, rel + ': an old menu piece is left');
    assert.match(html, /href="\/assets\/css\/site-nav\.css"/, rel + ': menu stylesheet');
  }
});

test('every menu link goes somewhere real', () => {
  const nav = JSON.parse(read('assets/data/site-nav.json'));
  const links = nav.menu.flatMap((m) => m.items ? m.items : [m]).map((i) => i.href);
  for (const href of links) {
    if (href.startsWith('https://design.jtees.net/')) {
      assert.match(href, /^https:\/\/design\.jtees\.net\/(products\.php(\?category_id=\d+)?|collection\.php\?c=[a-z-]+|editor\.php\?product_base=\d+)$/, href);
    } else if (href.startsWith('/#')) {
      assert.match(read('index.html'), new RegExp(`id="${href.slice(2)}"`), 'homepage has ' + href);
    } else {
      const file = href.endsWith('/') ? href + 'index.html' : href;
      assert.ok(fs.existsSync(path.join(PUBLIC, file)), 'page exists: ' + href);
    }
  }
  assert.ok(!links.includes('https://design.jtees.net/'), "never the designer's front page, which will redirect home");
});

test('no page keeps a header script that throws without the old header', () => {
  for (const rel of NAV.pages()) {
    const html = read(rel);
    // An unguarded hamburger.addEventListener(...) on a missing element throws
    // and takes the rest of the page's script (forms, quote bar) with it.
    assert.doesNotMatch(html, /\n\s*hamburger\.addEventListener/, rel);
    assert.doesNotMatch(html, /getElementById\('header'\)/, rel);
  }
});

test('the review strip sits above the footer on every page but the homepage and 404', () => {
  for (const rel of NAV.pages()) {
    const html = read(rel);
    if (NAV.NO_REVIEWS.has(rel)) { assert.ok(!html.includes(NAV.RS), rel); continue; }
    if (!/<footer\b/i.test(html)) continue;
    assert.ok(html.indexOf(NAV.RS) < html.search(/<footer\b/i), rel + ': strip before the footer');
    assert.match(html, /href="\/assets\/css\/review-strip\.css"/, rel);
  }
});

test('one review list: valid, photos exist, and the quote page reads it', () => {
  const d = JSON.parse(read('assets/data/reviews.json'));
  assert.ok(d.reviews.length >= 6);
  for (const r of d.reviews) {
    for (const k of ['title', 'text', 'who']) assert.ok(typeof r[k] === 'string' && r[k].length, k);
    if (r.photo) assert.ok(fs.existsSync(path.join(PUBLIC, r.photo)), 'photo exists: ' + r.photo);
  }
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(server, /const SHOP_REVIEWS = require\('\.\/public\/assets\/data\/reviews\.json'\)\.reviews;/);
  assert.match(server, /'public', 'assets', 'css', 'review-strip\.css'/);
  const js = read('assets/js/review-strip.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML/);
});
