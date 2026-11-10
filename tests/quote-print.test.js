'use strict';

/* The printable quote (owner, 2026-11-10: "make a quote into a printable
 * invoice for customers needing a paper copy").
 *
 * QUOTE until accepted, INVOICE after, numbered with the quote code. The
 * figures come from the same helpers the customer's quote page uses, so this
 * file runs the REAL quoteTotals / balanceOf / customerLineFigures lifted out
 * of server.js against a few quotes, and checks the paper says what the
 * screen says: the total, the deposit or balance, and nothing owed once paid,
 * refunded or cancelled. The layout escapes every value it prints.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const { renderQuotePrint, esc } = require('../tools/lib/quote-print');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

/* The real pricing helpers, with the few constants and lookups they read. */
const env = {
  round2: (n) => Math.round((Number(n) || 0) * 100) / 100,
  money: (n) => `$${Number(n || 0).toFixed(2)}`,
  DEPOSIT_FULL_UNDER: 100, DEPOSIT_PC: 0.5,
  IN_ITEM_PRICE_CODES: [],
  SIZE_LIST_RE: /$^/, stripSizeLists: (d) => d,
  decorationSummary: () => ['DTF Printing on the front'],
  SHIP: require('../tools/lib/shipping'),
  SHOP_NAME: "June's Tees & Things", SHOP_SIGNER: 'June', SHOP_PHONE: '(773) 900-4592',
  SHOP_ADDRESS_LINE: '3047 N Lincoln Ave, Chicago, IL 60657',
  PUBLIC_BASE_URL: 'https://www.jtees.net',
  ZELLE_HANDLE: '(773) 849-1854', ZELLE_NAME: 'Andrea Winters', BALANCE_WHEN: 'on pickup or before delivery',
  SHOP_TZ: 'America/Chicago', CARD_FEE: 0.04, DELIV: { isYmd: (x) => /^\d{4}-\d{2}-\d{2}$/.test(x) },
};
vm.createContext(env);
for (const fn of ['cardFee', 'pgDateYmd', 'addonRowView', 'quoteDiscount', 'depositFor', 'quoteTotals', 'balanceOf', 'quoteTaxable', 'quoteLink', 'fmtDate',
  'oneSizeList', 'normalisedAddons', 'addonTotalOf', 'shownAddons', 'shownAddonTotalOf', 'customerLineFigures',
  'moneyEach', 'eachText', 'quotePrintModel']) {
  vm.runInContext(lift(fn), env);
}
const model = (q, back = {}, certLock = false) => vm.runInContext('quotePrintModel', env)(q,
  { catalog: { products: [], methods: [] }, back: { refundedToCard: 0, reversedByIssuer: 0, disputed: false, ...back }, certLock, staff: false });

