'use strict';

/* Customer email replies onto the job page, through Brevo inbound parsing. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../tools/lib/inbound-email');
const STAFF = require('../tools/lib/staff');

const RE = /^(?:[A-Z0-9]{6}|[A-Z0-9]{10})$/;
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the reply domain must look like a domain', () => {
  assert.strictEqual(I.domainOf(' Reply.JTees.net. '), 'reply.jtees.net');
  assert.strictEqual(I.domainOf(''), '');
  assert.strictEqual(I.domainOf('reply jtees net'), '');
  assert.strictEqual(I.domainOf('https://reply.jtees.net'), '');
});

test('a reply finds its job from the address it was sent to, and only on our domain', () => {
  const d = 'reply.jtees.net';
  assert.strictEqual(I.replyAddress('AB12CD34EF', d), 'order-ab12cd34ef@reply.jtees.net');
  assert.strictEqual(I.codeFrom({ To: [{ Address: 'Order-AB12CD34EF@Reply.JTees.net' }] }, d, RE), 'AB12CD34EF');
  assert.strictEqual(I.codeFrom({ To: [{ Address: 'x@gmail.com' }], Cc: [{ Address: 'order-ab12cd@reply.jtees.net' }] }, d, RE), 'AB12CD');
  assert.strictEqual(I.codeFrom({ To: [{ Address: 'order-ab12cd@evil.com' }] }, d, RE), '');
  assert.strictEqual(I.codeFrom({ To: [{ Address: 'order-ab12cd@reply.jtees.net.evil.com' }] }, d, RE), '');
  assert.strictEqual(I.codeFrom({ To: [{ Address: 'order-abc@reply.jtees.net' }] }, d, RE), '');
  assert.strictEqual(I.codeFrom({}, d, RE), '');
});

test('a parsed email is cut down to the reply, the sender and safe file tokens', () => {
  const m = I.shapeItem({
    Uuid: ['u1'].join(''), From: { Address: ' Kim@Example.COM ', Name: 'Kim' }, Subject: 'Re: your\r\nproof',
    ExtractedMarkdownMessage: 'Looks great, approved!', RawTextBody: 'Looks great, approved!\n> old thread',
    Attachments: [{ Name: 'sizes.pdf', ContentType: 'application/pdf', ContentLength: 2000, DownloadToken: 'tok_abc12345' },
                  { Name: 'bad', DownloadToken: '../../etc/passwd x' }, { Name: 'none' }],
  });
  assert.strictEqual(m.from, 'kim@example.com');
  assert.strictEqual(m.subject, 'Re: your proof');
  assert.strictEqual(m.text, 'Looks great, approved!');
  assert.deepStrictEqual(m.files.map((f) => f.name), ['sizes.pdf']);
  assert.strictEqual(I.shapeItem({ RawTextBody: 'only raw' }).text, 'only raw');
  assert.strictEqual(I.shapeItem({ From: { Address: 'not an address' } }).from, '');
  assert.strictEqual(I.itemsOf({ items: new Array(80).fill({}) }).length, 50);
  assert.deepStrictEqual(I.itemsOf(null), []);
});

test('the webhook checks its secret in constant time and refuses a short one', () => {
  const i = src.indexOf("app.post('/webhooks/brevo/inbound/:secret'");
  assert.ok(i > 0);
  const route = src.slice(i, src.indexOf('\n});', i));
  assert.match(route, /crypto\.timingSafeEqual/);
  assert.match(route, /INBOUND_SECRET\.length < 24/);
  assert.match(route, /failed \? 500 : 200/);
});

test('emails switch to the reply address only once the domain is live, and never marketing', () => {
  assert.match(src, /if \(inboundReady && quote && !mail\.marketing\) email\.replyTo = INBOUND\.replyAddress/);
  assert.match(src, /let inboundReady = false;/);
  const check = src.slice(src.indexOf('async function checkInbound'), src.indexOf('async function keepInboundEmail'));
  assert.match(check, /resolveMx/);
  assert.match(check, /sendinblue\|brevo/);
  assert.match(check, /inboundReady = !why/);
});

test('a reply is kept once and its files are owner-or-quotes-view only', () => {
  assert.match(src, /ON CONFLICT \(inbound_id\) WHERE inbound_id IS NOT NULL DO NOTHING/);
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS client_emails_inbound_once\s+ON client_emails \(inbound_id\) WHERE inbound_id IS NOT NULL/);
  assert.strictEqual(STAFF.ROUTES['GET /admin/production/:code/reply-file/:id/:n'], 'quotes.view');
  const i = src.indexOf("app.get('/admin/production/:code/reply-file/:id/:n', requireAdmin");
  assert.ok(i > 0);
  assert.match(src.slice(i, i + 1500), /AND quote_code = \$2 AND status = 'received'/);
});
