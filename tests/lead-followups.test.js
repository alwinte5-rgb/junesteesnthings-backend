'use strict';

/* Automatic lead follow-ups (owner, 2026-11-12: "they need to be sent out").
 * Run: node --test tests/*.test.js */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../tools/lib/lead-followups');
const INBOUND = require('../tools/lib/inbound-email');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const DAY = 86400000;
const NOW = Date.parse('2026-11-20T15:00:00Z');
const ago = (d) => new Date(NOW - d * DAY);
const phone = (p) => (String(p || '').replace(/\D/g, '').length >= 10 ? '+1' + String(p).replace(/\D/g, '').slice(-10) : null);
const lead = (o = {}) => ({ id: 1, name: 'Maria', email: 'm@x.com', phone: '', lead_status: 'contacted',
  outcome: null, dismissed_at: null, first_response_at: ago(3), lead_fu1_at: null, lead_fu2_at: null, ...o });
const ours = (d) => ({ kind: 'email', body: 'Emailed "Hi":\nhello', created_at: ago(d) });

test('follow-up 1 goes 2 days after our last word, not before, and not on old conversations', () => {
  assert.strictEqual(F.decide(lead({ first_response_at: ago(1) }), null, NOW, phone), null);
  assert.strictEqual(F.decide(lead({ first_response_at: ago(2) }), null, NOW, phone).step, 'first');
  assert.strictEqual(F.decide(lead({ first_response_at: ago(15) }), null, NOW, phone), null, 'older than 14 days: left alone');
  assert.strictEqual(F.decide(lead({ first_response_at: ago(10) }), ours(1), NOW, phone), null, 'our later note restarts the clock');
});

test('follow-up 2 three days after the first, then let go three days after that', () => {
  assert.strictEqual(F.decide(lead({ first_response_at: ago(6), lead_fu1_at: ago(2) }), ours(6), NOW, phone), null);
  assert.strictEqual(F.decide(lead({ first_response_at: ago(6), lead_fu1_at: ago(3) }), ours(6), NOW, phone).step, 'second');
  assert.strictEqual(F.decide(lead({ first_response_at: ago(9), lead_fu1_at: ago(6), lead_fu2_at: ago(2) }), ours(9), NOW, phone), null);
  assert.strictEqual(F.decide(lead({ first_response_at: ago(9), lead_fu1_at: ago(6), lead_fu2_at: ago(3) }), ours(9), NOW, phone).step, 'let_go');
});

test('their reply stops it: the next word is ours', () => {
  const textBack = { kind: 'text', body: 'Yes still interested', created_at: ago(3) };
  const emailBack = { kind: 'email_in', body: 'They emailed: Re: shirts\nyes', created_at: ago(3) };
  assert.strictEqual(F.decide(lead({ first_response_at: ago(5) }), textBack, NOW, phone), null);
  assert.strictEqual(F.decide(lead({ first_response_at: ago(5), lead_fu1_at: ago(4) }), emailBack, NOW, phone), null);
  assert.ok(!F.isInbound({ kind: 'text', body: 'You texted: hi' }));
  assert.ok(!F.isInbound({ kind: 'text', body: 'You replied: Sure, how many?' }), "the owner's relayed reply is the shop's word");
  assert.ok(!F.isInbound({ kind: 'email', body: 'Emailed "x":\ny' }));
  assert.ok(F.isInbound({ kind: 'email_in', body: 'They emailed: Re\nyes' }));
  assert.strictEqual(F.decide(lead({ first_response_at: ago(5) }), { kind: 'text', body: 'You replied: ok', created_at: ago(3) }, NOW, phone).step, 'first');
});

test('we answered again after a follow-up: a new round, from our answer', () => {
  const l = lead({ first_response_at: ago(10), lead_fu1_at: ago(7) });
  assert.strictEqual(F.decide(l, ours(1), NOW, phone), null);
  assert.strictEqual(F.decide(l, ours(2), NOW, phone).step, 'first');
});

test('never for new, quoted, decided or unreachable leads', () => {
  for (const o of [{ lead_status: 'new' }, { lead_status: 'quoted' }, { outcome: 'won' }, { dismissed_at: ago(1) },
    { email: '', phone: '' }, { email: 'not-an-email', phone: '12' }]) {
    assert.strictEqual(F.decide(lead(o), null, NOW, phone), null, JSON.stringify(o));
  }
  assert.strictEqual(F.decide(lead({ email: '', phone: '(312) 555-0100' }), null, NOW, phone).step, 'first', 'phone only is enough');
});

