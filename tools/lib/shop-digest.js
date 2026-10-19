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

/**
 * The day's email from the held items, oldest first.
 * @param items [{ subject, html, reply_to, created_at }]
 * @param esc   the HTML escaper
 * @param when  formats a timestamp in shop time
 * @returns { subject, html }
 */
function build(items, { esc, when }) {
  const shown = items.slice(0, MAX_ITEMS);
  const more = items.length - shown.length;
  const list = shown.map((it, n) => `
    <li style="margin:2px 0"><a href="#item-${n}" style="color:#1848B8">${esc(it.subject || '(no subject)')}</a>
      <span style="color:#6b7280;font-size:12px">${esc(when(it.created_at))}</span></li>`).join('');
  const bodies = shown.map((it, n) => {
    const body = String(it.html || '');
    return `
    <div id="item-${n}" style="border-top:1px solid #e3e8f2;margin-top:18px;padding-top:12px">
      <div style="font-weight:700;color:#0B1F4B">${esc(it.subject || '(no subject)')}</div>
      <div style="color:#6b7280;font-size:12px;margin-bottom:8px">${esc(when(it.created_at))}${
        it.reply_to ? ` &middot; reply to <a href="mailto:${esc(it.reply_to)}">${esc(it.reply_to)}</a>` : ''}</div>
      ${body.length > MAX_ITEM_HTML ? cutShort(body) : body}
    </div>`;
  }).join('');
  return {
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

module.exports = { MAX_ITEMS, MAX_ITEM_HTML, on, isShopAddress, dueHour, build };
