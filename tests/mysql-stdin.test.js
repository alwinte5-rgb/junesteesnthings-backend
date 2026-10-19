/* tools/lib/db.js mysql() sends its SQL on stdin (2026-10-18).
 *
 * As `-e <sql>` the statement was a command-line argument, capped at 128KB on
 * Linux and 1MB in all on macOS: the daily sync's 260 rebuilt size fields
 * failed with E2BIG before a single statement ran.
 *
 * Run: node --test tests/mysql-stdin.test.js
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/* A stand-in client: records its argv and stdin, prints one result row. */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-mysql-'));
const bin = path.join(dir, 'mysql');
fs.writeFileSync(bin, `#!/usr/bin/env node
const fs = require('fs');
const sql = fs.readFileSync(0, 'utf8');
fs.writeFileSync(${JSON.stringify(path.join(dir, 'seen.json'))}, JSON.stringify({ argv: process.argv.slice(2), len: sql.length, head: sql.slice(0, 20) }));
process.stdout.write('n\\n' + sql.length + '\\n');
`);
fs.chmodSync(bin, 0o755);
process.env.JT_MYSQL_BIN = bin;
const { mysql } = require('../tools/lib/db');

test('a statement far past the argument cap goes in on stdin', () => {
  const sql = "SELECT '" + 'x'.repeat(3 * 1024 * 1024) + "';";
  const out = mysql('mysql://u:p@h:3306/db', sql, { rows: true });
  assert.deepStrictEqual(out, [{ n: String(sql.length) }]);
  const seen = JSON.parse(fs.readFileSync(path.join(dir, 'seen.json'), 'utf8'));
  assert.strictEqual(seen.len, sql.length);
  assert.ok(!seen.argv.includes('-e'), 'no -e argument');
  assert.ok(seen.argv.every((a) => a.length < 200), 'the SQL is not on the command line');
});

test('a write with no result rows still sends its SQL', () => {
  assert.strictEqual(mysql('mysql://u:p@h:3306/db', 'UPDATE t SET a=1;'), null);
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'seen.json'), 'utf8')).head, 'UPDATE t SET a=1;');
});
