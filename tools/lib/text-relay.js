'use strict';

/* Replying to a customer by replying to the forwarded text (owner, 2026-10-06).
 *
 * Every customer text is forwarded to the owner's phone from the shop number.
 * When the owner replies to it, the reply arrives at the shop number from the
 * owner's phone; this decides which customer it was meant for:
 *   - a reply that starts with a phone number (773 555 0199, To: (773) 555-0199)
 *     goes to that number, customer or not (owner, 2026-11-17: texts went to
 *     the last texter although a number was given). A number with a digit
 *     missing is refused, never guessed at;
 *   - a reply that starts with a job code (AB12CD...) or a lead code (L7) goes
 *     to that customer;
 *   - a text that is only a link (a phone sends a link as a text of its
 *     own, beside the words) is never guessed at: it goes to whoever the
 *     owner's previous text went to, if that was within FOLLOW_MS, or is refused
 *     (owner, 2026-11-19: the link bubbles beside "Text <number> ..." went to
 *     the last texter, a different customer);
 *   - otherwise it goes to the customer whose text was forwarded last, within
 *     a day, unless two different customers were forwarded within ten minutes
 *     of each other at the end - then nobody is guessed at, and the owner is
 *     asked to start with the code.
 * Pure functions; the server reads the forwards and does the sending. */

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CLASH_MS = 10 * 60 * 1000;
/* How long a link on its own follows the owner's previous text. */
const FOLLOW_MS = 2 * 60 * 1000;

/** Is this text nothing but one or more links: http(s)://..., www...., or a
 *  domain with a path (jtees.net/shop)? "ok.thanks" and "St.Louis" are words. */
