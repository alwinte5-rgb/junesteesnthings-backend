'use strict';
/* Where a lead sits on the Leads page (owner, 2026-11-23): Answer these, Reach
   out to these, or off the main view once contacted; and the one-time let-go
   of old contacts. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const B = require('../tools/lib/lead-board');
const F = require('../tools/lib/lead-followups');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const found = (l) => !!l.finder_run_id;
const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();

test('a new enquiry is to answer; a new lead the team found is to reach out to', () => {
  assert.strictEqual(B.bucketOf({ lead_status: 'new' }, found), 'answer');
  assert.strictEqual(B.bucketOf({ lead_status: 'new', finder_run_id: 4 }, found), 'reach_out');
  assert.ok(B.isOpen({ lead_status: 'new' }, found));
  assert.ok(B.isOpen({ lead_status: 'new', finder_run_id: 4 }, found));
});

test('contacted leaves the main view, and comes back to answer when they write back', () => {
  const ours = { lead_status: 'contacted', last_word: { kind: 'text', body: 'You texted: hi', created_at: ago(1) } };
  assert.strictEqual(B.bucketOf(ours, found), 'contacted');
  assert.ok(!B.isOpen(ours, found), 'we wrote last: off Open');
  assert.strictEqual(B.bucketOf({ lead_status: 'contacted' }, found), 'contacted', 'no conversation note: still ours');
  for (const kind of ['text_in', 'email_in']) {
    const theirs = { lead_status: 'contacted', last_word: { kind, created_at: ago(1) } };
    assert.strictEqual(B.bucketOf(theirs, found), 'answer', kind);
    assert.ok(B.theyReplied(theirs));
  }
  /* A found lead that replies is owed an answer too. */
  assert.strictEqual(B.bucketOf({ lead_status: 'contacted', finder_run_id: 2, last_word: { kind: 'email_in', created_at: ago(1) } }, found), 'answer');
});

test('quoted and let go are never open, even with a reply on them', () => {
  for (const st of ['quoted', 'dismissed']) {
    const l = { lead_status: st, last_word: { kind: 'text_in', created_at: ago(1) } };
    assert.strictEqual(B.bucketOf(l, found), st);
    assert.ok(!B.isOpen(l, found));
    assert.ok(!B.theyReplied(l));
  }
});

test('to answer is longest waiting first: a reply waits from when it came in', () => {
  const list = [
    { id: 1, lead_status: 'new', created_at: ago(1) },
    { id: 2, lead_status: 'contacted', created_at: ago(30), last_word: { kind: 'text_in', created_at: ago(0.5) } },
    { id: 3, lead_status: 'new', created_at: ago(3) },
    { id: 4, lead_status: 'new', finder_run_id: 1, created_at: ago(9) },
    { id: 5, lead_status: 'contacted', created_at: ago(9), last_word: { kind: 'email', created_at: ago(2) } },
  ];
  assert.deepStrictEqual(B.toAnswer(list, found).map((l) => l.id), [3, 1, 2]);
  assert.strictEqual(B.waitedFrom(list[1]), new Date(list[1].last_word.created_at).getTime());
});

