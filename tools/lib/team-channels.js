'use strict';

/* Team chat channels and email alerts: the rules, kept apart from the SQL so
   they can be tested on their own.

   A channel has an audience: everyone on the team, or one training track
   (tracks.js), the same track that decides a helper's training. The
   owner is in every channel. A helper sees and posts only in the channels
   their track belongs to, and the server decides that, never the form.

   Direct chats between two helpers (owner, 2026-11-18: "allow the employees
   to communicate with each other via the chat") are channels too, with the
   audience 'pair:<lower id>:<higher id>'. Only those two are members. The
   owner may open and read one, but is not in it: it never counts as unread
   for her, and she does not post in it.

   Alerts: when a message has sat unread for ALERT_AFTER_MIN minutes, the
   reader gets one email for that conversation. No more for it until they
   have read it, however many messages arrive meanwhile. */

const ALERT_AFTER_MIN = 10;
const { AUDIENCES, audiencesFor } = require('./tracks');
const NAME_MAX = 40;

const PAIR_RE = /^pair:(\d{1,9}):(\d{1,9})$/;

/** The audience of the direct chat between helpers a and b, or null. */
function pairAudience(a, b) {
  const x = Number(a), y = Number(b);
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x <= 0 || y <= 0 || x === y) return null;
  return `pair:${Math.min(x, y)}:${Math.max(x, y)}`;
}

/** The two helper ids of a direct chat between helpers, or null for any
 *  other channel. */
function pairOf(channel) {
  const m = channel && PAIR_RE.exec(String(channel.audience || ''));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The other helper in a direct chat, from helper `me`'s side, or null. */
function pairOther(channel, me) {
  const p = pairOf(channel);
  if (!p || !p.includes(Number(me))) return null;
  return p[0] === Number(me) ? p[1] : p[0];
}

/** An audience from a form, or null. A pair is never one: those are made
 *  only by the server, never typed. */
function audienceOf(a) {
  return Object.prototype.hasOwnProperty.call(AUDIENCES, a) ? a : null;
}

/** Is this helper (a roster row) in the channel? */
function isMember(channel, helper, trackOf = (t) => t) {
  if (!channel || channel.archived_at || !helper || !helper.active) return false;
  const pair = pairOf(channel);
  if (pair) return pair.includes(Number(helper.id));
  return channel.audience === 'all' || audiencesFor(trackOf(helper.training_track)).includes(channel.audience);
}

/** May this actor read and post in the channel? The owner always. */
function mayUse(actor, channel, helper, trackOf) {
  if (!channel || channel.archived_at) return false;
  if (!actor || actor.kind !== 'staff') return true;
  return !!helper && helper.id === actor.id && isMember(channel, helper, trackOf);
}

/** Is this actor one of the people a channel is for, so its messages count
 *  as unread and alert them? A helper when a member; the owner in every
 *  channel except a direct chat between two helpers, which she may read but
 *  is not part of. */
function isIn(actor, channel, helper, trackOf) {
  if (!actor || actor.kind !== 'staff') return !!channel && !channel.archived_at && !pairOf(channel);
  return mayUse(actor, channel, helper, trackOf);
}

/** The reader's key in team_chat_reads and team_chat_prefs. */
function readerKey(actor) {
  return actor && actor.kind === 'staff' ? `staff:${actor.id}` : 'owner';
}

/** Is an alert due? firstUnread is the oldest message this reader has not
 *  read (and did not write) that is old enough; alerted is the newest id
 *  already emailed about. One alert per stretch of unread messages. */
function alertDue(firstUnread, alerted) {
  if (!firstUnread) return false;
  return Number(firstUnread) > Number(alerted || 0);
}

/** A channel name from a form: trimmed, single line, capped. */
function cleanName(n) {
  return String(n || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

module.exports = { ALERT_AFTER_MIN, AUDIENCES, NAME_MAX, audienceOf, isMember, mayUse, isIn, readerKey, alertDue, cleanName,
  pairAudience, pairOf, pairOther };
