'use strict';

/* Calls to the shop's Twilio number.

   Every caller rings the owner's cell (TWILIO_TO_NUMBER) straight away, at
   any hour, from the shop number, and a text names the caller as it rings
   (owner, 2026-10-30). A number the owner blocked (texting BLOCK) hears a
   busy line. Unanswered, the caller gets the shop voicemail (the closed
   greeting outside shop hours); the owner is texted about every call that
   rang and was missed, and every message left. Only the owner calling in, or
   no owner number set, hears the menu.

   Every URL here is absolute and fixed, because Twilio's signature covers the
   exact URL it requested (see twilio-webhook.js). */

const PATHS = {
  incoming: '/webhooks/twilio/voice',
  menu: '/webhooks/twilio/voice/menu',
  done: '/webhooks/twilio/voice/done',
  voicemail: '/webhooks/twilio/voice/voicemail',
  transcript: '/webhooks/twilio/voice/transcript',
  connect: '/webhooks/twilio/voice/connect',
};

const SHOP = "June's Tees";
const SHOP_FULL = "June's Tees and Things";
/* Under a cell's own voicemail pickup (usually 25s+), so an unanswered
   call reaches the shop voicemail rather than the owner's personal one. */
const RING_SECONDS = 18;
const VOICEMAIL_SECONDS = 120;
const VOICE = 'Polly.Joanna';

/* Menu keys. `reason` is what the owner hears before answering. */
const MENU = {
  '1': { reason: 'new' },
  '2': { reason: 'existing' },
  '3': { info: true },
  '4': { voicemail: true },
};
/* What the owner hears for each reason; kept to plain words so the URL
   Twilio signs needs no escaping. */
const REASONS = { new: 'new order', existing: 'existing order', call: 'customer call' };

const INFO = "You'll find us at 3047 North Lincoln Avenue, suite 4 35, in Chicago. " +
  "We're open for pickups Monday through Friday, 10:30 AM to 6 PM, and closed on weekends. " +
  "We're a working studio, so we see customers by appointment. That way your order is ready " +
  "and you have our full attention. Just give us a call before you head over to confirm your time. " +
  "When you arrive, ring the intercom for June's Tees and we'll buzz you right in. " +
  'Come up to the 4th floor and have a seat in the lobby, and we will be right with you. ' +
  'You can also start a quote any time at j tees dot net.';

/* The shop's pickup hours, Chicago time: which voicemail greeting a missed
   caller hears, and whether the text-back gives the hours. */
const OPEN = { days: [1, 2, 3, 4, 5], from: 10 * 60 + 30, to: 18 * 60 };
const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function isOpen(now = new Date(), tz = 'America/Chicago') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const mins = (parseInt(parts.hour, 10) % 24) * 60 + parseInt(parts.minute, 10);
  return OPEN.days.includes(DAYS[parts.weekday]) && mins >= OPEN.from && mins < OPEN.to;
}

function xml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const say = (text) => `<Say voice="${VOICE}">${xml(text)}</Say>`;

function recordTag(base) {
  return `<Record maxLength="${VOICEMAIL_SECONDS}" playBeep="true" timeout="5" action="${xml(base + PATHS.voicemail)}" method="POST"` +
    ` transcribe="true" transcribeCallback="${xml(base + PATHS.transcript)}"/>`;
}

function afterHoursTwiml(base) {
  return twiml(
    say(`Thanks for calling ${SHOP}. We're closed right now. Our hours are Monday through Friday, 10:30 AM to 6 PM. ` +
      "Leave your name, number and what you need after the tone, or text this number, and we'll get back to you next business day.") +
    recordTag(base) + '<Hangup/>');
}

function voicemailTwiml(base) {
  return twiml(
    say(`Thanks for calling ${SHOP}. We can't get to the phone right now. ` +
      "Leave your name, number and what you need after the tone, or text this number, and we'll get right back to you.") +
    recordTag(base) + '<Hangup/>');
}

/* The first answer to a call: the menu. No key pressed falls through to
   ringing the owner, so a caller who just waits still reaches a person. */
function menuInner({ base, again = false }) {
  const greet = again ? '' : `Thanks for calling ${SHOP_FULL}. `;
  return (
    `<Gather numDigits="1" timeout="5" action="${xml(base + PATHS.menu)}" method="POST">` +
    say(`${greet}For a new order or a quote, press 1. About an order you've already placed, press 2. ` +
      'For our hours and address, press 3. To leave a message, press 4.') +
    '</Gather>' +
    `<Redirect method="POST">${xml(base + PATHS.menu)}</Redirect>`);
}

/* Whether a call can reach the owner at all: with an owner number, and not
   the owner calling in. The press-1 screen for unknown callers (#499) and the
   after-hours menu lost real customers; every caller now rings (owner,
   2026-10-30), and spam is blocked number by number. */
