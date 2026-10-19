'use strict';

/* The notifications bell (tools/lib/notifications.js and its sweep and routes
 * in server.js): one notification per thing per person, derived from the
 * shop's own records so no path that makes a lead, an approval or a payment
 * can be missed; a second sweep adds nothing; message ones clear themselves
 * once the conversation is read; each person sees and changes only their own.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const NOTIFY = require('../tools/lib/notifications');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}
function fn(name) {
  const at = src.indexOf(name);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  return src.slice(at, src.indexOf('\n}\n', at));
}

test('kinds: known ones only; the owner and a helper each get their own set', () => {
  assert.strictEqual(NOTIFY.kindOf('lead'), 'lead');
  assert.strictEqual(NOTIFY.kindOf('not-a-kind'), null);
  assert.deepStrictEqual(NOTIFY.kindsFor('owner').sort(), ['approval', 'chat', 'late', 'lead', 'mail', 'payment', 'review']);
  assert.deepStrictEqual(NOTIFY.kindsFor('staff:4').sort(), ['chat', 'decided', 'lead', 'mail']);
});

test('a title is one line, capped', () => {
  assert.strictEqual(NOTIFY.cleanTitle(' New lead:\r\n Kim  Lee '), 'New lead: Kim Lee');
  assert.strictEqual(NOTIFY.cleanTitle('x'.repeat(500)).length, NOTIFY.TITLE_MAX);
});

test('a notification only ever opens a back-office page on this site', () => {
  assert.strictEqual(NOTIFY.safeLink('/admin/mailbox/12#m-4'), '/admin/mailbox/12#m-4');
  assert.strictEqual(NOTIFY.safeLink('/admin/team-chat?channel=3'), '/admin/team-chat?channel=3');
  for (const bad of ['https://evil.example/admin', '//evil.example/admin', '/admin//evil.example', 'javascript:alert(1)', '/q/AB12CD', '', null]) {
    assert.strictEqual(NOTIFY.safeLink(bad), '/admin/notifications', String(bad));
  }
});

test('emails: messages on, everything else off, until the person says otherwise', () => {
  assert.strictEqual(NOTIFY.emailOn('mail', {}), true);
  assert.strictEqual(NOTIFY.emailOn('lead', {}), false);
  assert.strictEqual(NOTIFY.emailOn('lead', { lead: true }), true);
  assert.strictEqual(NOTIFY.emailOn('mail', { mail: false }), false);
  assert.strictEqual(NOTIFY.emailOn('nope', { nope: true }), false);
});

test('a message notification is one per conversation per unread spell', () => {
  assert.strictEqual(NOTIFY.messageRef('mb:12', 40), 'mb:12:40');
  assert.strictEqual(NOTIFY.convoOfRef('mb:12:40'), 'mb:12');
  assert.strictEqual(NOTIFY.convoOfRef('lead:3'), null);
  assert.strictEqual(NOTIFY.messageTitle(1, '# Everyone'), 'A new message in # Everyone');
  assert.strictEqual(NOTIFY.messageTitle(3, 'your chat with June'), '3 new messages in your chat with June');
});

test('one notification per thing: UNIQUE (recipient, kind, ref), and adding does nothing on a repeat', () => {
  assert.match(src, /CREATE TABLE IF NOT EXISTS notifications \([\s\S]*?UNIQUE \(recipient, kind, ref\)/);
  const add = fn('async function notifyAdd(');
  assert.match(add, /ON CONFLICT \(recipient, kind, ref\) DO NOTHING/);
  assert.match(add, /NOTIFY\.safeLink\(n\.link\)/, 'every stored link is checked');
});

test('derived from the records, so every way a lead, approval, review, payment or late job is made is covered', () => {
  const owner = fn('async function ownerNotices(');
  assert.match(fn('async function notifySweep('), /const leads = await notifyPart\('leads', unansweredLeads\(\)\);/, 'leads read once a sweep');
  assert.match(owner, /for \(const l of leads\)/);
  assert.match(owner, /FROM staff_approvals WHERE status = 'pending'/);
  assert.match(owner, /FROM art_requests a JOIN quotes q/);
  assert.match(owner, /FROM reviews[\s\S]*approved IS NOT TRUE/);
  assert.match(owner, /FROM quote_payments[\s\S]*kind = 'payment' AND amount > 0/);
  assert.match(owner, /quoteSchedule\(q\)[\s\S]*kind: 'late', ref: String\(q\.code\)/, 'a late job once per job');
  assert.match(owner, /NOTIFY_LOOKBACK_DAYS/, 'no flood of history on the first run');
});

test('a helper hears about their own requests and their own leads only, and not once disabled', () => {
  const staff = fn('async function staffNotices(');
  assert.match(staff, /recipient: `staff:\$\{a\.requested_by\}`/);
  assert.match(staff, /l\.assigned_to != null && active\.get/);
  assert.match(staff, /if \(!active\.has\(a\.requested_by\)\) continue;/);
  assert.match(fn('async function notifySweep('), /staffRoster\(\{ activeOnly: true \}\)/);
});

test('message notifications read what the chat alerts read, and clear once the conversation is read', () => {
  const msgs = fn('async function messageNotices(');
  assert.match(msgs, /unreadConversations\(rd, roster, channels, state, 0\)/);
  assert.match(msgs, /DO UPDATE SET title = EXCLUDED\.title WHERE notifications\.read_at IS NULL/);
  assert.match(msgs, /SET read_at = NOW\(\)[\s\S]*kind = ANY\(\$3::text\[\]\)[\s\S]*NOT \(ref = ANY\(\$2::text\[\]\)\)/);
  assert.match(fn('async function sendChatAlerts('), /unreadConversations\(rd, roster, channels, state, CHAN\.ALERT_AFTER_MIN\)/);
});

test('emails are claimed before sending, and messages are never emailed twice', () => {
  const mail = fn('async function notifyEmails(');
  assert.match(mail, /!NOTIFY\.KINDS\[k\]\.chatEmail/, 'Team chat alerts already email messages');
  assert.match(mail, /SET emailed_at = NOW\(\) WHERE id = \$1 AND emailed_at IS NULL/);
  assert.ok(mail.indexOf('emailed_at IS NULL') < mail.indexOf('pinEmail('), 'claimed first');
});

test('the sweep runs on a timer and, at most every 30 seconds, from a page load, never twice at once', () => {
  assert.match(src, /setInterval\(\(\) => step\('notifications', notifySweep\), 2 \* 60 \* 1000\)/);
  assert.match(fn('function notifySoon('), /Date\.now\(\) - notifyLastAt < 30 \* 1000/);
  assert.match(fn('async function notifySweep('), /if \(notifyRunning\) return '';/);
  assert.match(route("app.get('/admin/nav-counts', requireAdmin"), /notifySoon\(\);[\s\S]*notifyUnread\(me\)\.then\(\(n\) => \{ out\.notify = n; \}\)/);
});

test('every notification route is the caller\'s own: reads and writes keyed on their reader', () => {
  for (const r of ['GET /admin/notifications', 'POST /admin/notifications/:id/open', 'POST /admin/notifications/read-all',
    'GET /admin/notifications/settings', 'POST /admin/notifications/settings']) {
    assert.strictEqual(STAFF.ROUTES[r], 'any', r);
  }
  assert.match(route("app.get('/admin/notifications', requireAdmin"), /WHERE recipient = \$1/);
  const open = route("app.post('/admin/notifications/:id/open', requireAdmin");
  assert.match(open, /WHERE id = \$1 AND recipient = \$2 RETURNING link/, 'another person\'s id opens nothing');
  assert.match(open, /res\.redirect\(303, NOTIFY\.safeLink\(n\.link\)\)/);
  assert.match(route("app.post('/admin/notifications/read-all', requireAdmin"), /WHERE recipient = \$1 AND read_at IS NULL/);
  const save = route("app.post('/admin/notifications/settings', requireAdmin");
  assert.match(save, /NOTIFY\.kindsFor\(reader\)/, 'only kinds this person can get');
  assert.match(save, /INSERT INTO team_chat_prefs/, 'one switch for message emails, shared with Team chat');
});

test('the list escapes what it shows and opens through a POST, not a link that marks read', () => {
  const list = route("app.get('/admin/notifications', requireAdmin");
  assert.match(list, /escEmail\(n\.title\)/);
  assert.match(list, /<form method="post" action="\/admin\/notifications\/\$\{n\.id\}\/open"/);
  assert.match(list, /Cache-Control', 'no-store'/);
});

test('the bell is in the side menu and the phone top bar, filled by the menu counts', () => {
  const bell = fn('function notifyBell(');
  assert.match(bell, /href="\/admin\/notifications"/);
  assert.match(bell, /data-badge="notify" hidden/);
  assert.match(fn('function adminNav('), /\$\{notifyBell\(\)\}/);
  assert.match(fn('function adminPage('), /\$\{clockChip\(\)\}\s*\$\{notifyBell\(\)\}/);
  assert.match(src, /items: \['dashboard', 'notifications', 'tasks', 'mailbox', 'chat'\]/);
});

/* ── Code review fixes, 2026-10-19 ───────────────────────────────────────── */

