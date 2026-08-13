/* Regression tests for the photo-upload status line (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 *
 * The bug these exist to prevent, which is issue #31:
 *
 * The review form wrote its error message straight onto the status element in
 * a `.catch()`, and then the next handler in the chain called its redraw,
 * which overwrote that element with the attached-photo count. With nothing
 * attached, that count is the empty string — so a failed upload cleared the
 * message it had just written and left the line BLANK. The photo was gone, the
 * form still submitted, and the customer was told nothing at all. That was the
 * whole of the visible feedback during the 503 outage: nothing.
 *
 * The fix makes failure part of what the redraw RENDERS rather than something
 * written beside it, which is why the status line is now a pure function of
 * (pending, done, failed, reason) and why it is worth testing on its own. If
 * a failure can never be represented in the output, no amount of care in the
 * upload chain can make it visible.
 *
 * This lifts the real function out of server.js rather than restating it, and
 * runs it in the host realm — a fresh vm context would give returned values a
 * different Array/String prototype and make deepStrictEqual fail on identical
 * output. server.js boots a listener and a DB pool on require, which is why it
 * is not imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/**
 * Lift `function uploadStatus(...) {...}` out of the source.
 *
 * It lives inside the string that `uploadStatusScript()` returns — it is
 * client-side code that never runs in Node — but it is still literal text in
 * server.js, so the same extraction the other suites use finds it. Anchored on
 * the shortest unique text rather than on the body, so a rewrite is judged on
 * what it does instead of dying on a missing anchor.
 */
function load() {
  const start = src.indexOf('function uploadStatus(');
  assert.notStrictEqual(start, -1, 'function uploadStatus not found in server.js');
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) {
      const code = src.slice(start, i + 1);
      /* The source is a template literal, so \u escapes reached us doubled.
         Undo exactly that one layer to get what the browser is served. */
      return vm.runInThisContext(`(function(){ ${code.replace(/\\\\u/g, '\\u')}
        return uploadStatus; })()`);
    }
  }
  throw new Error('unbalanced braces reading uploadStatus from server.js');
}

const uploadStatus = load();

/* ── The bug ────────────────────────────────────────────────────────────── */

test('a failure is never invisible', () => {
  /* The exact shape of #31: one photo tried, none attached, nothing pending.
     This returned '' before the fix, which is what made the outage silent. */
  const out = uploadStatus(0, 0, 1, '');
  assert.notStrictEqual(out, '', 'a failed upload must not render as an empty status line');
  assert.match(out, /would not upload/);
});

test('a failure stays visible even when other photos succeeded', () => {
  /* The half-failed case: two attached, one lost. Reporting only the two is
     how a form ends up looking successful while dropping a photo. */
  const out = uploadStatus(0, 2, 1, '');
  assert.match(out, /2 photos attached/);
  assert.match(out, /1 photo would not upload/);
});

test('every combination of counts that includes a failure mentions it', () => {
  for (const pending of [0, 1, 2]) {
    for (const done of [0, 1, 2]) {
      for (const failed of [1, 2]) {
        assert.match(uploadStatus(pending, done, failed, ''), /would not upload/,
          `failure lost at pending=${pending} done=${done} failed=${failed}`);
      }
    }
  }
});

/* ── What it says the rest of the time ──────────────────────────────────── */

test('nothing happening says nothing', () => {
  assert.strictEqual(uploadStatus(0, 0, 0, ''), '');
});

test('work in flight is reported', () => {
  assert.match(uploadStatus(1, 0, 0, ''), /Uploading 1 photo/);
  assert.match(uploadStatus(3, 0, 0, ''), /Uploading 3 photos/);
});

test('a plain success says only that', () => {
  const out = uploadStatus(0, 1, 0, '');
  assert.strictEqual(out, '1 photo attached');
  assert.doesNotMatch(out, /would not upload/);
});

test('a reason is appended when there is one, and not when there is not', () => {
  assert.match(uploadStatus(0, 0, 1, 'photos must be under 10MB'),
    /would not upload — photos must be under 10MB/);
  assert.doesNotMatch(uploadStatus(0, 0, 1, ''), /—/);
});

test('singular and plural both read correctly', () => {
  assert.strictEqual(uploadStatus(1, 0, 0, ''), 'Uploading 1 photo…');
  assert.strictEqual(uploadStatus(2, 0, 0, ''), 'Uploading 2 photos…');
  assert.strictEqual(uploadStatus(0, 1, 0, ''), '1 photo attached');
  assert.strictEqual(uploadStatus(0, 2, 0, ''), '2 photos attached');
  assert.match(uploadStatus(0, 0, 1, ''), /^1 photo would not upload$/);
  assert.match(uploadStatus(0, 0, 2, ''), /^2 photos would not upload$/);
});

test('all three states at once are all present', () => {
  const out = uploadStatus(1, 2, 3, 'the upload was rejected');
  for (const want of [/Uploading 1 photo/, /2 photos attached/,
                      /3 photos would not upload/, /the upload was rejected/]) {
    assert.match(out, want);
  }
});

test('the parts are separated readably rather than run together', () => {
  /* Two facts jammed into one sentence read as one confusing fact. */
  assert.match(uploadStatus(0, 1, 1, ''), /attached\s*·\s*1 photo would not upload/);
});
