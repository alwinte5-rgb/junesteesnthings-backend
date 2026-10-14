'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../tools/lib/voice');
const { twilioSignature, verifyTwilioSignature } = require('../tools/lib/twilio-webhook');

const base = 'https://www.jtees.net';
const owner = '+17738491854';
const from = '+13125550199';

test('a call opens on the menu, and silence falls through to the menu handler', () => {
  const t = V.incomingTwiml({ base });
  assert.match(t, /Thanks for calling June&apos;s Tees and Things/);
  assert.match(t, /<Gather numDigits="1"[^>]*action="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/menu"/);
  assert.match(t, /press 1[\s\S]*press 2[\s\S]*press 3[\s\S]*press 4/);
  assert.match(t, /<\/Gather><Redirect method="POST">https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/menu<\/Redirect>/);
});

test('1 and 2 ring the owner with the caller shown, and say why on pickup', () => {
  for (const [digit, r] of [['1', 'new'], ['2', 'existing']]) {
    const t = V.menuTwiml({ digits: digit, from, owner, base });
    assert.match(t, new RegExp(`<Dial [^>]*callerId="\\${from}"`));
    assert.match(t, /action="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/done"/);
    assert.match(t, new RegExp(`<Number url="https://www\\.jtees\\.net/webhooks/twilio/voice/screen\\?r=${r}" method="POST">\\${owner}</Number>`));
  }
  assert.match(V.screenTwiml({ base, reason: 'new' }), /June&apos;s Tees, new order\. Press 1 to answer/);
  assert.match(V.screenTwiml({ base, reason: 'existing' }), /existing order/);
});

test('no key pressed still rings a person', () => {
  assert.match(V.menuTwiml({ digits: '', from, owner, base }), /<Dial /);
  assert.match(V.menuTwiml({ digits: '9', from, owner, base }), /screen\?r=call/);
});

test('3 reads the hours and address, then the menu again', () => {
  const t = V.menuTwiml({ digits: '3', from, owner, base });
  assert.match(t, /3047 North Lincoln Avenue/);
  assert.match(t, /Monday through Friday, 10:30 AM to 6 PM, and closed on weekends/);
  assert.match(t, /we see customers by appointment/);
  assert.match(t, /ring the intercom for June&apos;s Tees and we&apos;ll buzz you right in/);
  assert.match(t, /give us a call before you head over to confirm your time/);
  assert.match(t, /4th floor and have a seat in the lobby/);
  assert.match(t, /<Gather /);
  assert.doesNotMatch(t, /Thanks for calling/);
  assert.equal((t.match(/<Response>/g) || []).length, 1);
  assert.equal((t.match(/<\?xml/g) || []).length, 1);
});

test('4 goes straight to a voicemail', () => {
  const t = V.menuTwiml({ digits: '4', from, owner, base });
  assert.match(t, /<Record [^>]*action="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/voicemail"/);
  assert.doesNotMatch(t, /<Dial/);
});

test('no owner number, or the owner calling in, goes to voicemail rather than a dead line', () => {
  assert.match(V.menuTwiml({ digits: '1', from, owner: '', base }), /<Record /);
  assert.match(V.menuTwiml({ digits: '1', from: owner, owner, base }), /<Record /);
});

test('the owner must press 1: anything else hangs up their leg', () => {
  assert.doesNotMatch(V.acceptTwiml('1'), /Hangup/);
  for (const d of ['', '2', '#', undefined]) assert.match(V.acceptTwiml(d), /<Hangup\/>/);
  assert.match(V.screenTwiml({ base, reason: 'call' }), /<\/Gather><Hangup\/>/);
});

test('after the ring: accepted ends, anything else gets the voicemail', () => {
  assert.match(V.doneTwiml({ accepted: true, base }), /<Hangup\/>/);
  assert.doesNotMatch(V.doneTwiml({ accepted: true, base }), /Record/);
  assert.match(V.doneTwiml({ accepted: false, base }), /<Record /);
});

test('after hours, an order call goes to the closed greeting and voicemail, never the cell', () => {
  const t = V.menuTwiml({ digits: '1', from, owner, base, open: false });
  assert.match(t, /We&apos;re closed right now/);
  assert.match(t, /<Record /);
  assert.doesNotMatch(t, /<Dial/);
  assert.doesNotMatch(V.menuTwiml({ digits: '', from, owner, base, open: false }), /<Dial/);
  assert.match(V.menuTwiml({ digits: '3', from, owner, base, open: false }), /3047 North Lincoln/);
});

