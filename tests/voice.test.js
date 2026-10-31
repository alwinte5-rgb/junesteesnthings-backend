'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const V = require('../tools/lib/voice');
const { twilioSignature, verifyTwilioSignature } = require('../tools/lib/twilio-webhook');

const base = 'https://www.jtees.net';
const owner = '+17738491854';
const shop = '+17739004592';
const from = '+13125550199';

test('every caller rings the owner straight away, at any hour, with no menu or press-1', () => {
  for (const c of [{ from }, { from: '' }, { from: '+442071234567' }]) {
    const t = V.incomingTwiml({ base, owner, shop, ...c });
    assert.match(t, /Thanks for calling June&apos;s Tees\. One moment/);
    assert.match(t, /<Dial [^>]*callerId="\+17739004592"/);
    assert.match(t, /<Dial [^>]*timeout="18"/);
    assert.match(t, /action="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/done"/);
    assert.match(t, /<Number>\+17738491854<\/Number>/);
    assert.doesNotMatch(t, /<Gather|press 1|Press 1/);
    assert.equal(V.ringsOwner({ owner, ...c }), true);
  }
});

test('a blocked caller gets a busy line, and no ring, voicemail or text', () => {
  const t = V.incomingTwiml({ base, from, owner, shop, blocked: true });
  assert.match(t, /^<\?xml[^>]*><Response><Reject reason="busy"\/><\/Response>$/);
  assert.equal(V.ringsOwner({ from, owner, blocked: true }), false);
});

