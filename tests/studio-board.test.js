/* Studio orders on the jtees.net Production board (2026-11-05).
 *
 * Run: node --test tests/studio-board.test.js
 *
 * Paid design.jtees.net orders sat in a read-only list under the board, an
 * unpaid one read "In production", and a checkout the buyer walked away from
 * showed nowhere. These keep the three fixed: paid orders are cards in the
 * lanes, unpaid and left checkouts are the list under it, and both reach the
 * bell.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extractFn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let i = src.indexOf('(', start), parens = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')' && --parens === 0) { i++; break; }
  }
  let depth = 0;
  for (let j = src.indexOf('{', i); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}
function extractConst(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `${anchor} not found`);
  return src.slice(start, src.indexOf('];', start) + 2);
}

const lib = vm.runInThisContext(`(function () {
  const STUDIO_BASE = 'https://design.example';
  const round2 = (n) => Math.round(Number(n) * 100) / 100;
  const money = (n) => '$' + Number(n || 0).toFixed(2);
  const escEmail = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const dayShort = (d) => String(d).slice(0, 10);
  const disputeChip = () => '';
  const firstTouchLabel = () => '';
  const parseFirstTouch = () => null;
  ${extractConst('const JOB_STAGES = [')}
  ${extractFn('studioStage')}
  ${extractFn('studioFullyRefunded')}
  ${extractFn('studioLane')}
  ${extractFn('studioExemptChip')}
  ${extractFn('studioCard')}
  ${extractFn('studioOrdersSection')}
  ${extractFn('studioBoardNote')}
  const STUDIO_BOARD_ERRORS = ${src.slice(src.indexOf('const STUDIO_BOARD_ERRORS = ') + 'const STUDIO_BOARD_ERRORS = '.length, src.indexOf('};', src.indexOf('const STUDIO_BOARD_ERRORS = ')) + 1)};
  return { JOB_STAGES, studioStage, studioLane, studioCard, studioOrdersSection, studioBoardNote: (q) => studioBoardNote(q), STUDIO_BOARD_ERRORS };
})`)();

const OUT = lib.JOB_STAGES.findIndex((s) => s.key === 'out');
const order = (o) => ({ id: 7, status: 'processing', total: 40, paid: 40, refunded: 0, name: 'Kim', email: 'kim@example.com', ...o });

test('an unpaid studio order is never "In production"', () => {
  assert.strictEqual(lib.studioStage('pending', 0).label, 'Not paid yet');
  assert.strictEqual(lib.studioStage('pending').label, 'Not paid yet');
  assert.strictEqual(lib.studioStage('processing', 0).label, 'Not paid yet');
  assert.strictEqual(lib.studioStage('processing', 40).label, 'In production');
});

test('a paid order is in To start until it ships, then Ready / Shipped', () => {
  assert.strictEqual(lib.studioLane(order()), 0);
  assert.strictEqual(lib.studioLane(order({ paid: 20 })), 0, 'a deposit is still work');
  assert.strictEqual(lib.studioLane(order({ status: 'shipped' })), OUT);
});

test('unpaid, fully refunded and delivered orders are not lane work', () => {
  assert.strictEqual(lib.studioLane(order({ status: 'pending', paid: 0 })), null);
  assert.strictEqual(lib.studioLane(order({ refunded: 40 })), null);
  assert.strictEqual(lib.studioLane(order({ status: 'complete' })), null);
});

test('a studio card: To start goes to Shipping, Ready / Shipped gets Delivered', () => {
  const start = lib.studioCard(order(), null);
  assert.match(start, /href="\/admin\/shipping#studio-7"/);
  assert.doesNotMatch(start, /\/delivered/);
  assert.match(start, /Studio/);
  assert.match(start, /Open in studio/);
  const ready = lib.studioCard(order({ status: 'shipped' }), null);
  assert.match(ready, /<form method="POST" action="\/admin\/studio\/7\/delivered"/);
});

test('a card escapes the buyer name', () => {
  assert.doesNotMatch(lib.studioCard(order({ name: '<img src=x onerror=1>' }), null), /<img/);
});

test('under the board: only unpaid orders and left checkouts, with a way to reach them', () => {
  const feed = {
    error: null,
    orders: [order({ id: 1 }), order({ id: 2, status: 'pending', paid: 0, phone: '555-0100' }), order({ id: 3, status: 'shipped' })],
    abandoned: [{ id: 9, total: 55, created: '2026-11-04 10:00:00', name: 'Lee', email: 'lee@example.com', phone: '(773) 555-0199', items: [{ name: 'Tee', qty: 12 }] }],
  };
  const html = lib.studioOrdersSection(feed, { unpaidOnly: true });
  assert.doesNotMatch(html, /Order #1</, 'a paid order is a lane card, not a list row');
  assert.doesNotMatch(html, /Order #3</);
  assert.match(html, /Order #2</);
  assert.match(html, /Not paid yet/);
  assert.match(html, /555-0100/);
  assert.match(html, /Left checkout/);
  assert.match(html, /href="tel:7735550199"/);
  assert.match(html, /href="mailto:lee@example.com"/);
  assert.match(html, /12 &times; Tee/);
  assert.match(html, /id="studio-unpaid"/);
});

test('the All orders page still lists every studio order', () => {
  const feed = { error: null, orders: [order({ id: 1 }), order({ id: 3, status: 'shipped' })], abandoned: [{ id: 9, total: 1 }] };
  const html = lib.studioOrdersSection(feed, { heading: false });
  assert.match(html, /Order #1</);
  assert.match(html, /Order #3</);
  assert.doesNotMatch(html, /Left checkout/);
});

test('a failed feed is said, not shown as "nothing waiting"', () => {
  const html = lib.studioOrdersSection({ error: 'feed answered 500', orders: [], abandoned: [] }, { unpaidOnly: true });
  assert.match(html, /unavailable/);
  assert.doesNotMatch(html, /No unpaid studio orders/);
});

test('the board puts studio cards in the lanes and counts them', () => {
  assert.match(src, /studio: studio\.orders\.filter\(\(o\) => studioLane\(o\) === i\)/);
  assert.match(src, /\$\{c\.jobs\.length \+ c\.studio\.length\}/);
  assert.match(src, /c\.studio\.map\(\(o\) => studioCard\(o, disputes\)\)/);
});

test('Delivered goes through the studio, and the board says only fixed words', () => {
  const at = src.indexOf("app.post('/admin/studio/:id/delivered', requireAdmin");
  assert.notStrictEqual(at, -1, 'the route is admin-only');
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /\/\^\\d\{1,9\}\$\/\.test/, 'the id is checked before use');
  assert.match(route, /studioShip\(\{ action: 'delivered', order_id: id \}/);
  assert.doesNotMatch(route, /body\.error\)\s*\|\|/, 'the studio error text never goes into the link');
  assert.strictEqual(lib.studioBoardNote({ studio_done: '7' }).includes('#7</b> marked delivered'), true);
  assert.strictEqual(lib.studioBoardNote({ studio_done: '<b>' }), '');
  assert.strictEqual(lib.studioBoardNote({ studio_err: 'made up', studio_id: '7' }), '');
  assert.match(lib.studioBoardNote({ studio_err: 'not-shipped', studio_id: '7' }), /not marked ready or shipped/);
});

test('the bell: a new paid studio order and a left checkout, cleared once dealt with', () => {
  const fn = extractFn('ownerNotices');
  assert.match(fn, /kind: 'studio_order'/);
  assert.match(fn, /kind: 'studio_checkout'/);
  assert.match(fn, /notifyClearResolved\('owner', 'studio_order'/);
  assert.match(fn, /notifyClearResolved\('owner', 'studio_checkout'/);
  assert.match(fn, /if \(feed && !feed\.error\)/, 'a failed feed must not clear anything');
  const NOTIFY = require('../tools/lib/notifications');
  for (const k of ['studio_order', 'studio_checkout']) {
    assert.strictEqual(NOTIFY.KINDS[k].email, false, `${k} stays bell-only: no second email`);
    assert.strictEqual(NOTIFY.KINDS[k].who, 'owner');
  }
  assert.strictEqual(NOTIFY.safeLink('/admin/production#studio-card-7'), '/admin/production#studio-card-7');
  assert.strictEqual(NOTIFY.safeLink('/admin/production#studio-unpaid'), '/admin/production#studio-unpaid');
});
