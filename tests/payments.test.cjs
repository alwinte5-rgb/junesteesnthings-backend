/**
 * Tests for the quote payment ledger and the Stripe webhook.
 *
 * DEV-ONLY. Run: node tests/payments.test.cjs
 *
 * Two things here are worth guarding hard:
 *
 *  1. THE FEE SPLIT. Stripe charges the quote total plus a 4% card surcharge.
 *     Banking the gross would leave every card-paid quote looking overpaid and
 *     never closing; banking without recording the fee would stop the Stripe
 *     payout reconciling. The split has to put exactly the quote amount against
 *     the quote and keep the fee beside it.
 *
 *  2. THE WEBHOOK SIGNATURE. /webhooks/stripe is a public, unauthenticated
 *     endpoint that moves money. If signature verification is wrong, anyone who
 *     finds the URL can mark quotes paid. It is verified by hand (no stripe SDK,
 *     to avoid a new runtime dependency), so it needs real tests.
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const CARD_FEE = 0.04;

/* Mirrors bankStripeSession's split. Kept in step by the guard test below. */
function splitGross(gross) {
  const net = round2(gross / (1 + CARD_FEE));
  return { net, fee: round2(gross - net) };
}

/* Mirrors the header parsing + HMAC in app.post('/webhooks/stripe'). */
function verifyStripeSignature(header, rawBody, secret, nowSec) {
  const parts = String(header || '').split(',').reduce((acc, kv) => {
    const [k, v] = kv.split('=');
    if (k === 't') acc.t = v;
    if (k === 'v1') acc.v1.push(v);
    return acc;
  }, { t: null, v1: [] });

  if (!parts.t || !parts.v1.length) return false;
  if (Math.abs(nowSec - Number(parts.t)) > 300) return false;

  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(parts.t + '.'), rawBody]))
    .digest('hex');

  return parts.v1.some((sig) => {
    try {
      return sig.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch { return false; }
  });
}

function sign(rawBody, secret, t) {
  const mac = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(t + '.'), rawBody])).digest('hex');
  return `t=${t},v1=${mac}`;
}

/* An in-memory stand-in for quote_payments + syncPaidAmount, including the
   unique index on ext_ref that provides idempotency. */
function makeLedger() {
  const rows = [];
  return {
    rows,
    record({ code, amount, fee = 0, method, kind = 'payment', extRef = null, note = null }) {
      if (extRef && rows.some((r) => r.ext_ref === extRef)) {
        return { ok: false, duplicate: true, paid: null };
      }
      rows.push({ id: rows.length + 1, quote_code: code, amount: round2(amount),
                  fee: round2(fee), method, kind, ext_ref: extRef, note });
      return { ok: true, duplicate: false, paid: this.paid(code) };
    },
    paid(code) {
      return round2(rows.filter((r) => r.quote_code === code)
                        .reduce((s, r) => s + Number(r.amount), 0));
    },
  };
}

/* ---------------------------------------------------------------- harness */

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, err }); }
}

/* ------------------------------------------------------- the fee split */

// The real payment this was built for: quote AE6162, Stripe charged $34.40.
test('fee split: a $34.40 charge closes a $33.08 quote exactly', () => {
  const { net, fee } = splitGross(34.40);
  assert.strictEqual(net, 33.08, 'the quote amount must go against the quote');
  assert.strictEqual(fee, 1.32, 'the surcharge must be recorded separately');
  assert.strictEqual(round2(33.08 - net), 0, 'the quote must be left at zero outstanding');
});

test('fee split: net + fee always reconciles to what Stripe took', () => {
  for (const gross of [10.40, 34.40, 88.71, 137.59, 175.39, 1040.00, 0.52]) {
    const { net, fee } = splitGross(gross);
    assert.strictEqual(round2(net + fee), round2(gross),
      `net+fee must equal gross for ${gross}`);
  }
});

test('fee split: the gross is never what lands on the quote', () => {
  const { net } = splitGross(34.40);
  assert.notStrictEqual(net, 34.40,
    'banking the gross would make every card-paid quote look overpaid');
});

test('fee split: a deposit leaves the correct balance outstanding', () => {
  // Quote 168.68, 50% deposit = 84.34, charged with fee = 87.71.
  const { net } = splitGross(87.71);
  assert.strictEqual(net, 84.34);
  assert.strictEqual(round2(168.68 - net), 84.34, 'balance should be the other half');
});

/* -------------------------------------------------------- idempotency */

test('idempotency: the same checkout session cannot be banked twice', () => {
  const L = makeLedger();
  const first = L.record({ code: 'AE6162', amount: 33.08, fee: 1.32, method: 'card', extRef: 'cs_live_abc' });
  const second = L.record({ code: 'AE6162', amount: 33.08, fee: 1.32, method: 'card', extRef: 'cs_live_abc' });
  assert.strictEqual(first.duplicate, false);
  assert.strictEqual(second.duplicate, true, 'the second attempt must be rejected');
  assert.strictEqual(L.paid('AE6162'), 33.08, 'the money must not be counted twice');
});

test('idempotency: redirect and webhook racing bank exactly one payment', () => {
  const L = makeLedger();
  // Whichever order they arrive in, the outcome is identical.
  const a = L.record({ code: 'Q1', amount: 50, method: 'card', extRef: 'cs_1' });
  const b = L.record({ code: 'Q1', amount: 50, method: 'card', extRef: 'cs_1' });
  assert.strictEqual([a.duplicate, b.duplicate].filter(Boolean).length, 1,
    'exactly one of the two must be discarded');
  assert.strictEqual(L.paid('Q1'), 50);
});

