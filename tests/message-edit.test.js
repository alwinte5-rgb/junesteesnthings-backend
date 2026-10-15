'use strict';

/* Editing messages and tagging orders (owner, 2026-10-14): only the author
 * edits, never someone else's line, a decided approval or an addressed job
 * message; the owner never approves wording she has not seen; a tag is a link
 * only for someone who can open the job.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}
const fn = (name) => src.slice(src.indexOf(`function ${name}(`), src.indexOf('\n}\n', src.indexOf(`function ${name}(`)));

test('the edit routes are open to helpers; the Tasks page is the owner\'s', () => {
  assert.strictEqual(STAFF.ROUTES['POST /admin/team-chat/edit'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/job-notes/:id/edit'], 'any');
  assert.strictEqual(STAFF.ROUTES['POST /admin/approvals/:id/edit'], 'any');
  assert.strictEqual(STAFF.ROUTES['GET /admin/tasks'], 'owner');
  assert.strictEqual(STAFF.ROUTES['POST /admin/approvals/:id'], 'owner', 'deciding stays the owner\'s');
});

test('team chat: only the author edits, in a channel still theirs, and the write is checked', () => {
  const r = route("app.post('/admin/team-chat/edit', requireAdmin");
  assert.match(r, /chatChannelFor\(m\.channel_id, channels, roster\)/, 'a channel no longer theirs is refused');
  assert.match(r, /m\.staff_id !== staff\) return back\(res, '\/admin\/team-chat', 'err', 'You can edit only your own messages\.'\)/);
  assert.match(r, /staff != null \? m\.staff_id === staff && !m\.from_owner : m\.from_owner/, 'a DM line: a helper their own, the owner hers');
  assert.match(r, /WHERE id = \$1 AND staff_id IS NOT DISTINCT FROM \$3 AND body <> \$2/);
  assert.match(r, /WHERE id = \$1 AND from_owner = \$3 AND body <> \$2/);
  assert.match(r, /original_body = COALESCE\(original_body, body\)/, 'the first wording is kept once');
  assert.match(r, /rowCount \? 'Message edited\.' : 'Nothing changed/, 'success only when a row changed');
  assert.match(r, /body\.length > TEAM_CHAT_MAX/);
});

test('team chat: the first wording is for the owner only, and a tag links only for whoever can open the job', () => {
  const x = fn('chatExtrasJson');
  assert.match(x, /!mine && actor\.kind !== 'staff' \? m\.original_body : ''/);
  assert.match(x, /href: \(open && open\.get\(m\.quote_code\)\) \|\| ''/);
  assert.match(fn('openableTags'), /if \(!\(await canOpenJob\(c, actor\)\)\) return '';/);
  /* An owner's tag shares the job; a helper's own tag grants nothing. */
  const tagged = fn('ownerTaggedFor');
  assert.match(tagged, /staff_id = \$1 AND from_owner AND quote_code = \$2/);
  assert.match(tagged, /WHERE staff_id IS NULL AND quote_code = \$1/);
  assert.match(tagged, /channelsFor\(actor, channels, await staffRoster\(\)\)/);
  const send = route("app.post('/admin/team-chat', requireAdmin");
  assert.match(send, /QUOTE_CODE_RE\.test\(tagRaw\) && await canOpenJob\(tagRaw, actor\)/, 'a sender tags only a job they can open');
  assert.match(send, /Sent, but NOT tagged/, 'a refused tag never loses the message');
});

test('job messages: only the author, only until addressed, and the reader is told', () => {
  const r = route("app.post('/admin/job-notes/:id/edit', requireAdmin");
  assert.match(r, /n\.author !== me\) return back\(res, backTo, 'err', 'You can edit only your own messages\.'\)/);
  assert.match(r, /if \(n\.addressed_at\) return/);
  assert.match(r, /WHERE id = \$1 AND author = \$2 AND addressed_at IS NULL AND body <> \$3/);
  assert.match(r, /if \(!rowCount\) return back\(res, backTo, 'err'/);
  assert.match(r, /canOpenJob\(n\.quote_code, actor\)/);
  assert.match(r, /pinEmail\(emailOfReader\(roster, n\.recipient\)/);
  assert.match(fn('jobNoteEditedHtml'), /owner && n\.original_body != null/);
});

test('held messages: the helper who wrote it or the owner, only while pending, and approve sends only what she saw', () => {
  const r = route("app.post('/admin/approvals/:id/edit', requireAdmin");
  assert.match(r, /kind IN \('message', 'lead_email'\) AND \(\$2::int IS NULL OR requested_by = \$2\)/);
  assert.match(r, /WHERE id = \$1 AND status = 'pending'/);
  assert.match(r, /isText \? 300 : MESSAGE_MAX/, 'a text keeps its 300 limit');
  assert.match(r, /FRAUD\.mentionsOutsidePayment/, 'an edit is checked for outside payment like a new message');
  assert.doesNotMatch(r, /channel:|attachments:/, 'an edit cannot change the channel or the files');
  const decide = route("app.post('/admin/approvals/:id', requireAdmin");
  assert.match(decide, /String\(\(req\.body && req\.body\.seen\) \|\| ''\) !== String\(\(a\.payload \|\| \{\}\)\.edited_at \|\| ''\)/);
  assert.ok(decide.indexOf('req.body.seen') < decide.indexOf('sendJobMessage('), 'checked before anything is sent');
  assert.match(src, /<input type="hidden" name="seen" value="\$\{escEmail\(\(a\.payload && a\.payload\.edited_at\) \|\| ''\)\}">/);
});

test('a resubmitted held message is still caught after an edit', () => {
  assert.match(src, /\$2::jsonb->>'text' IN \(payload->>'text', payload->>'original_text'\)/);
  assert.match(src, /\$5 IN \(payload->>'text', payload->>'original_text'\)/);
});

test('limits: one 10,000 character limit for messages; texts stay 300', () => {
  assert.match(src, /const MESSAGE_MAX = 10000;/);
  assert.match(src, /const TEAM_CHAT_MAX = MESSAGE_MAX;/);
  assert.match(src, /text\.length > \(channel === 'text' \? 300 : MESSAGE_MAX\)/);
  assert.strictEqual(require('../tools/lib/job-notes').BODY_MAX, 10000);
  assert.match(src, /\.adm-main textarea\{min-height:120px/);
});
