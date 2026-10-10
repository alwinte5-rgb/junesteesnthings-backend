/* Optional quote lines, and Signs365 charges shown inside the item's price.
 *
 * Run: node --test tests/*.test.js
 *
 * The owner, 2026-09-30: one quote with choices on it instead of two quotes.
 * The shop marks lines Optional; the customer ticks the ones they want, watches
 * the total move, and Accept keeps what they ticked. What these guard:
 *
 * 1. An optional line is in no figure anyone is charged until it is ticked,
 *    and after Accept no line is optional: the ticked ones are ordinary lines
 *    and the rest are set aside. Everything downstream (production, receipts,
 *    Books) then sees only what was bought, without knowing options exist.
 * 2. Order-level freight is billed once. An option is priced as if taken on
 *    its own, so two ticked cutout options both carry the delivery; one keeps
 *    it. A charge a required line already pays never rides on an option.
 * 3. The page and the Accept route run the SAME applyOptionChoice(), so the
 *    total the customer watches is the total that is stored and charged.
 * 4. Signs365's charges are shown inside the item's price: no row of their
 *    own, but still billed, once an order, as the add-on they always were.
 *
 * The real functions are lifted out of server.js, as in quote-discount.test.js,
 * so these cannot drift from the code they guard.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

const TAX_RATE = 0.1025;
const F = vm.runInThisContext(`(function(){
  const DEPOSIT_PC = 0.5, DEPOSIT_FULL_UNDER = 100, TAX_RATE = ${TAX_RATE};
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const IN_ITEM_PRICE_CODES = ['cutout_ship', 'cutout_ship_sat', 'cutout_ship_large'];
  ${lift('depositFor')}
  ${lift('quoteDiscount')}
  ${lift('quoteTotals')}
  ${lift('quoteTax')}
  ${lift('quoteTaxable')}
  ${lift('applyOptionChoice')}
  ${lift('totalsForItems')}
  ${lift('normalisedAddons')}
  ${lift('addonTotalOf')}
  ${lift('shownAddons')}
  ${lift('shownAddonTotalOf')}
  ${lift('customerLineFigures')}
  return { quoteTotals, applyOptionChoice, totalsForItems, customerLineFigures, shownAddons };
})()`);

const SHARED = ['cutout_ship', 'cutout_ship_sat', 'cutout_ship_large'];
const ship = (total = 10) => ({ code: 'cutout_ship', label: 'Cutout delivery to our shop', kind: 'once', rate: total, count: 0, total });

/* ── Totals before the customer chooses ─────────────────────────────────── */

test('an optional line is in no total until it is ticked', () => {
  const t = F.quoteTotals({ items: [{ line_total: 100 }, { line_total: 60, optional: true }], tax: 0 });
  assert.strictEqual(t.subtotal, 100);
  assert.strictEqual(t.total, 100);
});

test('a quote of nothing but options totals zero until something is ticked', () => {
  const t = F.quoteTotals({ items: [{ line_total: 164, optional: true }, { line_total: 168, optional: true }], tax: 0 });
  assert.strictEqual(t.total, 0);
  assert.strictEqual(t.deposit, 0);
});

/* ── What Accept keeps ──────────────────────────────────────────────────── */

test('required lines stay, ticked options join, unticked options are set aside', () => {
  const items = [
    { description: 'tees', line_total: 200 },
    { description: 'hoodies', line_total: 300, optional: true },
    { description: 'hats', line_total: 90, optional: true },
  ];
  const r = F.applyOptionChoice(items, [2], SHARED);
  assert.deepStrictEqual(r.items.map((i) => i.description), ['tees', 'hats']);
  assert.deepStrictEqual(r.declined.map((i) => i.description), ['hoodies']);
  const hats = r.items[1];
  assert.strictEqual(hats.optional, undefined, 'a ticked option is an ordinary line afterwards');
  assert.strictEqual(hats.chosen_option, true);
  assert.strictEqual(items[2].optional, true, 'the stored quote is not mutated');
});

