/* Regression tests for the quoted delivery window (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The date on a quote is a promise, and the ways it goes wrong are all quiet:
 * nobody notices a date that is three days optimistic until the week it is due.
 *
 * There is deliberately NO rush option in this system — screen printing and DTF
 * are contracted to Anchorfish, whose 2026 sheets state 7-10 business days and
 * neither of which sells a rush service at any price. A tier list that offered
 * one for a flat fee used to sit in server.js, wired to nothing; it is gone.
 * The last test here is what stops it coming back by accident.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/** Lift a top-level `function name(...) {...}` out of server.js.
 *
 *  The parameter list is walked FIRST, by parens: deliveryEstimate's signature
 *  ends `opts = {}`, and a brace-counter started at the first `{` closes on
 *  that empty default and returns the signature alone. */
function lift(name) {
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
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

function liftConst(re, what) {
  const m = re.exec(src);
  assert.ok(m, `${what} not found in server.js`);
  return m[0];
}

/* The real functions, not a restatement — a change to the cut-off or the
   business-day walk runs these tests. */
const W = vm.runInThisContext(`(function(){
  const HOLIDAY_MODE = false;
  ${liftConst(/const HOLIDAY_EXTRA_DAYS = .*;/, 'HOLIDAY_EXTRA_DAYS')}
  ${liftConst(/const SHOP_TZ = .*;/, 'SHOP_TZ')}
  ${liftConst(/const CUTOFF_MIN = \(\(\) => \{[\s\S]*?\}\)\(\);/, 'CUTOFF_MIN')}
  ${liftConst(/const SHEET_PIECE_CEILING = .*;/, 'SHEET_PIECE_CEILING')}
  ${lift('addBusinessDays')}
  ${lift('shopMinutes')}
  ${lift('productionStart')}
  ${lift('deliveryEstimate')}
  return { addBusinessDays, shopMinutes, productionStart, deliveryEstimate };
})()`);

const WED_AM = new Date('2026-09-02T15:00:00Z');   // 10:00 in Chicago, before the cut-off

/* ── The clock the promise is made on ────────────────────────────────────── */

test('work handed over after the 3:30pm cut-off starts the next business day', () => {
  const before = W.productionStart(new Date('2026-09-02T19:00:00Z')); // 14:00 Chicago
  const after  = W.productionStart(new Date('2026-09-02T21:00:00Z')); // 16:00 Chicago
  assert.strictEqual(before.getDate(), 2, 'before the cut-off, the day has started');
  assert.strictEqual(after.getDate(), 3, 'after it, the clock starts tomorrow');
});

test('the cut-off is read in the shop timezone, not the server one', () => {
  /* Railway runs UTC. 21:00 UTC is 16:00 in Chicago and past the cut-off, but
     18:00 UTC is 13:00 there and is not — though both read as afternoon in UTC.
     Getting this wrong loses a day on every afternoon order. */
  const utcAfternoon = W.productionStart(new Date('2026-09-02T18:00:00Z'));
  assert.strictEqual(utcAfternoon.getDate(), 2,
    'a UTC hour past the cut-off that is not one in Chicago must not lose a day');
});

test('a weekend order starts on Monday', () => {
  const sat = W.productionStart(new Date('2026-09-05T15:00:00Z'));
  assert.strictEqual(sat.getDay(), 1, 'nothing is produced at the weekend');
});

test('business-day arithmetic never lands on a weekend', () => {
  for (let d = 1; d <= 20; d++) {
    const day = W.addBusinessDays(WED_AM, d).getDay();
    assert.ok(day !== 0 && day !== 6, `${d} business days landed on a weekend`);
  }
});

/* ── The window itself ───────────────────────────────────────────────────── */

test('the window is ordered: ready, then the delivery range around it', () => {
  const e = W.deliveryEstimate(WED_AM);
  assert.ok(e.ready <= e.deliver_from, 'it cannot be delivered before it is made');
  assert.ok(e.deliver_from <= e.deliver_to, 'the range must not be inverted');
});

test('pickup removes transit, not production', () => {
  const ship = W.deliveryEstimate(WED_AM);
  const pick = W.deliveryEstimate(WED_AM, { pickup: true });
  assert.deepStrictEqual(pick.ready, ship.ready, 'pickup does not make it faster to print');
  assert.deepStrictEqual(pick.deliver_from, pick.ready, 'collected the day it is ready');
  assert.ok(pick.deliver_to < ship.deliver_to);
});

test('holiday mode stretches the window and nothing else', () => {
  /* The failure it guards is leaving it ON in March and quoting every job three
     days slow, so it must be one visible flag with one visible effect. */
  const calm = W.deliveryEstimate(WED_AM, { holiday: false });
  const busy = W.deliveryEstimate(WED_AM, { holiday: true });
  assert.ok(busy.ready > calm.ready);
  assert.ok(busy.deliver_to > calm.deliver_to);
});

test('a run past the contract sheet ceiling is flagged, not silently quoted', () => {
  /* Anchorfish quotes 7-10 days up to 2,400 prints and says over 7,000 is by
     quote. Past that the sheet promises nothing, so neither can a date from it. */
  const normal = W.deliveryEstimate(WED_AM, { items: [{ qty: 100 }] });
  const huge   = W.deliveryEstimate(WED_AM, { items: [{ qty: 5000 }] });
  assert.strictEqual(normal.beyond_sheet, false);
  assert.strictEqual(huge.beyond_sheet, true);
  assert.match(src, /eta\.beyond_sheet \?/, 'and the customer page must say so');
});

test('a quote with no items still produces a usable window', () => {
  /* The public estimator calls this with nothing. */
  const e = W.deliveryEstimate(WED_AM, {});
  assert.ok(e.ready instanceof Date && !isNaN(e.ready));
  assert.strictEqual(e.beyond_sheet, false);
});

/* ── The supplier lead time belongs to the planner, not to this window ───── */

test('the quoted window does NOT add the blanks lead time', () => {
  /* The advertised 7-10 business days is DOOR TO DOOR from the order date and
     already absorbs the wait for blanks. Adding JT_LT_BLANKS on top of it moves
     every quote about a week later and silently rewrites a promise the site has
     made for years. It is used for backwards-scheduling in quoteSchedule(),
     which is a different question: not "how long will this take" but "when must
     I have ordered the blanks by". */
  const body = lift('deliveryEstimate');
  assert.doesNotMatch(body, /JT_LT_BLANKS/,
    'the customer-facing window must not read the supplier lead time');
  assert.match(lift('quoteSchedule'), /JT_LT_BLANKS/,
    'the internal planner is where that figure belongs');
});

/* ── No rush, and it must not creep back ─────────────────────────────────── */

test('no rush tier is offered anywhere', () => {
  /* Screen print and DTF are contracted at 7-10 business days with no rush
     product on either sheet at any price, so a rush option is a date with
     nothing behind it. A flat-fee tier list used to sit in server.js unwired;
     this is what stops it being re-added without the gating that would make it
     honest. See docs/pricing-2026.md. */
  assert.doesNotMatch(src, /RUSH_OPTIONS/, 'no rush tier list');
  assert.doesNotMatch(src, /function rushFeeFor/, 'no rush fee');
  assert.doesNotMatch(src, /name="rush_code"/, 'no rush control on the quote form');
  assert.doesNotMatch(src, /rush_code/, 'nothing stores a rush tier');
  assert.doesNotMatch(src, /or rush fees/,
    'and no customer-facing copy implying one can be asked for');
});

test('the designer does not promise a rush the shop cannot buy', () => {
  /* PR #99 removed the rush option from this repo, but the storefront delivery
     line lives in the DESIGNER repo and kept telling every customer on every
     product page that "rush is often possible". The promise outlived the
     product because the two halves are separate repos.

     Embroidery is the exception and the reason this is gated rather than
     deleted: it is done in house and Anchorfish's own rush ladder says it
     applies to embroidery only. */
  const auth = fs.readFileSync(path.join(__dirname, '..',
    'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise/jt-auth.php'), 'utf8');

  assert.doesNotMatch(auth, /rush is often possible\.<\/span>/,
    'the unconditional promise is back');
  assert.match(auth, /function jt_can_rush/,
    'the rule must be one named function, not a phrase repeated in copy');
  assert.match(auth, /embroider/i,
    'and it must gate on embroidery, the only work the shop rushes itself');

  /* The gate has to actually reach the copy: a helper nothing calls is how the
     promise survived the first time. */
  const html = auth.slice(auth.indexOf('function jt_delivery_html'));
  assert.match(html.slice(0, 1400), /jt_can_rush\(\$method\)/,
    'jt_delivery_html must ask jt_can_rush before offering a rush');
});
