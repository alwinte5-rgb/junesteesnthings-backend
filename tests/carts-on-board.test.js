'use strict';

/* Unfinished carts on the board.
 *
 * The five-touch recovery sequence already works and the emails already arrive.
 * What was missing was anywhere to SEE the carts: the board showed quotes and
 * orders, so a half-finished cart worth real money existed only as mail in an
 * inbox. Nobody chases what is not on the page they work from — the same fault
 * that lost 21 website enquiries.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const board = src.slice(src.indexOf('async function renderBoard'));
const feed = fs.readFileSync(path.join(ROOT,
  'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/orders_feed.php'), 'utf8');

test('the board reads carts over the feed, not a second database', () => {
  /* The designer owns its own MySQL. Opening a connection to it from the
     backend would put the schema in two codebases that deploy separately. */
  assert.match(feed, /'carts' => \$cartOut/, 'the feed must publish carts');
  assert.match(src, /carts: Array\.isArray\(d\.carts\) \? d\.carts : \[\]/,
    'and the backend must read them from it');
  assert.doesNotMatch(board, /saved_carts/,
    'the board must not query the designer database directly');
});

test('a feed without carts does not break the board', () => {
  /* The designer and the backend deploy separately, so for a window the feed is
     the old one and sends no carts at all. Undefined here would throw on
     .slice() and take the whole board down — over a section that is a nicety. */
  assert.match(src, /carts: \[\], error: 'JT_INTERNAL_KEY not set'/,
    'the no-key path must still return an array');
  assert.match(src, /carts: _studioCache\.carts \|\| \[\]/,
    'the error path must too');
  assert.match(board, /\(studio\.carts \|\| \[\]\)\.filter\(/,
    'and the board must not assume the field exists');
});

test('a cart that became an order is not shown', () => {
  /* A cart that turned into a sale is a success, not an outstanding job. */
  assert.match(feed, /NOT EXISTS \(\s*\n?\s*SELECT 1 FROM `\{\$px\}orders` o/,
    'the feed must exclude carts followed by an order');
  assert.match(feed, /INTERVAL 30 DAY/,
    'and stop showing carts nobody is going to chase');
});

test('the card says how many recovery emails have gone', () => {
  /* "They have not heard from us" and "they have had five and said nothing"
     are opposite instructions to the shop. Without the count the card cannot
     tell them apart. */
  assert.match(board, /of 5 recovery emails sent/);
  assert.match(board, /sequence finished, no reply/,
    'a finished sequence with no reply is the one worth a human touch');
});

test('an empty cart is described as what it is', () => {
  /* The exit popup captures an email with no items. Rendering that as "0 items
     · $0.00" reads as a bug; it is actually a lead. */
  assert.match(board, /Left an email but never added anything/);
});

test('carts carrying value sort first', () => {
  const start = board.indexOf('const carts = (studio.carts');
  const sortLine = board.slice(start, start + 700);
  assert.ok(sortLine.includes('(Number(b.items) > 0) - (Number(a.items) > 0)'),
    'a cart with items outranks a bare email address');
  assert.ok(sortLine.includes('new Date(b.updated) - new Date(a.updated)'),
    'then newest first');
});

test('Quote them actually carries the customer across', () => {
  /* A button that looks like it prefills and does not is worse than no button:
     it teaches the operator the shortcut does not work. */
  assert.match(board, /href="\/quote\/new\?email=\$\{encodeURIComponent\(c\.email \|\| ''\)\}"/);
  assert.match(src, /const cartEmail = String\(req\.query\.email \|\| ''\)/,
    'the form must read it');
  assert.match(src, /cartEmail && isValidEmail\(cartEmail\)/,
    'and validate it — it arrives in a URL');
});

test('a cart-prefilled quote posts as new, not as an edit', () => {
  /* Same trap as the lead prefill: `existing` is set but there is no code. */
  const block = src.slice(src.indexOf('const cartEmail'), src.indexOf('const leadId'));
  assert.match(block, /code: null/, 'a prefilled quote must carry no code');
});

test('a design preview is shown only when the feed says one exists', () => {
  /* The feed checks the disk inside the app that owns the files, because a cart
     abandoned before the design was committed leaves a `file` reference with
     nothing behind it. Guessing the URL from the board ships broken frames and
     teaches the operator to distrust the page — one cart on file right now has
     exactly that dangling reference. */
  assert.match(board, /Array\.isArray\(c\.previews\) && c\.previews\.length \?/,
    'no previews means no image block at all');
  assert.ok(feed.includes('if (!is_file($tmp)) continue;'),
    'the item render must exist before its screenshots are read');
  assert.ok(feed.includes('is_file($up . str_replace'),
    'and each screenshot must exist on disk before its URL is published');
  assert.match(feed, /allowed_classes.*=> false/,
    'the cart blob is unserialised without instantiating objects');
  assert.ok(feed.includes("preg_match('#^"), 'the path shape is checked rather than trusted');
  assert.ok(feed.includes("^user_data/"),
    'and only files under user_data are published — no traversal, no guessing');
});

/* ── Clearing things off the board ───────────────────────────────────────── */

test('a cart can be dismissed, and the dismissal lives in the backend', () => {
  /* The designer owns the cart; the backend owns whether the shop has dealt
     with it. Writing back to the designer's table would make the feed
     read-write and put that state in the app that deploys separately. */
  assert.match(src, /app\.post\('\/cart\/dismiss', requireAdmin/);
  assert.match(src, /CREATE TABLE IF NOT EXISTS dismissed_carts/);
  assert.doesNotMatch(feed, /UPDATE .*saved_carts/, 'the feed stays read-only');
});

test('dismissing closes the version seen, not the customer', () => {
  /* Keyed by the cart's `updated` at that moment: if they come back and change
     their cart it resurfaces, because that is new information. A permanent
     per-email block would hide a customer who returned ready to buy. */
  const route = src.slice(src.indexOf("app.post('/cart/dismiss'"));
  assert.match(route, /cart_updated = EXCLUDED\.cart_updated/,
    're-dismissing must move the watermark forward');
  assert.match(board, /return !seen \|\| new Date\(c\.updated\) > seen;/,
    'a cart touched since its dismissal must come back');
});

test('a malformed dismissal is refused rather than stored', () => {
  /* `updated` arrives from a hidden field. An unparseable date would store
     Invalid Date and hide the cart forever, or never. */
  const route = src.slice(src.indexOf("app.post('/cart/dismiss'"));
  assert.match(route, /Number\.isNaN\(updated\.getTime\(\)\)\) return res\.redirect/);
});

test('cancelled quotes stay findable in Orders', () => {
  /* They are off the board now. If Orders only carried paid or delivered work,
     a cancelled quote with no payment would vanish from both places. */
  const orders = src.slice(src.indexOf("app.get('/orders'"));
  assert.match(orders.slice(0, 1600), /OR cancelled_at IS NOT NULL/,
    'Orders must include cancelled work, or cancelling destroys the record');
});
