/* Regression tests for when a review request gets queued (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The whole review system — template, star links, the 4-5 star handoff to
 * Google, the hourly sweep, the approval screen — sat finished and idle from
 * the day it shipped. On 2026-08-27 the reviews table held 0 rows: nothing
 * queued, nothing sent, no reviews collected.
 *
 * The cause was a single status. The only thing that queued an ask was an
 * order transitioning to `shipped`, and the Lumise orders table had never
 * contained that status — cancel x3 and complete x1 were the only values
 * anyone had ever set. A trigger nobody fires is not a feature.
 *
 * So `complete` now queues an ask too, while the "your order is on the way"
 * notice stays exclusive to a real shipment. Two things must both hold, and
 * each is easy to break by accident:
 *
 *   1. `complete` must NOT send a shipping notice. Telling a customer their
 *      order "just left our shop" because someone marked it complete reads as
 *      a mistake, and it is one.
 *   2. An order passing BOTH milestones must produce ONE ask. The review token
 *      is random, so `ON CONFLICT (token)` cannot deduplicate — the guard has
 *      to key on the order.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/** The /api/order-shipped handler, start to its closing `});`. */
const HANDLER = (() => {
  const start = src.indexOf("app.post('/api/order-shipped'");
  assert.notStrictEqual(start, -1, '/api/order-shipped handler not found');
  const end = src.indexOf('\n});', start);
  assert.notStrictEqual(end, -1, 'handler end not found');
  return src.slice(start, end);
})();

test('the shipping notice is sent only for an actual shipment', () => {
  assert.match(HANDLER, /if \(status === 'shipped'\) await sendEmail\(/,
    'a `complete` milestone must not tell the customer their order is on the way');
});

test('status defaults to shipped, so an older designer build is unaffected', () => {
  assert.match(HANDLER, /String\(b\.status \|\| 'shipped'\)/,
    'a payload with no status must behave exactly as it did before');
});

test('status is compared lowercased', () => {
  assert.match(HANDLER, /\.toLowerCase\(\)/,
    '"Shipped" from the admin must not silently skip the notice');
});

test('the review is queued regardless of which milestone arrived', () => {
  const queueAt = HANDLER.indexOf('INSERT INTO reviews');
  const notifyAt = HANDLER.indexOf("if (status === 'shipped')");
  assert.notStrictEqual(queueAt, -1, 'the review queue must still be here');
  assert.ok(queueAt > notifyAt, 'sanity: the queue follows the notice');
  const tail = HANDLER.slice(notifyAt);
  const queueBlock = tail.slice(tail.indexOf("if (isValidEmail(String(b.email"));
  assert.doesNotMatch(queueBlock.slice(0, queueBlock.indexOf('INSERT INTO reviews')), /status === 'shipped'/,
    'the review queue must not be nested inside the shipped-only branch');
});

test('one ask per order, however many milestones it passes', () => {
  assert.match(HANDLER, /WHERE NOT EXISTS \(\s*SELECT 1 FROM reviews/,
    'complete-then-shipped calls this twice; the random token cannot deduplicate it');
  assert.match(HANDLER, /order_ref = \$6 AND sent_at IS NULL AND submitted_at IS NULL/,
    'the guard must key on the order, and must not block a genuine repeat order later');
});

test('an already-sent ask does not block a future one', () => {
  assert.match(HANDLER, /sent_at IS NULL/,
    'excluding sent rows is what lets a returning customer be asked again');
});
