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

test('the sitemap lists /partners only while the program is on, once', () => {
  const xml = '<?xml version="1.0"?>\n<urlset>\n  <url><loc>https://www.jtees.net/</loc></url>\n</urlset>\n';
  assert.strictEqual(P.sitemapXml(xml, {}), xml);
  const onXml = P.sitemapXml(xml, { JT_PARTNERS: 'on' });
  assert.ok(onXml.includes('<loc>https://www.jtees.net/partners</loc>'));
  assert.ok(onXml.trimEnd().endsWith('</urlset>'));
  assert.strictEqual(P.sitemapXml(onXml, { JT_PARTNERS: 'on' }), onXml);
});

test('the static sitemap never lists /partners itself (it would 404 while the program is off)', () => {
  const xml = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'sitemap.xml'), 'utf8');
  assert.ok(!/jtees\.net\/(partners|mail15)/.test(xml));
});

/* ── Conveniences for every customer and for partners ──────────────────── */
const PROGRESS = require('../tools/lib/order-progress');
const BRAND = require('../tools/lib/brand-files');
const SIZES = require('../tools/lib/size-collect');

test('order progress: later milestones imply earlier ones, and the next step is the first not done', () => {
  const q = { accepted_at: '2026-10-01', paid_amount: 50, production_at: '2026-10-05' };
  const { list, current } = PROGRESS.steps(q);
  assert.deepStrictEqual(list.map((s) => s.done), [true, true, true, true, false, false]);
  assert.strictEqual(list[current].key, 'ready');
  assert.strictEqual(list[4].label, 'Ready for pickup');
  assert.strictEqual(PROGRESS.steps(q, { ships: true }).list[4].label, 'Shipped');
  assert.strictEqual(PROGRESS.steps({ delivered_at: 'x' }).current, 6);
});

test('order progress shows only once the customer has said yes, never on a cancelled quote', () => {
  assert.strictEqual(PROGRESS.shown({}), false);
  assert.strictEqual(PROGRESS.shown({ accepted_at: 'x' }), true);
  assert.strictEqual(PROGRESS.shown({ paid_amount: 10 }), true);
  assert.strictEqual(PROGRESS.shown({ accepted_at: 'x', cancelled_at: 'y' }), false);
});

test('a typed proof approval keeps a real name and nothing else', () => {
  assert.strictEqual(PROGRESS.cleanApprover("  José  O'Neil-Smith <b>"), "José O'Neil-Smith b");
  assert.strictEqual(PROGRESS.cleanApprover('<script>'), 'script');
  assert.strictEqual(PROGRESS.cleanApprover('x'.repeat(200)).length, 80);
});

test('brand files: only our Cloudinary account, the business folder, and file types the shop takes', () => {
  const ok = 'https://res.cloudinary.com/jtees/image/upload/v123/business_files/logo_ab12.png';
  assert.strictEqual(BRAND.fileUrlOk(ok, 'jtees'), true);
  assert.strictEqual(BRAND.fileUrlOk('https://res.cloudinary.com/jtees/raw/upload/business_files/stitch.dst', 'jtees'), true);
  assert.strictEqual(BRAND.fileUrlOk(ok, 'other'), false);
  assert.strictEqual(BRAND.fileUrlOk(ok.replace('business_files', 'quote_photos'), 'jtees'), false);
  assert.strictEqual(BRAND.fileUrlOk(ok.replace('.png', '.exe'), 'jtees'), false);
  assert.strictEqual(BRAND.fileUrlOk('https://evil.example/business_files/a.png', 'jtees'), false);
  assert.strictEqual(BRAND.fileUrlOk('javascript:alert(1)', 'jtees'), false);
});

test('brand file thumbnails: images and first PDF page, nothing for embroidery files', () => {
  assert.match(BRAND.thumbOf('https://res.cloudinary.com/jtees/image/upload/business_files/a.pdf', 'jtees'), /pg_1\/business_files\/a\.jpg$/);
  assert.strictEqual(BRAND.thumbOf('https://res.cloudinary.com/jtees/image/upload/business_files/a.dst', 'jtees'), '');
  assert.strictEqual(BRAND.cleanName('my "logo"<final>.ai'), 'my logofinal.ai');
});

