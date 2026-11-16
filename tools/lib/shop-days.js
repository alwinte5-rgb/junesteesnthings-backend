'use strict';

/* The shop's working calendar (owner, 2026-11-16: "If the business is closed
   and after 3pm that day doesn't count").

   Closed: Saturdays, Sundays and these holidays: New Year's Day, Memorial Day,
   July 4, Labor Day, Thanksgiving and the Friday after, Christmas Eve,
   Christmas Day and New Year's Eve. A holiday that falls on a weekend is not
   moved to a weekday.

   An order taken on a closed day, or at 3pm or later on an open one, starts
   the next open day. The day an order starts never counts: a needed-by date
   is so many open days after it.

   Every function here is self-contained apart from the others in this file,
   so the staff quote form runs this same source in the browser (toString)
   and the form and the save count the same days. Kept ES5 for that reason.
   Dates are 'YYYY-MM-DD' strings, which sort as dates. */

/** The closed holidays of a year, as 'YYYY-MM-DD'. */
function shopHolidays(year) {
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ymd = function (m, d) { return year + '-' + pad(m) + '-' + pad(d); };
  /* Day of month of the nth weekday wd (0 Sunday) of month m (1-12); n = -1 is the last. */
  var nth = function (m, wd, n) {
    if (n > 0) {
      var first = new Date(Date.UTC(year, m - 1, 1)).getUTCDay();
      return 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
    }
    var last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    var lastWd = new Date(Date.UTC(year, m - 1, last)).getUTCDay();
    return last - ((lastWd - wd + 7) % 7);
  };
  var thanksgiving = nth(11, 4, 4);
  return [ymd(1, 1), ymd(5, nth(5, 1, -1)), ymd(7, 4), ymd(9, nth(9, 1, 1)),
    ymd(11, thanksgiving), ymd(11, thanksgiving + 1), ymd(12, 24), ymd(12, 25), ymd(12, 31)];
}

/** Is the shop closed on this 'YYYY-MM-DD'? */
function shopClosed(ymd) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return false;
  var wd = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return wd === 0 || wd === 6 || shopHolidays(+m[1]).indexOf(ymd) !== -1;
}

/** 'YYYY-MM-DD' moved n calendar days. */
function shopAddDays(ymd, n) {
  var d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The shop's date and minutes past midnight at a moment, in its timezone. */
function shopClock(at, tz) {
  var p = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(at)).forEach(function (x) { p[x.type] = x.value; });
  /* hourCycle h23 still renders midnight as 24 in some ICU builds. */
  return { ymd: p.year + '-' + p.month + '-' + p.day, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** The day an order taken at `at` starts: that day when the shop is open and
 *  it is before the cutoff (minutes past midnight), else the next open day. */
function shopStartDay(at, cutoffMin, tz) {
  var c = shopClock(at, tz);
  var d = c.ymd;
  if (!shopClosed(d) && c.min < cutoffMin) return d;
  do { d = shopAddDays(d, 1); } while (shopClosed(d));
  return d;
}

/** Open days from an order taken at `at` to the 'YYYY-MM-DD' `end`: the
 *  start day does not count, `end` does when it is open. 0 for a date on or
 *  before the start day; null for no date. */
function shopDaysUntil(end, at, cutoffMin, tz) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(end || ''))) return null;
  var d = shopStartDay(at, cutoffMin, tz);
  var n = 0;
  while (d < end) {
    d = shopAddDays(d, 1);
    if (!shopClosed(d)) n++;
  }
  return n;
}

module.exports = { shopHolidays, shopClosed, shopAddDays, shopClock, shopStartDay, shopDaysUntil };
