'use strict';

/* The timeclock: helpers clock in and out on the staff site, and the hours the
   owner approves each week become their paid hours (staff_hours).

   Owner, 2026-10-13: "They are working remotely so it's hard to monitor."
   Decisions: clock hours become pay hours after the owner approves the week;
   30 minutes with no activity is an idle gap the owner keeps or cuts (helpers
   get a "still working?" prompt at 25); flags for lessons open far too long or
   finished far too fast, work done while clocked out, a week that disagrees
   with TimeProof (OnlineJobs.ph's tracker, typed in by the owner, kept for its
   screenshots), and shifts over 10 hours, past midnight or from a new address.

   Activity is a minute-by-minute record (staff_pings): every page a helper
   opens, and a ping from the page while they type, click or scroll in it.
   Nothing here blocks anyone; it shows the owner what to look at.

   tests/timeclock.test.js. */

const TZ = process.env.JT_TZ || 'America/Chicago';
const IDLE_MINUTES = 30;
const PROMPT_MINUTES = 25;
const LONG_SHIFT_HOURS = 10;
const TIMEPROOF_TOLERANCE_MINUTES = 30;
// Activity while clocked out counts once it adds up to this much in a day.
const OFF_CLOCK_MINUTES = 5;
// A lesson is flagged open over this many times its expected minutes, or
// finished in under this share of them (only lessons of 8 minutes or more).
const LESSON_SLOW_X = 3;
const LESSON_FAST_SHARE = 0.25;
const LESSON_FAST_MIN_EXPECTED = 8;

const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const minutesBetween = (a, b) => Math.max(0, Math.round((ms(b) - ms(a)) / 60000));

/** The Chicago calendar day of a moment, "2026-10-13". */
function dayOf(d, tz = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
}

/** Gaps of `idle` minutes or more with no activity inside a shift: from the
 *  start to the first ping, between pings, and from the last ping to the end
 *  (or to `now` for a shift still running). */
function idleGaps(shift, pings, { idle = IDLE_MINUTES, now = Date.now() } = {}) {
  const start = ms(shift.started_at);
  const end = shift.ended_at ? ms(shift.ended_at) : ms(now);
  const inside = pings.map(ms).filter((t) => t >= start && t <= end).sort((a, b) => a - b);
  const marks = [start, ...inside, end];
  const gaps = [];
  for (let i = 1; i < marks.length; i++) {
    const m = Math.floor((marks[i] - marks[i - 1]) / 60000);
    if (m >= idle) gaps.push({ from: new Date(marks[i - 1]), to: new Date(marks[i]), minutes: m });
  }
  return gaps;
}

/** Minutes a shift counts for: its length less what the owner cut. */
function shiftMinutes(shift, now = Date.now()) {
  const end = shift.ended_at || now;
  return Math.max(0, minutesBetween(shift.started_at, end) - (Number(shift.cut_minutes) || 0));
}

/** Pings outside every shift, as minutes per Chicago day (days with at
 *  least OFF_CLOCK_MINUTES only). */
function offClock(shifts, pings, now = Date.now()) {
  /* From the start of the clock-in minute: the clock-in itself is noted as
     activity at the top of its minute, a few seconds before started_at. */
  const spans = shifts.map((s) => [Math.floor(ms(s.started_at) / 60000) * 60000, s.ended_at ? ms(s.ended_at) : ms(now)]);
  const byDay = new Map();
  for (const p of pings) {
    const t = ms(p);
    if (spans.some(([a, b]) => t >= a && t <= b)) continue;
    const d = dayOf(t);
    byDay.set(d, (byDay.get(d) || 0) + 1);
  }
  return [...byDay].filter(([, n]) => n >= OFF_CLOCK_MINUTES).map(([day, minutes]) => ({ day, minutes }));
}

/** Everything worth the owner's eye for one helper's week. `lessons` are
 *  { title, expected, started_at, done_at }; `timeproofMinutes` is what the
 *  owner typed from TimeProof (null when not typed). Each flag is
 *  { kind, tone, text, at }. */
