'use strict';

/* No photo shows twice on the site (owner, 2026-10-17: "check for duplicate
 * images, I keep finding them"). A file-name check missed every repeat she
 * found: the same job saved under two names, a re-crop, a second shot of the
 * same print. tools/photo-dupes.py stores a perceptual hash of every site
 * photo in assets/data/photo-hashes.json; this test reads it and fails if
 *   - a photo a page shows has no hash, or a stale one (re-run the tool);
 *   - one photo is shown on two pages, or twice on one page;
 *   - two different photos on the site are near-matches.
 * The blog index is a list of its posts' covers, so it may repeat them.
 * The Business Partners pages may show work from elsewhere on the site
 * (owner, 2026-10-18: "you can reuse but pick better ones").
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const NAV = require('../tools/site-nav');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const HASHES = JSON.parse(read('assets/data/photo-hashes.json')).photos;
const LISTINGS = new Set(['blog/index.html', 'partners.html']);
/* Photos the owner allows to repeat (owner, 2026-10-23: "it can stay"): the
 * big heads row is the "Design This" card for the big head product, on the
 * big heads and event decor pages, and in the big heads page's gallery. */
const MAY_REPEAT = new Set(['/assets/images/work/big-head-cutouts-row.jpg']);

const dist = (a, b) => { let x = BigInt('0x' + a) ^ BigInt('0x' + b), n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };
// Same rule as tools/photo-dupes.py: whole photos and centres both close,
// or one photo's centre matching the other whole (a re-crop).
const near = (ha, hb) => dist(ha[0], hb[0]) + dist(ha[1], hb[1]) <= 20 || Math.min(dist(ha[0], hb[1]), dist(ha[1], hb[0])) <= 6;

function shown() {
  const where = new Map();
  for (const rel of NAV.pages()) {
    const html = read(rel);
    // class="pb-bd" is a gallery photo's own blurred backdrop, not a second showing.
    for (const m of html.matchAll(/<img(?![^>]*class="pb-bd")[^>]+src="(\/assets\/images\/(?:work|occasions)\/[^"?]+)(?:\?[^"]*)?"/g)) {
      if (!where.has(m[1])) where.set(m[1], []);
      where.get(m[1]).push(rel);
    }
  }
  return where;
}

test('every photo on the site has a current hash', () => {
  for (const src of shown().keys()) {
    const h = HASHES[src];
    assert.ok(h, `${src}: no hash; run python3 tools/photo-dupes.py`);
    assert.strictEqual(h.sha1, crypto.createHash('sha1').update(fs.readFileSync(path.join(PUBLIC, src))).digest('hex'), `${src}: hash is stale; run python3 tools/photo-dupes.py`);
  }
});

test('no photo is shown on two pages, or twice on one', () => {
  for (const [src, pages] of shown()) {
    if (MAY_REPEAT.has(src)) continue;
    const real = pages.filter((p) => !LISTINGS.has(p));
    assert.ok(real.length <= 1, `${src} is on ${real.join(', ')}`);
  }
});

test('no two photos on the site show the same picture', () => {
  const srcs = [...shown().keys()].filter((s) => HASHES[s]);
  const hits = [];
  for (let i = 0; i < srcs.length; i++) {
    for (let j = i + 1; j < srcs.length; j++) {
      if (near(HASHES[srcs[i]].h, HASHES[srcs[j]].h)) hits.push(`${srcs[i]} ~ ${srcs[j]}`);
    }
  }
  assert.deepStrictEqual(hits, []);
});
