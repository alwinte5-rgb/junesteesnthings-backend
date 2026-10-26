'use strict';

/* The selling calendar: dates by rule, when each event sells, and emails that
   link only to the shop's own pages. */

const { test } = require('node:test');
const assert = require('node:assert');
const E = require('../tools/lib/events');

test('dates follow their rules', () => {
  assert.strictEqual(E.iso(E.nthWeekday(2026, 10, 0, 2)), '2026-10-11', 'marathon: 2nd Sunday of October');
  assert.strictEqual(E.iso(E.nthWeekday(2026, 11, 4, 4)), '2026-11-26', 'Thanksgiving');
  assert.strictEqual(E.iso(E.nthWeekday(2027, 6, 0, -1)), '2027-06-27', 'last Sunday of June');
  assert.strictEqual(E.iso(E.easter(2027)), '2027-03-28');
  assert.strictEqual(E.iso(E.easter(2028)), '2028-04-16');
});

test('on 6 Oct 2026 orders for the marathon and Halloween have closed (4 weeks ahead) and Thanksgiving is selling; past events roll to next year', () => {
  const up = E.upcoming(new Date('2026-10-06T15:00:00Z'));
  assert.deepStrictEqual(E.sellingNow(new Date('2026-10-06T15:00:00Z')).map((e) => e.key), ['thanksgiving']);
  assert.strictEqual(E.iso(up.find((e) => e.key === 'chicago-marathon').orderByDate), '2026-09-13');
  assert.strictEqual(E.iso(up.find((e) => e.key === 'breast-cancer-awareness').date), '2027-10-01');
  assert.ok(up.every((e, i) => i === 0 || up[i - 1].date <= e.date));
});

test('every email has its dates filled in and links only to jtees.net or design.jtees.net', () => {
  for (const ev of E.upcoming(new Date('2026-10-06T15:00:00Z'))) {
    const m = E.emailFor(ev);
    assert.doesNotMatch(m.subject + m.preview + m.html, /\{date\}|\{orderBy\}/, ev.key);
    for (const [, href] of m.html.matchAll(/href="([^"]+)"/g)) {
      assert.match(href, /^(https:\/\/(www|design)\.jtees\.net\/|tel:\+17739004592$)/, `${ev.key} links to ${href}`);
    }
    assert.match(m.html, /Order by /);
  }
});

test('the campaign: Tuesdays and Thursdays only, selling starts eight weeks ahead, one last call each, on or before the order-by date', () => {
  const from = new Date('2026-10-06T12:00:00Z');
  const sch = E.schedule(from, 365);
  assert.ok(sch.length > 60);
  assert.ok(sch.every((x) => E.SEND_DAYS.includes(x.day.getUTCDay())));
  assert.ok(E.upcoming(from).every((e) => (e.date - e.start) / 86400000 >= E.MIN_LEAD));
  const calls = {};
  for (const x of sch) {
    assert.ok(x.day <= x.event.orderByDate, `${x.event.key} emailed after its order-by date`);
    if (x.beat === 'lastcall') calls[x.event.key + E.iso(x.event.date)] = (calls[x.event.key + E.iso(x.event.date)] || 0) + 1;
  }
  assert.ok(Object.values(calls).every((n) => n === 1), 'a second last call');
  /* Every event whose whole selling window falls inside the year ends with a
     last call - even when two deadlines land in the same week. */
  const end = from.getTime() + 365 * 86400000;
  for (const e of E.EVENTS) {
    for (const y of [2027]) {
      const o = E.upcoming(new Date(Date.UTC(y, 0, 1))).find((x) => x.key === e.key);
      if (o.start < from || o.orderByDate.getTime() > end - 7 * 86400000) continue;
      assert.strictEqual(calls[e.key + E.iso(o.date)], 1, `${e.key} ${E.iso(o.date)} has no last call`);
    }
  }
});

test('every campaign email has the logo, a picture with alt text, the order link and why they are getting it', () => {
  for (const x of E.schedule(new Date('2026-10-06T12:00:00Z'), 365)) {
    const m = E.emailFor(x);
    assert.ok(m.subject && m.preview && m.text, x.event.key);
    assert.match(m.html, /assets\/images\/brand\/logo-current-900\.png" width="260" alt="June/);
    assert.match(m.html, new RegExp(`<img src="https://www\\.jtees\\.net/assets/images/${x.event.photo.replace(/[.]/g, '\\.')}"[^>]* alt="[^"]+"`));
    assert.match(m.html, /You are getting this because/);
    assert.match(m.text, /https:\/\/(www|design)\.jtees\.net\//);
  }
});

test('no event promises less than 4 weeks to order (owner, 2026-10-17)', () => {
  assert.ok(E.MIN_ORDER_BY >= 28);
  for (const e of E.upcoming(new Date('2026-10-06T12:00:00Z'))) {
    assert.ok((e.date - e.orderByDate) / 86400000 >= 28, `${e.key}: order by ${E.iso(e.orderByDate)} for ${E.iso(e.date)}`);
    assert.ok((e.orderByDate - e.start) / 86400000 >= 28, `${e.key}: at least 4 weeks of selling`);
  }
});
