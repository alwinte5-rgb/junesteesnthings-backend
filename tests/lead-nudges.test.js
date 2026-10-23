/**
 * Calls and speed to lead (plan Phase 1e): phone calls become leads, and the
 * owner is texted when a lead is still waiting after 2 working hours and 24h.
 *
 * Run: node tests/lead-nudges.test.js
 */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const N = require('../tools/lib/lead-nudges');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
/* Wed 2026-10-07, Chicago (CDT, UTC-5). */
const at = (iso) => Date.parse(iso);
const WED_9 = at('2026-10-07T14:00:00Z'), WED_11 = at('2026-10-07T16:00:00Z'), WED_1059 = at('2026-10-07T15:59:00Z');
const lead = (o) => ({ id: 1, name: 'Ana Reyes', source: 'form', lead_status: 'new', created_at: new Date(WED_9).toISOString(), ...o });

test('2 working hours after it came in, a waiting lead is due its first text', () => {
  assert.deepStrictEqual(N.dueNudges([lead()], WED_1059).first, []);
  assert.strictEqual(N.dueNudges([lead()], WED_11).first.length, 1);
});

test('night and weekend hours do not count toward the 2 hours', () => {
  const fri4pm = at('2026-10-09T21:00:00Z');          // Fri 4pm: one working hour left
  const sat = at('2026-10-10T15:00:00Z'), mon955 = at('2026-10-12T14:55:00Z'), mon10 = at('2026-10-12T15:00:00Z');
  const l = lead({ created_at: new Date(fri4pm).toISOString() });
  assert.strictEqual(N.dueNudges([l], sat).first.length, 0);
  assert.strictEqual(N.dueNudges([l], mon955).first.length, 0);
  // By Monday it is also over a day old: the 24h text replaces the 2h one.
  assert.strictEqual(N.dueNudges([l], mon10).second.length, 1);
  assert.strictEqual(N.dueNudges([l], mon10).first.length, 0);
});

test('a day old: the second text, once', () => {
  const thu10 = at('2026-10-08T15:00:00Z');
  assert.strictEqual(N.dueNudges([lead({ unanswered_2h_at: 'x' })], thu10).second.length, 1);
  assert.strictEqual(N.dueNudges([lead({ unanswered_2h_at: 'x', unanswered_24h_at: 'y' })], thu10).second.length, 0);
  assert.strictEqual(N.dueNudges([lead({ unanswered_2h_at: 'x' })], WED_11 + 3600000).first.length, 0, 'first is not repeated');
});

test('answered, quoted, let go, a live chat, or older than 3 working days: no text', () => {
  const thu10 = at('2026-10-08T15:00:00Z');
  for (const o of [{ first_response_at: 'x' }, { lead_status: 'quoted' }, { lead_status: 'dismissed' },
                   { outcome: 'not_fit' }, { source: 'chat' }]) {
    const d = N.dueNudges([lead(o)], thu10);
    assert.strictEqual(d.first.length + d.second.length, 0, JSON.stringify(o));
  }
  assert.strictEqual(N.dueNudges([lead({ source: 'offline' })], thu10).second.length, 1, 'an offline chat message needs a reply');
  assert.strictEqual(N.dueNudges([lead({ source: 'phone' })], thu10).second.length, 1, 'a missed call needs a call back');
  const old = lead({ created_at: new Date(WED_9 - 6 * 86400000).toISOString() });
  assert.strictEqual(N.dueNudges([old], WED_11).second.length, 0, 'the backlog is left alone');
});

test('texts go out in working hours only', () => {
  assert.strictEqual(N.inWorkingHours(WED_11), true);
  assert.strictEqual(N.inWorkingHours(at('2026-10-07T08:00:00Z')), false, '3am');
  assert.strictEqual(N.inWorkingHours(at('2026-10-10T16:00:00Z')), false, 'Saturday');
  assert.strictEqual(N.inWorkingHours(at('2026-10-07T22:00:00Z')), false, '5pm is closed');
});

test('one text for all of them: first names, source, age, never a number or email', () => {
  const thu10 = at('2026-10-08T15:00:00Z');
  const a = lead({ id: 1, name: 'Ana Reyes', email: 'ana@x.com', phone: '7735550101' });
  const b = lead({ id: 2, name: 'Bo', source: 'phone', created_at: new Date(thu10 - 3 * 3600000).toISOString() });
  const body = N.nudgeText({ first: [b], second: [a] }, { now: thu10, sourceLabel: (s) => ({ form: 'Website form', phone: 'Phone call' })[s],
    link: 'https://www.jtees.net/admin/leads' });
  assert.strictEqual(body, "June's Tees: 2 leads are still waiting for a reply: Ana (Website form, 25h), Bo (Phone call, 3h). " +
    'Over a day old: reply today or they go elsewhere. https://www.jtees.net/admin/leads');
  assert.doesNotMatch(body, /ana@x\.com|7735550101|Reyes/);
  assert.strictEqual(N.nudgeText({ first: [], second: [] }), '');
  const many = Array.from({ length: 7 }, (_, i) => lead({ id: i, name: 'P' + i }));
  assert.match(N.nudgeText({ first: many, second: [] }, { now: WED_11 }), /\+3 more\.$/);
  assert.ok(N.nudgeText({ first: many, second: [] }, { now: WED_11 }).length <= 320);
});

