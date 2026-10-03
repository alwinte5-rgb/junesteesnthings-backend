/* Local delivery rules (tools/lib/delivery.js).
 *
 * Run: node --test tests/*.test.js
 *
 * What goes wrong with a booked delivery is quiet: a ZIP charged the wrong
 * zone's fee, a window sold past its capacity, a seat a buyer never paid for
 * held forever, a date offered before the job can be ready, a reschedule link
 * that anyone could guess. Each has a test here. */

const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../tools/lib/delivery');

// Fri 2026-10-02 10:00 in Chicago (CDT, UTC-5).
const NOW = new Date('2026-10-02T15:00:00Z');

const zones = [
  { id: 1, name: 'Near', fee: 15, zips: ['60657', '60613'], active: true, sort: 0 },
  { id: 2, name: 'Mid', fee: 20, zips: ['60614', '60657'], active: true, sort: 1 },
  { id: 3, name: 'Off', fee: 30, zips: ['60601'], active: false, sort: 2 },
];
// Tue(2) and Sat(6): 9–12 and 12–3.
const windows = [
  { id: 10, weekday: 2, start_time: '09:00', end_time: '12:00', capacity: 2, active: true },
  { id: 11, weekday: 2, start_time: '12:00', end_time: '15:00', capacity: 2, active: true },
  { id: 20, weekday: 6, start_time: '09:00', end_time: '12:00', capacity: 1, active: true },
  { id: 21, weekday: 6, start_time: '12:00', end_time: '15:00', capacity: 0, active: true },
];

test('ZIP to zone: first by sort order wins, inactive zones never deliver, ZIP+4 is read', () => {
  assert.strictEqual(D.zoneForZip(zones, '60657').id, 1);
  assert.strictEqual(D.zoneForZip(zones, '60657-1234').id, 1);
  assert.strictEqual(D.zoneForZip(zones, ' 60614 ').id, 2);
  assert.strictEqual(D.zoneForZip(zones, '60601'), null);
  assert.strictEqual(D.zoneForZip(zones, '90210'), null);
  assert.strictEqual(D.zoneForZip(zones, '6065'), null);
  assert.strictEqual(D.zoneForZip(zones, ''), null);
});

test('ZIP list typed any way becomes clean unique 5-digit codes', () => {
  assert.deepStrictEqual(D.parseZipList('60657, 60613\n60614 60657;abc 1234 606577'), ['60657', '60613', '60614']);
});

test('delivery is never offered until a zone and a window both exist', () => {
  assert.strictEqual(D.deliveryOffered([], windows), false);
  assert.strictEqual(D.deliveryOffered(zones, []), false);
  assert.strictEqual(D.deliveryOffered(zones, [{ ...windows[0], capacity: 0 }]), false);
  assert.strictEqual(D.deliveryOffered(zones, windows), true);
});

test('earliest date: ready date plus the lead, never today', () => {
  assert.strictEqual(D.earliestDate('2026-10-13', '2026-10-02', 1), '2026-10-14');
  assert.strictEqual(D.earliestDate('2026-10-01', '2026-10-02', 1), '2026-10-03');
  assert.strictEqual(D.earliestDate(null, '2026-10-02', 1), '2026-10-03');
  assert.strictEqual(D.earliestDate('2026-10-02', '2026-10-02', 0), '2026-10-03');
});

test('open slots: only windows on their weekday, with seats, from the earliest date', () => {
  const days = D.availableSlots({ windows, blackouts: [], bookings: [], earliest: '2026-10-03', horizonDays: 7, now: NOW });
  // Sat 10/03 (9–12 only: 12–3 has capacity 0) and Tue 10/06 (both)
  assert.deepStrictEqual(days.map((d) => d.date), ['2026-10-03', '2026-10-06']);
  assert.deepStrictEqual(days[0].windows.map((w) => w.id), [20]);
  assert.deepStrictEqual(days[1].windows.map((w) => [w.id, w.left]), [[10, 2], [11, 2]]);
  assert.strictEqual(days[0].label, 'Sat, Oct 3');
  assert.strictEqual(days[1].windows[0].label, '9am–12pm');
});