test('a tick on a line that is not optional changes nothing', () => {
  const items = [{ description: 'tees', line_total: 200 }, { description: 'hats', line_total: 90, optional: true }];
  const r = F.applyOptionChoice(items, [0, 7, -1], SHARED);
  assert.deepStrictEqual(r.items.map((i) => i.description), ['tees']);
  assert.deepStrictEqual(r.declined.map((i) => i.description), ['hats']);
});

test('two ticked options that each carry the delivery pay it once', () => {
  const items = [
    { description: '24in pack', line_total: 178, list_total: null, addons: [ship()], optional: true },
    { description: '36in pack', line_total: 174, list_total: 190, addons: [ship()], optional: true },
  ];
  const r = F.applyOptionChoice(items, [0, 1], SHARED);
  assert.strictEqual(r.items[0].line_total, 178, 'the first keeps it');
  assert.strictEqual(r.items[1].line_total, 164, 'the second drops it');
  assert.strictEqual(r.items[1].list_total, 180, 'and so does its struck-through list figure');
  assert.deepStrictEqual(r.items[1].addons, []);
  const t = F.totalsForItems({ taxable: false, tax: 0 }, r.items);
  assert.strictEqual(t.subtotal, 342);
});

test('only one option ticked keeps its own delivery', () => {
  const items = [
    { description: '24in pack', line_total: 178, addons: [ship()], optional: true },
    { description: '36in pack', line_total: 174, addons: [ship()], optional: true },
  ];
  const r = F.applyOptionChoice(items, [1], SHARED);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].line_total, 174, 'declining the first must not take the freight with it');
});

test('a delivery a required line pays is never charged again on an option', () => {
  const items = [
    { description: '24in pack', line_total: 178, addons: [ship()] },
    { description: '36in pack', line_total: 174, addons: [ship()], optional: true },
  ];
  const r = F.applyOptionChoice(items, [1], SHARED);
  assert.strictEqual(r.items[1].line_total, 164);
});

test('a charge that is not order-level is never touched', () => {
  const screens = { code: 'screens', kind: 'per_screen', rate: 25, count: 2, total: 50 };
  const items = [
    { description: 'a', line_total: 300, addons: [screens], optional: true },
    { description: 'b', line_total: 300, addons: [screens], optional: true },
  ];
  const r = F.applyOptionChoice(items, [0, 1], SHARED);
  assert.deepStrictEqual(r.items.map((i) => i.line_total), [300, 300]);
});

test('the figures after a choice carry tax on what was chosen', () => {
  const q = { taxable: true, tax: 0, rush_pct: 0, discount_kind: 'amt', discount_value: 0 };
  const t = F.totalsForItems(q, [{ line_total: 200 }]);
  assert.strictEqual(t.tax, 20.5);
  assert.strictEqual(t.total, 220.5);
  assert.strictEqual(t.deposit, 110.25);
});

test('a percentage discount and rush follow the chosen lines', () => {
  const q = { taxable: false, tax: 999, rush_pct: 10, discount_kind: 'pct', discount_value: 10 };
  const t = F.totalsForItems(q, [{ line_total: 100 }]);
  assert.strictEqual(t.rush, 10);
  assert.strictEqual(t.discount, 11);
  assert.strictEqual(t.tax, 0, 'stored tax is not reused');
  assert.strictEqual(t.total, 99);
});

/* ── One engine for the page and the route ──────────────────────────────── */

const page = src.slice(src.indexOf("app.get('/q/:code'"), src.indexOf("app.get(['/q/:code/pay/card'"));
const accept = src.slice(src.indexOf("app.post('/q/:code/accept'"), src.indexOf('function describeRequestedEdits('));

test('the customer page ticks through the same applyOptionChoice the route saves with', () => {
  assert.match(page, /\$\{applyOptionChoice\.toString\(\)\}/);
  assert.match(accept, /applyOptionChoice\(q0\.items, chosen, ORDER_SHARED_CODES\)/);
});

