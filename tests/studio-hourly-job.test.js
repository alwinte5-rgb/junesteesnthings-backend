'use strict';

/* The design studio's hourly job reaches the error digest when it fails.
 *
 * The sweep calls design.jtees.net/jt-cron.php every hour: abandoned-cart
 * emails, the one follow-up text, and the studio's refund check. That job
 * answers 500 when a refund could not be put on its studio order, and 403
 * when the key is wrong. The step returned the reply's text whatever the
 * status, so either was only ever logged, and a studio order could keep
 * reading "paid in full" after a refund with nobody told.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in server.js`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let depth = 0;
  for (let i = src.indexOf('{', src.indexOf(')', start)); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

/* runStudioHourlyJob as server.js has it, with the studio answering `reply`. */
function job({ key = 'k', status = 200, body = '' } = {}) {
  const calls = [];
  const ctx = {
    process: { env: key ? { JT_INTERNAL_KEY: key } : {} },
    studioFetch: async (url, init) => {
      calls.push({ url, init });
      return { ok: status >= 200 && status < 300, status, text: async () => body };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(lift('runStudioHourlyJob'), ctx);
  return { run: () => ctx.runStudioHourlyJob(), calls };
}

test('a 200 is the job\'s report, logged as before', async () => {
  const j = job({ body: 'checked=2 sent=1\nsms_followups checked=0 marked=0\nrefunds checked=1 studio_orders=0\n' });
  assert.match(await j.run(), /refunds checked=1 studio_orders=0/);
  assert.strictEqual(j.calls.length, 1);
  assert.strictEqual(j.calls[0].url, 'https://design.jtees.net/jt-cron.php');
  assert.ok(j.calls[0].init.timeoutMs >= 60000, 'the job talks to Stripe as well: it gets a long timeout');
});

test('a refund the studio could not record (500) fails the step, in the job\'s own words', async () => {
  const j = job({ status: 500, body: 'checked=0 sent=0\nsms_followups checked=0 marked=0\nrefunds checked=1 studio_orders=0 FAILED=1\n' });
  await assert.rejects(j.run(), (e) => {
    assert.match(e.message, /^studio answered 500: /);
    assert.match(e.message, /FAILED=1/, 'the digest says what failed, not only that something did');
    return true;
  });
});

test('Stripe unreachable from the studio fails the step too', async () => {
  const j = job({ status: 500, body: 'refunds checked=0 studio_orders=0 - Stripe could not be asked: Could not reach Stripe (curl error 28).\n' });
  await assert.rejects(j.run(), /studio answered 500: .*Stripe could not be asked/);
});

test('a wrong key (403) is no longer a quiet "forbidden" in the log', async () => {
  await assert.rejects(job({ status: 403, body: 'forbidden' }).run(), /^Error: studio answered 403: forbidden$/);
});

test('a long reply is cut, so one failure cannot flood the digest', async () => {
  const j = job({ status: 500, body: 'x'.repeat(5000) });
  await assert.rejects(j.run(), (e) => e.message.length < 400);
});

test('with no key the studio is not called, and the step says what was skipped', async () => {
  const j = job({ key: '' });
  await assert.rejects(j.run(), /JT_INTERNAL_KEY not set .*carts, texts, refunds/);
  assert.strictEqual(j.calls.length, 0);
});

test('the hourly sweep runs it as a step, so a failure is reported and costs only itself', () => {
  assert.match(src, /await step\('studio hourly job', runStudioHourlyJob\);/);
  const step = src.slice(src.indexOf('const step = async (name, fn) => {'), src.indexOf('const runSweep = async'));
  assert.match(step, /reportError\('sweep:' \+ name, e\)/, 'a failed step reaches the error digest');
});
