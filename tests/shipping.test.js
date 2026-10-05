'use strict';

/* Shipping: what is waiting to go out, what a quote needs before it can be
 * accepted, and what the shop and the customer are told.
 *
 * Reported 2026-09-30: studio order #10 paid $6.00 for USPS Ground Advantage on
 * 2026-08-11 and never shipped. Nothing recorded which service the postage paid
 * for, no label had ever been bought, and nothing anywhere said a paid order
 * was waiting: the morning email listed quotes only. The owner asked for the
 * postage to be bought from the dashboard, for a real pickup choice at
 * checkout, and for every quote to carry a name, email and mobile (and an
 * address when it ships) before it can be accepted.
 *
 * The rules are pure (tools/lib/shipping.js) and tested directly; the routes
 * are read from server.js, and the card is rendered from its own source.
 * The studio half (checkout, the label purchase) is tested in the studio's
 * repo; the two together in the end-to-end harness.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SHIP = require('../tools/lib/shipping');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const isValidEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(s || '').trim());
const DAY = 86400000;
const NOW = Date.parse('2026-09-30T15:00:00Z');
const ago = (d) => new Date(NOW - d * DAY).toISOString();

function lift(name) {
  let at = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  let i = src.indexOf('(', at);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function route(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `${anchor} not found in server.js`);
  return src.slice(start, src.indexOf('\n});', start) + 4);
}

/* ── A studio order ─────────────────────────────────────────────────────── */

const studio = (over = {}) => Object.assign({
  id: 10, status: 'processing', total: 35.75, paid: 35.75, refunded: 0, created: ago(50),
  name: 'Pat Doe', email: 'pat@example.com', tax_exempt: '',
  delivery: { method: 'ship', source: '', service: '', paid: null, recorded: false },
  ship_to: { name: 'Pat Doe', street1: '1 Main St', city: 'Chicago', state: 'IL', zip: '60657', country: 'US', phone: '3125550100' },
  items: [{ name: 'Unisex Tee', qty: 2 }], est_oz: 15, label: null, label_pending: false, shipped_at: null,
}, over);

test('a paid studio order with no label is waiting to ship — order #10 is exactly this', () => {
  assert.strictEqual(SHIP.studioShipState(studio()), 'to-ship');
});

test('where a studio order stands, for every state the feed can send', () => {
  assert.strictEqual(SHIP.studioShipState(studio({ label: { label_url: 'https://x/l.pdf' } })), 'labelled');
  assert.strictEqual(SHIP.studioShipState(studio({ label_pending: true })), 'pending');
  assert.strictEqual(SHIP.studioShipState(studio({ delivery: { method: 'pickup' } })), 'pickup');
  assert.strictEqual(SHIP.studioShipState(studio({ tax_exempt: 'pending' })), 'held',
    'a certificate the shop has not checked: do not produce, so do not ship');
  assert.strictEqual(SHIP.studioShipState(studio({ paid: 0 })), 'unpaid');
  assert.strictEqual(SHIP.studioShipState(studio({ refunded: 35.75 })), 'refunded');
  assert.strictEqual(SHIP.studioShipState(studio({ status: 'shipped' })), 'shipped');
  assert.strictEqual(SHIP.studioShipState(studio({ status: 'complete' })), 'shipped');
  assert.strictEqual(SHIP.studioShipState(studio({ status: 'cancel' })), 'gone');
  /* A deposit order is paid in part, and still to ship: the page says what is owed. */
  assert.strictEqual(SHIP.studioShipState(studio({ paid: 20 })), 'to-ship');
  assert.strictEqual(SHIP.studioBalance(studio({ paid: 20 })), 15.75);
});

