'use strict';
const test = require('node:test');
const assert = require('node:assert');
const G = require('../tools/lib/gooten');
const O = require('../tools/lib/gooten-orders');
const STAFF = require('../tools/lib/staff');

const ENV = { GOOTEN_RECIPE_ID: 'recipe', GOOTEN_PARTNER_BILLING_KEY: 'sec/ret+key=' };
const answer = (status, json) => async () => ({ status, ok: status < 300, json: async () => { if (json === undefined) throw new Error('not json'); return json; } });
const submit = (fetcher) => G.client({ env: ENV, fetcher }).submit({ SourceId: 'x' });

test('a submit is made, refused or unclear, and unclear is never read as refused', async () => {
  assert.deepStrictEqual(await submit(answer(200, { Id: '115557-68eb0c64-bf4f' })), { id: '115557-68eb0c64-bf4f' });
  await assert.rejects(submit(answer(400, { HadError: true, Errors: [{ PropertyName: 'Items', ErrorMessage: 'bad SKU' }] })),
    (e) => e.kind === 'refused' && /bad SKU/.test(e.message));
  for (const f of [answer(500, { x: 1 }), answer(200, {}), answer(200, undefined), answer(429, {}), answer(408, {}), answer(502, undefined),
    async () => { throw Object.assign(new Error('https://api.print.io/?partnerBillingKey=sec'), { name: 'TimeoutError' }); },
    async () => { throw new Error('socket'); }]) {
    await assert.rejects(submit(f), (e) => e.kind === 'unknown' && !/sec/.test(e.message));
  }
});

test('"that SourceId exists" means the order is there: look, never send another', async () => {
  await assert.rejects(submit(answer(400, { HadError: true, Errors: [{ PropertyName: 'SourceId', ErrorMessage: 'already exists' }] })),
    (e) => e.kind === 'unknown');
});

test('the billing key is never in an error, plain or encoded, and never follows a redirect', async () => {
  const k = ENV.GOOTEN_PARTNER_BILLING_KEY;
  const msg = G.errorText({ Errors: [{ PropertyName: 'Payment', ErrorMessage: `bad ${k} and ${encodeURIComponent(k)}`, AttemptedValue: k }] }, k);
  assert.ok(!msg.includes('sec/ret') && !msg.includes('sec%2Fret'), msg);
  let opts, url;
  await G.client({ env: ENV, fetcher: async (u, o) => { url = u; opts = o; return { status: 200, json: async () => ({ Id: 'abcd-1' }) }; } }).submit({ IsInTestMode: true });
  assert.strictEqual(opts.redirect, 'error');
  assert.ok(url.startsWith('https://api.print.io/') && !url.includes('sec'), 'the order call carries the key in its body');
  assert.strictEqual(JSON.parse(opts.body).Payment.PartnerBillingKey, k);
});

test('off without both keys, and live only when the owner says exactly 1', async () => {
  assert.ok(G.configured(ENV));
  assert.ok(!G.configured({ GOOTEN_RECIPE_ID: 'x' }) && !G.configured({}));
  for (const v of [undefined, '', '0', 'true', 'yes']) assert.ok(!G.live({ GOOTEN_LIVE: v }), String(v));
  assert.ok(G.live({ GOOTEN_LIVE: '1' }));
  await assert.rejects(G.client({ env: {}, fetcher: () => assert.fail('called') }).price([], {}, 'standard'), /not set up/);
});

