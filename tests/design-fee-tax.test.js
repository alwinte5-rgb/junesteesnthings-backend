'use strict';

/* Design-only quotes are not taxed (owner, 2026-10-20: "design fee no sales
 * tax"). Illinois taxes goods: design delivered as a file, or a sourcing spec
 * sheet, sells none (IDOR ST 19-0002-GIL, ST 24-0018-GIL). Design sold with
 * the goods it is for is part of their price and stays taxed (86 Ill. Adm.
 * Code 130.410). So the rule is all or nothing: a quote whose every line is
 * design or sourcing work is untaxed; one printed line and it is taxed as before.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const TAXCERT = require('../tools/lib/tax-certificates');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

/* The helpers, run as written. */
const helpers = (() => {
  const i = src.indexOf('const UNTAXED_SERVICE_RE');
  const j = src.indexOf('function designOnly(');
  const end = src.indexOf('\n}\n', j) + 3;
  const code = src.slice(i, end) + '\n({ isUntaxedService, designOnly });';
  return vm.runInThisContext(code);
})();

test('design and sourcing services are untaxed; folding and printed services are not', () => {
  const svc = (name) => ({ service: true, name });
  assert.ok(helpers.isUntaxedService(svc('Garment Sourcing — options + spec sheet')));
  assert.ok(helpers.isUntaxedService(svc('Calendar Design — New (13 pages)')));
  assert.ok(helpers.isUntaxedService(svc('Business Card Design — Revision')));
  assert.ok(!helpers.isUntaxedService(svc('Trifold Brochure Folding (per brochure)')));
  assert.ok(!helpers.isUntaxedService(svc('Trifold Brochures 8.5x11, folded — 3,000 run (per brochure)')));
  /* A shop product named "design" is goods, not a service. */
  assert.ok(!helpers.isUntaxedService({ service: false, name: 'Design Your Own Tee' }));
});

test('only a quote that is ALL design work is design-only', () => {
  const fee = { untaxed: true, line_total: 25 };
  const tee = { line_total: 310 };
  assert.ok(helpers.designOnly([fee]));
  assert.ok(helpers.designOnly([fee, { untaxed: true, line_total: 95 }]));
  assert.ok(!helpers.designOnly([fee, tee]), 'a design fee beside printed goods is taxed');
  assert.ok(!helpers.designOnly([fee, { ...tee, optional: true }]), 'an optional printed line can be accepted');
  assert.ok(!helpers.designOnly([]));
  /* Lines saved before the flag existed have none: their tax never changes. */
  assert.ok(!helpers.designOnly([{ line_total: 25 }]));
});

test('the save route makes a design-only job untaxed, with its own reason, and nothing else can claim it', () => {
  const s = after('const designJob = designOnly(items);', 600);
  assert.match(s, /const taxable = designJob \? false :/);
  const r = after('const exemptReason = taxable ? null : designJob', 300);
  assert.match(r, /'design_only'/);
  assert.match(r, /!TAXCERT\.EXEMPT_REASONS\[reasonIn\]\.auto/, 'a person cannot pick design_only');
  /* The garment design tiers are untouched: still part of a taxed line. */
  assert.doesNotMatch(src, /untaxed:\s*lineUntaxed|design_\.\*.*untaxed/);
});

test('design_only needs no certificate, counts as documented, and is never offered in the dropdown', () => {
  const R = TAXCERT.EXEMPT_REASONS.design_only;
  assert.ok(R && R.auto && R.certificate === false);
  const q = { taxable: false, tax_exempt_reason: 'design_only', tax_exempt_ref: null };
  assert.strictEqual(TAXCERT.quoteNeedsCertificate(q), false, 'the customer can pay at once');
  assert.strictEqual(TAXCERT.exemptionDocumented(q, null), true);
  assert.match(src, /WHEN q\.tax_exempt_reason = 'design_only' THEN TRUE/, 'the ST-1 count agrees');
  assert.match(src, /EXEMPT_REASONS\)\.filter\(\(\[, r\]\) => !r\.auto\)/);
});

test('the quote form previews no tax for a design-only job and treats a typed line as goods', () => {
  const f = after('var dLines =', 1100);
  assert.match(f, /pr\.untaxed === true/);
  assert.match(f, /\{ untaxed: false \}/, 'a product-less typed line is goods');
  assert.match(f, /var taxable = !dOnly &&/);
  assert.match(src, /for \(const p of d\.products \|\| \[\]\) if \(isUntaxedService\(p\)\) p\.untaxed = true;/);
});

test('a helper\'s NEW design-only quote does not read a prior quote that is not there', () => {
  /* basis is null on a new quote; reading basis.tax_exempt_ref there was a 500
     the e2e caught (run-design-tax.cjs). */
  assert.match(after('const exemptRef = taxable', 120), /const exemptRef = taxable \|\| designJob\s*\? null/);
});
