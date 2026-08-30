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
  assert.match(page, /never takes a total below zero/, 'and the page says so');
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
  assert.match(auth, /return \$d && \$d\['source'\] === 'recovery';/,
    'only recovery codes are capped');
});
