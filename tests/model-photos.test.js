/* tools/model-photos.js — only S&S CDN photos of the exact colour get through. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { viewsOf, colourTitles } = require('../tools/model-photos.js');
const { enjson } = require('../tools/lib/db.js');

test('keeps S&S on-model paths as CDN urls, per view', () => {
  assert.deepStrictEqual(viewsOf({
    colorOnModelFrontImage: 'Images/ModelColor/67443_omf_fm.jpg',
    colorOnModelBackImage: 'Images/ModelColor/67443_omb_fm.jpg',
  }), {
    front: 'https://cdn.ssactivewear.com/Images/ModelColor/67443_omf_fm.jpg',
    back: 'https://cdn.ssactivewear.com/Images/ModelColor/67443_omb_fm.jpg',
  });
});

test('refuses anything that is not an S&S image path', () => {
  assert.deepStrictEqual(viewsOf({ colorOnModelFrontImage: 'https://evil.example/x.jpg' }), {});
  assert.deepStrictEqual(viewsOf({ colorOnModelFrontImage: 'Images/../../etc/passwd' }), {});
  assert.deepStrictEqual(viewsOf({ colorOnModelFrontImage: '' }), {});
  assert.deepStrictEqual(viewsOf(null), {});
});

test('reads colour titles from the product_color attribute only', () => {
  const attrs = enjson({ COL: { type: 'product_color', values: { options: [{ title: 'Black' }, { title: '' }, { title: 'Dust' }] } },
    SZ: { type: 'quantity', values: { options: [{ title: 'M' }] } } });
  assert.deepStrictEqual(colourTitles(attrs), ['Black', 'Dust'], 'stored the way lumise_products stores it');
});
