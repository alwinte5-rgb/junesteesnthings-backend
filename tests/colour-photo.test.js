/* A quote line must show the colourway that was chosen.
 *
 * WHAT WENT WRONG
 * ---------------
 * Quote CDAF2C listed a Gildan 18600 in Black and displayed a white-grey
 * hoodie. server.js had preferred the colourway's own picture over the product
 * thumbnail ever since the per-colourway art landed, and that code was right —
 * but jt-catalog.php derives `colours[].image` from a product's VARIATION
 * STAGES, and only the 29 products taken through tools/product-art/ have
 * variations. 409 colourways of 2212 had a picture. The other 1803 fell
 * through to `thumbnail`, which is a photo of one colourway standing in for
 * the whole product — Ash, on #23, under all eighteen of its colour names.
 *
 * Nothing looked broken at any layer: the colour saved correctly, the swatch
 * was right, the price was right, and the picture was a real photo of a real
 * product. Only the colour in it was wrong.
 *
 * WHAT THESE PIN
 * --------------
 * The fallback ORDER, and the map the middle step reads.
 *
 * The order is the part that can regress silently. Art first, because it is
 * cut out and aligned to the garment; supplier photo second; thumbnail last,
 * because a line must never be imageless. Swap the first two and the 29
 * product-art products quietly lose the better picture — which no test that
 * only checked "is there an image" would catch.
 *
 * The map is pinned on SHAPE, not on contents: it is regenerated whenever the
 * catalogue changes, so asserting a particular URL would make a routine
 * refresh fail here. What must hold is that every value is an S&S colour
 * photograph — `Images/Color/`, never `Images/Style/`, which is the marketing
 * shot of a person wearing it and is the mistake this whole area has made
 * twice before.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const MAP = path.join(ROOT, 'data', 'colour-photos.json');

test('the colour photo map exists and every entry is an S&S colourway shot', () => {
  assert.ok(fs.existsSync(MAP),
    'data/colour-photos.json is missing — regenerate with tools/colour-photos.js --write');
  const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
  const ids = Object.keys(map);
  assert.ok(ids.length > 50, 'only ' + ids.length + ' products carry colour photos');

  let colourways = 0;
  for (const id of ids) {
    assert.match(id, /^\d+$/, 'product key is not a numeric id: ' + id);
    const forProduct = map[id];
    assert.ok(forProduct && typeof forProduct === 'object', '#' + id + ' is not an object');
    for (const [name, url] of Object.entries(forProduct)) {
      colourways++;
      assert.ok(name.trim(), '#' + id + ' has a blank colour name');
      /* The garment alone, in the colour ordered. Images/Style/ is a person
         wearing it in whatever colour the supplier shot, which is the bug. */
      assert.match(url, /^https:\/\/cdn\.ssactivewear\.com\/Images\/Color\//,
        '#' + id + ' ' + name + ' is not an S&S colourway photo: ' + url);
    }
  }
  /* Comfortably above the 409 the product-art pipeline alone supplied, so a
     regeneration that silently collapsed to the old coverage fails here. */
  assert.ok(colourways > 1500,
    'only ' + colourways + ' colourways have a photo — the map looks truncated');
});

test('server.js prefers art, then the supplier photo, then the thumbnail', () => {
  const art = src.indexOf('images = [colourRow.image]');
  const photo = src.indexOf('colourPhoto(prod.id, colourRow.name)');
  const thumb = src.indexOf('images = [prod.thumbnail]');

  assert.ok(art > 0, 'the per-colourway art fallback is gone from server.js');
  assert.ok(photo > 0, 'the supplier colour photo fallback is gone from server.js');
  assert.ok(thumb > 0, 'the product thumbnail fallback is gone from server.js');

  assert.ok(art < photo,
    'the supplier photo now runs BEFORE the per-colourway art — the 29 ' +
    'product-art products would lose the aligned cut-out picture');
  assert.ok(photo < thumb,
    'the product thumbnail now runs BEFORE the supplier colour photo — every ' +
    'colourway would show the default colour again');
});

test('a missing map degrades to the thumbnail instead of throwing', () => {
  /* The require is wrapped, and the guard is what keeps a quote saveable on a
     deploy where the file did not ship. Losing either turns a cosmetic
     fallback into a 500 on save. */
  assert.match(src, /COLOUR_PHOTOS = require\('\.\/data\/colour-photos\.json'\)/,
    'the colour photo map is no longer loaded');
  const at = src.indexOf("require('./data/colour-photos.json')");
  const before = src.slice(Math.max(0, at - 200), at);
  assert.match(before, /try\s*\{/, 'the colour photo map is required without a try/catch');
});

test('only S&S colour URLs are ever served from the map', () => {
  /* The map is a committed file, so a bad edit is a stored-XSS-shaped problem
     rather than a typo: these URLs are rendered into the customer's page. The
     reader validates rather than trusting the file, the same rule the uploaded
     images already follow. */
  const at = src.indexOf('const colourPhoto =');
  assert.ok(at > 0, 'colourPhoto() is gone from server.js');
  const fn = src.slice(at, at + 400);
  assert.match(fn, /cdn\\\.ssactivewear\\\.com/,
    'colourPhoto() no longer pins the URL to the S&S CDN');
});
