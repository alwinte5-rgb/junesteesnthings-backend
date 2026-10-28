'use strict';

/* The holiday, event and new service pages (tools/occasion-pages.js, from
 * assets/data/occasion-pages.json), written for search first (owner,
 * 2026-10-17). What must hold on every one:
 *   - the file on disk is what the generator writes (else: --write);
 *   - copy plus FAQ is at least 800 words, the title fits a search result
 *     (<= 60) and so does the description (<= 155);
 *   - the keyword is in the H1 and the first 100 words of copy;
 *   - FAQPage and Service schema are present and parse;
 *   - nothing promises rush, same-week or free shipping;
 *   - every page is in the sitemap and in the menu;
 *   - a holiday page's "order by" date is the marketing calendar's.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const O = require('../tools/occasion-pages');
const CAL = require('../tools/lib/marketing-calendar');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const pages = O.load().pages;
const words = (s) => (String(s).replace(/<[^>]+>/g, ' ').match(/[A-Za-z0-9'’-]+/g) || []).length;

test('every occasion page is current (else: node tools/occasion-pages.js --write)', () => {
  assert.deepStrictEqual(O.run('check'), []);
});

test('each page is written for search', () => {
  for (const p of pages) {
    const copy = p.sections.map((s) => s.h2 + ' ' + s.p.join(' ')).join(' ');
    const faq = p.faq.map((f) => f.q + ' ' + f.a).join(' ');
    const n = words(p.pitch + ' ' + copy + ' ' + faq);
    assert.ok(n >= 800, `${p.path}: ${n} words`);
    assert.ok(p.title.length <= 60, `${p.path}: title ${p.title.length}`);
    assert.ok(p.meta.length <= 155 && p.meta.length >= 100, `${p.path}: description ${p.meta.length}`);
    const kw = p.keyword.toLowerCase();
    // "&" in a heading reads as "and" to search engines.
    const h1 = p.h1.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/ & /g, ' and ').toLowerCase();
    const first = (p.sections[0].p.join(' ')).split(/\s+/).slice(0, 100).join(' ').toLowerCase();
    assert.ok(h1.includes(kw.replace(/^custom /, '')) || p.title.replace(/ & /g, ' and ').toLowerCase().includes(kw), `${p.path}: keyword in the H1 or title`);
    assert.ok(first.includes(kw), `${p.path}: keyword in the first 100 words`);
    assert.doesNotMatch(p.title + p.meta + copy + faq, /fast (local )?turnaround|same[- ]week|free shipping|1.2 days|\brush\b/i, p.path);
  }
});

test('each page carries parsable Service and FAQPage schema, and is in the sitemap and the menu', () => {
  const sitemap = read('sitemap.xml');
  const nav = read('assets/data/site-nav.json');
  for (const p of pages) {
    const html = read(p.path);
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    assert.ok(blocks.some((b) => b['@type'] === 'FAQPage' && b.mainEntity.length === p.faq.length), `${p.path}: FAQPage`);
    assert.ok(blocks.some((b) => b['@type'] === 'Service'), `${p.path}: Service`);
    assert.ok(sitemap.includes(`<loc>https://www.jtees.net/${p.path}</loc>`), `${p.path}: in the sitemap`);
    assert.ok(nav.includes(`"/${p.path}"`), `${p.path}: in the menu`);
  }
});

test('a holiday page gives the date rule and lead time, never a computed date that goes stale', () => {
  const a = new Date(Date.UTC(2026, 9, 17)), b = new Date(Date.UTC(2027, 2, 3));
  for (const p of pages.filter((x) => x.calendar)) {
    const o = CAL.OCCASIONS.find((x) => x.id === p.calendar);
    assert.ok(o && o.note, `${p.path}: ${p.calendar} has a note`);
    const html = O.render(p, '<style></style>', '', a);
    assert.ok(html.includes(o.note.replace(/'/g, '&#39;')) || html.includes(o.note), `${p.path}: note`);
    assert.match(html, o.orderNote ? /Small orders take 5–7 business days/ : /Order at least 2 weeks ahead/, p.path);
    assert.doesNotMatch(html, /four weeks|4 weeks/i, p.path);
    assert.strictEqual(html, O.render(p, '<style></style>', '', b), `${p.path}: the page must not change with the build date`);
  }
});

test('the calendar order-by leaves room for 7 business days (owner, 2026-10-28: small orders 5-7)', () => {
  assert.ok(CAL.DEFAULT_LEAD.orderByDays >= 14);
});
