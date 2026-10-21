'use strict';

/* The printed-product pages (plan step 5, owner 2026-10-20): calendars, table
 * covers, X-frames, stickers and labels, brochures, pouches. Written by
 * tools/occasion-pages.js (kind "print") from the SinaLite table. What must
 * hold on every one:
 *   - every price on the page is what a staff quote charges for that
 *     quantity (sinalite.js eachFor), and the "from" line is the lowest one;
 *   - the minimum the page promises is the family's real minimum;
 *   - the quote form is on the page with the item ticked (a real pick key);
 *   - Product schema parses and its low price is the page's "from" price;
 *   - no apparel shelves, and no claim that we print it in our shop.
 *
 * The generic SEO rules (word count, title, sitemap, menu) are in
 * tests/occasion-pages.test.js, which covers these pages too.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../tools/occasion-pages');
const SL = require('../tools/lib/sinalite');
const { PICKS } = require('../tools/lib/quote-picks');

const PUBLIC = path.join(__dirname, '..', 'public');
const pages = O.load().pages.filter((p) => p.kind === 'print');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const money = (s) => Number(s.replace(/[$,]/g, ''));

test('there is a page for each SinaLite family sold on its own, except the ones switched off', () => {
  const covered = new Set(pages.flatMap((p) => p.print.families));
  /* Off on purpose (owner, 2026-10-20): calendars until there is a way to
     design one; pouches (500 minimum) until a smaller-run source is found;
     table covers while a DTF-printed cover on a wholesale blank replaces the
     $300 all-over one. Mugs and tumblers: the shop sublimates its own
     (services/custom-glassware.html) for far less than the resold ones. */
  const OFF = new Set(['calendar', 'pouch', 'table_cover', 'mug', 'tumbler']);
  for (const k of Object.keys(SL.table().families)) {
    if (OFF.has(k)) assert.ok(!covered.has(k), `${k} is switched off but has a page`);
    else assert.ok(covered.has(k), `no page sells ${k}`);
  }
});

test('a page that names design fees shows the quote form\'s own prices', () => {
  const { service } = require('../tools/lib/services');
  const { escHtml } = require('../tools/lib/html-escape');
  const brochure = pages.find((p) => p.path === 'print/brochures.html');
  assert.ok((brochure.print.design_fees || []).length, 'the brochure page must state its design fee');
  for (const p of pages) {
    const html = read(p.path);
    assert.match(html, /class="pp-design"/, `${p.path}: design fee box`);
    for (const f of p.print.design_fees || []) {
      const price = '$' + Number(service(f.service).price).toFixed(2);
      assert.ok(html.includes(`${escHtml(f.label)}: <b>${price}</b>`), `${p.path}: ${f.label} ${price}`);
    }
  }
});

test('set runs say they are the only quantities sold, and shipping to the customer is offered', () => {
  for (const p of pages) {
    const html = read(p.path);
    if (p.print.families.some((k) => !SL.table().families[k].any_qty)) assert.match(html, /We only sell in these quantities\./, p.path);
    assert.match(html, /ship your order straight to you/, p.path);
  }
});

test('every price on a page is the staff quote price for that quantity', () => {
  const fams = SL.table().families;
  for (const p of pages) {
    const html = read(p.path);
    const tables = [...html.matchAll(/<table class="pp-table">([\s\S]*?)<\/table>/g)].map((m) => m[1]);
    assert.strictEqual(tables.length, p.print.families.length, p.path);
    p.print.families.forEach((k, i) => {
      const f = fams[k];
      const ladders = [];
      for (const m of f.materials) for (const z of f.sizes) ladders.push(f.prices[m.key][z.key]['']);
      const rows = [...tables[i].matchAll(/<tr><th scope="row">([\d,]+)<\/th>([\s\S]*?)<\/tr>/g)];
      assert.deepStrictEqual(rows.map((r) => Number(r[1].replace(/,/g, ''))), f.runs, `${p.path} ${k}: runs`);
      for (const r of rows) {
        const q = Number(r[1].replace(/,/g, ''));
        const cells = [...r[2].matchAll(/<td>(?:<b>(\$[\d,.]+)<\/b> each<span>(\$[\d,.]+) total|&mdash;)/g)];
        assert.strictEqual(cells.length, ladders.length, `${p.path} ${k} ${q}: columns`);
        cells.forEach((c, j) => {
          const each = SL.eachFor(ladders[j], q, f.any_qty);
          if (!c[1]) { assert.strictEqual(each, null, `${p.path} ${k} ${q} col ${j}: dash but priced`); return; }
          assert.strictEqual(money(c[1]), each, `${p.path} ${k} ${q} col ${j}`);
          assert.strictEqual(money(c[2]), Math.round(each * q * 100) / 100, `${p.path} ${k} ${q} col ${j} total`);
        });
      }
    });
  }
});

test('the "from" line is the lowest price on the page, at its quantity', () => {
  for (const p of pages) {
    const html = read(p.path);
    const all = [...html.matchAll(/<b>(\$[\d,.]+)<\/b> each/g)].map((m) => money(m[1]));
    const low = Math.min(...all);
    const badge = html.match(/<span class="hero-badge">From (\$[\d,.]+) each at ([\d,]+)<\/span>/);
    assert.ok(badge, `${p.path}: from badge`);
    assert.strictEqual(money(badge[1]), low, p.path);
    const sum = O.printSummary(O.printFamilies(p));
    assert.strictEqual(Number(badge[2].replace(/,/g, '')), sum.low.q, p.path);
  }
});

