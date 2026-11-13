'use strict';
/*
 * Automatic lead follow-ups (owner, 2026-11-12: "I dont want them just drafted
 * in my email. they need to be sent out. the followups").
 *
 * For a lead the shop has answered (Contacted on the Leads page) that has not
 * written back and has no quote:
 *
 *   day 2 after our last word    follow-up 1: a text and an email
 *   3 days after follow-up 1     follow-up 2: "we'll close it for now"
 *   3 days after follow-up 2     let go, as "No reply after two follow-ups"
 *
 * Only while the next word is THEIRS. Their reply (a text back, or an email to
 * the lead's reply address) stops it: the shop owes them an answer, not a
 * nudge. When the shop answers again, the count starts over from that answer.
 * New leads nobody has answered are never written to automatically (owner's
 * choice: "No, I answer first"); the owner's 2h/24h reminder covers those.
 *
 * Old conversations are left alone: follow-up 1 only goes when our last word
 * was 2 to 14 days ago, so switching this on does not write to last month's
 * leads.
 */

const LEADMAIL = require('./lead-email');

const DAY = 86400000;
const FIRST_AFTER = 2 * DAY;
const SECOND_AFTER = 3 * DAY;
const LET_GO_AFTER = 3 * DAY;
const OLDEST = 14 * DAY;
const LET_GO_REASON = 'No reply after two follow-ups';

const ms = (d) => (d ? new Date(d).getTime() : 0);

/* The note kinds that are a conversation with the customer, either way. An
 * internal note (kind 'note') is not: a helper writing "left voicemail" did
 * not say anything to them. 'email_in' is their email reply (keepInboundEmail). */
const CONVERSATION_KINDS = ['call', 'email', 'text', 'chat', 'social', 'email_in'];

/* Text notes the SHOP wrote: from the lead's box or a follow-up ("You texted:"),
 * or the owner's reply relayed from her phone ("You replied:"). Every other text
 * note on a lead is the customer's own text. */
const SHOP_TEXT = /^You (texted|replied):/;

/** A note the customer wrote (their text back, or their email), as opposed to
 *  something the shop did or wrote down. */
function isInbound(note) {
  if (!note) return false;
  if (note.kind === 'email_in') return true;
  if (note.kind === 'text') return !SHOP_TEXT.test(String(note.body || ''));
  return false;
}

/** Can anything reach them: an email address or a US phone number. */
function reachable(l, normalizePhone) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(l.email || '').trim()) || !!normalizePhone(l.phone);
}

/**
 * What is due for one lead at `now`: 'first', 'second', 'let_go' or null.
 * `last` is the newest conversation note on the lead (CONVERSATION_KINDS, not
 * one of ours from this file): { kind, body, created_at } or null.
 * `anchor` in the answer is our last word, which the claim checks again.
 */
function decide(l, last, now, normalizePhone) {
  if (!l || l.lead_status !== 'contacted' || l.outcome || l.dismissed_at) return null;
  if (!reachable(l, normalizePhone)) return null;
  if (isInbound(last)) return null;   // they wrote last: our move, not a nudge
  const anchor = Math.max(ms(l.first_response_at), ms(last && last.created_at));
  if (!anchor) return null;
  const fu1 = ms(l.lead_fu1_at), fu2 = ms(l.lead_fu2_at);
  /* Someone wrote after our last follow-up (we answered again): a new round. */
  if (!fu1 || anchor > fu1) {
    const quiet = now - anchor;
    return quiet >= FIRST_AFTER && quiet <= OLDEST ? { step: 'first', anchor } : null;
  }
  if (!fu2) return now - fu1 >= SECOND_AFTER ? { step: 'second', anchor } : null;
  if (anchor > fu2) return null;
  return now - fu2 >= LET_GO_AFTER ? { step: 'let_go', anchor } : null;
}

/** The text as it goes out: the same wrapper as the lead's "Text them" box. */
const smsBody = LEADMAIL.textBody;

/** The text and the email for follow-up 1 or 2. */
function messages(step, l, { signer = 'June', shop = "June's Tees" } = {}) {
  const first = LEADMAIL.firstName(l && l.name);
  const hi = first ? `Hi ${first}` : 'Hi';
  if (step === 'first') {
    return {
      text: `${hi}, just following up on your request. Are you still looking to get this made? Reply here with any details and we'll put your quote together.`,
      email: LEADMAIL.followUp(l, { signer, shop }),
    };
  }
  return {
    text: `${hi}, we haven't heard back, so we'll close your request for now. If you still need it made, just reply here and we'll pick right back up.`,
    email: {
      subject: `Closing your request with ${shop}`,
      body: `${hi},

I haven't heard back, so I'll close your request for now. If you still need these made, just reply to this email and I'll pick right back up.

Thank you,
${signer}
${shop}`,
    },
  };
}

/** "Follow-up 1 sent Nov 14 · follow-up 2 Nov 17 if no reply", for the lead's
 *  card; '' when no round is under way. `last` is the newest conversation note,
 *  as decide() reads it: a reply from them pauses the round, and our own word
 *  after a follow-up starts a new one, so the old dates are not shown. */
function cardLine(l, last, fmt) {
  const fu1 = ms(l.lead_fu1_at), fu2 = ms(l.lead_fu2_at);
  if (!fu1 || l.lead_status !== 'contacted') return '';
  if (isInbound(last) && ms(last.created_at) > fu1) return 'They replied after the automatic follow-up · follow-ups paused';
  if (Math.max(ms(l.first_response_at), ms(last && last.created_at)) > fu1) return '';
  if (fu2) return `Follow-up 2 sent ${fmt(fu2)} · let go ${fmt(fu2 + LET_GO_AFTER)} if no reply`;
  return `Follow-up 1 sent ${fmt(fu1)} · follow-up 2 ${fmt(fu1 + SECOND_AFTER)} if no reply`;
}

module.exports = { CONVERSATION_KINDS, decide, isInbound, messages, smsBody, cardLine, LET_GO_REASON,
  FIRST_AFTER, SECOND_AFTER, LET_GO_AFTER, OLDEST };