test('the messages: first name, no prices, texts fit, the second says it closes', () => {
  const one = F.messages('first', { name: 'maria lopez', description: 'Shirts' });
  const two = F.messages('second', { name: '' });
  assert.match(one.text, /^Hi Maria, just following up/);
  assert.match(one.email.body, /^Hi Maria,/);
  assert.match(two.text, /^Hi, we haven't heard back, so we'll close your request/);
  assert.match(two.email.subject, /^Closing your request/);
  for (const t of [one.text, two.text, one.email.body, two.email.body]) assert.ok(!/\$\d/.test(t));
  const sms = F.smsBody(one.text);
  assert.match(sms, /^June's Tees: Hi Maria, .* jtees\.net Reply STOP to opt out\.$/);
  assert.ok(sms.length <= 300);
});

test('the card line says what went and what is next, and not what will not happen', () => {
  const fmt = (t) => new Date(t).toISOString().slice(5, 10);
  assert.strictEqual(F.cardLine(lead(), null, fmt), '');
  assert.match(F.cardLine(lead({ lead_fu1_at: ago(1) }), null, fmt), /^Follow-up 1 sent 11-19 · follow-up 2 11-22 if no reply$/);
  assert.match(F.cardLine(lead({ first_response_at: ago(7), lead_fu1_at: ago(4), lead_fu2_at: ago(1) }), null, fmt), /^Follow-up 2 sent 11-19 · let go 11-22 if no reply$/);
  assert.match(F.cardLine(lead({ first_response_at: ago(6), lead_fu1_at: ago(3) }), { kind: 'text', body: 'yes', created_at: ago(2) }, fmt), /They replied .* paused/);
  assert.strictEqual(F.cardLine(lead({ first_response_at: ago(8), lead_fu1_at: ago(5) }), ours(1), fmt), '', 'we answered again: the old round is not shown');
});

test('internal notes are not the conversation', () => {
  assert.ok(!F.CONVERSATION_KINDS.includes('note'));
  assert.ok(F.CONVERSATION_KINDS.includes('email_in'));
});

test('lead reply addresses round-trip and refuse anything else', () => {
  const d = 'reply.jtees.net';
  assert.strictEqual(INBOUND.leadReplyAddress(42, d), 'lead-42@reply.jtees.net');
  assert.strictEqual(INBOUND.leadFrom({ To: [{ Address: 'Lead-42@Reply.jtees.net' }] }, d), 42);
  for (const a of ['lead-0@reply.jtees.net', 'lead-42@evil.com', 'lead-x@reply.jtees.net', 'lead-99999999999@reply.jtees.net', 'order-ABC123@reply.jtees.net']) {
    assert.strictEqual(INBOUND.leadFrom({ To: [{ Address: a }] }, d), null, a);
  }
});

test('the job: narrow query, claims before sending, conversation only, auto notes, retries a failed send', () => {
  const job = src.slice(src.indexOf('async function sendLeadFollowUps('), src.indexOf('/** The leads nobody has answered'));
  assert.match(job, /\$\{leadLastWordSql\(1\)\} AS last_word/);
  assert.match(job, /> NOW\(\) - INTERVAL '15 days'/, 'only leads with something in the last 15 days');
  assert.match(job, /NOT EXISTS \(SELECT 1 FROM quotes q/);
  assert.match(job, /AND n\.kind = ANY\(\$3\) AND n\.created_at > \$2::timestamptz \+ INTERVAL '1 millisecond'/);
  assert.ok(job.indexOf('UPDATE submissions SET lead_fu1_at = NOW()') < job.indexOf('sendEmail('), 'claimed before the email');
  assert.ok(job.indexOf('UPDATE submissions SET lead_fu1_at = NOW()') < job.indexOf('sendCustomerSms('), 'claimed before the text');
  assert.match(job, /isUnsubscribed\(email\)/);
  assert.match(job, /`You texted: \$\{msg\.text\}`/);
  for (const m of job.match(/INSERT INTO lead_notes[^`]*/g)) assert.match(m, /TRUE/, m);
  assert.match(job, /outcome = 'no_reply'/);
  assert.match(job, /if \(failed && c < 2\) \{[\s\S]*?UPDATE submissions SET lead_fu1_at = \$2, lead_fu2_at = \$3 WHERE id = \$1/, 'a failed send hands the step back');
  assert.match(src, /if \(inTextingHours\(\)\) \{[\s\S]*?await step\('lead follow-ups', sendLeadFollowUps\);[\s\S]*?\n    \}/);
  assert.match(src, /ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(src, /const body = LEADMAIL\.textBody\(words\);/, 'hand texts and follow-ups share one wrapper');
  assert.strictEqual(F.smsBody, require('../tools/lib/lead-email').textBody);
});

test('an email reply lands on the lead: address first, sender must match, once per message, let-go reopened', () => {
  const keep = src.slice(src.indexOf('async function keepInboundEmail('), src.indexOf('const recentInbound = new Set();'));
  assert.ok(keep.indexOf('INBOUND.leadFrom(m.raw, INBOUND_DOMAIN)') < keep.indexOf("SELECT code FROM quotes WHERE lower(email) = $1"), 'the lead address beats an old job by sender');
  assert.match(keep, /WHERE id = \$1 AND lower\(trim\(email\)\) = \$2/, 'only from the lead\'s own address');
  assert.match(keep, /VALUES \(\$1, 'email_in', \$2, \$3\)\s+ON CONFLICT \(inbound_id\) WHERE inbound_id IS NOT NULL DO NOTHING/);
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS lead_notes_inbound_once ON lead_notes \(inbound_id\) WHERE inbound_id IS NOT NULL/);
  assert.match(keep, /dismiss_reason === LEADFU\.LET_GO_REASON/);
  assert.match(src, /replyTo: inboundReady \? INBOUND\.leadReplyAddress\(id, INBOUND_DOMAIN\) : undefined/);
});

test('Ask Claude reads their replies as theirs', () => {
  assert.match(src, /inbound: LEADFU\.isInbound\(n\)/);
  assert.match(src, /const lastOut = notes\.find\(\(n\) => CONTACT_KINDS\.includes\(n\.kind\) && !LEADFU\.isInbound\(n\)\);/);
});
