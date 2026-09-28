'use strict';

/* Twilio delivery reports.
 *
 * A text used to read 'sent' the moment Twilio accepted it. Twilio accepting
 * a text is not the phone receiving it: a landline, a disconnected number,
 * carrier spam filtering or an unregistered sending number fails it
 * afterwards, and only a delivery report says so. None was asked for, so a
 * customer who never got "payment received" looked exactly like one who did.
 *
 * Now every text asks for a report (StatusCallback), /webhooks/twilio/status
 * takes it behind Twilio's signature, the texts table records the outcome,
 * and one that did not arrive reaches the hourly error digest, grouped by
 * what went wrong so a sender-wide failure is one line with a count.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const { isE164 } = require('../tools/lib/chat-alert');
const { twilioSignature, verifyTwilioSignature } = require('../tools/lib/twilio-webhook');

function lift(name) {
  let start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} not found in server.js`);
  if (src.slice(start - 6, start) === 'async ') start -= 6;
  let i = src.indexOf('(', start);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function statement(startText, endText = ';\n') {
  const at = src.indexOf(startText);
  assert.notStrictEqual(at, -1, `${startText} not found in server.js`);
  return src.slice(at, src.indexOf(endText, at) + endText.length);
}
const STATUS_URL = statement('const TWILIO_STATUS_URL = ');
const FAILURES = statement('const SMS_FAILURES = {', '};\n');

/* ── Asking for the report ──────────────────────────────────────────────── */

test('every text asks Twilio to report what happened to it', async () => {
  let sent = null;
  const sandbox = {
    Buffer, URLSearchParams, AbortSignal, isE164,
    process: { env: { TWILIO_PHONE_NUMBER: '+18005550100', TWILIO_ACCOUNT_SID: 'AC' + 'a'.repeat(32),
                      TWILIO_AUTH_TOKEN: 'tok' } },
    fetch: async (url, opts) => { sent = { url, body: new URLSearchParams(opts.body) };
                                  return { ok: true, json: async () => ({ sid: 'SM' + 'b'.repeat(32) }) }; },
  };
  vm.createContext(sandbox);
  vm.runInContext(STATUS_URL + '\n' + lift('twilioSend'), sandbox);
  const out = await sandbox.twilioSend('+13125550123', 'Payment received, thanks!');
  assert.strictEqual(out.sid, 'SM' + 'b'.repeat(32));
  assert.strictEqual(sent.body.get('StatusCallback'), 'https://www.jtees.net/webhooks/twilio/status');
  assert.strictEqual(sent.body.get('To'), '+13125550123');
  assert.strictEqual(sent.body.get('Body'), 'Payment received, thanks!');
});

test('the report comes back to the address it was asked for, the one its signature covers', () => {
  /* The signature is over the exact callback URL, so the route has to verify
     against the same constant the send used, not a URL rebuilt from headers a
     proxy may rewrite. */
  const at = src.indexOf("app.post('/webhooks/twilio/status'");
  assert.ok(at > 0, 'the status route exists');
  const route = src.slice(at, src.indexOf('\n});', at));
  assert.match(route, /verifyTwilioSignature\(token, TWILIO_STATUS_URL, req\.body \|\| \{\}, req\.get\('x-twilio-signature'\)\)/);
  assert.ok(route.indexOf('sendStatus(401)') < route.indexOf('recordSmsDelivery('),
    'an unsigned report is refused before anything is written');
  assert.match(route, /if \(!token\) return res\.sendStatus\(503\)/, 'no token: refused, never trusted');
});

test("Twilio's own signing scheme accepts a real report and refuses a forged one", () => {
  const url = 'https://www.jtees.net/webhooks/twilio/status';
  const params = { MessageSid: 'SM' + 'c'.repeat(32), MessageStatus: 'undelivered', ErrorCode: '30007',
                   To: '+13125550123', AccountSid: 'AC' + 'a'.repeat(32) };
  const good = twilioSignature('tok', url, params);
  assert.strictEqual(verifyTwilioSignature('tok', url, params, good), true);
  assert.strictEqual(verifyTwilioSignature('tok', url, { ...params, MessageStatus: 'delivered' }, good), false);
  assert.strictEqual(verifyTwilioSignature('tok', 'https://www.jtees.net/webhooks/twilio/sms', params, good), false,
    "a signature for the inbound URL is not one for this one");
  assert.strictEqual(verifyTwilioSignature('tok', url, params, undefined), false);
});

