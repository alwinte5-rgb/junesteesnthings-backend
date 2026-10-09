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
