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
  assert.deepStrictEqual(d.best[0], { ...good.best[0], colors: [] });
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

test('category cards keep their from-price', () => {
  const d = cleanShopFeed({ ...good, categories: [{ ...good.categories[0], from_price: 5.124 }, { ...good.categories[1], from_price: 0 }] });
  assert.deepStrictEqual(d.categories.map((c) => c.from_price), [5.12, null]);
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

test('every product price passes through for the page cards; only designer product links survive', () => {
  const d = cleanShopFeed({ ...good, products: [
    { link: D + 'product.php?product_id=21', image: 'http://cdn.example/h.jpg', from_price: 20.184 },
    { link: D + 'product.php?product_id=22', image: null, from_price: 0 },
    { link: 'https://evil.example/product.php?product_id=1', image: 'https://cdn.example/x.jpg', from_price: 1 },
    { link: D + 'products.php?category_id=52', from_price: 5 },
  ] });
  assert.deepStrictEqual(d.products, [
    { link: D + 'product.php?product_id=21', image: 'https://cdn.example/h.jpg', from_price: 20.18, colors: [] },
    { link: D + 'product.php?product_id=22', image: '', from_price: null, colors: [] },
  ]);
  assert.deepStrictEqual(cleanShopFeed(good).products, [], 'an older designer sends none');
});

function runPageScript(feed) {
  const vm = require('node:vm');
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'assets', 'js', 'shop-feed.js'), 'utf8');
  const card = (href, price) => {
    const img = { src: 'built-in.jpg' }, pr = { textContent: price };
    /* The card body the dots row is inserted into, after the price. */
    const body = { kids: [pr],
      querySelector: (q) => body.kids.find((k) => '.' + k.className === q) || null,
      insertBefore: (n, ref) => { if (ref) body.kids.splice(body.kids.indexOf(ref), 0, n); else body.kids.push(n); n.parentNode = body; },
      removeChild: (n) => { body.kids.splice(body.kids.indexOf(n), 1); } };
    pr.parentNode = body; pr.nextSibling = null;
    return { href, hidden: false, img, pr, body, querySelector: (q) => (q === '.pb-im img' ? img : q === '.pb-pr' ? pr : null) };
  };
  const cards = [card(D + 'product.php?product_id=21', 'From $1.00 + printing'),
    card(D + 'product.php?product_id=22', 'From $2.00 + printing'),
    card(D + 'product.php?product_id=99', 'From $3.00 + printing'),
    card(D + 'products.php?category_id=52', 'From $4.00 + printing')];
  const store = { jt_shop_feed4: JSON.stringify({ at: Date.now(), d: feed }) };
  vm.runInNewContext(src, {
    window: { fetch: () => { throw new Error('should use the cached feed'); } },
    document: { querySelectorAll: () => cards,
      createElement: () => ({ className: '', style: {}, kids: [], textContent: '', title: '',
        setAttribute(k, v) { this[k] = v; }, appendChild(c) { this.kids.push(c); } }) },
    sessionStorage: { getItem: (k) => store[k] || null, setItem() {} },
    JSON, Date,
  });
  return cards;
}

test('the page script reprices every listed card and hides a switched-off product only with a complete list', () => {
  const products = [
    { link: D + 'product.php?product_id=21', image: 'https://cdn.example/h.jpg', from_price: 20.18 },
    { link: D + 'product.php?product_id=22', image: '', from_price: null },
  ];
  let c = runPageScript({ categories: [], best: [], products, products_complete: true });
  assert.strictEqual(c[0].pr.textContent, 'From $20.18 + printing');
  assert.strictEqual(c[0].img.src, 'https://cdn.example/h.jpg');
  assert.strictEqual(c[1].pr.textContent, 'Priced as you design', 'a product with no set price drops its old price');
  assert.strictEqual(c[1].img.src, 'built-in.jpg', 'no photo in the feed keeps the built-in one');
  assert.strictEqual(c[2].hidden, true, 'a product missing from a complete list is switched off');
  assert.strictEqual(c[3].hidden, false, 'a category card is never hidden');

  c = runPageScript({ categories: [], best: [], products, products_complete: false });
  assert.strictEqual(c[2].hidden, false, 'a list not marked complete hides nothing');
  assert.strictEqual(c[0].pr.textContent, 'From $20.18 + printing');
});

test('a hidden card is really hidden: the card style cannot override it', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'assets', 'css', 'page-blocks.css'), 'utf8');
  assert.match(css, /\.pb-card\[hidden\]\{display:none!important\}/);
});

test('the list counts as complete only when the designer says so and nothing was cut', () => {
  const products = [{ link: D + 'product.php?product_id=21', from_price: 5 }];
  assert.strictEqual(cleanShopFeed({ ...good, products, products_complete: true }).products_complete, true);
  assert.strictEqual(cleanShopFeed({ ...good, products }).products_complete, false);
  assert.strictEqual(cleanShopFeed({ ...good, products: [], products_complete: true }).products_complete, false);
});

test('colours: the server keeps a name and a plain hex, nothing else', () => {
  const d = cleanShopFeed({ ...good,
    best: [{ ...good.best[0], colors: [{ name: 'Black', hex: '#25282A' }, { name: 'Bad', hex: 'red;background:url(x)' }, { name: '', hex: '#fff' }, 'x'] }],
    products: [{ link: D + 'product.php?product_id=21', from_price: 5, colors: [{ name: 'Navy', hex: '#041e42' }] }] });
  assert.deepStrictEqual(d.best[0].colors, [{ name: 'Black', hex: '#25282A' }]);
  assert.deepStrictEqual(d.products[0].colors, [{ name: 'Navy', hex: '#041e42' }]);
  assert.deepStrictEqual(cleanShopFeed(good).best[0].colors, [], 'an older designer sends none');
});

test('colours: the page draws up to 8 dots after the price, then "+N more"', () => {
  const ten = ['#000', '#111', '#222', '#333', '#444', '#555', '#666', '#777', '#888', '#999'].map((hex, i) => ({ name: 'C' + i, hex }));
  const c = runPageScript({ categories: [], best: [], products: [
    { link: D + 'product.php?product_id=21', from_price: 5, colors: ten },
    { link: D + 'product.php?product_id=22', from_price: 5, colors: [{ name: 'Only', hex: '#000' }] },
    { link: D + 'product.php?product_id=99', from_price: 5, colors: [{ name: 'A', hex: 'url(x)' }, { name: 'B', hex: '#fff' }] },
  ], products_complete: false });
  const row = c[0].body.kids[1];
  assert.strictEqual(row.className, 'pb-dots');
  assert.strictEqual(row.kids.filter((k) => k.className === 'pb-dot').length, 8);
  assert.strictEqual(row.kids[0].style.background, '#000');
  assert.strictEqual(row.kids[0].title, 'C0');
  assert.strictEqual(row.kids[8].textContent, '+2 more');
  assert.strictEqual(c[1].body.kids.length, 1, 'one colour: no dots');
  assert.strictEqual(c[2].body.kids.length, 1, 'a bad hex is dropped here too, leaving one: no dots');
});

