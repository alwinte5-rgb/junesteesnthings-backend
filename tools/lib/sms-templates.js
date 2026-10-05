'use strict';

/* Customer text messages — the wording, in one place.

   Rules every template here keeps (tests/sms-templates.test.js enforces them):
   - plain GSM-7 characters only. One curly quote or em-dash turns the whole
     message into UCS-2, where a segment holds 70 characters instead of 160 and
     the same text costs two or three times as much.
   - one segment (160) at realistic field lengths, except the two
     ready-for-pickup texts: two segments (306), because the pickup steps
     are the whole point of them.
   - starts with the brand, ends with the opt-out, as the SMS terms promise.

   Each builder returns { template, body }. `template` is the dedupe key used
   in sms_messages, so it must stay stable once texts have been sent. */

const BRAND = "June's Tees";
const STOP = 'Reply STOP to opt out.';
const PICKUP = '3047 N Lincoln Ave, Mon-Fri 10:30am-6pm';
/* How a pickup works (owner, 2026-10-05). The shop is on the 4th floor
   behind an intercom, so "text when you're outside" left people on the
   street; every ready-for-pickup message carries these steps. */
const PICKUP_ADDRESS = '3047 N Lincoln Ave, Chicago, IL 60657';
const PICKUP_HOURS = 'Mon-Fri 10:30am-6pm';
const PICKUP_STEPS = [
  'Call or text (773) 849-1854 an hour before you arrive, so we can confirm',
  "Ring the intercom for June's Tees and we'll let you in",
  'Come up to the 4th floor and have a seat in the lobby',
];
const PICKUP_SMS = `Call/text (773) 849-1854 an hour before to confirm. Ring the intercom for June's Tees, come up to the 4th floor and have a seat in the lobby.`;

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

/* Warm, signed by name where we have one, and every text carries a link to
   the website (owner, 2026-10-05): the order's own page when there is one,
   else the home page. Two segments (306) is the budget; the pickup texts may
   run to three, because the way in (intercom, 4th floor) is the point. */
const SITE = 'https://www.jtees.net';
const hi = (first) => { const f = plain(first, 20).split(' ')[0]; return f ? f : ''; };
const lnk = (link) => plain(link || SITE, 90);

