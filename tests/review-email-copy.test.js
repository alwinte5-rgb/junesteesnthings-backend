/* Regression tests for the review request email (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The first version went out to six real customers with the subject
 * "How did we do, <Name>?" — which reads as an automated NPS ping and gets
 * treated like one. The rewrite puts the actual thing they bought in the
 * subject, because a question only someone who knows the order could ask is
 * the single biggest lever on whether the mail is opened at all.
 *
 * That only works if the product string is sayable inside a sentence, and the
 * real ones are not uniformly friendly. These are the six live values:
 *
 *   Embroidery Chest Logo                          already fine
 *   Shirt with photo                               already fine
 *   Comfort Colors T-shirt - Navy Blue             colour suffix to drop
 *   Custom Print on Jeans - 2 pair- Princess & Frog quantity noise
 *   Valucap Bio-Washed Classic Dad Hat - VC300A    trailing SKU
 *   Bella+Canvas 3001T — Toddler Jersey Tee        SKU FIRST, name second
 *
 * The last one is why the picker scores segments instead of taking the first:
 * "How did the Bella+Canvas 3001T turn out?" is worse than the generic line it
 * replaced. And the separator needs whitespace around it, or the split lands
 * inside "T-shirt" and "Bio-Washed".
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

/* Run the real function, not a restatement of it. */
const label = (() => {
  const sandbox = { escEmail: (s) => String(s) };
  vm.createContext(sandbox);
  vm.runInContext(extractFn('function reviewItemLabel('), sandbox);
  return sandbox.reviewItemLabel;
})();

/* ── the six values actually in the reviews table ────────────────────────── */

test('a readable name is left alone', () => {
  assert.strictEqual(label('Embroidery Chest Logo'), 'Embroidery Chest Logo');
  assert.strictEqual(label('Shirt with photo'), 'Shirt with photo');
});

test('a colour suffix is dropped', () => {
  assert.strictEqual(label('Comfort Colors T-shirt - Navy Blue'), 'Comfort Colors T-shirt');
});

test('quantity noise is dropped', () => {
  assert.strictEqual(label('Custom Print on Jeans - 2 pair- Princess & Frog'), 'Custom Print on Jeans');
});

test('a trailing SKU is dropped', () => {
  assert.strictEqual(label('Valucap Bio-Washed Classic Dad Hat - VC300A'),
    'Valucap Bio-Washed Classic Dad Hat');
});

test('the human half wins when the SKU comes first', () => {
  assert.strictEqual(label('Bella+Canvas 3001T — Toddler Jersey Tee'), 'Toddler Jersey Tee',
    'taking the first segment would put a SKU in the subject line');
});

/* ── hyphens inside words are not separators ─────────────────────────────── */

test('hyphenated words survive the split', () => {
  assert.match(label('Comfort Colors T-shirt - Navy Blue'), /T-shirt/,
    'an unspaced hyphen is part of the word, not a separator');
  assert.match(label('Valucap Bio-Washed Classic Dad Hat - VC300A'), /Bio-Washed/);
});

/* ── give up rather than ship something mangled ──────────────────────────── */

test('a bare SKU produces nothing, not a broken subject', () => {
  assert.strictEqual(label('VC300A'), '');
});

test('empty and missing input produce nothing', () => {
  for (const v of ['', null, undefined, '   ']) assert.strictEqual(label(v), '');
});

test('something too long for a sentence produces nothing', () => {
  assert.strictEqual(
    label('A ludicrously long product description nobody would want in a subject line'), '');
});

/* ── the email itself ────────────────────────────────────────────────────── */

const REQUEST = extractFn('async function requestReview(');

test('the subject names the item when there is one, and degrades when there is not', () => {
  assert.match(REQUEST, /How did the \$\{item\} turn out/,
    'the item is the whole reason this is opened rather than deleted');
  assert.match(REQUEST, /How did we do\$\{first/,
    'with no usable item name it must still send, not send a broken subject');
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
