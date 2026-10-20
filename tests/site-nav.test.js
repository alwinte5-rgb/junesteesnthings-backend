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
    // Stamped with the stylesheet's hash so a change is never held in a browser cache.
    assert.ok(html.includes(`href="/assets/css/site-nav.css?v=${NAV.CSS_V}"`), rel + ': menu stylesheet, current version');
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
  const flat = (list) => list.flatMap((i) => (i.items ? flat(i.items) : [i]));
  const links = flat(nav.menu).map((i) => i.href);
  for (const href of links) {
    if (href.startsWith('https://design.jtees.net/')) {
      assert.match(href, /^https:\/\/design\.jtees\.net\/(products\.php(\?category_id=\d+)?|collection\.php\?c=[a-z-]+|editor\.php\?product_base=\d+)$/, href);
    } else if (href.startsWith('/#')) {
      assert.match(read('index.html'), new RegExp(`id="${href.slice(2)}"`), 'homepage has ' + href);
    } else {
      // An extensionless page (/contact) is a file plus its own route in server.js.
      const bare = !href.endsWith('/') && !path.extname(href);
      const file = href.endsWith('/') ? href + 'index.html' : bare ? href + '.html' : href;
      assert.ok(fs.existsSync(path.join(PUBLIC, file)), 'page exists: ' + href);
      if (bare) assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'),
        new RegExp(`app\\.get\\('${href.replace(/[/]/g, '\\/')}'`), 'server.js serves ' + href);
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

test('the review strip sits above the footer on pages without their own reviews block', () => {
  const blockPages = new Set(Object.keys(require('../tools/page-blocks').load().data.pages));
  for (const rel of NAV.pages()) {
    const html = read(rel);
    if (NAV.NO_REVIEWS.has(rel) || blockPages.has(rel)) {
      assert.ok(!html.includes(NAV.RS), rel + ': reviews once, not twice');
      assert.ok(!html.includes('review-strip.css'), rel + ': no unused strip styles');
      continue;
    }
    if (!/<footer\b/i.test(html)) continue;
    assert.ok(html.indexOf(NAV.RS) < html.search(/<footer\b/i), rel + ': strip before the footer');
    assert.match(html, /href="\/assets\/css\/review-strip\.css"/, rel);
  }
});

test('one ticker: no page keeps its old marquee under the menu', () => {
  for (const rel of NAV.pages()) {
    const html = read(rel);
    const end = html.indexOf(NAV.END);
    if (end === -1) continue;
    const next = html.slice(end).search(/<(section|main|article)\b/i);
    const head = next === -1 ? html.slice(end) : html.slice(end, end + next);
    assert.ok(!head.includes('class="marquee-strip"'), rel + ': second ticker under the menu');
  }
});

test('a dropdown item with items renders a submenu, on desktop and in the drawer', () => {
  const nav = { ...JSON.parse(read('assets/data/site-nav.json')) };
  nav.menu = [{ label: 'Groups', items: [{ label: 'Birthday', href: '/b' }, { label: 'Holidays', items: [{ label: 'Christmas', href: '/c' }] }] }];
  const html = NAV.render(nav);
  assert.match(html, /<div class="jtn-sub"><button type="button" class="jtn-sub-t" aria-expanded="false">Holidays<\/button><div class="jtn-sub-m"><a href="\/c">Christmas<\/a><\/div><\/div>/);
  assert.match(html, /<details class="jtn-sub-d"><summary>Holidays<\/summary><a href="\/c">Christmas<\/a><\/details>/);
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
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      // The Recent work gallery's photo captions name what is pictured, not a place to go.
      .replace(/<!-- pb-work:start[\s\S]*?<!-- pb-work:end -->/g, '').replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      if (/Design (Studio|Lab)/.test(m[2]) && !/href="https:\/\/design\.jtees\.net\//.test(m[1])) bad.push(`${path.relative(PUBLIC, p)}: link "${m[2].replace(/<[^>]+>/g, '').trim().slice(0, 40)}" goes elsewhere`);
    }
    html = html.replace(/<a\b[\s\S]*?<\/a>/gi, '').replace(/<[^>]+>/g, ' ');
    for (const m of html.matchAll(/Design (Studio|Lab)/g)) bad.push(`${path.relative(PUBLIC, p)}: "${m[0]}" with no link`);
  }
  assert.deepStrictEqual(bad, []);
});