test('the lists are oldest first, and shipped ones stay for 30 days', () => {
  const q = SHIP.studioShipQueues([
    studio({ id: 11, created: ago(2) }),
    studio({ id: 10, created: ago(50) }),
    studio({ id: 12, status: 'shipped', shipped_at: ago(3) }),
    studio({ id: 13, status: 'shipped', shipped_at: ago(40) }),
    studio({ id: 14, delivery: { method: 'pickup' }, created: ago(1) }),
  ], NOW);
  assert.deepStrictEqual(q.toShip.map((o) => o.id), [10, 11]);
  assert.strictEqual(q.toShip[0].waitingDays, 50);
  assert.deepStrictEqual(q.shipped.map((o) => o.id), [12]);
  assert.deepStrictEqual(q.pickups.map((o) => o.id), [14]);
});

test('how a studio order leaves, in the shop words', () => {
  assert.strictEqual(SHIP.deliveryPhrase({ method: 'pickup' }, money), 'Pickup — free pickup, no label needed');
  assert.strictEqual(SHIP.deliveryPhrase({ method: 'ship', source: 'rate', service: 'USPS Ground Advantage', paid: 6 }, money),
    'Ship by USPS Ground Advantage — they paid $6.00 postage');
  assert.match(SHIP.deliveryPhrase({ method: 'ship', source: 'free' }, money), /postage is yours/);
  assert.match(SHIP.deliveryPhrase({ method: 'ship', source: 'flat', paid: 8 }, money), /flat \$8\.00/);
  assert.strictEqual(SHIP.deliveryPhrase({ method: 'ship', source: '', paid: null, recorded: false }, money),
    'Ship — placed before the service was recorded');
});

/* ── A quote job ────────────────────────────────────────────────────────── */

const job = (over = {}) => Object.assign({
  code: 'ABCDEF2345', name: 'Sam Lee', email: 'sam@example.com', phone: '3125550101', ship_method: 'ground',
  accepted_at: ago(9), paid_amount: 100, total: 200, cancelled_at: null, shipped_at: null, delivered_at: null,
  ship_to: { name: 'Sam Lee', street1: '2 Oak Ave', city: 'Evanston', state: 'IL', zip: '60201' }, ship_label: null,
}, over);

test('a quote job is to ship once it is accepted, paid and set to go by post', () => {
  assert.strictEqual(SHIP.quoteShipState(job()), 'to-ship');
  assert.strictEqual(SHIP.quoteShipState(job({ ship_method: 'pickup' })), 'not-shipping');
  assert.strictEqual(SHIP.quoteShipState(job({ ship_method: null })), 'not-shipping');
  assert.strictEqual(SHIP.quoteShipState(job({ accepted_at: null })), 'not-accepted');
  assert.strictEqual(SHIP.quoteShipState(job({ paid_amount: 0 })), 'unpaid');
  assert.strictEqual(SHIP.quoteShipState(job({ cancelled_at: ago(1) })), 'gone');
  assert.strictEqual(SHIP.quoteShipState(job({ ship_label: { label_url: 'https://x/l.pdf' } })), 'labelled');
  assert.strictEqual(SHIP.quoteShipState(job({ ship_label: { pending: 'txn1' } })), 'pending');
  assert.strictEqual(SHIP.quoteShipState(job({ shipped_at: ago(1) })), 'shipped');
  assert.strictEqual(SHIP.quoteShipState(job({ delivered_at: ago(1) })), 'shipped');
});

/* ── Addresses ──────────────────────────────────────────────────────────── */

test('an address is tidied the way a label needs it', () => {
  const a = SHIP.cleanShipTo({ name: '  Pat   Doe ', street1: '1 Main  St', city: 'Chicago', state: 'il', zip: '60657' });
  assert.deepStrictEqual(a, { name: 'Pat Doe', street1: '1 Main St', street2: '', city: 'Chicago', state: 'IL', zip: '60657', country: 'US' });
  assert.deepStrictEqual(SHIP.shipToProblems(a), []);
  assert.strictEqual(SHIP.cleanShipTo({}), null, 'nothing usable is no address at all');
  assert.deepStrictEqual(SHIP.shipToProblems(SHIP.cleanShipTo({ street1: '1 Main St', zip: '606' }, 'Pat')),
    ['city', 'state', 'zip']);
  assert.deepStrictEqual(SHIP.shipToProblems(SHIP.cleanShipTo({ street1: 'x', city: 'y', state: 'IL', zip: '60657-1234' }, 'P')), []);
});

