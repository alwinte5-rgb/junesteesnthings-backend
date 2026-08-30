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
  assert.match(board, /const gOrders = rows\.filter\(\(q\) => !isCancelled\(q\) && isPaid\(q\) && !isDelivered\(q\)\)/);
  assert.match(board, /const gQuotes = rows\.filter\(\(q\) => !isCancelled\(q\) && !isPaid\(q\) && !isDelivered\(q\)\)/);
});

test('every job lands in exactly one group', () => {
  /* A job appearing twice would double the board; one appearing nowhere would
     be invisible, which is worse. */
  const rows = [
    { code: 'A', paid_amount: 0,   delivered_at: null, cancelled_at: null },        // open quote
    { code: 'B', paid_amount: 500, delivered_at: null, cancelled_at: null },        // order
    { code: 'C', paid_amount: 500, delivered_at: '2026-08-01', cancelled_at: null },// delivered
    { code: 'D', paid_amount: 0,   delivered_at: '2026-08-01', cancelled_at: null },// delivered unpaid
    { code: 'E', paid_amount: null, delivered_at: null, cancelled_at: null },       // never touched
    { code: 'F', paid_amount: 0,   delivered_at: null, cancelled_at: '2026-08-30' },// cancelled
    /* Cancelled AFTER being hidden as delivered — the exact state the old
       workaround left behind. It must read as cancelled, not as delivered. */
    { code: 'G', paid_amount: 0,   delivered_at: '2026-08-01', cancelled_at: '2026-08-30' },
  ];
  const isCancelled = (q) => !!q.cancelled_at;
  const isDelivered = (q) => !!q.delivered_at && !isCancelled(q);
  const isPaid = (q) => Number(q.paid_amount || 0) > 0;
  const groups = {
    orders: rows.filter((q) => !isCancelled(q) && isPaid(q) && !isDelivered(q)),
    quotes: rows.filter((q) => !isCancelled(q) && !isPaid(q) && !isDelivered(q)),
    done:   rows.filter(isDelivered),
    cancelled: rows.filter(isCancelled),
  };
  const seen = [].concat(groups.orders, groups.quotes, groups.done, groups.cancelled)
    .map((q) => q.code).sort();
  assert.deepStrictEqual(seen, ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    'every row must appear exactly once across the four groups');
  assert.deepStrictEqual(groups.cancelled.map((q) => q.code), ['F', 'G']);
  assert.deepStrictEqual(groups.done.map((q) => q.code), ['C', 'D'],
    'a cancelled job is not delivered work, even if it carries a delivered stamp');
  assert.deepStrictEqual(groups.quotes.map((q) => q.code), ['A', 'E'],
    'a null paid_amount is unpaid, not paid');
  assert.deepStrictEqual(groups.orders.map((q) => q.code), ['B']);
});

test('an empty group renders nothing at all', () => {
  /* A heading with no cards under it reads as a broken page — unless the group
     asks to stay visible, which only a section whose emptiness is itself the
     news should do. */
  assert.match(board, /if \(!list\.length && !o\.always\) return '';/,
    'an empty group must render as an empty string by default');
});

test('the three groups are rendered in working order', () => {
  /* Work in hand first — it has deadlines and money attached. Quotes second,
     because they need chasing. Delivered last, because it is history. */
  /* Delivered work is deliberately NOT here any more — it lives in Orders. A
     dashboard is for what still needs doing. */
  const e = board.indexOf("group('New enquiries'");
  const i = board.indexOf("group('Orders'");
  const j = board.indexOf("group('Open quotes'");
  const l = board.indexOf("group('Cancelled'");
  assert.ok(e > -1 && i > -1 && j > -1 && l > -1, 'all four live groups must be rendered');
  assert.ok(e < i && i < j && j < l,
    'order must be New enquiries, Orders, Open quotes, then Cancelled last');
  assert.strictEqual(board.indexOf("group('Delivered'"), -1,
    'delivered work must not be rendered on the board');
});

test('the sort inside each group is preserved', () => {
  /* The groups filter the already-sorted `rows`, so behind-schedule and
     soonest-deadline still float within the work in hand. Building them from
     the raw query would silently drop that. */
  assert.match(board, /rows\.filter\(\(q\) => !isCancelled\(q\) && isPaid/,
    'groups must filter the sorted rows, not re-query');
});

test('the header counts the two live groups separately', () => {
  /* "10 total" told June nothing about how many quotes were actually
     outstanding — which is the number the board exists to answer. */
  /* Whitespace-tolerant: the header wraps across lines, and a test that breaks
     on reformatting teaches people to stop trusting the suite. */
  assert.match(board, /gQuotes\.length\}\s*open quote/);
  assert.match(board, /gOrders\.length\}\s*order/);
  assert.match(board, /\$\{leads\.length\} new enquir/,
    'unanswered enquiries lead the count — they are the ones that cost money');
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

/* ── The layout, which the grouping tests above did NOT catch ────────────── */

test('a section heading spans every grid column', () => {
  /* This shipped broken. `.quote-grid` is `display:grid` with 2-3 columns, so a
     heading placed inside it is just another GRID ITEM: it takes one cell and
     the cards flow around it. The board rendered "Open quotes" sitting beside a
     card from a different section — worse than no headings at all, because it
     reads as fact.
     Every grouping test above passed the whole time, because they checked which
     list a job lands in and never that the heading is drawn above that list. */
  assert.match(src, /\.quote-grid-head\{grid-column:1\/-1/,
    'the heading must span all columns, or it becomes a card-sized cell');
  assert.match(board, /<div class="quote-grid-head">/,
    'the group heading must use that class');
  assert.doesNotMatch(board, /<div style="display:flex;align-items:baseline;gap:10px;margin:22px 0 10px">/,
    'an inline-styled heading with no column span reintroduces the bug');
});

test('each lane keeps its headings with its own cards', () => {
  /* The board is two lanes now — opportunities left, work in hand right — so a
     long enquiry list can no longer push the open quotes off the bottom.
     Each lane wraps its own .quote-grid, and the heading still has to sit with
     the cards it labels rather than in a container of its own. */
  assert.match(board, /<div class="board-lane"><div class="quote-grid">\$\{laneLeft/);
  assert.match(board, /<div class="board-lane"><div class="quote-grid">\$\{laneRight/);
  assert.match(src, /\.board-lane \.quote-grid\{display:block\}/,
    'inside a lane the cards stack single-file — a grid within a lane would ' +
    'reintroduce the narrow two-column squeeze the lanes exist to avoid');
});

test('one empty lane still renders, so the columns do not jump', () => {
  /* If an empty lane collapsed, the surviving lane would jump full-width and
     back as work moved between them. */
  assert.ok(board.includes('${laneLeft ||'), 'the left lane needs an empty fallback');
  assert.ok(board.includes('${laneRight ||'), 'and so does the right');
  assert.ok(board.includes('No new enquiries or unfinished carts.'));
  assert.ok(board.includes('No open work.'));
});