const base = {
  code: 'K7Q2MXAB34', name: 'Dana <Lee>', phone: '312-555-0100', email: 'dana@example.com',
  created_at: '2026-11-02T15:00:00Z', valid_until: '2026-11-30', taxable: true, tax: 22.21,
  items: [
    { description: 'Gildan 5000 Tee', colour: 'Black', qty: 24, unit_price: 9.5, line_total: 278,
      addons: [{ code: 'screens', label: 'Screens', kind: 'per_screen', rate: 25, count: 2, total: 50 }] },
    { description: 'Tote bag', qty: 10, unit_price: 6, line_total: 60, optional: true },
  ],
};
const text = (html) => html.slice(html.indexOf('<body>')).replace(/<[^>]+>/g, ' ')
  .replace(/&mdash;/g, '—').replace(/&#8627;/g, '↳').replace(/&#9656;/g, '▸').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

test('before acceptance it is a QUOTE with the deposit to start', () => {
  const m = model(base);
  const html = renderQuotePrint(m);
  assert.match(html, /<h1>Quote<\/h1>/);
  assert.match(html, /#K7Q2MXAB34/);
  const t = text(html);
  assert.match(t, /Total \$300\.21/, 'the optional tote is not in the total, as on the quote page');
  assert.match(t, /Deposit to start \(50%\) \$150\.10/);
  assert.match(t, /Good through Nov 30, 2026/);
  assert.match(t, /Optional — not in the total unless chosen/);
  assert.match(t, /↳ Screens one time 2 \$25\.00 \$50\.00/, 'screens get their own row, as on the quote page');
  assert.match(t, /To order, accept this quote online: https:\/\/www\.jtees\.net\/q\/K7Q2MXAB34/,
    'before Accept the paper sends them to accept, as the quote page does: no Zelle or cash yet');
  assert.doesNotMatch(t, /Zelle|Cash at pickup/);
  assert.ok(m.lines[m.lines.length - 1].optional, 'optional lines come last on paper');
});

test('after acceptance it is an INVOICE with what was paid and the balance', () => {
  const q = { ...base, items: [base.items[0]], tax: 20.85, accepted_at: '2026-11-03T16:00:00Z', paid_amount: 150, paid_at: '2026-11-03T16:05:00Z' };
  const t = text(renderQuotePrint(model(q)));
  assert.match(t, /Invoice/);
  assert.match(t, /Invoice date Nov 3, 2026/);
  assert.match(t, /Bill to/);
  assert.match(t, /Total \$298\.85/);
  assert.match(t, /Paid Nov 3, 2026 -\$150\.00/);
  assert.match(t, /Balance due \$148\.85/);
  assert.match(t, /Online by card: \S+ \(\$154\.80 with the 4% card fee\)/, 'the card amount is the one the card page charges');
  assert.match(t, /Zelle \$148\.85 to \(773\) 849-1854 \(Andrea Winters\) with K7Q2MXAB34 in the memo/);
});

test('an evening acceptance in Chicago is dated that day, not the next', () => {
  /* 7:30pm Nov 3 in Chicago is 01:30 Nov 4 UTC; node-pg hands TIMESTAMPTZ over as a Date. */
  const q = { ...base, items: [base.items[0]], accepted_at: new Date('2026-11-04T01:30:00Z'), created_at: new Date('2026-11-03T01:30:00Z'),
    /* Made inside the context under test, so instanceof Date holds there as it does in server.js. */
    valid_until: vm.runInContext('new Date(2026, 10, 30)', env), needed_by: vm.runInContext('new Date(2026, 10, 20)', env) };
  const t = text(renderQuotePrint(model(q)));
  assert.match(t, /Invoice date Nov 3, 2026/);
  assert.match(t, /Quote date Nov 2, 2026/);
  assert.match(t, /Needed by Nov 20, 2026/, 'a DATE column keeps its own day');
});

test('nothing is asked for while a change request waits or a certificate is missing', () => {
  const acc = { ...base, items: [base.items[0]], accepted_at: '2026-11-03T16:00:00Z' };
  const pending = text(renderQuotePrint(model({ ...acc, requested_items: [{ qty: 30 }] })));
  assert.doesNotMatch(pending, /Deposit to start|Balance due|Zelle|Cash at pickup/);
  assert.match(pending, /Your change request is with June\. Payment opens once the new price is confirmed/);
  const locked = text(renderQuotePrint(model({ ...acc, taxable: false, tax: 0 }, {}, true)));
  assert.doesNotMatch(locked, /Deposit to start|Balance due|Zelle|Cash at pickup/);
  assert.match(locked, /Payment opens once your tax-exemption certificate is on file/);
});

test('a write-off is shown, so a settled invoice adds up under its stamp', () => {
  const q = { ...base, items: [base.items[0]], tax: 22, accepted_at: '2026-11-03', paid_amount: 200, written_off: 100 };
  const m = model(q);
  const t = text(renderQuotePrint(m));
  assert.match(t, /Total \$300\.00/);
  assert.match(t, /Adjusted by the shop \(no longer owed\) -\$100\.00/);
  assert.ok(m.paidInFull);
});

test('paid in full: a PAID stamp and no way-to-pay box', () => {
  const q = { ...base, items: [base.items[0]], tax: 20.85, accepted_at: '2026-11-03', paid_amount: 298.85 };
  const m = model(q);
  const html = renderQuotePrint(m);
  assert.ok(m.paidInFull);
  assert.match(html, /class="stamp paid">Paid in full/);
  assert.doesNotMatch(html, /How to pay/);
  assert.doesNotMatch(text(html), /Balance due/);
});

test('cancelled, refunded or disputed: the paper asks for nothing', () => {
  const acc = { ...base, items: [base.items[0]], accepted_at: '2026-11-03', paid_amount: 100 };
  for (const [q, back] of [[{ ...acc, cancelled_at: '2026-11-04' }, {}], [acc, { refundedToCard: 100 }], [acc, { disputed: true }]]) {
    const html = renderQuotePrint(model(q, back));
    assert.doesNotMatch(text(html), /Balance due|Deposit to start/);
    assert.doesNotMatch(html, /How to pay/);
  }
  assert.match(renderQuotePrint(model({ ...acc, cancelled_at: '2026-11-04' })), /class="stamp cancelled">Cancelled/);
  assert.match(text(renderQuotePrint(model(acc, { refundedToCard: 100 }))), /Refunded to your card \$100\.00/);
});

test('a tax-exempt quote says so instead of a $0 tax line', () => {
  const t = text(renderQuotePrint(model({ ...base, taxable: false, tax: 0, tax_exempt_ref: 'E9999-1234-05' })));
  assert.match(t, /Sales tax: exempt \(E9999-1234-05\)/);
  assert.doesNotMatch(t, /Illinois sales tax/);
});

test('every value is escaped', () => {
  const html = renderQuotePrint(model({ ...base, notes: '<script>alert(1)</script>',
    items: [{ ...base.items[0], description: '<img src=x onerror=alert(1)>', colour: '"><b>' }] }));
  assert.doesNotMatch(html, /<script>alert|<img src=x|"><b>/);
  assert.match(html, /Dana &lt;Lee&gt;/);
  assert.strictEqual(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('the route keeps the quote page guards and never writes', () => {
  const at = src.indexOf("app.get('/q/:code/print'");
  assert.notStrictEqual(at, -1, 'the print route exists');
  const body = src.slice(at, src.indexOf('\n});', at));
  assert.match(body, /quoteMissBudget\.exhausted\(req\)/, 'lookup budget checked first');
  assert.match(body, /QUOTE_CODE_RE\.test\(code\)/, 'code format checked before the query');
  assert.match(body, /status NOT IN \('held', 'draft'\)/, 'held and draft quotes are not printable');
  assert.match(body, /code = \$1/, 'the code is a bound parameter');
  assert.doesNotMatch(body, /UPDATE|INSERT|DELETE|applyAutoQuoteCode|fillBusinessShipTo/, 'printing changes nothing');
  assert.match(body, /TAXCERT\.quotePayLocked\(q, cert\)/, 'the certificate lock is read as on the quote page');
  assert.match(body, /Cache-Control', 'no-store'/);
  assert.match(src, /async function quoteMoneyBack\(code\)/);
  /* The quote page keeps its own copy of the refund and dispute lookups (its
     billing tests read them there); the paper's must be the same SQL, so the
     two can never disagree about what went back to the customer. */
  const sqlOf = (text) => (text.match(/`SELECT[\s\S]*?`/g) || []).map((q) => q.replace(/\s+/g, ' '));
  const helper = src.slice(src.indexOf('async function quoteMoneyBack(code)'), src.indexOf('\n}\n', src.indexOf('async function quoteMoneyBack(code)')));
  const pageAt = src.indexOf("app.get('/q/:code',");
  const page = src.slice(pageAt, src.indexOf('app.get(', pageAt + 20));
  const helperSql = sqlOf(helper);
  assert.strictEqual(helperSql.length, 2);
  for (const q of helperSql) assert.ok(sqlOf(page).includes(q), 'the quote page runs the same lookup: ' + q.slice(0, 60));
  assert.match(body, /quoteMoneyBack\(q\.code\)/, 'the paper reads it through quoteMoneyBack');
});

test('the shop, the customer and staff can all reach it', () => {
  assert.match(src, /href="\/q\/\$\{escEmail\(q\.code\)\}\/print\$\{staffView \? '\?staff=1' : ''\}"/, 'a link on the customer quote page');
  assert.match(src, /q\.status === 'held' \|\| q\.status === 'draft' \? '' : `<a [^`]*href="\/q\/\$\{q\.code\}\/print\?staff=1"/,
    'a button on the quotes board, not on held or draft quotes (the route would refuse them and spend the lookup budget)');
  assert.match(src, /\$\{showMoney \? `<a href="\/q\/\$\{encodeURIComponent\(q\.code\)\}\/print\?staff=1"/, 'a link on the job page, for staff who see money');
});