test('shop hours are Mon-Fri 10:30-6 Chicago time, across daylight saving', () => {
  const at = (iso) => V.isOpen(new Date(iso));
  assert.equal(at('2026-10-14T15:30:00Z'), true);    // Wed 10:30 CDT
  assert.equal(at('2026-10-14T15:29:00Z'), false);   // Wed 10:29 CDT
  assert.equal(at('2026-10-14T22:59:00Z'), true);    // Wed 5:59 PM CDT
  assert.equal(at('2026-10-14T23:00:00Z'), false);   // Wed 6:00 PM CDT
  assert.equal(at('2026-10-17T17:00:00Z'), false);   // Saturday noon
  assert.equal(at('2026-12-16T16:30:00Z'), true);    // Wed 10:30 CST
  assert.equal(at('2026-12-16T07:00:00Z'), false);   // Wed 1 AM CST
});

test('accepted calls are taken once and expire', () => {
  const a = V.acceptedCalls(1000);
  a.add('CA1', 0);
  assert.equal(a.take('CA1'), true);
  assert.equal(a.take('CA1'), false);
  a.add('CA2', 0);
  a.add('CA3', 5000);
  assert.equal(a.take('CA2'), false);
  assert.equal(a.take('CA3'), true);
  a.add(undefined);
  assert.equal(a.size(), 0);
});

test('a missed call is texted at once, and a voicemail only when one was recorded', () => {
  assert.match(V.missedCallText({ from }), /^Missed call from \(312\) 555-0199\./);
  const rec = 'https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE1';
  assert.equal(V.voicemailText({ from, recordingUrl: rec, seconds: '14' }),
    `Voicemail from (312) 555-0199 (14s): ${rec}.mp3`);
  assert.equal(V.voicemailText({ from, recordingUrl: rec, seconds: '1' }), null);
  assert.equal(V.voicemailText({ from, recordingUrl: 'https://evil.example/x', seconds: '30' }), null);
  assert.match(V.missedCallText({ from: '' }), /unknown number/);
});

test('callers outside the US keep their number', () => {
  const us = (raw) => (/^\+1\d{10}$/.test(raw) ? raw : '');
  assert.equal(V.callerNumber('+13125550199', us), '+13125550199');
  assert.equal(V.callerNumber('+442071234567', us), '+442071234567');
  assert.equal(V.callerNumber('anonymous', us), '');
  assert.equal(V.pretty('+442071234567'), '+442071234567');
  assert.match(V.menuTwiml({ digits: '1', from: '+442071234567', owner, base }), /callerId="\+442071234567"/);
});

test('the server reports missed calls from the ring result, and skips the owner', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const done = src.slice(src.indexOf('app.post(VOICE.PATHS.done'), src.indexOf('app.post(VOICE.PATHS.voicemail'));
  assert.match(done, /if \(accepted\) return;[\s\S]*reportCall\(/);
  const report = src.slice(src.indexOf('async function reportCall'), src.indexOf('app.post(VOICE.PATHS.incoming'));
  assert.match(report, /if \(from && from === callOwner\(\)\) return;/);
  const vm = src.slice(src.indexOf('app.post(VOICE.PATHS.voicemail'), src.indexOf("app.post('/webhooks/twilio/status'"));
  assert.doesNotMatch(vm.split('reportCall(')[1] || '', /recordingUrl\s*[,)]/, 'the lead note never carries the link');
});

test('caller-controlled text is escaped in TwiML', () => {
  const t = V.menuTwiml({ digits: '1', from: '+1312"><Hangup/>', owner, base });
  assert.doesNotMatch(t, /"><Hangup\/>/);
});

test('the screen URL signs and verifies as Twilio requests it', () => {
  const url = `${base}${V.PATHS.screen}?r=new`;
  const params = { CallSid: 'CA9', From: owner };
  const sig = twilioSignature('tok', url, params);
  assert.ok(verifyTwilioSignature('tok', url, params, sig));
  assert.ok(!verifyTwilioSignature('tok', `${base}${V.PATHS.screen}?r=existing`, params, sig));
});

test('every call route checks the Twilio signature first', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const k of Object.keys(V.PATHS)) {
    const m = src.match(new RegExp(`app\\.post\\(VOICE\\.PATHS\\.${k}, (?:async )?\\(req, res\\) => \\{\\n\\s*if \\(!twilioVoiceOk\\(req, res\\)\\) return;`));
    assert.ok(m, `${k} route verifies the signature`);
  }
});
