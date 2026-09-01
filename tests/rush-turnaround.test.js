/* Regression tests for rush turnaround and the delivery estimate (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The thing these guard is not arithmetic. It is a PROMISE.
 *
 * Screen printing and DTF are contracted to Anchorfish. Both their 2026 sheets
 * state 7-10 business days and neither sells a rush service at any price — so
 * the shop cannot buy that time back, however much a customer offers. Their
 * embroidery sheet is the only one with a rush ladder, and it says so in as
 * many words: "RUSH SERVICES AVAILABLE UPON APPROVAL - applies to embroidery
 * only". Embroidery is the work June sews in house, which is exactly why it is
 * the work she can bump up the queue.
 *
 * The version of this code these tests replaced offered "Rush - 2 business
 * days" for a flat $15 on ANY job. On a screen-print order that is a date with
 * nothing behind it, and it would have been discovered by a customer, on the
 * day, with the shirts not made.
 *
 * So the tests below are mostly about REFUSAL: who cannot be sold a rush, and
 * what a rush still cannot compress once it is sold.
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
 *  The parameter list is walked FIRST, by parens. deliveryEstimate's signature
 *  ends `opts = {}`, and a brace-counter started at the first `{` closes on
 *  that empty default and returns the signature alone — which fails later as a
 *  bare `return`, a long way from the cause. */
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

/** Lift a `const` declaration verbatim, so an env default is the real one. */
function liftConst(re, what) {
  const m = re.exec(src);
  assert.ok(m, `${what} not found in server.js`);
  return m[0];
}

/* The real rule, not a restatement of it. If the ladder, the gate or the
   business-day arithmetic changes in server.js, these tests run the change. */
const W = vm.runInThisContext(`(function(){
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const HOLIDAY_MODE = false;
  ${liftConst(/const COST_SERVICE_WORDS = .*;/, 'COST_SERVICE_WORDS')}
  ${liftConst(/const EMBROIDERY_METHOD_RE = .*;/, 'EMBROIDERY_METHOD_RE')}
  ${liftConst(/const HOLIDAY_EXTRA_DAYS = .*;/, 'HOLIDAY_EXTRA_DAYS')}
  ${liftConst(/const SHOP_TZ = .*;/, 'SHOP_TZ')}
  ${liftConst(/const CUTOFF_MIN = \(\(\) => \{[\s\S]*?\}\)\(\);/, 'CUTOFF_MIN')}
  ${liftConst(/const SHEET_PIECE_CEILING = .*;/, 'SHEET_PIECE_CEILING')}
  ${liftConst(/const RUSH_PCT_OVERRIDES = [\s\S]*?\nconst RUSH_OPTIONS = \[[\s\S]*?\n\];/, 'RUSH_OPTIONS')}
  ${lift('rushOption')}
  ${lift('rushAvailable')}
  ${lift('decorationSubtotal')}
  ${lift('rushFeeFor')}
  ${lift('addBusinessDays')}
  ${lift('shopMinutes')}
  ${lift('productionStart')}
  ${lift('deliveryEstimate')}
  ${lift('rushImprovesDate')}
  return { RUSH_OPTIONS, rushOption, rushAvailable, decorationSubtotal,
           rushFeeFor, addBusinessDays, productionStart, deliveryEstimate,
           rushImprovesDate };
})()`);

/* A decorated line, as the save path stores one. `decoration_total` is the
   decoration x quantity; `line_total` includes the blanks on top. */
const line = (method_title, decoration_total, line_total, qty = 50) =>
  ({ description: 'Tee', qty, method_title, decoration_total, line_total });

const EMB = () => [line('Embroidery — Left Chest', 1000, 1600)];
const SCREEN = () => [line('Screen Printing', 1000, 1600)];

/* ── Who may be sold a rush ──────────────────────────────────────────────── */

test('an all-embroidery job can be rushed', () => {
  assert.strictEqual(W.rushAvailable(EMB()), true,
    'embroidery is sewn in house, so the shop owns the machine time');
});

test('a screen-print job cannot be rushed at any price', () => {
  assert.strictEqual(W.rushAvailable(SCREEN()), false);
  assert.strictEqual(W.rushFeeFor('rush2', SCREEN()), 0,
    'the contract printer sells no rush service, so there is nothing to charge for');
});

