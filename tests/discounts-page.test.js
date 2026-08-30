'use strict';

/* The discount-code admin page.
 *
 * The codes LIVE on design.jtees.net, because that is where checkout validates
 * them — a code whose validity depended on this service being up would fail at
 * exactly the moment it matters, mid-payment. This page is a client over the
 * same shared-secret endpoint as the orders feed.
 *
 * That makes every failure here a NETWORK failure, and the distinction matters:
 * an unreachable studio rendered as an empty table reads as "you have no
 * codes", which is a lie that would have the shop issue a duplicate.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const page = src.slice(src.indexOf("app.get('/discounts'"), src.indexOf("app.post('/discounts'"));
const admin = fs.readFileSync(path.join(ROOT,
  'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-promo-admin.php'), 'utf8');

test('the page is in the admin nav and gated', () => {
  assert.match(src, /\{ key: 'discounts', href: '\/discounts',\s*label: 'Discounts' \}/);
  for (const r of ["'/discounts'", "'/discounts/off'"]) {
    assert.ok(src.includes(`app.get(${r}, requireAdmin`) || src.includes(`app.post(${r}, requireAdmin`),
      `${r} must require admin — these codes are money`);
  }
});

test('an unreachable studio is not shown as an empty list', () => {
  /* The failure that would actually cost money: the shop sees no codes, assumes
     none exist, and issues a second one to the same customer. */
  assert.match(page, /Could not reach the studio/);
  assert.match(page, /this is a connection problem, not an empty list/);
  assert.match(src, /promo codes fetch failed/, 'and it is logged');
});

test('the studio validation message is shown, not swallowed', () => {
  /* "A percentage must be between 1 and 100" is actionable. "Could not save"
     sends the operator back to guess which field was wrong. */
  const post = src.slice(src.indexOf("app.post('/discounts'"), src.indexOf("app.post('/discounts/off'"));
  assert.match(post, /d\.error \|\| `studio answered \$\{r\.status\}`/);
});

