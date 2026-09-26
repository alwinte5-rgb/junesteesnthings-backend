'use strict';

/* Operational guards from the 2026-09-26 full audit. Each one is a failure that
   happened silently: nothing broke loudly, the business just quietly lost
   something (month-end tax totals, reminders, an unread enquiry alert). */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('database sessions run on Chicago time, so month-end money lands in the right month', () => {
  const pool = server.slice(server.indexOf('const pool = new Pool({'), server.indexOf('});', server.indexOf('const pool = new Pool({')));
  assert.match(pool, /options: `-c TimeZone=\$\{\(process\.env\.JT_TIMEZONE \|\| 'America\/Chicago'\)/);
});

test('the hourly sweep does not depend on the designer key, only on running in production', () => {
  const at = server.indexOf("const runSweep = async () => {");
  const guardLine = server.lastIndexOf('\nif (', at);
  const guard = server.slice(guardLine, server.indexOf('\n', guardLine + 1));
  assert.match(guard, /RAILWAY_ENVIRONMENT_NAME/);
  assert.doesNotMatch(guard, /JT_INTERNAL_KEY/, 'a missing designer key must not stop reminders, digests and the price sync');
  const sweep = server.slice(at, server.indexOf('setTimeout(runSweep', at));
  for (const task of ['deposit reminders', 'daily digest', 'tax check', 'supplier sync']) assert.ok(sweep.includes(`'${task}'`), task);
});

test('a failed "new enquiry" alert reaches the error digest, not just the log', () => {
  const at = server.indexOf("app.post('/submit'");
  const route = server.slice(at, server.indexOf('\n});', at));
  assert.match(route, /reportError\('submit:' \+ name/);
  assert.match(route, /\['notify-shop', emailResult\]/);
});