function ringsOwner({ from, owner, blocked = false }) {
  return Boolean(owner && from !== owner && !blocked);
}

/* A blocked number hears a busy line: no voicemail, no lead, no texts. */
const BUSY = () => twiml('<Reject reason="busy"/>');

function incomingTwiml({ base, from, owner, shop, blocked = false }) {
  if (!owner || from === owner) return twiml(menuInner({ base }));
  if (blocked) return BUSY();
  const callerId = shop ? ` callerId="${xml(shop)}"` : '';
  return twiml(
    say(`Thanks for calling ${SHOP}. One moment while we connect you.`) +
    `<Dial timeout="${RING_SECONDS}" answerOnBridge="true"${callerId} action="${xml(base + PATHS.done)}" method="POST">` +
    `<Number>${xml(owner)}</Number></Dial>`);
}

/* Ring the owner. The cell shows the SHOP number (`shop`), so a call saved
   as "June's Tees Customer" reads as one before it is answered and is never
   held by unknown-caller screening; who is calling comes in a text
   (ringText). `from`, `owner` and `shop` are +1XXXXXXXXXX or ''. */
function ringTwiml({ from, owner, shop, base }) {
  if (!owner || (from && from === owner)) return voicemailTwiml(base);
  const callerId = shop ? ` callerId="${xml(shop)}"` : '';
  return twiml(
    say('One moment while we connect you.') +
    `<Dial timeout="${RING_SECONDS}" answerOnBridge="true"${callerId} action="${xml(base + PATHS.done)}" method="POST">` +
    `<Number>${xml(owner)}</Number></Dial>`);
}

/* Why a menu choice rings the owner, or null when it does not ring. */
function ringReason({ digits, from, owner }) {
  if (!owner || (from && from === owner)) return null;
  const pick = MENU[String(digits || '').trim()];
  if (!pick) return 'call';
  return pick.reason || null;
}

/* The text that lands on the owner's cell as it rings. */
function ringText({ from, reason, name }) {
  const what = REASONS[Object.hasOwn(REASONS, reason) ? reason : 'call'];
  const who = name ? `${String(name).replace(/[^\w .,'&-]/g, '').trim().slice(0, 40)} ` : '';
  return `\u{1F4DE} ${what.charAt(0).toUpperCase() + what.slice(1)} from ${who}${pretty(from)}. Ringing you now. Spam? Text BLOCK.`;
}

/* What a menu key does. `digits` is '' when the caller pressed nothing. */
function menuTwiml({ digits, from, owner, shop, base }) {
  const pick = MENU[String(digits || '').trim()];
  if (!pick) return ringTwiml({ from, owner, shop, base });
  if (pick.info) return twiml(say(INFO) + menuInner({ base, again: true }));
  if (pick.voicemail) return twiml(say("Leave your name, number and what you need after the tone, and we'll get right back to you.") + recordTag(base) + '<Hangup/>');
  return ringTwiml({ from, owner, shop, base });
}

/* After the ring. `accepted` = the owner's cell picked up; a missed caller
   outside shop hours hears the closed greeting. */
function doneTwiml({ accepted, base, open = true }) {
  if (accepted) return twiml('<Hangup/>');
  return open ? voicemailTwiml(base) : afterHoursTwiml(base);
}

function pretty(e164) {
  const s = String(e164 || '');
  if (/^\+1\d{10}$/.test(s)) return `(${s.slice(2, 5)}) ${s.slice(5, 8)}-${s.slice(8)}`;
  return /^\+\d{8,15}$/.test(s) ? s : 'an unknown number';
}

/* The owner's text the moment a call goes unanswered: sent whether or not
   the caller then leaves a message, so a hang-up is never lost. */
function missedCallText({ from }) {
  return `Missed call from ${pretty(from)}. They heard the voicemail greeting; any message follows in a separate text.`;
}

/* The owner's text when a message was recorded, or null when nothing was.
   The link is Twilio's: it is sent only to the owner, never kept on the lead. */
function voicemailText({ from, recordingUrl, seconds }) {
  const secs = Math.max(0, parseInt(seconds, 10) || 0);
  const ok = /^https:\/\/api\.twilio\.com\/[\w/.-]+$/.test(String(recordingUrl || ''));
  if (!ok || secs < 2) return null;
  return `Voicemail from ${pretty(from)} (${secs}s): ${recordingUrl}.mp3`;
}

/* A caller's number for display and callerId: US numbers normalised by the
   caller, anything else kept if it is already E.164. */
function callerNumber(raw, normalizeUs) {
  const us = normalizeUs(raw);
  if (us) return us;
  const s = String(raw || '').trim();
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}

