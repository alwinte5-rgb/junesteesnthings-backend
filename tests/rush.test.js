'use strict';

/* Only DTF and embroidery can be rushed (owner, 2026-10-12 DTF; 2026-11-14
 * embroidery again): tools/lib/rush.js, the quote save and the quote form.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RUSH = require('../tools/lib/rush');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('an order is rushable only when every required line is DTF, embroidery, a Signs365 sign or a cutout (owner, 2026-11-16)', () => {
  const dtf = { product: true, titles: ['DTF Printing'] };
  assert.strictEqual(RUSH.rushAllowed([dtf]), true);
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: ['DTF Printing', 'DTF Printing'] }]), true);
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: ['Embroidery'] }]), true, 'embroidery (owner, 2026-11-14)');
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: false, titles: ['Big Head Cutout — 24in, 8-pack (full sheet)'] }]), true, 'cutouts (owner, 2026-11-16)');
  for (const other of ['Screen Printing', 'Puff print', '']) {
    assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: [other] }]), false, other || 'unknown method');
  }
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: [] }]), false, 'a garment with no method');
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: false, titles: [] }]), true, 'a hand-typed fee line is ignored');
  assert.strictEqual(RUSH.rushAllowed([]), false);
});

test('one rushLineOf() reads a quote line for the save, the saved state and the helper lock', () => {
  const at = src.indexOf('const rushOk = RUSH.rushAllowed(rushLines);');
  assert.ok(at > 0);
  assert.match(src.slice(src.lastIndexOf('const rushLines = ', at), at), /\.map\(\(it\) => rushLineOf\(it, catalog\)\);/);
  const fn = src.slice(src.indexOf('function rushLineOf('), src.indexOf('function rushLineOf(') + 1400);
  assert.match(fn, /qty: parseInt\(it\.qty, 10\) \|\| 0,/, 'the lines carry their pieces for the 50+ rule');
  assert.match(src, /function rushSignOf\(prod\) \{[\s\S]*?if \(prod\.supplier === 'sinalite'\) return 'sinalite';/, 'SinaLite items are marked so they cannot be rushed');
  const lock = src.slice(at, src.indexOf('const rush = round2(subtotal * rushPct / 100);', at));
  assert.match(lock, /const rushKind = RUSH\.rushKind\(rushLines\);/);
  assert.match(lock, /: \(wantDate && rushOk \? rushPctFor\(wantDate, undefined, rushKind\) : 0\);/);
  assert.match(lock, /if \(who\.kind === 'staff' && STAFF\.levelOf\(who, 'quotes\.price'\) !== 'on'\)/, 'only for helpers');
});

test('the form runs the save\'s own rules and calendar, and says why not', () => {
  /* The patterns are handed over as strings: a regex literal inside the page
     template loses its backslashes (\b became a backspace and nothing matched). */
  assert.match(src, /var RUSHABLE = new RegExp\(\$\{JSON\.stringify\(RUSH\.RUSHABLE\.source\)\}, 'i'\);/);
  const sent = new RegExp(JSON.parse(JSON.stringify(RUSH.RUSHABLE.source)), 'i');
  assert.ok(sent.test('DTF Transfer') && sent.test('Embroidery') && sent.test('Vinyl Banner') && !sent.test('Screen Printing') && !sent.test('ADTFX'));
  for (const fn of ['methodRushable', 'lineRushable', 'rushAllowed', 'rushKind', 'rushFor'])
    assert.ok(src.includes('${RUSH.' + fn + '.toString()}'), fn);
  for (const fn of ['shopHolidays', 'shopClosed', 'shopAddDays', 'shopClock', 'shopStartDay', 'shopDaysUntil'])
    assert.ok(src.includes('${SHOPDAYS.' + fn + '.toString()}'), fn);
  assert.match(src, /var r = rushFor\(days, RUSH_TIERS, kind, RUSH_RULE\);\s+var pct = rushOk \? r\.pct : 0;/);
  assert.match(src, /only DTF, embroidery, Signs365 signs and cutouts can be rushed: ask June about the date/);
  assert.match(src, /too soon: no same-day or next-day orders/);
  /* The injected sources must run on their own in a page. */
  const vm = require('node:vm');
  const D = require('../tools/lib/shop-days');
  const page = vm.runInThisContext(`(() => {
    var RUSHABLE = new RegExp(${JSON.stringify(RUSH.RUSHABLE.source)}, 'i'), EMBROIDERY = /embroider/i, CUTOUT = /big head cutout|full body cutout/i, LARGE_QTY = 50;
    ${RUSH.methodRushable} ${RUSH.lineRushable} ${RUSH.rushAllowed} ${RUSH.rushKind}
    ${D.shopHolidays} ${D.shopClosed} ${D.shopAddDays} ${D.shopClock} ${D.shopStartDay} ${D.shopDaysUntil}
    return { rushAllowed, rushKind, shopDaysUntil };
  })()`);
  assert.strictEqual(page.rushAllowed([{ product: true, titles: [], sign: 'signs365' }]), true);
  assert.strictEqual(page.rushKind([{ product: true, qty: 50, titles: ['DTF Printing'] }]), 'large');
  assert.strictEqual(page.shopDaysUntil('2026-11-30', new Date('2026-11-25T09:00:00-06:00'), 900, 'America/Chicago'), 1);
});