test('a failed mailbox read never marks mailbox notifications read', () => {
  assert.match(fn('async function unreadConversations('), /due\.mailFailed = true; return \{ rows: \[\] \};/);
  assert.match(fn('async function messageNotices('), /due\.mailFailed \? \['chat'\] : \['chat', 'mail'\]/);
});

test('one reader\'s failure does not stop the bell for the readers after them', () => {
  const msgs = fn('async function messageNotices(');
  assert.ok(msgs.indexOf('try {') > msgs.indexOf('for (const rd of chatReaders(roster))'), 'the try is inside the loop');
  assert.match(msgs, /notifications \(messages for \$\{reader\}\) failed/);
});

test('a lead answered, an approval decided or a review moderated clears its notification', () => {
  const clear = fn('async function notifyClearResolved(');
  assert.match(clear, /read_at IS NULL AND NOT \(ref = ANY\(\$3::text\[\]\)\)/);
  const owner = fn('async function ownerNotices(');
  assert.match(owner, /notifyClearResolved\('owner', 'lead', leads\.map/);
  assert.match(owner, /notifyClearResolved\('owner', 'approval'/);
  assert.match(owner, /notifyClearResolved\('owner', 'review'/);
  assert.doesNotMatch(owner, /status = 'pending' ORDER BY id DESC LIMIT/, 'the waiting list it clears against is never cut short');
  assert.match(fn('async function staffNotices('), /notifyClearResolved\(`staff:\$\{id\}`, 'lead', refs\)/, 'a lead given to someone else clears');
});

test('a helper\'s leads look back as far as the owner\'s, not to the beginning', () => {
  assert.match(fn('async function staffNotices('), /if \(new Date\(l\.created_at\)\.getTime\(\) < since\) continue;/);
});

test('each source fails on its own, and a late job back on time can be late again', () => {
  const owner = fn('async function ownerNotices(');
  assert.match(owner, /notifyPart\('approvals'/);
  assert.match(owner, /try \{ sch = quoteSchedule\(q\); \} catch/);
  assert.ok(owner.indexOf('notifyLateAt = Date.now()') > owner.indexOf("liveJobs()"), 'the 10-minute clock only moves once the check ran');
  assert.match(owner, /ref = ref \|\| ':done:' \|\| id[\s\S]*NOT \(ref = ANY\(\$1::text\[\]\)\)/);
});

test('a failed email is tried again; the claim is undone', () => {
  const mail = fn('async function notifyEmails(');
  assert.match(mail, /emailed_at IS NULL AND read_at IS NULL[\s\S]*created_at > NOW\(\) - interval '30 minutes'/, 'not only the ones added this sweep');
  assert.match(mail, /catch \(e\) \{[\s\S]*SET emailed_at = NULL WHERE id = \$1/);
});

test('reading a conversation clears its bell notification at once', () => {
  assert.match(fn('function notifyConvoRead('), /ref LIKE \$2`,\s*\[reader, `\$\{convo\}:%`\]/);
  assert.match(fn('function chatMarkRead('), /notifyConvoRead\(CHAN\.readerKey\(actor\), `dm:\$\{staffId\}`\)/);
  assert.match(fn('async function channelMarkRead('), /notifyConvoRead\(reader, `ch:\$\{channelId\}`\)/);
  assert.match(route("app.get('/admin/mailbox/:id', requireAdmin"), /notifyConvoRead\(reader, `mb:\$\{t\.id\}`\)/);
});

test('one rule for the owner\'s email address', () => {
  assert.match(fn('function chatReaders('), /to: emailOfReader\(roster, 'owner'\)/);
  assert.doesNotMatch(fn('function chatReaders('), /OWNER_EMAILS/);
});
