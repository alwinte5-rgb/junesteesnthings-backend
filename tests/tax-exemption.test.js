'use strict';

/* Sales tax that is zero ON PURPOSE.
 *
 * The ledger already learned that an UNKNOWN tax portion is not zero
 * (unlinked-payments.test.js). This is the third state it still could not
 * express: a tax of zero that is CORRECT, because the buyer is exempt — and
 * that needs evidence behind it, because Illinois does not simply drop an
 * exempt sale from the return. Exempt sales are reported as receipts and then
 * DEDUCTED, and the seller is expected to produce the purchaser's exemption
 * ("E") number on audit.
 *
 * Before this, quote tax was zero and nothing said why. The form even inferred
 * the taxable flag from the amount — `Number(E.tax) > 0` — so three different
 * situations collapsed into one indistinguishable row:
 *
 *   - a genuinely exempt organisation
 *   - a taxable job that happened to price at zero
 *   - somebody forgetting to tick the box
 *
 * The rule this file defends: a zero that is deliberate says so, and says on
 * whose authority.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const backfill = fs.readFileSync(
  path.join(__dirname, '..', 'tools', 'backfill-unlinked.js'), 'utf8');

function lift(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', src.indexOf(name, start));
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

/* `deps` are the other functions the one under test calls. Lifting a function
   that calls a helper without it throws ReferenceError at call time, which
   reads as a bug in the code rather than a gap in the harness. */
function run(name, args, deps = []) {
  const sandbox = { round2: (n) => Math.round((Number(n) || 0) * 100) / 100 };
  vm.createContext(sandbox);
  const source = [...deps, name].map(lift).join('\n');
  return vm.runInContext(source + '\n' + name, sandbox)(args);
}

/* ── The columns ─────────────────────────────────────────────────────────── */

test('taxable is nullable and has no default', () => {
  /* The load-bearing line. A NOT NULL DEFAULT TRUE would silently declare
     every historical quote taxable — including the exempt one that prompted
     this — and a DEFAULT FALSE would do the reverse. NULL means "written
     before the column existed", where the amount is the only evidence and the
     old inference is still the right answer. */
  const m = /'taxable BOOLEAN([^']*)'/.exec(src);
  assert.ok(m, 'taxable column missing from the quotes ALTER list');
  assert.doesNotMatch(m[1], /NOT NULL/, 'an undecided quote must stay expressible');
  assert.doesNotMatch(m[1], /DEFAULT/,
    'backfilling a guess destroys the distinction the column exists to make');
});

test('there is somewhere to put the exemption number', () => {
  assert.match(src, /'tax_exempt_ref TEXT'/,
    'a deduction with no reference behind it is not one that survives an audit');
});

/* ── Reading the decision ────────────────────────────────────────────────── */

test('a stored taxable flag beats the amount', () => {
  /* The whole point: a taxable job priced at zero is still taxable, and an
     exempt job is exempt even if someone typed a figure into tax. */
  assert.strictEqual(run('quoteTaxable', { taxable: true, tax: 0 }), true);
  assert.strictEqual(run('quoteTaxable', { taxable: false, tax: 12.5 }), false);
});

test('a quote written before the column falls back to the old inference', () => {
  /* Every historical row reads exactly as it did yesterday. Changing how they
     read would restate periods that have already been filed. */
  assert.strictEqual(run('quoteTaxable', { tax: 9.5 }), true);
  assert.strictEqual(run('quoteTaxable', { tax: 0 }), false);
  assert.strictEqual(run('quoteTaxable', { taxable: null, tax: 9.5 }), true);
  assert.strictEqual(run('quoteTaxable', {}), false);
});

test('an untaxed sale with no reference is flagged, a documented one is not', () => {
  assert.strictEqual(run('quoteExemptUndocumented', { taxable: false }, ['quoteTaxable']), true,
    'a zero nobody can defend is the thing worth surfacing');
  assert.strictEqual(
    run('quoteExemptUndocumented', { taxable: false, tax_exempt_ref: 'E9998-1234-07' },
        ['quoteTaxable']),
    false);
  assert.strictEqual(run('quoteExemptUndocumented', { taxable: false, tax_exempt_ref: '   ' }, ['quoteTaxable']),
    true, 'whitespace is not evidence');
  assert.strictEqual(run('quoteExemptUndocumented', { taxable: true, tax: 10 }, ['quoteTaxable']), false,
    'a taxed sale is not an undocumented exemption');
});

