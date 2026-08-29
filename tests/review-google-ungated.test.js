/* Regression tests for who is offered the Google review link (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The link used to appear only at 4-5 stars. That is review gating:
 *
 *   - Google's review policy forbids selectively soliciting positive reviews.
 *   - The FTC Consumer Reviews Rule, in force 2024-10-21, treats it as a
 *     deceptive practice. Fashion Nova paid $4.2M for hiding sub-4-star reviews.
 *
 * It also did not achieve anything. An unhappy customer who wants to post
 * publicly goes to Google directly; the gate suppressed no reviews and only
 * cost the shop the chance to hear about a problem first.
 *
 * What actually protects the shop is the alert, which fires on EVERY rating the
 * moment it is submitted — before anything is posted anywhere. That is the
 * property worth defending, and the reason a low rating must never be quietly
 * swallowed to avoid an awkward email.
 *
 * These tests exist because the gate is an easy thing to reintroduce: it looks
 * like a kindness to the shop right up until it is a penalty.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

function extractFn(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')' && --parens === 0) { i++; break; }
  }
  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`unterminated function reading \`${anchor}\``);
}

const SUBMIT = extractFn("app.post('/review/:token'");
const LANDING = extractFn("app.get('/review/:token'");

/* ── the gate must not come back ─────────────────────────────────────────── */

test('the Google link is not conditioned on the rating', () => {
  assert.doesNotMatch(src, /rating >= 4 && GOOGLE_REVIEW_URL/,
    'showing the link only to happy customers is review gating — Google policy and FTC rule');
  assert.doesNotMatch(src, /r\.rating >= 4 && GOOGLE_REVIEW_URL/,
    'the already-submitted page gates it too if this comes back');
});

test('the link is gated only on being configured at all', () => {
  assert.match(SUBMIT, /if \(GOOGLE_REVIEW_URL\) \{/,
    'the only legitimate condition is whether a URL exists to send them to');
});

test('a 1-star customer is offered the same link', () => {
  const block = SUBMIT.slice(SUBMIT.indexOf('if (GOOGLE_REVIEW_URL)'));
  assert.match(block, /Post a review on Google/,
    'the unhappy path must reach Google too, not dead-end on an apology');
  assert.match(block, /const happy = rating >= 4;/,
    'rating may change the WORDING, never whether the path is offered');
});

/* ── the alert is what actually protects the shop ────────────────────────── */

test('every rating alerts the shop, not just the good ones', () => {
  const alert = SUBMIT.slice(SUBMIT.indexOf('sendEmail({'));
  assert.match(alert, /rating >= 4 \? '⭐' : '⚠️'/,
    'the alert is sent for all ratings and only its subject marker differs');
  assert.doesNotMatch(SUBMIT.slice(0, SUBMIT.indexOf('sendEmail({')), /if \(rating >= 4\)[\s\S]{0,80}sendEmail/,
    'the alert must never be conditioned on a good rating');
});

test('the alert reaches the shop, and replies reach the customer', () => {
  const alert = SUBMIT.slice(SUBMIT.indexOf('sendEmail({'));
  assert.match(alert, /to: SHOP_EMAIL/);
  assert.match(alert, /replyTo: r\.email/,
    'following up is the point; June must be able to just hit reply');
});

test('a low rating tells June it may go public', () => {
  assert.match(SUBMIT, /Reach out today/,
    'the old copy said "not published", which stopped being true when the gate came off');
  assert.match(SUBMIT, /offered the Google link like everyone else/,
    'June needs to know the customer can post, so the follow-up is urgent rather than optional');
});

/* ── publication is still June's decision ────────────────────────────────── */

test('nothing is published on the shop site without approval', () => {
  const approved = extractFn('async function approvedReviews(');
  assert.match(approved, /approved = TRUE/,
    'the Google decision is the customer\'s; what appears on jtees.net stays June\'s');
  assert.doesNotMatch(approved, /rating >= 4|rating > 3/,
    'approval is a judgement, not a rating threshold — a 3-star review may be worth publishing');
});

test('the landing page still pre-selects the star that was clicked', () => {
  assert.match(LANDING, /parseInt\(req\.query\.r, 10\)/,
    'one-tap rating is the mechanism; losing it would drop the response rate');
});
