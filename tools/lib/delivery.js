'use strict';

/* Local delivery: which ZIPs we drive to and for how much, which windows are
 * open, and what a booking may be moved to.
 *
 * Why this exists. A customer could have an order shipped (Shippo postage) or
 * collect it free, and nothing in between: a buyer two miles away paid for a
 * parcel service or came to the shop. Local delivery is the third way out —
 * priced by ZIP zone, booked into a date and time window at checkout, driven by
 * the team or handed to a fixed-price courier partner.
 *
 * Both checkouts (the studio's and the quote page) book into the SAME windows,
 * so the backend owns every booking: a studio order and a quote cannot both take
 * the last seat in Saturday 9–12. The studio asks through /api/delivery/*.
 *
 * Dates are shop-local calendar days, 'YYYY-MM-DD' strings, never Date objects:
 * a delivery day is a day in Chicago, and a Date at midnight UTC is the evening
 * before there. Times of day are minutes after midnight, shop time.
 *
 * Pure functions only: no database, no clock unless one is passed in, so the
 * rules are tested directly (tests/delivery.test.js). */

const crypto = require('crypto');

const SHOP_TZ = process.env.JT_TZ || 'America/Chicago';
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* Seats are taken by every booking that is going ahead, and by a HOLD until it
   expires: a studio buyer holds the seat while they pay, and a hold nobody paid
   for gives it back on its own (no sweeper needed for the count to be right). */
const LIVE_STATUSES = ['confirmed', 'out', 'delivered'];

