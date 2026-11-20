'use strict';

/* Writes docs/wholesale-v1-fixtures.json: a sample request in every status, and
 * a sample of every webhook event, built by the SAME view code the API answers
 * with (tools/lib/wholesale.js). Codex builds and tests the Biz Dashboard side
 * against these instead of live orders. tests/wholesale-fixtures.test.js fails
 * when the committed file no longer matches what this script produces.
 *
 * Run: node tools/wholesale-fixtures.js            (writes the file)
 *      node tools/wholesale-fixtures.js --print    (prints it)
 */

const fs = require('fs');
const path = require('path');
const W = require('./lib/wholesale');

const T0 = '2026-11-14T15:00:00.000Z';
const NOW = new Date('2026-11-14T16:00:00Z');
const URL_ = 'https://www.jtees.net/q/WHSL000001';

const request = {
  public_id: 'wr_3f9c0a1b2c3d4e5f6a7b', external_ref: 'NS-1001', created_at: T0, updated_at: T0,
  payload: {
    external_ref: 'NS-1001', needed_by: '2026-12-10', notes: 'Preorder batch closed Nov 20',
    ship_to: { name: 'Northside Apparel', street1: '1 Main St', city: 'Chicago', state: 'IL', zip: '60601', country: 'US' },
    contact: { name: 'Dana', email: 'ops@northside.example', phone: '+17735550100' },
    lines: [{ product: 'Black tee, front logo', colour: 'Black', qty: 24, sizes: { S: 4, M: 10, L: 10 },
      decoration: 'DTF front, about 11 in wide', artwork_urls: ['https://cdn.northside.example/logo.png'],
      notes: null, external_line_ref: 'sku-blk-tee' }],
  },
  artwork: [{ version: 1, url: 'https://cdn.northside.example/logo.png', name: null, note: null, line: 0, submitted_at: T0 }],
};
const quote = {
  code: 'WHSL000001', status: 'sent', revision: 1, valid_until: '2026-11-28', needed_by: '2026-12-10',
  total: 325, paid_amount: 0,
  items: [{ description: 'Gildan 5000 T-shirt, Black, DTF front', details: 'Front 11 in', colour: 'Black', qty: 24,
    size_mix: { S: 4, M: 10, L: 10 }, unit_price: 12.5, line_total: 300,
    prints: [{ loc: 'front', method_id: 1, colours: null }], addons: [{ label: 'Setup', total: 25 }], setup_fee: 0,
    images: ['https://res.cloudinary.com/jtees/image/upload/sample-mockup.png'],
    blank_price: 3.11, product_id: 9 }],
};
const totals = { subtotal: 300, rush: 0, rushPct: 0, discount: 0, tax: 25, delivery: 0, shipping: 0, total: 325, deposit: 162.5 };

const at = (h) => new Date(NOW.getTime() - h * 3600e3).toISOString();
const cases = {
  requested: [{}, null],
  quoted: [{}, {}],
  expired: [{}, { valid_until: '2026-11-10' }],
  awaiting_payment: [{ authorized_revision: 1, authorized_at: at(5) }, { accepted_at: at(4) }],
  deposit_paid: [{ authorized_revision: 1, authorized_at: at(5) }, { accepted_at: at(4), paid_amount: 162.5 }],
  paid: [{ authorized_revision: 1, authorized_at: at(5) }, { accepted_at: at(4), paid_amount: 325 }],
  in_production: [{ authorized_revision: 1, authorized_at: at(5) }, { accepted_at: at(4), paid_amount: 162.5, artwork_at: at(3), proof_sent_at: at(2) }],
  ready: [{ authorized_revision: 1 }, { accepted_at: at(4), paid_amount: 325, artwork_at: at(3), proof_ok_at: at(2), production_at: at(1), qc_at: at(0.5) }],
  shipped: [{ authorized_revision: 1 }, { accepted_at: at(4), paid_amount: 325, qc_at: at(1), shipped_at: at(0.5) }],
  delivered: [{ authorized_revision: 1 }, { accepted_at: at(4), paid_amount: 325, shipped_at: at(1), delivered_at: at(0.5) }],
  declined: [{ declined_at: at(1), decline_reason: 'We do not stock that garment' }, null],
  cancelled: [{ cancelled_at: at(1), cancel_reason: 'Batch merged into NS-1002' }, null],
  reapproval_required: [{ authorized_revision: 1, authorized_at: at(5) }, { revision: 2, total: 340 }],
};