test('a full window is not sold; a lapsed hold gives its seat back; a live hold keeps it', () => {
  const later = new Date(NOW.getTime() + 3600e3);
  const earlier = new Date(NOW.getTime() - 60e3);
  const bookings = [
    { id: 1, date: '2026-10-06', window_id: 10, status: 'confirmed' },
    { id: 2, date: '2026-10-06', window_id: 10, status: 'held', hold_expires_at: later },
    { id: 3, date: '2026-10-06', window_id: 11, status: 'held', hold_expires_at: earlier },
    { id: 4, date: '2026-10-06', window_id: 11, status: 'cancelled' },
    { id: 5, date: '2026-10-03', window_id: 20, status: 'delivered' },
  ];
  const days = D.availableSlots({ windows, blackouts: [], bookings, earliest: '2026-10-03', horizonDays: 7, now: NOW });
  assert.deepStrictEqual(days.map((d) => d.date), ['2026-10-06']);
  assert.deepStrictEqual(days[0].windows.map((w) => [w.id, w.left]), [[11, 2]]);
  // Moving booking 1 frees its own seat for itself.
  const moving = D.availableSlots({ windows, blackouts: [], bookings, earliest: '2026-10-03', horizonDays: 7, now: NOW, exceptId: 1 });
  assert.deepStrictEqual(moving[0].windows.map((w) => [w.id, w.left]), [[10, 1], [11, 2]]);
});

test('blackout days are skipped', () => {
  const days = D.availableSlots({ windows, blackouts: [{ date: '2026-10-06' }], bookings: [], earliest: '2026-10-03', horizonDays: 7, now: NOW });
  assert.deepStrictEqual(days.map((d) => d.date), ['2026-10-03']);
});

test('a window that has already started today is never sold', () => {
  // Sat 2026-10-03 10:30 Chicago: 9–12 has begun.
  const sat = new Date('2026-10-03T15:30:00Z');
  const days = D.availableSlots({ windows, blackouts: [], bookings: [], earliest: '2026-10-03', horizonDays: 1, now: sat });
  assert.deepStrictEqual(days, []);
});

test('checkSlot refuses what the page would not offer, and says why', () => {
  const base = { windows, blackouts: [{ date: '2026-10-13' }], bookings: [], earliest: '2026-10-05', horizonDays: 30, now: NOW };
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-10-06', windowId: 10 }).ok, true);
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-10-06', windowId: 20 }).reason, 'window');   // Sat window on a Tue
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-10-03', windowId: 20 }).reason, 'early');
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-10-10', windowId: 21 }).reason, 'full');     // capacity 0
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-10-13', windowId: 10 }).reason, 'closed');
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-12-29', windowId: 10 }).reason, 'far');
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-02-30', windowId: 10 }).reason, 'date');
  assert.strictEqual(D.checkSlot({ ...base, date: '2026-10-06', windowId: 'x' }).reason, 'window');
  const full = [{ id: 1, date: '2026-10-06', window_id: 10, status: 'confirmed' }, { id: 2, date: '2026-10-06', window_id: 10, status: 'out' }];
  assert.strictEqual(D.checkSlot({ ...base, bookings: full, date: '2026-10-06', windowId: 10 }).reason, 'full');
  for (const r of ['date', 'window', 'early', 'full', 'closed', 'far', 'zone', 'off']) assert.ok(D.slotProblem(r).length > 10);
  assert.doesNotMatch(D.slotProblem('ref'), /filled up/, 'an unknown failure is not reported as a full window');
});

test('customer reschedule closes at the cutoff; delivered or cancelled cannot be moved', () => {
  const b = { status: 'confirmed', date: '2026-10-03', window_start: '09:00' };   // 23h after NOW
  assert.strictEqual(D.rescheduleAllowed(b, NOW, 24), false);
  assert.strictEqual(D.rescheduleAllowed(b, NOW, 12), true);
  assert.strictEqual(D.rescheduleAllowed({ ...b, status: 'delivered' }, NOW, 0), false);
  assert.strictEqual(D.rescheduleAllowed({ ...b, status: 'cancelled' }, NOW, 0), false);
  assert.strictEqual(D.minutesUntil(b, NOW), 23 * 60);
});

test('shop clock is Chicago time across the DST change', () => {
  assert.deepStrictEqual(D.shopClock(new Date('2026-11-02T05:30:00Z')), { ymd: '2026-11-01', minutes: 23 * 60 + 30 });
  assert.deepStrictEqual(D.shopClock(new Date('2026-07-01T04:59:00Z')), { ymd: '2026-06-30', minutes: 23 * 60 + 59 });
});

test('reschedule link: random, only its hash kept, compared without leaking timing', () => {
  const t = D.newToken();
  assert.ok(D.tokenShapeOk(t));
  assert.notStrictEqual(t, D.newToken());
  const h = D.hashToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.strictEqual(D.tokenMatches(t, h), true);
  assert.strictEqual(D.tokenMatches(D.newToken(), h), false);
  assert.strictEqual(D.tokenMatches('short', h), false);
  assert.strictEqual(D.tokenMatches(t, 'nothex'), false);
  const src = require('fs').readFileSync(require.resolve('../tools/lib/delivery'), 'utf8');
  assert.match(src, /timingSafeEqual/);
});

