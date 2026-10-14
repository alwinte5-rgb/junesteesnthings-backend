'use strict';

/* Calls to the shop's Twilio number.

   The caller hears a short menu. An order option (or no key) rings the
   owner's cell (TWILIO_TO_NUMBER) from the shop number, and a text names the
   caller as it rings. Unanswered, or outside shop hours, the caller gets the
   shop voicemail; the owner is texted about every missed call.

   Every URL here is absolute and fixed, because Twilio's signature covers the
   exact URL it requested (see twilio-webhook.js). */

const PATHS = {
  incoming: '/webhooks/twilio/voice',
  menu: '/webhooks/twilio/voice/menu',
  done: '/webhooks/twilio/voice/done',
  voicemail: '/webhooks/twilio/voice/voicemail',
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

/* When calls ring the owner: the shop's pickup hours, Chicago time. Outside
   them a call goes to voicemail. */
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
  return `<Record maxLength="${VOICEMAIL_SECONDS}" playBeep="true" timeout="5" action="${xml(base + PATHS.voicemail)}" method="POST"/>`;
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

function incomingTwiml({ base }) {
  return twiml(menuInner({ base }));
}

/* Ring the owner. The cell shows the SHOP number (`shop`), so a call saved
   as "June's Tees Customer" reads as one before it is answered and is never
   held by unknown-caller screening; who is calling comes in a text
   (ringText). `from`, `owner` and `shop` are +1XXXXXXXXXX or ''. */
function ringTwiml({ from, owner, shop, base, open = true }) {
  if (!open) return afterHoursTwiml(base);
  if (!owner || (from && from === owner)) return voicemailTwiml(base);
  const callerId = shop ? ` callerId="${xml(shop)}"` : '';
  return twiml(
    say('One moment while we connect you.') +
    `<Dial timeout="${RING_SECONDS}" answerOnBridge="true"${callerId} action="${xml(base + PATHS.done)}" method="POST">` +
    `<Number>${xml(owner)}</Number></Dial>`);
}

/* Why a menu choice rings the owner, or null when it does not ring. */
function ringReason({ digits, from, owner, open = true }) {
  if (!open || !owner || (from && from === owner)) return null;
  const pick = MENU[String(digits || '').trim()];
  if (!pick) return 'call';
  return pick.reason || null;
}

/* The text that lands on the owner's cell as it rings. */
function ringText({ from, reason, name }) {
  const what = REASONS[Object.hasOwn(REASONS, reason) ? reason : 'call'];
  const who = name ? `${String(name).replace(/[^\w .,'&-]/g, '').trim().slice(0, 40)} ` : '';
  return `\u{1F4DE} ${what.charAt(0).toUpperCase() + what.slice(1)} from ${who}${pretty(from)}. Ringing you now.`;
}

/* What a menu key does. `digits` is '' when the caller pressed nothing. */
function menuTwiml({ digits, from, owner, shop, base, open = true }) {
  const pick = MENU[String(digits || '').trim()];
  if (!pick) return ringTwiml({ from, owner, shop, base, open });
  if (pick.info) return twiml(say(INFO) + menuInner({ base, again: true }));
  if (pick.voicemail) return twiml(say("Leave your name, number and what you need after the tone, and we'll get right back to you.") + recordTag(base) + '<Hangup/>');
  return ringTwiml({ from, owner, shop, base, open });
}

/* After the ring. `accepted` = the owner's cell picked up. */
function doneTwiml({ accepted, base }) {
  return accepted ? twiml('<Hangup/>') : voicemailTwiml(base);
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

const THANKS = () => twiml(say('Thank you. Goodbye.') + '<Hangup/>');

module.exports = {
  PATHS, MENU, incomingTwiml, menuTwiml, ringTwiml, ringReason, ringText, doneTwiml,
  voicemailTwiml, afterHoursTwiml, isOpen, missedCallText, voicemailText, callerNumber, THANKS, pretty,
};