/* ── Accepting a quote ──────────────────────────────────────────────────── */

test('nothing on file and nothing typed: name, email and mobile are all asked for', () => {
  const q = { name: '', email: '', phone: '', ship_method: 'pickup', ship_to: null };
  assert.deepStrictEqual(SHIP.acceptRequirements(q, {}, { isValidEmail }).problems, ['name', 'email', 'phone']);
  assert.deepStrictEqual(SHIP.acceptAsks(q, { isValidEmail }), { name: true, email: true, phone: true, address: false });
});

test('what is typed completes it; a pickup job is never asked for an address', () => {
  const q = { name: '', email: '', phone: '', ship_method: 'pickup', ship_to: null };
  const r = SHIP.acceptRequirements(q, { first_name: 'Pat', last_name: 'Doe', email: 'PAT@Example.com', phone: '(312) 555-0100' },
    { isValidEmail });
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(r.name, 'Pat Doe');
  assert.strictEqual(r.email, 'pat@example.com');
  assert.strictEqual(r.shipTo, null);
});

test('a first name alone is not a name, and a short number is not a mobile', () => {
  const q = { name: '', email: 'pat@example.com', phone: '', ship_method: null };
  assert.deepStrictEqual(SHIP.acceptRequirements(q, { first_name: 'Pat', phone: '555-0100' }, { isValidEmail }).problems,
    ['name', 'phone']);
  assert.ok(SHIP.phoneOk('+1 (312) 555-0100'));
  assert.ok(!SHIP.phoneOk('555-0100'));
});

test('what is on file and usable is kept, and cannot be overwritten from the quote link', () => {
  const q = job();
  const r = SHIP.acceptRequirements(q, { first_name: 'Eve', last_name: 'X', email: 'eve@evil.test', phone: '9999999999' },
    { isValidEmail });
  assert.deepStrictEqual(r.problems, []);
  assert.strictEqual(r.name, 'Sam Lee');
  assert.strictEqual(r.email, 'sam@example.com');
  assert.strictEqual(r.phone, '3125550101');
  assert.strictEqual(r.shipTo, null, 'a complete address on file is not replaced');
  assert.deepStrictEqual(SHIP.acceptAsks(q, { isValidEmail }), { name: false, email: false, phone: false, address: false });
});

test('an unusable email on file is asked for again, and the typed one is kept', () => {
  const q = job({ email: 'not-an-email' });
  assert.strictEqual(SHIP.acceptAsks(q, { isValidEmail }).email, true);
  assert.strictEqual(SHIP.acceptRequirements(q, { email: 'sam@example.com' }, { isValidEmail }).email, 'sam@example.com');
});

test('a job that ships needs a delivery address before it can be accepted', () => {
  const q = job({ ship_to: null });
  assert.deepStrictEqual(SHIP.acceptRequirements(q, {}, { isValidEmail }).problems, ['address']);
  assert.strictEqual(SHIP.acceptAsks(q, { isValidEmail }).address, true);
  const r = SHIP.acceptRequirements(q, { ship_street1: '2 Oak Ave', ship_city: 'Evanston', ship_state: 'il', ship_zip: '60201' },
    { isValidEmail });
  assert.deepStrictEqual(r.problems, []);
  assert.deepStrictEqual(r.shipTo, { name: 'Sam Lee', street1: '2 Oak Ave', street2: '', city: 'Evanston', state: 'IL', zip: '60201', country: 'US' });
  assert.deepStrictEqual(SHIP.acceptRequirements(q, { ship_street1: '2 Oak Ave', ship_city: 'Evanston', ship_state: 'Illinois', ship_zip: '602' },
    { isValidEmail }).problems, ['address'], 'a ZIP of three digits is not an address a label can go to');
});

