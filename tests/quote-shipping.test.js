'use strict';

/* Shipping on quotes (dashboard plan, Part 3, 2026-11-06).
 *
 * Quotes could not charge postage: a job set to ship paid for its label out of
 * the shop's margin (cost_shipping). Now a quote that ships is charged a live
 * rate, at cost (owner rule: freight at cost), when the customer accepts; a
 * figure the shop types wins; and no rate means no acceptance, never a silent
 * $0 shipping line.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHIP = require('../tools/lib/shipping');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in server.js`);
  let i = src.indexOf('(', start);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function line(re, what) {
  const m = re.exec(src);
  assert.ok(m, `${what} not found in server.js`);
  return m[0];
}
function route(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `${anchor} not found in server.js`);
  return src.slice(start, src.indexOf('\n});', start) + 4);
}

/* quoteTotals and totalsForItems, with the code's default deposit and tax. */
function totals() {
  const sandbox = { process: { env: {} } };
  vm.createContext(sandbox);
  vm.runInContext([
    line(/^const round2 = .*;$/m, 'round2'),
    line(/^const TAX_RATE {3}= .*$/m, 'TAX_RATE'),
    line(/^const DEPOSIT_PC = .*$/m, 'DEPOSIT_PC'),
    line(/^const DEPOSIT_FULL_UNDER = .*$/m, 'DEPOSIT_FULL_UNDER'),
    'const quoteTaxable = (q) => q.taxable !== false;',
    lift('quoteTax'), lift('depositFor'), lift('quoteDiscount'), lift('quoteTotals'), lift('totalsForItems'),
  ].join('\n'), sandbox);
  return sandbox;
}

/* ── The total ──────────────────────────────────────────────────────────── */

test('postage is added after tax and outside the discount', () => {
  const { quoteTotals } = totals();
  const t = quoteTotals({ items: [{ line_total: 200 }], discount_kind: 'pct', discount_value: 10, tax: 18.45,
                          shipping_fee: 12.4 });
  assert.strictEqual(t.discount, 20, '10% of the goods, not of the goods and the postage');
  assert.strictEqual(t.shipping, 12.4);
  assert.strictEqual(t.total, 210.85, '180 + 18.45 tax + 12.40 postage');
  assert.strictEqual(t.deposit, 105.43, 'the deposit is half of the total with the postage in it');
});

test('a quote with no postage, or a bad figure, totals as before', () => {
  const { quoteTotals } = totals();
  for (const shipping_fee of [undefined, null, 0, -5, 'abc']) {
    const t = quoteTotals({ items: [{ line_total: 100 }], tax: 0, shipping_fee });
    assert.strictEqual(t.shipping, 0, String(shipping_fee));
    assert.strictEqual(t.total, 100, String(shipping_fee));
  }
});

test('options chosen at Accept keep the postage, untaxed', () => {
  const { totalsForItems } = totals();
  const t = totalsForItems({ taxable: true, shipping_fee: 9 }, [{ line_total: 100 }]);
  assert.strictEqual(t.tax, 10.25, 'tax on the goods only');
  assert.strictEqual(t.total, 119.25);
});

test('re-saving a quote keeps the postage on it', () => {
  const save = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  assert.match(save, /SELECT delivery_fee, shipping_fee FROM quotes WHERE code = \$1/);
  assert.match(save, /const total = round2\(net \+ tax \+ keptDeliveryFee \+ keptShippingFee\);/);
});

/* ── The parcel ─────────────────────────────────────────────────────────── */

test('a piece weighs what the studio says it does', () => {
  assert.strictEqual(SHIP.itemOunces('Gildan 18500 Heavy Blend Hoodie'), 22);
  assert.strictEqual(SHIP.itemOunces('Gildan 5000 Heavy Cotton Tee'), 6);
  assert.strictEqual(SHIP.itemOunces('Youth Hoodie'), 15, 'a youth hoodie is still a hoodie, scaled');
  assert.strictEqual(SHIP.itemOunces('Toddler Jersey Tee'), 4);
  assert.strictEqual(SHIP.itemOunces('Something unheard of'), 6, 'the safe default');
  assert.strictEqual(SHIP.itemOunces(''), 6);
});

