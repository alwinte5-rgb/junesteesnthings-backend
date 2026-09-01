'use strict';

/* Rush: a percentage on the job for pulling a delivery date in.
 *
 * Added 2026-09-01 at the shop's instruction, replacing nothing — PR #99 had
 * removed a flat $15 tier list that was wired to no code at all. The difference
 * that matters is not the number, it is who decides: a percentage set by the
 * person quoting, on the admin form, per job. Screen printing and DTF are
 * contracted at 7-10 business days with no rush product at any price, so a rush
 * on that work is the shop taking the scheduling on itself. That is a judgement
 * and it must never be a checkbox a customer can tick.
 *
 * What this file pins:
 *   - the ladder, and the business-day count that selects a rung
 *   - that it is configurable without a deploy, INCLUDING off
 *   - that a figure typed or cleared by hand beats the ladder
 *   - that rush lands before the discount and inside the tax base
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

const DEFAULT_TABLE = src.match(/const RUSH_TIERS_DEFAULT = \[[\s\S]*?\];/)[0];
const PARSER = src.match(/const RUSH_TIERS = \(\(\) => \{[\s\S]*?\}\)\(\);/)[0];

/** Build the rush rule with a given JT_RUSH_TIERS, exactly as server.js does. */
function build(env) {
  return vm.runInThisContext(`(() => {
    const process = { env: ${JSON.stringify(env || {})} };
    const console = { error: () => {} };
    ${DEFAULT_TABLE}
    ${PARSER}
    ${lift('businessDaysUntil')}
    ${lift('rushPctFor')}
    return { RUSH_TIERS, rushPctFor, businessDaysUntil };
  })()`);
}

/* A Tuesday, so a four-business-day reach crosses a weekend. */
const TUE = new Date('2026-09-01T12:00:00');

/* ── the ladder the shop asked for ───────────────────────────────────────── */

test('the ladder is 80 / 50 / 30 / 10 by business days out', () => {
  const { rushPctFor } = build();
  assert.strictEqual(rushPctFor('2026-09-02', TUE), 80, 'next business day');
  assert.strictEqual(rushPctFor('2026-09-03', TUE), 50, 'two days');
  assert.strictEqual(rushPctFor('2026-09-04', TUE), 30, 'three days');
  assert.strictEqual(rushPctFor('2026-09-07', TUE), 10, 'four days, across the weekend');
  assert.strictEqual(rushPctFor('2026-09-08', TUE), 0, 'five days is normal turnaround');
});

test('the count is BUSINESS days, so a weekend is not lead time', () => {
  /* Friday to Monday is one business day, not three. Counting calendar days
     would quote a Monday deadline as comfortable and then miss it. */
  const { businessDaysUntil } = build();
  const FRI = new Date('2026-09-04T12:00:00');
  assert.strictEqual(businessDaysUntil('2026-09-07', FRI), 1, 'Fri -> Mon');
  assert.strictEqual(businessDaysUntil('2026-09-05', FRI), 0, 'Fri -> Sat is no working time');
});

test('a date already past is the most urgent case, not the least', () => {
  /* It must not wrap around to no rush — someone asking for yesterday is the
     one job that certainly cannot be done at the normal rate. */
  const { rushPctFor } = build();
  assert.strictEqual(rushPctFor('2026-08-25', TUE), 80);
  assert.strictEqual(rushPctFor('2026-09-01', TUE), 80, 'today counts as today');
});

test('no date means no rush', () => {
  const { rushPctFor } = build();
  for (const v of [null, undefined, '', 'not a date']) {
    assert.strictEqual(rushPctFor(v, TUE), 0, `needed_by ${JSON.stringify(v)}`);
  }
});

/* ── add, remove, adjust ─────────────────────────────────────────────────── */

test('the ladder can be adjusted without a deploy', () => {
  const { rushPctFor } = build({ JT_RUSH_TIERS: '[{"days":1,"pct":95},{"days":3,"pct":25}]' });
  assert.strictEqual(rushPctFor('2026-09-02', TUE), 95, 'adjusted');
  assert.strictEqual(rushPctFor('2026-09-03', TUE), 25, 'two days now falls in the 3-day rung');
  assert.strictEqual(rushPctFor('2026-09-07', TUE), 0, 'the 4-day rung was removed');
});

