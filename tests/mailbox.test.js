'use strict';

/* The Mailbox (tools/lib/mailbox.js and its routes in server.js): one
 * conversation per order or task, Done takes it off the dashboards, a new
 * message reopens it, nothing is ever deleted, and each side can see whether
 * the other has read or replied. Team chat is left exactly as it was.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MB = require('../tools/lib/mailbox');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

test('folders: open or done, nothing else', () => {
  assert.strictEqual(MB.folderOf('done'), 'done');
  assert.strictEqual(MB.folderOf('open'), 'open');
  assert.strictEqual(MB.folderOf('archived'), 'open');
  assert.strictEqual(MB.folderOf(undefined), 'open');
});

test('a subject is one trimmed line, capped', () => {
  assert.strictEqual(MB.cleanSubject('  Sizes for\nLincoln  order '), 'Sizes for Lincoln order');
  assert.strictEqual(MB.cleanSubject('x'.repeat(500)).length, MB.SUBJECT_MAX);
  assert.strictEqual(MB.cleanSubject(null), '');
});

test('recipients: whole ids, each once; a list too long is refused, not cut', () => {
  assert.deepStrictEqual(MB.pickRecipients(['3', '3', '7', 'x', '-1', '0']), [3, 7]);
  assert.deepStrictEqual(MB.pickRecipients('5'), [5]);
  assert.deepStrictEqual(MB.pickRecipients(undefined), []);
  assert.strictEqual(MB.pickRecipients(Array.from({ length: MB.MAX_RECIPIENTS + 1 }, (_, i) => String(i + 1))), null);
});

test('who may read: the owner reads all; a helper only their own conversations', () => {
  assert.ok(MB.mayRead('owner', ['staff:2']));
  assert.ok(MB.mayRead('staff:2', ['owner', 'staff:2']));
  assert.ok(!MB.mayRead('staff:3', ['owner', 'staff:2']));
});

test('read and replied, from the writer\'s side', () => {
  const parts = ['owner', 'staff:2', 'staff:3'];
  const msgs = [
    { id: 1, author: 'owner', created_at: 't1' },
    { id: 2, author: 'staff:2', created_at: 't2' },
    { id: 3, author: 'owner', created_at: 't3' },
    { id: 4, author: 'staff:2', created_at: 't4' },
  ];
  const seen = { 3: { 'staff:3': 's3' } };
  assert.deepStrictEqual(MB.replyState('owner', parts, msgs, seen), [
    { reader: 'staff:2', state: 'replied', at: 't4' },
    { reader: 'staff:3', state: 'read', at: 's3' },
  ], 'measured against the latest message the owner wrote');
  assert.deepStrictEqual(MB.replyState('staff:3', parts, msgs, seen), [], 'nothing written, nothing to report');
  const noReply = MB.replyState('owner', ['owner', 'staff:2'], msgs.slice(0, 3), {});
  assert.deepStrictEqual(noReply, [{ reader: 'staff:2', state: 'unread', at: null }]);
});

test('unread counts only other people\'s messages not yet seen', () => {
  const msgs = [{ id: 1, author: 'owner' }, { id: 2, author: 'staff:2' }, { id: 3, author: 'owner' }];
  assert.strictEqual(MB.unreadFor('staff:2', msgs, { 1: { 'staff:2': 'x' } }), 1);
  assert.strictEqual(MB.unreadFor('owner', msgs, {}), 1);
});

/* ── the routes ──────────────────────────────────────────────────────────── */