test('a parcel is the goods taken, plus the mailer, up to 70 lb', () => {
  assert.strictEqual(SHIP.quoteOunces([{ description: 'Tee', qty: 10 }, { description: 'Hoodie', qty: 2 }]), 107);
  assert.strictEqual(SHIP.quoteOunces([{ description: 'Tee', qty: 10 }, { description: 'Hoodie', qty: 2, optional: true }]), 63,
    'an option not taken is not in the box');
  assert.strictEqual(SHIP.quoteOunces([{ description: 'Design fee', qty: 1, untaxed: true }]), 0, 'design work weighs nothing');
  assert.strictEqual(SHIP.quoteOunces([]), 0);
  assert.strictEqual(SHIP.quoteOunces([{ description: 'Blanket', qty: 500 }]), 1120);
});

/* ── The rate ───────────────────────────────────────────────────────────── */

function rater(answer) {
  const calls = [];
  const sandbox = {
    SHIP, console: { error: () => {} },
    round2: (n) => Math.round((Number(n) || 0) * 100) / 100,
    studioShip: async (payload) => { calls.push(payload); return typeof answer === 'function' ? answer(payload) : answer; },
  };
  vm.createContext(sandbox);
  vm.runInContext('async ' + lift('quoteShippingRate'), sandbox);
  return { rate: sandbox.quoteShippingRate, calls };
}
const TO = { name: 'Ada Lovelace', street1: '1 Main St', street2: '', city: 'Chicago', state: 'IL', zip: '60657', country: 'US' };
const ITEMS = [{ description: 'Gildan 5000 Tee', qty: 12 }];
const RATES = [
  { name: 'USPS Ground Advantage', amount: 8.1, days: 5 },
  { name: 'UPS 2nd Day Air', amount: 21.5, days: 2 },
];

test('the cheapest live rate is charged, at cost, for the parcel the lines make', async () => {
  const { rate, calls } = rater({ status: 200, body: { ok: true, rates: RATES } });
  const r = await rate('ABC234', TO, { items: ITEMS, phone: '7735551212', email: 'a@b.com' });
  assert.strictEqual(r.fee, 8.1);
  assert.strictEqual(r.service, 'USPS Ground Advantage');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].action, 'rates');
  assert.strictEqual(calls[0].quote, 'ABC234');
  assert.strictEqual(calls[0].oz, 75, '12 tees at 6 oz, plus 3 oz of mailer');
  assert.strictEqual(calls[0].box, 'medium', 'over 48 oz is the medium box, the studio rule');
  assert.strictEqual(calls[0].to.zip, '60657');
  assert.strictEqual(calls[0].to.phone, '7735551212');
});

test('an expedited job is charged the fastest rate', async () => {
  const { rate } = rater({ status: 200, body: { ok: true, rates: RATES } });
  const r = await rate('ABC234', TO, { items: ITEMS, expedited: true });
  assert.strictEqual(r.fee, 21.5);
});

test('no rate, for any reason, is no rate: never $0', async () => {
  const cases = [
    { status: 0, body: { error: 'The studio could not be reached.' } },
    { status: 502, body: { error: 'Shippo has no rates for this address.' } },
    { status: 200, body: { ok: true, rates: [] } },
    { status: 200, body: { ok: true, rates: [{ name: 'Free?', amount: 0 }] } },
    { status: 200, body: { ok: true, rates: [{ name: 'Odd', amount: 'abc' }] } },
    { status: 200, body: { ok: true, rates: [{ name: 'Huge', amount: 900 }] } },
    { status: 200, body: null },
  ];
  for (const answer of cases) {
    const { rate } = rater(answer);
    assert.strictEqual(await rate('ABC234', TO, { items: ITEMS }), null, JSON.stringify(answer));
  }
});

test('no usable address is not sent to the studio at all', async () => {
  const { rate, calls } = rater({ status: 200, body: { ok: true, rates: RATES } });
  assert.strictEqual(await rate('ABC234', { ...TO, zip: '' }, { items: ITEMS }), null);
  assert.strictEqual(await rate('ABC234', null, { items: ITEMS }), null);
  assert.strictEqual(calls.length, 0);
});

