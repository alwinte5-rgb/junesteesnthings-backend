'use strict';

/* The nightly supplier sync has to find its database.
 *
 * It has now failed silently for weeks twice, and both times the symptom was a
 * catalogue quietly going stale rather than an error anyone saw:
 *
 *   - a hardcoded mysql binary path that does not exist on Railway's image
 *   - and this one: the scheduler passed MYSQL_PUBLIC_URL, which the backend
 *     service does not have. It has the five discrete MYSQL* variables. So
 *     every scheduled run exited "no MySQL URL in the piped variables" before
 *     touching anything, while jt_supplier_sync_log recorded the attempt.
 *
 * The cost of the second one was a price book marked up from S&S LIST rather
 * than from what the shop pays.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { mysqlUrlFrom } = require(path.join(ROOT, 'tools/lib/db'));
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

test('the connection is found in any shape Railway hands out', () => {
  assert.equal(mysqlUrlFrom({ MYSQL_PUBLIC_URL: 'mysql://a:b@pub/db' }), 'mysql://a:b@pub/db');
  assert.equal(mysqlUrlFrom({ MYSQL_URL: 'mysql://a:b@priv/db' }), 'mysql://a:b@priv/db');
  assert.equal(
    mysqlUrlFrom({ MYSQLHOST: 'h', MYSQLPORT: '3306', MYSQLUSER: 'root', MYSQLPASSWORD: 'p', MYSQLDATABASE: 'railway' }),
    'mysql://root:p@h:3306/railway');
  /* The public URL wins when both are present — a tool run from a laptop must
     not try the internal host. */
  assert.match(mysqlUrlFrom({ MYSQL_PUBLIC_URL: 'mysql://a@pub/db', MYSQL_URL: 'mysql://a@priv/db' }), /pub/);
});

test('a password with URL-special characters survives', () => {
  const u = mysqlUrlFrom({ MYSQLHOST: 'h', MYSQLUSER: 'root', MYSQLPASSWORD: 'p@ss:w/rd#1', MYSQLDATABASE: 'db' });
  assert.equal(u.includes('p@ss:w/rd#1'), false, 'the password was not escaped');
  assert.match(u, /root:p%40ss%3Aw%2Frd%231@h/);
});

test('it refuses rather than guessing when nothing is set', () => {
  assert.equal(mysqlUrlFrom({}), '');
  assert.equal(mysqlUrlFrom({ MYSQLHOST: 'h' }), '', 'a host alone is not a connection');
  assert.equal(mysqlUrlFrom({ MYSQLUSER: 'root', MYSQLDATABASE: 'db' }), '', 'no host');
});

test('the scheduler hands the child every shape it might need', () => {
  const block = server.slice(server.indexOf('const vars = JSON.stringify({'));
  const head = block.slice(0, block.indexOf('});') + 3);
  for (const v of ['MYSQL_PUBLIC_URL', 'MYSQL_URL', 'MYSQLHOST', 'MYSQLPORT',
                   'MYSQLUSER', 'MYSQLPASSWORD', 'MYSQLDATABASE',
                   'SSA_ACCOUNT', 'SSA_API_KEY']) {
    assert.ok(head.includes(v), 'the supplier sync child is not given ' + v);
  }
});

test('the sync reads the shared resolver, not its own copy', () => {
  const tool = fs.readFileSync(path.join(ROOT, 'tools/ssa-sync.js'), 'utf8');
  assert.match(tool, /mysqlUrlFrom/, 'ssa-sync does not use the shared resolver');
  assert.equal(/env\.MYSQL_PUBLIC_URL \|\| env\.MYSQL_URL/.test(tool), false,
    'ssa-sync is back to asking for one shape only');
});