test('a stamped stylesheet replaces the old link where it stood, so later styles still win', () => {
  const { cssTag } = require('../tools/lib/css-tag');
  const css = cssTag('/assets/css/site-nav.css');
  const page = '<head>\n  <link rel="stylesheet" href="/assets/css/site-nav.css" />\n  <style>.jtn{color:red}</style>\n</head>';
  const out = css.put(page);
  assert.ok(out.indexOf(css.tag) > -1 && out.indexOf(css.tag) < out.indexOf('<style>'), 'the link stays before the page style');
  assert.strictEqual(out.split('site-nav.css').length - 1, 1, 'one link, not two');
  assert.strictEqual(css.put(out), out, 'already current: unchanged');
  assert.match(css.put('<head>\n</head>'), /site-nav\.css\?v=[0-9a-f]{8}" \/>\n<\/head>/, 'no link yet: added before </head>');
});

test('every page has the one shared footer, with a working Instagram link', () => {
  const nav = JSON.parse(read('assets/data/site-nav.json'));
  for (const rel of NAV.pages()) {
    const html = read(rel);
    assert.strictEqual((html.match(/<footer\b/gi) || []).length, 1, rel + ': exactly one footer');
    assert.ok(html.includes(NAV.FSTART), rel + ': the shared footer');
    assert.ok(html.includes(`href="${nav.instagram}" target="_blank" rel="noopener noreferrer"`), rel + ': Instagram');
  }
  // Every service and group in the menu is in the footer.
  const foot = NAV.renderFooter(nav);
  for (const m of nav.menu.filter((x) => x.label === 'Services' || x.label === 'Groups & Events')) {
    for (const i of m.items.filter((x) => !x.items && !/→$/.test(x.label))) assert.ok(foot.includes(`href="${i.href}"`), i.label);
  }
});

test('a footer whose end marker was lost fails loudly instead of being spliced', () => {
  const broken = `<html><body>${NAV.FSTART}<footer class="jtf"></footer></body></html>`;
  assert.throws(() => NAV.applyFooter(broken, 'X'), /start marker without an end marker/);
});

/* Owner, 2026-10-18: "the menu seems squished". The brand block sat in one
   narrow grid column beside six link columns and wrapped a word per line. It
   is now a full-width row whose two halves are their own elements, so the
   layout does not hang on the order of its paragraphs. */
test('footer brand block is a full-width row with its own left and right halves', () => {
  const foot = NAV.renderFooter(JSON.parse(read('assets/data/site-nav.json')));
  const brand = foot.slice(foot.indexOf('<div class="jtf-brand">'), foot.indexOf('<div class="jtf-col">'));
  const l = brand.indexOf('<div class="jtf-brand-l">'), r = brand.indexOf('<div class="jtf-brand-r">');
  assert.ok(l > 0 && r > l, 'left half, then right half');
  assert.ok(brand.indexOf('class="jtf-logo"') > l && brand.indexOf('class="jtf-logo"') < r, 'logo on the left');
  assert.ok(brand.indexOf('class="jtf-texts"') < r, 'texts link on the left');
  assert.ok(brand.indexOf('class="jtf-social"') > r, 'buttons on the right');
  const css = read('assets/css/site-nav.css');
  assert.match(css, /\.jtf-brand\{grid-column:1\/-1;display:flex;flex-wrap:wrap/, 'brand spans the row');
  assert.match(css, /\.jtf-in\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/, 'six even link columns');
  assert.ok(!/\.jtf-brand>p:nth-of-type/.test(css), 'no layout tied to paragraph order');
});

/* Owner, 2026-10-20: "the cart says its empty in the menu". The badge reads
   only the count cookie the Design Studio writes, and draws it as text. */
test('the menu cart shows the Design Studio count from jt_cart_n, as text only', () => {
  const js = read('assets/js/site-nav.js');
  const start = js.indexOf('window.jtCartBadge = function');
  const body = js.slice(start, js.indexOf('window.jtCartBadge();', start));
  assert.ok(start !== -1 && !/innerHTML/.test(body), 'no innerHTML');
  const vm = require('node:vm');
  const mk = (cls, href) => ({ cls, href, kids: [], attrs: {}, querySelector() { return this.kids[0] || null; },
    appendChild(c) { this.kids.push(c); c.parent = this; }, setAttribute(k, v) { this.attrs[k] = v; } });
  const icon = mk('jtn-ico-cart'), drawerLink = mk('', 'https://design.jtees.net/cart.php');
  const ctx = { window: {}, document: { cookie: '', querySelectorAll: () => [icon, drawerLink],
    createElement: () => ({ remove() { this.parent.kids = []; } }) }, parseInt, String, Array };
  vm.createContext(ctx);
  vm.runInContext(body + '; window.jtCartBadge();', ctx);
  assert.strictEqual(icon.kids.length, 0, 'no cookie: no badge');
  ctx.document.cookie = 'a=1; jt_cart_n=3; b=2';
  ctx.window.jtCartBadge();
  assert.strictEqual(icon.kids[0].textContent, '3');
  assert.strictEqual(drawerLink.kids[0].textContent, '3', 'the phone drawer link too');
  assert.strictEqual(icon.attrs['aria-label'], 'Cart, 3 items');
  ctx.document.cookie = 'jt_cart_n=250';
  ctx.window.jtCartBadge();
  assert.strictEqual(icon.kids[0].textContent, '99+');
  ctx.document.cookie = 'jt_cart_n=<img src=x>';
  ctx.window.jtCartBadge();
  assert.strictEqual(icon.kids.length, 0, 'anything but a number is ignored');
});
