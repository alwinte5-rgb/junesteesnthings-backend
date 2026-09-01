'use strict';

/* THE BUG THIS GUARDS
 * -------------------
 * `lineHtml(n, it)` builds one quote line and ends at server.js:4212. The page
 * template that starts at 4214 is a different template literal and has no `n`.
 * A checkbox name was written there as
 *
 *     '... name="addon_' + a.code + '${n}" value="1" ...'
 *
 * which looks like client-side string concatenation but is not: the `${n}` sits
 * inside a server-side template literal, so the SERVER evaluates it, against a
 * scope with no `n`. Every render of /quote/new and /quote/:code/edit threw
 * `ReferenceError: n is not defined` as an unhandled rejection — the admin quote
 * builder was down for about three hours after #46 before anyone opened it.
 *
 * The fix is to concatenate the value at runtime instead of interpolating it at
 * render time, reading the index off the `.line` element the server already
 * stamped it onto: `+ L.dataset.n +`.
 *
 * WHY THERE IS NO GENERIC SCAN HERE
 * ---------------------------------
 * The obvious guard — flag any `${` inside a single-quoted string — cannot be
 * done with a regex over lines. Most lines of a multi-line template literal
 * contain no backtick of their own, so `style="color:${x}"` inside one is
 * indistinguishable from the bug by line-local inspection. A first draft of this
 * file flagged 44 healthy lines. Catching the class properly needs a tokenizer
 * that tracks template-literal depth; until someone writes that, this file pins
 * the one invariant that actually broke.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const lines = fs.readFileSync(SERVER, 'utf8').split('\n');

/* Assert against the ONE line, never the whole file: assert.match prints the
   subject on failure, and server.js is half a megabyte. A failure nobody can
   read is a failure nobody acts on. Anchored on `name="addon_`, which is the
   shortest text unique to this control and survives the code being rewritten
   around it. */
function lineContaining(needle) {
  const hits = lines
    .map((text, i) => ({ n: i + 1, text: text.trim() }))
    .filter((l) => l.text.includes(needle));
  assert.strictEqual(hits.length, 1,
    'expected exactly one line containing ' + JSON.stringify(needle) +
    ', found ' + hits.length + '. Update this test to match the new shape.');
  return hits[0];
}

test('the addon checkbox name carries the line index at runtime, not at render time', () => {
  const l = lineContaining('name="addon_');

  assert.match(l.text, /\+ a\.code \+ L\.dataset\.n \+ '"/,
    'server.js:' + l.n + ' — the add-on checkbox name must append L.dataset.n ' +
    'by concatenation. Written as \'${n}\' the server tries to interpolate a ' +
    'variable that is not in scope in that template, and every quote-builder ' +
    'render throws ReferenceError.\n  ' + l.text);

  assert.doesNotMatch(l.text, /'\$\{/,
    'server.js:' + l.n + ' — a ${...} in a single-quoted string here is ' +
    'evaluated by the server, not the browser.\n  ' + l.text);
});

test('the posted field name still matches what the browser renders', () => {
  /* The handler reads addon_<code><index> off the body. If either side is
     renamed alone, add-ons post against the wrong line and apply silently to
     the wrong item — a wrong price with no error anywhere. */
  const l = lineContaining('addon_${a.code}${i}');
  assert.ok(l.n > 0, 'the POST handler must still read addon_<code><index>');
});

test('the line element still carries the index the checkbox reads', () => {
  const l = lineContaining('class="line" data-n=');
  assert.match(l.text, /data-n="\$\{n\}"/,
    'server.js:' + l.n + ' — L.dataset.n is read off this attribute. Renaming ' +
    'it breaks the checkbox name silently: dataset.n becomes undefined and ' +
    'every add-on posts as "addon_codeundefined".\n  ' + l.text);
});

/* The generic scan this file's header rejects is unnecessary for one whole class
 * of the same bug: anything that ends the template literal early makes server.js
 * stop parsing. A stray backtick in a comment inside the quote-page template did
 * exactly that while this feature was being written — the file failed to parse
 * at a line 900 further down, which reads as an unrelated error.
 *
 * `node --check` is the tokenizer the header says would be needed. Running it
 * here means a broken template literal fails the suite rather than the deploy.
 */
test('server.js parses', () => {
  const { spawnSync } = require('node:child_process');
  const r = spawnSync(process.execPath, ['--check', SERVER], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0,
    'server.js does not parse. A backtick or ${...} inside the client-side ' +
    'script of a server-side template literal will end it early, and the error ' +
    'is reported far from the real cause:\n' + (r.stderr || ''));
});

/* ── The screens row ─────────────────────────────────────────────────────── */

test('the totals SPLIT the subtotal for screens rather than adding to it', () => {
  const src = fs.readFileSync(SERVER, 'utf8');

  /* Screens are already inside every line total, so the screens row has to come
     OUT of the subtotal. A row that also added would overstate the job by its
     own value — $140 on a 4-screen job — and it would be the customer-facing
     number that was wrong. */
  /* Rush is subtracted here too, for a different reason: it ADDS to the
     subtotal from its own row, so leaving it in `goods` would double-count it
     and the three rows would stop adding up to the subtotal they explain. */
  assert.match(src, /getElementById\('goods'\)\.textContent =\s*\n?\s*m2\(Math\.round\(\(sub - scrTotal - rushFee\)/,
    'the garments-and-printing row must be sub MINUS screens and MINUS rush');

  assert.match(src, /id="goods"/, 'the split needs a goods row');
  assert.match(src, /id="scr"/, 'the split needs a screens row');
  assert.match(src, /class="scrsplit"/, 'both split rows must be hideable together');
});

test('the screens count is read, never divided back out', () => {
  const src = fs.readFileSync(SERVER, 'utf8');
  assert.match(src, /scrCount \+= \(a\.count \|\| 0\)/,
    'the count comes from the addon line, which carries it precisely so no ' +
    'surface has to divide a total by a rate — that division silently lies ' +
    'the moment the rate changes between quoting and rendering');
});
