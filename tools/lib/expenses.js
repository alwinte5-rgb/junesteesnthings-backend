'use strict';

/* Overheads by month, and monthly costs that carry forward on their own.
 *
 * Why this exists (the owner, 2026-10-02: "I would like the month to change
 * automatically and finances be separated by month"). A monthly cost (rent,
 * the phone, software) was carried into a new month only when someone pressed
 * "Roll monthly costs into this month", and that button copied from LAST month
 * only. August's costs were entered and September was never rolled, so
 * pressing it in October found nothing to copy: one missed month broke the
 * chain for good, and every month after it read as rent-free.
 *
 * Now every month from the first monthly cost up to this one is filled in,
 * oldest first, each cost carried from its latest entry, so a gap heals
 * itself. A monthly cost stops when its latest entry is unticked; one deleted
 * from a month is remembered as skipped for that month only, so the next pass
 * does not put it back and the month after still gets it.
 *
 * Months are 'YYYY-MM' strings; days are 'YYYY-MM-DD'. Pure functions only. */

/** What makes two entries "the same monthly cost": category, who, note. */
function seriesKey(e) {
  const t = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  return `${t(e.category)}|${t(e.vendor)}|${t(e.note)}`;
}

function ymOf(day) {
  return String(day).slice(0, 7);
}

function nextYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function daysIn(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The same day of the month in `ym` — the 31st becomes the 30th in a 30-day month. */
function sameDayIn(day, ym) {
  const d = Math.min(Number(String(day).slice(8, 10)) || 1, daysIn(ym));
  return `${ym}-${String(d).padStart(2, '0')}`;
}

/**
 * The entries to add so every month up to `currentYm` carries its monthly costs.
 *
 * `rows`  every expense as {id, day: 'YYYY-MM-DD', category, amount, vendor, note, recurs}
 * `skips` Set of `${ym}#${seriesKey}` — monthly costs deleted from a month
 * Returns [{day, category, amount, vendor, note}] in the order to insert.
 */
function planRoll(rows, currentYm, skips = new Set()) {
  const byMonth = new Map();
  for (const r of rows || []) {
    const ym = ymOf(r.day);
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    byMonth.get(ym).push(r);
  }
  const recurringMonths = [...byMonth.entries()].filter(([, list]) => list.some((r) => r.recurs)).map(([ym]) => ym).sort();
  if (!recurringMonths.length) return [];
  /* Each monthly cost carries from its LATEST entry, so a month it was
     deleted from (a skip) is only that month: the next month still gets it.
     An entry with monthly unticked ends it. */
  const active = new Map();
  const out = [];
  for (let ym = recurringMonths[0]; ym <= currentYm; ym = nextYm(ym)) {
    if (!byMonth.has(ym)) byMonth.set(ym, []);
    const here = byMonth.get(ym);
    if (ym !== recurringMonths[0]) {
      const there = new Set(here.map(seriesKey));
      for (const [key, { r, anchor }] of active) {
        if (there.has(key) || skips.has(`${ym}#${key}`)) continue;
        const add = { day: sameDayIn(`${ym}-${String(anchor).padStart(2, '0')}`, ym), category: r.category, amount: Number(r.amount),
          vendor: r.vendor || null, note: r.note || null, recurs: true };
        out.push(add);
        here.push(add);
      }
    }
    // The month's own entries, oldest first, decide what carries on from here.
    /* The day it is due is kept through a short month: the 31st becomes the
       28th in February only, and is the 31st again in March. */
    for (const r of here.slice().sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
      const key = seriesKey(r);
      if (!r.recurs) { active.delete(key); continue; }
      const d = Number(String(r.day).slice(8, 10));
      const prev = active.get(key);
      const clamped = prev && d === daysIn(ym) && prev.anchor > d;
      active.set(key, { r, anchor: clamped ? prev.anchor : d });
    }
  }
  return out;
}

/** Fixed costs a month: the monthly entries in the latest month (not after
 *  `currentYm`) that has any. Summing every monthly entry in a year counted
 *  rent once per month it had been paid. */
function fixedMonthly(rows, currentYm) {
  const months = [...new Set((rows || []).filter((r) => r.recurs && ymOf(r.day) <= currentYm).map((r) => ymOf(r.day)))].sort();
  const last = months[months.length - 1];
  if (!last) return 0;
  const sum = rows.filter((r) => r.recurs && ymOf(r.day) === last).reduce((a, r) => a + Number(r.amount || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** Entries grouped by month, newest month first, each with its total and
 *  per-category totals (largest first). */
function byMonth(rows) {
  const groups = new Map();
  for (const r of rows || []) {
    const ym = ymOf(r.day);
    if (!groups.has(ym)) groups.set(ym, { ym, entries: [], total: 0, cats: new Map() });
    const g = groups.get(ym);
    g.entries.push(r);
    g.total += Number(r.amount || 0);
    g.cats.set(r.category, (g.cats.get(r.category) || 0) + Number(r.amount || 0));
  }
  const round = (n) => Math.round(n * 100) / 100;
  return [...groups.values()].sort((a, b) => (a.ym < b.ym ? 1 : -1)).map((g) => ({
    ym: g.ym,
    total: round(g.total),
    entries: g.entries.slice().sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : (Number(b.id) || 0) - (Number(a.id) || 0))),
    categories: [...g.cats.entries()].map(([category, total]) => ({ category, total: round(total) })).sort((a, b) => b.total - a.total),
  }));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/* Which slice of the books the Finances page shows (the owner, 2026-10-02: "an
 * overview of the current month only by default and a dropdown menu for other
 * months"). One month unless asked for a whole year:
 *   ?month=YYYY-MM          that month
 *   ?month=all&year=YYYY    the whole year
 *   ?year=YYYY (a past one) the whole year, as the year links always did
 *   nothing / this year     this month */
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
function financeView(q, thisYm) {
  const m = String((q && q.month) || '');
  if (YM_RE.test(m)) return { year: Number(m.slice(0, 4)), month: m };
  const thisYear = Number(String(thisYm).slice(0, 4));
  const y = /^\d{4}$/.test(String((q && q.year) || '')) ? Number(q.year) : thisYear;
  if (m === 'all' || y !== thisYear) return { year: y, month: null };
  return { year: y, month: thisYm };
}

/** The query string that brings the page back to a view, for forms' return. */
function viewQuery(v) {
  return v.month ? `?month=${v.month}` : `?year=${v.year}&month=all`;
}

/** The month dropdown: every month of the year with anything recorded, plus
 *  this month and the one being shown, newest first. */
function monthOptions(periods, year, thisYm, shown) {
  const set = new Set((periods || []).filter((p) => YM_RE.test(p) && p.startsWith(`${year}-`)));
  if (String(thisYm).startsWith(`${year}-`)) set.add(thisYm);
  if (shown && shown.startsWith(`${year}-`)) set.add(shown);
  return [...set].sort().reverse();
}

module.exports = { seriesKey, ymOf, nextYm, sameDayIn, planRoll, fixedMonthly, byMonth, monthLabel,
  financeView, viewQuery, monthOptions };
