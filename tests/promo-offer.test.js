'use strict';

/* The standing sign-up / cart offer is a set dollar amount off an order over a
 * floor (owner, 2026-11-14: $15 off $50+), never a percentage, because a
 * percentage scales with exactly the large orders it was never meant for.
 *
 * What must hold:
 *   - the defaults are $15 off $50+, and bad env values fall back to them;
 *   - no customer-facing surface still promises a percentage for this offer;
 *   - the static popup (which cannot read env) says the same words as the helper.
 *
 * Run: node --test tests/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { promoOffer } = require('../tools/lib/promo-offer');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('defaults to $15 off $50+', () => {
  const o = promoOffer({});
  assert.strictEqual(o.amount, 15);
  assert.strictEqual(o.min, 50);
  assert.strictEqual(o.off, '$15 off');
  assert.strictEqual(o.floor, '$50');
  assert.strictEqual(o.short, '$15 off $50+');
});

test('bad or out-of-range env values fall back instead of giving money away', () => {
  for (const amount of ['abc', '0', '-5', '500', '']) {
    assert.strictEqual(promoOffer({ JT_PROMO_AMOUNT: amount }).amount, 15, `amount ${JSON.stringify(amount)}`);
  }
  for (const min of ['abc', '-1', '5000']) {
    assert.strictEqual(promoOffer({ JT_PROMO_MIN: min }).min, 50, `min ${JSON.stringify(min)}`);
  }
  // A floor under twice the amount would let the code eat most of a small order.
  assert.ok(promoOffer({ JT_PROMO_AMOUNT: '40', JT_PROMO_MIN: '45' }).min >= 80);
  // A sane custom offer is honoured, with cents shown only when there are any.
  const o = promoOffer({ JT_PROMO_AMOUNT: '12.5', JT_PROMO_MIN: '60' });
  assert.strictEqual(o.short, '$12.50 off $60+');
});

test('no customer-facing sign-up or cart message still promises a percentage', () => {
  const sms = require('../tools/lib/sms-templates').T;
  const fu = require('../tools/lib/design-followups');
  const R = require('../tools/lib/reintro');
  const out = [
    sms.cartCode({ code: 'ABC', restoreUrl: '' }).body,
    sms.cartFollowup({ code: 'ABC', restoreUrl: 'https://design.jtees.net/capture-cart.php?restore=' + 'a'.repeat(40) }).body,
    fu.followupEmail(3, { code: 'ABC', link: 'https://design.jtees.net/x' }).subject,
    fu.followupEmail(3, { code: 'ABC', link: 'https://design.jtees.net/x' }).inner,
    R.codeText({ code: 'TEXTSABCDE' }).body,
    R.inviteBlock('a@example.com'),
  ];
  for (const s of out) {
    assert.doesNotMatch(s, /\d+% off/, s.slice(0, 80));
    assert.match(s, /\$15 off/, s.slice(0, 80));
  }
  const src = read('server.js');
  assert.doesNotMatch(src, /activePromoPct|promoPct|REINTRO\.PCT/);
  assert.doesNotMatch(read('public/assets/data/site-nav.json'), /10% off/);
});

test('sign-up codes are minted as a dollar amount with the order floor', () => {
  const src = read('server.js');
  const i = src.indexOf('async function mintSignupCode');
  assert.ok(i > -1, 'mintSignupCode not found');
  const body = src.slice(i, i + 1200);
  assert.match(body, /form\.set\('kind', 'amount'\)/);
  assert.match(body, /form\.set\('value', String\(REINTRO\.OFFER\.amount\)\)/);
  assert.match(body, /form\.set\('min_order', String\(REINTRO\.OFFER\.min\)\)/);
});

test('the static texts popup says the same offer as the helper', () => {
  const js = read('public/assets/js/texts-popup.js');
  const o = promoOffer({});
  assert.ok(js.includes(`var OFF = '${o.off}', FLOOR = '${o.floor}';`), 'popup words drifted from tools/lib/promo-offer.js');
  assert.doesNotMatch(js, /% off/);
});

test('a cart text describes the code at the amount the designer issued it', () => {
  const src = read('server.js');
  assert.match(src, /msg: SMS\.cartCode\(\{ code, offer: issuedOffer\(b\), restoreUrl \}\)/);
  assert.match(src, /msg: SMS\.cartFollowup\(\{ code, offer: issuedOffer\(b\), restoreUrl \}\)/);
  const i = src.indexOf('function issuedOffer(b) {');
  const fn = new Function('promoOffer', src.slice(i, src.indexOf('\n}\n', i) + 2) + '\nreturn issuedOffer;')(promoOffer);
  assert.strictEqual(fn({ amount: 10, min: 40 }).short, '$10 off $40+');
  assert.strictEqual(fn({ pct: 10 }).short, '$15 off $50+', 'an older designer build falls back to the default offer');
});

test('a returning sign-up is not told an older code is worth the new offer', () => {
  assert.ok(read('server.js').includes("${again ? 'Your code' : `Your ${REINTRO.OFFER.short} code`}"));
});
