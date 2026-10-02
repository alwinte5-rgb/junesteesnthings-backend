'use strict';

/* Photos from the customer's quote page. The browser hands this server a URL,
 * so the URL check is the whole gate: our cloud, an image, the quote folder. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../tools/lib/quote-photos');

const CLOUD = 'jtees';
const ok = 'https://res.cloudinary.com/jtees/image/upload/v1759430000/quote_photos/abc_DEF-123.jpg';

test('a photo this shop uploaded into the quote folder is accepted', () => {
  assert.ok(P.photoUrlOk(ok, CLOUD));
  assert.ok(P.photoUrlOk(ok.replace('v1759430000/', ''), CLOUD), 'no version segment');
  assert.ok(P.photoUrlOk(ok.replace('.jpg', '.HEIC'), CLOUD), 'iPhone HEIC');
  assert.ok(P.photoUrlOk(ok.replace('.jpg', '.pdf'), CLOUD), 'artwork as a PDF');
});

test('anything else is refused', () => {
  const bad = [
    ok.replace('/jtees/', '/someoneelse/'),                  // another account
    ok.replace('quote_photos', 'review_photos'),             // another folder
    ok.replace('/image/', '/raw/'),                          // not an image
    ok.replace('.jpg', '.svg'),                              // script-capable
    ok.replace('https://', 'http://'),
    ok + '?x=1',
    ok.replace('abc_DEF-123', '../grad_orders/x'),
    'javascript:alert(1)',
    'https://res.cloudinary.com/jtees/image/upload/c_fill,w_9/quote_photos/a.jpg', // transformation smuggled in
    ok.replace('abc_DEF-123', 'a'.repeat(400)),
    '', null, undefined, 42, {},
  ];
  for (const u of bad) assert.ok(!P.photoUrlOk(u, CLOUD), 'accepted: ' + String(u).slice(0, 90));
});

test('no cloud name configured means nothing is accepted', () => {
  assert.ok(!P.photoUrlOk(ok, ''));
  assert.strictEqual(P.cloudName({}), '');
  assert.strictEqual(P.cloudName({ CLOUDINARY_NAME: 'jtees' }), 'jtees');
  assert.strictEqual(P.cloudName({ CLOUDINARY_CLOUD_NAME: 'a', CLOUDINARY_NAME: 'b' }), 'a');
});

test('photosOf drops malformed rows and keeps order', () => {
  const second = ok.replace('abc', 'xyz');
  const q = { customer_photos: [{ url: ok }, { url: 'https://evil.example/a.jpg' }, null, { url: second }] };
  assert.deepStrictEqual(P.photosOf(q, CLOUD).map((p) => p.url), [ok, second]);
  assert.deepStrictEqual(P.photosOf({ customer_photos: null }, CLOUD), []);
  assert.deepStrictEqual(P.photosOf({}, CLOUD), []);
});

test('thumbnails and views convert the format, so HEIC shows in every browser', () => {
  assert.match(P.thumbUrl(ok), /\/image\/upload\/c_fill,w_160,h_160,q_auto,f_auto\/v1759430000\/quote_photos\//);
  assert.match(P.viewUrl(ok), /\/image\/upload\/f_auto,q_auto\/v1759430000\//);
});

test('a PDF thumbnails from its first page as a JPG, and opens as itself', () => {
  const pdf = ok.replace('.jpg', '.pdf');
  assert.strictEqual(P.thumbUrl(pdf),
    'https://res.cloudinary.com/jtees/image/upload/c_fill,w_160,h_160,q_auto,pg_1/v1759430000/quote_photos/abc_DEF-123.jpg');
  assert.strictEqual(P.viewUrl(pdf), pdf);
});

test('saving a quote emails the customer, and says whether it went', () => {
  assert.match(src, /const emailed = \(!existingQuote \|\| wasDraft\) && q\.email \? await emailQuote\(q\) : null;/);
  assert.match(src, /The email did not go: \$\{escEmail\(emailed\.error\)\}/);
  const rel = src.slice(src.indexOf('async function releaseHeldQuote'));
  assert.match(rel.slice(0, rel.indexOf('\n}\n')), /emailQuote\(q\)/, 'an approved quote is emailed too');
});

/* Wiring, read from the source: the folder is signable, and the add is one
   capped, de-duplicating statement rather than read-then-write. */
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the signature endpoint signs the quote photo folder', () => {
  assert.match(src, /ALLOWED_FOLDERS = \[[^\]]*QPHOTOS\.FOLDER/);
});

test('adding a photo is capped and de-duplicated in the same UPDATE', () => {
  const route = src.slice(src.indexOf("app.post('/q/:code/photos'"));
  const body = route.slice(0, route.indexOf('\n});'));
  assert.match(body, /jsonb_array_length\(COALESCE\(customer_photos, '\[\]'::jsonb\)\) < \$3/);
  assert.match(body, /NOT COALESCE\(customer_photos, '\[\]'::jsonb\) @>/);
  assert.match(body, /QPHOTOS\.photoUrlOk\(url, cloud\)/, 'the URL is checked before any query');
  assert.match(body, /status NOT IN \('held', 'draft'\)/, 'a held or draft quote is not reachable');
  assert.match(body, /cancelled_at/, 'a cancelled order takes no photos');
});
