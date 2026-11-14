'use strict';

/* The "Needed by" box on the quote edit page (owner, 2026-11-09).
 *
 * needed_by is a DATE column and node-pg hands it back as a Date. The form
 * wrote String(date).slice(0,10), which is "Sat Nov 14", and a date box cannot
 * read that, so it showed empty. An empty date hides the rush row and empties
 * the rush box, so editing a quote (a customer who now needs 5, not 6) and
 * saving wiped both its date and its rush fee.
 *
 * Run: node --test tests/needed-by-date.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(sig) {
  const at = src.indexOf(sig);
  assert.notStrictEqual(at, -1, sig);
  let depth = 0;
  for (let j = src.indexOf('{', src.indexOf(')', at)); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(at, j + 1);
  }
  throw new Error('unbalanced ' + sig);
}

globalThis.DELIV = require('../tools/lib/delivery');
vm.runInThisContext(lift('function pgDateYmd(') + '\nglobalThis.__pgDateYmd = pgDateYmd;');
const pgDateYmd = globalThis.__pgDateYmd;

test('a DATE from the database becomes the YYYY-MM-DD a date box reads', () => {
  const fromPg = new Date(2026, 10, 14);           // how node-pg builds DATE '2026-11-14'
  assert.match(String(fromPg).slice(0, 10), /^[A-Z][a-z]{2} /, 'the old way: "Sat Nov 14", which a date box cannot read');
  assert.strictEqual(pgDateYmd(fromPg), '2026-11-14');
  assert.strictEqual(pgDateYmd('2026-11-14'), '2026-11-14', 'text from ::text stays as it is');
  assert.strictEqual(pgDateYmd(null), null);
  assert.strictEqual(pgDateYmd('Sat Nov 14'), null, 'anything else is no date, not a wrong one');
});

test('both needed-by boxes are filled through it', () => {
  const boxes = src.match(/<input[^>]*name="needed_by"[^>]*>/g) || [];
  assert.ok(boxes.length >= 2, 'the edit form and the customer page');
  for (const b of boxes) assert.ok(!/String\([^)]*needed_by\)\.slice/.test(b), b);
  assert.ok(src.includes('<input name="needed_by" type="date" value="${pgDateYmd(E.needed_by) || \'\'}"'), 'the edit form');
  assert.ok(src.includes('const saved = pgDateYmd(q.needed_by);'), 'the customer page');
});

/* The edit page's own rushSync, run against a fake page: what a helper and the
   owner see in the rush box once the saved date shows. */
function rushPage({ saved = '2026-11-20', value = saved, rush = '25', readOnly = true, dtf = true, wasRushable = '1' } = {}) {
  const at = src.indexOf('      function rushSync(fill) {');
  let body = src.slice(at, src.indexOf('\n      }\n', at) + 8);
  body = body.replace('${JSON.stringify(RUSH.RUSHABLE.source)}', JSON.stringify(require('../tools/lib/rush').RUSHABLE.source));
  body = body.replace('${JSON.stringify(RUSH.EMBROIDERY.source)}', JSON.stringify(require('../tools/lib/rush').EMBROIDERY.source));
  body = body.replace('${RUSH.LARGE_QTY}', String(require('../tools/lib/rush').LARGE_QTY));
  assert.ok(!body.includes('${'), 'only the one server value is filled in');
  const els = {
    rushrow: { style: {} }, rushwhy: { textContent: '' },
    rushpct: { value: rush, readOnly, dataset: { saved: rush, wasRushable } },
  };
  const date = { value, dataset: { saved } };
  const select = { name: 'method0', value: '7', selectedIndex: 0, options: [{ text: dtf ? 'DTF Printing' : 'Screen Printing' }] };
  const document = {
    querySelector: (q) => (q === '[name=needed_by]' ? date : null),
    getElementById: (id) => els[id] || null,
    querySelectorAll: () => [select],
  };
  const fn = new Function('document', 'RUSH_TIERS', 'rushFor', 'rushDaysUntil', 'calc',
    body + '\nreturn rushSync;')(document, [], () => ({ pct: 50, tooSoon: false }), (v) => (v ? 2 : null), () => {});
  return { fn, box: els.rushpct, date };
}

test("a helper's rush box shows the rush that will be saved, not the ladder's", () => {
  const p = rushPage();
  p.fn(true);                                         // they changed a decoration
  assert.strictEqual(p.box.value, '25', "the owner's 25% stays while the date is the same, as the save keeps it");
  p.date.value = '2026-11-12'; p.fn(true);
  assert.strictEqual(p.box.value, '50', 'a new date: the ladder');
  const offDtf = rushPage({ dtf: false }); offDtf.fn(true);
  assert.strictEqual(offDtf.box.value, '', 'taken off DTF: no rush, as the save does');
  const neverRushable = rushPage({ dtf: false, wasRushable: '' }); neverRushable.fn(true);
  assert.strictEqual(neverRushable.box.value, '25', "an owner's rush on a job that was never DTF stays");
});

test("the owner's rush box keeps what is typed", () => {
  const p = rushPage({ readOnly: false });
  p.fn(false); p.fn(true);
  assert.strictEqual(p.box.value, '25');
  const empty = rushPage({ readOnly: false, value: '' }); empty.fn(false);
  assert.strictEqual(empty.box.value, '', 'no date: the box is emptied, which is why the date has to show');
});

test('a DATE read back as text matches what the box posts, so the save sees the same date', () => {
  /* The save compares the posted date with needed_by::text; the box is filled
     with pgDateYmd(the DATE). Same day, same string. */
  assert.strictEqual(pgDateYmd(new Date(2026, 10, 20)), '2026-11-20');
  assert.ok(src.includes("SELECT rush_pct, needed_by::text AS needed_by, items FROM quotes WHERE code = $1"));
});

test('other DATE boxes and the export read the day as stored, never via UTC', () => {
  assert.ok(src.includes('name="target_date" type="date" value="${pgDateYmd(q.target_date) || \'\'}"'));
  assert.ok(src.includes("pgDateYmd(q.needed_by) || ''];"), 'the quotes export');
});

test('the customer page shows a saved date only while it is still ahead', () => {
  assert.ok(src.includes('value="${saved && saved >= today ? saved : \'\'}"'));
});

test('a save that changes the total closes the card page made for the old one', () => {
  /* A customer who opened Pay before the edit could still pay the old amount
     (owner, 2026-11-09: "will his balance update"). */
  const at = src.indexOf("const { rows: [before] } = await pool.query('SELECT total, stripe_session FROM quotes WHERE code=$1', [editing]);");
  assert.ok(at > 0, 'the old total and card page are read before the save');
  const after = src.slice(at, at + 6000);
  assert.match(after, /round2\(Number\(before\.total\) \|\| 0\) !== round2\(Number\(rows\[0\]\.total\) \|\| 0\)\) \{\s*await dropQuoteCheckout\(editing, before\.stripe_session\)/);
});
