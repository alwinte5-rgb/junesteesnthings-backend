'use strict';

/* Team chat channels and email alerts: the rules, kept apart from the SQL so
   they can be tested on their own.

   A channel has an audience: everyone on the team, or one training track
   ("sales", "design", "content", "ads"), the same track that decides a helper's training. The
   owner is in every channel. A helper sees and posts only in the channels
   their track belongs to, and the server decides that, never the form.

   Alerts: when a message has sat unread for ALERT_AFTER_MIN minutes, the
   reader gets one email for that conversation. No more for it until they
   have read it, however many messages arrive meanwhile. */

const ALERT_AFTER_MIN = 10;
const AUDIENCES = { all: 'Everyone', sales: 'Sales', design: 'Design', content: 'Content', ads: 'Ads' };
const NAME_MAX = 40;

/** An audience from a form, or null. */
function audienceOf(a) {
  return Object.prototype.hasOwnProperty.call(AUDIENCES, a) ? a : null;
}

/** Is this helper (a roster row) in the channel? */
function isMember(channel, helper, trackOf = (t) => t) {
  if (!channel || channel.archived_at || !helper || !helper.active) return false;
  return channel.audience === 'all' || trackOf(helper.training_track) === channel.audience;
}

/** May this actor read and post in the channel? The owner always. */
function mayUse(actor, channel, helper, trackOf) {
  if (!channel || channel.archived_at) return false;
  if (!actor || actor.kind !== 'staff') return true;
  return !!helper && helper.id === actor.id && isMember(channel, helper, trackOf);
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

module.exports = { ALERT_AFTER_MIN, AUDIENCES, NAME_MAX, audienceOf, isMember, mayUse, readerKey, alertDue, cleanName };