test('a helper keeps a saved rush only while the order keeps its rule, and cannot quote a too-soon date (code review)', () => {
  const at = src.indexOf("const wasKind = was ? RUSH.rushKind(wasLines) : '';");
  assert.ok(at > 0, 'the saved order is checked for embroidery or 50+ pieces');
  const tail = src.slice(at, src.indexOf('const rush = round2(subtotal * rushPct / 100);', at));
  assert.match(tail, /&& rushKind === wasKind\)/);
  assert.match(tail, /RUSH\.rushFor\(businessDaysUntil\(wantDate\), RUSH_TIERS, rushKind, RUSH_RULE\)\.tooSoon/);
  assert.match(tail, /return res\.status\(400\)\.send\(quotePage\('That date is too soon'/);
  assert.match(src, /data-was-kind="\$\{/, 'the form knows it too');
  assert.match(src, /\(box\.dataset\.wasKind === undefined \|\| box\.dataset\.wasKind === kind\)/);
});

test('the live chat turnaround reply updates from 5–7 to 5–10 (code review)', () => {
  const at = src.indexOf("shortcut: 'turnaround', title: 'How long will my order take?'");
  const entry = src.slice(at, src.indexOf("shortcut: 'deposit'", at));
  assert.match(entry, /body: `Thanks for asking! Small orders are ready in 5–10 business days/);
  assert.match(entry, /was: \[`Thanks for asking! Small orders are ready in 5–7 business days/);
});

test('code review, 2026-11-16: cutouts do not count toward 50, a beanie is not a sign, the exam follows the rule', () => {
  assert.strictEqual(RUSH.rushKind([{ product: false, qty: 50, titles: ['Big Head Cutout — 18in single'] }]), '', '50 cutouts are not 50 garments');
  assert.match(src, /function rushSignOf\(prod\) \{[\s\S]*?\/\^ssa\/\.test\(String\(prod\.supplier \|\| ''\)\) \|\| !SIZED_BY_NAME_RE\.test/);
  assert.match(src, /var RUSH_SIGN = \$\{JSON\.stringify\(Object\.fromEntries\(\(catalog\.products \|\| \[\]\)\s+\.map\(\(p\) => \[String\(p\.id\), rushSignOf\(p\)\]\)/);
  assert.match(src, /if \(\/\^\(method\|pr_m_\|qty\[0-9\]\|product\[0-9\]\)\/\.test\(n\)\) rushSync\(true\);/, 'a product change re-checks the rush');
  assert.match(src, /const examDate = exam \? SHOPDAYS\.shopDateAfter\(exam\.businessDays, new Date\(\), CUTOFF_MIN, SHOP_TZ\) : '';/);
  assert.match(src, /expected: SHOPDAYS\.shopDateAfter\(sc\.businessDays, new Date\(\), CUTOFF_MIN, SHOP_TZ\) \}\);/);
  const QEXAM = require('../tools/lib/quote-exam');
  for (const id of ['cutouts-rush', 'cutouts-singles']) {
    const sc = QEXAM.SCENARIOS ? QEXAM.SCENARIOS.find((x) => x.id === id) : null;
    if (sc) assert.strictEqual(sc.expect.rush, true, id);
  }
  const D = require('../tools/lib/shop-days');
  const at = new Date('2026-11-25T15:30:00-06:00');
  const d = D.shopDateAfter(2, at, 900, 'America/Chicago');
  assert.strictEqual(D.shopDaysUntil(d, at, 900, 'America/Chicago'), 2, 'the exam date counts as its own days, after 3pm too');
});
