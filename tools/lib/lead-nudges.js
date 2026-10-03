'use strict';
/*
 * Speed to lead (plan Phase 1e): text the owner when a lead is still waiting.
 *
 * A lead counts as waiting while it is 'new' on the Leads page (not quoted,
 * not let go), has no outcome, and nobody has logged a reply to it
 * (first_response_at: a call/email/text/chat note, an outcome, or a quote
 * built from it). Two texts per lead at most:
 *
 *   - after 2 working hours (Mon–Fri 9–5 Chicago, team-metrics DEFAULT_HOURS)
 *   - after 24 hours
 *
 * Each is stamped on the lead (unanswered_2h_at / unanswered_24h_at), so a
 * restart or a second worker never repeats one. Only leads from the last 3
 * days are considered, so switching this on does not text the owner about
 * the whole backlog, and the texts go out only during working hours — a lead
 * that crossed 24h at 3am is mentioned at 9. All leads due in one sweep share
 * ONE text.
 *
 * Live chats (source 'chat') are left out: they are answered inside tawk.to,
 * which leaves no reply on the lead, and the chat alert already went out when
 * it started. An offline chat message (source 'offline') does need a reply and
 * is included.
 */
const { businessMinutesBetween, zoned, DEFAULT_HOURS } = require('./team-metrics');

const WINDOW_MS = 3 * 86400000;
const FIRST_MINS = 120;
const SECOND_MS = 24 * 3600000;

/** Is `now` inside working hours? Texts wait for the morning otherwise. */
function inWorkingHours(now, hours = DEFAULT_HOURS) {
  const z = zoned(new Date(now), hours.tz);
  return hours.days.includes(z.dow) && z.h >= hours.open && z.h < hours.close;
}

/** Which leads are due which nudge at `now`. A lead due the 24h one gets
 *  only that (and both stamps): one text about it, not two at once. */
function dueNudges(leads, now = Date.now()) {
  const first = [], second = [];
  for (const l of leads || []) {
    if (!l || l.lead_status !== 'new' || l.first_response_at || l.outcome || l.dismissed_at) continue;
    if (l.source === 'chat') continue;
    const created = new Date(l.created_at).getTime();
    if (!Number.isFinite(created) || now - created > WINDOW_MS || now < created) continue;
    if (!l.unanswered_24h_at && now - created >= SECOND_MS) second.push(l);
    else if (!l.unanswered_2h_at && businessMinutesBetween(created, now) >= FIRST_MINS) first.push(l);
  }
  return { first, second };
}

const hoursAgo = (l, now) => Math.max(1, Math.round((now - new Date(l.created_at).getTime()) / 3600000));
const firstName = (n) => String(n || 'Someone').trim().split(/\s+/)[0].slice(0, 20) || 'Someone';

/** The one text. First names and the source only — never a customer's
 *  number or email in an SMS. */
function nudgeText({ first, second }, { now = Date.now(), sourceLabel = (s) => s, link = '' } = {}) {
  const all = [...second, ...first];
  if (!all.length) return '';
  const who = all.slice(0, 4).map((l) => `${firstName(l.name)} (${sourceLabel(l.source)}, ${hoursAgo(l, now)}h)`).join(', ');
  const more = all.length > 4 ? ` +${all.length - 4} more` : '';
  const head = all.length === 1 ? '1 lead is still waiting for a reply' : `${all.length} leads are still waiting for a reply`;
  return `June's Tees: ${head}: ${who}${more}.${second.length ? ' Over a day old: reply today or they go elsewhere.' : ''}${link ? ' ' + link : ''}`.slice(0, 320);
}

module.exports = { dueNudges, nudgeText, inWorkingHours, WINDOW_MS, FIRST_MINS, SECOND_MS };
