'use strict';

/* The logo by season (owner, 2026-10-25: Christmas emblem until January 15,
   then the original by itself). tools/lib/seasonal.js + the logo-current
   route in server.js. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../tools/lib/seasonal');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the last day is included, in Chicago time', () => {
  assert.strictEqual(S.chicagoDay(new Date('2027-01-16T05:59:59Z')), '2027-01-15');
  assert.strictEqual(S.logoSeason(new Date('2027-01-16T05:59:59Z')).id, 'christmas-2026', '23:59:59 on Jan 15 is still Christmas');
  assert.strictEqual(S.logoSeason(new Date('2027-01-16T06:00:00Z')), null, 'midnight Jan 16 is the shop logo again');
  assert.strictEqual(S.logoSeason(new Date('2026-10-25T05:00:00Z')).id, 'christmas-2026', 'the first day counts');
  assert.strictEqual(S.logoSeason(new Date('2026-10-25T04:59:59Z')), null);
});

test('every logo-current address sends the season file in season and the plain one outside', () => {
  const xmas = new Date('2026-12-01T18:00:00Z'), after = new Date('2027-02-01T18:00:00Z');
  for (const [name, plain] of Object.entries(S.LOGO_FILES)) {
    assert.strictEqual(S.logoFile(name, after), `${S.BRAND}/${plain}`);
    assert.strictEqual(S.logoFile(name, xmas), `${S.BRAND}/seasonal/christmas-2026/${plain}`);
  }
  assert.strictEqual(S.logoFile('../server.js'), null, 'only the listed names');
});

test('each logo-current file on disk is the everyday logo (the route answers first; the copy keeps file checks and a fallback true)', () => {
  for (const [name, plain] of Object.entries(S.LOGO_FILES)) {
    assert.ok(fs.readFileSync(path.join(ROOT, 'public', S.BRAND, name)).equals(fs.readFileSync(path.join(ROOT, 'public', S.BRAND, plain))), `${name} = ${plain}`);
  }
});

test('every season has every logo file', () => {
  for (const s of S.LOGO_SEASONS) for (const plain of Object.values(S.LOGO_FILES)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', S.BRAND, 'seasonal', s.id, plain)), `${s.id}/${plain}`);
  }
});

test('the route answers before the 30-day static cache, and the pages use it', () => {
  const src = read('server.js');
  const route = src.indexOf('logoFile(path.basename(req.path))');
  assert.ok(route !== -1, 'logo-current is answered from seasonal.js');
  assert.match(src.slice(route, route + 300), /max-age=3600/, 'with a 1-hour cache');
  assert.ok(route < src.indexOf("app.use(express.static(path.join(__dirname, 'public')"), 'and ahead of the static files');
  assert.match(read('tools/site-nav.js'), /logo-current\.webp/, 'menu and footer');
  assert.match(read('public/assets/data/site-nav.html'), /logo-current\.webp/);
  assert.match(read('public/assets/js/texts-popup.js'), /logo-current-popup\.png/);
  for (const f of ['tools/lib/events.js', 'tools/lib/partners-invite.js', 'tools/lib/reintro.js']) assert.match(read(f), /logo-current-900\.png/, f);
});

/* The homepage and the Shop menu by season (owner, 2026-10-25: Christmas
   banner and row until December 25, the same for every large event, and
   "make sure the categories change based on the season"). */
const at = (d) => new Date(`${d}T18:00:00Z`);
const ids = (d) => S.homeEvents(at(d)).map((e) => e.id);

test('Christmas is on from today through December 25, and only this year starts early', () => {
  assert.deepStrictEqual(ids('2026-10-24'), []);
  assert.deepStrictEqual(ids('2026-10-25'), ['christmas']);
  assert.ok(ids('2026-12-25').includes('christmas'), 'the day itself');
  assert.ok(!ids('2026-12-26').includes('christmas'), 'gone the day after');
  assert.ok(!ids('2027-10-25').includes('christmas'), 'next year opens on its season start, not October 25');
  assert.ok(ids('2027-11-02').includes('christmas'));
});

test('an event without until:event comes off after its last order day', () => {
  const cal = require('../tools/lib/marketing-calendar');
  const g = cal.nextFor('graduation', at('2027-01-01'));
  assert.ok(ids(cal.ymd(g.orderBy)).includes('graduation'));
  const after = new Date(g.orderBy.getTime() + 2 * 86400000);
  assert.ok(!S.homeEvents(after).map((e) => e.id).includes('graduation'));
});

