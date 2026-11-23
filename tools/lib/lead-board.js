'use strict';
/*
 * Where a lead sits on the Leads page (owner, 2026-11-23: "I dont know what to
 * answer and whats not open ... it should go away after we contact them").
 *
 *   answer     someone asked us and nobody has answered yet, or they wrote
 *              back after our last word: the shop owes them a reply
 *   reach_out  a lead the team found (the AI finder, "I found this customer")
 *              that nobody has contacted yet: they never asked us for anything
 *   contacted  we wrote last and are waiting on them; off the main view, the
 *              automatic follow-ups carry on
 *   quoted / dismissed   as lead_status says
 *
 * One definition for the page's sections, its chips and tiles, and the menu
 * badge, so they cannot disagree about who is waiting.
 */

const LEADFU = require('./lead-followups');

/** Did they write after our last word? `l.last_word` is the newest
 *  conversation note on the lead, either way (leadsWithStatus). */
function theyReplied(l) {
  return !!l && l.lead_status === 'contacted' && LEADFU.isInbound(l.last_word);
}

/** The lead's place on the board. `isFound` is server.js isFoundLead. */
function bucketOf(l, isFound) {
  const st = (l && l.lead_status) || 'new';
  if (st === 'new') return isFound(l) ? 'reach_out' : 'answer';
  if (st === 'contacted') return theyReplied(l) ? 'answer' : 'contacted';
  return st;
}

/** The main ("Open") view: what someone has to do something about. */
function isOpen(l, isFound) {
  const b = bucketOf(l, isFound);
  return b === 'answer' || b === 'reach_out';
}

/** When the lead started waiting on the shop: their reply, or the enquiry. */
function waitedFrom(l) {
  return new Date(theyReplied(l) ? l.last_word.created_at : l.created_at).getTime();
}

/** The leads the shop owes a reply, longest waiting first. */
function toAnswer(leads, isFound) {
  return (leads || []).filter((l) => bucketOf(l, isFound) === 'answer').sort((a, b) => waitedFrom(a) - waitedFrom(b));
}

/** The bell's key for a lead to answer. A reply is its own notice (keyed by
 *  when it came), so a lead already notified as new still rings when they
 *  write back, and answering clears it. */
function noticeRef(l) {
  return theyReplied(l) ? `${l.id}:reply:${new Date(l.last_word.created_at).getTime()}` : String(l.id);
}

module.exports = { theyReplied, bucketOf, isOpen, waitedFrom, toAnswer, noticeRef };
