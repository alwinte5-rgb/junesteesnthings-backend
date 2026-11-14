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

test('an order is rushable only when every required decorated line is DTF or embroidery', () => {
  const dtf = { product: true, titles: ['DTF Printing'] };
  assert.strictEqual(RUSH.rushAllowed([dtf]), true);
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: ['DTF Printing', 'DTF Printing'] }]), true);
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: ['Embroidery'] }]), true, 'embroidery (owner, 2026-11-14)');
  for (const other of ['Screen Printing', 'Big Head Cutout — 24in, 8-pack (full sheet)', 'Puff print', '']) {
    assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: [other] }]), false, other || 'unknown method');
  }
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: true, titles: [] }]), false, 'a garment with no method');
  assert.strictEqual(RUSH.rushAllowed([dtf, { product: false, titles: [] }]), true, 'a hand-typed fee line is ignored');
  assert.strictEqual(RUSH.rushAllowed([]), false);
});

test('the save makes a helper\'s rush 0 unless the order is rushable; the owner\'s figure is kept', () => {
  const at = src.indexOf('const rushOk = RUSH.rushAllowed(rushLines);');
  assert.ok(at > 0);
  assert.match(src.slice(src.lastIndexOf('const rushLines = ', at), at), /qty: parseInt\(it\.qty, 10\) \|\| 0,/, 'the lines carry their pieces for the 50+ rule');
  const lock = src.slice(at, src.indexOf('const rush = round2(subtotal * rushPct / 100);', at));
  assert.match(lock, /const rushSlow = RUSH\.slowOrder\(rushLines\);/);
  assert.match(lock, /: \(wantDate && rushOk \? rushPctFor\(wantDate, undefined, rushSlow\) : 0\);/);
  assert.match(lock, /if \(who\.kind === 'staff' && STAFF\.levelOf\(who, 'quotes\.price'\) !== 'on'\)/, 'only for helpers');
});

test('the form suggests rush only when every picked decoration is DTF or embroidery, and says why not', () => {
  /* The pattern is handed over as a string: a regex literal inside the page
     template loses its backslashes (\b became a backspace and nothing matched). */
  assert.match(src, /var rushable = new RegExp\(\$\{JSON\.stringify\(RUSH\.RUSHABLE\.source\)\}, 'i'\);/);
  assert.match(src, /var dtfOnly = real\.length > 0 && real\.every\(function \(i\) \{\s+return lines\[i\]\.titles\.length > 0 && lines\[i\]\.titles\.every/);
  // What the browser receives: the JSON-encoded source, rebuilt, still matches DTF and embroidery only.
  const sent = new RegExp(JSON.parse(JSON.stringify(RUSH.RUSHABLE.source)), 'i');
  assert.ok(sent.test('DTF Transfer') && sent.test('Embroidery') && !sent.test('Screen Printing') && !sent.test('ADTFX'));
  assert.match(src, /\$\{RUSH\.rushFor\.toString\(\)\}/, 'the form runs the save\'s own rule');
  assert.match(src, /var r = rushFor\(days, RUSH_TIERS, slow, RUSH_RULE\);\s+var pct = dtfOnly \? r\.pct : 0;/);
  assert.match(src, /only DTF and embroidery can be rushed: ask June about the date/);
  assert.match(src, /too soon: no same-day or next-day orders/);
  assert.match(src, /if \(\/\^\(method\|pr_m_\|qty\[0-9\]\)\/\.test\(n\)\) rushSync\(true\);/, 'a quantity change re-checks the 50+ rule');
});

test('a helper keeps a saved rush only while the order stays slow or not slow, and cannot quote a too-soon date (code review)', () => {
  const at = src.indexOf('const wasSlow = was ? RUSH.slowOrder(wasLines) : false;');
  assert.ok(at > 0, 'the saved order is checked for embroidery or 50+ pieces');
  const tail = src.slice(at, src.indexOf('const rush = round2(subtotal * rushPct / 100);', at));
  assert.match(tail, /&& rushSlow === wasSlow\)/);
  assert.match(tail, /RUSH\.rushFor\(businessDaysUntil\(wantDate\), RUSH_TIERS, rushSlow, RUSH_RULE\)\.tooSoon/);
  assert.match(tail, /return res\.status\(400\)\.send\(quotePage\('That date is too soon'/);
  assert.match(src, /data-was-slow="\$\{\(\(\) => \{/, 'the form knows it too');
  assert.match(src, /\(box\.dataset\.wasSlow === undefined \|\| \(box\.dataset\.wasSlow === '1'\) === slow\)/);
});

test('the live chat turnaround reply updates from 5–7 to 5–10 (code review)', () => {
  const at = src.indexOf("shortcut: 'turnaround', title: 'How long will my order take?'");
  const entry = src.slice(at, src.indexOf("shortcut: 'deposit'", at));
  assert.match(entry, /body: `Thanks for asking! Small orders are ready in 5–10 business days/);
  assert.match(entry, /was: \[`Thanks for asking! Small orders are ready in 5–7 business days/);
});
