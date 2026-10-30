'use strict';

/* A design sent from design.jtees.net is a lead (server.js /api/design-lead).
 *
 * Run: node --test tests/*.test.js
 *
 * The designer had taken no real order since card payments went live, while
 * quotes are what sell (2026-10-09). "Email me this design + price" hands the
 * design to the team as a lead on the leads page, with its preview and a link
 * that reopens it. Only the designer may call this route.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const at = src.indexOf("app.post('/api/design-lead'");
assert.notStrictEqual(at, -1, '/api/design-lead not found in server.js');
const route = src.slice(at, src.indexOf('\n});', at));

test('only the designer can call it, and one recipient cannot flood it', () => {
  assert.match(route, /app\.post\('\/api\/design-lead', requireInternalKey, capPerRecipient\('design-lead', 6\)/);
});

test('it needs a name and a way back, and checks both', () => {
  assert.match(route, /if \(!name \|\| \(!email && !phone\)\) return res\.status\(400\)/);
  assert.match(route, /if \(email && !isValidEmail\(email\)\) return res\.status\(400\)/);
  assert.match(route, /if \(b\.phone && phone\.length !== 10\) return res\.status\(400\)/);
});

test('the preview and reopen link must be the designer’s own URLs', () => {
  assert.match(route, /!designerUrlOk\(designUrl\)/);
  const fn = src.slice(src.indexOf('function designerUrlOk('), src.indexOf("app.post('/api/design-lead'"));
  assert.match(fn, /startsWith\(DESIGNER_BASE \+ '\/'\)/);
  assert.match(fn, /!\/\[\\s"'<>\]\/\.test\(v\)/, 'no quotes or brackets that could break out of an attribute');
});

test('saved to submissions as source designer before any email, and a second click is one lead', () => {
  const insertAt = route.indexOf('INSERT INTO submissions');
  assert.ok(insertAt !== -1 && insertAt < route.indexOf('await sendEmail('));
  assert.match(route, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,'designer'\)/);
  assert.match(route, /ON CONFLICT \(dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/);
  assert.match(route, /if \(!rows\.length\) return res\.json\(\{ ok: true, duplicate: true \}\)/);
});

test('a saved lead survives a failed shop email; an unsaved one does not pretend', () => {
  assert.match(route, /reportError\('design-lead:notify-shop', err\)/);
  assert.match(route, /if \(!savedId\) throw err;/);
});

test('it reaches Brevo and the staff leads page shows it with the design', () => {
  assert.match(route, /syncToBrevo\(\{ name, email, phone \}\)/);
  assert.match(src, /designer:\s+\['Designer', 'blue'\]/);
  assert.match(src, /const SOURCES = \['all', 'form', 'designer'/);
  assert.match(src, /'design_url TEXT'\]\) \{/);
  assert.match(src, /l\.source === 'designer' && l\.design_url \?/);
});

test('every customer value in the email HTML is escaped (subjects are plain text)', () => {
  /* The stored description (escaped by the leads card when shown) and the plain-text subjects are not HTML. */
  const d0 = route.indexOf('const description = ['), d1 = route.indexOf('.join(', d0);
  const html = (route.slice(0, d0) + route.slice(d1)).split('\n').filter((l) => !/subject:/.test(l)).join('\n')
    .replace(/\$\{escEmail\([^)]*\)\}/g, '');
  for (const v of ['name', 'email', 'phone', 'product', 'note']) {
    assert.ok(!new RegExp('\\$\\{' + v + '\\}').test(html), `${v} is printed unescaped`);
  }
});

/* "Save my design" is only a save (designer #184): kind=save is listed as a
   saved design, waits for the daily summary, and tells the customer to finish
   it themselves. Anything else is the quote form, as before. */
