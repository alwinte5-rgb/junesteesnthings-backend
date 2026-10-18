'use strict';

/* What a customer sees of their job's progress on the quote page: the shop's
   own milestones (the ones the production board already stamps), in the order
   a job goes through them. Pure, so the steps can be tested without a page.

   A later milestone implies the earlier ones: a job stamped "in production"
   without "proof approved" (approval taken by phone) still reads as past the
   proof, because it is. */

function steps(q, { ships = false, local = false } = {}) {
  const has = (c) => !!(q && q[c]);
  const paid = Number((q && q.paid_amount) || 0) > 0;
  const list = [
    { key: 'accepted', label: 'Order placed', at: q && q.accepted_at, done: has('accepted_at') || paid },
    { key: 'deposit', label: 'Deposit paid', at: q && q.paid_at, done: paid },
    { key: 'proof', label: 'Proof approved', at: q && q.proof_ok_at, done: has('proof_ok_at') },
    { key: 'production', label: 'Printing', at: q && q.production_at, done: has('production_at') },
    { key: 'ready', label: ships ? 'Shipped' : local ? 'Ready for delivery' : 'Ready for pickup', at: q && q.shipped_at, done: has('shipped_at') },
    { key: 'delivered', label: ships ? 'Delivered' : local ? 'Delivered' : 'Picked up', at: q && q.delivered_at, done: has('delivered_at') },
  ];
  // A later step done means every earlier one is too.
  let last = -1;
  list.forEach((s, i) => { if (s.done) last = i; });
  list.forEach((s, i) => { if (i < last) s.done = true; });
  const current = list.findIndex((s) => !s.done);
  return { list, current: current === -1 ? list.length : current };
}

/** Whether the tracker is worth showing: once the customer has said yes. */
function shown(q) {
  return !!(q && !q.cancelled_at && (q.accepted_at || Number(q.paid_amount || 0) > 0));
}

/** A typed approval name: letters, spaces and the punctuation names use. */
function cleanApprover(name) {
  return String(name || '').replace(/[^\p{L}\p{M} .'’-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

module.exports = { steps, shown, cleanApprover };