function isLinkOnly(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return t.split(/\s+/).every((w) => /^(?:https?:\/\/\S+|www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+\S*|(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*)$/i.test(w));
}

/** The code a forwarded text carries for this customer. */
function codeOf(f) {
  return f.quote_code ? String(f.quote_code) : f.lead_id ? 'L' + Number(f.lead_id) : '';
}

/** {code, body}: a leading job or lead code, and the words after it. */
function parseReply(text, codeRe) {
  const t = String(text || '').trim();
  /* A studio order: STUDIO-12. Before the job codes, or "STUDIO" alone reads as
     a six-letter one and the reply goes to the last texter. */
  const st = /^(studio-[1-9]\d{0,8})\b[\s:,.-]*([\s\S]*)$/i.exec(t);
  if (st) return { code: st[1].toUpperCase(), body: st[2].trim() };
  const m = /^([A-Za-z0-9]{6}|[A-Za-z0-9]{10}|[Ll]\d{1,9})\b[\s:,.-]*([\s\S]*)$/.exec(t);
  if (m) {
    const c = m[1].toUpperCase();
    if (/^L\d+$/.test(c) || codeRe.test(c)) return { code: c, body: m[2].trim() };
  }
  return { code: '', body: t };
}

/** A leading US phone number, optionally after "to" or "text":
 *  { phone: '+1XXXXXXXXXX', body } | { bad: true } for something that starts
 *  like a number but is not a whole one | null when the text does not start
 *  with a number ("100 shirts are ready" is a message). */
function parseNumber(text) {
  const t = String(text || '').trim();
  const lead = /^(?:(?:to|text)\b[\s:,-]*)?/i.exec(t)[0];
  const rest = t.slice(lead.length);
  const run = /^[+(]?\d[\d\s().+-]*/.exec(rest);
  if (!run) return null;
  const m = /^(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?!\d)[\s:,.-]*([\s\S]*)$/.exec(rest);
  if (!m) {
    /* Shaped like a phone number with a digit short or extra (312 555 012):
       refused, never sent to the last texter. Counts, prices and dates are
       not that shape ("450.00 - 50.00 deposit", "2026-11-20 works") and stay
       messages. */
    const nearMiss = /^(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2,5}$/.test(run[0].trim());
    return nearMiss ? { bad: true } : null;
  }
  return { phone: '+1' + m[1] + m[2] + m[3], body: m[4].trim() };
}

const last10 = (p) => String(p || '').replace(/\D/g, '').slice(-10);

/**
 * Who the owner's reply goes to, and what it says. `forwards` are forwards
 * from the last month, newest first: [{phone, quote_code, lead_id, name,
 * created_at}]. A leading word counts as a code only when it is the code of
 * one of those customers (job codes can be all letters, so "Thanks" must
 * stay a word). A leading phone number wins over everything: it goes to
 * that number, with the customer's forward when they have one, else
 * { phone } alone (typed: true).
 * `previous` is the owner's previous text passed on (not a followed link):
 * { phone, quote_code, at } or null.
 * Returns { studio, body } | { to, body, byNumber?, typed?, followed? } | { badNumber: true } | { linkOnly: true }
 *   | { ask: [forward, ...] } | { none: true }.
 */
function pickTarget(forwards, text, codeRe, now = Date.now(), previous = null) {
  const all = forwards || [];
  const num = parseNumber(text);
  if (num && num.bad) return { badNumber: true };
  if (num) {
    const known = all.find((f) => last10(f.phone) === last10(num.phone));
    /* byNumber: the server checks every typed number (not the shop, not the
       owner, not premium), known or not. typed: nobody on file yet. */
    return { to: known || { phone: num.phone, quote_code: null, lead_id: null, name: '' }, body: num.body, byNumber: true, typed: !known };
  }
  const { code, body } = parseReply(text, codeRe);
  if (code) {
    const hit = all.find((f) => codeOf(f) === code);
    if (hit) return { to: hit, body };
    /* A studio order is never an ordinary word: the server finds its buyer, or
       says there is none. Nobody is guessed at. */
    if (/^STUDIO-/.test(code)) return { studio: code, body };
  }
  const whole = String(text || '').trim();
  if (isLinkOnly(whole)) {
    const at = previous ? new Date(previous.at).getTime() : NaN;
    if (!(now - at <= FOLLOW_MS && now >= at - 5000)) return { linkOnly: true };
    /* The same person and the same job as the words it came with. */
    const known = all.find((f) => last10(f.phone) === last10(previous.phone));
    const code = previous.quote_code || null;
    const to = { phone: previous.phone, quote_code: code, lead_id: code ? null : (known && known.lead_id) || null,
      name: (known && known.name) || '' };
    return { to, body: whole, byNumber: true, followed: true, typed: !to.quote_code && !to.lead_id };
  }
  const recent = all.filter((f) => now - new Date(f.created_at).getTime() <= WINDOW_MS);
  if (!recent.length) return { none: true };
  const latest = recent[0];
  const clash = [];
  const seen = new Set();
  for (const f of recent) {
    if (new Date(latest.created_at).getTime() - new Date(f.created_at).getTime() > CLASH_MS) break;
    /* One person once: texts by phone (two phones on one job are still two
       people to ask about), chats by their lead; a chat and a text on the
       same lead are the chat visitor who then texted, one person. */
    const c = codeOf(f);
    if (seen.has(personKey(f)) || (c && seen.has((isChat(f) ? 'text:' : 'chat:') + c))) continue;
    seen.add(personKey(f));
    if (c) seen.add((isChat(f) ? 'chat:' : 'text:') + c);
    clash.push(f);
  }
  return clash.length > 1 ? { ask: clash.slice(0, 4) } : { to: latest, body: whole };
}

/** Who a forward is from. One with no phone (isChat: a website chat, or a
 *  lead named in a "still waiting" text) is answered through its lead, by
 *  email and text; it is told apart by its lead, so two at once are two
 *  people, not one. */
function isChat(f) {
  return !!f && !String(f.phone || '').trim();
}
function personKey(f) {
  return isChat(f) ? 'chat:' + (codeOf(f) || f.id) : f.phone;
}

/* A US number as she would type it ("323 657 5782"): a caller with no job
   or lead has no code, and a reply starting with their number reaches them. */
function spoken(phone) {
  const d = String(phone || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : 'their number';
}

/** The owner's prompt when the reply could go to more than one customer. */
function askText(list) {
  return `Not sent: ${list.length} customers wrote just now. Start your reply with their code: ` +
    list.map((f) => !isChat(f) ? `${codeOf(f) || spoken(f.phone)} for ${f.name || 'the ' + String(f.phone).slice(-4) + ' number'}`
      : codeOf(f) ? `${codeOf(f)} for ${f.name || 'the website chat'}${f.chat ? ' (website chat)' : ''}`
      : `not ${f.name || 'the website chat'} (answer that chat in the tawk app)`).join(', ') + '.';
}

module.exports = { WINDOW_MS, CLASH_MS, FOLLOW_MS, codeOf, isChat, parseReply, parseNumber, isLinkOnly, pickTarget, askText };