test('a saved design is not treated as a quote request', () => {
  assert.match(src, /const DESIGN_LEAD_FIELDS = new Set\(\[[^\]]*'kind'\]\)/, 'kind is an expected field, not drift');
  assert.match(route, /const saved = b\.kind === 'save';/);
  assert.match(route, /saved \? 'DESIGN SAVED IN THE DESIGNER \(not a quote request\)' : 'DESIGN FROM THE DESIGNER'/);
  assert.match(route, /to: NOTIFY_EMAIL, urgent: !saved,/, 'a quote request is still urgent');
  assert.match(route, /\[saved \? 'design-save' : 'design', email, phone, designUrl, bucket\]/, 'a quote after a save of the same design is not its duplicate');
  assert.match(route, /saved \? 'Design saved in the designer' : 'New design from the designer'/);
  assert.match(route, /saved \? 'Open it any time to finish it and add it to your cart\.' : 'We’ll be in touch within 1 business day/);
});

/* A quote sent from checkout carries the cart (designer, 2026-10-30): the
   editor is blank there, so each saved line comes with its own preview and
   reopen link, and every one shows in the shop's email. */
test('a cart quote lists every line with its own preview and link', () => {
  assert.match(src, /const DESIGN_LEAD_FIELDS = new Set\(\[[^\]]*'lines', 'kind'\]\)/, 'lines is an expected field');
  assert.match(route, /const \{ lines, dropped \} = designLeadLines\(b\.lines\);/);
  const fnSrc = (name) => { const i = src.indexOf(`function ${name}(`); return src.slice(i, src.indexOf('\n}\n', i) + 3); };
  const DESIGNER_BASE = 'https://design.jtees.net';
  const reported = [];
  const a = src.indexOf('const leadTotal = '), z = src.indexOf("app.post('/api/design-lead'");
  /* The real escEmail and designerUrlOk from server.js, not stand-ins. */
  const lib = new Function('DESIGNER_BASE', 'reportError',
    fnSrc('escEmail') + fnSrc('designerUrlOk') + src.slice(a, z) + 'return { designLeadLines, designLeadLinesHtml };')(DESIGNER_BASE,
    (k, e) => { reported.push(k + ': ' + e.message); return Promise.resolve(); });
  const ok = (n) => ({ product: `Tee <${n}>`, total: 20, preview_url: `${DESIGNER_BASE}/data/shares/${n}.jpg`, design_url: `${DESIGNER_BASE}/editor.php?share=${n}` });
  assert.deepStrictEqual(lib.designLeadLines('nope'), { lines: [], dropped: 0 });
  const got = lib.designLeadLines([ok(1), { ...ok(2), preview_url: 'https://evil.example/x.jpg' }, ok(3)]);
  assert.strictEqual(got.lines.length, 2, 'a line with a foreign link is dropped, not the lead');
  assert.strictEqual(got.dropped, 1);
  assert.ok(reported.some((r) => /lines-dropped: 1 of 3/.test(r)), 'and the drop is reported');
  assert.strictEqual(lib.designLeadLines(Array.from({ length: 12 }, (_, i) => ok(i))).dropped, 4, 'at most 8 lines; the rest count as dropped');
  lib.designLeadLines([{ ...ok(4), preview: 'x' }]);
  assert.ok(reported.some((r) => /unknown-line-fields: preview/.test(r)), 'a renamed line field is reported as drift');
  const html = lib.designLeadLinesHtml(got.lines, got.dropped, false);
  assert.match(html, /2 designs in the cart/);
  assert.match(html, /shares\/1\.jpg/);
  assert.match(html, /shares\/3\.jpg/);
  assert.match(html, /1 more design from the cart could not be shown/, 'the shop is told a design is missing');
  assert.ok(!html.includes('<1>') && html.includes('Tee &lt;1&gt;'), 'product names are escaped by the real escEmail');
  const mine = lib.designLeadLinesHtml(got.lines, got.dropped, true);
  assert.match(mine, /Your 2 designs:/);
  assert.ok(!/could not be shown|in the cart/.test(mine), 'the customer gets their own wording');
  assert.match(lib.designLeadLinesHtml(got.lines.slice(0, 1), 0, false), /1 design in the cart/, 'one surviving line still shows as a line');
  assert.match(route, /const img = cartQuote \? designLeadLinesHtml\(lines, dropped, false\) : oneImg;/);
  assert.match(route, /cartQuote && `\$\{lines\.length\} design/, 'the cart links come before the summary in the stored description');
});
