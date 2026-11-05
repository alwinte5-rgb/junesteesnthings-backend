'use strict';
/* Days the shop is closed (owner), as inclusive Chicago-day ranges. A last
   order day must be a day someone is here to take the order, so one that
   lands inside a closure moves back to the last open day before it. Both the
   marketing calendar (homepage, occasion pages, tasks) and the email events
   count their order-by dates through lastOpenDay().
   2026-10-22: closed Nov 25 to 27 for Thanksgiving. 2026-10-29: the last
   Christmas order day moved from Tuesday Nov 24 to Thursday Dec 10. */
const CLOSED = [
  ['2026-11-25', '2026-11-27'],
];

const DAY = 86400000;
/* marketing-calendar.js requires this file, so its ymd is read on use. */
const ymd = (t) => require('./marketing-calendar').ymd(t);

/** The day `t` (a UTC-midnight Date), or the last open day before it. */
function lastOpenDay(t) {
  let out = t;
  for (let i = 0; i < 60; i++) {
    const day = ymd(out);
    const hit = CLOSED.find(([a, b]) => a <= day && day <= b);
    if (!hit) return out;
    out = new Date(Date.parse(hit[0] + 'T00:00:00Z') - DAY);
  }
  return out;
}

/** Last Christmas order day in year `y` (owner, 2026-10-29): December 10,
    replacing the Tuesday before Thanksgiving (2026-10-28). Orders after it
    are rush orders, at the owner's price, never one worked out here. */
function christmasLastDay(y) {
  return new Date(Date.UTC(y, 11, 10));
}

/* Said everywhere the Christmas order deadline is shown (owner, 2026-10-29).
   Copy only: no rush fee is added anywhere. */
const CHRISTMAS_RUSH_NOTE = 'Rush fees apply after Dec 10 due to holiday demand.';

module.exports = { CLOSED, lastOpenDay, christmasLastDay, CHRISTMAS_RUSH_NOTE };