test('the customer is told what to add, in words', () => {
  assert.strictEqual(SHIP.acceptProblemsSentence(['email', 'phone']),
    'Please add an email address we can send your receipt to and a mobile number (10 digits) before accepting, so we can reach you about your order.');
  assert.strictEqual(SHIP.acceptProblemsSentence([]), '');
  assert.strictEqual(SHIP.acceptProblemsSentence(['<script>']), '', 'only known words, never what the link said');
});

test('the accept route checks before it accepts, and the page asks for exactly what is missing', () => {
  const accept = route("app.post('/q/:code/accept', orderRateLimit");
  const check = accept.indexOf('SHIP.acceptRequirements(cur[0], rb, { isValidEmail })');
  const update = accept.indexOf("UPDATE quotes SET accepted_at=NOW()");
  assert.ok(check > 0 && update > check, 'the requirements come before the acceptance');
  assert.match(accept, /if \(need\.problems\.length\) return res\.redirect\(`\/q\/\$\{code\}\?e=details&need=\$\{need\.problems\.join\(','\)\}#accept`\);/);
  assert.match(accept, /WHERE code = \$1 AND accepted_at IS NULL`,/, 'details are only filled in before acceptance');

  const page = route("app.get('/q/:code', async");
  assert.match(page, /const ask = SHIP\.acceptAsks\(q, \{ isValidEmail \}\);/);
  assert.match(page, /<input type="email" name="email" required autocomplete="email">/);
  assert.match(page, /<input type="tel" name="phone" required minlength="10"/);
  assert.match(page, /<input name="last_name" required autocomplete="family-name">/);
  assert.match(page, /<input name="ship_zip" required pattern=/);
  assert.match(page, /const need = String\(req\.query\.e \|\| ''\) === 'details'/, 'the message is in the form the link jumps to');
  assert.doesNotMatch(page, /\(optional — for your receipt\)/, 'email is no longer optional');
});

/* ── The label form ─────────────────────────────────────────────────────── */

test('a weight typed in pounds and ounces, and the box it starts in', () => {
  assert.strictEqual(SHIP.ouncesFrom('1', '4'), 20);
  assert.strictEqual(SHIP.ouncesFrom('', '7.2'), 8, 'a part ounce rounds up, as USPS does');
  assert.strictEqual(SHIP.ouncesFrom('', ''), null);
  assert.strictEqual(SHIP.ouncesFrom('71', '0'), null, 'over the 70 lb USPS limit');
  assert.strictEqual(SHIP.ouncesFrom('-1', '0'), null);
  assert.strictEqual(SHIP.boxFor(12), 'mailer');
  assert.strictEqual(SHIP.boxFor(30), 'small');
  assert.strictEqual(SHIP.boxFor(100), 'medium');
  assert.strictEqual(SHIP.boxFor(200), 'large');
});

test('the rate chosen first is the service the customer paid for', () => {
  const rates = [{ id: 'r1', name: 'USPS Ground Advantage', amount: 5.4 }, { id: 'r2', name: 'USPS Priority Mail', amount: 9.1 }];
  assert.strictEqual(SHIP.preferredRate(rates, 'USPS Priority Mail').id, 'r2');
  assert.strictEqual(SHIP.preferredRate(rates, '').id, 'r1', 'otherwise the cheapest, which the studio lists first');
  assert.strictEqual(SHIP.preferredRate([], 'x'), null);
});

/* ── The morning reminder ───────────────────────────────────────────────── */

test('nothing waiting, no reminder', () => {
  assert.strictEqual(SHIP.shippingReminder({ toShip: [], labelled: [], pickups: [] }, { toShip: [], labelled: [] }, { money }), null);
});

test('the reminder names each order and how long it has waited', () => {
  const s = SHIP.studioShipQueues([studio(), studio({ id: 14, delivery: { method: 'pickup' }, created: ago(1) })], NOW);
  const r = SHIP.shippingReminder(s, { toShip: [], labelled: [] }, { money });
  assert.strictEqual(r.count, 2);
  assert.strictEqual(r.oldest, 50);
  assert.strictEqual(r.subject, '📦 1 to ship · 1 pickup to get ready — oldest waiting 50 days');
  assert.strictEqual(r.toShip[0].title, 'Studio order #10');
  assert.strictEqual(r.toShip[0].anchor, 'studio-10');
  assert.strictEqual(r.pickups[0].what, 'pickup — mark it ready and they are emailed');
});

/* ── The page and its routes ────────────────────────────────────────────── */

test('every Shipping route is behind the admin sign-in', () => {
  for (const r of ["app.get('/admin/shipping', requireAdmin", "app.post('/admin/shipping/buy', requireAdmin",
                   "app.post('/admin/shipping/check', requireAdmin", "app.post('/admin/shipping/shipped', requireAdmin",
                   "app.post('/admin/shipping/address', requireAdmin"]) {
    assert.ok(src.includes(r), `${r} is missing or not gated`);
  }
  assert.strictEqual((src.match(/app\.(get|post)\('\/admin\/shipping/g) || []).length, 5, 'no ungated Shipping route');
  /* Under /admin, where the Cloudflare rule in front of the back office covers it. */
  assert.doesNotMatch(src, /app\.(get|post)\('\/shipping/);
});

test('a studio order is bought for the address the studio holds, never one sent from here', () => {
  const buy = route("app.post('/admin/shipping/buy', requireAdmin");
  assert.match(buy, /payload = \{ action: 'buy', order_id: r\.id, shipment, rate, file \};/);
  assert.match(buy, /payload = \{ action: 'buy', quote: r\.code, shipment, rate, file,/);
  assert.match(buy, /if \(state === 'labelled'\) return shipBack/, 'a job with a label is not bought again');
  assert.match(buy, /studioShip\(payload, 75000\)/, 'long enough for Shippo to make the label');
});

test('marking a quote job shipped is the board move, which tells the customer', () => {
  const shipped = route("app.post('/admin/shipping/shipped', requireAdmin");
  assert.match(shipped, /await moveJobToStage\(r\.code, SHIP_STAGE_OUT\);/);
  assert.match(shipped, /if \(!label && !tracking\)/, 'no label and no tracking number: not shipped');
  assert.match(src, /const SHIP_STAGE_OUT = JOB_STAGES\.findIndex\(\(s\) => s\.key === 'out'\);/);
});

test('an address cannot be changed under a label already bought', () => {
  const addr = route("app.post('/admin/shipping/address', requireAdmin");
  assert.match(addr, /if \(rows\[0\]\.ship_label && \(rows\[0\]\.ship_label\.label_url \|\| rows\[0\]\.ship_label\.pending\)\)/);
});

test('refs are parsed strictly', () => {
  const sandbox = { QUOTE_CODE_RE: /^(?:[A-Z0-9]{6}|[A-Z0-9]{10})$/ };
  vm.createContext(sandbox);
  vm.runInContext(lift('parseShipRef'), sandbox);
  const p = sandbox.parseShipRef;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p('studio-10'))), { kind: 'studio', id: 10, ref: 'studio-10' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p('quote-abcdef2345'))), { kind: 'quote', code: 'ABCDEF2345', ref: 'quote-ABCDEF2345' });
  for (const bad of ['studio-0', 'studio-10;drop', 'quote-ABC', 'quote-ABCDEF2345#', '', null, 'studio-1e3']) {
    assert.strictEqual(p(bad), null, `${bad} should be refused`);
  }
});

/* The card, rendered from its own source with the helpers it uses. */
function card() {
  const sandbox = { SHIP, money, STUDIO_ADMIN: 'https://design.jtees.net/admin.php',
    quoteSummary: (items) => (items || []).map((i) => i.description).join(' + ') || 'your order',
    balanceOf: (q, t) => Math.max(0, Number(t) - Number(q.paid_amount || 0)),
    quoteTotals: (q) => ({ total: Number(q.total || 0) }) };
  vm.createContext(sandbox);
  vm.runInContext([
    lift('escEmail'), lift('pill'),
    (/^const shipUrlOk = .*;$/m.exec(src) || [])[0],
    lift('shipWeighForm'), lift('shipRatesHtml'), lift('shipDoneForm'), lift('shipElsewhereForm'),
    lift('shipAddressForm'), lift('shipCardHtml'),
  ].join('\n'), sandbox);
  return sandbox.shipCardHtml;
}

test('a studio order to ship: its weight form, prefilled, and no buy button until there are prices', () => {
  const html = card()({ kind: 'studio', o: Object.assign(studio(), { state: 'to-ship', waitingDays: 50, balance: 0 }) }, null);
  assert.match(html, /id="studio-10"/);
  assert.match(html, /Studio order #10/);
  assert.match(html, /waiting 50 days/);
  assert.match(html, /action="\/admin\/shipping#studio-10"/);
  assert.match(html, /name="rates" value="studio-10"/);
  assert.match(html, /name="oz" type="number"[^>]*value="15"/, 'the studio estimate is where it starts');
  assert.doesNotMatch(html, /action="\/admin\/shipping\/buy"/);
  assert.match(html, /Bought the postage somewhere else\?/);
});

test('with prices, the one the customer paid for is chosen and the buy form carries the shipment', () => {
  const o = Object.assign(studio({ delivery: { method: 'ship', source: 'rate', service: 'USPS Ground Advantage', paid: 6 } }),
    { state: 'to-ship', waitingDays: 1, balance: 0 });
  const rates = { ref: 'studio-10', oz: 15, box: 'mailer', shipment: 'shp_1234567890', error: '',
    list: [{ id: 'rate_cheap000001', name: 'UPS Ground Saver', amount: 5.1, days: 5 },
           { id: 'rate_usps0000002', name: 'USPS Ground Advantage', amount: 5.4, days: 3 }] };
  const html = card()({ kind: 'studio', o }, rates);
  assert.match(html, /action="\/admin\/shipping\/buy" data-once/);
  assert.match(html, /name="shipment" value="shp_1234567890"/);
  assert.match(html, /value="rate_usps0000002" checked/);
  assert.doesNotMatch(html, /value="rate_cheap000001" checked/);
  assert.match(html, /what they paid for/);
});

test('a customer’s own words are escaped wherever the card shows them', () => {
  const o = Object.assign(studio({ name: '<img src=x onerror=alert(1)>', items: [{ name: '<b>Tee</b>', qty: 1 }],
    ship_to: { name: 'x', street1: '<script>', city: 'C', state: 'IL', zip: '60657', country: 'US', phone: '"><x' } }),
    { state: 'to-ship', waitingDays: 0, balance: 0 });
  const html = card()({ kind: 'studio', o }, null);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<b>Tee<\/b>/);
  assert.doesNotMatch(html, /"><x/);
});

test('a label bought: print it, then mark it shipped; a link that is not https is not a link', () => {
  const o = Object.assign(studio({ label: { name: 'USPS Ground Advantage', amount: 5.4, tracking: '9400111',
    label_url: 'https://shippo.example/label.pdf', tracking_url: 'javascript:alert(1)' } }), { state: 'labelled', waitingDays: 2, balance: 0 });
  const html = card()({ kind: 'studio', o }, null);
  assert.match(html, /href="https:\/\/shippo\.example\/label\.pdf"[^>]*>Print label</);
  assert.match(html, /action="\/admin\/shipping\/shipped"/);
  assert.doesNotMatch(html, /javascript:/);
});

test('a quote job with no address asks for one; a held order says not to ship', () => {
  const html = card()({ kind: 'quote', o: Object.assign(job({ ship_to: null }), { state: 'to-ship', waitingDays: 3 }) }, null);
  assert.match(html, /No complete delivery address yet/);
  assert.match(html, /action="\/admin\/shipping\/address"/);
  assert.doesNotMatch(html, /name="rates"/);
  const held = card()({ kind: 'studio', o: Object.assign(studio({ tax_exempt: 'pending' }), { state: 'held', waitingDays: 1, balance: 0 }) }, null);
  assert.match(held, /don&rsquo;t ship yet/);
  assert.doesNotMatch(held, /name="rates"/);
});

test('a studio order with no state still gets its label prices; a quote job does not', () => {
  const noState = studio({ ship_to: { name: 'P', street1: '1 Main St', city: 'Chicago', state: '', zip: '60657', country: 'US' } });
  const html = card()({ kind: 'studio', o: Object.assign(noState, { state: 'to-ship', waitingDays: 1, balance: 0 }) }, null);
  assert.match(html, /name="rates" value="studio-10"/, 'the ZIP says where it goes; Shippo judges the rest');
  const q = card()({ kind: 'quote', o: Object.assign(job({ ship_to: { name: 'S', street1: '2 Oak', city: 'E', state: '', zip: '60201' } }),
    { state: 'to-ship', waitingDays: 1 }) }, null);
  assert.match(q, /missing: state/);
});

test('an order going abroad is not offered a domestic label', () => {
  const o = Object.assign(studio({ ship_to: { name: 'P', street1: '1 Rue', city: 'Paris', state: '', zip: '75001', country: 'FR' } }),
    { state: 'to-ship', waitingDays: 1, balance: 0 });
  const html = card()({ kind: 'studio', o }, null);
  assert.match(html, /Going outside the US \(FR\)/);
  assert.doesNotMatch(html, /name="rates"/);
});

/* ── Telling people ─────────────────────────────────────────────────────── */

test('the menu, the dashboard and the morning email all say what is waiting', () => {
  assert.match(src, /\{ key: 'shipping', +href: '\/admin\/shipping', +label: 'Shipping', +icon: 'truck', +badge: 'shipping' \}/);
  assert.match(src, /shippingQueues\(\)\.then\(\(d\) => \{ const w = shippingWaiting\(d\); out\.shipping = w \? w\.count : 0; \}\)/);
  const dash = route("app.get('/admin/dashboard', requireAdmin");
  assert.match(dash, /title: `\$\{ship\.count\} paid order\$\{ship\.count === 1 \? '' : 's'\} waiting to go out`/);
  assert.match(dash, /href: '\/admin\/shipping' \}\] : \[\]\),/);
  const digest = lift('sendDailyDigest');
  assert.match(digest, /if \(!rows\.length && !ship( && !healthHtml)?\) return;/, 'a day with only studio orders waiting still sends');
  assert.match(digest, /if \(!live\.length && !ship( && !healthHtml)?\) return;/);
  assert.match(digest, /\(ship \? `\$\{ship\.subject\} · ` : ''\) \+/);
  assert.match(digest, /\$\{shipDigestHtml\(ship\)\}<h2/);
});

test('the new-order email opens with SHIP or PICKUP, and a pickup is told it is ready, not on its way', () => {
  const note = route("app.post('/api/order-notification'");
  assert.match(note, /\(delivery\.method === 'pickup' \? ' — PICKUP' : delivery\.method === 'local' \? ' — LOCAL DELIVERY' : ' — SHIP'\)/);
  const shipped = route("app.post('/api/order-shipped'");
  assert.match(shipped, /if \(status === 'shipped' && pickup\) await sendEmail\(\{/);
  assert.match(shipped, /is ready for pickup 🎉/);
  assert.match(shipped, /pickup \? SMS\.studioOrderReady\(\{ orderId: b\.order_id \}\)/);
});

test('a quote job shipped with a label bought here links the carrier’s tracking page', () => {
  const m = lift('notifyQuoteMilestone');
  assert.match(m, /const trackUrl = \/\^https:\\\/\\\/\[\^\\s"'<>\]\+\$\/\.test\(String\(label\.tracking_url \|\| ''\)\)/);
  assert.match(m, /has shipped\$\{by \? ` by \$\{escEmail\(by\)\}` : ''\}/);
});

/* ── The Books page ─────────────────────────────────────────────────────── */

test('sales are accepted jobs, in the month accepted, at what the customer pays before tax', () => {
  /* "This is wrong" (the owner, 2026-09-30): $12,183.66 of sales and $10,170
     profit on $3,963.72 collected. Every quote CREATED counted as a sale. */
  const books = route('app.get(FINANCES_PATH, requireAdmin');
  assert.match(books, /SUM\(COALESCE\(total,0\) - COALESCE\(tax,0\)\) AS sales/);
  assert.match(books, /WHERE accepted_at IS NOT NULL AND cancelled_at IS NULL AND status NOT IN \('expired', 'held', 'draft'\)/);
  assert.match(books, /EXTRACT\(YEAR FROM accepted_at\) = \$1/);
  assert.doesNotMatch(books, /SUM\(subtotal\) AS sales/);
  /* Studio orders and other card payments are sales too, in the month paid. */
  assert.match(books, /FROM unlinked_payments/);
});

test('the margin is measured on the jobs that have costs, not three jobs against twenty-nine', () => {
  const books = route('app.get(FINANCES_PATH, requireAdmin');
  assert.match(books, /const marginPct = T\.costedSales > 0 \? \(T\.costedSales - T\.costs\) \/ T\.costedSales : null;/);
  assert.doesNotMatch(books, /const marginPct = \(T\.sales > 0 && T\.costs > 0\)/);
  // The year's net, and the shown month's (S is the year's T in the year view).
  assert.match(books, /const yearNetKnown = T\.costs > 0 \|\| expTotal > 0;/);
  assert.match(books, /const netKnown = S\.costs > 0 \|\| ovShown > 0;/);
});

/* ── Helpers ────────────────────────────────────────────────────────────── */

test('a helper reaches Shipping with the production toggle; buying a label is its own toggle, off in every preset', () => {
  const STAFF = require('../tools/lib/staff');
  const helper = (perms) => ({ kind: 'staff', id: 1, perms });
  const packer = helper({ 'production.stage': 'on' });
  assert.ok(STAFF.mayUseRoute(packer, 'GET', '/admin/shipping'));
  assert.ok(STAFF.mayUseRoute(packer, 'POST', '/admin/shipping/shipped'));
  assert.ok(STAFF.mayUseRoute(packer, 'POST', '/admin/shipping/address'));
  assert.ok(STAFF.mayUseRoute(packer, 'POST', '/admin/shipping/check'));
  assert.ok(!STAFF.mayUseRoute(packer, 'POST', '/admin/shipping/buy'), 'buying spends the owner’s money');
  assert.ok(STAFF.mayUseRoute(helper({ 'production.stage': 'on', 'shipping.labels': 'on' }), 'POST', '/admin/shipping/buy'));
  assert.ok(!STAFF.mayUseRoute(helper({ 'orders.view': 'on' }), 'GET', '/admin/shipping'));
  for (const name of ['training', 'supervised', 'trusted']) {
    assert.strictEqual(STAFF.presetPerms(name)['shipping.labels'].level, 'off', `${name} buys no labels`);
  }
  assert.ok(STAFF.mayUseRoute({ kind: 'owner' }, 'POST', '/admin/shipping/buy'));
});
