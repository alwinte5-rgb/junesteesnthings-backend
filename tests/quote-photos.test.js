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
  for (const ext of ['pdf', 'ai', 'eps', 'svg', 'psd', 'tif', 'png', 'webp']) {
    assert.ok(P.photoUrlOk(ok.replace('.jpg', '.' + ext), CLOUD), ext);
  }
  /* What Cloudinary's auto upload stores as raw: stitch files and archives. */
  for (const ext of ['dst', 'pes', 'exp', 'emb', 'zip', 'pdf']) {
    assert.ok(P.photoUrlOk(ok.replace('/image/', '/raw/').replace('.jpg', '.' + ext), CLOUD), 'raw ' + ext);
  }
});

test('anything else is refused', () => {
  const bad = [
    ok.replace('/jtees/', '/someoneelse/'),                  // another account
    ok.replace('quote_photos', 'review_photos'),             // another folder
    ok.replace('/image/', '/video/'),                        // not a type the shop takes
    ok.replace('.jpg', '.exe'),
    ok.replace('.jpg', '.html'),
    ok.replace('.jpg', '.js'),
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

const base = 'https://res.cloudinary.com/jtees/image/upload/';
test('a web photo thumbnails and views as itself, format chosen by the browser', () => {
  const d = P.describe(ok, CLOUD, 'Coach Kim.jpg');
  assert.strictEqual(d.kind, 'image');
  assert.strictEqual(d.name, 'Coach Kim.jpg');
  assert.strictEqual(d.thumb, base + 'c_fill,w_160,h_160,q_auto,f_auto/v1759430000/quote_photos/abc_DEF-123.jpg');
  assert.strictEqual(d.view, base + 'f_auto,q_auto/v1759430000/quote_photos/abc_DEF-123.jpg');
});

test('a PDF, AI or EPS thumbnails from its first page and opens as itself', () => {
  for (const ext of ['pdf', 'ai', 'eps']) {
    const u = ok.replace('.jpg', '.' + ext);
    const d = P.describe(u, CLOUD, 'logo.' + ext);
    assert.strictEqual(d.thumb, base + 'c_fill,w_160,h_160,q_auto,pg_1/v1759430000/quote_photos/abc_DEF-123.jpg', ext);
    assert.strictEqual(d.view, u, ext);
  }
});

test('a HEIC, PSD or SVG is shown as a JPG the browser can draw', () => {
  for (const ext of ['heic', 'psd', 'svg', 'tif']) {
    const d = P.describe(ok.replace('.jpg', '.' + ext), CLOUD);
    assert.strictEqual(d.kind, 'image', ext);
    assert.match(d.thumb, /\/c_fill,w_160,h_160,q_auto\/v1759430000\/quote_photos\/abc_DEF-123\.jpg$/, ext);
    assert.match(d.view, /\/q_auto\/v1759430000\/quote_photos\/abc_DEF-123\.jpg$/, ext);
  }
});

test('a stitch file or a ZIP is a named file, linked as-is', () => {
  const u = ok.replace('/image/', '/raw/').replace('.jpg', '.dst');
  assert.deepStrictEqual(P.describe(u, CLOUD, 'Eagle crest.dst'),
    { url: u, kind: 'file', ext: 'dst', name: 'Eagle crest.dst', thumb: '', view: u });
  assert.strictEqual(P.describe(u, CLOUD).name, 'abc_DEF-123.dst', 'no name falls back to the stored one');
});

test('a file name is stored without markup or control characters, and capped', () => {
  assert.strictEqual(P.cleanName('<b>logo</b>\u0000.ai'), 'blogo/b.ai');
  assert.strictEqual(P.cleanName('x'.repeat(300)).length, 120);
  assert.strictEqual(P.cleanName(undefined), '');
});

test('the picker offers the admin form\'s artwork types', () => {
  const adminAccept = /class="fi" multiple[^>]*\n\s*accept="([^"]+)"/.exec(src);
  assert.ok(adminAccept, 'admin artwork input not found');
  assert.strictEqual(P.ACCEPT, adminAccept[1]);
});

test('saving a quote does NOT email the customer: the page asks how to send it', () => {
  /* The owner, 2026-10-06: "on the save can you not auto send the quote. Ask
     to send." Until 2026-10-06 the first save emailed it (emailQuote). */
  assert.doesNotMatch(src, /\? await emailQuote\(q\) : null/);
  assert.match(src, /<b>Send it to the customer\?<\/b>/);
  assert.match(src, /action="\/admin\/quote\/\$\{code\}\/delivered"/);
  /* Emailing it, texting it or marking it sent is what delivers it. */
  assert.match(src, /emailed_at = NOW\(\), delivered_at = COALESCE\(delivered_at, NOW\(\)\)/);
  /* The automatic follow-up is never the first thing a customer hears. */
  const sweep = src.slice(src.indexOf('async function sendQuoteFollowUps'));
  assert.match(sweep.slice(0, sweep.indexOf('\n}\n')), /AND \(delivered_at IS NOT NULL OR status = 'viewed'\)/);
  /* An owner approving a helper's held quote still emails it: the helper is
     not there to be asked. */
  const rel = src.slice(src.indexOf('async function releaseHeldQuote'));
  assert.match(rel.slice(0, rel.indexOf('\n}\n')), /emailQuote\(q\)/, 'an approved quote is emailed');
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
