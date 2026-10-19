'use strict';

/* The Mailbox (owner, 2026-10-18): conversations about one order or one task,
   beside Team chat rather than instead of it. "We need the mailbox for jobs
   and tasks"; chat stays for check-ins and quick meetings.

   A conversation is open until someone marks it Done, which takes it off the
   Open folder and the dashboards. It is never deleted or archived: it stays in
   Done, on its order's or task's page, and any new message reopens it. Each
   message shows who has seen it and when, and the list shows whether the
   other side has replied.

   Readers are keyed as Team chat keys them ('owner' or 'staff:<id>',
   team-channels.js readerKey). Kept apart from the SQL so it can be tested. */

const SUBJECT_MAX = 120;
const MAX_RECIPIENTS = 20;
const FOLDERS = ['open', 'done'];

/** 'open' or 'done'; anything else is 'open'. */
function folderOf(v) {
  return FOLDERS.includes(String(v || '')) ? String(v) : 'open';
}

/** A subject as typed: one line, trimmed, capped. '' when empty. */
function cleanSubject(v) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, SUBJECT_MAX);
}

/** Helper ids picked on the new-conversation form: whole numbers, each once,
 *  at most MAX_RECIPIENTS. `null` when the list is too long, so it is refused
 *  rather than cut. */
function pickRecipients(raw) {
  const list = (Array.isArray(raw) ? raw : raw == null || raw === '' ? [] : [raw]).map(String);
  if (list.length > MAX_RECIPIENTS) return null;
  const ids = [];
  for (const v of list) {
    if (!/^\d{1,9}$/.test(v)) continue;
    const n = Number(v);
    if (n > 0 && !ids.includes(n)) ids.push(n);
  }
  return ids;
}

/** Is this reader in the conversation? The owner reads them all. */
function mayRead(reader, participants) {
  return reader === 'owner' || (participants || []).includes(reader);
}

/** The other people in a conversation, from one reader's side. */
function others(reader, participants) {
  return (participants || []).filter((p) => p !== reader);
}

/**
 * Where a conversation stands with each other person, from `reader`'s side:
 * for the latest message `reader` wrote, has each other person replied since,
 * seen it, or neither. `messages` are { id, author, created_at } oldest first;
 * `seen` maps message id → { [reader]: seen_at }.
 * Returns [{ reader, state: 'replied'|'read'|'unread', at }], or [] when the
 * reader has not written anything yet.
 */
function replyState(reader, participants, messages, seen) {
  const mine = [...(messages || [])].reverse().find((m) => m.author === reader);
  if (!mine) return [];
  return others(reader, participants).map((p) => {
    const reply = (messages || []).find((m) => m.author === p && Number(m.id) > Number(mine.id));
    if (reply) return { reader: p, state: 'replied', at: reply.created_at };
    const at = seen && seen[mine.id] && seen[mine.id][p];
    return at ? { reader: p, state: 'read', at } : { reader: p, state: 'unread', at: null };
  });
}

/** How many messages from other people this reader has not seen. */
function unreadFor(reader, messages, seen) {
  return (messages || []).filter((m) => m.author !== reader && !(seen && seen[m.id] && seen[m.id][reader])).length;
}

module.exports = {
  SUBJECT_MAX, MAX_RECIPIENTS, FOLDERS,
  folderOf, cleanSubject, pickRecipients, mayRead, others, replyState, unreadFor,
};