test('one screen-print line takes rush off the whole job', () => {
  /* The customer gets ONE parcel, so the slowest line sets the date. A job
     that is 90% embroidery still waits on the contract printer, and charging
     40% for a date set by somebody else is selling air. */
  const mixed = [...EMB(), ...SCREEN()];
  assert.strictEqual(W.rushAvailable(mixed), false);
  assert.strictEqual(W.rushFeeFor('rush1', mixed), 0);
});

test('a line whose method is unknown fails CLOSED', () => {
  /* Hand-typed lines and quotes saved before `method_title` existed carry no
     method. Absence of evidence is not embroidery — guessing the other way
     sells the promise this whole gate exists to prevent. */
  const typed = [{ description: '50 hoodies, logo front', qty: 50,
                   decoration_total: 500, line_total: 900 }];
  assert.strictEqual(W.rushAvailable(typed), false);
  assert.strictEqual(W.rushFeeFor('rush0', typed), 0);
});

test('a quote with no decorated line cannot be rushed', () => {
  assert.strictEqual(W.rushAvailable([]), false);
  /* A digitizing fee on its own is a service line, not work to be jumped. */
  assert.strictEqual(W.rushAvailable([{ description: 'Digitizing', qty: 1 }]), false);
});

/* ── What a rush costs ───────────────────────────────────────────────────── */

test('rush is a percentage of the DECORATION, never of the line total', () => {
  /* The line is $1,600, of which $1,000 is stitching and $600 is the shirts.
     40% of the line would bill $640 — $240 of it a surcharge on the customer's
     own garments, which no amount of machine time makes arrive sooner. */
  assert.strictEqual(W.rushFeeFor('rush2', EMB()), 400);
});

test('a bigger job pays more for the same tier', () => {
  /* The reason the flat fee this replaced was wrong: jumping a 500-piece run
     costs far more machine time than jumping a dozen, and $15 covered both. */
  const small = [line('Embroidery', 100, 260, 12)];
  const big   = [line('Embroidery', 4000, 6400, 500)];
  assert.ok(W.rushFeeFor('rush2', big) > W.rushFeeFor('rush2', small) * 10);
});

test('the ladder never pays less for a shorter turnaround', () => {
  const tiers = W.RUSH_OPTIONS.filter((r) => r.prodDays != null)
    .slice().sort((a, b) => b.prodDays - a.prodDays);
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].pct > tiers[i - 1].pct,
      `${tiers[i].code} is sooner than ${tiers[i - 1].code} and must cost more`);
  }
});

test('standard turnaround is free and is the default', () => {
  assert.strictEqual(W.RUSH_OPTIONS[0].code, '');
  assert.strictEqual(W.rushFeeFor('', EMB()), 0);
  assert.strictEqual(W.rushFeeFor(undefined, EMB()), 0);
});

test('an unknown rush code charges nothing rather than throwing', () => {
  /* This route is reachable with a hand-posted body. */
  assert.strictEqual(W.rushFeeFor('rush99', EMB()), 0);
  assert.strictEqual(W.rushFeeFor({ evil: true }, EMB()), 0);
});

test('holiday mode doubles the fee', () => {
  assert.strictEqual(W.rushFeeFor('rush2', EMB(), true), 800);
});

/* ── What a rush cannot compress ─────────────────────────────────────────── */

const WED_AM = new Date('2026-09-02T15:00:00Z');   // 10:00 in Chicago, well before cut-off

test('rush shortens the machine time, not the wait for blanks', () => {
  /* The failure this prevents: quoting "same day" from the ORDER date on
     garments that have not been ordered yet. Rush buys a slot on the machine.
     It does not make a supplier's van arrive. */
  const std  = W.deliveryEstimate(WED_AM, { items: EMB() });
  const same = W.deliveryEstimate(WED_AM, { items: EMB(), rushCode: 'rush0' });
  assert.ok(same.ready < std.ready, 'a rush must actually move the date');
  assert.strictEqual(same.blanks_days > 0, true,
    'with no garments in hand the supplier lead time is still ahead of the job');
  assert.ok(same.ready > WED_AM,
    'same-day cannot mean today when the shirts have not arrived');
});

