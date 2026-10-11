/* Codex P2 backlog, backend chunk E (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const QP = require('../tools/lib/quote-photos');
const QA = require('../tools/lib/quote-analytics');
const RR = require('../tools/lib/review-replies');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#139 a 32-pack can carry 32 photos', () => assert.ok(QP.MAX_PHOTOS >= 32));
test('#141 the picker accepts exactly what the server keeps', () => {
  assert.ok(!/image\/\*/.test(QP.ACCEPT));
  assert.ok(QP.photoUrlOk('https://res.cloudinary.com/d/image/upload/quote_photos/a.heic', 'd'));
});
test('#139 a removed photo is deleted, only if it was this quote\'s', () => {
  assert.deepStrictEqual(QP.publicIdOf('https://res.cloudinary.com/d/image/upload/v1/quote_photos/abc.jpg', 'd'), { id: 'quote_photos/abc', type: 'image' });
  const r = after("app.post('/q/:code/photos'", 3000);
  assert.match(r, /AND EXISTS \(SELECT 1 FROM jsonb_array_elements\(customer_photos\) p WHERE p->>'url' = \$2\)/);
  assert.match(r, /cloudinary\.uploader\.destroy\(pid\.id/);
});
test('#139 a failed shop alert is tried again', () => {
  assert.match(after("app.post('/q/:code/photos'", 5000), /UPDATE quotes SET photos_notified_at = NULL WHERE id = \$1/);
});
test('#139 the single offer price is one cutout\'s', () => {
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public/services/big-head-cutouts.html'), 'utf8'), /"18 inch, single","price":"33\.00"/);
});
test('#138 a full payment is "full", and each change request is its own event', () => {
  assert.match(src, /md\.pay_flow === 'full' \? 'full'/);
  assert.notStrictEqual(QA.quoteEvent('AB12CD', { ev: 'changes', r: 'a1' }).once, QA.quoteEvent('AB12CD', { ev: 'changes', r: 'b2' }).once);
});
test('#140 the quote email is on the job history; a redo opens the newest quote', () => {
  assert.match(after('async function emailQuote(', 900), /await sendClientEmail\(\{\s*quote: q\.code, kind: 'quote'/);
  assert.match(src, /ORDER BY q\.created_at DESC LIMIT 1\) AS linked_quote/);
});
test('#142 review drafts: bounded, named, no-key recognised, never doubled', () => {
  assert.match(RR.failureMessage(new Error('Could not resolve authentication method. Expected either apiKey or authToken to be set.')), /not set up yet/);
  const t = fs.readFileSync(path.join(__dirname, '..', 'tools/lib/review-replies.js'), 'utf8');
  assert.match(t, /\{ timeout: 60000, maxRetries: 1 \}/);
  assert.match(after("app.post('/admin/reviews/google-reply'", 1600), /_reviewDraftsInFlight\.get\(key\)/);
});
