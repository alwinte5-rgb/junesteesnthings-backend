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

const INFO = 'We offer curbside pickup at 3047 North Lincoln Avenue, suite 4 35, in Chicago, ' +
  'Monday through Friday, 10:30 AM to 6 PM. We are closed Saturday and Sunday. ' +
  'Visits are by appointment only, so please call to confirm your appointment before you come. ' +
  "When you arrive, ring the intercom for June's Tees and we'll let you in. " +
  'Visitors without an appointment may not be let in. ' +
  'You can also get a quote any time at j tees dot net.';

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
function incomingTwiml({ base, again = false }) {
  const greet = again ? '' : `Thanks for calling ${SHOP_FULL}. `;
  return twiml(
    `<Gather numDigits="1" timeout="5" action="${xml(base + PATHS.menu)}" method="POST">` +
    say(`${greet}For a new order or a quote, press 1. About an order you've already placed, press 2. ` +
      'For our hours and address, press 3. To leave a message, press 4.') +
    '</Gather>' +
    `<Redirect method="POST">${xml(base + PATHS.menu)}</Redirect>`);
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
  if (pick.info) return twiml(say(INFO) + incomingTwiml({ base, again: true }).replace(/^.*?<Response>|<\/Response>$/g, ''));
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
  return String(digits || '').trim() === '1' ? twiml('') : twiml('<Hangup/>');
}

/* After the ring. `accepted` = the owner pressed 1 on this call. */
function doneTwiml({ accepted, base }) {
  return accepted ? twiml('<Hangup/>') : voicemailTwiml(base);
}

function pretty(e164) {
  const d = String(e164 || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : 'an unknown number';
}

/* The owner's text about a call nobody picked up. */
function missedCallText({ from, recordingUrl, seconds }) {
  const secs = Math.max(0, parseInt(seconds, 10) || 0);
  const url = /^https:\/\/api\.twilio\.com\/[\w/.-]+$/.test(String(recordingUrl || '')) ? `${recordingUrl}.mp3` : '';
  if (url && secs >= 2) return `Missed call from ${pretty(from)}. Voicemail (${secs}s): ${url}`;
  return `Missed call from ${pretty(from)}. No voicemail left.`;
}

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
  voicemailTwiml, missedCallText, acceptedCalls, pretty,
};