/* ── Writing the decision ────────────────────────────────────────────────── */

test('an exemption reference is not kept on a taxable quote', () => {
  /* Otherwise it survives un-ticking the box later and reads as evidence for
     an exemption nobody actually claimed. */
  assert.match(src, /const exemptRef = taxable\s*\n?\s*\?\s*null/,
    'a taxable quote must store no exemption reference');
});

test('both the flag and the reference are actually persisted', () => {
  assert.match(src, /UPDATE quotes SET[\s\S]{0,600}taxable=\$\d+, tax_exempt_ref=\$\d+/,
    'editing a quote must be able to change the exemption');
  assert.match(src, /INSERT INTO quotes \([^)]*taxable,tax_exempt_ref/,
    'a new quote must record the decision it was written under');
});

test('the form asks for the reason exactly when there is a zero to explain', () => {
  assert.match(src, /name="tax_exempt_ref"/, 'no field, no reason, no deduction');
  assert.match(src, /exbox\.style\.display = taxable \? 'none' : ''/,
    'the reason appears when tax comes off, so it cannot be quietly skipped');
  assert.match(src, /\$\{!isEdit \|\| quoteTaxable\(E\) \? 'checked' : ''\}/,
    'the checkbox must read the stored flag, not re-derive it from the amount');
});

test('a new quote prefilled from an enquiry still defaults to taxable', () => {
  /* `existing` is truthy for BOTH a saved quote and a blank one prefilled from
     a lead or an abandoned cart — those carry tax: 0 and no code. Keying the
     checkbox off `existing` therefore opened every enquiry-sourced quote with
     tax un-ticked, which used to produce merely an untaxed row and now would
     persist taxable=false and file it as a deliberate ST-1 deduction.
     `isEdit` is the discriminator that already exists for this exact reason. */
  assert.match(src, /const isEdit = !!\(existing && existing\.code\)/,
    'isEdit is what separates an edit from a prefilled blank');
  assert.doesNotMatch(src, /\$\{!existing \|\| quoteTaxable/,
    'a prefilled blank is not an exemption');
});

test('the books page says when its own numbers are incomplete', () => {
  /* A figure computed and rendered nowhere warns nobody. The whole point of
     separating unknown tax and undocumented exemptions is that someone sees
     them before filing. */
  assert.match(src, /pos\.undeterminedPayments > 0 \|\| pos\.exemptUndocumented > 0/,
    'the tax card must raise both, or the distinction never reaches a human');
  assert.match(src, /untaxed sale\(s\)<\/strong> have no exemption number on/,
    'an undocumented deduction has to be visible where the return is read from');
});

/* ── The export ──────────────────────────────────────────────────────────── */

const TAXCSV = (() => {
  const i = src.indexOf("app.get('/tax.csv'");
  assert.notStrictEqual(i, -1, '/tax.csv route not found');
  const j = src.indexOf("app.get('/exports/unlinked.csv'", i);
  assert.notStrictEqual(j, -1, 'could not find the end of the /tax.csv route');
  return src.slice(i, j);
})();

/** The contents of the array literal starting at or after `from`. */
function arrayAt(text, from) {
  const start = text.indexOf('[', from);
  assert.notStrictEqual(start, -1, 'no array literal found');
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) {
      return { inner: text.slice(start + 1, i), end: i };
    }
  }
  throw new Error('unbalanced brackets');
}

/** How many elements an array literal has, ignoring nested ones. */
function topLevelCount(inner) {
  if (!inner.trim()) return 0;
  let depth = 0, n = 1;
  for (const c of inner) {
    if ('[({'.includes(c)) depth++;
    else if ('])}'.includes(c)) depth--;
    else if (c === ',' && depth === 0) n++;
  }
  return n;
}

