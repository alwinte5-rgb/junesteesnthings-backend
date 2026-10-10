/* Codex backlog fixes, backend batch 2 (2026-10-10). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (anchor, len = 1500) => { const i = src.indexOf(anchor); assert.ok(i > -1, anchor); return src.slice(i, i + len); };

test('#143 adding a delivery fee closes the card page made for the old total', () => {
  const b = after("delivery_fee = COALESCE($3::numeric, delivery_fee)", 900);
  assert.match(b, /if \(upd\[0\]\.stripe_session\) \{\s*await pool\.query\('UPDATE quotes SET stripe_session = NULL WHERE code = \$1'/);
  assert.ok(b.indexOf('stripe_session = NULL') < b.indexOf('expireCheckoutSession(upd[0].stripe_session)'), 'forgotten before expired');
});

test('#143 a losing duplicate accept never cancels the winner\'s booking', () => {
  const b = after('if (delivery && !rows.length) {', 700);
  assert.match(b, /SELECT accepted_at FROM quotes WHERE code = \$1/);
  assert.ok(b.indexOf('accepted_at') < b.indexOf('DELIVERY.cancelRef'));
});

test('#143 a paid local delivery that is not confirmed is not thanked as booked', () => {
  const b = after("const booked = (await DELIVERY.confirm({ ref })", 700);
  assert.match(b, /\['confirmed', 'out', 'delivered'\]\.includes/);
  assert.match(b, /return res\.status\(502\)/);
});

test('#123 money is not applied to a quote still waiting on price approval', () => {
  const b = after('async function applyStripePaymentNow(', 2600);
  assert.match(b, /if \(q\.status === 'held' && !onQuote\.length\) return \{ error: 'held' \};/);
  assert.ok(b.indexOf("error: 'held'") < b.indexOf('landStripePaymentOnQuote('));
  assert.match(src, /'held': 'That quote is waiting on price approval/);
});

test('#127 a payment that accepts a quote declines its unchosen options', () => {
  assert.match(src, /async function declineUnchosenOptions\(code\)/);
  const n = (src.match(/await declineUnchosenOptions\(code\)/g) || []).length;
  assert.strictEqual(n, 2, 'Stripe landing and manual mark-paid');
  /* The rule itself: nothing ticked keeps required lines and declines the rest. */
  const fn = after('function applyOptionChoice(items, chosen, sharedCodes) {', 4000);
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
  const apply = new Function(body + '; return applyOptionChoice;')();
  const r = apply([{ line_total: 10 }, { optional: true, line_total: 5 }], [], []);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.declined.length, 1);
});
