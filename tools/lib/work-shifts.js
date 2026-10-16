'use strict';

/* The team's working hours (owner, 2026-10-14: "add a schedule for work for
   the helper. Convert the time and show in Chicago time and Philippines
   time"). A shift is a weekday and a start and end time in the zone the
   owner typed it in; every view shows it in both zones, worked out for the
   real dates of that week, so Chicago's daylight-saving change moves the
   Manila side by an hour, as it really does. Manila keeps no daylight saving.
   An end before the start runs past midnight. Kept apart from the SQL so the
   arithmetic can be tested. */

const ZONES = {
  'America/Chicago': { label: 'Chicago', short: 'CT' },
  'Asia/Manila': { label: 'Philippines', short: 'PH' },
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const NOTE_MAX = 120;

/** Minutes after midnight from "9:00", "09:30", "21:15" (an <input type=time>),
 *  or null. */
function minutesOf(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}

/** The zone's offset from UTC in minutes at an instant. */
function offsetAt(instantMs, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - instantMs) / 60000);
}

/** The instant a wall-clock time happens in a zone: date "YYYY-MM-DD" plus
 *  minutes after that midnight (may exceed a day). */
function instantOf(date, minutes, zone) {
  const [y, mo, d] = String(date).split('-').map(Number);
  const wall = Date.UTC(y, mo - 1, d) + minutes * 60000;
  let t = wall - offsetAt(wall, zone) * 60000;
  t = wall - offsetAt(t, zone) * 60000;   // second pass settles a DST edge
  return new Date(t);
}

/** "YYYY-MM-DD" of the Monday of the week holding this date, as the zone sees it. */
function mondayOf(now, zone) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, mo, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  const back = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - back);
  return dt.toISOString().slice(0, 10);
}

function addDays(date, n) {
  const [y, mo, d] = String(date).split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
}

/** Each shift's start and end instants in the week starting `monday` (a date
 *  in the shift's own zone's calendar). weekday: 1 = Monday … 7 = Sunday. */
function occurrences(shifts, monday) {
  return shifts.map((s) => {
    const date = addDays(monday, Number(s.weekday) - 1);
    const end = Number(s.end_min) <= Number(s.start_min) ? Number(s.end_min) + 1440 : Number(s.end_min);
    return { ...s, start: instantOf(date, Number(s.start_min), s.zone), end: instantOf(date, end, s.zone) };
  /* A shift's weeks are counted in the zone it was typed in, the way it was
     written: "Mon-Fri 9 AM Philippines, week of Oct 19 only" is Mon Oct 19 to
     Fri Oct 23 in Manila (review: counting Chicago days dropped that Monday,
     which is still Sunday in Chicago, and added the next one). */
  }).filter((o) => inRange(o, dateIn(o.start, o.zone))).sort((a, b) => a.start - b.start);
}

/** The weekday (1 = Monday ... 7 = Sunday) a shift starts on in `zone`, in
 *  the week of `monday`: "Mon 9 AM Philippines" is a Sunday in Chicago. */