const art = [{ url: 'https://res.cloudinary.com/c/image/upload/job_art/a.png' }, { url: 'https://res.cloudinary.com/c/image/upload/job_art/b.jpg' }];
test('lines: a half-filled line is refused, never dropped; artwork is only ever one of the job’s own files', () => {
  const ok = G.parseLines({ sku: ['Mug11oz-White', ''], qty: ['3', ''], art: ['0', ''], art2: ['1', ''] }, art);
  assert.deepStrictEqual(ok.items, [{ sku: 'Mug11oz-White', qty: 3, images: [art[0].url, art[1].url] }]);
  assert.deepStrictEqual(G.parseLines({ sku: 'Mug11oz-White', qty: '1', art: '1' }, art).items[0].images, [art[1].url], 'one line posts plain strings');
  for (const bad of [{}, { sku: 'Mug', qty: '', art: '0' }, { sku: '', qty: '2', art: '0' }, { sku: 'Mug', qty: '2', art: '' },
    { sku: 'Mug', qty: '0', art: '0' }, { sku: 'Mug', qty: '501', art: '0' }, { sku: 'Mug', qty: '1.5', art: '0' }, { sku: 'Mug', qty: '-1', art: '0' },
    { sku: 'Mug', qty: '1', art: '2' }, { sku: 'Mug', qty: '1', art: 'https://evil.test/x.png' }, { sku: 'Mug', qty: '1', art: '__proto__' },
    { sku: '<script>', qty: '1', art: '0' }, { sku: 'Mug', qty: '1', art: '0', art2: '9' },
    { sku: Array(21).fill('Mug'), qty: Array(21).fill('1'), art: Array(21).fill('0') }]) {
    assert.ok(G.parseLines(bad, art).error, JSON.stringify(bad));
  }
});

test('artwork choices are the shop’s own PNG and JPG files, final art first', () => {
  const got = G.artworkChoices({ artFiles: [{ url: 'ok/a.ai' }, { url: 'ok/b.PNG', name: 'B' }, { url: 'no/c.png' }],
    photos: [{ url: 'ok/d.jpg' }, { url: 'ok/b.PNG' }, null, 'ok/e.heic'], artOk: (u) => u.startsWith('ok/'), photoOk: (u) => u.startsWith('ok/') });
  assert.deepStrictEqual(got.map((g) => g.url), ['ok/b.PNG', 'ok/d.jpg']);
});

const row = { id: 7, quote_code: 'ABC234', ship_type: 'standard', items: [{ sku: 'Mug', qty: 2, images: [art[0].url] }],
  ship_to: { name: 'Pat Q Doe', street1: '1 Main St', street2: '', city: 'Chicago', state: 'IL', zip: '60657' } };
const shop = { name: 'June’s Tees', street1: '3047 N Lincoln Ave', city: 'Chicago', state: 'IL', zip: '60657', phone: '(773) 900-4592', email: 'shop@example.com' };
test('the order carries one reference on every try, the uniqueness guard, and a test flag unless told live', () => {
  const p = G.orderPayload({ ...row, test: true }, { shop, phone: '+1 (312) 555-0100' });
  assert.strictEqual(p.SourceId, 'JT-ABC234-7');
  assert.strictEqual(p.IsPartnerSourceIdUnique, true);
  assert.strictEqual(p.IsInTestMode, true);
  assert.strictEqual(G.orderPayload(row, { shop }).IsInTestMode, true, 'a row that does not say is a test');
  assert.strictEqual(G.orderPayload({ ...row, test: false }, { shop }).IsInTestMode, false);
  assert.deepStrictEqual([p.ShipToAddress.FirstName, p.ShipToAddress.LastName, p.ShipToAddress.Phone], ['Pat', 'Q Doe', '3125550100']);
  assert.strictEqual(p.ShipToAddress.Email, shop.email, 'Gooten never gets the customer’s email');
  assert.strictEqual(G.orderPayload(row, { shop, phone: '' }).ShipToAddress.Phone, '7739004592');
  assert.deepStrictEqual(G.splitName('Cher'), { FirstName: 'Cher', LastName: 'Cher' });
});

test('a missing figure is never $0', () => {
  const p = (i, s) => ({ ItemsPrice: { ItemsTotalPrice: i }, ShippingPrice: { ShippingTotal: s } });
  assert.deepStrictEqual(G.estimate(p({ Price: 10.1 }, { Price: 5.2 })), { items: 10.1, shipping: 5.2, total: 15.3 });
  for (const bad of [null, {}, p(null, { Price: 1 }), p({ Price: 5 }, null), p({ Price: 0 }, { Price: 1 }), p({}, { Price: 1 }), p({ Price: 'x' }, { Price: 1 })]) assert.strictEqual(G.estimate(bad), null);
  assert.strictEqual(G.billed({ Result: { Total: { Price: 20 } } }), 20);
  assert.strictEqual(G.billed({ Result: {} }), null);
});

