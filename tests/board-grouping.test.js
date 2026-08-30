'use strict';

/* The Jobs board rendered every quote in one flat list, so a job with the
 * deposit already in sat among the quotes still waiting for an answer. The
 * "open quotes" list was therefore never a list of open quotes, and the only
 * way to find what still needed chasing was to read every card.
 *
 * Money is the line: once a deposit has arrived the job is work in hand, not an
 * offer. So the board groups on `paid_amount > 0`, with delivered work dropping
 * out of both.
 *
 * NOT moved to /orders — that route is the DESIGNER's online store orders from
 * design.jtees.net, which are a different thing with a different source. Merging
 * them would produce one list that means nothing.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const board = src.slice(src.indexOf('async function renderBoard'));

test('the board groups on money arriving, not on status text', () => {
  /* `status` is a string that several paths write; paid_amount is the ledger
     figure. Grouping on the string would put a quote marked "accepted" in with
     the paid work while no money had moved. */
  assert.match(board, /const isPaid = \(q\) => Number\(q\.paid_amount \|\| 0\) > 0/,
    'the split must be on the amount actually paid');
  assert.match(board, /const gOrders = rows\.filter\(\(q\) => isPaid\(q\) && !isDelivered\(q\)\)/);
  assert.match(board, /const gQuotes = rows\.filter\(\(q\) => !isPaid\(q\) && !isDelivered\(q\)\)/);
});

test('every job lands in exactly one group', () => {
  /* A job appearing twice would double the board; one appearing nowhere would
     be invisible, which is worse. */
  const rows = [
    { code: 'A', paid_amount: 0,   delivered_at: null },        // open quote
    { code: 'B', paid_amount: 500, delivered_at: null },        // order
    { code: 'C', paid_amount: 500, delivered_at: '2026-08-01' },// delivered
    { code: 'D', paid_amount: 0,   delivered_at: '2026-08-01' },// delivered unpaid
    { code: 'E', paid_amount: null, delivered_at: null },       // never touched
  ];
  const isDelivered = (q) => !!q.delivered_at;
  const isPaid = (q) => Number(q.paid_amount || 0) > 0;
  const groups = {
    orders: rows.filter((q) => isPaid(q) && !isDelivered(q)),
    quotes: rows.filter((q) => !isPaid(q) && !isDelivered(q)),
    done:   rows.filter(isDelivered),
  };
  const seen = [].concat(groups.orders, groups.quotes, groups.done).map((q) => q.code).sort();
  assert.deepStrictEqual(seen, ['A', 'B', 'C', 'D', 'E'],
    'every row must appear exactly once across the three groups');
  assert.deepStrictEqual(groups.quotes.map((q) => q.code), ['A', 'E'],
    'a null paid_amount is unpaid, not paid');
  assert.deepStrictEqual(groups.orders.map((q) => q.code), ['B']);
});

test('an empty group renders nothing at all', () => {
  /* A heading with no cards under it reads as a broken page. */
  assert.match(board, /const group = \(title, note, list\) => !list\.length \? '' :/,
    'an empty group must render as an empty string');
});

test('the three groups are rendered in working order', () => {
  /* Work in hand first — it has deadlines and money attached. Quotes second,
     because they need chasing. Delivered last, because it is history. */
  const i = board.indexOf("group('Orders'");
  const j = board.indexOf("group('Open quotes'");
  const k = board.indexOf("group('Delivered'");
  assert.ok(i > -1 && j > -1 && k > -1, 'all three groups must be rendered');
  assert.ok(i < j && j < k, 'order must be Orders, then Open quotes, then Delivered');
});

test('the sort inside each group is preserved', () => {
  /* The groups filter the already-sorted `rows`, so behind-schedule and
     soonest-deadline still float within the work in hand. Building them from
     the raw query would silently drop that. */
  assert.match(board, /rows\.filter\(\(q\) => isPaid/,
    'groups must filter the sorted rows, not re-query');
});

test('the header counts the two live groups separately', () => {
  /* "10 total" told June nothing about how many quotes were actually
     outstanding — which is the number the board exists to answer. */
  assert.match(board, /\$\{gQuotes\.length\} open quote/);
  assert.match(board, /gOrders\.length\} order/);
});

test('the studio orders route is left alone', () => {
  /* /orders is the designer storefront's own orders. If this ever starts
     rendering quotes, the two sources have been conflated. */
  const orders = src.slice(src.indexOf("app.get('/orders'"));
  assert.match(orders.slice(0, 400), /fetchStudioOrders\(\)/,
    '/orders must still serve the designer store orders');
  assert.doesNotMatch(orders.slice(0, 400), /gOrders|quoteCard/,
    'quotes must not be merged into the studio orders page');
});
