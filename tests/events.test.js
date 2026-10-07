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

test('on 6 Oct 2026 the marathon and Halloween are selling, soonest first; past events roll to next year', () => {
  const up = E.upcoming(new Date('2026-10-06T15:00:00Z'));
  assert.deepStrictEqual(E.sellingNow(new Date('2026-10-06T15:00:00Z')).map((e) => e.key), ['chicago-marathon', 'halloween']);
  assert.strictEqual(E.iso(up.find((e) => e.key === 'chicago-marathon').orderByDate), '2026-10-08');
  assert.strictEqual(E.iso(up.find((e) => e.key === 'breast-cancer-awareness').date), '2027-10-01');
  assert.ok(up.every((e, i) => i === 0 || up[i - 1].date <= e.date));
});

test('every email has its dates filled in and links only to jtees.net or design.jtees.net', () => {
  for (const ev of E.upcoming(new Date('2026-10-06T15:00:00Z'))) {
    const m = E.emailFor(ev);
    assert.doesNotMatch(m.subject + m.preview + m.html, /\{date\}|\{orderBy\}/, ev.key);
    for (const [, href] of m.html.matchAll(/href="([^"]+)"/g)) {
      assert.match(href, /^https:\/\/(www|design)\.jtees\.net\//, `${ev.key} links to ${href}`);
    }
    assert.match(m.html, /Order by /);
  }
});
