'use strict';

/* The shop's standing sign-up / cart offer, as a set dollar amount off an
   order over a floor (owner, 2026-11-14: "the percentage discounts are costing
   me for large orders" — $15 off $50+). A percentage scales with the order, so
   10% of a $2,000 uniform job was $200 given away on a code meant to tip a
   first-time customer over the line; a fixed amount costs the same on every
   order.

   ONE place for the numbers and the words. The designer has the twin of this
   (jt_promo_offer() in jt-auth.php) reading the same two variables, so the
   code a popup promises and the discount checkout takes cannot drift apart:
     JT_PROMO_AMOUNT  dollars off        (default 15, 1-100)
     JT_PROMO_MIN     order floor, $     (default 50, 0-1000; never below 2x the amount)
   Out-of-range or non-numeric values fall back to the defaults rather than
   produce "$0 off" or a floor the amount exceeds. */

const DEFAULT_AMOUNT = 15;
const DEFAULT_MIN = 50;

function money(n) {
  return '$' + (Number.isInteger(n) ? String(n) : n.toFixed(2));
}

function promoOffer(env = process.env) {
  let amount = Number(env.JT_PROMO_AMOUNT);
  if (!Number.isFinite(amount) || amount < 1 || amount > 100) amount = DEFAULT_AMOUNT;
  amount = Math.round(amount * 100) / 100;
  let min = env.JT_PROMO_MIN === undefined || env.JT_PROMO_MIN === '' ? DEFAULT_MIN : Number(env.JT_PROMO_MIN);
  if (!Number.isFinite(min) || min < 0 || min > 1000) min = DEFAULT_MIN;
  min = Math.round(min * 100) / 100;
  // A floor under twice the amount would let the code take most of a small order.
  if (min < amount * 2) min = Math.max(DEFAULT_MIN, amount * 2);
  const off = `${money(amount)} off`;
  return {
    amount,
    min,
    off,                                   // "$15 off"
    floor: money(min),                     // "$50"
    short: `${off} ${money(min)}+`,        // "$15 off $50+"
    label: `${off} orders of ${money(min)} or more`, // "$15 off orders of $50 or more"
  };
}

module.exports = { promoOffer, DEFAULT_AMOUNT, DEFAULT_MIN };
