'use strict';

/* The numbers on /admin/team, worked out away from the database so they can be
   tested: how fast a lead was answered in the shop's own working hours, and
   what a helper has earned in commission.

   Working hours, not wall-clock hours, because a form filled in at 11pm on a
   Friday and answered at 9:20 on Monday was answered in twenty minutes, not
   fifty-eight hours — and a scorecard that says otherwise teaches a helper to
   stop caring about the number. */

const DEFAULT_HOURS = { tz: 'America/Chicago', open: 9, close: 17, days: [1, 2, 3, 4, 5] };

/** The wall-clock parts of `date` in `tz`. */
function zoned(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second, dow };
}

/** The instant that reads y-m-d h:00 on a clock in `tz` (DST-safe to the hour). */
function atLocal(y, m, d, h, tz) {
  let guess = Date.UTC(y, m - 1, d, h);
  for (let i = 0; i < 3; i++) {
    const z = zoned(new Date(guess), tz);
    const shown = Date.UTC(z.y, z.m - 1, z.d, z.h, z.min, z.s);
    const want = Date.UTC(y, m - 1, d, h);
    if (shown === want) break;
    guess += want - shown;
  }
  return guess;
}

/** Minutes between two instants that fall inside working hours. */
function businessMinutesBetween(start, end, hours = DEFAULT_HOURS) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  const { tz, open, close, days } = { ...DEFAULT_HOURS, ...hours };
  let total = 0;
  // Walk calendar days in the shop's zone; 400 days is far past any real gap.
  let z = zoned(new Date(a), tz);
  let cursor = Date.UTC(z.y, z.m - 1, z.d);
  for (let i = 0; i < 400; i++) {
    const day = new Date(cursor);
    const y = day.getUTCFullYear(), m = day.getUTCMonth() + 1, d = day.getUTCDate();
    const dayStart = atLocal(y, m, d, open, tz);
    if (dayStart > b) break;
    if (days.includes(day.getUTCDay())) {
      const dayEnd = atLocal(y, m, d, close, tz);
      const from = Math.max(a, dayStart);
      const to = Math.min(b, dayEnd);
      if (to > from) total += (to - from) / 60000;
    }
    cursor += 86400000;
  }
  return Math.round(total);
}

function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* Commission on one quote.
     collected   every ledger row on the quote, summed: payments less refunds,
                 lost disputes and corrections, with card fees taken out
     total, tax  the quote's, so tax the shop only holds for the state is not
                 paid out as commission
   Payable once the job is paid in full (or settled) and 14 days have passed
   since the last money moved, so a quick refund cannot claw back a payout,
   and never while a dispute is open. */
const HOLD_DAYS = 14;

function commissionFor({ collected, total, tax, pct }) {
  const t = Number(total) || 0;
  const netCollected = Math.max(0, Number(collected) || 0);
  if (t <= 0 || !(pct > 0)) return { base: 0, amount: 0 };
  const preTaxShare = Math.max(0, Math.min(1, (t - (Number(tax) || 0)) / t));
  const base = round2(netCollected * preTaxShare);
  return { base, amount: round2(base * pct / 100) };
}

function commissionState({ paidInFull, lastMoneyAt, disputeOpen, alreadyPaid, now = Date.now() }) {
  if (alreadyPaid) return 'paid';
  if (disputeOpen) return 'on hold';
  if (!paidInFull) return 'earning';
  const last = new Date(lastMoneyAt || 0).getTime();
  return now - last >= HOLD_DAYS * 86400000 ? 'payable' : 'waiting';
}

/** Monday of the week containing `date`, as YYYY-MM-DD in the shop's zone. */
function weekOf(date, tz = DEFAULT_HOURS.tz) {
  const z = zoned(new Date(date), tz);
  const utc = Date.UTC(z.y, z.m - 1, z.d);
  const back = (z.dow + 6) % 7;
  return new Date(utc - back * 86400000).toISOString().slice(0, 10);
}

module.exports = {
  DEFAULT_HOURS, HOLD_DAYS, businessMinutesBetween, median, commissionFor, commissionState, weekOf, zoned,
};