function build() {
  const requests = {};
  for (const [name, [r, q]] of Object.entries(cases)) {
    const row = { ...request, ...r };
    const qq = q ? { ...quote, ...q } : null;
    const t = qq ? { ...totals, total: qq.total } : null;
    const v = W.requestView(row, qq, t, qq ? URL_ : null);
    /* statusOf reads "now" for expiry; pin it so the file is stable. */
    v.status = W.statusOf(row, qq, NOW);
    requests[name] = v;
  }
  const ev = (id, type, from, to, data) => ({ api_version: W.API_VERSION, event: {
    id, type, request_id: request.public_id, from_status: from, to_status: to, data, created_at: T0 } });
  const events = [
    ev('evt_00000000000000000001', 'request.created', null, 'requested', null),
    ev('evt_00000000000000000002', 'quote.linked', null, null, { quote: 'WHSL000001' }),
    ev('evt_00000000000000000003', 'request.status_changed', 'requested', 'quoted', { quote: 'WHSL000001', revision: 1 }),
    ev('evt_00000000000000000004', 'request.authorized', 'quoted', 'quoted', { revision: 1 }),
    ev('evt_00000000000000000005', 'request.status_changed', 'quoted', 'awaiting_payment', { quote: 'WHSL000001', revision: 1 }),
    ev('evt_00000000000000000006', 'artwork.submitted', 'awaiting_payment', 'awaiting_payment', { version: 2, line: 0 }),
    ev('evt_00000000000000000007', 'request.status_changed', 'awaiting_payment', 'in_production', { quote: 'WHSL000001', revision: 1 }),
    ev('evt_00000000000000000008', 'artwork.changed_after_approval', 'in_production', 'in_production', { version: 3, line: 0 }),
    ev('evt_00000000000000000009', 'request.status_changed', 'in_production', 'delivered', { quote: 'WHSL000001', revision: 1 }),
    ev('evt_00000000000000000010', 'quote.revised', 'quoted', 'quoted', { quote: 'WHSL000001', revision: 2, previous_revision: 1, reapproval_required: true }),
  ];
  /* A signed sample, with a test-only secret, so the receiver's verify code
     can be checked against a known-good header. */
  const testSecret = 'test-only-secret-never-used-in-production';
  const raw = JSON.stringify(events[2]);
  const t = Date.parse(T0);
  const signed = { secret: testSecret, raw_body: raw, header: W.signatureHeader(testSecret, raw, t), signed_at_unix: Math.floor(t / 1000),
    note: 'Verify with the clock pinned to signed_at_unix; the 300 s replay window rejects it otherwise.' };
  const errors = {
    unauthorized: W.err('unauthorized', 'A valid API key is required.'),
    unknown_field: W.err('unknown_field', 'Unknown field: price', 'price'),
    idempotency_conflict: W.err('idempotency_conflict', 'This Idempotency-Key was used with a different body.'),
    revision_mismatch: W.err('revision_mismatch', 'The quote is at revision 2; review it again.', 'revision'),
    payment_received: W.err('payment_received', "Money has been paid on this job. Contact June's Tees to cancel it."),
  };
  return { api_version: W.API_VERSION, statuses: W.STATUSES, requests, events, signed_webhook: signed, errors };
}

const out = JSON.stringify(build(), null, 2) + '\n';
const file = path.join(__dirname, '..', 'docs', 'wholesale-v1-fixtures.json');
if (require.main === module) {
  if (process.argv.includes('--print')) process.stdout.write(out);
  else { fs.writeFileSync(file, out); console.log('wrote ' + file); }
}
module.exports = { build, out, file };