test('every event is a real occasion, with real products, shelves and photos', () => {
  const cal = require('../tools/lib/marketing-calendar');
  const { data } = require('../tools/page-blocks').load();
  const occ = new Set(cal.OCCASIONS.map((o) => o.id));
  for (const [id, c] of Object.entries(S.HOME_EVENTS)) {
    assert.ok(occ.has(id), `${id} is in the marketing calendar`);
    for (const r of c.rows || [{ products: c.products }]) for (const p of r.products) assert.ok(data.catalog[p], `${id}: ${p} is a page-blocks product`);
    for (const sh of c.shelves) assert.ok(data.rows[sh], `${id}: ${sh} has a shelf`);
    if (c.banner) for (const src of [c.banner.src, ...c.banner.srcset.split(',').map((x) => x.trim().split(' ')[0])]) {
      assert.ok(fs.existsSync(path.join(ROOT, 'public', src)), `${id}: ${src}`);
    }
  }
});

test('the homepage in Christmas season: banner, row, hoodies first', () => {
  const html = read('public/index.html');
  const out = S.dressPage(html, 'index.html', at('2026-10-25'));
  assert.match(out, /class="ss-banner" href="\/occasions\/christmas-shirts-chicago\.html"/);
  assert.match(out, /Christmas &middot; order by Friday, November 27/);
  assert.match(out, /<h2 id="ss-christmas-h">Christmas gifts<\/h2>/, 'gifts first (owner)');
  assert.match(out, /<h2 id="ss-christmas-1-h">Matching Christmas clothing<\/h2>/, 'then the clothing');
  assert.ok(out.indexOf('ss-christmas-h') < out.indexOf('ss-christmas-1-h'));
  assert.match(out, /pb-row pb-row-lg ss-row-4">\s*<a class="pb-card" href="https:\/\/design\.jtees\.net\/product\.php\?product_id=523"/, 'four large gift cards, the mug first');
  const shop = (o, head) => o.slice(o.indexOf(head)).match(/category_id=(\d+)/g).slice(0, 3).map((x) => +x.split('=')[1]);
  assert.deepStrictEqual(shop(out, '>Shop</button>'), [53, 52, 55], 'desktop menu');
  assert.deepStrictEqual(shop(out, '<summary>Shop</summary>'), [53, 52, 55], 'phone drawer');
  const shelves = out.slice(out.indexOf('pb-shelves:start')).match(/<h3>([^<]*)<\/h3>/g).slice(0, 3);
  assert.deepStrictEqual(shelves, ['<h3>Hoodies &amp; Sweatshirts</h3>', '<h3>T-Shirts</h3>', '<h3>Kids &amp; Youth</h3>']);
  const after = S.dressPage(html, 'index.html', at('2026-12-26'));
  assert.ok(!/ss-christmas-h|class="ss-banner"/.test(after), 'no Christmas the day after');
});

test('the menu keeps every link when it reorders, and the file holds the everyday version', () => {
  const html = read('public/contact.html');
  const links = (o) => (o.match(/category_id=\d+/g) || []).sort();
  assert.deepStrictEqual(links(S.dressPage(html, 'contact.html', at('2026-10-25'))), links(html));
  assert.strictEqual(read('public/index.html').match(/season-home:start[^>]*-->\n<!-- season-home:end/) !== null, true, 'the slot is empty in the file');
});

test('every page goes through sendPage: after the gated routes, before the static files', () => {
  const src = read('server.js');
  const dress = src.indexOf('SEASONAL.isPage(rel)');
  assert.ok(dress !== -1);
  assert.ok(dress > src.indexOf("app.get(['/partners', '/partners.html']"), 'after /partners, which gates its page');
  assert.ok(dress < src.indexOf("app.use(express.static(path.join(__dirname, 'public')"), 'before the static files');
  assert.doesNotMatch(src, /sendFile\(path\.join\(__dirname, 'public', '[^']+\.html'\)\)/, 'no route sends a page around sendPage');
  for (const r of ["'contact.html'", "'sms-consent.html'", "'sms-terms.html'", "'404.html', 404"]) assert.ok(src.includes(`sendPage(req, res, ${r}`), r);
});

test('only real pages are dressed: no dot folders, no way out of public/', () => {
  for (const ok of ['index.html', 'occasions/christmas-shirts-chicago.html', 'assets/data/site-nav.html']) assert.ok(S.isPage(ok), ok);
  for (const no of ['.well-known/x.html', 'a/.b.html', '../server.js', 'a/../../x.html', 'contact', 'x.htm']) assert.ok(!S.isPage(no), no);
});

test('a dressed page carries its own ETag, and an untouched one goes on to the static files', () => {
  const PUB = path.join(ROOT, 'public');
  const xmas = at('2026-10-25');
  const a = S.dressFile(PUB, 'index.html', xmas), b = S.dressFile(PUB, 'index.html', xmas);
  assert.ok(a && /^W\/"s-/.test(a.etag), 'dressed, with an ETag');
  assert.strictEqual(a.etag, b.etag, 'the same page twice in a day keeps its ETag');
  assert.match(a.html, /ss-christmas-h/);
  assert.strictEqual(S.dressFile(PUB, '.well-known/x.html', xmas), null);
  assert.strictEqual(S.dressFile(PUB, 'no-such-page.html', xmas), null);
});
