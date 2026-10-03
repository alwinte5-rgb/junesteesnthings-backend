'use strict';

/* The homepage's Shop cards come from the designer and are written into the
 * page, so what reaches a browser is cleaned first: links stay on
 * design.jtees.net, photos are https, prices are sane, and a broken answer
 * leaves the page's built-in cards in place rather than an empty shop.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { cleanShopFeed } = require('../tools/lib/shop-feed');

const D = 'https://design.jtees.net/';
const good = {
  ok: true,
  categories: [
    { name: 'T-Shirts', image: 'https://www.ssactivewear.com/a.jpg', link: D + 'products.php?category_id=52' },
    { name: 'Hats & Caps', image: 'http://www.ssactivewear.com/b.jpg', link: D + 'products.php?category_id=57' },
  ],
  best: [
    { name: 'Bella+Canvas 3001', image: 'https://cdn.example/t.jpg', from_price: 12.5, blurb: 'Premium blank, vivid print.', link: D + 'product.php?product_id=14' },
  ],
};

test('a good feed passes through, with http photos upgraded to https', () => {
  const d = cleanShopFeed(good);
  assert.strictEqual(d.categories.length, 2);
  assert.strictEqual(d.categories[1].image, 'https://www.ssactivewear.com/b.jpg');
  assert.deepStrictEqual(d.best[0], good.best[0]);
});

test('a card linking anywhere but the designer is dropped', () => {
  const d = cleanShopFeed({ ...good, categories: [
    { name: 'Evil', image: 'https://x/y.jpg', link: 'https://evil.example/' },
    { name: 'Sneaky', image: 'https://x/y.jpg', link: 'https://design.jtees.net.evil.example/' },
    { name: 'Script', image: 'https://x/y.jpg', link: 'javascript:alert(1)' },
    { name: 'Plain', image: 'https://x/y.jpg', link: 'http://design.jtees.net/products.php' },
    ...good.categories,
  ] });
  assert.deepStrictEqual(d.categories.map((c) => c.name), ['T-Shirts', 'Hats & Caps']);
});

test('photos must be web addresses', () => {
  const d = cleanShopFeed({ ...good, categories: [
    { name: 'Data', image: 'data:image/svg+xml,<svg onload=alert(1)>', link: D },
    { name: 'Js', image: 'javascript:alert(1)', link: D },
    good.categories[0],
  ] });
  assert.deepStrictEqual(d.categories.map((c) => c.name), ['T-Shirts']);
});

test('prices: only a real positive amount, else "custom pricing"', () => {
  const prices = [0, -5, 'abc', null, undefined, 1e9, '19.999'].map((p) =>
    cleanShopFeed({ ...good, best: [{ ...good.best[0], from_price: p }] }).best[0].from_price);
  assert.deepStrictEqual(prices, [null, null, null, null, null, null, 20]);
});

test('names are capped and lists are bounded', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ ...good.best[0], name: 'x'.repeat(500) + i }));
  const d = cleanShopFeed({ ...good, best: many, categories: Array(50).fill(good.categories[0]) });
  assert.strictEqual(d.best.length, 8);
  assert.strictEqual(d.categories.length, 16);
  assert.ok(d.best[0].name.length <= 120);
});

test('anything that is not a feed is refused, so the page keeps its own cards', () => {
  for (const bad of [null, {}, { ok: false }, { ok: true, categories: 'x', best: [] }, 'html']) {
    assert.strictEqual(cleanShopFeed(bad), null);
  }
});

test('server.js keeps the last good copy and reports a failure', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = src.indexOf('async function getShopFeed');
  const fn = src.slice(start, src.indexOf('\n}\n', start));
  assert.match(fn, /cleanShopFeed\(/, 'the designer answer is cleaned');
  assert.match(fn, /reportError\('shop-feed'/, 'failures reach the error digest');
  assert.match(fn, /return _shopCache\.data;\s*\}\s*$/, 'a failure answers with the last good copy');
});