function flags({ shifts = [], pings = [], lessons = [], timeproofMinutes = null, knownIps = [], now = Date.now(), coveringShifts = [] } = {}) {
  const out = [];
  const fmt = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`);
  const sorted = [...shifts].sort((a, b) => ms(a.started_at) - ms(b.started_at));
  const seen = new Set(knownIps.filter(Boolean));
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const len = minutesBetween(s.started_at, s.ended_at || now);
    if (len > LONG_SHIFT_HOURS * 60) {
      out.push({ kind: 'long', tone: 'amber', at: s.started_at, text: `A ${fmt(len)} shift${s.ended_at ? '' : ', still running'}` });
    }
    if (dayOf(s.started_at) !== dayOf(s.ended_at || now)) {
      out.push({ kind: 'overnight', tone: 'amber', at: s.started_at, text: `A shift ${s.ended_at ? 'ran' : 'is running'} past midnight` });
    }
    const next = sorted[i + 1];
    if (next && ms(next.started_at) < ms(s.ended_at || now)) {
      out.push({ kind: 'overlap', tone: 'red', at: next.started_at, text: 'Two shifts overlap' });
    }
    if (s.start_ip && !seen.has(s.start_ip)) {
      if (seen.size) out.push({ kind: 'new-ip', tone: 'neutral', at: s.started_at, text: `Clocked in from a new address (${s.start_ip})` });
      seen.add(s.start_ip);
    }
    for (const g of idleGaps(s, pings, { now })) {
      out.push({ kind: 'idle', tone: 'amber', at: g.from, text: `${fmt(g.minutes)} on the clock with no activity` });
    }
  }
  // `coveringShifts`: shifts from the week before still running into this one.
  for (const d of offClock([...coveringShifts, ...shifts], pings, now)) {
    out.push({ kind: 'off-clock', tone: 'red', at: fromLocalInput(`${d.day}T12:00`), text: `${fmt(d.minutes)} of work on ${d.day} while clocked out` });
  }
  for (const l of lessons) {
    if (!l.started_at || !l.done_at || !(l.expected > 0)) continue;
    const took = minutesBetween(l.started_at, l.done_at);
    if (took > l.expected * LESSON_SLOW_X) {
      out.push({ kind: 'lesson-slow', tone: 'amber', at: l.started_at, text: `"${l.title}" open ${fmt(took)} against ${fmt(l.expected)} expected` });
    } else if (l.expected >= LESSON_FAST_MIN_EXPECTED && took < l.expected * LESSON_FAST_SHARE) {
      out.push({ kind: 'lesson-fast', tone: 'amber', at: l.started_at, text: `"${l.title}" finished in ${fmt(took)} against ${fmt(l.expected)} expected` });
    }
  }
  if (timeproofMinutes != null) {
    const clock = shifts.reduce((n, s) => n + shiftMinutes(s, now), 0);
    const diff = clock - Number(timeproofMinutes);
    if (Math.abs(diff) > TIMEPROOF_TOLERANCE_MINUTES) {
      out.push({ kind: 'timeproof', tone: 'red', at: null,
        text: `The clock says ${fmt(clock)}, TimeProof says ${fmt(Number(timeproofMinutes))} (${diff > 0 ? 'clock' : 'TimeProof'} is ${fmt(Math.abs(diff))} more)` });
    }
  }
  return out.sort((a, b) => (a.at == null) - (b.at == null) || ms(a.at) - ms(b.at));
}

function parts(d, tz) {
  const o = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(d))) o[x.type] = x.value;
  return o;
}

/** "2026-10-13T09:30" for a datetime-local box, on the shop's clock. */
function toLocalInput(d, tz = TZ) {
  const o = parts(d, tz);
  return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;
}

/** The instant a datetime-local value means on the shop's clock, or null. */
function fromLocalInput(v, tz = TZ) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(v || ''));
  if (!m) return null;
  const want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (Number.isNaN(want)) return null;
  let guess = want;
  for (let i = 0; i < 3; i++) {
    const o = parts(guess, tz);
    const shown = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour, +o.minute);
    if (shown === want) break;
    guess += want - shown;
  }
  return new Date(guess);
}

/** Hours for the week, to two places, from minutes. */
function hoursOf(minutes) {
  return Math.round((Number(minutes) || 0) / 60 * 100) / 100;
}

module.exports = { TZ, IDLE_MINUTES, PROMPT_MINUTES, LONG_SHIFT_HOURS, TIMEPROOF_TOLERANCE_MINUTES,
  dayOf, idleGaps, shiftMinutes, offClock, flags, hoursOf, toLocalInput, fromLocalInput };
