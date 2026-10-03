'use strict';

/* jtees.net is the shop's one homepage (2026-10): design.jtees.net's front
 * page was merged into it, shopping first, and that front page will redirect
 * here. What must hold:
 *   - nothing either old homepage said is lost (headings, FAQ questions);
 *   - the owner's settled wording is used, and the old wording is gone;
 *   - the Shop works with no script and no feed (built-in cards);
 *   - no link points at design.jtees.net's front page, which redirects here
 *     (a loop);
 *   - the FAQ structured data matches the questions on the page.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const text = page.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('every section from both old homepages is still here', () => {
  const headings = [
    // jtees.net
    'Your Vision.', 'Our Services', "Our Portfolio — See What We've Made", "More Than A Print Shop —",
    'Give the Gift of Custom Made', 'What Our Customers Say', 'Frequently Asked Questions',
    'Ready To Bring Your Vision To Life?',
    // design.jtees.net
    'Custom T-Shirts & Apparel', 'Ready to Customize', 'Custom Apparel for Every Occasion',
    'The Design Lab makes it fun & easy', 'How to Order Custom Apparel',
    'Ideas & Tips for Your Custom Apparel', 'Product Experts, 7 Days a Week',
    'Custom T-Shirts, Hoodies & More in Chicago', 'Real Human Support', 'No Minimums',
  ];
  for (const h of headings) assert.ok(text.includes(h), 'missing: ' + h);
});

test('every FAQ question from both homepages is answered, and the structured data matches', () => {
  const questions = [
    'Do you have minimums?', 'How much does a custom shirt cost?', 'How fast can you get my order done?',
    'How do I get a quote?', "I don't have a design — can you help?", 'What file types do you need?',
    'Can I order for a group or business?', 'Where are you located, and can I pick up?', 'Do you ship?',
    'How do I care for my custom apparel?',
  ];
  const shown = [...page.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1]);
  assert.deepStrictEqual(shown, questions);
  const ld = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1])).find((d) => d['@type'] === 'FAQPage');
  assert.deepStrictEqual(ld.mainEntity.map((q) => q.name), questions);
  for (const q of ld.mainEntity) assert.doesNotMatch(q.acceptedAnswer.text, /</, 'structured data is plain text: ' + q.name);
});

test("the owner's turnaround and file-type wording, and none of the old", () => {
  assert.match(text, /7–14 business days, depending on the project/);
  assert.match(text, /Rush fees may apply/);
  assert.match(text, /Designing online: upload PNG, JPG, or WEBP/);
  assert.match(text, /Getting a quote: we take vector files \(AI, EPS, SVG\)/);
  for (const old of [/about 7 days/i, /7-Day Delivery/i, /5–10/]) assert.doesNotMatch(text, old);
});

test('the Shop works without the feed: built-in cards, all into the designer', () => {
  for (const id of ['shop-categories', 'shop-best']) {
    const box = page.slice(page.indexOf(`id="${id}"`), page.indexOf('</div>\n    </div>', page.indexOf(`id="${id}"`)));
    const links = [...box.matchAll(/<a class="jt-card" href="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(links.length >= 4, id + ' has built-in cards');
    for (const l of links) assert.match(l, /^https:\/\/design\.jtees\.net\/product/);
  }
  assert.match(page, /<script src="\/assets\/js\/shop-feed\.js" defer><\/script>/);
  assert.match(page, /id="shop"/, 'design.jtees.net/ will redirect to /#shop');
});

test("nothing links to the designer's front page, which will redirect here", () => {
  assert.doesNotMatch(page, /href="https:\/\/design\.jtees\.net\/?"/);
});

test('the quote path is kept: hero button, form, and quote bar', () => {
  assert.match(page, /href="#contact" class="btn btn-secondary" data-from="hero">Get a Free Quote/);
  assert.match(page, /<form id="quote-form" action="\/submit" method="POST">/);
  assert.match(page, /id="quote-bar"/);
});

test('the live cards are built without innerHTML', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'shop-feed.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|document\.write/);
});

test('clicks are tracked by one document listener, so live cards count too', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'analytics.js'), 'utf8');
  assert.match(js, /document\.addEventListener\('click'/);
  assert.match(js, /jtTrack\('shop_card_click'/);
  assert.match(js, /jtTrack\('designer_open', \{ href: href, from: whereFrom\(a\) \}\)/);
});
