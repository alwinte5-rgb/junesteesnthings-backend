'use strict';

/* Business Partners Program, the jtees.net half (tools/lib/partners.js,
   tools/lib/partners-invite.js): the 60-day price, what a code does to a
   quote, which refusals the customer is told about, and who is invited. */

const test = require('node:test');
const assert = require('node:assert');
const P = require('../tools/lib/partners');
const INV = require('../tools/lib/partners-invite');

test('off unless JT_PARTNERS=on', () => {
  assert.strictEqual(P.on({}), false);
  assert.strictEqual(P.on({ JT_PARTNERS: 'on' }), true);
  assert.strictEqual(P.on({ JT_PARTNERS: 'ON' }), true);
  assert.strictEqual(P.on({ JT_PARTNERS: 'true' }), false);
});

test('the price holds for 60 days from the first payment, day 60 included', () => {
  const paid = new Date('2026-01-01T15:00:00Z');
  const day = (n) => new Date(paid.getTime() + n * 86400000);
  assert.strictEqual(P.lockOpen(paid, day(59)), true);
  assert.strictEqual(P.lockOpen(paid, day(60)), true);
  assert.strictEqual(P.lockOpen(paid, new Date(day(60).getTime() + 1000)), false);
  assert.strictEqual(P.lockOpen(paid, day(61)), false);
  assert.strictEqual(P.lockDaysLeft(paid, day(59)), 1);
  assert.strictEqual(P.lockDaysLeft(paid, day(70)), 0);
});

test('an unpaid job has no price to hold', () => {
  assert.strictEqual(P.lockOpen(null), false);
  assert.strictEqual(P.lockUntil(undefined), null);
  assert.strictEqual(P.lockDaysLeft('not a date'), 0);
});

test('a reorder copies the lines exactly, never re-derived, and drops declined options', () => {
  const items = [
    { description: '30 tees', qty: 30, unit_price: 20, unit_override: 18.5, line_total: 600, size_mix: { M: 10, L: 20 } },
    { description: 'Optional hoodie', qty: 5, unit_price: 40, line_total: 200, optional: true },
  ];
  const copy = P.reorderItems(items);
  assert.strictEqual(copy.length, 1);
  assert.deepStrictEqual(copy[0], items[0]);
  copy[0].size_mix.M = 99;
  assert.strictEqual(items[0].size_mix.M, 10, 'a copy, not the same object');
  assert.deepStrictEqual(P.reorderItems(null), []);
});

test('the playbook example: $20 base, 5% reorder = $19, never the 15% welcome price', () => {
  const d = P.discountForCode({ code: 'REORDER5', kind: 'percent', value: 5 }, 600);
  assert.deepStrictEqual([d.kind, d.value], ['pct', 5]);
  // 30 x $20 = $600 at the held price; 5% off = $570, i.e. $19 a shirt.
  assert.strictEqual(600 - 600 * d.value / 100, 570);
});

test('a percentage code with a cap the job exceeds becomes the capped dollars', () => {
  const d = P.discountForCode({ code: 'MAIL15', kind: 'percent', value: 15, max_discount: 150 }, 2000);
  assert.deepStrictEqual([d.kind, d.value], ['amt', 150]);
  const small = P.discountForCode({ code: 'MAIL15', kind: 'percent', value: 15, max_discount: 150 }, 200);
  assert.deepStrictEqual([small.kind, small.value], ['pct', 15]);
});

test('an amount code never takes more than the job', () => {
  const d = P.discountForCode({ code: 'SORRY30', kind: 'amount', value: 30 }, 12);
  assert.deepStrictEqual([d.kind, d.value], ['amt', 12]);
});

