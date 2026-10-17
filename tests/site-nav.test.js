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

test("the Design Studio's copy has only absolute links, plus cart and account", () => {
  const snip = read('assets/data/site-nav.html');
  const refs = [...snip.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(refs.filter((h) => !/^(https:\/\/|tel:|sms:)/.test(h)), [], 'a relative link would point at design.jtees.net');
  assert.ok(snip.includes('https://design.jtees.net/cart.php') && snip.includes('https://design.jtees.net/account.php'));
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

test('Text us opens the tracked Tawk messenger; calling always dials', () => {
  const js = read('assets/js/site-nav.js');
  // sms: links are taken over only when Tawk can open, so the link never goes dead.
  assert.match(js, /closest\('a\[href\^="sms:"\]'\)/);
  assert.match(js, /typeof tawk\.maximize !== 'function'\) return;/);
  assert.doesNotMatch(js, /href\^="tel:"/, 'calls are never routed to the chat');
  const snip = read('assets/data/site-nav.html');
  assert.doesNotMatch(snip, /class="[^"]*hcontact/, 'no menu link is left to the old desktop-only chat script');
});

test('product search is in the menu on every page and the phone drawer', () => {
  const snip = read('assets/data/site-nav.html');
  // A plain GET form to the Design Studio product list, so it works with no script.
  const forms = snip.match(/<form class="jtn-search[^"]*"( hidden)? action="https:\/\/design\.jtees\.net\/products\.php" method="get" role="search"/g) || [];
  assert.strictEqual(forms.length, 2, 'header field + drawer field');
  assert.match(snip, /<input type="search" name="q" maxlength="60"/);
  // The icon is a real link to the list: a tap still lands somewhere if site-nav.js fails.
  assert.match(snip, /<a href="https:\/\/design\.jtees\.net\/products\.php" class="jtn-icon jtn-ico-search"/);
  const js = read('assets/js/site-nav.js');
  assert.match(js, /sIcon\.addEventListener\('click'/);
  const css = read('assets/css/site-nav.css');
  assert.match(css, /\.jtn-ico-search\{display:flex!important;\}/, 'the icon stays on phones');
});

/* The menu is position:sticky. overflow-x:hidden on <html> or <body> makes
   that element the scroll box and the menu scrolls away with the page (owner,
   2026-10-17: "make the top menu sticky" — the homepage and blog had it).
   overflow-x:clip stops sideways scroll and keeps sticky; a rule may write
   hidden first as a fallback for browsers without clip (Safari < 16), as long
   as clip follows it in the same rule. Pages with the menu and every shared
   stylesheet are checked, for any selector that targets html or body. */
test('no page hides overflow on html or body, so the menu stays sticky', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|css)$/.test(e.name)) files.push(p);
    }
  };
  walk(PUBLIC);
  const targetsRoot = (sel) => sel.split(',').some((one) =>
    /(^|[\s>+~])(html|body)(?![\w-])/.test(' ' + one.trim().replace(/[.#:[][^\s>+~]*/g, (m) => m)));
  const bad = [];
  let checked = 0;
  for (const p of files) {
    const text = fs.readFileSync(p, 'utf8');
    if (p.endsWith('.html') && !/class="[^"]*\bjtn\b|site-nav\.css/.test(text)) continue;
    checked++;
    for (const m of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
      const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(/[;>]\s*(?=[^;]*$)/).pop();
      if (!targetsRoot(sel.replace(/<[^>]*>/g, ''))) continue;
      const decls = m[2].split(';').map((d) => d.trim()).filter((d) => /^overflow(-x|-y)?\s*:/.test(d));
      const last = decls[decls.length - 1];
      if (last && /:\s*(hidden|auto|scroll)\b/.test(last)) bad.push(`${path.relative(PUBLIC, p)}: ${m[1].trim().slice(-40)} {${last}}`);
    }
  }
  assert.ok(checked > 20, `pages and stylesheets checked (${checked})`);
  assert.deepStrictEqual(bad, []);
});

/* Every mention of the Design Studio takes you there (owner, 2026-10-17:
   "make sure any mention of the designer takes you there in the link"), and
   the blue bar's "Design your own apparel online" opens the designer. */
test('every Design Studio mention links to the designer', () => {
  const nav = JSON.parse(read('assets/data/site-nav.json'));
  assert.match(nav.announcement[0].href, /^https:\/\/design\.jtees\.net\//, 'the blue bar opens the designer');
  const bad = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return /^(admin|staff|downloads)$/.test(e.name) ? [] : walk(p);
    return e.name.endsWith('.html') ? [p] : [];
  });
  for (const p of walk(PUBLIC)) {
    let html = fs.readFileSync(p, 'utf8').replace(/<head>[\s\S]*?<\/head>/i, '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (/Design Studio/.test(m[2]) && !/href="https:\/\/design\.jtees\.net\//.test(m[1])) bad.push(`${path.relative(PUBLIC, p)}: link "${m[2].replace(/<[^>]+>/g, '').trim().slice(0, 40)}" goes elsewhere`);
    }
    html = html.replace(/<a\b[\s\S]*?<\/a>/gi, '').replace(/<figcaption[\s\S]*?<\/figcaption>/gi, '').replace(/<[^>]+>/g, ' ');
    if (/Design Studio/.test(html)) bad.push(`${path.relative(PUBLIC, p)}: "Design Studio" with no link`);
  }
  assert.deepStrictEqual(bad, []);
});
