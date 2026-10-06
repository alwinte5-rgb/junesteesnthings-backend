/* The whole tawk.to conversation on the lead (the owner, 2026-10-06: the
   Leads page said nothing about what a chat was about). Payload shape from
   https://developer.tawk.to/webhooks/ (chat:transcript_created). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { tawkTranscript } = require('../tools/lib/chat-alert');

const event = (messages, visitor = { name: 'V1561719148780935', email: '' }) => ({
  event: 'chat:transcript_created', time: '2026-10-06T18:00:00Z',
  chat: { id: 'c-123', visitor, messages }, property: { id: 'p', name: "June's Tees" },
});
const msg = (t, text, n) => ({ sender: { t, n }, type: 'msg', msg: text, time: '2026-10-06T18:00:00Z' });

test('only the transcript event, and only with a chat id', () => {
  assert.strictEqual(tawkTranscript({ event: 'chat:start', chatId: 'x' }), null);
  assert.strictEqual(tawkTranscript({ event: 'chat:transcript_created', chat: {} }), null);
});

test('every message is kept with who said it, keyed like the chat-start lead', () => {
  const t = tawkTranscript(event([
    msg('s', 'Chat started'), msg('v', 'Hi, how much for 5 big heads?'), msg('a', 'They are $25 each', 'June'),
  ]));
  assert.strictEqual(t.ref, 'tawk:chat:c-123');
  assert.deepStrictEqual(t.lines.map((l) => [l.who, l.text]), [
    ['system', 'Chat started'], ['visitor', 'Hi, how much for 5 big heads?'], ['shop', 'They are $25 each']]);
  assert.strictEqual(t.lines[2].name, 'June');
  assert.strictEqual(t.description, 'Hi, how much for 5 big heads?', 'the first thing the visitor said');
  assert.strictEqual(t.name, 'Chat visitor', "tawk's V-number placeholder is not a name");
});

test('an email or phone the VISITOR typed fills the lead; the shop\'s own lines never do', () => {
  const t = tawkTranscript(event([
    msg('a', 'Call us on 773-849-1854 or email info@jtees.net', 'June'),
    msg('v', 'sure, I am at ann.lee@example.com, cell 312.555.0199'),
  ]));
  assert.strictEqual(t.email, 'ann.lee@example.com');
  assert.strictEqual(t.phone, '(312) 555-0199');
  const shopOnly = tawkTranscript(event([msg('a', 'Call 773-849-1854, info@jtees.net', 'June'), msg('v', 'ok thanks')]));
  assert.strictEqual(shopOnly.email, '');
  assert.strictEqual(shopOnly.phone, '');
});

test('a pre-chat name and email win over anything typed', () => {
  const t = tawkTranscript(event([msg('v', 'mail me at other@example.com')], { name: 'Ann Lee', email: 'Ann@Example.com' }));
  assert.strictEqual(t.name, 'Ann Lee');
  assert.strictEqual(t.email, 'ann@example.com');
});

test('long chats are capped, and a file-only message still shows', () => {
  const many = Array.from({ length: 260 }, (_, i) => msg('v', 'line ' + i));
  assert.strictEqual(tawkTranscript(event(many)).lines.length, 200);
  const f = tawkTranscript(event([{ sender: { t: 'v' }, type: 'msg', msg: '', attchs: [{}, {}] }]));
  assert.strictEqual(f.lines[0].text, '(sent 2 files)');
});

test('server: the transcript is kept on the lead, fills only what is empty, and shows on the card', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /'chat_ref TEXT', 'chat_transcript JSONB'/);
  assert.match(src, /email = CASE WHEN email = '' THEN \$4 ELSE email END/);
  assert.match(src, /name  = CASE WHEN name = 'Chat visitor' OR name = '' THEN \$3 ELSE name END/);
  assert.match(src, /const transcript = tawkTranscript\(req\.body\);/);
  /* Rendered escaped: a visitor's words reach the owner's page. */
  assert.match(src, /:<\/b> \$\{escEmail\(m\.text\)\}<\/div>/);
});

test('a chat with no email and no phone is let go, and comes back when it gives one', () => {
  /* The owner, 2026-10-06: "dismiss message that says I have a question but
     leave no information. Contact information is key." */
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const save = src.slice(src.indexOf('async function saveChatLead'));
  assert.match(save.slice(0, save.indexOf('\n}\n')), /const anonymous = !lead\.email && !phone;/);
  assert.match(save.slice(0, save.indexOf('\n}\n')), /CASE WHEN \$8 THEN NOW\(\) END, CASE WHEN \$8 THEN \$9 END/);
  assert.match(src, /dismissed_at   = CASE WHEN dismiss_reason = \$7 AND \(\$4 <> '' OR \$5 <> ''\) THEN NULL ELSE dismissed_at END/);
  /* The boot clean-up touches chats only, never a website-form lead. */
  assert.match(src, /WHERE source IN \('chat', 'offline'\) AND COALESCE\(email, ''\) = '' AND COALESCE\(phone, ''\) = ''\s+AND dismissed_at IS NULL/);
});
