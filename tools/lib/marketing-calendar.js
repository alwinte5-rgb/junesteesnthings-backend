'use strict';

/* When to start marketing each occasion (owner, 2026-10-17: "Add a date thing
 * where I could start ads and start marketing for these occasions. I would like
 * to prepare in advance ... I want to start at least 6 weeks before the actual
 * season").
 *
 * Every occasion has an event date (worked out each year) and a season start:
 * the day customers start ORDERING, not the day of the event. Counted back from
 * the season start:
 *
 *   prep      10 weeks before   pick designs and photos, update the page
 *   ads        6 weeks before   Google Ads campaign on, Brevo campaign out
 *                               (6 weeks is the minimum an occasion may set)
 *   order by   4 weeks before the event: standard turnaround is 7 to 14
 *              business days after proof approval, so 2 weeks could miss it
 *
 * Social posts run from the ads date to the order-by date. The holiday pages
 * print their "when to order" line from here (tools/occasion-pages.js), and
 * the admin's marketing calendar (/admin/marketing-calendar) reads the same
 * list, so they agree.
 *
 * Dates are plain calendar days (UTC midnight), so no timezone can move one.
 */

const DAY = 86400000;
const MIN_ADS_WEEKS = 6;

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));
const addDays = (t, n) => new Date(t.getTime() + n * DAY);
/* The nth weekday (0 = Sunday) of a month. */
const nthWeekday = (y, m, wd, n) => { const first = d(y, m, 1); return addDays(first, ((wd - first.getUTCDay() + 7) % 7) + (n - 1) * 7); };
/* Easter Sunday (anonymous Gregorian algorithm). */
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, dd = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(y, month, day);
}

/* event(y): the day itself. season(y): when customers start ordering.
   live: a page exists for it (the rest are on the calendar so the owner knows
   when to collect photos for them). */
const OCCASIONS = [
  { id: 'black-history-month', note: 'Black History Month runs through February.', name: 'Black History Month', event: (y) => d(y, 2, 1), end: (y) => d(y, 2, 28), season: (y) => d(y - 1, 12, 1), page: '/occasions/black-history-month-shirts-chicago.html', push: 'School and church shirts, custom artwork' },
  { id: 'senior-night-winter', name: 'Senior night (winter sports)', event: (y) => d(y, 2, 1), season: (y) => d(y - 1, 12, 1), page: '/services/big-head-cutouts.html', push: 'Big head cutouts, senior posters, parent shirts' },
  { id: 'valentines', note: "Valentine's Day is February 14.", name: "Valentine's Day", event: (y) => d(y, 2, 14), season: (y) => d(y - 1, 12, 15), page: '/occasions/valentines-day-gifts-chicago.html', push: 'Wine glass gift sets, couples paint kits, couples shirts' },
  { id: 'easter', name: 'Easter', event: easter, season: (y) => addDays(easter(y), -56), page: '', push: 'Family Easter shirts, kids tees, baskets and bags' },
  { id: 'graduation', name: 'Graduation and prom', event: (y) => d(y, 5, 29), end: (y) => d(y, 6, 15), season: (y) => d(y, 3, 15), page: 'https://design.jtees.net/collection.php?c=graduation', push: 'Big head cutouts, grad family shirts, senior jeans, yard signs, prom send-offs' },
  { id: 'senior-night-spring', name: 'Senior night (spring sports)', event: (y) => d(y, 5, 1), season: (y) => d(y, 3, 1), page: '/services/big-head-cutouts.html', push: 'Big head cutouts, senior posters, parent shirts' },
  { id: 'mothers-day', note: "Mother's Day is the second Sunday in May.", name: "Mother's Day", event: (y) => nthWeekday(y, 5, 0, 2), season: (y) => d(y, 3, 15), page: '/occasions/mothers-day-gifts-chicago.html', push: 'Mom and grandma shirts, photo gifts, mugs, totes' },
  { id: 'fathers-day', name: "Father's Day", event: (y) => nthWeekday(y, 6, 0, 3), season: (y) => d(y, 5, 1), page: '', push: 'Dad shirts, photo mugs, engraved flasks and tumblers' },
  { id: 'juneteenth', note: 'Juneteenth is June 19.', name: 'Juneteenth', event: (y) => d(y, 6, 19), season: (y) => d(y, 5, 1), page: '/occasions/juneteenth-shirts-chicago.html', push: 'Juneteenth family, festival and Greek organization shirts' },
  { id: 'weddings', note: 'Wedding season is busiest from May through September.', name: 'Wedding season', event: (y) => d(y, 6, 15), end: (y) => d(y, 9, 30), season: (y) => d(y, 4, 1), page: '/occasions/wedding-bachelorette-chicago.html', push: 'Mr and Mrs glassware, bridesmaid gifts, bachelorette shirts' },
  { id: 'july-4', name: 'Fourth of July', event: (y) => d(y, 7, 4), season: (y) => d(y, 5, 15), page: '', push: 'Family cookout and reunion shirts' },
  { id: 'family-reunions', name: 'Family reunion season', event: (y) => d(y, 7, 15), end: (y) => d(y, 8, 31), season: (y) => d(y, 5, 1), page: 'https://design.jtees.net/collection.php?c=family-reunion', push: 'Family reunion shirts, banners, bulk orders' },
  { id: 'back-to-school', name: 'Back to school', event: (y) => d(y, 8, 20), season: (y) => d(y, 7, 1), page: '', push: 'First day shirts, teacher shirts, school spirit wear' },
  { id: 'senior-night-fall', name: 'Senior night (fall sports)', event: (y) => d(y, 10, 1), season: (y) => d(y, 8, 15), page: '/services/big-head-cutouts.html', push: 'Big head cutouts, senior posters, parent shirts' },
  { id: 'chicago-marathon', name: 'Chicago Marathon', event: (y) => nthWeekday(y, 10, 0, 2), season: (y) => d(y, 8, 15), page: '/services/big-head-cutouts.html', push: 'Big head cutouts, runner support shirts, race signs' },
  { id: 'halloween', note: 'Halloween is October 31.', name: 'Halloween', event: (y) => d(y, 10, 31), season: (y) => d(y, 9, 1), page: '/occasions/halloween-shirts-chicago.html', push: 'Witch squad and group costume shirts, kids shirts' },
  { id: 'christmas', note: 'Christmas is December 25.', name: 'Christmas', event: (y) => d(y, 12, 25), season: (y) => d(y, 11, 1), page: '/occasions/christmas-shirts-chicago.html', push: 'Family Christmas shirts, photo gifts, Santa sacks' },
];

