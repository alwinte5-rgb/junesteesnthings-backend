'use strict';

/* Calls to the shop's Twilio number.

   The caller hears a short menu. Choosing an order option (or nothing) rings
   the owner's cell (TWILIO_TO_NUMBER) showing the CUSTOMER's number, so it can
   be saved or called back. Before it connects the owner hears "June's Tees,
   new order. Press 1 to answer", which tells a shop call from a personal one
   and keeps the cell's own voicemail from taking it: no 1 pressed means not
   answered. Unanswered calls get the shop greeting and a voicemail, and the
   owner gets a text either way.

   Every URL here is absolute and fixed, because Twilio's signature covers the
   exact URL it requested (see twilio-webhook.js). */

const PATHS = {
  incoming: '/webhooks/twilio/voice',
  menu: '/webhooks/twilio/voice/menu',
  screen: '/webhooks/twilio/voice/screen',
  accept: '/webhooks/twilio/voice/accept',
  done: '/webhooks/twilio/voice/done',
  voicemail: '/webhooks/twilio/voice/voicemail',
};

const SHOP = "June's Tees";
const SHOP_FULL = "June's Tees and Things";
const RING_SECONDS = 20;
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
  'You can also start a quote any time at j tees dot net.';

function xml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

const twiml = (inner) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const say = (text) => `<Say voice="${VOICE}">${xml(text)}</Say>`;

function recordTag(base) {
  return `<Record maxLength="${VOICEMAIL_SECONDS}" playBeep="true" timeout="5" action="${xml(base + PATHS.voicemail)}" method="POST"/>`;
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

/* Ring the owner. `from` and `owner` are +1XXXXXXXXXX or ''. */
function ringTwiml({ from, owner, base, reason = 'call' }) {
  if (!owner || (from && from === owner)) return voicemailTwiml(base);
  const r = Object.hasOwn(REASONS, reason) ? reason : 'call';
  const callerId = from ? ` callerId="${xml(from)}"` : '';
  const screenUrl = `${base}${PATHS.screen}?r=${r}`;
  return twiml(
    say('One moment while we connect you.') +
    `<Dial timeout="${RING_SECONDS}" answerOnBridge="true"${callerId} action="${xml(base + PATHS.done)}" method="POST">` +
    `<Number url="${xml(screenUrl)}" method="POST">${xml(owner)}</Number></Dial>`);
}

/* What a menu key does. `digits` is '' when the caller pressed nothing. */
function menuTwiml({ digits, from, owner, base }) {
  const pick = MENU[String(digits || '').trim()];
  if (!pick) return ringTwiml({ from, owner, base });
  if (pick.info) return twiml(say(INFO) + menuInner({ base, again: true }));
  if (pick.voicemail) return twiml(say("Leave your name, number and what you need after the tone, and we'll get right back to you.") + recordTag(base) + '<Hangup/>');
  return ringTwiml({ from, owner, base, reason: pick.reason });
}

/* What the owner hears on picking up. Hanging up here (no key, or a
   voicemail greeting) leaves the call unanswered. */
function screenTwiml({ base, reason }) {
  const r = REASONS[Object.hasOwn(REASONS, reason) ? reason : 'call'];
  return twiml(
    `<Gather numDigits="1" timeout="6" action="${xml(base + PATHS.accept)}" method="POST">` +
    say(`${SHOP}, ${r}. Press 1 to answer.`) + '</Gather><Hangup/>');
}

function acceptTwiml(digits) {
  return isAccept(digits) ? twiml('') : twiml('<Hangup/>');
}

/* After the ring. `accepted` = the owner pressed 1 on this call. */
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
const isAccept = (digits) => String(digits || '').trim() === '1';

/* Calls the owner accepted, by the customer's call id, until the ring's
   `done` request reads them. In memory: a restart mid-call can only cost the
   caller a voicemail prompt after the conversation already ended. */
function acceptedCalls(ttlMs = 2 * 60 * 60 * 1000) {
  const seen = new Map();
  const sweep = (now) => { for (const [k, t] of seen) if (now - t > ttlMs) seen.delete(k); };
  return {
    add(sid, now = Date.now()) { if (sid) { sweep(now); seen.set(String(sid), now); } },
    take(sid) { const had = seen.has(String(sid)); seen.delete(String(sid)); return had; },
    size: () => seen.size,
  };
}

module.exports = {
  PATHS, MENU, incomingTwiml, menuTwiml, ringTwiml, screenTwiml, acceptTwiml, doneTwiml,
  voicemailTwiml, missedCallText, voicemailText, callerNumber, isAccept, THANKS, acceptedCalls, pretty,
};
