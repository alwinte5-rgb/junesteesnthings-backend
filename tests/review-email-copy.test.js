/* Regression tests for the review request email (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The first version went out to six real customers with the subject
 * "How did we do, <Name>?" — which reads as an automated NPS ping and gets
 * treated like one.
 *
 * The rewrite asks about the order in the owner's own voice. An earlier draft
 * named the PRODUCT in the subject, and that was reverted after reading what
 * the real values actually are:
 *
 *   Valucap Bio-Washed Classic Dad Hat - VC300A
 *   Comfort Colors T-shirt - Navy Blue
 *   Bella+Canvas 3001T — Toddler Jersey Tee
 *   Shirt with photo
 *
 * Those are supplier catalogue names. No customer thinks of their order that
 * way, and dropping one into a sentence made it read like a picking list —
 * worse than the generic line it was meant to improve. The lesson worth
 * keeping: personalising with a field is only an improvement when the field
 * contains something a person would actually say.
 *
 * These tests hold the parts that carry the mail: the voice, the single ask,
 * the preview line, and the route out for an unhappy customer.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

function extractFn(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')' && --parens === 0) { i++; break; }
  }
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`unterminated function reading \`${anchor}\``);
}

/* ── the email itself ────────────────────────────────────────────────────── */

const REQUEST = extractFn('async function requestReview(');

test('the subject asks about the order, in a person\'s voice', () => {
  assert.match(REQUEST, /How did your order turn out/,
    '"How did we do?" is a survey; this is someone asking about a thing they made');
  assert.match(REQUEST, /\$\{first \? ', ' \+ String\(name\)\.split\(' '\)\[0\] : ''\}/,
    'the first name is the only personalisation, and it must survive a missing name');
});

test('the mail carries preview text', () => {
  assert.match(REQUEST, /display:none;max-height:0/,
    'the inbox preview line is read before the mail is opened; leaving it to chance wastes it');
});

test('the unhappy-customer route survives the rewrite', () => {
  assert.match(REQUEST, /P\.S\./);
  assert.match(REQUEST, /SHOP_PHONE/,
    'somebody with a problem must always have a direct line that is not a star rating');
});

test('it is signed by a person', () => {
  assert.match(REQUEST, /\$\{SHOP_SIGNER\}/);
});

test('the star links still carry the rating', () => {
  assert.match(REQUEST, /\$\{link\}\?r=\$\{n\}|r=\$\{n\}/,
    'one-tap rating is the entire mechanism');
});

test('the subject does not name the product', () => {
  assert.doesNotMatch(REQUEST, /reviewItemLabel/,
    'supplier catalogue names read as a picking list, not as a person asking');
  assert.match(REQUEST, /How did your order turn out/);
});

test('the product is gone from the body too', () => {
  assert.doesNotMatch(REQUEST, /\$\{item\}/,
    'half-removing it would leave an empty <strong> in the sentence');
  assert.match(REQUEST, /Your order went out a little while ago/);
});

test('the helper it used was deleted, not left behind', () => {
  assert.doesNotMatch(src, /function reviewItemLabel/,
    'dead code that formats nothing invites someone to wire it back up');
});