test('idempotency: distinct sessions on one quote both bank (deposit + balance)', () => {
  const L = makeLedger();
  L.record({ code: 'Q2', amount: 84.34, method: 'card', extRef: 'cs_dep' });
  L.record({ code: 'Q2', amount: 84.34, method: 'card', extRef: 'cs_bal' });
  assert.strictEqual(L.paid('Q2'), 168.68, 'a balance payment must add to the deposit');
});

/* --------------------------------------------------------- corrections */

test('correction: a double-marked deposit can be walked back', () => {
  // Exactly what happened to quote DBB3DF: the deposit was marked twice.
  const L = makeLedger();
  L.record({ code: 'DBB3DF', amount: 84.34, method: 'zelle' });
  L.record({ code: 'DBB3DF', amount: 84.34, method: 'zelle' });
  assert.strictEqual(L.paid('DBB3DF'), 168.68, 'the bug being corrected');

  // "set" mode: make the running total equal the true figure.
  const target = 84.34;
  L.record({ code: 'DBB3DF', amount: round2(target - L.paid('DBB3DF')),
             method: 'other', kind: 'correction', note: 'deposit marked twice' });
  assert.strictEqual(L.paid('DBB3DF'), 84.34, 'the total must come back to the deposit');
});

test('correction: history is preserved, never rewritten', () => {
  const L = makeLedger();
  L.record({ code: 'Q3', amount: 84.34, method: 'zelle' });
  L.record({ code: 'Q3', amount: 84.34, method: 'zelle' });
  L.record({ code: 'Q3', amount: -84.34, method: 'other', kind: 'correction' });
  assert.strictEqual(L.rows.filter(r => r.quote_code === 'Q3').length, 3,
    'all three entries must survive — a correction is an entry, not an edit');
  assert.strictEqual(L.rows.filter(r => r.kind === 'correction').length, 1);
});

test('correction: voiding a specific row reverses exactly that amount', () => {
  const L = makeLedger();
  L.record({ code: 'Q4', amount: 100, method: 'cash' });
  const bad = L.record({ code: 'Q4', amount: 37.5, method: 'zelle' });
  assert.strictEqual(L.paid('Q4'), 137.5);
  const target = L.rows.find(r => r.amount === 37.5);
  L.record({ code: 'Q4', amount: -target.amount, method: 'other', kind: 'correction' });
  assert.strictEqual(L.paid('Q4'), 100, 'only the voided row should come off');
});

test('correction: a refund reverses net and fee together', () => {
  const L = makeLedger();
  const { net, fee } = splitGross(34.40);
  L.record({ code: 'Q5', amount: net, fee, method: 'card', extRef: 'cs_x' });
  const back = splitGross(34.40);
  L.record({ code: 'Q5', amount: -back.net, fee: -back.fee, method: 'card',
             kind: 'refund', extRef: 're_x:3440' });
  assert.strictEqual(L.paid('Q5'), 0, 'a full refund must return the quote to zero paid');
});

/* ---------------------------------------------- webhook signature */

const SECRET = 'whsec_test_' + 'x'.repeat(24);
const BODY = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } }));
const NOW = 1786000000;

test('signature: a correctly signed request is accepted', () => {
  assert.strictEqual(verifyStripeSignature(sign(BODY, SECRET, NOW), BODY, SECRET, NOW), true);
});

test('signature: a forged signature is rejected', () => {
  const forged = `t=${NOW},v1=${'a'.repeat(64)}`;
  assert.strictEqual(verifyStripeSignature(forged, BODY, SECRET, NOW), false,
    'an attacker who knows the URL must not be able to mark quotes paid');
});

test('signature: a request signed with the wrong secret is rejected', () => {
  const wrong = sign(BODY, 'whsec_someone_elses_secret', NOW);
  assert.strictEqual(verifyStripeSignature(wrong, BODY, SECRET, NOW), false);
});

test('signature: a tampered body is rejected', () => {
  const header = sign(BODY, SECRET, NOW);
  const tampered = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_EVIL' } } }));
  assert.strictEqual(verifyStripeSignature(header, tampered, SECRET, NOW), false,
    'the payload must be covered by the signature, not just the timestamp');
});

test('signature: a replayed old request is rejected', () => {
  const header = sign(BODY, SECRET, NOW - 3600);
  assert.strictEqual(verifyStripeSignature(header, BODY, SECRET, NOW), false,
    'a captured request must not be replayable an hour later');
});

test('signature: a missing or malformed header is rejected', () => {
  for (const h of ['', null, undefined, 'garbage', `t=${NOW}`, 'v1=abc']) {
    assert.strictEqual(verifyStripeSignature(h, BODY, SECRET, NOW), false,
      `header ${JSON.stringify(h)} must be rejected`);
  }
});

test('signature: multiple v1 values accepted if any matches (key rotation)', () => {
  const good = sign(BODY, SECRET, NOW).split('v1=')[1];
  const header = `t=${NOW},v1=${'b'.repeat(64)},v1=${good}`;
  assert.strictEqual(verifyStripeSignature(header, BODY, SECRET, NOW), true,
    'Stripe sends several v1 values during a secret roll');
});

/* ------------------------------------------- guard: code stays in step */

test('guard: server.js still splits the fee the way these tests assume', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.includes('const net = round2(gross / (1 + CARD_FEE));'),
    'the fee split in server.js changed — update splitGross() here to match');
  assert.ok(src.includes("CREATE UNIQUE INDEX IF NOT EXISTS quote_payments_extref_uniq"),
    'the idempotency index is gone — payments could be banked twice');
  assert.ok(/timestamp outside tolerance/.test(src),
    'the webhook replay window guard is gone');
});

/* -------------------------------------------------------------- report */

let failed = 0;
for (const r of results) {
  if (r.ok) console.log('  ok   ' + r.name);
  else { failed++; console.log('  FAIL ' + r.name); console.log('       ' + r.err.message); }
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