function weekdayIn(shift, monday, zone) {
  const [o] = occurrences([{ ...shift, starts_on: null, ends_on: null }], monday);
  const d = new Date(`${dateIn(o.start, zone)}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Whether a weekly shift runs on `date` ("YYYY-MM-DD", in the shift's own
 *  zone): on or after its first day and, when it has one, on or before its
 *  last (owner, 2026-10-15: "I added another schedule, but it just added to
 *  this week's date. Can we send those to next week instead"). A shift with
 *  neither runs every week, as every shift did before. */
function inRange(s, date) {
  const from = validDate(s && s.starts_on), to = validDate(s && s.ends_on);
  return (!from || date >= from) && (!to || date <= to);
}

/** The Monday of each week from `monday`, `n` of them. */
function weeksFrom(monday, n) {
  return Array.from({ length: n }, (_, i) => addDays(monday, 7 * i));
}

/** "YYYY-MM-DD" of an instant as a zone's calendar sees it. */
function dateIn(d, zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** The shifts that START in the seven days from `monday` as `zone` counts
 *  them. A shift typed in another zone can land on the day before or after
 *  (Mon 9 AM in Manila is Sun evening in Chicago), so the weeks either side
 *  are worked out too and kept when they fall inside. */
function weekOccurrences(shifts, monday, zone) {
  const last = addDays(monday, 6);
  return [-7, 0, 7].flatMap((n) => occurrences(shifts, addDays(monday, n)))
    .filter((o) => { const d = dateIn(o.start, zone); return d >= monday && d <= last; })
    .sort((a, b) => a.start - b.start);
}

/** A real calendar date "YYYY-MM-DD" (not 2026-02-31), else null. */
function validDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === m[0] ? m[0] : null;
}

/** "Mon Oct 13, 9:00 AM" in a zone. */
function when(d, zone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit' }).format(d);
}
/** "9:00 AM" in a zone. */
function clock(d, zone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(d);
}
/** "Mon Oct 13" in a zone. */
function dayLabel(d, zone) {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}

/** A shift as one line per zone: { 'America/Chicago': 'Mon Oct 13, 9:00 AM – 2:00 PM', ... }.
 *  The end carries its own day when it falls on another one. */
/* The zones a helper can work from (owner, 2026-10-16: "when new hires
   please ask them their time zones"). A helper sees their schedule in theirs;
   not yet asked reads as the Philippines, where the team has been. */
const STAFF_ZONES = {
  'Asia/Manila': 'Philippines',
  'America/Chicago': 'US Central (Chicago)',
  'America/New_York': 'US Eastern (New York)',
  'America/Denver': 'US Mountain (Denver)',
  'America/Phoenix': 'Arizona',
  'America/Los_Angeles': 'US Pacific (Los Angeles)',
};
const DEFAULT_STAFF_ZONE = 'Asia/Manila';
function staffZoneOf(v) { return Object.hasOwn(STAFF_ZONES, String(v || '')) ? String(v) : DEFAULT_STAFF_ZONE; }
function staffZoneLabel(z) { return STAFF_ZONES[staffZoneOf(z)]; }

function span(o, zones = Object.keys(ZONES)) {
  const out = {};
  for (const z of zones) {
    const sameDay = dayLabel(o.start, z) === dayLabel(o.end, z);
    out[z] = `${when(o.start, z)} – ${sameDay ? clock(o.end, z) : when(o.end, z)}`;
  }
  return out;
}

/** Hours in a shift, to one decimal. */
function hoursOf(o) { return Math.round((o.end - o.start) / 360000) / 10; }

/** Minutes past local midnight of an instant, as a zone's clock reads it. */
function localMinutes(d, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

/** A shift cut at each midnight of `zone`, for a calendar: one piece per day
 *  it touches, [{ date: "YYYY-MM-DD", from, to }] in minutes past that day's
 *  midnight (to = 1440 for a piece that runs to midnight). */
function daySegments(o, zone) {
  const out = [];
  let at = new Date(o.start);
  const end = new Date(o.end);
  for (let guard = 0; at < end && guard < 3; guard++) {
    const date = dateIn(at, zone);
    const nextMidnight = instantOf(addDays(date, 1), 0, zone);
    const stop = end < nextMidnight ? end : nextMidnight;
    out.push({ date, from: localMinutes(at, zone), to: stop === end ? (localMinutes(end, zone) || 1440) : 1440 });
    at = stop;
  }
  return out;
}

function cleanNote(n) { return String(n || '').replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NOTE_MAX); }

module.exports = { STAFF_ZONES, DEFAULT_STAFF_ZONE, staffZoneOf, staffZoneLabel, weekdayIn, inRange, weeksFrom, ZONES, DAYS, NOTE_MAX, localMinutes, daySegments, minutesOf, offsetAt, instantOf, mondayOf, addDays, occurrences, dateIn, weekOccurrences, validDate, when, clock, span, hoursOf, cleanNote };
