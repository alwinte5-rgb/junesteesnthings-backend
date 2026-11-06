'use strict';

/* ONE EMAIL A DAY TO THE SHOP (owner, 2026-10-19: "I am getting too many
 * individual company emails can you consolidate the message into one daily
 * message ... We used over 400 messages in 2 weeks").
 *
 * Every email addressed to the shop's own inbox (NOTIFICATION_EMAIL or
 * JT_SHOP_EMAIL) is kept in shop_digest_items instead of being sent, and the
 * hourly sweep sends them as one email per inbox each morning. A sender that
 * must not wait passes `urgent: true` to sendEmail (a failed payout: money
 * has stopped reaching the bank). Customers' and staff members' own emails
 * are never held.
 *
 * JT_SHOP_DIGEST=off sends every one straight away again, with no deploy. */

/* What one day's email may carry: a shop that piles up more than this has a
   loop somewhere, and one huge email would be clipped by Gmail anyway. */
const MAX_ITEMS = 60;
const MAX_ITEM_HTML = 20000;

function on(env = process.env) {
  return !/^(0|off|false|no)$/i.test(String(env.JT_SHOP_DIGEST || '').trim());
}

const norm = (v) => String(v || '').trim().toLowerCase();

/** Whether `to` is one of the shop's own inboxes. */
function isShopAddress(to, shopAddresses) {
  const t = norm(to);
  return !!t && shopAddresses.map(norm).filter(Boolean).includes(t);
}

/** The hour the day's email goes, shop time (the morning digest's hour). */
function dueHour(env = process.env) {
  const h = Number(env.JT_DIGEST_HOUR || 7);
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : 7;
}

/* A cut through the middle of a tag would break every item below it, so a
   long one is shown as its plain text instead. */
function cutShort(html) {
  const text = html.replace(/<[^>]*>/g, ' ').replace(/<[^>]*$/, '').replace(/\s+/g, ' ').trim();
  return `<p>${text.slice(0, MAX_ITEM_HTML)}</p><p><i>(cut short here)</i></p>`;
}

/* One event, one entry (dashboard plan Part 5, 2026-11-06). A customer who
   accepts and pays the deposit in the same visit set off two shop emails, the
   accept route's "✅ Quote X accepted" and the payment's "💳 Deposit paid —
   quote X". Both wait for this email, so here they become one entry: the
   payment's line, said as "accepted and paid", with both bodies under it. */
const CODE = '([A-Z0-9]{6}|[A-Z0-9]{10})';
/* The server's own subjects (server.js: the accept route, bankStripeSession,
   landStripePaymentOnQuote). tests/fewer-repeats.test.js renders the real
   templates through these, so a reworded subject fails a test rather than
   quietly sending two entries again. */
const ACCEPTED_RE = new RegExp(`^✅ Quote ${CODE} accepted\\b(.*)$`);
const PAID_RE = new RegExp(`^💳 (Deposit paid|Balance paid|Paid in Stripe) — quote ${CODE}\\b(.*)$`);

/** What a held subject announces: { kind: 'accepted' | 'paid', code, label, rest } or null. */
function eventOf(item) {
  const subject = String((item && item.subject) || '');
  let m = ACCEPTED_RE.exec(subject);
  if (m) return { kind: 'accepted', code: m[1], rest: m[2] };
  m = PAID_RE.exec(subject);
  return m ? { kind: 'paid', code: m[2], label: m[1], rest: m[3] } : null;
}

/** The held items with each quote's "accepted" folded into its first payment
 *  of the same batch. Order is kept (the merged entry sits where the payment
 *  was); every other item is left exactly as it was. A merged entry keeps
 *  both bodies apart in `parts`, so each is shown (or cut short) on its own. */
function mergeRepeats(items) {
  const list = Array.isArray(items) ? items : [];
  const events = list.map(eventOf);
  const firstPaid = new Map();
  events.forEach((e, i) => { if (e && e.kind === 'paid' && !firstPaid.has(e.code)) firstPaid.set(e.code, i); });
  const acceptOf = new Map();                 // payment index -> accept index
  events.forEach((e, i) => {
    if (e && e.kind === 'accepted' && firstPaid.has(e.code) && !acceptOf.has(firstPaid.get(e.code))) {
      acceptOf.set(firstPaid.get(e.code), i);
    }
  });
  if (!acceptOf.size) return list.slice();
  const folded = new Set(acceptOf.values());
  const out = [];
  list.forEach((it, i) => {
    if (folded.has(i)) return;
    if (!acceptOf.has(i)) { out.push(it); return; }
    const acc = list[acceptOf.get(i)];
    const a = events[acceptOf.get(i)], p = events[i];
    /* Who and how much from the accept, and what was paid from the payment:
       "accepted — Ada $200.00 · Deposit paid, $103.00", never "paid" alone,
       which reads as paid in full. */
    out.push(Object.assign({}, it, {
      subject: `✅💳 Quote ${p.code} accepted${a.rest} · ${p.label}${p.rest}`,
      html: undefined,
      parts: [String(acc.html || ''), String(it.html || '')],
      reply_to: it.reply_to || acc.reply_to || null,
    }));
  });
  return out;
}

/**
 * The day's email from the held items, oldest first.
 * @param items [{ subject, html, reply_to, created_at }]
 * @param esc   the HTML escaper
 * @param when  formats a timestamp in shop time
 * @returns { subject, html }
 */
function build(held, { esc, when }) {
  const items = mergeRepeats(held);
  const shown = items.slice(0, MAX_ITEMS);
  const more = items.length - shown.length;
  const list = shown.map((it, n) => `
    <li style="margin:2px 0"><a href="#item-${n}" style="color:#1848B8">${esc(it.subject || '(no subject)')}</a>
      <span style="color:#6b7280;font-size:12px">${esc(when(it.created_at))}</span></li>`).join('');
  const bodies = shown.map((it, n) => {
    const show = (b) => (b.length > MAX_ITEM_HTML ? cutShort(b) : b);
    const body = Array.isArray(it.parts)
      ? it.parts.map((b) => show(String(b || ''))).join('<hr style="border:0;border-top:1px dashed #e3e8f2;margin:12px 0">')
      : show(String(it.html || ''));
    return `
    <div id="item-${n}" style="border-top:1px solid #e3e8f2;margin-top:18px;padding-top:12px">
      <div style="font-weight:700;color:#0B1F4B">${esc(it.subject || '(no subject)')}</div>
      <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${esc(when(it.created_at))}${
        it.reply_to ? ` &middot; reply to <a href="mailto:${esc(it.reply_to)}">${esc(it.reply_to)}</a>` : ''}</div>
      ${body}
    </div>`;
  }).join('');
  return {
    count: items.length,
    subject: `June's Tees daily summary: ${items.length} update${items.length === 1 ? '' : 's'}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:640px;color:#111827">
      <h2 style="color:#1848B8;margin:0 0 6px">Everything from the last day, in one email</h2>
      <p style="color:#6b7280;margin:0 0 10px">These used to arrive one email each.</p>
      <ol style="padding-left:20px;margin:0">${list}</ol>
      ${more > 0 ? `<p style="color:#b45309">And ${more} more, not shown. Something is sending far more than usual.</p>` : ''}
      ${bodies}
    </div>`,
  };
}

module.exports = { MAX_ITEMS, MAX_ITEM_HTML, on, isShopAddress, dueHour, build, mergeRepeats, eventOf };
