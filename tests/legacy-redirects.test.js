'use strict';

/* Old store URLs land on the matching page now, and new broken links are emailed.
 *
 * GA4 counted hundreds of landings on the 404 page (Jul–Oct 2026) from the old
 * Shopify (/products/…, /pages/…) and WooCommerce (/product/…/) stores. The
 * paths below are real ones from that report. What must hold: each goes where
 * the same thing is sold now; nothing that is not an old store path is touched;
 * a destination never comes from the request; and the sweep emails what is
 * still broken.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { legacyRedirect, LEGACY_PATHS } = require('../tools/lib/legacy-redirects');
const GA = require('../tools/lib/google-analytics');

const D = 'https://design.jtees.net';
const cat = (id) => `${D}/products.php?category_id=${id}`;

test('old products land on the category that sells the same thing now', () => {
  const want = {
    '/product/unisex-gildan-dryblend-hoodie-g125/': cat(53),
    '/product/unisex-gildan-heavy-hoodie-g185/': cat(53),
    '/products/drip-hoodie': cat(53),
    '/product/youth-gildan-heavy-hoodie-g185b/': cat(55),
    '/products/gildan-2000b-youth-t-shirt-1': cat(55),
    '/products/rabbit-skins-fine-jersey-infant-character-hooded-long-sleeve-bodysuit-with-ears-4418': cat(56),
    '/products/gildan-jersey-polo-shirt': cat(59),
    '/products/holloway-polyester-t-shirt': cat(52),
    '/product/bella-canvas-3001-t-shirt/': cat(52),
    '/products/skeleton-hands-t-shirt': cat(52),
    '/products/16x16-throw-pillow': cat(58),
    '/products/20-oz-tumbler-grinch': cat(58),
    '/product/mug/': cat(58),
    '/product/athletic-socks/': cat(58),
    '/product/julian-reunion-mask/': `${D}/collection.php?c=family-reunion`,
    '/products/2023-graduation-cap-celebration-bundle': `${D}/collection.php?c=graduation`,
    '/products/copy-of-2023-graduation-t-shirt-customizable': `${D}/collection.php?c=graduation`,
    '/products/jesus-did-it-t-shirt': `${D}/collection.php?c=church-groups`,
    '/products/copy-of-tiktok-birthday-shirt-customizable': `${D}/collection.php?c=birthday`,
    '/products/business-cards-500-60-bonus-paint-1': '/services/graphic-design.html',
    '/products/560-business-cards-web-1': '/services/graphic-design.html',
  };
  for (const [from, to] of Object.entries(want)) assert.strictEqual(legacyRedirect(from), to, from);
});

test('an old product that matches nothing goes to all products, never a 404', () => {
  assert.strictEqual(legacyRedirect('/products/pies-before-guys'), `${D}/products.php`);
  assert.strictEqual(legacyRedirect('/products/cruise-squad'), `${D}/products.php`);
});

test('old store pages land on their equivalent', () => {
  assert.strictEqual(legacyRedirect('/pages/contact'), '/#contact');
  assert.strictEqual(legacyRedirect('/pages/seller-profile'), '/#about');
  assert.strictEqual(legacyRedirect('/pages/products'), `${D}/products.php`);
  assert.strictEqual(legacyRedirect('/pages/ccpa-opt-out'), `${D}/privacy.php`);
  assert.strictEqual(legacyRedirect('/policies/shipping-policy'), `${D}/terms.php`);
  assert.strictEqual(legacyRedirect('/blogs/news'), '/blog/');
  assert.strictEqual(legacyRedirect('/blogs/news/some-old-post'), '/blog/');
  assert.strictEqual(legacyRedirect('/pages/anything-else'), '/');
  assert.strictEqual(legacyRedirect('/PAGES/Contact/'), '/#contact', 'case and trailing slash do not matter');
});

test('nothing outside the old store paths is touched', () => {
  for (const p of ['/', '/services/embroidery.html', '/blog/', '/q/ABCDEF1234', '/admin/dashboard',
                   '/api/cloudinary-signature', '/webhooks/stripe', '/products', '/productsx/a']) {
    assert.strictEqual(legacyRedirect(p), null, p);
  }
});

test('a destination never comes from the request', () => {
  const evil = ['/products/%2F%2Fevil.com', '/products/https:%2F%2Fevil.com', '/pages/..%2F..%2Fevil',
                '/product/' + 'a'.repeat(400), '/products/\\evil.com'];
  for (const p of evil) {
    const to = legacyRedirect(p);
    assert.ok(to === null || to.startsWith('/') && !to.startsWith('//') || to.startsWith(D + '/'), `${p} -> ${to}`);
    assert.ok(!String(to).includes('evil'), p);
  }
});

test('the route sits before static files and every prefix it listens on is handled', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const route = src.indexOf('app.get(LEGACY_PATHS');
  assert.ok(route > -1, 'route registered');
  assert.ok(route < src.indexOf("app.use(express.static(path.join(__dirname, 'public')"), 'before static files');
  for (const p of LEGACY_PATHS.filter((x) => x.endsWith('/*'))) {
    assert.notStrictEqual(legacyRedirect(p.replace('*', 'some-thing')), null, p);
  }
});

test('the sweep emails Google breakages and new broken links', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const s of ["step('google analytics', googleAnalyticsCheck)", "step('google ads', googleAdsCheck)",
                   "step('broken links', brokenLinksCheck)"]) {
    assert.ok(src.includes(s), s);
  }
  /* Before the digest, so a failure found this hour is in this hour's email. */
  assert.ok(src.indexOf("step('broken links'") < src.indexOf("step('error digest'"));
});

test('yesterday\'s 404 pages come back from GA4, and a broken connection throws', async () => {
  const ENV = { GOOGLE_ADS_CLIENT_ID: 'id', GOOGLE_ADS_CLIENT_SECRET: 'GOCSPX-x', GA4_REFRESH_TOKEN: '1//x' };
  const json = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  const ok = GA.createClient({ env: ENV, fetchImpl: async (url) => url.includes('oauth2')
    ? json(200, { access_token: 'a', expires_in: 3600 })
    : json(200, { rows: [{ dimensionValues: [{ value: 'jtees.net' }, { value: '/old-page' }], metricValues: [{ value: '4' }] }] }) });
  assert.deepStrictEqual(await ok.notFoundPages(), [{ host: 'jtees.net', path: '/old-page', views: 4 }]);
  const off = GA.createClient({ env: { ...ENV, GA4_REFRESH_TOKEN: '' } });
  await assert.rejects(off.notFoundPages(), /not connected/);
});
