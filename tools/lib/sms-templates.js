'use strict';

/* Customer text messages — the wording, in one place.

   Rules every template here keeps (tests/sms-templates.test.js enforces them):
   - plain GSM-7 characters only. One curly quote or em-dash turns the whole
     message into UCS-2, where a segment holds 70 characters instead of 160 and
     the same text costs two or three times as much.
   - one segment (160) at realistic field lengths.
   - starts with the brand, ends with the opt-out, as the SMS terms promise.

   Each builder returns { template, body }. `template` is the dedupe key used
   in sms_messages, so it must stay stable once texts have been sent. */

const BRAND = "June's Tees";
const STOP = 'Reply STOP to opt out.';
const PICKUP = '3047 N Lincoln Ave, Mon-Fri 10:30am-6pm';

// Strip anything outside printable ASCII so a customer name or a pasted
// tracking number cannot push the message out of GSM-7.
function plain(s, max) {
  const t = String(s == null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
  return max && t.length > max ? t.slice(0, max) : t;
}

function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? '$' + v.toFixed(2) : '';
}

const T = {
  // Quote orders (the admin board)
  paymentReceived: ({ code, amount, stillDue }) => ({
    template: 'payment-received',   // the caller's ref is the payment itself
    body: `${BRAND}: We got your payment of ${money(amount)} for order ${plain(code, 12)}.` +
      (Number(stillDue) > 0 ? ` Balance ${money(stillDue)} due before pickup/delivery.` : ' Paid in full, thank you!') +
      ` ${STOP}`,
  }),
  inProduction: ({ code }) => ({
    template: 'in-production',
    body: `${BRAND}: Order ${plain(code, 12)} is in production now. We'll text you when it's ready. ${STOP}`,
  }),
  readyForPickup: ({ code }) => ({
    template: 'ready',
    body: `${BRAND}: Order ${plain(code, 12)} is ready for pickup at ${PICKUP}. Text (773) 849-1854 when you're outside. ${STOP}`,
  }),
  finished: ({ code }) => ({
    template: 'ready',
    body: `${BRAND}: Order ${plain(code, 12)} is finished! We'll reach out to set up pickup or delivery. ${STOP}`,
  }),
  shipped: ({ code, tracking }) => {
    const t = plain(tracking, 40);
    return {
      template: t ? 'shipped:' + t : 'shipped',
      body: `${BRAND}: Order ${plain(code, 12)} has shipped!` + (t ? ` Tracking: ${t}.` : '') + ` ${STOP}`,
    };
  },

  // Marketing: the "your work is saved" popup. Two segments when a cart link is
  // included — the restore link is long and cannot be shortened safely.
  cartCode: ({ code, pct, restoreUrl }) => ({
    template: 'cart-code',
    body: `${BRAND}: Your ${Number(pct) || 10}% off first-order code is ${plain(code, 20)}.` +
      (restoreUrl ? ` Pick up where you left off: ${plain(restoreUrl, 120)}` : ' Design yours at https://design.jtees.net') +
      ` ${STOP}`,
  }),

  // The one follow-up, 3+ days after a popup capture with a saved cart.
  cartFollowup: ({ code, pct, restoreUrl }) => ({
    template: 'cart-followup',
    body: `${BRAND}: Still thinking it over? Your design is saved: ${plain(restoreUrl, 120)}` +
      ` Code ${plain(code, 20)} still takes ${Number(pct) || 10}% off your first order. ${STOP}`,
  }),

  // Design-studio orders (design.jtees.net)
  studioOrderPlaced: ({ orderId }) => ({
    template: 'studio-order-placed',
    body: `${BRAND}: Thanks! Order #${plain(orderId, 10)} is in. We'll text you when it ships or is ready. ${STOP}`,
  }),
  studioOrderShipped: ({ orderId, tracking }) => {
    const t = plain(tracking, 40);
    return {
      template: t ? 'studio-shipped:' + t : 'studio-shipped',
      body: `${BRAND}: Order #${plain(orderId, 10)} has shipped!` + (t ? ` Tracking: ${t}.` : '') + ` ${STOP}`,
    };
  },
};

// GSM-7 basic set is a superset of what `plain` lets through, bar a few ASCII
// characters that cost two slots; none of those appear in these templates.
function isGsm7(s) {
  return /^[\x20-\x7E\n]*$/.test(s) && !/[\[\]{}\\^~|`]/.test(s);
}

module.exports = { T, plain, isGsm7 };
