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
  }).sort((a, b) => a.start - b.start);
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
function span(o) {
  const out = {};
  for (const z of Object.keys(ZONES)) {
    const sameDay = dayLabel(o.start, z) === dayLabel(o.end, z);
    out[z] = `${when(o.start, z)} – ${sameDay ? clock(o.end, z) : when(o.end, z)}`;
  }
  return out;
}

/** Hours in a shift, to one decimal. */
function hoursOf(o) { return Math.round((o.end - o.start) / 360000) / 10; }

function cleanNote(n) { return String(n || '').replace(/[\r\n\t]+/g, ' ').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NOTE_MAX); }

module.exports = { ZONES, DAYS, NOTE_MAX, minutesOf, offsetAt, instantOf, mondayOf, addDays, occurrences, dateIn, weekOccurrences, validDate, when, clock, span, hoursOf, cleanNote };
