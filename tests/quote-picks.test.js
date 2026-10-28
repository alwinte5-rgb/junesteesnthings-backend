'use strict';

/* What the customer needs, ticked on the quote form (owner, 2026-10-20).
 * Run: node --test tests/*.test.js */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const QP = require('../tools/lib/quote-picks');

const ROOT = path.join(__dirname, '..');
const JS = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'js', 'quote-form.js'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

test('the browser\'s list is the server\'s list, key for key and word for word', () => {
  const block = JS.slice(JS.indexOf('var PICKS = ['), JS.indexOf('];', JS.indexOf('var PICKS = [')) + 1);
  const browser = [...block.matchAll(/\['([a-z_]+)', '([^']+)'\]/g)].map((m) => ({ key: m[1], label: m[2] }));
  assert.deepStrictEqual(browser, QP.PICKS);
  assert.ok(QP.PICKS.length <= 12, 'a dozen at most');
});

test('only known items are read, in list order, with sane quantities', () => {
  const got = QP.parsePicks({
    pick_drinkware: '1', pick_drinkware_qty: '24',
    pick_stickers: 'on', pick_stickers_qty: '1,500',
    pick_signs: '1', pick_signs_qty: '-3',
    pick_other: '1', pick_other_qty: '999999999',
    pick_hacker: '1', pick_hacker_qty: '5',
    pick_brochure: '0', pick_brochure_qty: '100',
  });
  assert.deepStrictEqual(got.map((p) => [p.key, p.qty]),
    [['signs', null], ['drinkware', 24], ['stickers', 1500], ['other', null]]);
  assert.deepStrictEqual(QP.parsePicks(null), []);
  assert.deepStrictEqual(QP.parsePicks({ pick_stickers: ['1', '1'] }).length, 0, 'an array is not a tick');
});

test('the picks read as one plain line', () => {
  assert.strictEqual(QP.picksLine([]), '');
  assert.strictEqual(QP.picksLine(QP.parsePicks({ pick_stickers: '1', pick_stickers_qty: '1500', pick_drinkware: '1' })),
    'Items: Mugs & tumblers, Roll labels (1,500)');
});

test('/submit puts the picks first in the description, inside the length the form allows', () => {
  const at = SRC.indexOf("app.post('/submit',");
  const route = SRC.slice(at, at + 4000);
  assert.match(route, /const picks = QPICKS\.parsePicks\(req\.body\);/);
  assert.match(route, /const fullDescription = \[rush, QPICKS\.picksLine\(picks\), typed\]\.filter\(Boolean\)\.join\('\\n\\n'\);/);
  assert.match(route, /description: fullDescription/);
  /* The typed text is still capped at 2,000 before the picks are added; the
     picks line is at most the eleven labels and quantities. */
  assert.ok(route.indexOf("String(description).length > 2000") < route.indexOf('const picks ='));
  assert.ok(QP.picksLine(QP.PICKS.map((p) => ({ ...p, qty: QP.MAX_QTY }))).length < 400);
});

test('the form draws the boxes before the description, and ticking one makes the words optional', () => {
  assert.match(JS, /anchor\.parentNode\.insertBefore\(box, anchor\)/);
  assert.match(JS, /if \(desc\) desc\.required = !PICKS\.some/);
  assert.match(JS, /descField\.required && !descField\.value\.trim\(\) && !\(picks && picks\.any\(\)\)/);
  assert.match(JS, /closest\('\[data-jt-pick\]'\)/, 'a product page can tick its own item');
  assert.match(JS, /get\('pick'\)/, 'and so can ?pick=');
  /* Nothing from the page goes into the markup: the item comes in only as a
     form-element name lookup. */
  assert.doesNotMatch(JS.slice(JS.indexOf('function picker('), JS.indexOf('function wire(')), /innerHTML = [^;]*want/);
});

test('a picker that cannot be drawn never stops the form working', () => {
  assert.match(JS, /try \{ picks = picker\(form\); \} catch \(e\) \{ picks = null; \}/);
  assert.match(JS, /if \(!anchor \|\| !anchor\.parentNode \|\|/);
});

/* "Need it sooner?" (owner, 2026-10-28). */
test('a ticked rush box leads the enquiry with a RUSH line, with the date when it is real', () => {
  const now = new Date('2026-10-28T15:00:00Z');
  assert.strictEqual(QP.parseRush({}, now), null);
  assert.strictEqual(QP.rushLine(QP.parseRush({ rush_by: '2026-11-03' }, now)), '', 'a date without the box is not a rush');
  assert.deepStrictEqual(QP.parseRush({ rush_needed: '1', rush_by: '2026-11-03' }, now), { by: '2026-11-03' });
  assert.strictEqual(QP.rushLine(QP.parseRush({ rush_needed: '1', rush_by: '2026-11-03' }, now)),
    '⚡ RUSH: needs it in under 5 business days, by Tue, Nov 3, 2026 (rush fee applies)');
  assert.strictEqual(QP.rushLine(QP.parseRush({ rush_needed: 'on' }, now)),
    '⚡ RUSH: needs it in under 5 business days (rush fee applies)');
  for (const bad of ['2026-02-30', '2026-13-01', 'tomorrow', '2025-01-01', '2028-01-01', '<b>2026-11-03</b>', '2026-11-03T00:00']) {
    assert.deepStrictEqual(QP.parseRush({ rush_needed: '1', rush_by: bad }, now), { by: '' }, bad);
  }
  assert.doesNotMatch(QP.rushLine({ by: '' }), /\d+ ?%|\$/, 'no fee figure: the owner quotes it');
});

test('/submit puts the rush line before the picks and the typed message', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /const rush = QPICKS\.rushLine\(QPICKS\.parseRush\(req\.body\)\);\s*const fullDescription = \[rush, QPICKS\.picksLine\(picks\), typed\]/);
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'quote-form.js'), 'utf8');
  assert.match(js, /name="rush_needed" value="1"/);
  assert.match(js, /type="date" id="' \+ id \+ 'rushby" name="rush_by"/);
  assert.match(js, /Need it sooner\?<\/b> Under 5 business days\. Rush fee applies\./);
});