test('a rung can be added', () => {
  const { rushPctFor } = build({
    JT_RUSH_TIERS: '[{"days":1,"pct":80},{"days":2,"pct":50},{"days":3,"pct":30},'
                 + '{"days":4,"pct":10},{"days":7,"pct":5}]' });
  assert.strictEqual(rushPctFor('2026-09-10', TUE), 5, 'the new 7-day rung');
});

test('an empty ladder turns rush off entirely', () => {
  /* "We do not sell rush" has to be expressible, and it is a real answer
     rather than a broken table. */
  const { RUSH_TIERS, rushPctFor } = build({ JT_RUSH_TIERS: '[]' });
  assert.deepStrictEqual(RUSH_TIERS, []);
  assert.strictEqual(rushPctFor('2026-09-02', TUE), 0);
});

test('a broken ladder falls back to the table, never to charging nothing', () => {
  /* Silently not charging is the failure that costs money, so bad config must
     not read as "no rush". */
  for (const bad of ['{', 'null', '"80"', '{"days":1}', '[{"days":"x","pct":"y"}]']) {
    const { rushPctFor } = build({ JT_RUSH_TIERS: bad });
    assert.strictEqual(rushPctFor('2026-09-02', TUE), 80,
      `JT_RUSH_TIERS=${bad} should fall back to the default ladder`);
  }
});

test('rungs are sorted, so the order they are written in does not matter', () => {
  const { rushPctFor } = build({
    JT_RUSH_TIERS: '[{"days":4,"pct":10},{"days":1,"pct":80},{"days":2,"pct":50}]' });
  assert.strictEqual(rushPctFor('2026-09-02', TUE), 80, 'the most urgent rung still wins');
});

/* ── how it lands on the money ───────────────────────────────────────────── */

/* The deposit constants depositFor() closes over, taken from the file so a
   change to either reaches this test rather than being described here. */
function liftConst(name) {
  const m = src.match(new RegExp('^const ' + name + ' = .*?;', 'm'));
  assert.notStrictEqual(m, null, `const ${name} not found`);
  return m[0];
}

const quoteTotals = vm.runInThisContext(`(() => {
  ${liftConst('round2')}
  ${liftConst('DEPOSIT_PC')}
  ${liftConst('DEPOSIT_FULL_UNDER')}
  ${lift('quoteDiscount')}
  ${lift('depositFor')}
  ${lift('quoteTotals')}
  return quoteTotals;
})()`);

test('rush is a percentage of the subtotal, added before the discount', () => {
  const q = { items: [{ line_total: 1000 }], rush_pct: 50,
              discount_kind: 'pct', discount_value: 10, tax: 0 };
  const t = quoteTotals(q);
  assert.strictEqual(t.subtotal, 1000);
  assert.strictEqual(t.rush, 500);
  assert.strictEqual(t.gross, 1500);
  assert.strictEqual(t.discount, 150, '10% comes off the job including the rush');
  assert.strictEqual(t.net, 1350);
});

test('a quote with no rush is unchanged in every figure', () => {
  /* Every quote written before rush existed reads rush_pct as 0, and its
     stored total must not move. */
  const before = { items: [{ line_total: 480 }], discount_kind: 'amt',
                   discount_value: 30, tax: 46.13 };
  const t = quoteTotals(before);
  assert.strictEqual(t.rush, 0);
  assert.strictEqual(t.gross, 480);
  assert.strictEqual(t.net, 450);
  assert.strictEqual(t.total, round2(450 + 46.13));
});

test('the rush is inside the tax base', () => {
  /* Sales tax is owed on what the customer is actually charged. The tax figure
     is computed on `net` at save time, and net now contains the rush. */
  const t = quoteTotals({ items: [{ line_total: 200 }], rush_pct: 25,
                          discount_kind: 'amt', discount_value: 0, tax: 0 });
  assert.strictEqual(t.net, 250, 'the taxable base includes the surcharge');
});

test('a nonsense stored percentage never reduces the job', () => {
  for (const bad of [null, undefined, '', 'abc', -40]) {
    const t = quoteTotals({ items: [{ line_total: 100 }], rush_pct: bad,
                            discount_kind: 'amt', discount_value: 0, tax: 0 });
    assert.strictEqual(t.rush, 0, `rush_pct ${JSON.stringify(bad)}`);
    assert.strictEqual(t.net, 100);
  }
});

function round2(n) { return Math.round(n * 100) / 100; }