test('garments already in hand remove the blanks wait, and only that', () => {
  const waiting = W.deliveryEstimate(WED_AM, { items: EMB(), rushCode: 'rush2' });
  const inHand  = W.deliveryEstimate(WED_AM, { items: EMB(), rushCode: 'rush2', blanksIn: true });
  assert.strictEqual(inHand.blanks_days, 0);
  assert.ok(inHand.ready < waiting.ready);
});

test('a rush the job is not eligible for does not move the date either', () => {
  /* The fee and the date are gated by the SAME call, so a customer can never
     be shown a date they were not charged for, or charged for one they were
     not shown. */
  const std     = W.deliveryEstimate(WED_AM, { items: SCREEN() });
  const claimed = W.deliveryEstimate(WED_AM, { items: SCREEN(), rushCode: 'rush0' });
  assert.deepStrictEqual(claimed.ready, std.ready);
  assert.strictEqual(claimed.rush_code, '');
});

test('holiday mode stretches standard production but not a sold rush tier', () => {
  /* Taking 40% for "2 business days" and then quietly making it 5 is the worst
     of both: the customer paid for a date the shop had already decided to
     miss. In season the honest move is to stop offering the tier. */
  const stdBusy  = W.deliveryEstimate(WED_AM, { items: EMB(), holiday: true });
  const stdCalm  = W.deliveryEstimate(WED_AM, { items: EMB(), holiday: false });
  assert.ok(stdBusy.ready > stdCalm.ready, 'standard work does take longer in season');

  const rushBusy = W.deliveryEstimate(WED_AM, { items: EMB(), rushCode: 'rush2', holiday: true });
  const rushCalm = W.deliveryEstimate(WED_AM, { items: EMB(), rushCode: 'rush2', holiday: false });
  assert.deepStrictEqual(rushBusy.ready, rushCalm.ready,
    'a tier that was sold as 2 business days stays 2 business days');
});

/* ── The clock the promise is made on ────────────────────────────────────── */

test('work handed over after the 3:30pm cut-off starts the next business day', () => {
  /* Anchorfish states a 3:30pm CST cut-off and the shop's own machine has the
     same problem: an order taken at 4pm has not begun. Counting from `from`
     regardless is how a Friday-evening job gets quoted as a Friday-morning one. */
  const before = W.productionStart(new Date('2026-09-02T19:00:00Z')); // 14:00 Chicago
  const after  = W.productionStart(new Date('2026-09-02T21:00:00Z')); // 16:00 Chicago
  assert.strictEqual(before.getDate(), 2, 'before the cut-off, the day has started');
  assert.strictEqual(after.getDate(), 3, 'after it, the clock starts tomorrow');
});