test('applyOptionChoice stands alone, so the page can run its source', () => {
  /* Evaluated with nothing else in scope: a reference to round2 or any other
     server helper would throw here and in the customer's browser alike. */
  const fn = vm.runInNewContext(`(${lift('applyOptionChoice')})`);
  const r = fn([{ line_total: 5, optional: true }], [0], []);
  assert.strictEqual(r.items.length, 1);
});

test('the option boxes post with the Accept form, with the revision they were ticked against', () => {
  assert.match(page, /class="opt" form="accept" name="opt" value="\$\{ix\}"/);
  assert.match(page, /name="rev" value="\$\{Number\(q\.revision\) \|\| 1\}"/);
});

test('Accept refuses an empty choice and a quote edited since the page loaded', () => {
  assert.match(accept, /\?e=choose#accept/);
  assert.match(accept, /parseInt\(rb\.rev, 10\) !== rev\) return res\.redirect\(`\/q\/\$\{code\}\?e=changed#accept`\)/);
  /* And the write itself is pinned to that revision, so an edit landing
     between the read and the UPDATE cannot have old ticks applied to it. */
  assert.match(accept, /AND \(\$12::int IS NULL OR COALESCE\(revision,1\) = \$12::int\)/);
});

test('Accept stores the chosen lines and their figures in the same UPDATE that accepts', () => {
  const upd = accept.slice(accept.indexOf('UPDATE quotes SET accepted_at=NOW()'));
  for (const col of ['items', 'subtotal', 'tax', 'total', 'deposit', 'declined_items']) {
    assert.match(upd.slice(0, 1200), new RegExp(`${col}\\s*= COALESCE\\(`), `${col} is written on accept`);
  }
});

/* ── The quote form's save route ────────────────────────────────────────── */

const save = src.slice(src.indexOf('const measureForStaff'), src.indexOf("res.send(quotePage('Quote ready'"));

test('required lines are priced before options, so they claim the freight', () => {
  /* Options are then priced group by group (optKey), each group together. */
  assert.match(save, /\.sort\(\(x, y\) => \(Number\(isOptional\(x\)\) - Number\(isOptional\(y\)\)\)\s*\|\| \(isOptional\(x\) \? optKey\(x\) - optKey\(y\) : 0\) \|\| \(x - y\)\)/);
  assert.match(save, /for \(const i of lineOrder\)/);
  assert.match(save, /else if \(!optional\) orderSharedSeen\.add\(a\.code\)/);
});

test('the stored subtotal leaves options out, and the approval gate counts them all', () => {
  assert.match(save, /items\.filter\(\(i\) => !i\.optional\)\.reduce/);
  assert.match(save, /total: allTotal, customPriced/);
});

test('a run mixing optional and required items, or options on an accepted quote, is refused rather than saved', () => {
  /* A run of optional items only is an option GROUP (quote-option-groups). */
  assert.match(save, /const mixedRuns = Object\.entries\(runKinds\)\.filter\(\(\[, k\]\) => k\.opt\.length && k\.req\.length\);/);
  assert.match(save, /if \(mixedRuns\.length\)/);
  assert.match(save, /existingQuote\.accepted_at && items\.some\(\(i\) => i\.optional\)/);
});

test('an added item resets its tick boxes by unticking them, not by blanking their value', () => {
  /* Blanking the value posted "" for a ticked box, which the save route reads
     as unticked: Dark garment on item 2 priced dark on screen and saved light. */
  assert.match(src, /if \(el\.type === 'checkbox' \|\| el\.type === 'radio'\) el\.checked = false;\s*else el\.value = '';/);
});

/* ── Signs365 charges inside the item's price ───────────────────────────── */

