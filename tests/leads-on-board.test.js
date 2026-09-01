'use strict';

/* 158 of 159 website enquiries never became a quote. 132 of those were a March
 * spam wave, which leaves ~21 real leads that went cold — and the quote system
 * itself only existed from 4 Aug, so most of them never had a path forward at
 * all.
 *
 * Two faults, and the second is the one that matters:
 *
 *   1. Nothing surfaced them. They sat in a Leads tab behind an email alert,
 *      and `submissions.status` stays 'new' forever — it only moves when a
 *      Clover payment lands, so it never meant "unanswered".
 *   2. There was no way to turn one INTO a quote. Answering meant retyping the
 *      customer by hand, which is the friction that lost them.
 *
 * The rule: an alert you did not receive leaves no trace. Work that needs doing
 * belongs on the board, which is a place a person actually looks.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const board = src.slice(src.indexOf('async function renderBoard'));

test('unanswered enquiries are found by link AND by contact', () => {
  /* The explicit link only exists for quotes raised after it was added. Older
     leads that WERE answered must not resurface as new, so the contact match is
     the fallback — and it needs both email and phone, because a customer who
     rang in gave one and not the other. */
  const q = board.slice(board.indexOf('FROM submissions s'), board.indexOf('ORDER BY s.created_at'));
  assert.match(q, /NOT EXISTS \(SELECT 1 FROM quotes q WHERE q\.from_submission_id = s\.id\)/);
  assert.match(q, /lower\(trim\(q\.email\)\)/, 'email is one way people are matched');
  assert.match(q, /right\(regexp_replace/, 'and the last 10 digits of the phone are the other');
  assert.match(q, /s\.dismissed_at IS NULL/, 'a lead let go on purpose stays gone');
});

test('the phone match ignores formatting', () => {
  /* (773) 555-1234 and 7735551234 are the same person. Comparing raw strings
     would treat every reformatted number as a different customer and leave the
     lead showing as unanswered forever. */
  const q = board.slice(board.indexOf('FROM submissions s'), board.indexOf('ORDER BY s.created_at'));
  assert.ok(q.includes("regexp_replace(COALESCE(q.phone,''),"),
    'the phone must be reduced to digits before comparing');
  assert.ok(q.includes("right(regexp_replace(COALESCE(s.phone,''),"),
    'on both sides of the comparison');
  assert.match(q, /length\(regexp_replace[\s\S]{0,80}>= 10/,
    'a short or partial number must not match everything');
});

test('a quote raised from a lead records which one', () => {
  /* Otherwise the lead only leaves the board if the contact details happen to
     match exactly — and the whole point is that they are typed fresh. */
  /* Matched inside the column list rather than against the last column, so
     adding a column after it (rush_code did) does not read as the link being
     dropped. */
  assert.match(src, /INSERT INTO quotes \([^)]*from_submission_id[^)]*\)\s*\n?\s*VALUES/,
    'the insert must carry the link');
  assert.match(src, /<input type="hidden" name="from_submission_id" value="\$\{lead\.id\}">/,
    'and the form must post it');
});

test('a prefilled lead posts as a NEW quote, not an edit', () => {
  /* `existing` now means two things — a saved quote, and a blank one prefilled
     from an enquiry. Only the first has a code. Treating them alike made the
     form POST to /api/quotes/null and silently update nothing. */
  assert.match(src, /const isEdit = !!\(existing && existing\.code\);/);
  assert.match(src, /action="\$\{isEdit \? '\/api\/quotes\/' \+ existing\.code : '\/api\/quotes'\}"/);
  assert.doesNotMatch(src, /action="\$\{existing \? '\/api\/quotes\/'/,
    'posting on the truthiness of `existing` sends a new quote to /api/quotes/null');
});

