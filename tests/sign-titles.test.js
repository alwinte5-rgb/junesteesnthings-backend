/* Sign product titles (owner, 2026-10-10: "what's a custom rigid sign? Be more
 * specific in the titles"). The quote form decides a product's sign kind, and
 * prices a saved sign line, from its NAME (quote-signs.js signKindOf), and the
 * product list files it under Signs by name too (server.js PRODUCT_GROUPS). A
 * clearer title that dropped the word they match on would quietly stop the
 * sizer and the server-side sign price, so every title is pinned here. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const QS = require('../tools/lib/quote-signs');
const SP = require('../tools/add-sign-products');
const BN = require('../tools/add-banner-product');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const m = server.match(/\['Signs, Print & Décor',\s*\/(.+?)\/i\]/);
const SIGNS_GROUP = m && new RegExp(m[1], 'i');

test('every sign title gives its own family to the quote form', () => {
  for (const [key, name] of Object.entries(SP.NAMES)) assert.strictEqual(QS.signKindOf(name), key, name);
  assert.strictEqual(QS.signKindOf(BN.NAME), 'banner', BN.NAME);
});

test('the old titles still map the same way (quotes already written use them)', () => {
  for (const [key, name] of Object.entries(SP.OLD_NAMES)) assert.strictEqual(QS.signKindOf(name), key, name);
  assert.strictEqual(QS.signKindOf(BN.OLD_NAME), 'banner');
});

test('every sign title is filed under Signs in the product list', () => {
  assert.ok(SIGNS_GROUP, 'PRODUCT_GROUPS sign rule not found in server.js');
  for (const name of [...Object.values(SP.NAMES), BN.NAME]) assert.match(name, SIGNS_GROUP, name);
});

test('titles say what the product is; no vague "Custom ..." titles left', () => {
  for (const name of [...Object.values(SP.NAMES), BN.NAME]) {
    assert.ok(name.includes(' — '), `${name}: specifics after the dash`);
    assert.doesNotMatch(name, /^Custom (Yard|Rigid|Window|Wall|Vehicle|Photo|Stretched|Size)/, name);
  }
  assert.notStrictEqual(BN.NAME, 'Vinyl Banners', 'the fixed-size banner product already has that name');
  assert.strictEqual(new Set([...Object.values(SP.NAMES), BN.NAME]).size, Object.keys(SP.NAMES).length + 1, 'titles are unique');
});

test('every description opens with what the product is', () => {
  for (const key of Object.keys(SP.NAMES)) {
    assert.ok(SP.LEADS[key] && SP.LEADS[key].length > 40, key);
    assert.ok(SP.descriptionOf(key).startsWith(SP.LEADS[key]), key);
  }
});

test('the shop pictures follow the new titles', () => {
  const thumbs = fs.readFileSync(path.join(__dirname, '..', 'tools', 'make-product-thumbs.js'), 'utf8');
  for (const name of [...Object.values(SP.NAMES), BN.NAME]) assert.ok(thumbs.includes(`'${name}':`), name);
});