test('team size link: unguessable tokens, clean names, and totals only for sizes the line still has', () => {
  const t = SIZES.newToken();
  assert.match(t, SIZES.TOKEN_RE);
  assert.notStrictEqual(SIZES.newToken(), t);
  assert.strictEqual(SIZES.cleanName(' Ana <img> 2 '), 'Ana img 2');
  const r = SIZES.tally([
    { line_index: 0, size: 'L' }, { line_index: 0, size: 'S' }, { line_index: 0, size: 'L' },
    { line_index: 0, size: '5XL' }, { line_index: 3, size: 'M' },
  ], { 0: ['S', 'M', 'L'] });
  assert.deepStrictEqual(r.byLine, { 0: { S: 1, L: 2 } });
  assert.deepStrictEqual(Object.keys(r.byLine[0]), ['S', 'L']);
  assert.strictEqual(r.stale, 2);
});

test('team size link: one person can ask for several sizes, youth sizes too', () => {
  assert.deepStrictEqual(SIZES.offeredSizes(['S', 'M', 'L', '2XL']).youth, ['YXS', 'YS', 'YM', 'YL', 'YXL']);
  assert.deepStrictEqual(SIZES.offeredSizes(['OSFA']).youth, []);
  assert.deepStrictEqual(SIZES.offeredSizes(['YS', 'YM', 'YL']).youth, []);
  const lines = [{ ix: 0, sizes: ['S', 'M', 'L'] }, { ix: 2, sizes: ['OSFA'] }];
  const keys = { sizes_0: 'S|M|L|YXS|YS|YM|YL|YXL', sizes_2: 'OSFA' };
  assert.strictEqual(SIZES.sizesKey(['S', 'M', 'L']), keys.sizes_0);
  // A page built before the shop added XS must not shift its counts onto the wrong size.
  assert.deepStrictEqual(SIZES.parsePicks({ ...keys, q_0_1: '1' }, [{ ix: 0, sizes: ['XS', 'S', 'M', 'L'] }, lines[1]]), { error: 'changed' });
  // q_<line>_<n>: n counts the line's own sizes, then the youth sizes (S M L YXS YS YM ...).
  assert.deepStrictEqual(SIZES.parsePicks({ ...keys, q_0_2: '1', q_0_5: '2', q_2_0: '1', q_0_0: '0', q_0_1: 'x', q_0_99: '3' }, lines), [
    { ix: 0, size: 'L', qty: 1 }, { ix: 0, size: 'YM', qty: 2 }, { ix: 2, size: 'OSFA', qty: 1 },
  ]);
  assert.deepStrictEqual(SIZES.parsePicks({ ...keys, q_0_0: '999' }, lines), [{ ix: 0, size: 'S', qty: SIZES.MAX_PER_SIZE }]);
  assert.deepStrictEqual(SIZES.parsePicks(keys, lines), { error: 'none' });
  assert.deepStrictEqual(SIZES.parsePicks({ ...keys, q_0_0: '20', q_0_1: '20', q_0_2: '1' }, lines), { error: 'too_many' });
  // Youth sizes the line does not carry are listed apart, never filled into its boxes.
  const r = SIZES.tally([{ line_index: 0, size: 'L', qty: 1 }, { line_index: 0, size: 'YM', qty: 2 },
    { line_index: 0, size: 'YS' }, { line_index: 0, size: 'YM' }], { 0: ['S', 'M', 'L'] });
  assert.deepStrictEqual(r.byLine, { 0: { L: 1 } });
  assert.deepStrictEqual(r.youth, { 0: { YS: 1, YM: 3 } });
  assert.deepStrictEqual(Object.keys(r.youth[0]), ['YS', 'YM']);
  assert.strictEqual(r.stale, 0);
});

test('team sizes for the shop: plain totals per item in size order, nothing dropped', () => {
  const order = ['S', 'M', 'L', 'XL'];
  const out = SIZES.listTotals([
    { line_index: 1, size: 'M' }, { line_index: 0, size: 'XL' }, { line_index: 0, size: 'S' },
    { line_index: 0, size: 'XL' }, { line_index: 0, size: 'Youth M' }, { line_index: 0, size: 'S', qty: 2 },
  ], (s) => order.indexOf(s));
  assert.deepStrictEqual(out, [
    { line_index: 0, sizes: [['S', 3], ['XL', 2], ['Youth M', 1]], total: 6 },
    { line_index: 1, sizes: [['M', 1]], total: 1 },
  ]);
  assert.deepStrictEqual(SIZES.listTotals([], () => 0), []);
});