test('server: calls are leads, nudges are claimed before sending, in the hourly sweep', () => {
  assert.match(server, /phone: +\['Phone call', 'amber'\]/);
  assert.match(server, /const SOURCES = \['all', 'form', 'designer', 'embroidery', 'chat', 'phone', 'social'\]/);
  assert.match(server, /app\.post\('\/admin\/leads\/call', requireAdmin,/);
  assert.match(server, /\$\{logCallForm\(\)\}\s+\$\{addLeadForm\(\)\}/);
  assert.match(server, /platform === 'Phone' \? 'phone' : 'manual'/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS unanswered_2h_at TIMESTAMPTZ/);
  assert.match(server, /ADD COLUMN IF NOT EXISTS unanswered_24h_at TIMESTAMPTZ/);
  const fn = server.slice(server.indexOf('async function nudgeUnansweredLeads('), server.indexOf('/** The leads nobody has answered'));
  assert.ok(fn.indexOf('unanswered_2h_at IS NULL AND ${stillWaiting}') < fn.indexOf('sendOwnerSms('), 'claimed before the text');
  assert.match(fn, /if \(!NUDGE\.inWorkingHours\(now\)\) return '';/);
  assert.match(server, /await step\('unanswered leads', nudgeUnansweredLeads\);/);
  assert.match(fn, /if \(!sent\) \{[^]*?alertShop\(/, "no Twilio (production today): the same words by email");
});

test('a lead that turns a day old on a weekend still gets its 24h text on Monday', () => {
  const thu6pm = at('2026-10-08T23:00:00Z'), mon930 = at('2026-10-12T14:30:00Z');   // 87.5h later
  const l = lead({ created_at: new Date(thu6pm).toISOString(), unanswered_2h_at: new Date(thu6pm).toISOString() });
  assert.strictEqual(N.dueNudges([l], mon930).second.length, 1);
});

test('the window is working days, so a deploy does not text the 3-5 day backlog', () => {
  const mon9 = at('2026-10-05T14:00:00Z'), fri10 = at('2026-10-09T15:00:00Z');       // 4 working days + 1h
  assert.strictEqual(N.dueNudges([lead({ created_at: new Date(mon9).toISOString() })], fri10).second.length, 0);
  const tue1pm = at('2026-10-06T18:00:00Z');                                          // Tue 1pm: 4+8+8+1 = 21 working hours
  assert.strictEqual(N.dueNudges([lead({ created_at: new Date(tue1pm).toISOString() })], fri10).second.length, 1);
});

test('a long list loses names, never the day-old warning or the link', () => {
  const link = 'https://www.jtees.net/admin/leads';
  const long = Array.from({ length: 6 }, (_, i) => lead({ id: i, name: 'Bartholomewwwwwwwwww' + i, source: 'offline' }));
  const body = N.nudgeText({ first: long.slice(3), second: long.slice(0, 3) },
    { now: WED_11 + 30 * 3600000, sourceLabel: () => 'Offline message', link });
  assert.ok(body.length <= 320, String(body.length));
  assert.ok(body.endsWith('. Over a day old: reply today or they go elsewhere. ' + link), body);
  assert.match(body, /\+\d more\./);
  const none = N.nudgeText({ first: [], second: Array.from({ length: 6 }, (_, i) => lead({ id: i, name: 'X'.repeat(20) })) },
    { now: WED_11 + 30 * 3600000, sourceLabel: () => 'S'.repeat(200), link });
  assert.ok(none.startsWith("June's Tees: 6 leads are still waiting for a reply. Over a day old"), none);
  const longLink = 'https://' + 'x'.repeat(300) + '.example/admin/leads';
  const cut = N.nudgeText({ first: [], second: [lead()] }, { now: WED_11 + 30 * 3600000, link: longLink });
  assert.ok(cut.endsWith(' ' + longLink) || cut === (' ' + longLink).slice(-320), 'the link is never the part that is cut');
});
test('server: the nudge email is never held for the daily summary, and a dead connection is not pooled', () => {
  const fn = server.slice(server.indexOf('async function nudgeUnansweredLeads('), server.indexOf('/** The leads nobody has answered'));
  assert.match(fn, /\{ urgent: true, rethrow: true \}/);
  assert.match(server, /if \(rethrow\) throw e;/);
  assert.match(fn, /client\.release\(dead \|\| undefined\)/);
});

test('server: claims commit before the send, a failed send gives them back, matched quotes count', () => {
  const fn = server.slice(server.indexOf('async function nudgeUnansweredLeads('), server.indexOf('/** The leads nobody has answered'));
  assert.ok(fn.indexOf("client.query('COMMIT')") < fn.indexOf('sendOwnerSms('), 'no lock held across the send');
  assert.ok(fn.indexOf('alertShop(') < fn.indexOf('THEN NULL ELSE unanswered_2h_at END'), 'unclaimed after a failed email');
  assert.match(fn, /q\.from_submission_id = s\.id OR \$\{LEAD_QUOTE_MATCH\}/);
  assert.match(fn, /s\.first_response_at IS NULL AND s\.dismissed_at IS NULL AND s\.outcome IS NULL/);
  assert.match(fn, /since: now - NUDGE\.WINDOW_MS/);
});

test('server: a call or walk-in the shop took is answered by the shop, not by the helper', () => {
  const add = server.slice(server.indexOf("app.post('/admin/leads/add'"), server.indexOf("app.post('/admin/leads/add'") + 9000);
  assert.match(add, /const spoken = !foundIt &&/);
  assert.match(add, /finder_run_id,\s+first_response_at\)/);
  const ins = add.slice(add.indexOf('INSERT INTO submissions'), add.indexOf('RETURNING id', add.indexOf('INSERT INTO submissions')));
  assert.doesNotMatch(ins, /first_response_by/, 'no helper credited with a reply');
  assert.match(server, /UPDATE submissions SET source = 'phone' WHERE platform = 'Phone' AND source = 'manual'/);
});
