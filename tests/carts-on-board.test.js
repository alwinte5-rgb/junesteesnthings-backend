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
  assert.match(board, /\(studio\.carts \|\| \[\]\)\.slice\(\)/,
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
  const sortLine = board.slice(board.indexOf('const carts = (studio.carts'));
  assert.match(sortLine.slice(0, 260), /\(Number\(b\.items\) > 0\) - \(Number\(a\.items\) > 0\)/,
    'a cart with items outranks a bare email address');
  assert.match(sortLine.slice(0, 260), /new Date\(b\.updated\) - new Date\(a\.updated\)/,
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
  assert.match(feed, /is_file\(\$dir \. str_replace/,
    'the feed must confirm the file exists before publishing a URL');
  assert.match(feed, /allowed_classes.*=> false/,
    'the cart blob is unserialised without instantiating objects');
  assert.ok(feed.includes("preg_match('#^"), 'the path shape is checked rather than trusted');
  assert.ok(feed.includes('data/designs') || feed.includes("'designs', 'user_data', 'orders'"),
    'and only the known design folders are searched');
});
