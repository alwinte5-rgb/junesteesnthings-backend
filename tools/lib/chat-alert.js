'use strict';

/* Tell the owner a chat has started.

   The tawk.to webhook used to do one thing with a chat: copy the visitor's email
   into Brevo. Nothing told a person that someone was waiting, so a chat was only
   seen if the tawk app happened to push it — and when it didn't, nobody knew.
   This is the second route to the owner, independent of tawk's own settings:
   an email always, and a text when Twilio is configured.

   Pure formatting here; server.js does the sending. */

function clip(s, n) {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// Returns null for events that should not alert (e.g. chat:end).
function describeTawkEvent(body) {
  const b = body || {};
  const event = String(b.event || '');
  if (event !== 'chat:start' && event !== 'ticket:create') return null;

  const who = b.visitor || b.requester || {};
  const name = clip(who.name, 60) || 'A visitor';
  const email = clip(who.email, 120);
  const where = [who.city, who.country].filter(Boolean).map(x => clip(x, 40)).join(', ');
  const isTicket = event === 'ticket:create';
  const text = isTicket
    ? clip([b.ticket && b.ticket.subject, b.ticket && b.ticket.message].filter(Boolean).join(' — '), 500)
    : clip(b.message && b.message.text, 500);

  const kind = isTicket ? 'offline message' : 'chat';
  const subject = `New ${kind} from ${name}${text ? `: ${clip(text, 60)}` : ''}`;
  const sms = clip(
    `June's Tees: new ${kind} from ${name}${email ? ` (${email})` : ''}${text ? ` — "${clip(text, 90)}"` : ''}. Reply in the tawk app.`,
    300,
  );
  return { event, kind, name, email, where, text, subject, sms, chatId: b.chatId || null };
}

/* The enquiry a tawk.to event carries, or null.

   Only the ones that can be answered become leads: a chat that came with an
   email (tawk's pre-chat form), and every offline message, which tawk always
   collects an email for. An anonymous chat can only be answered inside tawk,
   so it stays an alert rather than a card on the board nobody can act on.

   Keyed on the chat or ticket id, so a repeated event is the same lead. */
const ANON_NAME = /^V\d{8,}$/;   // tawk's placeholder for a visitor who gave no name
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function tawkLead(body) {
  const b = body || {};
  const event = String(b.event || '');
  if (event === 'chat:start') {
    const v = b.visitor || {};
    const email = clip(v.email, 254).toLowerCase();
    const chatId = clip(b.chatId, 120);
    if (!looksLikeEmail(email) || !chatId) return null;
    const name = clip(v.name, 120);
    return { source: 'chat', ref: `tawk:chat:${chatId}`, chatRef: chatId,
             name: name && !ANON_NAME.test(name) ? name : 'Chat visitor', email,
             description: clip(b.message && b.message.text, 1500) };
  }
  if (event === 'ticket:create') {
    const r = b.requester || {};
    const t = b.ticket || {};
    const email = clip(r.email, 254).toLowerCase();
    const id = clip(t.id || t.humanId, 120);
    if (!looksLikeEmail(email) || !id) return null;
    const name = clip(r.name, 120);
    return { source: 'offline', ref: `tawk:ticket:${id}`, chatRef: clip(t.humanId || t.id, 120),
             name: name && !ANON_NAME.test(name) ? name : 'Chat visitor', email,
             description: clip([t.subject, t.message].filter(Boolean).join(' — '), 1500) };
  }
  return null;
}

// E.164 check so a malformed env var fails loudly at send time, not silently.
function isE164(n) {
  return /^\+[1-9]\d{7,14}$/.test(String(n || ''));
}

module.exports = { describeTawkEvent, tawkLead, isE164 };
