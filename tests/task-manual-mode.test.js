'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const FLOW = require('../tools/lib/task-flow');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extract(name) {
  const start = src.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1);
  return src.slice(start, src.indexOf('\n}\n', start) + 2);
}

test('automatic staff work is off unless explicitly opted in', () => {
  for (const value of [undefined, '', 'false', '0', 'TRUE']) {
    assert.equal(FLOW.automaticEnabled({ AUTO_STAFF_TASKS: value }), false);
  }
  assert.equal(FLOW.automaticEnabled({}), false);
  assert.equal(FLOW.automaticEnabled({ AUTO_STAFF_TASKS: 'true' }), true);
});

test('manual mode blocks timer sweeps, task-completion refills and My Day refills before any work', async () => {
  for (const [name, args, expected] of [
    ['taskFlowSweep', [], ''],
    ['taskFlowFor', [7], 0],
    ['taskFlowFor', [7, { now: true }], 0],
  ]) {
    // Any state access or task generator call would fail in this context.
    const fn = vm.runInNewContext(`(${extract(name)})`, {
      FLOW: { automaticEnabled: () => false },
    });
    assert.equal(await fn(...args), expected, name);
  }
});

test('manual mode resolves stale refill notices without generating new ones', async () => {
  let cleared = false;
  const fn = vm.runInNewContext(`(${extract('backlogNotices')})`, {
    FLOW: { automaticEnabled: () => false },
    notifyClearResolved: async (recipient, kind, active) => {
      assert.equal(recipient, 'owner');
      assert.equal(kind, 'backlog');
      assert.equal(active.length, 0);
      cleared = true;
    },
  });
  const result = await fn([]);
  assert.equal(result.length, 0);
  assert.equal(cleared, true);
});

test('explicit opt-in can still reach the existing helper flow', async () => {
  let reads = 0;
  const fn = vm.runInNewContext(`(${extract('taskFlowFor')})`, {
    FLOW: { automaticEnabled: () => true },
    taskFlowAt: new Map(),
    pool: { query: async () => { reads++; return { rows: [] }; } },
  });
  assert.equal(await fn(7, { now: true }), 0);
  assert.equal(reads, 1);
});
