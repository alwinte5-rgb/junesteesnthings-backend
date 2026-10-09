'use strict';

/* My stats (/admin/my-stats): a helper sees only their own numbers, worked
 * out from the work itself; the owner can open anyone's.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const STAFF = require('../tools/lib/staff');
const TRAINING = require('../tools/lib/training');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

test('a helper sees only their own stats; the owner picks from the active roster', () => {
  assert.strictEqual(STAFF.ROUTES['GET /admin/my-stats'], 'any');
  const page = route("app.get('/admin/my-stats', requireAdmin");
  assert.match(page, /: actor\.id;/, 'a helper\'s page is always their own, whatever ?staff= says');
  assert.match(page, /roster\.some\(\(r\) => r\.id === intIn\(req\.query\.staff\)\)/);
  assert.match(page, /helperScore\(staffId, range\.from, range\.to\)/, 'the same numbers as the owner\'s Team page');
  assert.match(page, /res\.set\('Cache-Control', 'no-store'\)/);
  assert.deepStrictEqual(TRAINING.ownerGaps(page), [], 'no unfilled placeholder on a helper page');
  assert.match(src, /key: 'mystats',\s+href: '\/admin\/my-stats',\s+label: 'My stats',\s+icon: 'grid',\s+staffOnly: true/);
});

test('the extra numbers are parameterised and counted per helper', () => {
  const fn = src.slice(src.indexOf('async function myStatsExtras('), src.indexOf('\n}\n', src.indexOf('async function myStatsExtras(')));
  for (const needle of ["action IN ('lead registered as theirs', 'found lead was already known')", 's.rep_id = $1', "action = 'upsell applied'", 'AT TIME ZONE $4']) {
    assert.ok(fn.includes(needle), needle);
  }
  assert.doesNotMatch(fn, /\$\{/, 'no values built into the SQL');
});