test('the minimum a page promises is the real one', () => {
  const fams = SL.table().families;
  for (const p of pages) {
    const mins = p.print.families.map((k) => fams[k].min);
    for (const b of p.badges) {
      const m = b.match(/Minimum ([\d,]+)\b/);
      if (m) assert.ok(mins.includes(Number(m[1].replace(/,/g, ''))), `${p.path}: badge "${b}" vs minimums ${mins}`);
    }
    const sum = O.printSummary(O.printFamilies(p));
    assert.strictEqual(sum.start.q, Math.min(...mins), p.path);
  }
});

test('the quote form is on the page with this item ticked', () => {
  const keys = new Set(PICKS.map((x) => x.key));
  for (const p of pages) {
    const html = read(p.path);
    assert.ok(keys.has(p.print.pick), `${p.path}: pick ${p.print.pick} is not on the quote form`);
    assert.match(html, new RegExp(`<body data-jt-pick="${p.print.pick}">`), p.path);
    assert.match(html, /id="get-quote"/, `${p.path}: quote form block`);
    assert.match(html, /data-jt-quote-form/, p.path);
    assert.match(html, /\/assets\/js\/quote-form\.js/, p.path);
    assert.doesNotMatch(html, /pb-products/, `${p.path}: no apparel shelves`);
  }
});

test('Product schema parses and agrees with the page', () => {
  for (const p of pages) {
    const html = read(p.path);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const prod = blocks.find((b) => b['@type'] === 'Product');
    assert.ok(prod, `${p.path}: Product`);
    const sum = O.printSummary(O.printFamilies(p));
    assert.strictEqual(prod.offers.lowPrice, sum.low.each.toFixed(2), p.path);
    assert.strictEqual(prod.offers.priceCurrency, 'USD');
    assert.ok(Number(prod.offers.highPrice) >= Number(prod.offers.lowPrice), p.path);
  }
});

test('a column that starts above the smallest run shows a dash, not a broken page', () => {
  const t = SL.table();
  const f = JSON.parse(JSON.stringify(t.families.sticker));
  const m = f.materials[0].key, z = f.sizes[0].key;
  f.prices[m][z][''] = f.prices[m][z][''].filter(([q]) => q >= 50);
  const orig = SL.table;
  SL.table = () => ({ ...t, families: { ...t.families, sticker: f } });
  try {
    const p = pages.find((x) => x.print.families.includes('sticker'));
    const fams = O.printFamilies(p);
    const st = fams.find((x) => x.key === 'sticker');
    assert.strictEqual(st.rows[0].cells[0], null);
    assert.match(O.render(p, '<style></style>', '', new Date()), /not sold at this quantity/);
  } finally { SL.table = orig; }
});

test('stickers and labels say design is included, and their prices carry the $25', () => {
  const html = read('print/stickers-labels.html');
  assert.match(html, /<h3>Design is included<\/h3>/);
  for (const k of ['sticker', 'roll_label']) {
    const f = SL.table().families[k];
    assert.strictEqual(f.design_in, 25, k);
    const d = JSON.parse(fs.readFileSync(SL.DATA_FILE, 'utf8')).products[k];
    const r = d.rows[0];
    const lad = f.prices[r.mat][r.size][''];
    const at = lad.find(([q]) => q === r.qty);
    assert.strictEqual(at[1], SL.priceEach(r.cost, r.ship, r.qty, 25), `${k}: the run price includes the $25`);
    assert.ok(at[1] > SL.priceEach(r.cost, r.ship, r.qty), k);
  }
});

test('the built-in $25 design is charged once per order, even across several runs', () => {
  for (const [k, q] of [['sticker', 500], ['sticker', 2000], ['roll_label', 2000]]) {
    const f = SL.table().families[k];
    const m = f.materials[0].key, z = f.sizes[0].key;
    const lad = f.prices[m][z][''];
    const designFree = lad.map(([n, e]) => [n, (n * e - 25) / n]);
    const withDesign = SL.eachFor(lad, q, false, 25) * q;
    const without = SL.eachFor(designFree, q, false) * q;
    /* Each price rounds up to the cent, so the totals can differ by up to a
       cent a piece; once per run would add $25 for every extra run. */
    assert.ok(Math.abs(withDesign - without - 25) <= q * 0.01 + 0.01, `${k} ${q}: design ${withDesign - without}`);
  }
});

test('every page photo is on disk, sized as written, and records its free-licence source', () => {
  for (const p of pages) for (const ph of p.print.photos || []) {
    const file = path.join(PUBLIC, 'assets', 'images', 'print', ph.file + '.jpg');
    assert.ok(fs.existsSync(file), `${p.path}: ${ph.file}.jpg`);
    assert.match(ph.source || '', /^https:\/\/unsplash\.com\/photos\//, `${p.path}: ${ph.file} needs its source`);
    assert.ok(ph.alt && !/june/i.test(ph.alt), `${p.path}: ${ph.file} alt must not claim it as the shop's work`);
    assert.match(read(p.path), new RegExp(`/assets/images/print/${ph.file}\\.jpg" alt="[^"]+" width="${ph.w}" height="${ph.h}"`));
  }
});

test('the copy never says we print these in our shop, or names the supplier', () => {
  for (const p of pages) {
    const text = read(p.path).replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(text, /printed (in|at) our|in-house|sinalite/i, p.path);
  }
});
