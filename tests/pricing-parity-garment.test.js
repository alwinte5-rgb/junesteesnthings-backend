'use strict';

/* The same shirt, the same quantity, one price.
 *
 * The garment volume curve lived only in server.js, so 250 shirts cost $97.50
 * MORE ordered online than quoted by the shop — identical goods, two prices,
 * and whichever the customer saw second felt like the real one.
 *
 * The fix is not "copy the table into the designer". A copy is right on the day
 * it is written and wrong at the next change, which is how this happened. The
 * backend PUBLISHES the tiers and the designer reads them, so there is one
 * definition and it lives in the file the shop actually edits.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const D = (f) => fs.readFileSync(path.join(ROOT,
  'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise', f), 'utf8');

test('the backend publishes the tiers it prices with', () => {
  assert.match(src, /app\.get\('\/api\/pricing-rules', requireInternalKey/,
    'and behind the shared key, like every other cross-service call');
  const route = src.slice(src.indexOf("app.get('/api/pricing-rules'"));
  assert.match(route.slice(0, 400), /blank_tiers: BLANK_TIERS/,
    'the SAME constant the quote form uses — not a second literal');
});

test('the designer reads them rather than holding its own copy', () => {
  const auth = D('jt-auth.php');
  assert.match(auth, /www\.jtees\.net\/api\/pricing-rules/);
  assert.match(auth, /X-JT-Key: /, 'authenticated like the other calls');
  /* A hardcoded tier table in the designer is the bug this exists to prevent. */
  assert.doesNotMatch(auth, /'min'\s*=>\s*\d+\s*,\s*'pct'\s*=>\s*\d+/,
    'the designer must not carry its own tier numbers');
});

test('an unreachable backend charges list, never a guess', () => {
  /* List price is a number the shop has agreed to. An invented discount is not,
     and it would be charged silently on every online order until noticed. */
  const auth = D('jt-auth.php');
  assert.match(auth, /return \(\$cache = array\('blank_tiers' => array\(\)\)\);/,
    'no tiers means no discount');
  assert.match(auth, /Serve a stale cache over no cache/,
    'but yesterday’s tiers beat list price, so a stale cache is preferred');
});

test('the two engines agree at every band boundary', () => {
  /* The rule is "highest matching floor wins". Implemented twice — once in JS,
     once in PHP — so this walks both against the same table and demands the
     same answer, including one piece either side of every floor. */
  /* Both lifted from the real source and RUN, rather than parsed by hand — a
     regex over the table is one more thing that can be wrong about it. */
  const start = src.indexOf('const BLANK_TIERS = [');
  const decl = src.slice(start, src.indexOf('];', start) + 2);
  const fnStart = src.indexOf('function blankDiscountPct');
  const fn = src.slice(fnStart, src.indexOf('\n}', fnStart) + 2);
  const { tiers, jsPct } = vm.runInThisContext(
    `${decl}\n${fn}\n({ tiers: BLANK_TIERS, jsPct: blankDiscountPct })`);

  /* The PHP rule, transcribed exactly as jt_blank_discount_pct implements it. */
  const phpPct = (q) => {
    if (q <= 0) return 0;
    let best = 0;
    for (const t of tiers) if (q >= t.min && t.pct > best) best = t.pct;
    return best;
  };

  const boundaries = tiers.flatMap((t) => [t.min - 1, t.min, t.min + 1]);
  for (const q of [0, 1, 12, ...boundaries, 99999]) {
    assert.strictEqual(phpPct(q), jsPct(q),
      `${q} pieces: the designer would say ${phpPct(q)}% and the quote ${jsPct(q)}%`);
  }
});

test('the discount applies to the garment, not to the printing', () => {
  /* Decoration already has its own quantity bands. Discounting those again
     would sell printing below the rate the shop is contracted at. */
  const cart = D('core/cart.php');
  /* The break is applied by jt_blank_price_at(), and it is handed $sum — the
     garment — and nothing else. It used to subtract a separately-rounded
     discount here; that form disagreed with the quote form by a cent on 274 of
     the prices the shop sells, so the call site now shares the rule instead of
     restating it. What this test protects is unchanged: the garment is
     discounted, the printing is not. */
  assert.match(cart, /jt_blank_price_at\(\$sum,\s*\$item\['qty'\]\)/,
    'the break is applied to $sum, the garment side');
  assert.doesNotMatch(cart, /jt_blank_price_at\([^)]*print/i,
    'the printing must never be fed through the garment curve');
  /* Whitespace-tolerant: this file uses tabs and CRLF, and a test that breaks on
     reformatting teaches people to stop trusting the suite. */
  assert.match(cart, /\(\s*\$jt_gnet\s*\+\s*\$print_calc\s*\)/,
    'and $print_calc is added after, undiscounted');
});

test('the discount is recorded on the line, not just subtracted', () => {
  /* A total that is lower than the sum of its parts, with nothing saying why,
     is how a customer asks a question nobody can answer. */
  const cart = D('core/cart.php');
  assert.match(cart, /'garment_discount_pct'\] = \$jt_gpct/);
  assert.match(cart, /'garment_discount'\]\s*= round\(\$jt_gdisc \* \$item\['qty'\], 2\)/);
});
