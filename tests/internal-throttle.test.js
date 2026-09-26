'use strict';

/* A per-recipient cap on the internal routes that message someone for the
 * designer (server.js capPerRecipient).
 *
 * Run: node --test tests/*.test.js
 *
 * These routes trust the X-JT-Key header completely. If that key ever leaked
 * they would be a free way to flood any inbox or phone under the shop's name,
 * and every text costs money. The designer limits what reaches them; this is
 * the second wall — generous enough that no real customer meets it.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extractFn(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  let p = src.indexOf('(', start);
  for (let d = 0; p < src.length; p++) {
    if (src[p] === '(') d++;
    else if (src[p] === ')' && --d === 0) break;
  }
  let depth = 0;
  for (let i = src.indexOf('{', p); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated \`${anchor}\``);
}

function limiter(route, perHour) {
  const reported = [];
  const sandbox = {
    Date, Map, String,
    setInterval: () => ({ unref() {} }),
    reportError: (kind, err) => { reported.push([kind, err.message]); return Promise.resolve(); },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn('function capPerRecipient('), sandbox);
  const mw = sandbox.capPerRecipient(route, perHour);
  const call = (body) => {
    const out = { passed: false, status: null };
    const res = { status(c) { out.status = c; return this; }, json() { return this; } };
    mw({ body }, res, () => { out.passed = true; });
    return out;
  };
  return { call, reported };
}

test('up to the cap passes; the next one to the same recipient is refused and reported', () => {
  const l = limiter('sms-cart-code', 3);
  for (let i = 0; i < 3; i++) assert.strictEqual(l.call({ phone: '+17735551234' }).passed, true);
  const over = l.call({ phone: '+17735551234' });
  assert.strictEqual(over.passed, false);
  assert.strictEqual(over.status, 429);
  assert.strictEqual(l.reported.length, 1);
  assert.strictEqual(l.reported[0][0], 'internal-throttle');
  assert.doesNotMatch(l.reported[0][1], /5551234/, 'the recipient is not written into the error digest');
});

test('each recipient has its own count, and email case does not split one', () => {
  const l = limiter('send-login-code', 2);
  assert.ok(l.call({ email: 'Ada@Example.com' }).passed);
  assert.ok(l.call({ email: 'ada@example.com' }).passed);
  assert.strictEqual(l.call({ email: 'ADA@example.com' }).status, 429);
  assert.ok(l.call({ email: 'bea@example.com' }).passed, 'another customer is untouched');
});

test('a request with no recipient is left to the route to reject', () => {
  const l = limiter('crm-contact', 1);
  assert.ok(l.call({}).passed);
  assert.ok(l.call({}).passed);
});

test('every internal route that messages someone is capped', () => {
  for (const route of ['sms-cart-code', 'sms-cart-followup', 'send-login-code', 'abandoned-cart-email',
                       'order-confirmation', 'order-notification', 'balance-link-email', 'order-shipped',
                       'crm-contact', 'brevo-event']) {
    assert.match(src, new RegExp(`app\\.post\\('/api/${route}', requireInternalKey, capPerRecipient\\('${route}', \\d+\\)`),
      `/api/${route} must be capped`);
  }
});
