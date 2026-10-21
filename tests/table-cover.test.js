'use strict';

/* The 6 ft table cover (owner, 2026-10-21): DTF printed in house on one or two
 * sides of a YCC Linens blank, at the owner's all-in prices, shipping included:
 *   1 side  $75 for 1-2, $65 each from 3;  2 sides $90 for 1, $80 each from 2.
 * tools/add-table-cover.js writes them as one decoration method whose main
 * stage is the 1-side price and whose second stage is what the back adds. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tool = fs.readFileSync(path.join(__dirname, '..', 'tools', 'add-table-cover.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const grab = (name) => vm.runInThisContext('(' + (tool.match(new RegExp('const ' + name + ' = (\\{[^}]*\\});')) || [])[1] + ')');
const ONE = grab('ONE_SIDE'), TWO = grab('TWO_SIDES');
/* The engine's band rule: the first ceiling at or above the quantity. */
const at = (t, q) => t[Object.keys(t).map(Number).sort((a, b) => a - b).find((c) => q <= c)];

test('the owner\'s prices, each, at every quantity', () => {
  for (const [q, one, two] of [[1, 75, 90], [2, 75, 80], [3, 65, 80], [10, 65, 80], [500, 65, 80]]) {
    assert.strictEqual(at(ONE, q), one, `1 side at ${q}`);
    assert.strictEqual(at(TWO, q), two, `2 sides at ${q}`);
    assert.ok(at(TWO, q) - at(ONE, q) > 0, `the back adds something at ${q}`);
  }
});

test('nothing is added on top: no product price, no delivery charge', () => {
  assert.match(tool, /const blank = 0;/);
  assert.doesNotMatch(src, /tablecover_ship/, 'shipping is inside the owner\'s price');
});

test('the tool refuses a missing or rising price and is dry-run by default', () => {
  assert.match(tool, /no price for the <=' \+ c \+ ' band — refusing/);
  assert.match(tool, /1-side price RISES at/);
  assert.match(tool, /const APPLY = argv\.includes\('--apply'\)/);
});

test('job costs cost the front as an oversized print', () => {
  const JC = require('../tools/lib/job-costs');
  assert.ok(JC.DTF[1][2] > JC.DTF[1][1]);
});
