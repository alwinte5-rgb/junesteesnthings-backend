/* The schedule calendar and daily hours (owner, 2026-10-15). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../tools/lib/work-shifts');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('a shift past midnight is drawn on both days, in the zone asked for', () => {
  const o = S.occurrences([{ weekday: 1, start_min: 21 * 60, end_min: 2 * 60, zone: 'America/Chicago' }], '2026-10-12')[0];
  assert.deepStrictEqual(S.daySegments(o, 'America/Chicago'), [
    { date: '2026-10-12', from: 1260, to: 1440 }, { date: '2026-10-13', from: 0, to: 120 }]);
  assert.deepStrictEqual(S.daySegments(o, 'Asia/Manila'), [{ date: '2026-10-13', from: 600, to: 900 }]);
});

test('a Manila morning lands on the Chicago evening before, across daylight saving', () => {
  const oct = S.occurrences([{ weekday: 2, start_min: 9 * 60, end_min: 14 * 60, zone: 'Asia/Manila' }], '2026-10-12')[0];
  assert.deepStrictEqual(S.daySegments(oct, 'America/Chicago'), [
    { date: '2026-10-12', from: 1200, to: 1440 }, { date: '2026-10-13', from: 0, to: 60 }]);
  const nov = S.occurrences([{ weekday: 2, start_min: 9 * 60, end_min: 14 * 60, zone: 'Asia/Manila' }], '2026-11-09')[0];
  assert.strictEqual(S.daySegments(nov, 'America/Chicago')[0].from, 1140, 'an hour earlier once Chicago leaves daylight time');
});

test('helpers see their own schedule only; hours show per day and per week', () => {
  const page = src.slice(src.indexOf("app.get('/admin/work-schedule'"), src.indexOf("app.post('/admin/work-schedule'"));
  assert.match(page, /const owner = !!actor && actor.kind !== 'staff';/, 'fails closed');
  assert.match(page, /names: owner/);
  assert.match(src, /function clockDays\(w\)/);
  assert.match(src, /\$\{dailyHoursHtml\(w\)\}[\s\S]{0,400}shiftsByDayHtml\(w, \(sh\) => shiftRow\(sh\)\)/, 'the helper page');
});