function envInt(name, def, min, max) {
  const n = parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

/** Tunables, read when asked so a test can set the environment first. */
function settings() {
  return {
    leadDays: envInt('JT_DELIVERY_MIN_LEAD_DAYS', 1, 0, 30),       // after the job is ready
    horizonDays: envInt('JT_DELIVERY_HORIZON_DAYS', 45, 7, 180),   // how far ahead to offer
    holdMinutes: envInt('JT_DELIVERY_HOLD_MIN', 45, 5, 24 * 60),   // seat kept while paying
    cutoffHours: envInt('JT_DELIVERY_RESCHEDULE_CUTOFF_HRS', 24, 0, 24 * 7),
  };
}

/* ── Calendar days ────────────────────────────────────────────────────────── */

function isYmd(s) {
  if (!YMD_RE.test(String(s || ''))) return false;
  const [y, m, d] = String(s).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function ymdToUtc(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcToYmd(t) {
  return new Date(t).toISOString().slice(0, 10);
}

function addDays(s, n) {
  return utcToYmd(ymdToUtc(s) + n * 86400000);
}

function weekdayOf(s) {
  return new Date(ymdToUtc(s)).getUTCDay();
}

/** A date from the database (Date, ISO string) as the shop's calendar day. */
function toYmd(v) {
  if (!v) return null;
  if (typeof v === 'string' && isYmd(v.slice(0, 10)) && v.length <= 10) return v.slice(0, 10);
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return shopClock(d).ymd;
}

/** What day and time it is in the shop, for `now`. */
function shopClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHOP_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now instanceof Date ? now : new Date(now));
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  return { ymd: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** Minutes from shop-time A to shop-time B; both {ymd, minutes}. */
function minutesBetween(a, b) {
  return (ymdToUtc(b.ymd) - ymdToUtc(a.ymd)) / 60000 + (b.minutes - a.minutes);
}

/* ── Times of day ─────────────────────────────────────────────────────────── */

/** '09:00' or '9:00' or 540 → 540; null when not a time of day. */
function toMinutes(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v < 1440 ? v : null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v || '').trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

function hhmm(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** 540 → '9am', 750 → '12:30pm'. */
function clock(min) {
  const h = Math.floor(min / 60), mi = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${mi ? ':' + String(mi).padStart(2, '0') : ''}${h < 12 ? 'am' : 'pm'}`;
}

function windowLabel(w) {
  const a = toMinutes(w.start_time), b = toMinutes(w.end_time);
  if (a == null || b == null) return '';
  return `${clock(a)}–${clock(b)}`;
}

function dayLabel(ymd) {
  if (!isYmd(ymd)) return '';
  const d = new Date(ymdToUtc(ymd));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/* ── Zones ────────────────────────────────────────────────────────────────── */

/** The 5-digit ZIP in what was typed ('60657-1234' → '60657'); '' if none. */
function normZip(z) {
  const m = /^\s*(\d{5})(?:-?\d{4})?\s*$/.exec(String(z || ''));
  return m ? m[1] : '';
}

/** ZIPs typed into the settings box — any separators — as a clean list. */
function parseZipList(text) {
  const out = [];
  for (const tok of String(text || '').split(/[^0-9]+/)) {
    if (/^\d{5}$/.test(tok) && !out.includes(tok)) out.push(tok);
  }
  return out;
}

/** The active zone that delivers to `zip`, or null: no zone, no delivery.
 *  A ZIP listed in two zones goes to the first by sort order, so the owner
 *  can see which price it gets by reading the list top-down. */
function zoneForZip(zones, zip) {
  const z = normZip(zip);
  if (!z) return null;
  const list = (zones || []).filter((x) => x && x.active !== false)
    .slice().sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0));
  return list.find((x) => Array.isArray(x.zips) && x.zips.includes(z)) || null;
}

/** Whether delivery is offered at all: at least one active zone with a ZIP
 *  and one active window. Until the owner sets both, it never appears. */
function deliveryOffered(zones, windows) {
  return (zones || []).some((z) => z && z.active !== false && Array.isArray(z.zips) && z.zips.length)
    && (windows || []).some((w) => w && w.active !== false && Number(w.capacity) > 0);
}

function money2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/* The owner's floor (2026-10-02): local delivery is never less than $20,
   whatever a zone says. Applied where the price is read, not only where it
   is saved, so a zone saved before the floor existed cannot undercut it. */
const MIN_FEE = 20;

/** What a customer in this zone pays. */
function zoneFee(zone) {
  return money2(Math.max(MIN_FEE, Number(zone && zone.fee) || 0));
}

/* ── Seats ────────────────────────────────────────────────────────────────── */

/** Whether a booking holds its seat at `now`. */
function holdsSeat(b, now = new Date()) {
  if (!b) return false;
  const s = String(b.status || '');
  if (LIVE_STATUSES.includes(s)) return true;
  if (s !== 'held') return false;
  const exp = b.hold_expires_at ? new Date(b.hold_expires_at).getTime() : 0;
  return exp > (now instanceof Date ? now.getTime() : Number(now));
}

/** Seats taken per 'date|window_id', ignoring `exceptId` (the booking being moved). */
function seatsTaken(bookings, now = new Date(), exceptId = null) {
  const used = {};
  for (const b of bookings || []) {
    if (exceptId != null && String(b.id) === String(exceptId)) continue;
    if (!holdsSeat(b, now)) continue;
    const k = `${toYmd(b.date)}|${b.window_id}`;
    used[k] = (used[k] || 0) + 1;
  }
  return used;
}

/** The first day a delivery can be offered.
 *
 *  `readyYmd` is when the job is promised ready (the production estimate, or
 *  the shop's own target date when it set one); `leadDays` is the buffer after
 *  it. Never today: same-day delivery is not sold. */
function earliestDate(readyYmd, todayYmd, leadDays = settings().leadDays) {
  const tomorrow = addDays(todayYmd, 1);
  const fromReady = isYmd(readyYmd) ? addDays(readyYmd, Math.max(0, leadDays)) : tomorrow;
  return fromReady > tomorrow ? fromReady : tomorrow;
}

/**
 * Days with seats left, from `earliest` for `horizonDays`.
 *
 * Each day lists only its windows that still have a seat and have not begun
 * (a window starting in the past is never sold, even if the day is open).
 * Returns [{date, label, windows: [{id, label, left, capacity}]}].
 */
function availableSlots({ windows, blackouts, bookings, earliest, horizonDays, now = new Date(), exceptId = null }) {
  const active = (windows || []).filter((w) => w && w.active !== false && Number(w.capacity) > 0
    && toMinutes(w.start_time) != null && toMinutes(w.end_time) != null);
  if (!active.length || !isYmd(earliest)) return [];
  const off = new Set((blackouts || []).map((b) => toYmd(b.date || b)).filter(Boolean));
  const used = seatsTaken(bookings, now, exceptId);
  const shop = shopClock(now);
  const out = [];
  const span = Number.isFinite(horizonDays) ? horizonDays : settings().horizonDays;
  for (let i = 0; i < span; i++) {
    const date = addDays(earliest, i);
    if (off.has(date)) continue;
    const wd = weekdayOf(date);
    const open = active
      .filter((w) => Number(w.weekday) === wd)
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
      .map((w) => {
        const cap = Number(w.capacity);
        const left = cap - (used[`${date}|${w.id}`] || 0);
        return { id: Number(w.id), label: windowLabel(w), left, capacity: cap,
                 start: toMinutes(w.start_time) };
      })
      .filter((w) => w.left > 0 && minutesBetween(shop, { ymd: date, minutes: w.start }) > 0)
      .map(({ start, ...w }) => w);
    if (open.length) out.push({ date, label: dayLabel(date), windows: open });
  }
  return out;
}

/**
 * Whether `date` + `windowId` may be booked: it must be one of the slots
 * availableSlots would offer. The client's choice is never taken on trust —
 * the fee comes from the zone, the window from the table, the seat from the
 * count. Returns {ok, window} or {ok: false, reason}.
 */
function checkSlot({ windows, blackouts, bookings, earliest, horizonDays, now, exceptId, date, windowId }) {
  if (!isYmd(date)) return { ok: false, reason: 'date' };
  const wid = Number(windowId);
  if (!Number.isInteger(wid) || wid <= 0) return { ok: false, reason: 'window' };
  const w = (windows || []).find((x) => Number(x.id) === wid);
  if (!w || w.active === false || Number(w.weekday) !== weekdayOf(date)) return { ok: false, reason: 'window' };
  if (date < earliest) return { ok: false, reason: 'early' };
  const days = availableSlots({ windows, blackouts, bookings, earliest, horizonDays, now, exceptId });
  const day = days.find((d) => d.date === date);
  if (!day) {
    const off = (blackouts || []).some((b) => toYmd(b.date || b) === date);
    return { ok: false, reason: off ? 'closed' : (date > addDays(earliest, (horizonDays || settings().horizonDays) - 1) ? 'far' : 'full') };
  }
  if (!day.windows.some((x) => x.id === wid)) return { ok: false, reason: 'full' };
  return { ok: true, window: w, label: windowLabel(w) };
}

const SLOT_PROBLEMS = {
  date: 'Please choose a delivery date.',
  window: 'Please choose a delivery time window.',
  early: 'That date is before your order can be ready. Please choose a later one.',
  full: 'That delivery window just filled up. Please choose another.',
  closed: 'We are not delivering that day. Please choose another.',
  far: 'That date is too far ahead to book yet. Please choose an earlier one.',
  zone: "We don't deliver to that ZIP code yet. Please choose pickup or shipping.",
  off: 'Local delivery is not available right now. Please choose pickup or shipping.',
};

/* An unknown reason is NOT "that window filled up": saying so sent a buyer
   round choosing window after window when the real fault was elsewhere. */
function slotProblem(reason) {
  return SLOT_PROBLEMS[reason] || 'Local delivery could not be booked just now. Please try again, or choose pickup or shipping.';
}

/* ── Changing a booking ──────────────────────────────────────────────────── */

/** Minutes from `now` until the booking's window starts. */
function minutesUntil(b, now = new Date()) {
  const start = toMinutes(b.window_start != null ? b.window_start : (b.start_time || 0)) || 0;
  return minutesBetween(shopClock(now), { ymd: toYmd(b.date), minutes: start });
}

/** Whether the CUSTOMER may still move it themselves. The shop can always. */
function rescheduleAllowed(b, now = new Date(), cutoffHours = settings().cutoffHours) {
  if (!b || !['held', 'confirmed'].includes(String(b.status))) return false;
  return minutesUntil(b, now) >= cutoffHours * 60;
}

/** "Sat, Oct 10, 9am–12pm" */
function bookingPhrase(b) {
  if (!b) return '';
  const day = dayLabel(toYmd(b.date));
  const win = b.window_label || '';
  return [day, win].filter(Boolean).join(', ');
}

/** One line for the booking's history: who moved it, when, from and to. */
function historyEntry({ by, action, from, to, note, at = new Date() }) {
  const e = { at: (at instanceof Date ? at : new Date(at)).toISOString(), by: String(by || '').slice(0, 80), action: String(action || '') };
  if (from) e.from = String(from).slice(0, 80);
  if (to) e.to = String(to).slice(0, 80);
  if (note) e.note = String(note).slice(0, 300);
  return e;
}

/* ── The customer's reschedule link ──────────────────────────────────────────
   The link is the password to a customer's address and phone, so it is a
   random 32-byte token and only its hash is stored. */

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex');
}

function tokenShapeOk(t) {
  return TOKEN_RE.test(String(t || ''));
}

/** Timing-safe: does `t` hash to `hash`? */
function tokenMatches(t, hash) {
  if (!tokenShapeOk(t) || !/^[0-9a-f]{64}$/.test(String(hash || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(hashToken(t), 'hex'), Buffer.from(String(hash), 'hex'));
}

/* ── The board ────────────────────────────────────────────────────────────── */

/** Bookings sorted for the delivery board.
 *
 *  `today`     going out today, by window
 *  `upcoming`  later days, grouped by date then window
 *  `atRisk`    the job will not be ready by its delivery date (readyBy > date)
 *  `held`      a studio buyer is still paying (seat kept until it expires)
 *  `recent`    delivered or cancelled in the last 14 days */
function boardQueues(bookings, now = new Date()) {
  const today = shopClock(now).ymd;
  const q = { today: [], upcoming: [], atRisk: [], held: [], recent: [] };
  const cutoff = addDays(today, -14);
  for (const b of bookings || []) {
    const date = toYmd(b.date);
    const item = Object.assign({}, b, { date, phrase: bookingPhrase(Object.assign({}, b, { date })) });
    const s = String(b.status);
    if (s === 'held') { if (holdsSeat(b, now)) q.held.push(item); continue; }
    if (s === 'delivered' || s === 'cancelled') {
      const at = toYmd(b.updated_at || b.date);
      if (at && at >= cutoff) q.recent.push(item);
      continue;
    }
    if (b.ready_by && toYmd(b.ready_by) > date) q.atRisk.push(item);
    if (date === today) q.today.push(item);
    else if (date > today) q.upcoming.push(item);
    else q.today.push(Object.assign(item, { overdue: true }));  // past date, not delivered
  }
  const byWhen = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
    || (toMinutes(a.window_start) || 0) - (toMinutes(b.window_start) || 0);
  for (const k of Object.keys(q)) q[k].sort(byWhen);
  return q;
}

/** A Google Maps directions link through the stops, from the shop. */
function routeLink(origin, addresses) {
  const stops = (addresses || []).filter(Boolean).slice(0, 10);
  if (!stops.length) return '';
  const enc = encodeURIComponent;
  const dest = stops[stops.length - 1];
  const via = stops.slice(0, -1);
  return `https://www.google.com/maps/dir/?api=1&origin=${enc(origin)}&destination=${enc(dest)}`
    + (via.length ? `&waypoints=${enc(via.join('|'))}` : '') + '&travelmode=driving';
}

/** An address object as one line. */
function addressLine(a) {
  if (!a) return '';
  return [a.street1, a.street2, a.city, `${a.state || ''} ${a.zip || ''}`.trim()]
    .map((s) => String(s || '').trim()).filter(Boolean).join(', ');
}

/* ── Courier partner ─────────────────────────────────────────────────────────
   A contracted courier at an agreed price per zone (Metrobi, a messenger
   company). The customer pays the zone fee whoever drives; the courier cost
   is the shop's, typed in from the partner's rate sheet. */

function courierCost(partner, zoneId) {
  if (!partner || !partner.costs) return null;
  const v = partner.costs[String(zoneId)];
  const n = Number(v);
  return v === '' || v == null || !Number.isFinite(n) || n < 0 ? null : money2(n);
}

function courierReady(partner) {
  return !!(partner && String(partner.name || '').trim()
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(partner.email || '').trim()));
}

/** What the shop keeps on a zone after the courier: fee − cost; null if unknown. */
function zoneMargin(zone, partner) {
  const c = courierCost(partner, zone && zone.id);
  return c == null ? null : money2(zoneFee(zone) - c);
}

module.exports = {
  SHOP_TZ, LIVE_STATUSES, settings,
  isYmd, addDays, weekdayOf, toYmd, shopClock, minutesBetween, dayLabel,
  toMinutes, hhmm, clock, windowLabel,
  normZip, parseZipList, zoneForZip, deliveryOffered, money2, MIN_FEE, zoneFee,
  holdsSeat, seatsTaken, earliestDate, availableSlots, checkSlot, slotProblem, SLOT_PROBLEMS,
  minutesUntil, rescheduleAllowed, bookingPhrase, historyEntry,
  newToken, hashToken, tokenShapeOk, tokenMatches,
  boardQueues, routeLink, addressLine,
  courierCost, courierReady, zoneMargin,
};
