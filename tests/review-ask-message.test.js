'use strict';

/* The review ask has ONE wording, and every list that names a customer offers
 * it to copy.
 *
 * It used to exist only on the "paid, but no email" list. The customers June
 * was most likely to chase by hand — the ones WITH an email, sitting in the
 * backfill list — got a tick box that queued an automated send and no message
 * she could send herself. So the two lists asked the same question different
 * ways depending on which one someone landed in.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* Lift the wording itself so the test reads what actually ships. */
function askFor(name, reviewUrl) {
  const m = src.match(/const askFor = \(n\) => \{[\s\S]*?\n    \};/);
  assert.ok(m, 'askFor not found in server.js');
  return vm.runInThisContext(
    '(function(GOOGLE_REVIEW_URL){' + m[0].replace('const askFor', 'var askFor') +
    '\nreturn askFor;})')(reviewUrl)(name);
}

test('the message is addressed, signed and carries the review link', () => {
  const msg = askFor('Walter Payton', 'https://g.page/r/EXAMPLE');
  assert.match(msg, /^Hi Walter,/, 'it should open with the first name only');
  assert.match(msg, /June's Tees/, "it should say who it is from");
  assert.match(msg, /Google review/i);
  assert.ok(msg.includes('https://g.page/r/EXAMPLE'), 'the review link is missing');
});

test('a customer with no name still gets a sendable message', () => {
  for (const n of ['', null, undefined, '   ']) {
    const msg = askFor(n, 'https://example.com/r');
    assert.match(msg, /^Hi, it's June's Tees/, 'got: ' + msg);
    assert.equal(/Hi\s+,/.test(msg), false, 'a dangling comma after Hi');
  }
});

test('only the first name is used, however the name was stored', () => {
  assert.match(askFor('walter payton jr', 'x'), /^Hi walter,/);
  assert.match(askFor('  Walter   Payton  ', 'x'), /^Hi Walter,/);
});

test('there is exactly ONE wording, not one per list', () => {
  /* The old smsFor is gone; a second copy would mean the shop's voice drifts
     between the list a customer happens to land in. */
  assert.equal(/smsFor/.test(src), false, 'smsFor is back — there are two wordings again');
  assert.equal((src.match(/const askFor = /g) || []).length, 1);
});

/* Since 2026-09-28 the two lists are one, and the message is shown once: a
   copy of it under every row made the list a screen of the same paragraph. */
const page = src.slice(src.indexOf("app.get('/admin/reviews'"), src.indexOf("app.post('/admin/reviews/backfill'"));

test('every customer on the list can be sent the message', () => {
  /* One box, with a Copy button, for the asks June sends herself. A customer
     with only a phone cannot be queued, so their row carries the message
     addressed to them, in a Text link that opens her messages app with it
     written in. Without either, a row is a tick box with nothing to send. */
  assert.match(page, /<textarea id="ask-text"[^>]*>\$\{escEmail\(askFor\(''\)\)\}<\/textarea>/,
    'the shared message box is gone');
  assert.match(page, /data-copy-from="ask-text"/, 'nothing copies the shared message');
  assert.match(page, /sms:\$\{tel\}\?&body=\$\{encodeURIComponent\(askFor\(q\.name\)\)\}/,
    'a customer with only a phone has no message to send');
});

test('the copy box cannot be edited into something that was never sent', () => {
  const box = (page.match(/<textarea id="ask-text"[^>]*>/) || [''])[0];
  assert.match(box, /readonly/, 'the box should be readonly');
  assert.match(box, /onclick="this\.select\(\)"/, 'clicking it should select the whole message');
});
