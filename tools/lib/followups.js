'use strict';

/* The automatic reminders a job still has coming (2026-10-15), for the
   "Coming up" list on its Messages card.

   Each entry mirrors one hourly sweep in server.js — sendQuoteFollowUps,
   sendDepositReminders, sendBalanceReminders, sendPickupReminders — and must
   change with it: the same conditions, the same stamp column (which is also
   how Skip works: stamping it is exactly what the sweep does after sending),
   and the same delay setting. The sweeps only run in texting hours, so the
   time shown is the first texting-hours moment at or after the delay. */

const TZ = 'America/Chicago';
const OPEN_HOUR = 9;    // inTextingHours(): 9am-6pm Chicago
const CLOSE_HOUR = 18;

const REMINDERS = {
  'follow-up': { stamp: 'followed_up_at', label: 'Quote follow-up', what: 'Checks in on a quote they have not accepted' },
  'deposit-reminder': { stamp: 'deposit_nudged_at', label: 'Deposit reminder', what: 'Asks for the deposit on an accepted quote' },
  'balance-reminder': { stamp: 'balance_nudged_at', label: 'Balance reminder', what: 'Reminds them of the balance still owed' },
  'pickup-reminder': { stamp: 'pickup_nudged_at', label: 'Pickup reminder', what: 'Reminds them their order is ready to collect' },
};

function hourIn(d) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d)) % 24;
}

/* The first moment at or after `d` when the sweeps run (on the hour). */
function nextSendTime(d) {
  let t = new Date(Math.ceil(d.getTime() / 3600e3) * 3600e3);
  for (let i = 0; i < 48; i++) {
    const h = hourIn(t);
    if (h >= OPEN_HOUR && h < CLOSE_HOUR) return t;
    t = new Date(t.getTime() + 3600e3);
  }
  return t;
}

const at = (v) => (v ? new Date(v) : null);
const num = (v) => Number(v) || 0;

/**
 * What is still coming for one quote row.
 * @param q       the quotes row (snake_case columns, as the sweeps read them)
 * @param o.now   Date
 * @param o.balanceDue  balanceOf(q), the figure the balance sweep checks
 * @param o.refunded / o.disputed  whether a refund or dispute exists
 * @param o.days  { followup, deposit (hours), balance, pickup } from the same env settings
 * @returns [{ key, label, what, when: Date, overdue: bool, channels: ['email','text'] }]
 */
function upcomingReminders(q, { now = new Date(), balanceDue = 0, refunded = false, disputed = false, days = {} } = {}) {
  const d = { followup: 3, deposit: 12, balance: 7, pickup: 2, ...days };
  const reachable = Boolean(String(q.email || '').trim() || String(q.phone || '').trim());
  if (!reachable || q.cancelled_at) return [];
  const out = [];
  const add = (key, due) => {
    const when = nextSendTime(due < now ? now : due);
    const channels = [];
    if (String(q.email || '').trim()) channels.push('email');
    if (String(q.phone || '').trim()) channels.push('text');
    out.push({ key, ...REMINDERS[key], when, overdue: due < now, channels });
  };

  /* sendQuoteFollowUps */
  if (!q.accepted_at && !q.followed_up_at && ['sent', 'viewed'].includes(q.status)
      && (q.sent_to_customer_at || q.status === 'viewed') && q.created_at) {
    const due = new Date(at(q.created_at).getTime() + d.followup * 864e5);
    /* valid_until is a date: the sweep requires valid_until >= today when it runs. */
    const lastDay = q.valid_until ? new Date(`${String(q.valid_until).slice(0, 10)}T23:59:59-05:00`) : null;
    if (!lastDay || nextSendTime(due < now ? now : due) <= lastDay) add('follow-up', due);
  }

  /* sendDepositReminders */
  if (q.accepted_at && num(q.paid_amount) === 0 && !q.deposit_nudged_at && !q.delivered_at && !refunded && !disputed) {
    add('deposit-reminder', new Date(at(q.accepted_at).getTime() + d.deposit * 3600e3));
  }

  /* sendBalanceReminders */
  if (num(q.paid_amount) > 0 && num(q.paid_amount) + num(q.written_off) < num(q.total) && !q.balance_nudged_at
      && q.paid_at && !['expired', 'held', 'draft'].includes(q.status) && !refunded && !disputed && balanceDue > 0) {
    add('balance-reminder', new Date(at(q.paid_at).getTime() + d.balance * 864e5));
  }

  /* sendPickupReminders: only within 30 days of being ready. */
  if (q.shipped_at && !q.delivered_at && !q.pickup_nudged_at && ['', 'pickup'].includes(String(q.ship_method || ''))) {
    const due = new Date(at(q.shipped_at).getTime() + d.pickup * 864e5);
    const cutoff = new Date(at(q.shipped_at).getTime() + 30 * 864e5);
    if (nextSendTime(due < now ? now : due) <= cutoff) add('pickup-reminder', due);
  }

  return out.sort((a, b) => a.when - b.when);
}

module.exports = { REMINDERS, upcomingReminders, nextSendTime };
