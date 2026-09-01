'use strict';

/* No `${name}` in server.js may reference a name that does not exist.
 *
 * The quote builder was down for three hours from exactly this: a `${n}` inside
 * a single-quoted string, inside a server-side template literal. The quotes made
 * it look like client-side text, but a template literal interpolates regardless
 * of what is nested inside it, so the SERVER evaluated `${n}` against a scope
 * that had no `n` — ReferenceError, 500, every time that page was opened.
 *
 * This is a whole-file check rather than a scope-aware one, on purpose. A name
 * declared SOMEWHERE in server.js might still be out of scope at the point it is
 * interpolated, and this will not catch that. What it does catch with certainty
 * is a name declared nowhere at all, which is always a crash — and that is the
 * shape the outage took. Deliberately generous about what counts as declared, so
 * that a finding is a real defect rather than something to argue with: a suite
 * that cries wolf is a suite people stop reading. Issue #53.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/** Split a declarator list on its TOP-LEVEL commas, so
 *  `const W = 720, H = f(a, b), PL = 58` yields W, H and PL rather than
 *  stopping at the first name or being confused by the call's comma. */
function topLevelNames(list) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of list) {
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out
    .map((d) => (d.split('=')[0] || '').trim())
    .flatMap((d) => d.replace(/[[\]{}]/g, ' ').split(/[\s:]+/))
    .map((d) => d.replace(/[^\w$]/g, ''))
    .filter(Boolean);
}

function declaredNames() {
  const names = new Set([
    'process', 'console', 'JSON', 'Math', 'Date', 'Number', 'String', 'Boolean',
    'Object', 'Array', 'require', 'module', 'exports', '__dirname', 'Promise',
    'Set', 'Map', 'RegExp', 'Buffer', 'URL', 'undefined', 'NaN', 'Infinity',
  ]);

  /* Declarations, up to the end of the statement, split on top-level commas. */
  for (const m of src.matchAll(/\b(?:const|let|var)\s+([^;\n]+)/g)) {
    topLevelNames(m[1]).forEach((n) => names.add(n));
  }
  /* Every parameter list, named or anonymous, arrow or not. */
  for (const m of src.matchAll(/(?:function\s*[A-Za-z_$][\w$]*\s*|function\s*|)\(([^()]*)\)\s*(?:=>|\{)/g)) {
    topLevelNames(m[1]).forEach((n) => names.add(n));
  }
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*=>/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bfor\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  /* Object shorthand and property keys, which can shadow into template scope. */
  for (const m of src.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*[,:]/gm)) names.add(m[1]);
  return names;
}

test('every ${name} in server.js refers to a name that exists', () => {
  const names = declaredNames();
  const bad = [];
  for (const m of src.matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)) {
    if (names.has(m[1])) continue;
    const line = src.slice(0, m.index).split('\n').length;
    bad.push(`server.js:${line}  \${${m[1]}}  —  ${src.split('\n')[line - 1].trim().slice(0, 90)}`);
  }
  assert.deepStrictEqual(bad, [],
    'these interpolations reference names declared nowhere in the file:\n  ' + bad.join('\n  '));
});

test('the check can actually see a leak', () => {
  /* A test that cannot fail is decoration. This proves the detector fires on
     the exact shape the outage took — `${n}` quoted as though it were client
     text, with no `n` on the server. */
  const names = declaredNames();
  const planted = `onclick='doThing(\${nosuchname_xyz})'`;
  const found = [...planted.matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)]
    .filter((m) => !names.has(m[1]));
  assert.strictEqual(found.length, 1, 'the detector must catch a planted leak');
});

test('the parser understands a multi-declarator const', () => {
  /* `const W = 720, H = 210, PL = 58` declares three names. Reading only the
     first is what makes a scanner cry wolf, which is how it gets ignored. */
  assert.deepStrictEqual(topLevelNames('W = 720, H = 210, PL = 58'), ['W', 'H', 'PL']);
  assert.deepStrictEqual(topLevelNames('a = f(x, y), b = 2'), ['a', 'b'],
    'a comma inside a call is not a declarator boundary');
  assert.deepStrictEqual(topLevelNames('{ heading, intro }'), ['heading', 'intro']);
  assert.deepStrictEqual(topLevelNames('[label, bg, fg]'), ['label', 'bg', 'fg']);
});
