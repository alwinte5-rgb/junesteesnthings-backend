'use strict';

/* Team chat channels and alert emails (tools/lib/team-channels.js and the
 * team chat routes in server.js): a helper only ever reaches the channels of
 * their own track, the owner manages channels, and an alert goes once per
 * conversation until it is read.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CHAN = require('../tools/lib/team-channels');
const STAFF = require('../tools/lib/staff');
const TRAINING = require('../tools/lib/training');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

test('membership: everyone, or one track; the owner everywhere; never archived or disabled', () => {
  const all = { id: 1, audience: 'all' }, sales = { id: 2, audience: 'sales' }, gone = { id: 3, audience: 'all', archived_at: new Date() };
  const ana = { id: 7, active: true, training_track: 'sales' }, dee = { id: 8, active: true, training_track: 'design' };
  const off = { id: 9, active: false, training_track: 'sales' };
  assert.ok(CHAN.isMember(all, dee, TRAINING.trackOf));
  assert.ok(CHAN.isMember(sales, ana, TRAINING.trackOf));
  assert.ok(!CHAN.isMember(sales, dee, TRAINING.trackOf));
  assert.ok(!CHAN.isMember(all, off, TRAINING.trackOf));
  assert.ok(!CHAN.isMember(gone, ana, TRAINING.trackOf));
  assert.ok(CHAN.isMember(sales, { id: 10, active: true, training_track: null }, TRAINING.trackOf), 'no track reads as sales, the default');
  assert.ok(CHAN.mayUse({ kind: 'owner' }, sales, null, TRAINING.trackOf));
  assert.ok(!CHAN.mayUse({ kind: 'staff', id: 8 }, sales, dee, TRAINING.trackOf));
  assert.ok(!CHAN.mayUse({ kind: 'staff', id: 8 }, all, ana, TRAINING.trackOf), 'their own row, never someone else\'s');
  assert.ok(!CHAN.mayUse({ kind: 'owner' }, gone, null, TRAINING.trackOf));
});

test('alerts: once per stretch of unread messages', () => {
  assert.strictEqual(CHAN.alertDue(null, 0), false);
  assert.strictEqual(CHAN.alertDue(5, 0), true);
  assert.strictEqual(CHAN.alertDue(5, 9), false, 'already emailed about 5..9');
  assert.strictEqual(CHAN.alertDue(12, 9), true, 'read, then new messages');
  assert.strictEqual(CHAN.readerKey({ kind: 'staff', id: 4 }), 'staff:4');
  assert.strictEqual(CHAN.readerKey({ kind: 'owner' }), 'owner');
});

test('channel names and audiences from a form are cleaned', () => {
  assert.strictEqual(CHAN.cleanName('  Big\n  orders  '), 'Big orders');
  assert.strictEqual(CHAN.cleanName('x'.repeat(99)).length, CHAN.NAME_MAX);
  for (const bad of ['', 'owner', '__proto__', 'constructor']) assert.strictEqual(CHAN.audienceOf(bad), null);
  assert.strictEqual(CHAN.audienceOf('design'), 'design');
});

test('routes: channels chosen by the server, the owner manages them, alerts are each person\'s own', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/team-chat/channels'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/team-chat/alerts'], 'any');
  const send = route("app.post('/admin/team-chat', requireAdmin");
  assert.match(send, /const ch = chatChannelFor\(b\.channel, channels, roster\);\n\s+if \(!ch\) return back/);
  assert.match(send, /const author = actor\.kind === 'staff' \? actor\.id : null;/, 'the author is who is signed in');
  const fn = src.slice(src.indexOf('function chatChannelFor('), src.indexOf('\n}\n', src.indexOf('function chatChannelFor(')));
  assert.match(fn, /channelsFor\(currentActor\(\) \|\| OWNER_ACTOR, \[c\], roster\)/);
  const poll = route("app.get('/admin/api/team-chat', requireAdmin");
  assert.match(poll, /if \(!ch\) return res\.status\(404\)/);
  const alerts = route("app.post('/admin/team-chat/alerts', requireAdmin");
  assert.match(alerts, /CHAN\.readerKey\(currentActor\(\) \|\| OWNER_ACTOR\)/, 'only your own setting');
  const sweep = src.slice(src.indexOf('async function sendChatAlerts('), src.indexOf('\n}\n', src.indexOf('async function sendChatAlerts(')));
  assert.match(sweep, /WHERE team_chat_reads\.alerted_id < \$4/, 'claimed before sending, so it goes once');
  assert.match(sweep, /if \(off\.has\(reader\)\) continue;/);
  assert.match(src, /setInterval\(\(\) => step\('chat alerts', sendChatAlerts\)/);
});