test('where an order stands: every item, not just one; a status Gooten never documented is shown, not guessed', () => {
  const s = (...Items) => G.standing({ Items });
  assert.ok(!s({ Sku: 'a', Status: 'Shipped', TrackingNumber: '1Z' }, { Sku: 'b', Status: 'InProduction' }).shipped);
  const both = s({ Sku: 'a', Status: 'Shipped', Shipments: [{ TrackingNumber: '1Z', TrackingUrl: 'javascript:x' }] }, { Sku: 'b', Status: 'x', TrackingNumber: '1Z' });
  assert.ok(both.shipped); assert.deepStrictEqual(both.tracking, ['1Z']); assert.strictEqual(both.items[0].url, '');
  for (const st of ['ImageIssue', 'AddressIssue', 'Hold', 'HoldByCIImageIssue', 'NeedsPersonalization', 'Payment Issue']) assert.ok(s({ Status: st }).problem, st);
  for (const st of ['New', 'InProduction', 'Wibble', '']) { assert.ok(!s({ Status: st }).problem, st); assert.ok(!s({ Status: st }).shipped, st); }
  assert.ok(s({ Status: 'Cancelled' }).cancelled && !s({ Status: 'Cancelled' }).shipped);
  const part = s({ Status: 'Cancelled' }, { Status: 'Shipped' });
  assert.ok(part.partCancelled && part.shipped && !part.cancelled);
  assert.ok(!G.standing({}).shipped && !G.standing({}).cancelled);
});

test('a lookup takes only the exact reference', () => {
  const r = { Orders: [{ SourceId: 'JT-ABC234-70', Id: 'aaaa-1' }, { SourceId: 'JT-ABC234-7', Id: 'bbbb-2' }] };
  assert.strictEqual(G.findBySource(r, 'JT-ABC234-7').Id, 'bbbb-2');
  assert.strictEqual(G.findBySource(r, 'JT-ABC234-9'), null);
  assert.strictEqual(G.findBySource(null, 'x'), null);
});

test('the catalog lists each product once, out of nested groups, without retired ones', () => {
  const list = G.catalogProducts({ 'product-catalog': [
    { name: 'Bestsellers', items: [{ type: 'product', product_id: 1, name: 'Mugs', cheapest_price: '$5' }] },
    { name: 'Drinkware', items: [{ type: 'category', name: 'Mugs & Cups', items: [{ type: 'product', product_id: 1, name: 'Mugs' }, { type: 'product', product_id: 2, name: 'Old', deprecated: true }] }] }] });
  assert.deepStrictEqual(list.map((p) => [p.id, p.cost, p.groups]), [[1, '$5', ['Mugs & Cups']]]);
});

test('only an accepted, paid, live job may go', () => {
  const q = { status: 'accepted', accepted_at: new Date(), paid_amount: '20.00' };
  assert.strictEqual(O.refusal(q), '');
  for (const bad of [null, { ...q, cancelled_at: new Date() }, { ...q, accepted_at: null }, { ...q, paid_amount: 0 }, { ...q, status: 'held' }, { ...q, delivered_at: new Date() }]) assert.ok(O.refusal(bad));
});

test('sending spends the owner’s money: its own toggle, off in every preset', () => {
  const helper = (perms) => ({ kind: 'staff', id: 1, perms });
  for (const r of ['prepare', 'send', 'discard', 'check']) {
    const p = `/admin/quote/:code/gooten/${r}`;
    assert.ok(!STAFF.mayUseRoute(helper({ 'production.stage': 'on', 'shipping.labels': 'on', 'quotes.view': 'on' }), 'POST', p), r);
    assert.ok(STAFF.mayUseRoute(helper({ 'gooten.send': 'on' }), 'POST', p), r);
  }
  for (const name of Object.keys(STAFF.PRESETS)) assert.strictEqual(STAFF.presetPerms(name)['gooten.send'].level, 'off', name);
});