test('a reply reopens a lead let go by the follow-ups or by the old-contacts clean-up, never one let go by hand', () => {
  assert.deepStrictEqual(F.REOPEN_REASONS, [F.LET_GO_REASON, F.OLD_CONTACT_REASON]);
  assert.ok(!F.REOPEN_REASONS.includes('Not a job'));
  const ttl = src.slice(src.indexOf('async function textToLead('), src.indexOf('/* Their name, if they have ever given it to us'));
  assert.match(ttl, /\[open\[0\]\.id, LEADFU\.REOPEN_REASONS\]/);
  const keep = src.slice(src.indexOf('async function keepInboundEmail('), src.indexOf('const recentInbound = new Set();'));
  assert.match(keep, /WHERE id = \$1 AND dismiss_reason = ANY\(\$2\)`, \[lead, LEADFU\.REOPEN_REASONS\]/);
});

const once = src.slice(src.indexOf('async function letGoOldContactsOnce'), src.indexOf('/** The leads nobody has answered'));

test('old contacts are let go once, in one statement, with a note and the reopenable reason', () => {
  assert.match(src, /\]\) await pool\.query\(sql\);\n\s+await letGoOldContactsOnce\(\);/, 'runs at boot, after once_fixes exists');
  assert.match(once, /WITH claim AS \(INSERT INTO once_fixes \(name\) VALUES \('leads-let-go-old-contacts'\) ON CONFLICT DO NOTHING RETURNING 1\)/);
  assert.match(once, /WHERE EXISTS \(SELECT 1 FROM claim\)/, 'only on the run that claims it');
  assert.match(once, /SET dismissed_at = NOW\(\), dismiss_reason = \$1::text, outcome = 'no_reply'/);
  assert.match(once, /\[LEADFU\.OLD_CONTACT_REASON, LEADFU\.CONVERSATION_KINDS, LEADFU\.OLD_CONTACT_DAYS, SHOP_TZ,/);
  assert.match(once, /INSERT INTO lead_notes \(submission_id, kind, body, auto\)\s+SELECT id, 'note', \$5::text, TRUE FROM gone/);
});

test('the clean-up leaves alone: new leads, quotes, outcomes, set follow-up dates, anything recent', () => {
  assert.match(once, /s\.first_response_at IS NOT NULL AND s\.dismissed_at IS NULL AND s\.outcome IS NULL/);
  assert.match(once, /s\.next_follow_up_on IS NULL OR s\.next_follow_up_on < \(NOW\(\) AT TIME ZONE \$4::text\)::date/);
  assert.match(once, /< NOW\(\) - make_interval\(days => \$3::int\)/);
  assert.match(once, /NOT EXISTS \(SELECT 1 FROM quotes q WHERE \(q\.from_submission_id = s\.id OR \(\$\{LEAD_QUOTE_MATCH\}\)\)\s+AND \$\{LEAD_QUOTE_LIVE\}\)/);
  assert.strictEqual(F.OLD_CONTACT_DAYS, 15, 'past the follow-ups\' 14-day window, so nothing they could still send is cut short');
  assert.ok(F.OLD_CONTACT_DAYS * 86400000 > F.OLDEST);
});

test('the card says they replied and that it is our turn', () => {
  const card = src.slice(src.indexOf('function leadCardHtml('), src.indexOf('function leadCardHtml(') + 4000);
  assert.match(card, /const replied = LEADBOARD\.theyReplied\(l\);/);
  assert.match(card, /your turn to answer/);
  assert.match(card, /replied \? pill\('They replied', 'amber'\)/);
  assert.match(card, /isFoundLead\(l\) \? pill\('Found by us', 'neutral'\)/);
});

/* Code review fixes, 2026-11-23. */
test('the clean-up keeps a recent reply nobody answered, and counts internal notes as work on the lead', () => {
  assert.match(once, /SELECT MAX\(n\.created_at\) FROM lead_notes n WHERE n\.submission_id = s\.id\)/, 'every note, internal ones too');
  assert.match(once, /WHERE w\.kind IN \('text_in', 'email_in'\) AND w\.created_at > NOW\(\) - make_interval\(days => \$6::int\)/);
  assert.match(once, /LEADFU\.REPLY_KEPT_DAYS\]\);/);
  assert.strictEqual(F.REPLY_KEPT_DAYS, 60);
});

test('an old contact is reopened by an email from them however old the lead is', () => {
  const keep = src.slice(src.indexOf('async function keepInboundEmail('), src.indexOf('const recentInbound = new Set();'));
  assert.match(keep, /AND \(created_at > NOW\(\) - INTERVAL '60 days' OR dismiss_reason = \$3\)/);
  assert.match(keep, /\[m\.from, LEADFU\.REOPEN_REASONS, LEADFU\.OLD_CONTACT_REASON\]/);
});

test('a reply is its own bell notice, keyed by when it came', () => {
  const t = '2026-11-20T10:00:00Z';
  assert.strictEqual(B.noticeRef({ id: 9, lead_status: 'new' }), '9');
  assert.strictEqual(B.noticeRef({ id: 9, lead_status: 'contacted', last_word: { kind: 'text_in', created_at: t } }), `9:reply:${Date.parse(t)}`);
  const owner = src.slice(src.indexOf('async function ownerNotices('), src.indexOf('async function ownerNotices(') + 3000);
  assert.match(owner, /ref: LEADBOARD\.noticeRef\(l\)/);
  assert.match(owner, /notifyClearResolved\('owner', 'lead', leads\.map\(LEADBOARD\.noticeRef\)\)/);
});

test('a replied card can record an answer given outside the system, and keeps the follow-up line', () => {
  const card = src.slice(src.indexOf('function leadCardHtml('), src.indexOf('function leadCardHtml(') + 5000);
  assert.match(card, /I answered them outside the system/);
  assert.match(card, /action="\/admin\/lead\/\$\{Number\(l\.id\)\}\/note"/);
  assert.match(card, /const contactedLine = replied \? repliedLine \+ fuLine\(\)/);
});

test('Contacted, waiting on them leaves out leads that wrote back; notes follow the drawn order', () => {
  const page = src.slice(src.indexOf("app.get('/admin/leads'"), src.indexOf("app.get('/admin/leads'") + 6000);
  assert.match(page, /st === 'contacted' \? bucket\(l\) === 'contacted'/);
  assert.match(page, /\[rendered\.slice\(0, 300\)\.map\(\(l\) => l\.id\)\]/);
});