test('every row has exactly as many cells as there are headers', () => {
  /* A CSV whose rows are one cell short does not fail — it shifts every value
     into the wrong column, and the file still opens. On a tax export that is a
     wrong number filed rather than an error anyone sees. */
  const header = arrayAt(TAXCSV, TAXCSV.indexOf('jtees-sales-tax-'));
  const headers = topLevelCount(header.inner);
  assert.ok(headers >= 13, `expected the widened header, got ${headers} columns`);

  const quoteCells = arrayAt(TAXCSV, TAXCSV.indexOf('cells: ['));
  const unlinkedCells = arrayAt(TAXCSV, TAXCSV.indexOf('cells: [', quoteCells.end));

  assert.strictEqual(topLevelCount(quoteCells.inner), headers,
    'quote rows must line up with the header');
  assert.strictEqual(topLevelCount(unlinkedCells.inner), headers,
    'unlinked rows must line up with the header');
});

test('/tax.csv survives a deploy that races the migration', () => {
  /* Its sibling queries are all guarded. Unguarded, the export goes from
     working to a 500 during the deploy window — on the one file a return is
     filed from. */
  assert.match(TAXCSV, /\.catch\(\(\) => pool\.query\(/,
    'a missing column must cost the exemption columns, not the whole export');
  assert.match(TAXCSV, /NULL::boolean AS taxable, NULL::text AS tax_exempt_ref/,
    'the fallback has to return the same shape the rows print');
});

test('one exempt quote paid twice is one undocumented exemption', () => {
  /* COUNT(*) over quote_payments counts a deposit and a balance separately,
     so a single missing E number reads as two. */
  assert.match(src, /COUNT\(DISTINCT p\.quote_code\)\s*\n?\s*FILTER \(WHERE NULLIF\(btrim\(q\.tax_exempt_ref\)/,
    'the count is of deductions, not of payments');
});

test('the export says exempt rather than leaving a bare zero', () => {
  assert.match(TAXCSV, /'exempt', 'exempt_ref'/,
    'the ST-1 deducts exempt sales, so they have to be identifiable as exempt');
  assert.match(TAXCSV, /quoteTaxable\(r\) \? '' : 'exempt'/,
    'exemption is read through the shared helper, not re-derived here');
  assert.match(TAXCSV, /q\.taxable, q\.tax_exempt_ref/,
    'the query has to actually select the columns the rows print');
});

/* ── The tax position ────────────────────────────────────────────────────── */

function runTaxPosition({ collected = [], remitted = [], unlinked = [], exempt = [] }) {
  const sandbox = {
    round2: (n) => Math.round((Number(n) || 0) * 100) / 100,
    pool: {
      query(sql) {
        if (/JOIN quotes/.test(sql)) return Promise.resolve({ rows: exempt });
        if (/FROM quote_payments/.test(sql)) return Promise.resolve({ rows: collected });
        if (/FROM tax_remittances/.test(sql)) return Promise.resolve({ rows: remitted });
        if (/FROM unlinked_payments/.test(sql)) return Promise.resolve({ rows: unlinked });
        throw new Error('unexpected query: ' + sql);
      },
    },
  };
  vm.createContext(sandbox);
  return vm.runInContext(lift('taxPositionByMonth') + '\ntaxPositionByMonth', sandbox)();
}

test('exempt receipts are reported, not silently dropped', async () => {
  /* Leaving an exempt sale out understates gross receipts. It belongs on the
     return as a receipt and then as a deduction. */
  const pos = await runTaxPosition({
    collected: [{ period: '2026-08', collected: '100.00', gross: '1000.00', payments: '4' }],
    exempt: [{ period: '2026-08', exempt_gross: '584.95', exempt_payments: '1',
               exempt_undocumented: '0' }],
  });
  assert.strictEqual(pos.months[0].exemptGross, 584.95);
  assert.strictEqual(pos.exemptGross, 584.95);
});

test('an exempt sale never adds tax that was not collected', async () => {
  const pos = await runTaxPosition({
    collected: [{ period: '2026-08', collected: '100.00', gross: '1000.00', payments: '4' }],
    exempt: [{ period: '2026-08', exempt_gross: '584.95', exempt_payments: '1',
               exempt_undocumented: '0' }],
  });
  assert.strictEqual(pos.months[0].outstanding, 100,
    'the deduction is receipts, not tax — it must not move the set-aside');
  assert.strictEqual(pos.setAside, 100);
});

test('an exempt sale does NOT make the period undetermined', async () => {
  /* Exempt is a KNOWN zero. Conflating it with an unknown would make every
     month carrying a nonprofit order look unfileable. */
  const pos = await runTaxPosition({
    exempt: [{ period: '2026-08', exempt_gross: '584.95', exempt_payments: '1',
               exempt_undocumented: '0' }],
  });
  assert.strictEqual(pos.months[0].undetermined, false);
  assert.strictEqual(pos.undeterminedPayments, 0);
});

test('an exemption with nothing on file is counted separately', async () => {
  const pos = await runTaxPosition({
    exempt: [{ period: '2026-08', exempt_gross: '584.95', exempt_payments: '2',
               exempt_undocumented: '1' }],
  });
  assert.strictEqual(pos.months[0].exemptUndocumented, 1);
  assert.strictEqual(pos.exemptUndocumented, 1,
    'a deduction claimed with no reference is the one an audit removes');
});

test('a period with only exempt sales still appears', async () => {
  const pos = await runTaxPosition({
    exempt: [{ period: '2026-07', exempt_gross: '120.00', exempt_payments: '1',
               exempt_undocumented: '0' }],
  });
  assert.strictEqual(pos.months.length, 1);
  assert.strictEqual(pos.months[0].period, '2026-07');
});

test('the exempt query survives a database that has not migrated yet', () => {
  /* q.taxable does not exist until initDB has run. Without the catch, the
     whole tax page dies on a stale schema instead of degrading. */
  const fn = lift('taxPositionByMonth');
  const i = fn.indexOf('WHERE COALESCE(q.taxable');
  assert.notStrictEqual(i, -1, 'exempt query not found');
  assert.match(fn.slice(i, i + 260), /\.catch\(\(\) => \(\{ rows: \[\] \}\)\)/,
    'a missing column must not take the tax position down with it');
});

test('the exempt query reads taxable the same way the helper does', () => {
  /* Two definitions of "was this taxed" is how the export and the return end
     up disagreeing about the same sale. */
  assert.match(src, /COALESCE\(q\.taxable, q\.tax > 0\) = false/,
    'SQL must mirror quoteTaxable()\'s NULL fallback exactly');
});

/* ── Excluding a charge that is not a receipt ────────────────────────────── */

test('--exclude does not eat the first argument when it is absent', () => {
  /* `args[args.indexOf('--exclude') + 1]` is args[0] when the flag is missing,
     so `--apply` alone would have excluded a charge id of "--apply" — harmless
     — but `--since 2024-01-01` would silently exclude nothing while looking
     like it did. Guarded with includes() first. */
  assert.match(backfill, /args\.includes\('--exclude'\)/,
    'the flag must be checked before its value is read');
});

test('exclusion is by id, never by amount', () => {
  /* A minimum-amount filter would quietly swallow small REAL sales, which is
     the exact failure this whole ledger exists to prevent. */
  assert.doesNotMatch(backfill, /amount\s*<\s*\d|MIN_AMOUNT|minAmount/,
    'no threshold filtering — drop charges by name or not at all');
  assert.match(backfill, /const excluded = \(\.\.\.ids\) =>/,
    'exclusion matches identifiers');
});

test('an excluded charge is counted out loud', () => {
  /* A silent skip is indistinguishable from a bug. */
  assert.match(backfill, /\$\{skipped\} excluded/);
  assert.match(backfill, /chargesSkipped\} excluded by --exclude/);
});

test('both loops honour the exclusion', () => {
  assert.match(backfill, /excluded\(s\.id, s\.payment_intent\)/,
    'the session sweep must skip it');
  assert.match(backfill, /excluded\(c\.id, pi\)/,
    'the charge reconciliation must skip it too, or it reappears as an orphan');
});
