'use strict';

/* A chat on the site must reach a person.

   Until 2026-09-25 the tawk webhook's only job was copying the visitor's email
   into Brevo, and it returned early for anyone who skipped the pre-chat form.
   Chats arrived, were answered 200, and nobody was told. These pin that every
   chat — named or anonymous — produces an owner alert, and that the alert is
   raised BEFORE the anonymous early-return. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { describeTawkEvent, isE164 } = require('../tools/lib/chat-alert');

test('chat:start with a named visitor alerts with name, email and message', () => {
  const a = describeTawkEvent({
    event: 'chat:start', chatId: 'c1',
    visitor: { name: 'Dana Q', email: 'dana@example.com', city: 'Chicago', country: 'US' },
    message: { text: 'Do you do 24 hoodies by Friday?', sender: { type: 'visitor' } },
  });
  assert.equal(a.kind, 'chat');
  assert.match(a.subject, /Dana Q/);
  assert.match(a.sms, /dana@example\.com/);
  assert.match(a.sms, /24 hoodies/);
  assert.equal(a.where, 'Chicago, US');
});

test('an anonymous visitor still produces an alert', () => {
  const a = describeTawkEvent({ event: 'chat:start', visitor: {}, message: { text: 'hi' } });
  assert.ok(a);
  assert.equal(a.name, 'A visitor');
  assert.equal(a.email, '');
});

test('ticket:create (offline message) alerts; chat:end does not', () => {
  const t = describeTawkEvent({
    event: 'ticket:create',
    requester: { name: 'Lee', email: 'lee@example.com' },
    ticket: { subject: 'Quote', message: 'Need banners' },
  });
  assert.equal(t.kind, 'offline message');
  assert.match(t.sms, /Need banners/);
  assert.equal(describeTawkEvent({ event: 'chat:end' }), null);
  assert.equal(describeTawkEvent(null), null);
});

test('the text stays short enough to be one or two SMS segments', () => {
  const a = describeTawkEvent({ event: 'chat:start', visitor: { name: 'x'.repeat(500) }, message: { text: 'y'.repeat(5000) } });
  assert.ok(a.sms.length <= 300);
});

test('phone numbers must be E.164', () => {
  assert.ok(isE164('+17738491854'));
  assert.ok(!isE164('7738491854'));
  assert.ok(!isE164('(773) 849-1854'));
  assert.ok(!isE164(''));
});

test('the webhook alerts before the anonymous early-return', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const start = src.indexOf("app.post('/webhooks/tawk'");
  const body = src.slice(start, src.indexOf('\n});', start));
  const alertAt = body.indexOf('alertOwnerOfChat(req.body)');
  const bailAt = body.indexOf('if (!contact?.email) return;');
  assert.ok(alertAt > 0, 'webhook must call alertOwnerOfChat');
  assert.ok(bailAt > 0);
  assert.ok(alertAt < bailAt, 'alert must fire before the no-email return');
});
