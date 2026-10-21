'use strict';

/* Notifications (owner, 2026-10-18 back-office plan, PR 4): a bell in the menu
   for messages, approvals, leads, late jobs, payments, reviews and tasks.

   Every notification is DERIVED from records the shop already keeps (leads,
   approvals, payments, reviews, the job schedule, chat and the mailbox) by a
   sweep, rather than written at each place those records are made. A lead
   alone is created in six places; a hook missed in any of them, now or later,
   would be a notification that silently never comes. The sweep reads the
   tables, so it cannot miss a path, and UNIQUE (recipient, kind, ref) makes
   running it twice, or a webhook retried, add nothing.

   Message notifications (Team chat, Mailbox) are one per conversation while it
   has something unread, and are marked read by the sweep as soon as the
   conversation is read where it lives, so the bell never asks twice.

   Readers are keyed as Team chat keys them: 'owner' or 'staff:<id>'.
   Kept apart from the SQL so it can be tested. */

/* Each kind: its name on screen, whether its email is on until the person
   says otherwise, and who it can reach. Message emails are Team chat's
   existing alerts (team_chat_prefs), so they are not sent a second time
   here: `chatEmail` marks the kinds whose email switch is that one. */
const KINDS = {
  mail:     { label: 'Mailbox messages',             email: true,  chatEmail: true, who: 'any' },
  chat:     { label: 'Team chat messages',           email: true,  chatEmail: true, who: 'any' },
  approval: { label: 'Approvals waiting',            email: false, who: 'owner' },
  decided:  { label: 'Your approvals decided',       email: false, who: 'staff' },
  lead:     { label: 'New leads',                    email: false, who: 'any' },
  late:     { label: 'Jobs running late',            email: false, who: 'owner' },
  payment:  { label: 'Payments received',            email: false, who: 'owner' },
  review:   { label: 'Reviews to approve',           email: false, who: 'owner' },
  task:     { label: 'Tasks: new for you, or finished', email: false, who: 'any' },
  backlog:  { label: 'Backlog running low',          email: false, who: 'owner' },
};

/* The ding and the browser pop-up (owner, 2026-10-21: "the notifications
   should come with a ding (for all)"). Each is on until the person turns it
   off on Notification emails, and is kept in notification_prefs under these
   kinds, which no notification uses, with `email` meaning "on". */
const UI_PREFS = { sound: 'ui:sound', popup: 'ui:popup' };

/** Is the ding (or the pop-up) on for this reader? `prefs` maps kind → boolean
 *  as notification_prefs holds it. */
function uiOn(which, prefs) {
  const k = UI_PREFS[which];
  if (!k) return false;
  return prefs && Object.prototype.hasOwnProperty.call(prefs, k) ? !!prefs[k] : true;
}

/** Whether the page should ding, and what it remembers next. `seen` is what
 *  this browser last saw ({ id, msgs }, or null the first time); `now` is the
 *  newest unread notification's id and the unread message count. The first
 *  look only remembers: a page opened onto old news is quiet. A new
 *  notification, or more unread messages than last time, dings once; the
 *  memory is shared by the person's tabs, so two tabs ding once between them.
 *  Runs in the browser as well (its source is put into the page), so it uses
 *  nothing but plain JavaScript. */
function dingFor(seen, now) {
  var id = Number(now && now.id) || 0;
  var msgs = Number(now && now.msgs) || 0;
  if (!seen || typeof seen !== 'object') return { ding: false, why: '', next: { id: id, msgs: msgs } };
  var lastId = Number(seen.id) || 0;
  var lastMsgs = Number(seen.msgs) || 0;
  var why = id > lastId ? 'notify' : (msgs > lastMsgs ? 'msgs' : '');
  return { ding: !!why, why: why, next: { id: Math.max(id, lastId), msgs: msgs } };
}
const KIND_KEYS = Object.keys(KINDS);
const TITLE_MAX = 160;
const PAGE = 50;

/** A kind this module knows, or null. */
function kindOf(v) {
  return KIND_KEYS.includes(String(v || '')) ? String(v) : null;
}

/** The kinds a reader can get: the owner's, or a helper's. */
function kindsFor(reader) {
  const owner = reader === 'owner';
  return KIND_KEYS.filter((k) => KINDS[k].who === 'any' || KINDS[k].who === (owner ? 'owner' : 'staff'));
}

/** A title as stored: one line, trimmed, capped. */
function cleanTitle(v) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, TITLE_MAX);
}

/** A link a notification may open: a back-office path on this site, never
 *  another host or a script. Anything else becomes the Notifications page. */
function safeLink(v) {
  const s = String(v || '');
  return /^\/admin(\/[A-Za-z0-9\-._~%/?=&#:+]*)?$/.test(s) && !s.startsWith('//') && !/\/\//.test(s) ? s : '/admin/notifications';
}

/** Is email on for this reader and kind? `prefs` maps kind → boolean for the
 *  rows they have saved; a kind with no row uses its default. */
function emailOn(kind, prefs) {
  const k = kindOf(kind);
  if (!k) return false;
  return prefs && Object.prototype.hasOwnProperty.call(prefs, k) ? !!prefs[k] : KINDS[k].email;
}

/** The ref a message notification is keyed on: the conversation and the first
 *  message of this unread spell, so reading it and getting a new one is a new
 *  notification, and a second sweep of the same spell is not. */
function messageRef(convo, firstId) {
  return `${convo}:${firstId}`;
}

/** The conversation a message ref belongs to ('dm:3', 'ch:1', 'mb:12'). */
function convoOfRef(ref) {
  const m = /^((?:dm|ch|mb):\d+):\d+$/.exec(String(ref || ''));
  return m ? m[1] : null;
}

/** How a message notification reads. */
function messageTitle(n, where) {
  return cleanTitle(`${n === 1 ? 'A new message' : `${n} new messages`} in ${where}`);
}

module.exports = {
  KINDS, KIND_KEYS, TITLE_MAX, PAGE, UI_PREFS,
  kindOf, kindsFor, cleanTitle, safeLink, emailOn, uiOn, dingFor, messageRef, convoOfRef, messageTitle,
};