/* ── Recording it ───────────────────────────────────────────────────────── */

/* The texts table in memory, and the error funnel. */
function smsDesk(texts = {}) {
  const errors = [];
  const sql = [];
  const pool = {
    query(text, args = []) {
      const s = text.replace(/\s+/g, ' ').trim();
      sql.push(s);
      if (/^UPDATE sms_messages SET status = \$2, error = COALESCE\(\$3, error\) WHERE twilio_sid = \$1 AND status IN \('sending', 'sent'\) RETURNING template, ref$/.test(s)) {
        const t = texts[args[0]];
        if (!t || !['sending', 'sent'].includes(t.status)) return Promise.resolve({ rows: [] });
        t.status = args[1];
        if (args[2] != null) t.error = args[2];
        return Promise.resolve({ rows: [{ template: t.template, ref: t.ref }] });
      }
      if (/^SELECT 1 FROM sms_messages WHERE twilio_sid = \$1$/.test(s)) {
        return Promise.resolve({ rows: texts[args[0]] ? [{ '?column?': 1 }] : [] });
      }
      return Promise.reject(new Error('unexpected query: ' + s.slice(0, 100)));
    },
  };
  const sandbox = {
    pool,
    console: { log() {}, warn() {}, error() {} },
    reportError: async (kind, err, context) => { errors.push({ kind, message: err.message, context }); },
  };
  vm.createContext(sandbox);
  vm.runInContext(FAILURES + '\n' + lift('recordSmsDelivery'), sandbox);
  return { record: (p) => sandbox.recordSmsDelivery(p), texts, errors, sql };
}

const SID = 'SM' + 'd'.repeat(32);
const sentText = (template = 'payment-received', ref = 'payment:cs_test_1') =>
  ({ status: 'sent', template, ref, error: null });

test('a delivered text is recorded as delivered, and nobody is bothered', async () => {
  const desk = smsDesk({ [SID]: sentText() });
  const out = await desk.record({ MessageSid: SID, MessageStatus: 'delivered', To: '+13125550123' });
  assert.strictEqual(out.status, 'delivered');
  assert.strictEqual(desk.texts[SID].status, 'delivered');
  assert.strictEqual(desk.texts[SID].error, null);
  assert.strictEqual(desk.errors.length, 0);
});

test('an undelivered text is recorded with the reason, and reaches the error digest', async () => {
  const desk = smsDesk({ [SID]: sentText() });
  await desk.record({ MessageSid: SID, MessageStatus: 'undelivered', ErrorCode: '30007', To: '+13125550123' });
  assert.strictEqual(desk.texts[SID].status, 'undelivered');
  assert.strictEqual(desk.texts[SID].error, 'Twilio 30007: the carrier filtered it as spam');
  assert.strictEqual(desk.errors.length, 1);
  const [e] = desk.errors;
  assert.strictEqual(e.kind, 'sms-undelivered');
  assert.strictEqual(e.message,
    'payment-received text to …0123 was not delivered. Twilio 30007: the carrier filtered it as spam');
  assert.strictEqual(e.context, `ref payment:cs_test_1, message ${SID}`);
  assert.doesNotMatch(e.message, /3125550123/, 'the digest carries the last four digits, not the number');
});

test('a failed text is recorded as failed, which frees it to be sent again', async () => {
  /* sms_messages_once ignores 'failed' rows, the same as a send that failed at
     Twilio's door; an 'undelivered' one keeps blocking a repeat of that text. */
  const desk = smsDesk({ [SID]: sentText() });
  await desk.record({ MessageSid: SID, MessageStatus: 'failed', ErrorCode: '30032', To: '+13125550123' });
  assert.strictEqual(desk.texts[SID].status, 'failed');
  assert.match(desk.errors[0].message, /Twilio 30032: the toll-free number is not verified yet/);
  assert.match(src, /ON sms_messages \(phone, ref, template\) WHERE status <> 'failed'/);
});