test('a code can be entered only before any money moves, on a quote the customer can see', () => {
  const ok = { status: 'sent', paid_amount: 0 };
  assert.strictEqual(P.canEnterCode(ok), true);
  assert.strictEqual(P.canEnterCode({ ...ok, paid_amount: '50.00' }), false);
  assert.strictEqual(P.canEnterCode({ ...ok, status: 'held' }), false);
  assert.strictEqual(P.canEnterCode({ ...ok, status: 'draft' }), false);
  assert.strictEqual(P.canEnterCode({ ...ok, cancelled_at: new Date() }), false);
  assert.strictEqual(P.canEnterCode({ ...ok, requested_items: [{}] }), false);
  assert.strictEqual(P.canEnterCode(null), false);
});

test('only known refusals get a specific message; the rest get the generic one', () => {
  // The designer's own sentences (jt-auth.php jt_promo_block_reason / jt_promo_partner_reason).
  assert.strictEqual(P.promoReasonKey('That code is not valid.'), 'invalid');
  assert.strictEqual(P.promoReasonKey('This code is for Business Partners. Joining is free and takes a minute at jtees.net/partners, then the code works.'), 'partner');
  assert.strictEqual(P.promoReasonKey('Your business has already used this code. Thanks for coming back!'), 'used');
  assert.strictEqual(P.promoReasonKey('Looks like you have already used your discount. Thanks for coming back!'), 'usedemail');
  assert.strictEqual(P.promoReasonKey('That code needs an order of at least $150.00.'), 'min');
  assert.strictEqual(P.promoReasonKey('This code is for reorders: it works once you have a paid order with us.'), 'returning');
  assert.strictEqual(P.promoReasonKey('That code does not start until Nov 1.'), 'generic');
  assert.strictEqual(P.promoReasonKey(undefined), 'generic');
});

test('a ?promo= key from the URL is looked up safely', () => {
  assert.strictEqual(P.promoMessage('toString'), P.PROMO_MESSAGES.generic);
  assert.strictEqual(P.promoMessage('__proto__'), P.PROMO_MESSAGES.generic);
  assert.strictEqual(P.promoMessage('stack'), P.PROMO_MESSAGES.stack);
});

test('the invite goes to everyone once, minus blocked addresses and current partners', () => {
  const contacts = [
    { email: 'Ann@Shop.com', attributes: { FIRSTNAME: 'Ann Lee' } },
    { email: 'ann@shop.com' },
    { email: 'blocked@x.com', emailBlacklisted: true },
    { email: 'partner@biz.com' },
    { email: 'not-an-email' },
    { email: 'bob@home.net' },
  ];
  const out = INV.audience(contacts, new Set(['partner@biz.com']));
  assert.deepStrictEqual(out.map((c) => c.email), ['ann@shop.com', 'bob@home.net']);
  assert.strictEqual(out[0].first, 'Ann');
});

test('the invite links to jtees.net only and names the codes', () => {
  const m = INV.inviteEmail({ first: '<b>x</b>' });
  assert.ok(!/design\.jtees\.net/.test(m.html), 'customers only ever see jtees.net');
  assert.ok(m.html.includes(INV.LINK.replace(/&/g, '&amp;')));
  assert.ok(m.html.includes('MAIL15') && m.html.includes('REORDER5'));
  assert.ok(!m.html.includes('<b>x</b>'), 'the first name is escaped');
});

test('a reorder carries only a sane code from the designer', () => {
  assert.deepStrictEqual(P.reorderPromo({ code: 'reorder5', kind: 'percent', value: 5 }),
    { code: 'REORDER5', kind: 'percent', value: 5, max_discount: 0, min_order: 0, min_items: 0 });
  assert.strictEqual(P.reorderPromo({ code: 'REORDER5', kind: 'percent', value: 5, min_order: '100' }).min_order, 100);
  assert.strictEqual(P.reorderPromo(null), null);
  assert.strictEqual(P.reorderPromo({ code: 'X', kind: 'percent', value: 5 }), null);
  assert.strictEqual(P.reorderPromo({ code: 'REORDER5', kind: 'percent', value: 500 }), null);
  assert.strictEqual(P.reorderPromo({ code: 'REORDER5', kind: 'percent', value: -5 }), null);
  assert.strictEqual(P.reorderPromo({ code: 'REORDER5', kind: 'bogus', value: 5 }), null);
});
