'use strict';

/* The quote exam (tools/lib/quote-exam.js and its routes in server.js): the
 * grader passes the owner's quote and names what is off in a wrong one, and a
 * practice quote is marked before anything is written, so it never becomes a
 * quote.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const QEXAM = require('../tools/lib/quote-exam');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

const CATALOG = {
  products: [{ id: 12, name: 'Gildan 5000 Unisex Heavy Cotton Tee' }, { id: 21, name: 'Gildan 18500 Unisex Heavy Blend Hoodie' },
    { id: 40, name: 'Port Authority K500 Silk Touch Polo' }, { id: 41, name: 'Richardson 112 Trucker Cap' }],
  methods: [{ id: 1, title: 'DTF Printing' }, { id: 2, title: 'Screen Printing' }, { id: 5, title: 'Embroidery' },
    { id: 31, title: 'Big Head Cutout — 24in, 8-pack (full sheet)' }, { id: 34, title: 'Big Head Cutout — 18in, singles' }],
};

test('every scenario is well formed, unique, and free of customer details', () => {
  const ids = QEXAM.SCENARIOS.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(QEXAM.SCENARIOS.length >= 10, 'enough scenarios for an 80% pass to mean something');
  assert.strictEqual(QEXAM.passMark(), Math.ceil(QEXAM.SCENARIOS.length * 0.8));
  for (const s of QEXAM.SCENARIOS) {
    assert.ok(s.title && s.brief && s.why && s.businessDays > 0, s.id);
    assert.ok(['dtf', 'screen', 'embroidery', 'cutout'].includes(s.expect.line.method), s.id);
    assert.doesNotMatch(s.brief, /@|\d{3}[\s.-]\d{3}[\s.-]\d{4}/, `${s.id}: no email or phone in a brief`);
    assert.strictEqual(s.expect.rush, s.businessDays <= 3, `${s.id}: rush follows the date`);
  }
  assert.ok(QEXAM.SCENARIOS.filter((s) => s.real).length >= 4, 'the newest real quotes are in it');
});

test('the owner\'s quote passes; a wrong method, quantity, place or date fails and says which', () => {
  const sc = QEXAM.byId('hoodies-dtf');
  const right = [{ product_id: 21, qty: 3, size_mix: { M: 2, L: 1 }, prints: [{ loc: 'front', method_id: 1 }, { loc: 'back', method_id: 1 }] }];
  assert.strictEqual(QEXAM.grade(sc, right, 0, CATALOG).passed, true);
  const off = (items, rush = 0) => QEXAM.grade(sc, items, rush, CATALOG).checks.filter((c) => !c.ok).map((c) => c.what);
  assert.deepStrictEqual(off([{ ...right[0], prints: [{ loc: 'front', method_id: 2 }, { loc: 'back', method_id: 2 }] }]), ['Decoration', 'Same decoration in every place']);
  assert.deepStrictEqual(off([{ ...right[0], size_mix: { M: 3 } }]), ['Size mix']);
  assert.deepStrictEqual(off([{ ...right[0], prints: [{ loc: 'front', method_id: 1 }] }]), ['Print places']);
  assert.deepStrictEqual(off(right, 50), ['Rush']);
  assert.deepStrictEqual(off([{ ...right[0], product_id: 12 }]), ['Product']);
  assert.deepStrictEqual(off([...right, { ...right[0] }]), ['Number of items']);
  // An optional extra line is not marked against them.
  assert.strictEqual(QEXAM.grade(sc, [...right, { ...right[0], optional: true }], 0, CATALOG).passed, true);
});

test('cutouts are marked by size and pack; ink colours by place, from the line or the method title', () => {
  const pack = QEXAM.byId('cutouts-rush');
  assert.strictEqual(QEXAM.grade(pack, [{ qty: 1, method_id: 31 }], 30, CATALOG).passed, true);
  assert.strictEqual(QEXAM.grade(pack, [{ qty: 8, method_id: 34 }], 30, CATALOG).passed, false, 'eight singles is not the pack');
  const two = QEXAM.byId('tees-screen-two-places');
  const line = { product_id: 12, size_mix: { S: 20, M: 20, L: 20 }, prints: [{ loc: 'front', method_id: 2, colours: 2 }, { loc: 'back', method_id: 2, colours: 1 }] };
  assert.strictEqual(QEXAM.grade(two, [line], 0, CATALOG).passed, true);
  const swapped = { ...line, prints: [{ loc: 'front', method_id: 2, colours: 1 }, { loc: 'back', method_id: 2, colours: 2 }] };
  assert.deepStrictEqual(QEXAM.grade(two, [swapped], 0, CATALOG).checks.filter((c) => !c.ok).map((c) => c.what), ['Ink colours (front)', 'Ink colours (back)']);
  const legacy = { methods: [...CATALOG.methods, { id: 7, title: 'Screen Print - 2 Colors' }, { id: 8, title: 'Screen Print - 1 Color' }], products: CATALOG.products };
  assert.strictEqual(QEXAM.grade(two, [{ ...line, prints: [{ loc: 'front', method_id: 7, colours: null }, { loc: 'back', method_id: 8, colours: null }] }], 0, legacy).passed, true);
});

test('a practice quote is marked before anything is written, and never on an existing quote', () => {
  const save = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  const branch = save.indexOf('if (String(one(b.exam_scenario)');
  assert.ok(branch > 0);
  for (const write of ['INSERT INTO quotes', 'UPDATE quotes SET name=', 'syncQuoteToBrevo', 'logActivity(actor, \'quote sent\'']) {
    const at = save.indexOf(write);
    if (at !== -1) assert.ok(branch < at, `the exam branch runs before ${write}`);
  }
  assert.match(save.slice(branch, branch + 400), /String\(req\.params\.code \|\| ''\)\) return back/, 'never on an edit');
  const fin = src.slice(src.indexOf('async function finishExamAttempt('), src.indexOf('\n}\n', src.indexOf('async function finishExamAttempt(')));
  assert.match(fin, /if \(!\(await examOpenFor\(actor\)\)\) return back/);
  assert.match(fin, /INSERT INTO staff_exam_attempts/);
  assert.doesNotMatch(fin, /INSERT INTO quotes|UPDATE quotes/);
});

test('exam routes: anyone signed in, a helper only their own attempts and only once the module is open', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/training/exam/:key'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/api/quotes|/admin/api/quotes/:code'], 'quotes.draft');
  const page = route("app.get('/admin/training/exam/:key', requireAdmin");
  assert.match(page, /: actor\.id;/, 'a helper sees only their own attempts');
  assert.match(page, /if \(!owner && !\(await examOpenFor\(actor\)\)\) return back/);
  assert.match(page, /\$\{owner \? `<p style="margin:0 0 6px"><b>Answer:<\/b>/, 'only the owner sees the answers up front');
  const form = route("app.get(['/admin/quote/new', '/admin/quote/:code/edit'], requireAdmin");
  assert.match(form, /const exam = !isEdit \? QEXAM\.byId/);
  assert.match(form, /if \(exam && !\(await examOpenFor\(currentActor\(\) \|\| OWNER_ACTOR\)\)\)/);
  assert.match(form, /const canDraft = \(!isEdit \|\| isDraft\) && !exam;/);
  assert.match(src, /DELETE FROM staff_exam_attempts WHERE staff_id = \$1/, 'restarting training clears exam attempts');
});