test('every mailbox route is open to signed-in helpers and checks the conversation itself', () => {
  for (const k of ['GET /admin/mailbox', 'GET /admin/mailbox/new', 'POST /admin/mailbox', 'GET /admin/mailbox/:id',
                   'POST /admin/mailbox/:id/reply', 'POST /admin/mailbox/:id/status', 'POST /admin/mailbox/:id/edit',
                   'GET /admin/mailbox/file/:id']) {
    assert.strictEqual(STAFF.permForRoute(k.split(' ')[0], k.split(' ')[1]), 'any', k);
  }
  for (const sig of ["app.get('/admin/mailbox/:id', requireAdmin", "app.post('/admin/mailbox/:id/reply', requireAdmin",
                     "app.post('/admin/mailbox/:id/status', requireAdmin", "app.post('/admin/mailbox/:id/edit', requireAdmin",
                     "app.get('/admin/mailbox/file/:id', requireAdmin"]) {
    assert.match(route(sig), /mailThreadFor\(/, `${sig} loads the thread through the participant check`);
  }
  const loader = src.slice(src.indexOf('async function mailThreadFor('), src.indexOf('\n}\n', src.indexOf('async function mailThreadFor(')));
  assert.match(loader, /MB\.mayRead\(reader, parts\)/);
});

test('nothing is ever deleted or archived', () => {
  const block = src.slice(src.indexOf('/* ── Mailbox ──'), src.indexOf('/* ── end Mailbox ──'));
  assert.ok(block.length > 2000, 'the mailbox block');
  assert.doesNotMatch(block, /DELETE FROM mail_|UPDATE mail_\w+ SET archived/);
  assert.doesNotMatch(src, /DELETE FROM mail_/, 'anywhere');
  assert.match(src, /CREATE TABLE IF NOT EXISTS mail_threads/);
});

test('a new message reopens a Done conversation', () => {
  const reply = route("app.post('/admin/mailbox/:id/reply', requireAdmin");
  assert.match(reply, /UPDATE mail_threads SET status = 'open', done_at = NULL, done_by = NULL, last_message_at = NOW\(\)/);
});

test('a conversation about an order is one the writer can open, and new each time', () => {
  const create = route("app.post('/admin/mailbox', requireAdmin");
  assert.match(create, /QUOTE_CODE_RE\.test\(code\)/);
  assert.match(create, /canOpenJob\(code, actor\)/);
  assert.match(create, /INSERT INTO mail_threads/, 'every start is its own conversation');
  assert.match(create, /MB\.pickRecipients\(/);
  assert.match(create, /r\.active && !r\.archived_at/, 'only working helpers can be written to');
});

test('a message is checked: length, a file only from our own chat storage, no double sends', () => {
  const add = src.slice(src.indexOf('async function addMailMessage('), src.indexOf('\n}\n', src.indexOf('async function addMailMessage(')));
  assert.match(add, /TEAM_CHAT_MAX/);
  assert.match(add, /CHATFILES\.fileUrlOk\(fileUrl, QPHOTOS\.cloudName\(\)\)/);
  assert.match(add, /created_at > NOW\(\) - interval '10 seconds'/);
});

test('Team chat is untouched: its tables and routes are still there', () => {
  assert.match(src, /app\.post\('\/admin\/team-chat', requireAdmin/);
  assert.match(src, /CREATE TABLE IF NOT EXISTS team_channel_messages/);
  assert.match(src, /CREATE TABLE IF NOT EXISTS team_channel_seen/);
});

test('a helper in a conversation the owner started about an order may open that job', () => {
  const tagged = src.slice(src.indexOf('async function ownerTaggedCodes('), src.indexOf('\n}\n', src.indexOf('async function ownerTaggedCodes(')));
  assert.match(tagged, /FROM mail_threads t JOIN mail_participants p/);
  assert.match(tagged, /t\.created_by = 'owner'/);
});

test('mailbox emails ride on the chat alerts: one per conversation until read, the same off switch', () => {
  const alerts = src.slice(src.indexOf('async function sendChatAlerts('), src.indexOf('\n}\n', src.indexOf('async function sendChatAlerts(')));
  assert.match(alerts, /convo: `mb:\$\{d\.thread_id\}`/);
  assert.match(alerts, /WHERE \$\{MAIL_MINE_SQL\} AND \$\{MAIL_UNSEEN_SQL\}/, 'unseen messages in your conversations, never your own');
  assert.doesNotMatch(alerts, /status = 'open'/, 'Done by someone else does not stop your alert');
  assert.match(alerts, /if \(off\.has\(reader\)\) continue;/, 'the Team chat Email alerts switch covers it');
});

test('the dashboards and the job page show the mailbox; Done ones leave the dashboards', () => {
  const dash = src.slice(src.indexOf('async function mailDashboard('), src.indexOf('\n}\n', src.indexOf('async function mailDashboard(')));
  assert.match(dash, /WHERE status = 'open' OR unread > 0/, 'Done ones leave, unless they hold something you have not seen');
  assert.match(route("app.get('/admin/dashboard', requireAdmin"), /mailDashboard\(/);
  assert.match(route("app.get('/admin/my-day', requireAdmin"), /mailDashboard\(actor, 6\)/);
  assert.match(route("app.get('/admin/production/:code', requireAdmin"), /mailOrderCard\(q\.code/);
  assert.match(src, /href="\/admin\/mailbox\/new\?task=\$\{Number\(t\.id\)\}"/, 'every task offers a conversation');
});

/* ── Code review fixes, 2026-10-18 ───────────────────────────────────────── */

function fn(name) {
  const at = src.indexOf(name);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  return src.slice(at, src.indexOf('\n}\n', at));
}

test('Done by one person never hides unread messages from the others', () => {
  const unseen = src.match(/const MAIL_UNSEEN_SQL = `([^`]+)`/);
  assert.ok(unseen, 'MAIL_UNSEEN_SQL is defined');
  assert.match(unseen[1], /m\.author <> \$1 AND NOT EXISTS \(SELECT 1 FROM mail_seen s WHERE s\.message_id = m\.id AND s\.reader = \$1\)/);
  const badge = fn('async function mailUnreadCount(');
  assert.match(badge, /\$\{MAIL_MINE_SQL\} AND \$\{MAIL_UNSEEN_SQL\}/);
  assert.doesNotMatch(badge, /status/, 'the menu badge counts Done conversations with unseen messages too');
});

test('the dashboards count unread in one query and load messages only for the rows shown', () => {
  const dash = fn('async function mailDashboard(');
  assert.match(dash, /SELECT COUNT\(\*\)::int FROM mail_messages m WHERE m\.thread_id = t\.id AND \$\{MAIL_UNSEEN_SQL\}/);
  assert.match(dash, /mailDetails\(shown\.map/);
  assert.doesNotMatch(dash, /mailDetails\(threads\./);
});

test('the job page card loads only who is in each conversation', () => {
  const card = fn('async function mailOrderCard(');
  assert.match(card, /mailParts\(/);
  assert.doesNotMatch(card, /mailDetails\(/);
});

test('the mailbox list runs no job check per row', () => {
  const list = route("app.get('/admin/mailbox', requireAdmin");
  assert.doesNotMatch(list, /mailAboutHtml|canOpenJob|ownerTaggedFor/);
  assert.match(list, /mailAboutText\(t, tasksById\)/);
});

test('an order is linked on a conversation only while the reader can open it', () => {
  const about = fn('async function mailAboutHtml(');
  assert.match(about, /if \(!await canOpenJob\(t\.quote_code, actor\)/);
  assert.ok(about.indexOf('canOpenJob') < about.indexOf('<a href'), 'checked before the link is drawn');
});

test('starting a conversation twice makes one: a per-person lock and a 10-second repeat check', () => {
  const start = route("app.post('/admin/mailbox', requireAdmin");
  assert.match(start, /pg_advisory_xact_lock\(hashtext\(\$1\)\)', \[`mail-start:\$\{author\}`\]/);
  assert.match(start, /t\.created_at > NOW\(\) - interval '10 seconds'/);
  assert.ok(start.indexOf('pg_advisory_xact_lock') < start.indexOf('INSERT INTO mail_threads'), 'locked before the insert');
  assert.match(start, /if \(!repeat\) logActivity/);
});

test('a refused start shows the form again with everything typed and attached', () => {
  const start = route("app.post('/admin/mailbox', requireAdmin");
  assert.doesNotMatch(start, /return back\(res, again/, 'no redirect to an empty form');
  assert.match(start, /mailNewPage\(res, actor, \{ code, task: taskId, to: ids \|\| \[\], subject: [^}]*body, fileUrl, fileName, err \}, 400\)/);
  const page = fn('async function mailNewPage(');
  assert.match(page, /\$\{escEmail\(v\.body \|\| ''\)\}<\/textarea>/);
  assert.match(page, /picked\.has\(r\.id\) \? ' checked'/);
  assert.match(page, /CHATFILES\.fileUrlOk\(v\.fileUrl/, 'a carried-over file is checked again before it is put back');
  assert.match(page, /data-mailform\$\{staff \? '' : ' data-needto'\}/, 'the owner must tick a helper before it posts');
  assert.match(src, /f\.hasAttribute\('data-needto'\) && !f\.querySelector\('input\[name=to\]:checked'\)/);
});

test('a reply and its reopen are one transaction, behind the conversation\'s row lock', () => {
  const reply = route("app.post('/admin/mailbox/:id/reply', requireAdmin");
  const begin = reply.indexOf("'BEGIN'");
  assert.ok(begin > 0);
  assert.ok(reply.indexOf('FOR UPDATE') > begin);
  assert.ok(reply.indexOf('addMailMessage(client') > reply.indexOf('FOR UPDATE'));
  assert.ok(reply.indexOf("status = 'open'") < reply.indexOf("'COMMIT'"), 'reopened before the commit');
  assert.doesNotMatch(reply, /addMailMessage\(pool/);
});

test('Team chat and the mailbox share one file picker and one download', () => {
  assert.strictEqual((src.match(/function jtFilePicker\(o\)/g) || []).length, 1);
  assert.strictEqual((src.match(/\$\{CHAT_FILE_PICKER_FN\}/g) || []).length, 2);
  assert.match(route("app.get('/admin/mailbox/file/:id', requireAdmin"), /await sendChatFile\(res, src, m\.file_name, 'mailbox'\)/);
  assert.strictEqual((src.match(/Readable\.fromWeb\(r\.body\), res, \(e\) => \{ if \(e\) console\.error\(`\$\{label\} file/g) || []).length, 1);
});
