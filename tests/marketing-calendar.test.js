'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const CAL = require('../tools/lib/marketing-calendar');

const DAY = 86400000;
const iso = (t) => CAL.ymd(t);

test('the date rules land on the right days', () => {
  assert.strictEqual(iso(CAL.easter(2027)), '2027-03-28');
  assert.strictEqual(iso(CAL.easter(2026)), '2026-04-05');
  assert.strictEqual(iso(CAL.nthWeekday(2027, 5, 0, 2)), '2027-05-09'); // Mother's Day
  assert.strictEqual(iso(CAL.nthWeekday(2027, 6, 0, 3)), '2027-06-20'); // Father's Day
  assert.strictEqual(iso(CAL.nthWeekday(2026, 10, 0, 2)), '2026-10-11'); // Chicago Marathon
});

test('every occasion has a real selling window, in the right order', () => {
  for (const y of [2026, 2027, 2028]) {
    for (const o of CAL.OCCASIONS) {
      const e = CAL.datesFor(o, y);
      assert.ok(e.prep < e.ads, `${o.id} ${y}: prep before ads`);
      assert.ok(e.season <= e.event, `${o.id} ${y}: season starts before the event`);
      assert.ok(e.orderBy < e.end, `${o.id} ${y}: last order day before the end`);
      assert.ok((e.orderBy - e.season) / DAY >= 14, `${o.id} ${y}: season ${iso(e.season)} leaves under 2 weeks before the last order day ${iso(e.orderBy)}`);
    }
  }
});

test('the list is the next occurrence of each occasion, in prep order', () => {
  const now = new Date(Date.UTC(2026, 9, 17));
  const up = CAL.upcoming(now);
  assert.strictEqual(up.length, CAL.OCCASIONS.length);
  for (const e of up) assert.ok(e.event >= now, `${e.id} is not past`);
  for (let i = 1; i < up.length; i++) assert.ok(up[i - 1].prep <= up[i].prep);
  assert.strictEqual(CAL.nextFor('halloween', now).year, 2026);
  assert.strictEqual(CAL.nextFor('halloween', new Date(Date.UTC(2026, 10, 1))).year, 2027);
});

test('"needs you now" shows an occasion from prep to season start, never once the season is here', () => {
  const xmas = CAL.datesFor(CAL.OCCASIONS.find((o) => o.id === 'christmas'), 2026);
  const has = (t) => CAL.dueNow(t).some((e) => e.id === 'christmas');
  assert.ok(!has(new Date(xmas.prep - DAY)));
  assert.ok(has(xmas.prep));
  assert.strictEqual(CAL.status(xmas, xmas.ads), 'ads now');
  assert.ok(!has(xmas.season));
  const day = (t, n) => new Date(t.getTime() + n * DAY);
  assert.strictEqual(CAL.status(xmas, xmas.orderBy), 'in season');
  assert.strictEqual(CAL.status(xmas, day(xmas.orderBy, 1)), 'orders closed');
  assert.strictEqual(CAL.status(xmas, day(xmas.event, 1)), 'past');
});

test('a season-long occasion stays open through its busy weeks', () => {
  const w = CAL.datesFor(CAL.OCCASIONS.find((o) => o.id === 'weddings'), 2027);
  assert.strictEqual(CAL.status(w, new Date(Date.UTC(2027, 5, 1))), 'in season'); // Jun 1
  assert.strictEqual(CAL.status(w, new Date(Date.UTC(2027, 7, 1))), 'in season'); // Aug 1
  const bhm = CAL.datesFor(CAL.OCCASIONS.find((o) => o.id === 'black-history-month'), 2027);
  assert.strictEqual(CAL.status(bhm, new Date(Date.UTC(2027, 0, 20))), 'in season');
});

test('the calendar page is owner-only and sits behind the admin login', () => {
  const STAFF = require('../tools/lib/staff');
  // The real guard: a helper is refused before the handler runs.
  assert.strictEqual(STAFF.permForRoute('GET', '/admin/marketing-calendar'), 'owner');
  assert.strictEqual(STAFF.mayUseRoute({ kind: 'staff', perms: {} }, 'GET', '/admin/marketing-calendar'), false);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const at = src.indexOf("'/admin/marketing-calendar'");
  assert.ok(at > 0, 'route registered');
  const line = src.slice(src.lastIndexOf('\n', at), src.indexOf('\n', at));
  assert.match(line, /requireAdmin/, 'behind the admin login');
});
