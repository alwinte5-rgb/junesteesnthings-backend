'use strict';
/* Customers are only ever told jtees.net (owner, 2026-10-05). The studio still
 * serves its deep pages from design.jtees.net, but no text or code message may
 * send anyone there by name. */
const { test } = require('node:test');
const assert = require('node:assert');
const reintro = require('../tools/lib/reintro');
const sms = require('../tools/lib/sms-templates');

test('the hello text and the code text say jtees.net', () => {
  const hello = reintro.helloText({ first: 'Ana' }).body;
  const code = reintro.codeText({ code: 'TEXTSAB2CD' }).body;
  for (const b of [hello, code]) {
    assert.doesNotMatch(b, /design\.jtees\.net/);
    assert.match(b, /jtees\.net/);
  }
});

test('the cart-code text without a restore link says jtees.net', () => {
  const b = sms.T.cartCode({ code: 'X', pct: 10 }).body;
  assert.doesNotMatch(b, /design\.jtees\.net/);
});