test('board: today, upcoming, at risk when ready after delivery, held only while live', () => {
  const q = D.boardQueues([
    { id: 1, status: 'confirmed', date: '2026-10-02', window_start: '12:00', window_label: '12pm–3pm' },
    { id: 2, status: 'confirmed', date: '2026-10-02', window_start: '09:00', window_label: '9am–12pm' },
    { id: 3, status: 'confirmed', date: '2026-10-06', window_start: '09:00', ready_by: '2026-10-08' },
    { id: 4, status: 'held', date: '2026-10-06', hold_expires_at: new Date(NOW.getTime() + 60e3) },
    { id: 5, status: 'held', date: '2026-10-06', hold_expires_at: new Date(NOW.getTime() - 60e3) },
    { id: 6, status: 'confirmed', date: '2026-09-30', window_start: '09:00' },
  ], NOW);
  assert.deepStrictEqual(q.today.map((b) => b.id), [6, 2, 1]);
  assert.strictEqual(q.today[0].overdue, true);
  assert.deepStrictEqual(q.upcoming.map((b) => b.id), [3]);
  assert.deepStrictEqual(q.atRisk.map((b) => b.id), [3]);
  assert.deepStrictEqual(q.held.map((b) => b.id), [4]);
  assert.strictEqual(q.today[1].phrase, 'Fri, Oct 2, 9am–12pm');
});

test('route link starts at the shop and runs through every stop', () => {
  const u = D.routeLink('3047 N Lincoln Ave, Chicago, IL 60657', ['A St, Chicago', 'B Ave, Chicago']);
  assert.match(u, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&origin=3047/);
  assert.match(u, /destination=B%20Ave/);
  assert.match(u, /waypoints=A%20St/);
  assert.strictEqual(D.routeLink('x', []), '');
});

test('courier cost and margin per zone come from the partner sheet', () => {
  const partner = { name: 'Metrobi', email: 'dispatch@example.com', costs: { 1: 10, 2: '' } };
  assert.strictEqual(D.courierCost(partner, 1), 10);
  assert.strictEqual(D.courierCost(partner, 2), null);
  assert.strictEqual(D.zoneMargin(zones[0], partner), 5);
  assert.strictEqual(D.zoneMargin(zones[1], partner), null);
  assert.strictEqual(D.courierReady(partner), true);
  assert.strictEqual(D.courierReady({ name: 'X', email: 'nope' }), false);
  assert.strictEqual(D.courierReady(null), false);
});

test('the store accepts every ref a booking is made under, and nothing else', () => {
  const { REF_RE } = require('../tools/lib/delivery-store');
  for (const ok of ['studio:123', 'quote:ABCDEFGHJK', 'cart:0123456789abcdef01234567']) assert.match(ok, REF_RE, ok);
  for (const bad of ['studio:', 'studio:12a', 'quote:abc', 'cart:XYZ', 'cart:0123', "quote:A'B", '']) assert.doesNotMatch(bad, REF_RE, bad);
});

test('every refusal a settings save can give is one the settings page will show', () => {
  const fs = require('fs');
  const store = fs.readFileSync(require.resolve('../tools/lib/delivery-store'), 'utf8');
  const server = fs.readFileSync(require.resolve('../server.js'), 'utf8');
  const list = server.slice(server.indexOf('const DELIVERY_SETTINGS_ERRORS = ['), server.indexOf('];', server.indexOf('const DELIVERY_SETTINGS_ERRORS = [')));
  const reasons = [...store.matchAll(/reason: '([^']+)'/g)].map((m) => m[1]).filter((r) => / /.test(r));   // sentences, not codes
  assert.ok(reasons.length >= 6, reasons.join(' | '));
  for (const r of reasons) assert.ok(list.includes(`'${r}'`), `settings page cannot show: ${r}`);
  // and it never echoes the query string itself
  assert.doesNotMatch(server, /escEmail\(err\.slice/);
});

test('delivery texts are plain GSM-7, branded, with an opt-out; out-for-delivery fits one segment', () => {
  const { T, isGsm7 } = require('../tools/lib/sms-templates');
  const out = T.deliveryOut({ ref: 'ABCDEFGHJK', window: '12:30pm–3:30pm' });
  const moved = T.deliveryMoved({ ref: 'ABCDEFGHJK', when: 'Wed, Sep 30, 12:30pm–3:30pm',
    link: 'https://www.jtees.net/d/' + 'A'.repeat(43) });
  for (const m of [out, moved]) {
    assert.ok(isGsm7(m.body), m.body);
    assert.match(m.body, /^June's Tees: /);
    assert.match(m.body, /Reply STOP to opt out\.$/);
  }
  assert.ok(out.body.length <= 160, `${out.body.length}: ${out.body}`);
  assert.ok(moved.body.length <= 306, `${moved.body.length}: ${moved.body}`);
  assert.ok(moved.body.includes('A'.repeat(43)), 'the whole link survives');
});