test('dismissing a lead keeps it, with the reason', () => {
  /* 132 of these were spam. That is only visible later if the dismissals say
     so — and an enquiry is evidence of demand either way. */
  const route = src.slice(src.indexOf("app.post('/lead/:id/dismiss'"));
  assert.doesNotMatch(route.slice(0, 500), /DELETE FROM/);
  assert.match(route, /SET dismissed_at = NOW\(\), dismiss_reason = \$2/);
  assert.match(src, /app\.post\('\/lead\/:id\/dismiss', requireAdmin/);
});

test('enquiries are the first thing on the board', () => {
  /* They are the only group that represents money not yet asked for. */
  const e = board.indexOf("group('New enquiries'");
  const o = board.indexOf("group('Orders'");
  assert.ok(e > -1 && e < o, 'new enquiries must come before work in hand');
});

/* ── Collapsing ──────────────────────────────────────────────────────────── */

test('a folded section stays folded across reloads', () => {
  /* Otherwise folding is a gesture you repeat every time the page loads. */
  assert.match(board, /localStorage\.getItem\(KEY\)/);
  assert.match(board, /localStorage\.setItem\(KEY, JSON\.stringify\(v\)\)/);
  assert.match(board, /write\(state\);/, 'and the toggle must persist it');
});

test('storage failure cannot take the board down', () => {
  /* A browser with site data blocked THROWS on localStorage access rather than
     returning null. Unguarded, that kills the script and every section stays
     stuck in whatever state it rendered in. */
  const fn = board.slice(board.indexOf('function read()'), board.indexOf('var state = read()'));
  assert.match(fn, /try \{[\s\S]*?catch \(e\) \{ return \{\}; \}/, 'reads must be guarded');
  assert.match(board, /try \{ localStorage\.setItem[\s\S]*?catch \(e\) \{\}/, 'writes must be guarded');
});

test('sections start open', () => {
  /* A section that hides itself on first visit hides work. Only an explicit
     fold, remembered, may close one. */
  assert.match(board, /aria-expanded="true"/);
  assert.match(board, /Object\.keys\(state\)\.forEach\(function\(k\)\{ if \(state\[k\]\) apply\(k, true\); \}\)/,
    'only sections recorded as collapsed may start closed');
});

/* ── Clearing enquiries honestly ─────────────────────────────────────────── */

test('"too late" and "not a job" are recorded as different outcomes', () => {
  /* One is a judgement about the ENQUIRY — spam, wrong fit, a tyre-kicker. The
     other is a fact about TIME: a real job whose window closed. Filing the
     second under the first is untrue about the customer, and it destroys the
     only number that says the shop is leaving money on the table. */
  assert.match(board, /value="Too late — past the date they needed it"/,
    'the per-card action must record what actually happened');
  assert.match(board, /Not a job<\/button>/,
    'and the judgement action stays separate');
});

test('the bulk clear only offers itself for a real backlog', () => {
  /* A permanent "clear all" invites clearing work that is still live. It
     appears only when enough enquiries are old enough to be past acting on. */
  assert.match(board, /staleLeads\.length < 3 \? '' :/);
  assert.match(board, /86400000 > 30/, 'and "old" means older than 30 days');
});

test('the bulk clear cannot touch an enquiry that was quoted', () => {
  /* A quoted enquiry is already off the board by the link. Dismissing it would
     also write a false reason onto a job that was actually won. */
  const route = src.slice(src.indexOf("app.post('/leads/dismiss-old'"));
  assert.match(route, /NOT EXISTS \(SELECT 1 FROM quotes q WHERE q\.from_submission_id = submissions\.id\)/);
  assert.match(route, /dismissed_at IS NULL/, 'and it must not re-stamp one already cleared');
});

test('bulk clearing records the honest reason too', () => {
  const route = src.slice(src.indexOf("app.post('/leads/dismiss-old'"));
  assert.match(route, /Too late — cleared in bulk/,
    'so the backlog is still identifiable as missed rather than rejected');
  assert.doesNotMatch(route, /DELETE FROM/, 'nothing is destroyed');
});
