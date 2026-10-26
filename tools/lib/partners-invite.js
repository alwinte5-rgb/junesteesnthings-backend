'use strict';

/* The Business Partners invite (owner, 2026-10-18): past customers are NOT
   imported into the program, because most of them are not businesses. They
   are invited, by one email each, to join if they order for a business, team
   or organization, and told nothing changes if they do not.

   Sent by the same machinery as the reintroduction campaign (server.js
   sendCampaignEmails: campaign_emails once per address, campaign_runs as the
   owner's Start switch, the shared daily cap, sendEmail's marketing footer and
   one-click unsubscribe). Pure functions only, so the audience can be tested
   without Brevo or a database. */

const { escHtml: esc } = require('./html-escape');

const CAMPAIGN = 'partners-2026-10';
const SITE = 'https://www.jtees.net';
/* jtees.net only in anything a customer reads (owner rule); the page's Join
   button carries src=invite on to the sign-up. */
const LINK = `${SITE}/partners?src=invite`;

/** Everyone on the Brevo list with a usable address, minus addresses Brevo
 *  has blocked and anyone already in a business on the program. One per
 *  address. Opt-outs are applied again at send time by sendEmail. */
function audience(contacts, alreadyPartners) {
  const skip = alreadyPartners instanceof Set ? alreadyPartners : new Set();
  const seen = new Set();
  const out = [];
  for (const c of contacts || []) {
    const email = String((c && c.email) || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    if (c.emailBlacklisted || skip.has(email)) continue;
    seen.add(email);
    const a = c.attributes || {};
    out.push({ email, first: String(a.FIRSTNAME || '').trim().split(/\s+/)[0] || '' });
  }
  return out;
}

function inviteEmail({ first }) {
  const IMG = (p) => `${SITE}/assets/images/${p}`;
  const perk = (big, title, text) => `<tr><td style="padding:8px 12px 8px 0;vertical-align:top;width:92px">
      <div style="font-size:20px;font-weight:900;color:#1848B8;line-height:1.1">${big}</div></td>
    <td style="padding:8px 0;color:#374151;line-height:1.5"><b style="color:#0B1F4B">${title}</b><br>${text}</td></tr>`;
  return {
    subject: 'Order for a business? Join our free Business Partners Program',
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:18px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;
  font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#374151">
  <tr><td align="center" style="padding:22px 24px 6px"><a href="${SITE}"><img src="${IMG('brand/logo-current-900.png')}" alt="June's Tees &amp; Things"
    width="150" style="display:block;width:150px;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:10px 28px 0">
    <h1 style="color:#0B1F4B;font-size:23px;margin:8px 0 6px">Hi${first ? ' ' + esc(first) : ''}, it's June!</h1>
    <p style="line-height:1.6;margin:0 0 12px">If you order shirts, uniforms, signs or gifts for a business, a team, a church
      or any group, our new <b>Business Partners Program</b> is for you. It's free, it's for businesses of every size
      (one-person shops too), and joining takes a minute: your email and your business name. No documents.</p>
  </td></tr>
  <tr><td style="padding:4px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${perk('15% off', 'Your first business order', 'Code <b>MAIL15</b> on an order of $150 or more.')}
      ${perk('5% off', 'Every reorder', 'Code <b>REORDER5</b> whenever you order again.')}
      ${perk('60 days', 'Same price on reorders', 'Reorder the same job within 60 days of paying and keep the price you paid.')}
      ${perk('Team', 'Logins for your people', 'Add whoever orders for you, and see your past jobs in one place.')}
    </table>
  </td></tr>
  <tr><td align="center" style="padding:16px 24px 6px"><a href="${esc(LINK)}" style="display:inline-block;background:#1848B8;color:#fff;
    padding:13px 28px;border-radius:100px;text-decoration:none;font-weight:700;font-size:15px">Join free</a></td></tr>
  <tr><td style="padding:10px 28px 22px">
    <p style="line-height:1.6;margin:0;font-size:14px">Shopping for yourself? Nothing changes. Order the way you always have.
      Questions? Call or text me at <a href="tel:+17739004592" style="color:#1848B8">(773) 900-4592</a>.</p>
    <p style="line-height:1.6;margin:10px 0 0;font-size:14px">June<br>June's Tees &amp; Things</p>
  </td></tr>
</table>
</td></tr></table>`,
  };
}

module.exports = { CAMPAIGN, LINK, audience, inviteEmail };