test('a report with no error code, or an unlisted one, still reads as a sentence', async () => {
  const a = smsDesk({ [SID]: sentText() });
  await a.record({ MessageSid: SID, MessageStatus: 'undelivered', To: '+13125550123' });
  assert.match(a.errors[0].message, /was not delivered\. Twilio gave no error code$/);
  const b = smsDesk({ [SID]: sentText() });
  await b.record({ MessageSid: SID, MessageStatus: 'undelivered', ErrorCode: '30999', To: '+13125550123' });
  assert.match(b.errors[0].message, /Twilio 30999: look the code up in Twilio$/);
});

test('reports only move a text forward: a late "sent" does not undo "delivered"', async () => {
  const desk = smsDesk({ [SID]: sentText() });
  await desk.record({ MessageSid: SID, MessageStatus: 'delivered', To: '+13125550123' });
  for (const status of ['queued', 'sending', 'sent', 'accepted']) {
    const out = await desk.record({ MessageSid: SID, MessageStatus: status, To: '+13125550123' });
    assert.strictEqual(out.skipped, 'not final');
  }
  assert.strictEqual(desk.texts[SID].status, 'delivered');
  /* And the write itself only replaces the two in-flight states. */
  assert.match(lift('recordSmsDelivery'), /WHERE twilio_sid = \$1 AND status IN \('sending', 'sent'\)/);
});

test('a repeated failure report for a text already recorded is not a second error', async () => {
  const desk = smsDesk({ [SID]: sentText() });
  const report = { MessageSid: SID, MessageStatus: 'undelivered', ErrorCode: '30003', To: '+13125550123' };
  await desk.record(report);
  await desk.record(report);
  assert.strictEqual(desk.errors.length, 1);
});

test("a text to the shop's own phone is reported as that", async () => {
  /* sendOwnerSms keeps no row, so no row means the owner's alert. */
  const desk = smsDesk({});
  await desk.record({ MessageSid: SID, MessageStatus: 'undelivered', ErrorCode: '30006', To: '+17738491854' });
  assert.strictEqual(desk.errors[0].message,
    "Alert text to the shop's phone …1854 was not delivered. Twilio 30006: it is a landline, or a carrier that cannot take texts");
});

test('a shipping text is one kind of text whatever its tracking number', async () => {
  const desk = smsDesk({ [SID]: sentText('shipped:1Z999AA10123456784', 'quote:AB12CD') });
  await desk.record({ MessageSid: SID, MessageStatus: 'undelivered', ErrorCode: '30005', To: '+13125550123' });
  assert.match(desk.errors[0].message, /^shipped text to …0123 was not delivered/);
});

test('a report with no usable message id writes nothing', async () => {
  const desk = smsDesk({ [SID]: sentText() });
  for (const MessageSid of ['', 'SM-bad', "SM'; DROP TABLE sms_messages;--"]) {
    const out = await desk.record({ MessageSid, MessageStatus: 'undelivered' });
    assert.strictEqual(out.skipped, 'no message id');
  }
  assert.strictEqual(desk.sql.length, 0);
});

test('failures of one kind group into one digest line, whoever they were sent to', () => {
  /* recordError strips digits from the fingerprint, which is what makes a
     sender-wide failure one line with a count rather than a line per customer. */
  const body = lift('recordError');
  assert.match(body, /msg\.replace\(\/\\d\+\/g, '#'\)/);
  const fp = (m) => crypto.createHash('sha256').update('sms-undelivered|' + m.replace(/\d+/g, '#')).digest('hex');
  const one = 'payment-received text to …0123 was not delivered. Twilio 30034: the sending number is not registered for business texting';
  const two = 'payment-received text to …9876 was not delivered. Twilio 30034: the sending number is not registered for business texting';
  assert.strictEqual(fp(one), fp(two));
});