test('the incoming route checks the block list, fails open, and remembers who rang', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const route = src.slice(src.indexOf('app.post(VOICE.PATHS.incoming'), src.indexOf('app.post(VOICE.PATHS.menu'));
  assert.match(route, /call\.blocked = VOICE\.ringsOwner\(call\) \? await blockedCaller\(call\.from\) : false;/);
  assert.match(route, /if \(VOICE\.ringsOwner\(call\)\) \{\s*if \(call\.from\) noteRing\(call\.from\);\s*await textRinging\(call\.from, 'call', req\.body\.CallerName\);/);
  const fn = src.slice(src.indexOf('async function blockedCaller'), src.indexOf('app.post(VOICE.PATHS.incoming'));
  assert.match(fn, /FROM blocked_callers WHERE phone = \$1/);
  assert.match(fn, /query_timeout: 3000/);
  assert.match(fn, /Promise\.race\(\[lookup, slow\]\)/);
  assert.match(fn, /Date\.now\(\) - blockedCallerReported > 6e5/);
  assert.match(fn, /catch \(e\) \{[\s\S]*?reportError\('twilio:blocked-caller'[\s\S]*?return false;/);
  assert.match(src, /CREATE TABLE IF NOT EXISTS blocked_callers \(\s*phone\s+TEXT PRIMARY KEY/);
  assert.doesNotMatch(src, /VOICE\.PATHS\.screen|knownCaller/);
});

test('the menu answers only with no owner number, or for the owner calling in', () => {
  for (const c of [{ from, owner: '' }, { from: owner, owner }]) {
    const t = V.incomingTwiml({ base, shop, ...c });
    assert.match(t, /<Gather numDigits="1"/);
    assert.doesNotMatch(t, /<Dial/);
    assert.equal(V.ringsOwner(c), false);
  }
});

test('the incoming route passes the call details and texts the owner only when it rings direct', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const route = src.slice(src.indexOf('app.post(VOICE.PATHS.incoming'), src.indexOf('app.post(VOICE.PATHS.menu'));
  assert.match(route, /twilioVoiceOk\(req, res\)/);
  assert.match(route, /const call = callDetails\(req\);/);
  const details = src.slice(src.indexOf('const callDetails'), src.indexOf('const textRinging'));
  assert.match(details, /open: VOICE\.isOpen\(\)/);
  assert.match(src.slice(src.indexOf('const textRinging'), src.indexOf('app.post(VOICE.PATHS.incoming')), /sendOwnerSms\(VOICE\.ringText\(\{ from, reason, name \}\)\)/);
  assert.match(route, /VOICE\.incomingTwiml\(\{ \.\.\.call, base: TWILIO_VOICE_BASE \}\)/);
});

test('the menu, when it plays, lets silence falls through to the menu handler', () => {
  const t = V.incomingTwiml({ base });
  assert.match(t, /Thanks for calling June&apos;s Tees and Things/);
  assert.match(t, /<Gather numDigits="1"[^>]*action="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/menu"/);
  assert.match(t, /press 1[\s\S]*press 2[\s\S]*press 3[\s\S]*press 4/);
  assert.match(t, /<\/Gather><Redirect method="POST">https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/menu<\/Redirect>/);
});

test('1 and 2 ring the owner from the shop number, with no step that can be screened', () => {
  for (const digit of ['1', '2']) {
    const t = V.menuTwiml({ digits: digit, from, owner, shop, base });
    assert.match(t, /<Dial [^>]*callerId="\+17739004592"/);
    assert.match(t, /<Dial [^>]*timeout="18"/);
    assert.match(t, /action="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/done"/);
    assert.match(t, /<Number>\+17738491854<\/Number>/);
    assert.doesNotMatch(t, /url=|<Gather/);
  }
});

test('the owner is texted who is calling, only when the cell will ring', () => {
  assert.equal(V.ringReason({ digits: '1', from, owner }), 'new');
  assert.equal(V.ringReason({ digits: '2', from, owner }), 'existing');
  assert.equal(V.ringReason({ digits: '', from, owner }), 'call');
  assert.equal(V.ringReason({ digits: '3', from, owner }), null);
  assert.equal(V.ringReason({ digits: '4', from, owner }), null);
  assert.equal(V.ringReason({ digits: '1', from: owner, owner }), null);
  assert.equal(V.ringReason({ digits: '1', from, owner: '' }), null);
  assert.equal(V.ringText({ from, reason: 'new' }), '\u{1F4DE} New order from (312) 555-0199. Ringing you now. Spam? Text BLOCK.');
  assert.equal(V.ringText({ from, reason: 'existing', name: 'KIM LEE' }), '\u{1F4DE} Existing order from KIM LEE (312) 555-0199. Ringing you now. Spam? Text BLOCK.');
  assert.doesNotMatch(V.ringText({ from, reason: 'call', name: '<b>x</b>\nhttp://evil' }), /[<>\n:\/]/);
});

test('no key pressed still rings a person', () => {
  assert.match(V.menuTwiml({ digits: '', from, owner, base }), /<Dial /);
  assert.match(V.menuTwiml({ digits: '9', from, owner, shop, base }), /<Dial /);
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

test('after hours a call still rings the owner; missed, it gets the closed greeting', () => {
  assert.match(V.menuTwiml({ digits: '1', from, owner, shop, base }), /<Dial /);
  const missed = V.doneTwiml({ accepted: false, base, open: false });
  assert.match(missed, /We&apos;re closed right now/);
  assert.match(missed, /<Record /);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /VOICE\.doneTwiml\(\{ accepted, base: TWILIO_VOICE_BASE, open: VOICE\.isOpen\(\) \}\)/);
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
  assert.match(V.missedCallText({ from: '+442071234567' }), /\+442071234567/);
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

test('after the ring: answered ends, anything else gets the voicemail', () => {
  assert.match(V.doneTwiml({ accepted: true, base }), /<Hangup\/>/);
  assert.doesNotMatch(V.doneTwiml({ accepted: true, base }), /Record/);
  assert.match(V.doneTwiml({ accepted: false, base }), /<Record /);
  assert.doesNotMatch(V.doneTwiml({ accepted: false, base }), /closed right now/);
});

test('caller-controlled text is escaped in TwiML', () => {
  const t = V.menuTwiml({ digits: '1', from: '+1312"><Hangup/>', owner, base });
  assert.doesNotMatch(t, /"><Hangup\/>/);
});

test('every call route checks the Twilio signature first', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  for (const k of Object.keys(V.PATHS)) {
    const m = src.match(new RegExp(`app\\.post\\(VOICE\\.PATHS\\.${k}, (?:async )?\\(req, res\\) => \\{\\n\\s*if \\(!twilioVoiceOk\\(req, res\\)\\) return;`));
    assert.ok(m, `${k} route verifies the signature`);
  }
});

test('a missed caller is texted to text the shop, with opt-out, and hours when closed', () => {
  const open = V.textBackBody({ open: true });
  assert.match(open, /^June's Tees: Sorry we missed your call!/);
  assert.match(open, /Reply STOP to opt out\.$/);
  assert.doesNotMatch(open, /open Mon-Fri/);
  assert.match(V.textBackBody({ open: false }), /We're open Mon-Fri 10:30am-6pm\./);
  assert.ok(open.length <= 160, 'one text segment');
});

test('the owner texting CALL is a callback; anything else is a normal reply', () => {
  assert.deepEqual(V.parseCallCommand('CALL'), { number: '' });
  assert.deepEqual(V.parseCallCommand(' call '), { number: '' });
  assert.deepEqual(V.parseCallCommand('Call 312-555-0199'), { number: '+13125550199' });
  assert.deepEqual(V.parseCallCommand('call: 1 (312) 555 0199'), { number: '+13125550199' });
  for (const t of ['call me at 5', 'Calling you later', 'I will call tomorrow', '']) {
    assert.equal(V.parseCallCommand(t), null, t);
  }
  for (const t of ['call 555-0199', 'Call 312 555 019', 'CALL 312-555-0199 re order', 'call +44 20 7123 4567']) {
    assert.deepEqual(V.parseCallCommand(t), { error: 'number' }, t);
  }
});

test('a callback asks the owner to press 1 before the customer is dialled', () => {
  const t = V.callbackTwiml({ to: '+13125550199', shop: '+17739004592', base });
  assert.match(t, /<Gather numDigits="1" timeout="8" action="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/connect\?to=3125550199"/);
  assert.match(t, /Press 1 to call 312 555-0199 from the shop number/);
  assert.doesNotMatch(t, /<Dial/);
  assert.match(V.connectTwiml({ digits: '1', to: '3125550199', shop: '+17739004592' }),
    /<Dial callerId="\+17739004592" timeout="30"><Number>\+13125550199<\/Number><\/Dial>/);
  assert.match(V.connectTwiml({ digits: '', to: '3125550199', shop: '+17739004592' }), /^<\?xml[^>]*><Response><Hangup\/><\/Response>$/);
  assert.match(V.connectTwiml({ digits: '1', to: '1900555', shop: '+17739004592' }), /<Hangup\/>/);
  for (const to of ['9005550199', '8765550199', '3129765555']) {
    assert.doesNotMatch(V.connectTwiml({ digits: '1', to, shop: '+17739004592' }), /<Dial/, to);
  }
});

test('voicemail is transcribed, and only a finished transcript is sent on', () => {
  assert.match(V.voicemailTwiml(base), /transcribe="true" transcribeCallback="https:\/\/www\.jtees\.net\/webhooks\/twilio\/voice\/transcript"/);
  assert.equal(V.transcriptText({ from, text: '  Hi, I need 40 shirts\n by Friday ', status: 'completed' }),
    'Voicemail from (312) 555-0199 said: "Hi, I need 40 shirts by Friday"');
  assert.equal(V.transcriptText({ from, text: 'x', status: 'failed' }), null);
  assert.equal(V.transcriptText({ from, text: '   ', status: 'completed' }), null);
});

test('server: callbacks only from the owner, once per text; text-back respects consent and hours', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const sms = src.slice(src.indexOf("app.post('/webhooks/twilio/sms'"), src.indexOf("app.post('/webhooks/twilio/sms'") + 3500);
  const ownerBranch = sms.indexOf('if (ownerDigits && from.replace');
  assert.ok(ownerBranch > 0 && sms.indexOf('ownerCallCommand(text, req.body.MessageSid)') > ownerBranch, 'CALL is only read inside the owner branch');
  const cmd = src.slice(src.indexOf('async function ownerCallCommand'), src.indexOf('async function ownerCallback'));
  assert.match(cmd, /if \(!CALL_COMMANDS\.add\(messageSid\)\) return true;/);
  assert.ok(cmd.indexOf('cmd.error') < cmd.indexOf('ownerCallback('), 'a bad number is never relayed or dialled');
  const report = src.slice(src.indexOf('async function reportCall'), src.indexOf('async function keepCall'));
  assert.match(report, /if \(!inTextingHours\(\)\) return;[\s\S]*sendCustomerSms\(\{[\s\S]*replyToContact: true/);
  assert.match(report, /if \(told && lead/);
  const never = src.slice(src.indexOf('async function neverAsked'), src.indexOf('async function sendCustomerSms'));
  assert.match(never, /if \(kind === 'marketing'\) return false;[\s\S]*SELECT 1 FROM sms_consents WHERE phone = \$1 LIMIT 1/);
  for (const k of ['transcript', 'connect']) {
    assert.match(src, new RegExp(`app\\.post\\(VOICE\\.PATHS\\.${k}, (?:async )?\\(req, res\\) => \\{\\n\\s*if \\(!twilioVoiceOk\\(req, res\\)\\) return;`), k);
  }
});

test('server: CALL dials any US number, never premium or Caribbean ones', () => {
  for (const n of ['+13125550199', '+17875550199', '+14165550199']) assert.equal(V.callable(n), true, n);
  for (const n of ['+19005550199', '+18765550199', '+17005550123', '+15335550123', '+14565550123', '+18095550199', '+13129765555', '+1312555019', '+442071234567', '']) {
    assert.equal(V.callable(n), false, n);
  }
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const cb = src.slice(src.indexOf('async function ownerCallback'), src.indexOf('/* The last caller who rang'));
  assert.doesNotMatch(cb, /not a customer on file/);
  const check = cb.indexOf('if (!VOICE.callable(to))');
  assert.ok(check > 0 && check < cb.indexOf('await twilioCall('), 'the premium check runs before dialling');

});

test('the owner texting BLOCK / UNBLOCK; anything else is a normal reply', () => {
  assert.deepEqual(V.parseBlockCommand('BLOCK'), { unblock: false, number: '' });
  assert.deepEqual(V.parseBlockCommand(' block 312-555-0199'), { unblock: false, number: '+13125550199' });
  assert.deepEqual(V.parseBlockCommand('Unblock (312) 555 0199'), { unblock: true, number: '+13125550199' });
  assert.deepEqual(V.parseBlockCommand('UNBLOCK'), { unblock: true, error: 'number' });
  assert.deepEqual(V.parseBlockCommand('block 555-0199'), { unblock: false, error: 'number' });
  assert.deepEqual(V.parseBlockCommand('block +44 7700 900123'), { unblock: false, number: '+447700900123' });
  assert.deepEqual(V.parseBlockCommand('UNBLOCK +447700900123'), { unblock: true, number: '+447700900123' });
  for (const t of ['Block letters are fine', 'blocked off friday', 'blocking', '', 'Block 2 is printed, pickup tomorrow', 'Unblock 3 colors ok?']) {
    assert.equal(V.parseBlockCommand(t), null, t);
  }
});

test('server: BLOCK works on any number, only from the owner, before the reply relay', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const sms = src.slice(src.indexOf("app.post('/webhooks/twilio/sms'"), src.indexOf("app.post('/webhooks/twilio/sms'") + 3500);
  const ownerBranch = sms.indexOf('if (ownerDigits && from.replace');
  const block = sms.indexOf('if (await ownerBlockCommand(text, req.body.MessageSid)) return;');
  assert.ok(ownerBranch > 0 && block > ownerBranch && block < sms.indexOf('relayOwnerReply('), 'BLOCK is read in the owner branch, before relaying');
  const fn = src.slice(src.indexOf('async function ownerBlockCommand'), src.indexOf('async function blockedCaller'));
  assert.doesNotMatch(fn, /customer on file|FROM quotes|FROM submissions/);
  assert.match(fn, /INSERT INTO blocked_callers \(phone\) VALUES \(\$1\) ON CONFLICT DO NOTHING/);
  assert.match(fn, /DELETE FROM blocked_callers WHERE phone = \$1/);
  assert.match(fn, /if \(!CALL_COMMANDS\.add\(messageSid\)\) return true;/);
  assert.match(fn, /if \(recent\.length > 1\)/, 'two recent callers: ask, never guess');
  assert.match(sms, /ownerBlockCommand\(text, req\.body\.MessageSid\)/);
});