test('the cut-off is read in the shop timezone, not the server one', () => {
  /* Railway runs UTC. 21:00 UTC is 16:00 in Chicago — past the cut-off — but
     18:00 UTC is 13:00 there and is NOT, though both read as afternoon in UTC. */
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

/* ── Saying so when the sheet does not cover it ──────────────────────────── */

test('a run past the contract sheet ceiling is flagged, not silently quoted', () => {
  /* Anchorfish quotes 7-10 days up to 2,400 prints and says over 7,000 is by
     quote. Past that the sheet promises nothing, so a date derived from it is
     an extrapolation and the page has to say so. */
  const normal = W.deliveryEstimate(WED_AM, { items: [line('Embroidery', 1000, 1600, 100)] });
  const huge   = W.deliveryEstimate(WED_AM, { items: [line('Embroidery', 40000, 60000, 5000)] });
  assert.strictEqual(normal.beyond_sheet, false);
  assert.strictEqual(huge.beyond_sheet, true);
});

/* ── The wiring, where a correct rule can still be bypassed ──────────────── */

test('the fee is re-derived from the lines, never trusted from the row', () => {
  /* A quote saved as embroidery + rush, then edited to screen print, must stop
     charging for the rush at the same moment it stops promising the date.
     quoteTotals() calls rushFeeFor(q.rush_code, q.items) rather than reading a
     stored dollar figure, which is what makes that true. */
  assert.match(src, /const rush = rushFeeFor\(q\.rush_code, q\.items\);/,
    'quoteTotals must derive the rush from the CURRENT lines');
  assert.doesNotMatch(src, /rush_amount|rush_fee\s+NUMERIC/,
    'storing the dollars would freeze yesterday figure against today lines');
});

test('rush is inside the subtotal, so it is discounted and taxed', () => {
  /* Added after tax it would be untaxed revenue the shop still owes tax on,
     and a whole-job discount would not reach it. */
  assert.match(src, /const subtotal = round2\(lines \+ rush\);/,
    'rush belongs in the subtotal the discount and tax are computed from');
});

test('the save path validates the posted code against the job', () => {
  /* The form only offers rush when it applies, but the form is not the only
     way to reach the route, and the stored code is what every later total
     re-reads. */
  assert.match(src, /rushAvailable\(items\) && wanted\.pct &&\s*\n?\s*rushImprovesDate\(wanted\.code, \{ items \}\)/,
    'an ineligible or unknown code, or one that is no sooner than standard, must store as NULL');
  assert.match(src, /rush_code=\$16/, 'an edit must be able to clear it too');
});

test('the quote form offers the tier and the customer page shows it', () => {
  assert.match(src, /name="rush_code" id="rushsel"/, 'the admin form needs the selector');
  assert.match(src, /rushSel\.disabled = !rushOk/,
    'it must be visibly unavailable, not silently missing — otherwise the next ' +
    'step is promising a rush over the phone');
  assert.match(src, /RUSH_UNAVAILABLE/, 'and it must say why');
  assert.match(src, /t\.rush > 0 \? `<tr>/, 'the customer must see what they were charged');
});

test('the browser prices rush the same way the server does', () => {
  /* Two implementations of a money rule is two prices. The browser mirrors
     rushFeeFor; these assertions are what catch one of them being changed. */
  const browser = src.slice(src.indexOf('var rushSel'), src.indexOf('Mirrors quoteDiscount'));
  assert.match(browser, /decoTotal \* \(rushTier\.pct\/100\)/,
    'the browser must charge on the decoration too');
  assert.match(browser, /HOLIDAY \? 2 : 1/, 'and double it in season, as the server does');
  assert.match(browser, /rushOk\s+= decorated > 0 && embOnly/,
    'and gate it on the same embroidery-only rule');
});

/* ── A rush that is not sooner is not a rush ─────────────────────────────── */

test('a tier that lands no sooner than standard is refused', () => {
  /* The arithmetic that makes this necessary: a 4-day machine slot on a job
     still waiting 5 days for blanks lands on day 9, while standard lands on
     day 7. Selling that is a 20% surcharge for a LATER delivery. */
  const at = { items: EMB(), from: WED_AM };
  const four = W.deliveryEstimate(WED_AM, { items: EMB(), rushCode: 'rush4' });
  const std  = W.deliveryEstimate(WED_AM, { items: EMB() });
  assert.ok(four.ready > std.ready, 'the setup for this test must actually be the bad case');
  assert.strictEqual(W.rushImprovesDate('rush4', at), false);
});

test('every tier helps once the garments are in hand', () => {
  /* Which is why the shop can genuinely sell same-day on a reorder and cannot
     on a fresh job — the difference is the supplier, not the machine. */
  for (const r of W.RUSH_OPTIONS) {
    assert.strictEqual(W.rushImprovesDate(r.code, { items: EMB(), from: WED_AM, blanksIn: true }),
      true, `${r.code || 'standard'} must land sooner once the blanks are in`);
  }
});

test('standard is never refused for not being sooner than itself', () => {
  assert.strictEqual(W.rushImprovesDate('', { items: EMB(), from: WED_AM }), true);
});

test('the form offers only what the save path will accept', () => {
  /* Otherwise June picks a tier, the quote saves without it, and the only
     evidence is a fee that quietly did not appear. */
  assert.match(src, /var RUSH_HELPS = /, 'the form needs the same verdict the server reached');
  assert.match(src, /rushImprovesDate\(r\.code, \{\}\)/,
    'and it must come from rushImprovesDate, not a second rule');
  assert.match(src, /o\.disabled = !helps/, 'an unavailable tier is disabled, not hidden');
  assert.match(src, /not sooner than standard/, 'and it says why');
});