const T = {
  // Quote orders (the admin board)
  paymentReceived: ({ code, amount, stillDue, first, link }) => ({
    template: 'payment-received',   // the caller's ref is the payment itself
    body: `${BRAND}: Thank you${hi(first) ? ', ' + hi(first) : ''}! We got your ${money(amount)} payment for order ${plain(code, 12)}.` +
      (Number(stillDue) > 0 ? ` The balance of ${money(stillDue)} is due before pickup or delivery.` : " You're all paid up.") +
      ` Your order: ${lnk(link)} ${STOP}`,
  }),
  inProduction: ({ code, first, link }) => ({
    template: 'in-production',
    body: `${BRAND}: Good news${hi(first) ? ', ' + hi(first) : ''}! Your order ${plain(code, 12)} is in production. We'll text you the moment it's ready. Details: ${lnk(link)} ${STOP}`,
  }),
  readyForPickup: ({ code, first, link }) => ({
    template: 'ready',
    body: `${BRAND}: ${hi(first) ? hi(first) + ', y' : 'Y'}our order ${plain(code, 12)} is ready! Pickup: ${PICKUP}. ${PICKUP_SMS} ${lnk(link)} ${STOP}`,
  }),
  // Ready, for local delivery: the delivery board tells them the day.
  finished: ({ code, first, link }) => ({
    template: 'ready',
    body: `${BRAND}: ${hi(first) ? hi(first) + ', y' : 'Y'}our order ${plain(code, 12)} is finished and looking great! We'll bring it to you on your delivery day. Details: ${lnk(link)} ${STOP}`,
  }),
  shipped: ({ code, tracking, first, link }) => {
    const t = plain(tracking, 40);
    return {
      template: t ? 'shipped:' + t : 'shipped',
      body: `${BRAND}: ${hi(first) ? hi(first) + ', y' : 'Y'}our order ${plain(code, 12)} is on its way!` + (t ? ` Tracking: ${t}.` : '') +
        ` Details: ${lnk(link)} ${STOP}`,
    };
  },
  // The one follow-up on a quote that has gone quiet (sendQuoteFollowUps).
  quoteFollowup: ({ code, first, link }) => ({
    template: 'quote-followup',
    body: `${BRAND}: Hi${hi(first) ? ' ' + hi(first) : ''}, just checking in on your quote ${plain(code, 12)}. Happy to adjust colors, sizes or quantities, just reply here. Your quote: ${lnk(link)} ${STOP}`,
  }),
  // Accepted, no deposit yet (sendDepositReminders).
  depositReminder: ({ code, amount, first, link }) => ({
    template: 'deposit-reminder',
    body: `${BRAND}: Thanks for approving your quote${hi(first) ? ', ' + hi(first) : ''}! The ${money(amount)} deposit saves your spot on our schedule. Pay whenever you're ready: ${lnk(link)} ${STOP}`,
  }),
  // Deposit in, balance still owed (sendBalanceReminders).
  balanceReminder: ({ code, due, first, link }) => ({
    template: 'balance-reminder',
    body: `${BRAND}: Hi${hi(first) ? ' ' + hi(first) : ''}, your order ${plain(code, 12)} is coming along nicely! The balance of ${money(due)} is due before pickup or delivery. Pay here: ${lnk(link)} ${STOP}`,
  }),
  // Ready for pickup two working days and not collected (sendPickupReminders).
  pickupReminder: ({ code, first, link }) => ({
    template: 'pickup-reminder',
    body: `${BRAND}: Hi${hi(first) ? ' ' + hi(first) : ''}, your order ${plain(code, 12)} is ready and waiting for you! ${PICKUP}, 4th floor. Call/text (773) 849-1854 an hour before you come. ${lnk(link)} ${STOP}`,
  }),

  // Marketing: the "your work is saved" popup. Two segments when a cart link is
  // included — the restore link is long and cannot be shortened safely.
  cartCode: ({ code, pct, restoreUrl }) => ({
    template: 'cart-code',
    body: `${BRAND}: So glad you stopped by! Your ${Number(pct) || 10}% off first-order code is ${plain(code, 20)}.` +
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
    body: `${BRAND}: Thank you! Order #${plain(orderId, 10)} is in and we can't wait to make it. We'll text you when it ships or is ready. ${SITE} ${STOP}`,
  }),
  // A studio order the customer chose to collect (checkout's pickup option).
  studioOrderReady: ({ orderId }) => ({
    template: 'studio-ready',
    body: `${BRAND}: Your order #${plain(orderId, 10)} is ready! Pickup: ${PICKUP}. ${PICKUP_SMS} ${SITE} ${STOP}`,
  }),
  // Local delivery (the delivery board). The caller's ref is per change, so a
  // second move is texted as well as the first. Two segments with the link:
  // it is the customer's only way to pick another time without calling.
  deliveryMoved: ({ ref, when, link }) => ({
    template: 'delivery-moved',
    body: `${BRAND}: Heads up, your delivery for order ${plain(ref, 12)} is now ${plain(when, 40)}. Need a different time? ${plain(link, 90)} ${STOP}`,
  }),
  deliveryOut: ({ ref, window }) => ({
    template: 'delivery-out',
    body: `${BRAND}: Your order ${plain(ref, 12)} is out for delivery today, ${plain(window, 20)}! Questions? Text (773) 849-1854. ${SITE} ${STOP}`,
  }),
  studioOrderShipped: ({ orderId, tracking }) => {
    const t = plain(tracking, 40);
    return {
      template: t ? 'studio-shipped:' + t : 'studio-shipped',
      body: `${BRAND}: Your order #${plain(orderId, 10)} is on its way!` + (t ? ` Tracking: ${t}.` : '') + ` ${SITE} ${STOP}`,
    };
  },
};

// GSM-7 basic set is a superset of what `plain` lets through, bar a few ASCII
// characters that cost two slots; none of those appear in these templates.
function isGsm7(s) {
  return /^[\x20-\x7E\n]*$/.test(s) && !/[\[\]{}\\^~|`]/.test(s);
}

module.exports = { T, plain, isGsm7, SITE, PICKUP, PICKUP_ADDRESS, PICKUP_HOURS, PICKUP_STEPS };