test('a job with nothing to weigh is still priced, as a half-pound mailer', async () => {
  const { rate, calls } = rater({ status: 200, body: { ok: true, rates: RATES } });
  const r = await rate('ABC234', TO, { items: [{ description: 'Design fee', qty: 1, untaxed: true }] });
  assert.strictEqual(r.fee, 8.1);
  assert.strictEqual(calls[0].oz, 8);
  assert.strictEqual(calls[0].box, 'mailer');
});

test('a weight is read from whole words: a design is not a sign', () => {
  assert.strictEqual(SHIP.itemOunces('Gildan 5000 Tee - front design'), 6);
  assert.strictEqual(SHIP.itemOunces('What a Tee'), 6);
  assert.strictEqual(SHIP.itemOunces('Capri pants'), 6);
  assert.strictEqual(SHIP.itemOunces('Hoodies'), 22, 'a plural still counts');
  assert.strictEqual(SHIP.itemOunces('Trucker Hat'), 4);
});

test('an address typed at Accept wins over the one on file', () => {
  assert.match(ACCEPT, /const typedAddress = String\(rb\.ship_street1 \|\| ''\)\.trim\(\) !== '';/);
  assert.match(ACCEPT, /typedAddress && SHIP\.quoteShips\(shipQ\) \? \{ \.\.\.shipQ, ship_to: null \} : shipQ/);
  const need = SHIP.acceptRequirements({ name: 'Ada', email: 'a@b.com', phone: '7735551212', ship_method: 'ground', ship_to: null },
    { ship_street1: '2 New St', ship_city: 'Chicago', ship_state: 'IL', ship_zip: '60614' }, { isValidEmail: (e) => /@/.test(e) });
  assert.strictEqual(need.shipTo.street1, '2 New St');
  assert.match(src, /const fix = SHIP\.quoteShips\(q\) && String\(req\.query\.e \|\| ''\) === 'shipping';/, 'a failed rate shows the address again to correct');
});

test('a live rate never overwrites a fee the shop typed meanwhile', () => {
  assert.match(ACCEPT, /AND \(\$16::numeric IS NULL OR shipping_fee IS NULL\) RETURNING \*/);
  assert.match(ACCEPT, /: \(shipping && why\[0\]\.shipfee\) \? 'changed' : 'gone';/);
});

test('a reorder starts without the old postage', () => {
  assert.match(src, /delivery_fee: 0, shipping_fee: null, shipping_service: null, discount_kind:/);
});

test('a job switched to pickup or local loses its postage while unpaid, and says so once paid', () => {
  const ship = route("app.post('/admin/quote/:code/shipping', requireAdmin");
  assert.match(ship, /\['pickup', 'local'\]\.includes\(method\) && rows\[0\]\.shipping_fee != null && !\(Number\(rows\[0\]\.paid_amount \|\| 0\) > 0\)/);
  assert.match(ship, /WHERE code = \$1 AND COALESCE\(paid_amount, 0\) = 0 RETURNING stripe_session/);
  assert.match(src, /This job no longer ships, but \$\{money\(fee\)\} of postage is still in its total/);
});

test('a local job with no delivery offered keeps its method at Accept', () => {
  assert.match(src, /!SHIP\.quoteShips\(q\) && \(delivOffered \|\| String\(q\.ship_method \|\| ''\) !== 'local'\) \? acceptDeliveryHtml/);
});

/* ── Accept ─────────────────────────────────────────────────────────────── */

const ACCEPT = route("app.post('/q/:code/accept', orderRateLimit");