test('an amount code cannot take a total below zero', () => {
  /* A negative total is a refund the shop never agreed to, and the charge is
     computed from that number. Clamped in the one place the discount is
     calculated, so both the checkout page and the order path get it. */
  const auth = fs.readFileSync(path.join(ROOT,
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-auth.php'), 'utf8');
  assert.match(auth, /return min\(round\(\$d\['value'\], 2\), \$sub\);/);
  assert.match(page, /spent, not drawn down/,
    'and the page explains it is spent, not drawn down — no leftover balance');
});

test('the studio bounds every value it stores', () => {
  /* These arrive from a form and are subtracted from a charge. */
  assert.match(admin, /\$value < 1 \|\| \$value > 100/, 'percent bounds');
  assert.match(admin, /\$value <= 0 \|\| \$value > 1000/, 'amount bounds');
  assert.match(admin, /\^\[A-Z0-9\]\{3,32\}\$/, 'code shape');
  assert.match(admin, /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/, 'expiry shape');
});

test('switching a code off never deletes it', () => {
  /* A used code is the record of what a customer was given. Deleting it loses
     the answer to "why was this order $30 light". */
  assert.match(admin, /SET active=0 WHERE code=/);
  assert.doesNotMatch(admin, /DELETE FROM/);
});

test('expired and switched-off codes are told apart', () => {
  /* They need different actions: one is reissued, the other was deliberate. */
  assert.match(page, /c\.active \? 'expired' : 'switched off'/);
});

test('hand-issued codes are not capped like recovery codes', () => {
  /* The cap exists because the weekly codes are shared with every abandoned
     cart. A code issued to one person by name is a promise to them. */
  assert.match(page, /it is a promise to one person/);
  const auth = fs.readFileSync(path.join(ROOT,
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-auth.php'), 'utf8');
  assert.match(auth, /if \(\$d\['source'\] === 'recovery'\) return true;/,
    'recovery codes are always capped');
  assert.match(auth, /return !empty\(\$d\['once_per_customer'\]\);/,
    'an admin code is capped only when the shop asked for it');
});

/* ── Use rules ───────────────────────────────────────────────────────────── */

const auth = fs.readFileSync(path.join(ROOT,
  'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-auth.php'), 'utf8');

test('a dollar code is spent, not drawn down', () => {
  /* $30 off a $12 order takes $12 and the code is finished. Anything else is a
     gift card — a balance the shop would have to track and honour, which nobody
     agreed to when they wrote "$30 off". */
  assert.match(admin, /if \(\$kind === 'amount' && \$maxUses === 0\) \$maxUses = 1;/,
    'dollar codes default to a single use');
  assert.match(admin, /\$maxUses = \(int\)/,
    'and an explicit number is still respected — a $5 mailing-list code is real');
});

test('every rule is re-checked when the order is placed', () => {
  /* A customer can enter a valid code and then change the cart until it no
     longer qualifies, and a direct POST skips the checkout page entirely. */
  const conn = fs.readFileSync(path.join(ROOT,
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/php_connector.php'), 'utf8');
  assert.match(conn, /jt_promo_block_reason\(\$jt_promo_code, \$order_total,/,
    'the order path must re-check with the real total and email');
  assert.match(auth, /if \(jt_promo_block_reason\(\$code, \$sub\) !== ''\) return 0\.0;/,
    'and the discount itself refuses to compute when a rule fails');
});

test('one refusal function serves every surface', () => {
  /* A code accepted at the entry field and refused at checkout is the worst
     version of this — the customer has already decided to buy. */
  assert.match(auth, /function jt_promo_block_reason\(/);
  const promo = fs.readFileSync(path.join(ROOT,
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-promo.php'), 'utf8');
  assert.match(promo, /jt_promo_block_reason\(\$match, \$sub, \$email\)/);
});

test('the customer is told which rule blocked them', () => {
  /* "Not valid" tells someone $5 short to give up rather than add an item. */
  assert.match(auth, /needs an order of at least/);
  assert.match(auth, /has been fully claimed/);
  const checkout = fs.readFileSync(path.join(ROOT,
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/checkout.php'), 'utf8');
  assert.match(checkout, /d\.reason \|\|/, 'the page shows the server reason');
});

/* ── Sending a code to a customer ────────────────────────────────────────── */

test('the email states the code as stored, not as typed', () => {
  /* Promising $30 off when the code is worth $10 is worse than not sending. */
  const fn = src.slice(src.indexOf('async function sendDiscountEmail'));
  assert.match(fn.slice(0, 700), /const \{ codes \} = await fetchPromoCodes\(\)/);
  assert.match(fn.slice(0, 700), /if \(!c\) throw new Error/);
});

test('create-and-send does not re-post the form to another route', () => {
  /* A 307 would replay the create body at the send route, where `send_to` is
     read as `email` — the code would be created and silently never sent. */
  assert.doesNotMatch(src, /res\.redirect\(307, '\/discounts\/send/);
  assert.match(src, /await sendDiscountEmail\(String\(d\.code\)\.toUpperCase\(\), to, ''\)/);
});

test('a failed send does not report a failed create', () => {
  /* The code exists. "Could not create" would have the shop make it twice. */
  const post = src.slice(src.indexOf("app.post('/discounts'"), src.indexOf("app.post('/discounts/send'"));
  assert.match(post, /was created, but the email did not send/);
});

/* ── Every code that is actually accepted ────────────────────────────────── */

test('the page shows the automatic codes, not only the table rows', () => {
  /* The weekly recovery codes and any standing env codes are live at checkout
     exactly like the rows. A page showing only the table answers "what
     discounts are out there" with half the truth, and the shop could issue a
     code that collides with one already in circulation. */
  assert.match(admin, /'system' => \$system/, 'the endpoint must publish them');
  assert.match(page, /Also accepted right now/);
  assert.match(page, /system\.map\(sysRow\)/);
});

test('automatic codes carry no Switch off button', () => {
  /* They have no row to switch off — they come from environment variables, so a
     button here would need a redeploy to take effect and the page would appear
     to have lied. */
  const sysRow = page.slice(page.indexOf('const sysRow'), page.indexOf('res.send(adminPage'));
  assert.doesNotMatch(sysRow, /\/discounts\/off/);
  assert.match(page, /not editable here/);
  assert.match(page, /JT_PROMO_CODES/, 'and it says where they actually live');
});

test('the page says weekly, because that is what the code does', () => {
  /* floor(time()/604800) is a 7-day period. Calling it monthly on the page
     would have the shop expect a code to last four times as long as it does. */
  assert.match(page, /rotate <b>weekly<\/b>/);
  const auth = fs.readFileSync(path.join(ROOT,
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-auth.php'), 'utf8');
  assert.match(auth, /floor\(time\(\) \/ 604800\)/, '604800 seconds is one week');
});

test('last week grace is shown as live, not as expired', () => {
  /* It IS accepted. Showing it as expired would have the shop tell a customer
     their code is dead when checkout would take it. */
  assert.ok(admin.includes('still accepted, grace period'),
    "last week's code must be labelled as still accepted");
  assert.ok(admin.includes("'source' => 'recovery'"),
    'and both recovery codes are published with their source');
});

test('adding the rule columns is safe to run on every request', () => {
  /* This broke in production and is the nastiest shape of bug: MySQL has no
     ADD COLUMN IF NOT EXISTS, and `@` does not silence an error the database
     driver raises. The first call added the columns and every call after it
     failed on "duplicate column" and answered 500 — so the page worked exactly
     ONCE, looked fine when built, and was broken by the time anyone opened it.

     The columns must be asked for before they are added, not attempted and
     suppressed. */
  const auth = fs.readFileSync(path.join(ROOT,
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-auth.php'), 'utf8');
  assert.match(auth, /SELECT COLUMN_NAME FROM information_schema\.COLUMNS/,
    'existing columns must be read first');
  assert.match(auth, /if \(isset\(\$have\[\$name\]\)\) continue;/,
    'and only the missing ones added');
  assert.doesNotMatch(auth, /@jt_db\(\)->rawQuery\("ALTER TABLE/,
    'a suppressed ALTER is not idempotent — it still errors the request');
});