/* `end` marks an occasion that is a whole season, not one day: weddings run
   May to September, reunions all summer, Black History Month all February,
   and graduation and prom May into mid-June (owner, 2026-10-17: "graduation
   should be a season too"; its event is the late-May peak, the same date the
   email campaign in tools/lib/events.js counts from). Orders stay open until
   4 weeks before the season's LAST day, so a season reads "orders closed"
   only once even its last date can no longer be made. Without `end`, the
   event day is the end. A season opens at least 2 weeks before its last
   order day; datesFor refuses any occasion that breaks that. Seasons that
   cross New Year start in the year before the event (y - 1). */

/* Lead times in weeks before the season start. adsWeeks may be raised per
   occasion; it may never go under MIN_ADS_WEEKS. */
const DEFAULT_LEAD = { prepWeeks: 10, adsWeeks: 6, orderByDays: 28 };
const LEAD = {};

function datesFor(o, y) {
  const lead = { ...DEFAULT_LEAD, ...(LEAD[o.id] || {}) };
  if (lead.adsWeeks < MIN_ADS_WEEKS) throw new Error(`${o.id}: ads must start at least ${MIN_ADS_WEEKS} weeks before the season`);
  const event = o.event(y), season = o.season(y), end = o.end ? o.end(y) : event;
  const orderBy = addDays(end, -lead.orderByDays);
  if ((orderBy - season) / DAY < 14) throw new Error(`${o.id} ${y}: the season must open at least 2 weeks before the last order day`);
  return {
    id: o.id, name: o.name, note: o.note || '', year: y, page: o.page, push: o.push, live: !!o.page,
    event, end, season, orderBy,
    prep: addDays(season, -7 * lead.prepWeeks),
    ads: addDays(season, -7 * lead.adsWeeks),
  };
}

const today = (now) => d(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());

/* Status on a given day: upcoming, prep now, ads now, in season, orders closed
   (past the last order day, before the end), or past. */
function status(e, now = new Date()) {
  const t = today(now);
  if (t > e.end) return 'past';
  if (t > e.orderBy) return 'orders closed';
  if (t >= e.season) return 'in season';
  if (t >= e.ads) return 'ads now';
  if (t >= e.prep) return 'prep now';
  return 'upcoming';
}

/* Every occasion's next occurrence (the one that has not ended),
   in order of its prep date. */
function upcoming(now = new Date()) {
  const t = today(now), y = t.getUTCFullYear();
  return OCCASIONS.map((o) => {
    const cur = datesFor(o, y);
    return cur.end >= t ? cur : datesFor(o, y + 1);
  }).sort((a, b) => a.prep - b.prep);
}

function nextFor(id, now = new Date()) {
  return upcoming(now).find((e) => e.id === id) || null;
}

/* What needs the owner now: an occasion is shown from its prep date until its
   season starts. Once the season is here it is too late to start, so it drops
   off (owner: "I dont want the calendar to warn when the season is here"). */
function dueNow(now = new Date()) {
  return upcoming(now).filter((e) => ['prep now', 'ads now'].includes(status(e, now)));
}

/* Social posts: about 2–3 a week from the ads date to the order-by date. */
function postDates(e) {
  const out = [];
  for (let t = e.ads; t <= e.orderBy; t = addDays(t, 3)) out.push(t);
  return out;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const longDate = (t) => `${WEEKDAYS[t.getUTCDay()]}, ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`;
const shortDate = (t) => `${MONTHS[t.getUTCMonth()].slice(0, 3)} ${t.getUTCDate()}, ${t.getUTCFullYear()}`;
const ymd = (t) => t.toISOString().slice(0, 10);

module.exports = { OCCASIONS, DEFAULT_LEAD, MIN_ADS_WEEKS, datesFor, upcoming, nextFor, dueNow, status, postDates, easter, nthWeekday, longDate, shortDate, ymd };