test('a job that ships is priced before it is accepted, and a failed price stops the accept', () => {
  const price = ACCEPT.indexOf('await quoteShippingRate(');
  const update = ACCEPT.indexOf("UPDATE quotes SET accepted_at=NOW()");
  assert.ok(price > 0 && update > price, 'the rate comes before the acceptance');
  assert.match(ACCEPT, /if \(!rate\) return res\.redirect\(`\/q\/\$\{code\}\?e=shipping/);
  assert.match(ACCEPT, /\(SHIP\.quoteShips\(q0\) \|\| choseShip\) && q0\.shipping_fee == null/, 'a fee the shop typed is not looked up again');
  assert.match(ACCEPT, /shipping_fee {5}= COALESCE\(\$16::numeric, shipping_fee\)/);
  assert.match(ACCEPT, /shipping_service = COALESCE\(\$17, shipping_service\)/);
  assert.match(ACCEPT, /shipping_fee: shipping \? shipping\.fee : q0\.shipping_fee/, 'the total is worked out with the postage in it');
  assert.doesNotMatch(ACCEPT, /rb\.shipping_fee|req\.body\.shipping_fee/, 'the fee never comes from the form');
});

test('"Ship it to me" makes the job a ground job and asks for its address', () => {
  assert.match(ACCEPT, /const choseShip = !!q0 && deliveryChoice === 'ship' && !SHIP\.quoteShips\(q0\);/);
  assert.match(ACCEPT, /const shipQ = choseShip \? \{ \.\.\.cur\[0\], ship_method: 'ground' \} : cur\[0\];/);
  assert.match(ACCEPT, /const shipMethod = delivery \? 'local' : choseShip \? 'ground'/);
  /* The address the rules ask for, through the rules' own field names. */
  const need = SHIP.acceptRequirements({ name: 'Ada', email: 'a@b.com', phone: '7735551212', ship_method: 'ground' },
    { ship_street1: '1 Main St', ship_city: 'Chicago', ship_state: 'il', ship_zip: '60657' }, { isValidEmail: (e) => /@/.test(e) });
  assert.deepStrictEqual(need.problems, []);
  assert.strictEqual(need.shipTo.state, 'IL');
});

test('the quote page says how a job that ships is priced, and offers shipping beside pickup', () => {
  assert.match(src, /priced from your address when you accept<\/td>/);
  assert.match(src, /value="ship" \$\{ship \? 'checked' : ''\}>/);
  assert.match(src, /We could not get a shipping price for that address just now, so nothing was accepted yet\./);
  assert.match(src, /var total = r2\(net \+ tax \+ dfee \+ T\.ship\);/, 'the options script counts a typed fee');
});

/* ── The shop's figure ──────────────────────────────────────────────────── */

const FEE = route("app.post('/admin/quote/:code/shipping-fee', requireAdmin");

test('only someone who may set prices can type the postage', () => {
  assert.strictEqual(STAFF.permForRoute('POST', '/admin/quote/:code/shipping-fee'), 'quotes.price');
  const helper = { kind: 'staff', id: 7, perms: { 'production.stage': 'on' } };
  assert.strictEqual(STAFF.mayUseRoute(helper, 'POST', '/admin/quote/:code/shipping-fee'), false);
  assert.strictEqual(STAFF.mayUseRoute({ kind: 'staff', id: 7, perms: { 'quotes.price': 'on' } }, 'POST', '/admin/quote/:code/shipping-fee'), true);
  assert.match(src, /const may = actorLevel\('quotes\.price'\) === 'on';/, 'the box is drawn only for them');
});

test('the postage is locked once money is in, and the stored total moves with it', () => {
  assert.match(FEE, /if \(Number\(q\.paid_amount \|\| 0\) > 0\) return back\(/);
  assert.match(FEE, /WHERE code = \$1 AND cancelled_at IS NULL AND COALESCE\(paid_amount, 0\) = 0 RETURNING stripe_session/,
    'the lock holds even if a payment lands between the read and the write');
  assert.match(FEE, /const tt = quoteTotals\(\{ \.\.\.q, shipping_fee: fee \}\);/);
  assert.match(FEE, /shipping_fee = \$2::numeric, shipping_service = NULL, total = \$3, deposit = \$4/);
  assert.match(FEE, /await dropQuoteCheckout\(code, rows\[0\]\.stripe_session\);/, 'a card page for the old amount is forgotten, then closed');
});

test('a typed figure is checked: dollars between one cent and $500, or empty', () => {
  assert.match(FEE, /const fee = raw === '' \? null : round2\(Number\(raw\)\);/);
  assert.match(FEE, /fee !== null && !\(Number\.isFinite\(fee\) && fee > 0 && fee <= 500\)/);
});

test('the label is bought for the service the customer paid for', () => {
  assert.match(src, /: !studio \? String\(o\.shipping_service \|\| ''\) : '';/);
  assert.match(src, /SHIP\.quoteOunces\(o\.items\) \|\| null/, 'the weigh form starts from the estimate');
});