test('the Signs365 freight add-ons are the ones shown inside the price', () => {
  for (const code of SHARED) {
    assert.match(src, new RegExp(`code: '${code}'[^}]*inItemPrice: true`), `${code} is shown in the price`);
  }
  for (const code of ['screens', 'design_setup', 'specialty_ink']) {
    assert.doesNotMatch(src, new RegExp(`code: '${code}'[^}]*inItemPrice`), `${code} keeps its own row`);
  }
});

test('a cutout with delivery and Saturday rush shows one price', () => {
  const item = {
    qty: 1, unit_price: 168, line_total: 228,
    addons: [ship(), { code: 'cutout_ship_sat', kind: 'once', rate: 50, total: 50 }],
  };
  const f = F.customerLineFigures(item);
  assert.strictEqual(f.amount, 228);
  assert.strictEqual(f.each, 228);
  assert.deepStrictEqual(F.shownAddons(item), [], 'no rows for them');
});

test('screens keep their own row and the shirt price is unchanged', () => {
  const item = { qty: 50, unit_price: 6.85, line_total: 392.5,
    addons: [{ code: 'screens', kind: 'per_screen', rate: 25, count: 2, total: 50 }] };
  const f = F.customerLineFigures(item);
  assert.strictEqual(f.amount, 342.5);
  assert.strictEqual(f.each, 6.85);
  assert.strictEqual(F.shownAddons(item).length, 1);
});

test('the customer page names no Signs365 charge, not even in its script data', () => {
  assert.match(src, /label: IN_ITEM_PRICE_CODES\.includes\(a\.code\) \? '' : a\.label/);
  assert.match(src, /function addonRowsFor\(item, ix\) \{\s*const rows = shownAddons\(item\);/);
});

/* ── Option groups (optional lines sharing a run) ───────────────────────── */

test('one tick on a group takes the whole group, whichever of its lines was ticked', () => {
  const items = [
    { description: 'tees', line_total: 200 },
    { description: 'A adult', line_total: 120, optional: true, run_group: '1' },
    { description: 'A youth', line_total: 100, optional: true, run_group: '1' },
    { description: 'B hoodies', line_total: 300, optional: true, run_group: '2' },
    { description: 'C hats', line_total: 90, optional: true },
  ];
  let r = F.applyOptionChoice(items, [1], SHARED);
  assert.deepStrictEqual(r.items.map((i) => i.description), ['tees', 'A adult', 'A youth']);
  assert.deepStrictEqual(r.declined.map((i) => i.description), ['B hoodies', 'C hats']);
  r = F.applyOptionChoice(items, [2, 4], SHARED);
  assert.deepStrictEqual(r.items.map((i) => i.description), ['tees', 'A adult', 'A youth', 'C hats'],
    'a tick on the second line of a group takes the group too');
});

test('a run number on a required line groups nothing', () => {
  const items = [
    { description: 'tees', line_total: 200, run_group: '1' },
    { description: 'hats', line_total: 90, optional: true },
  ];
  const r = F.applyOptionChoice(items, [], SHARED);
  assert.deepStrictEqual(r.items.map((i) => i.description), ['tees']);
});

test('the customer page gives a group one box, on its first line, and draws it together', () => {
  assert.match(page, /const head = !inGroup \|\| members\[0\] === ix;/);
  assert.match(page, /\$\{opt && head \? `<label/);
  assert.match(page, /Part of the option above\./);
  assert.match(page, /for \(const k of \(g && grpMembers\[g\]\.length > 1 \? grpMembers\[g\] : \[ix\]\)\)/);
  assert.match(page, /run_group: i\.run_group == null \? null : String\(i\.run_group\),/);
});

test('a group pays order-level freight once, on the line it reaches first', () => {
  assert.match(save, /const seen = \(optGroupSeen\[runGroup\] \|\|= new Set\(\)\);/);
  assert.match(src, /var gs = optGroupSeen\[grp\] \|\| \(optGroupSeen\[grp\] = \{\}\);/);
});

test('a custom line with a blank price still needs approval (Codex #123)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes("if (!prod && (typedUnit || !(Number(priced.lineTotal) > 0))) customPriced++;"));
});
