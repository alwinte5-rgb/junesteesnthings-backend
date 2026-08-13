/* Regression tests for how the Cloudinary API secret is resolved (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * The outage these exist to prevent, in full, because it has happened once and
 * the shape of it is what matters:
 *
 * The secret is stored on Railway under a misspelt name, CLUDINARY_API_SECRET.
 * server.js read both spellings, so it worked. PR #7 removed the misspelt one
 * as a tidy-up — the correctly-spelled variable had never been set, so signing
 * broke on deploy. `/api/cloudinary-signature` began answering 503 and every
 * photo upload silently stopped attaching, while the quote and review forms
 * carried on submitting and reporting success. Nothing failed loudly, no test
 * covered it, and it was found by curling production.
 *
 * So: the fallback is load-bearing until the Railway variable is renamed, and
 * these tests are what says so to whoever next tries to tidy it away. If you
 * are here because one of these failed, read the note at cloudinary.config()
 * in server.js before deleting anything.
 *
 * These lift the real expressions out of server.js rather than restating them,
 * so the tests cannot quietly drift from the code they are guarding. server.js
 * boots a listener and a DB pool on require, which is why it is not imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/**
 * Lift one `const NAME = ...;` statement, found by its opening text. Anchored
 * on the shortest text that is still unique in the file, NOT on the expression
 * itself — anchored on the expression, deleting the fallback would make the
 * anchor vanish and the suite would die with "not found" rather than failing
 * on what it asserts, which reports a rewrite instead of a regression.
 */
function extractConst(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  let depth = 0, tick = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '`' && src[i - 1] !== '\\') tick = !tick;
    else if (!tick && '([{'.includes(c)) depth++;
    else if (!tick && ')]}'.includes(c)) depth--;
    else if (!tick && c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated statement reading \`${anchor}\``);
}

/* The route's resolution, exactly as server.js writes it. */
const API_SECRET_SRC = extractConst('const apiSecret =');

/* The config block's, pulled out of the cloudinary.config({...}) call. */
const CONFIG_SECRET_SRC = (() => {
  const m = /api_secret:\s*([^\n]+?),?\n/.exec(
    src.slice(src.indexOf('cloudinary.config({')));
  assert.ok(m, 'api_secret not found in the cloudinary.config() call');
  return m[1].replace(/,\s*$/, '');
})();

/** Resolve a secret expression against a fabricated environment. */
function resolve(expr, env) {
  const sandbox = { process: { env } };
  vm.createContext(sandbox);
  return vm.runInContext(`(${expr})`, sandbox);
}

const VALUE = 'the-actual-cloudinary-api-secret';

/* Both places that resolve the secret, held to the same rule. They drifted
   apart once already — #7 changed both, but nothing would have caught it
   changing only one, and a config block that signs while the route 503s
   (or vice versa) is a genuinely confusing failure to debug. */
const SITES = [
  ['the /api/cloudinary-signature route', API_SECRET_SRC.replace(/^const apiSecret =\s*/, '').replace(/;$/, '')],
  ['the cloudinary.config() call', CONFIG_SECRET_SRC],
];

for (const [where, expr] of SITES) {
  test(`${where} accepts the correctly-spelled CLOUDINARY_API_SECRET`, () => {
    assert.strictEqual(resolve(expr, { CLOUDINARY_API_SECRET: VALUE }), VALUE);
  });

  test(`${where} still accepts the misspelt CLUDINARY_API_SECRET`, () => {
    /* The one the secret is actually stored under on Railway. Delete this
       fallback and signed uploads stop working in production — that is not a
       hypothetical, it is what #7 did. Rename the Railway variable first. */
    assert.strictEqual(resolve(expr, { CLUDINARY_API_SECRET: VALUE }), VALUE,
      'the misspelt fallback was removed — signed uploads will 503 in production');
  });

  test(`${where} prefers the correct spelling when both are set`, () => {
    /* So renaming the Railway variable is a safe, reversible step: set the
       correct one alongside the typo, confirm it works, then drop the typo. */
    assert.strictEqual(
      resolve(expr, { CLOUDINARY_API_SECRET: VALUE, CLUDINARY_API_SECRET: 'stale' }),
      VALUE);
  });

  test(`${where} resolves to nothing when neither is set`, () => {
    /* What makes the route answer 503 rather than signing with undefined and
       handing the browser a signature Cloudinary will reject. */
    assert.ok(!resolve(expr, {}), 'an unset secret must be falsy');
  });
}
