'use strict';

/* Replying to a customer by replying to the forwarded text (owner, 2026-10-06).
 *
 * Every customer text is forwarded to the owner's phone from the shop number.
 * When the owner replies to it, the reply arrives at the shop number from the
 * owner's phone; this decides which customer it was meant for:
 *   - a reply that starts with a job code (AB12CD...) or a lead code (L7) goes
 *     to that customer;
 *   - otherwise it goes to the customer whose text was forwarded last, within
 *     a day, unless two different customers were forwarded within ten minutes
 *     of each other at the end - then nobody is guessed at, and the owner is
 *     asked to start with the code.
 * Pure functions; the server reads the forwards and does the sending. */

const WINDOW_MS = 24 * 60 * 60 * 1000;
const CLASH_MS = 10 * 60 * 1000;

/** The code a forwarded text carries for this customer. */
function codeOf(f) {
  return f.quote_code ? String(f.quote_code) : f.lead_id ? 'L' + Number(f.lead_id) : '';
}

/** {code, body}: a leading job or lead code, and the words after it. */
function parseReply(text, codeRe) {
  const t = String(text || '').trim();
  const m = /^([A-Za-z0-9]{6}|[A-Za-z0-9]{10}|[Ll]\d{1,9})\b[\s:,.-]*([\s\S]*)$/.exec(t);
  if (m) {
    const c = m[1].toUpperCase();
    if (/^L\d+$/.test(c) || codeRe.test(c)) return { code: c, body: m[2].trim() };
  }
  return { code: '', body: t };
}

/**
 * Who the owner's reply goes to, and what it says. `forwards` are forwards
 * from the last month, newest first: [{phone, quote_code, lead_id, name,
 * created_at}]. A leading word counts as a code only when it is the code of
 * one of those customers (job codes can be all letters, so "Thanks" must
 * stay a word). Returns { to, body } | { ask: [forward, ...] } | { none: true }.
 */
function pickTarget(forwards, text, codeRe, now = Date.now()) {
  const all = forwards || [];
  const { code, body } = parseReply(text, codeRe);
  if (code) {
    const hit = all.find((f) => codeOf(f) === code);
    if (hit) return { to: hit, body };
  }
  const whole = String(text || '').trim();
  const recent = all.filter((f) => now - new Date(f.created_at).getTime() <= WINDOW_MS);
  if (!recent.length) return { none: true };
  const latest = recent[0];
  const clash = [];
  const seen = new Set();
  for (const f of recent) {
    if (new Date(latest.created_at).getTime() - new Date(f.created_at).getTime() > CLASH_MS) break;
    if (seen.has(f.phone)) continue;
    seen.add(f.phone);
    clash.push(f);
  }
  return clash.length > 1 ? { ask: clash.slice(0, 4) } : { to: latest, body: whole };
}

/** The owner's prompt when the reply could go to more than one customer. */
function askText(list) {
  return `Not sent: ${list.length} customers texted just now. Start your reply with their code: ` +
    list.map((f) => `${codeOf(f)} for ${f.name || 'the ' + String(f.phone).slice(-4) + ' number'}`).join(', ') + '.';
}

module.exports = { WINDOW_MS, CLASH_MS, codeOf, parseReply, pickTarget, askText };
