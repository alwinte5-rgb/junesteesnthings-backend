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
    pick_calendar: 'on', pick_calendar_qty: '1,500',
    pick_signs: '1', pick_signs_qty: '-3',
    pick_other: '1', pick_other_qty: '999999999',
    pick_hacker: '1', pick_hacker_qty: '5',
    pick_brochure: '0', pick_brochure_qty: '100',
  });
  assert.deepStrictEqual(got.map((p) => [p.key, p.qty]),
    [['signs', null], ['calendar', 1500], ['drinkware', 24], ['other', null]]);
  assert.deepStrictEqual(QP.parsePicks(null), []);
  assert.deepStrictEqual(QP.parsePicks({ pick_calendar: ['1', '1'] }).length, 0, 'an array is not a tick');
});

test('the picks read as one plain line', () => {
  assert.strictEqual(QP.picksLine([]), '');
  assert.strictEqual(QP.picksLine(QP.parsePicks({ pick_calendar: '1', pick_calendar_qty: '1500', pick_drinkware: '1' })),
    'Items: Wall calendars (1,500), Mugs & tumblers');
});

test('/submit puts the picks first in the description, inside the length the form allows', () => {
  const at = SRC.indexOf("app.post('/submit',");
  const route = SRC.slice(at, at + 4000);
  assert.match(route, /const picks = QPICKS\.parsePicks\(req\.body\);/);
  assert.match(route, /const fullDescription = \[QPICKS\.picksLine\(picks\), typed\]\.filter\(Boolean\)\.join\('\\n\\n'\);/);
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
