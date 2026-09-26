'use strict';

/* The quote code is the only secret on a customer's quote page. New codes must
   be long enough that a distributed sweep cannot find live quotes, and old
   six-character links already in customers' texts and emails must keep working. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function load() {
  const a = server.indexOf('const QUOTE_CODE_ALPHABET');
  const b = server.indexOf('\n}\n', server.indexOf('function newQuoteCode(', a)) + 2;
  const re = server.match(/const QUOTE_CODE_RE = (\/.*\/);/)[1];
  const ctx = vm.createContext({ crypto });
  vm.runInContext(server.slice(a, b) + `;this.gen = newQuoteCode; this.re = ${re};`, ctx);
  return ctx;
}

test('new codes are 10 characters with no look-alike letters, and pass the route check', () => {
  const { gen, re } = load();
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = gen();
    assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    assert.ok(re.test(c), c);
    seen.add(c);
  }
  assert.equal(seen.size, 2000);
});

test('existing six-character links still resolve; other lengths do not', () => {
  const { re } = load();
  assert.ok(re.test('A1B2C3'));
  assert.ok(!re.test('A1B2C'));
  assert.ok(!re.test('A1B2C3D'));
  assert.ok(!re.test('a1b2c3'));
});

test('the backfill tool accepts the same codes as the server', () => {
  const tool = fs.readFileSync(path.join(__dirname, '..', 'tools', 'backfill-unlinked.js'), 'utf8');
  assert.equal(tool.match(/const QUOTE_CODE_RE = (\/.*\/);/)[1], server.match(/const QUOTE_CODE_RE = (\/.*\/);/)[1]);
});
