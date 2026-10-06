'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const R = require('../tools/lib/text-relay');

const RE = /^(?:[A-Z0-9]{6}|[A-Z0-9]{10})$/;
const at = (min) => new Date(Date.UTC(2026, 9, 6, 12, 0) - min * 60000).toISOString();
const NOW = Date.UTC(2026, 9, 6, 12, 0);
const kim = { phone: '+1', quote_code: 'AB12CD', name: 'Kim', created_at: at(5) };
const lead = { phone: '+2', lead_id: 7, name: '', created_at: at(30) };

test('a leading code picks the customer; a lead code is L and its number', () => {
  assert.deepStrictEqual(R.pickTarget([kim, lead], 'l7 hi there', RE, NOW), { to: lead, body: 'hi there' });
  assert.deepStrictEqual(R.pickTarget([kim, lead], 'AB12CD - ok', RE, NOW), { to: kim, body: 'ok' });
});

test('without a code it goes to the latest customer, unless another wrote within ten minutes of them', () => {
  assert.deepStrictEqual(R.pickTarget([kim, lead], 'ok', RE, NOW), { to: kim, body: 'ok' });
  const close = { ...lead, created_at: at(12) };
  assert.deepStrictEqual(R.pickTarget([kim, close], 'ok', RE, NOW).ask, [kim, close]);
  // The same customer twice is not a clash.
  assert.deepStrictEqual(R.pickTarget([kim, { ...kim, created_at: at(7) }], 'ok', RE, NOW).to, kim);
});

test('an unknown leading word is part of the message, and old forwards need a code', () => {
  assert.deepStrictEqual(R.pickTarget([kim], 'THANKS a lot', RE, NOW), { to: kim, body: 'THANKS a lot' });
  const old = { ...kim, created_at: at(60 * 30) };
  assert.ok(R.pickTarget([old], 'ok', RE, NOW).none);
  assert.deepStrictEqual(R.pickTarget([old], 'AB12CD ok', RE, NOW), { to: old, body: 'ok' });
});
