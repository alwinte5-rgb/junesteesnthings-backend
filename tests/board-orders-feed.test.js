/* Regression tests for the studio-orders lane and the admin navigation.
 *
 * Run: node --test tests/*.test.js
 *
 * Two problems these guard, both of which had already cost real time:
 *
 * 1. Online orders and manual quotes lived in two databases behind two admin
 *    panels on two domains. Nothing showed both, so an order placed at
 *    design.jtees.net was invisible from the job board and from the daily
 *    digest. The board now reads a JSON feed from the designer — which means
 *    the board's health now depends on another host answering, and that must
 *    never be able to blank the page or, worse, render an empty lane. An empty
 *    lane reads as "no orders", which is the exact lie the old setup told.
 *
 * 2. There were eight admin pages on inconsistent paths with no shared
 *    navigation. Reviews and Inventory were reachable only by typing the URL.
 *    The nav fixes that, and these tests keep it honest: every entry must point
 *    at a route that exists, and it must never leak onto a customer's page.
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

/* ── the feed must never take the board down ─────────────────────────────── */

const FETCH = extractFn('async function fetchStudioOrders(');
const SECTION = extractFn('function studioOrdersSection(');

test('a failing feed resolves instead of throwing', () => {
  assert.match(FETCH, /catch \(e\) \{[\s\S]*studio orders feed failed/,
    'renderBoard awaits this; a throw would 500 the page June works from all day');
  /* There IS a throw in here — a non-2xx feed raises one — but it is raised
     inside the try and swallowed by the same catch. What matters is that
     nothing escapes, so assert the catch returns a value rather than banning
     the keyword. */
  const after = FETCH.slice(FETCH.indexOf('catch (e)'));
  assert.match(after, /return \(_studioCache = \{/,
    'the catch must RESOLVE to a usable value, not just log and fall off the end');
});

test('the fetch is bounded and cached', () => {
  assert.match(FETCH, /AbortSignal\.timeout\(/,
    'an unbounded fetch to another host can hang the board indefinitely');
  assert.match(FETCH, /Date\.now\(\) - _studioCache\.at < \d+/,
    'the board is reloaded constantly; it must not hammer the designer');
});

test('a failed fetch keeps the last known list rather than emptying it', () => {
  const c = FETCH.slice(FETCH.indexOf('catch'));
  assert.match(c, /orders: _studioCache\.orders/,
    'a stale list beats no list, provided the page says which it is');
});

test('an unavailable feed is stated on the page, never rendered as zero orders', () => {
  assert.match(SECTION, /feed\.error/);
  assert.match(SECTION, /Studio orders unavailable/,
    'silently showing an empty lane is how "no orders" becomes a lie again');
  assert.match(SECTION, /showing the last known list/,
    'stale data must be labelled as stale');
});

test('an empty lane and a broken lane look different', () => {
  assert.match(SECTION, /!feed\.orders\.length && !feed\.error/,
    'the "no open orders" message must only appear when the feed actually answered');
});

/* ── orders are read-only here ───────────────────────────────────────────── */

test('the board never offers to edit an order', () => {
  assert.doesNotMatch(SECTION, /<form/,
    'order state is edited in the studio admin; two writers is how the two drift apart');
  assert.match(SECTION, /Open in studio/,
    'the row must hand off to the place the order can actually be changed');
});

test('order stages map onto the board vocabulary, not a second one', () => {
  const stage = extractFn('function studioStage(');
  for (const label of ['Delivered', 'Check & ship', 'Press']) {
    assert.ok(stage.includes(label), `"${label}" must match a JOB_STAGES label, not invent a new word`);
  }
});

test('the studio lane appears on the board, not only on its own page', () => {
  assert.match(src, /\$\{studioOrdersSection\(studio\)\}/,
    'one page showing both halves of the shop is the entire point');
  assert.match(src, /app\.get\('\/orders', requireAdmin/,
    'and the nav entry needs a real route behind it');
});

/* ── the navigation ──────────────────────────────────────────────────────── */

/* The array literal only. The comment that follows it explains why /inventory
   is absent, and would otherwise match a search for it. */
const NAV_BLOCK = (() => {
  const at = src.indexOf('const ADMIN_NAV = [');
  return src.slice(at, src.indexOf('];', at) + 2);
})();

test('every nav entry points at a route that exists', () => {
  const hrefs = [...NAV_BLOCK.matchAll(/href:\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(hrefs.length >= 5, 'the nav should cover the operator pages');
  for (const href of hrefs) {
    assert.ok(src.includes(`app.get('${href}'`),
      `nav points at ${href}, which no route registers — a dead menu entry is worse than none`);
  }
});

test('inventory is not in the nav', () => {
  assert.doesNotMatch(NAV_BLOCK, /\/inventory/,
    '/inventory answers JSON, not a page; a nav entry would drop June onto raw Clover data');
});

test('the customer-facing shell carries no admin nav', () => {
  const quotePage = extractFn('function quotePage(');
  assert.doesNotMatch(quotePage, /adminNav|ADMIN_NAV/,
    'quotePage also renders the public quote at /q/:code — Books and the inbox must never appear there');
});

test('adminPage is the only thing that adds the nav', () => {
  const adminPage = extractFn('function adminPage(');
  assert.match(adminPage, /adminNav\(active\)/);
  assert.match(adminPage, /quotePage\(/, 'it wraps the existing shell rather than forking it');
});

test('the operator pages all go through adminPage', () => {
  for (const marker of [
    "adminPage('Books'",
    "adminPage(h.name || 'Customer'",
    "adminPage(`${q.code} — production`",
    "adminPage('Reviews'",
    "adminPage(VIEW === 'work' ? 'Production' : 'Quotes'",
    "adminPage('Studio orders'",
  ]) {
    assert.ok(src.includes(marker), `${marker} — a page outside the shell drops off the menu silently`);
  }
});

test('each admin page tells the nav which section it is', () => {
  for (const key of ['money', 'customers', 'jobs', 'reviews', 'orders']) {
    assert.ok(src.includes(`, '${key}'));`),
      `no page passes the "${key}" key, so that entry never highlights`);
  }
});