/* The one text a caller we missed gets (once a day, see server.js). */
function textBackBody({ open }) {
  return "June's Tees: Sorry we missed your call! Text us here with what you need and we'll get right back to you." +
    (open ? '' : ' We\'re open Mon-Fri 10:30am-6pm.') + ' Reply STOP to opt out.';
}

/* What follows CALL or BLOCK: '' (the last caller), a US number, an error
   for something that starts like a number but is not one, or null for
   words (an ordinary reply, passed on to the customer). */
function commandNumber(rest) {
  if (!rest) return { number: '' };
  const d = rest.replace(/\D/g, '');
  if (/^[\d\s().+-]+$/.test(rest) && (d.length === 10 || (d.length === 11 && d[0] === '1'))) return { number: '+1' + d.slice(-10) };
  /* Starts like a number but is not one (a digit short, words after it):
     tell the owner, never relay it to a customer as a message. */
  if (/^[\d(+]/.test(rest)) return { error: 'number' };
  return null;
}

/* The owner texting CALL (the last caller) or CALL and a number. null when
   the text is not a call command; number '' means "the last caller". */
function parseCallCommand(text) {
  const m = /^\s*call\b[\s:,-]*(.*)$/i.exec(String(text || ''));
  return m ? commandNumber(m[1].trim()) : null;
}

/* The owner texting BLOCK (the last caller) or BLOCK / UNBLOCK and a number,
   US or overseas in +44... form. null when the text is not one ("Block 2 is
   printed" is a reply to a customer); UNBLOCK always needs the number. */
function parseBlockCommand(text) {
  const m = /^\s*(un)?block\b[\s:,-]*(.*)$/i.exec(String(text || ''));
  if (!m) return null;
  const rest = m[2].trim();
  if (/[a-z]/i.test(rest)) return null;
  const unblock = Boolean(m[1]);
  const intl = rest.replace(/[\s().-]/g, '');
  if (/^\+[2-9]\d{7,14}$/.test(intl)) return { unblock, number: intl };
  const cmd = commandNumber(rest);
  if (!cmd) return null;
  if (unblock && cmd.number === '') return { unblock, error: 'number' };
  return { unblock, ...cmd };
}

/* Area codes on the +1 plan that are not the US or Canada (the Caribbean and
   Bermuda: one-ring scam territory, billed like overseas calls), 900 premium
   lines, and the non-geographic codes (5XX personal numbers, 456, 700) that
   can be billed by the carrier; 976 is a premium exchange in any area code. */
const NOT_US = new Set(['242', '246', '264', '268', '284', '345', '441', '473', '649', '658', '664', '721',
  '758', '767', '784', '809', '829', '849', '868', '869', '876', '900', '456', '500', '700',
  '521', '522', '523', '524', '525', '526', '527', '528', '529', '530', '531', '532', '533', '544', '566', '577', '588']);

/* Whether the shop number may dial `to` (+1XXXXXXXXXX) for the owner. */
function callable(to) {
  const m = /^\+1([2-9]\d{2})([2-9]\d{2})\d{4}$/.exec(String(to || ''));
  return Boolean(m && !NOT_US.has(m[1]) && m[2] !== '976');
}

/* The owner's cell is rung first (from the shop number, a saved contact);
   the customer is dialled only after the owner presses 1, so a voicemail
   that picks up the owner's leg never reaches the customer. */
function callbackTwiml({ to, shop, base }) {
  const d = String(to || '').replace(/\D/g, '').slice(-10);
  return twiml(
    `<Gather numDigits="1" timeout="8" action="${xml(`${base}${PATHS.connect}?to=${d}`)}" method="POST">` +
    say(`Press 1 to call ${pretty(to).replace(/[()]/g, '')} from the shop number.`) + '</Gather><Hangup/>');
}

/* After the owner's key: dial the customer, or end. `to` is 10 digits from
   the signed URL. */
function connectTwiml({ digits, to, shop }) {
  if (String(digits || '').trim() !== '1' || !callable('+1' + String(to || ''))) return twiml('<Hangup/>');
  return twiml(`<Dial callerId="${xml(shop)}" timeout="30"><Number>+1${to}</Number></Dial>`);
}

/* What a voicemail said, for the owner and the lead. null when Twilio could
   not transcribe it. */
function transcriptText({ from, text, status }) {
  const said = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (status !== 'completed' || !said) return null;
  return `Voicemail from ${pretty(from)} said: "${said}"`;
}

const THANKS = () => twiml(say('Thank you. Goodbye.') + '<Hangup/>');

module.exports = {
  PATHS, MENU, incomingTwiml, ringsOwner, menuTwiml, ringTwiml, ringReason, ringText, doneTwiml, BUSY,
  voicemailTwiml, afterHoursTwiml, isOpen, missedCallText, voicemailText, callerNumber, THANKS, pretty, textBackBody,
  parseCallCommand, parseBlockCommand, callable, callbackTwiml, connectTwiml, transcriptText,
};
