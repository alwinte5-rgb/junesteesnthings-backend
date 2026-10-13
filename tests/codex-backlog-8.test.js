/* Codex backlog fixes, backend batch 8 (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TRAINING = require('../tools/lib/training');
const COURSES = require('../tools/lib/courses');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#204 three bare owner gaps in one article are three questions, each filled on its own', () => {
  const body = '- Minimum: [owner to fill in]\n- Colors: [owner to fill in] max\n- Works on: [owner to fill in]\nUnder [X] days, again [X].';
  const g = TRAINING.ownerGaps(body);
  assert.deepStrictEqual(g.filter((x) => x.token === '[owner to fill in]').map((x) => x.nth), [0, 1, 2]);
  assert.strictEqual(g.find((x) => x.nth === 1).line, '- Colors: [owner to fill in] max');
  const one = TRAINING.fillGap(body, '[owner to fill in]', '12 pieces', 0);
  assert.match(one, /Minimum: 12 pieces\n- Colors: \[owner to fill in\] max\n- Works on: \[owner to fill in\]/);
  assert.strictEqual(TRAINING.fillGap(body, '[owner to fill in]', 'x', 3), null, 'no such copy');
  /* Every DEADLINE copy of "[X]"; any other "[X]" is a reply's blank (Codex #204). */
  assert.match(TRAINING.fillGap(body, '[X]', '5'), /Under 5 days, again \[X\]\./, 'a named gap fills every deadline copy');
  assert.match(TRAINING.fillGap('Under [X] days, or [X] business days.', '[X]', '5'), /Under 5 days, or 5 business days\./);
  const r = after("app.post('/admin/training/gap'", 1500);
  assert.match(r, /h\.line === String\(b\.line \|\| ''\)\.trim\(\)/, 'a renumbered gap cannot be filled from a stale form');
});

test('#222 the ready sign-off waits for the gate before it', () => {
  const r = after("app.post('/admin/training/signoff'", 4000);
  assert.ok(r.indexOf('TRAINING.stepOpen(await trainingFor(staffId), key)') > r.indexOf('if (b.undo)'), 'undo is always allowed');
  assert.ok(r.indexOf('TRAINING.stepOpen(') < r.indexOf('INSERT INTO staff_training (staff_id, step_key, signed_by)'));
  // Undo asks for a tick, keeps the commission window of "ready", and is logged.
  const undo = r.slice(r.indexOf('if (b.undo)'), r.indexOf('TRAINING.stepOpen('));
  assert.match(undo, /if \(String\(b\.confirm \|\| ''\) !== '1'\) return back/);
  assert.match(undo, /if \(key === TRAINING\.READY_KEY\)[\s\S]*'signoff:was-ready-until:'/);
  assert.match(undo, /log\('training sign-off undone'\)/);
  assert.match(r, /log\('training signed off'\)/);
  assert.match(src, /<input type="checkbox" name="confirm" value="1" required style="width:auto"> sure<\/label><button type="submit" class="btn btn-ghost">Undo<\/button>/);
  assert.match(src, /s\.locked \? '<button type="button" class="btn btn-ghost" disabled/);
});

test('#195 trainees see that a lesson is an unchecked draft', () => {
  assert.match(src, /!owner && a && a\.needs_review \? `<div class="warn">June has not checked this lesson yet/);
});

test('#195 rush is taught as embroidery only, and the saved lesson is updated', () => {
  const sales = COURSES.COURSES['sales-core'] || Object.values(COURSES.COURSES).find((c) => c.key === 'sales-core');
  const lessons = sales.modules.flatMap((m) => m.lessons);
  const l = lessons.find((x) => typeof x.body === 'string' && x.body.includes('Only **embroidery** can be rushed'));
  assert.ok(l && l.was && l.was.some((w) => w.includes('For a fee, depending on what is on the press:')));
});

test('#224 content helpers hand leads to a channel they can see', () => {
  const content = Object.values(COURSES.COURSES).find((c) => c.key === 'content-core');
  const text = JSON.stringify(content.modules.flatMap((m) => m.lessons.map((l) => [l.body, l.pages]))) + JSON.stringify(content.final || {});
  assert.ok(!/post it in # Sales|tell sales in # Sales|and the # Sales channel|in the # Sales channel, the same day/.test(text));
});

test('#160 the developer rubric verifies payments in test mode', () => {
  const dev = fs.readFileSync(path.join(__dirname, '..', 'tools/lib/hiring-developer.js'), 'utf8');
  assert.ok(!/make a real small payment|verifies a real payment works/.test(dev));
  assert.match(dev, /Stripe test-mode payment/);
});

test('#178 old no-base quotes keep their price on edit; cost and capacity always count the base', () => {
  assert.match(src, /legacyBaseQuote && it && !it\.garment_dark \? `<input type="hidden" name="nobase\$\{n\}"/);
  assert.match(src, /noBase: !!L\.querySelector\('input\.nb'\)/, 'the form preview prices it the same way');
  assert.match(src, /noBase: legacyBaseQuote && String\(one\(b\['nobase' \+ i\]\) \|\| ''\) === '1'/);
  assert.match(src, /garment_dark: !priceArgs\.noBase,/);
  assert.match(src, /created_at < '2026-10-07T05:00:00Z'::timestamptz AS old FROM quotes WHERE code = \$1/);
  assert.match(src, /var pass = screensPerPass\(pr\.c, false\);/);
  assert.ok(!/screensPerPass\([^)]*, nb\)/.test(src), 'no capacity check skips the base');
  const jc = fs.readFileSync(path.join(__dirname, '..', 'tools/lib/job-costs.js'), 'utf8');
  assert.match(jc, /placesCost\(places, bandQty, decoSellEach, true\)/);
});

test('#179 / #221 lead-email fields are fixed; design-lead drift is reported and an unsaved lead says so', () => {
  assert.match(after("app.post('/admin/lead/:id/email'", 600), /\['subject', 'body', 'back'\]\.includes\(k\)/);
  const d = after("app.post('/api/design-lead'", 5000);
  assert.match(d, /reportError\('design-lead:unknown-fields'/);
  assert.match(d, /savedId \? '' : 'NOT SAVED: '/);
});
