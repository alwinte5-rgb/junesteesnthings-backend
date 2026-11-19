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

test('a leading phone number sends to that number, not the last texter (owner, 2026-11-17)', () => {
  const sam = { phone: '+17735550199', quote_code: 'ZZ99ZZ', name: 'Sam', created_at: at(60 * 24 * 5) };
  // Not anyone who texted: a typed number on its own.
  assert.deepStrictEqual(R.pickTarget([kim], '312 555 0123 your shirts are ready', RE, NOW),
    { to: { phone: '+13125550123', quote_code: null, lead_id: null, name: '' }, body: 'your shirts are ready', byNumber: true, typed: true });
  // Someone who texted before, even days ago: their forward, so it lands on their job.
  assert.deepStrictEqual(R.pickTarget([kim, sam], 'To: (773) 555-0199 - ok', RE, NOW), { to: sam, body: 'ok', byNumber: true, typed: false });
  // Wins over the ten-minute clash, which would otherwise ask.
  const close = { ...lead, created_at: at(8) };
  assert.strictEqual(R.pickTarget([kim, close], 'text +1 312.555.0123: hi', RE, NOW).to.phone, '+13125550123');
  // And works with nobody having texted at all.
  assert.strictEqual(R.pickTarget([], '3125550123 hi', RE, NOW).to.phone, '+13125550123');
});

test('a number with a digit missing is refused, never sent to the last texter', () => {
  assert.deepStrictEqual(R.pickTarget([kim], '312 555 012 hi', RE, NOW), { badNumber: true });
  assert.deepStrictEqual(R.pickTarget([kim], '312-555-01234 hi', RE, NOW), { badNumber: true });
});

test('ordinary messages that start with a count are still messages', () => {
  assert.deepStrictEqual(R.pickTarget([kim], '100 shirts are ready', RE, NOW), { to: kim, body: '100 shirts are ready' });
  assert.deepStrictEqual(R.pickTarget([kim], 'Text me when you get here', RE, NOW), { to: kim, body: 'Text me when you get here' });
  // Prices and dates are not phone numbers typed wrong (code review).
  for (const t of ['450.00 - 50.00 deposit = 400 due', '2026-11-20 pickup works', '12/20/2026 is fine']) {
    assert.deepStrictEqual(R.pickTarget([kim], t, RE, NOW), { to: kim, body: t });
  }
});

/* Owner, 2026-11-19: the link bubbles a phone sends beside "Text <number> ..."
   went to the last texter, a different customer. */
test('a link on its own is never sent to the last texter', () => {
  for (const t of ['https://www.jtees.net/admin/leads#lead-328', 'www.jtees.net', 'jtees.net/shop', 'https://a.com https://b.com']) {
    assert.ok(R.isLinkOnly(t), t);
    assert.deepStrictEqual(R.pickTarget([kim], t, RE, NOW), { linkOnly: true }, t);
  }
  /* Words, prices and dotted words are messages (code review, 2026-11-19). */
  for (const t of ['450.00', '1.5', 'Ok.', 'ok.thanks', 'St.Louis', 'Fri.ok', 'see https://x.com', 'Thanks!', '']) assert.ok(!R.isLinkOnly(t), JSON.stringify(t));
  assert.deepStrictEqual(R.pickTarget([kim], 'see https://x.com', RE, NOW), { to: kim, body: 'see https://x.com' });
});

test('a link on its own goes where the owner\'s previous text went, within two minutes', () => {
  const prev = { phone: '+13125550177', quote_code: null, at: new Date(NOW - 30e3).toISOString() };
  let p = R.pickTarget([kim], 'https://www.jtees.net/x', RE, NOW, prev);
  assert.strictEqual(p.to.phone, '+13125550177');
  assert.ok(p.followed && p.byNumber, 'checked like a typed number');
  assert.ok(p.typed, 'nobody on file: the server looks for their job or lead');
  /* A lead on file at that number: filed on it. */
  const dee = { phone: '+13125550177', lead_id: 9, name: 'Dee', created_at: at(60) };
  p = R.pickTarget([kim, dee], 'https://x.com/p', RE, NOW, prev);
  assert.strictEqual(p.to.lead_id, 9); assert.strictEqual(p.to.name, 'Dee'); assert.ok(!p.typed);
  /* The job the words were filed on wins over their newest forward. */
  p = R.pickTarget([kim], 'https://x.com/p', RE, NOW, { phone: kim.phone, quote_code: 'XYZ123', at: prev.at });
  assert.strictEqual(p.to.quote_code, 'XYZ123'); assert.strictEqual(p.to.lead_id, null);
  /* The previous text was a plain reply to the last texter: the link follows it there. */
  p = R.pickTarget([kim], 'https://x.com/p', RE, NOW, { phone: kim.phone, quote_code: 'AB12CD', at: prev.at });
  assert.strictEqual(p.to.phone, kim.phone);
  /* Too old: refused. */
  assert.deepStrictEqual(R.pickTarget([kim], 'https://x.com/p', RE, NOW, { ...prev, at: new Date(NOW - 3 * 60e3).toISOString() }), { linkOnly: true });
  /* A number or code in front still wins. */
  assert.strictEqual(R.pickTarget([kim], 'AB12CD https://x.com', RE, NOW, prev).to, kim);
});
