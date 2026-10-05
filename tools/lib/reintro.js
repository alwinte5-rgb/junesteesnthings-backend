'use strict';

/* The reintroduction campaign (owner, 2026-10-05): a hello to everyone who
   has given us their details, done the safe way.

   - A TEXT goes only to phones whose newest consent includes marketing
     (sms_consents, folded by foldSmsConsent). A number given for an order or
     a quote is consent to order updates, not to promotions, and a promotional
     text without written consent is a per-message fine.
   - Everyone else on the Brevo list gets an EMAIL inviting them to sign up
     for texts; signing up (ticking the marketing box) is what earns the 10%
     code. Offering a reward for consent is allowed; requiring consent to buy
     is not, and the consent wording already says it is not a condition of
     purchase.

   Pure functions only, so the audience rules can be tested without Brevo,
   Twilio or a database. */

const { plain } = require('./sms-templates');
const { normalizeUsPhone } = require('./sms-consent');

const CAMPAIGN = 'reintro-2026-10';
const SITE = 'https://www.jtees.net';
const SIGNUP_PATH = '/texts';
const PCT = 10;
const CODE_DAYS = 60;

/** The hello text, to people who agreed to promotional texts. */
function helloText({ first }) {
  const f = plain(first, 20).split(' ')[0];
  return {
    template: 'reintro',
    body: `June's Tees: Hi${f ? ' ' + f : ''}! Lots of new things at June's Tees: design your own online, local delivery, ` +
      `and faster turnaround on tees and hoodies. Come see what's new: ${SITE} Reply STOP to opt out.`,
  };
}

/** The confirmation that carries their code, sent once they have signed up.
 *  A first message after an opt-in has to say who it is from, how often we
 *  text, that rates may apply, and HELP and STOP (carrier rules). */
function codeText({ code }) {
  return {
    template: 'reintro-code',
    body: `June's Tees: You're in, thank you! Your ${PCT}% off code: ${plain(code, 20)}. ` +
      `Use it at https://design.jtees.net or mention it on your quote. Up to 4 msgs/mo, msg & data rates may apply. ` +
      `Reply HELP for help, STOP to opt out.`,
  };
}

/** Where a sign-up came from, for the campaign page's count. */
const SOURCES = { email: 'The hello email', shop: 'Shop sign (QR)', site: 'Website', sms: 'Texted JOIN' };
function cleanSource(s) { return Object.prototype.hasOwnProperty.call(SOURCES, s) ? s : 'site'; }

/** A fresh single-use code: TEXTS plus five characters nobody misreads. */
function newCode(rand = Math.random) {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = 'TEXTS';
  for (let i = 0; i < 5; i++) s += A[Math.floor(rand() * A.length)];
  return s;
}

/** The phones that may get a promotional text: newest consent includes marketing. */
function marketingPhones(consentRows, fold) {
  const by = new Map();
  for (const r of consentRows || []) {
    if (!by.has(r.phone)) by.set(r.phone, []);
    by.get(r.phone).push(r);
  }
  const out = new Set();
  for (const [phone, rows] of by) if (fold(rows).marketing) out.add(phone);
  return out;
}

/**
 * Who gets the email: every Brevo contact with a usable address who has not
 * blocked email, minus anyone the text already reaches (their phone has
 * marketing consent), one per address. Returns [{ email, first }].
 */
function emailAudience(contacts, textPhones) {
  const seen = new Set();
  const out = [];
  for (const c of contacts || []) {
    const email = String((c && c.email) || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    if (c.emailBlacklisted) continue;
    const a = c.attributes || {};
    const phone = normalizeUsPhone(a.SMS || a.PHONE || '');
    if (phone && textPhones.has(phone)) continue;
    seen.add(email);
    out.push({ email, first: String(a.FIRSTNAME || '').trim().split(/\s+/)[0] || '' });
  }
  return out;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The invitation email (owner, 2026-10-05): the shop's own photos, what
 *  the designer can do, links to the site, and the 10% for signing up for
 *  texts. Tables and inline styles, because email clients ignore most CSS;
 *  images are absolute https URLs on the site, each with alt text. */
const IMG = (p) => `${SITE}/assets/images/${p}`;
const DESIGN = 'https://design.jtees.net';
function helloEmail({ first, email }) {
  const link = `${SITE}${SIGNUP_PATH}?src=email&e=${encodeURIComponent(email)}`;
  const btn = (href, label, bg = '#1848B8') => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;
    padding:13px 26px;border-radius:100px;text-decoration:none;font-weight:700;font-size:15px">${label}</a>`;
  const photo = (p, alt) => `<td width="50%" style="padding:4px"><a href="${SITE}"><img src="${IMG(p)}" alt="${esc(alt)}" width="262"
    style="display:block;width:100%;max-width:262px;height:auto;border-radius:10px;border:0"></a></td>`;
  const feature = (icon, title, text) => `<tr><td style="padding:7px 10px 7px 0;vertical-align:top;font-size:20px">${icon}</td>
    <td style="padding:7px 0;color:#374151;line-height:1.5"><b style="color:#12203c">${title}</b><br>${text}</td></tr>`;
  return {
    subject: `It's been a while! See what's new at June's Tees (+${PCT}% off)`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:18px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;
  font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#374151">
  <tr><td align="center" style="padding:22px 24px 6px"><a href="${SITE}"><img src="${IMG('brand/logo.png')}" alt="June's Tees &amp; Things"
    width="150" style="display:block;width:150px;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:10px 28px 0">
    <h1 style="color:#1848B8;font-size:24px;margin:8px 0 6px">Hi${first ? ' ' + esc(first) : ''}, it's June!</h1>
    <p style="line-height:1.6;margin:0 0 12px">A lot has changed since we last worked together, and I wanted you to be among the
      first to know. You can now design your own custom tees, hoodies and more online, any time, from your phone or computer,
      and we still print every order right here in Chicago.</p>
  </td></tr>
  <tr><td style="padding:6px 24px"><a href="${DESIGN}"><img src="${IMG('work/design-studio-live.jpg')}"
    alt="The June's Tees Design Lab, designing a shirt online" width="512"
    style="display:block;width:100%;max-width:512px;height:auto;border-radius:12px;border:0"></a></td></tr>
  <tr><td style="padding:14px 28px 4px">
    <h2 style="font-size:18px;color:#12203c;margin:0 0 6px">What you can do in the Design Lab</h2>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${feature('⬆️', 'Upload your logo or photo', 'Bring your own artwork, or start from ours.')}
      ${feature('🔤', 'Hundreds of fonts and graphics', 'Add names, numbers, dates and designs in a few taps.')}
      ${feature('✨', 'AI design help', 'Describe your idea, like "a family reunion shirt with our last name and year", and get a starting point.')}
      ${feature('👕', 'See it on the shirt instantly', '45+ real garments: tees, hoodies, tanks, kids and more, in full color.')}
      ${feature('💲', 'Live pricing with volume discounts', 'No minimums. Order one piece or a whole team.')}
      ${feature('💾', 'Save your designs and track your order', 'Free account, so it is all there next time.')}
    </table>
    <p style="text-align:center;margin:16px 0 6px">${btn(DESIGN, 'Start designing')}</p>
  </td></tr>
  <tr><td style="padding:14px 24px 4px">
    <h2 style="font-size:18px;color:#12203c;margin:0 0 8px 4px">Still printing everything you love</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${photo('work/full-color-team-logo-print.jpg', 'Full-color team logo print')}${photo('work/company-zip-hoodies.jpg', 'Company zip hoodies')}</tr>
      <tr>${photo('work/embroidery-machine-polos.jpg', 'Embroidered polos')}${photo('work/screen-printing-press.jpg', 'Our screen printing press in Chicago')}</tr>
    </table>
    <p style="line-height:1.6;margin:10px 4px">Screen printing, embroidery and full-color prints for teams, schools, businesses,
      churches, birthdays and family reunions. Pick up at the shop in Lakeview, or we'll deliver locally.</p>
  </td></tr>
  <tr><td style="padding:10px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ed;border:1px solid #fde3c0;border-radius:12px">
      <tr><td style="padding:18px 20px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#12203c">Get ${PCT}% off your next order</div>
        <p style="line-height:1.6;margin:8px 0 14px">Sign up for our texts and your code is yours right away. That's where I share
          new products, seasonal deals and first dibs on specials.</p>
        ${btn(link, `Sign up and get ${PCT}% off`, '#F0275A')}
        <p style="font-size:12px;color:#6b7280;margin:12px 0 0">The code comes with signing up for our texts: up to 4 a month,
          message and data rates may apply, reply STOP any time. One code per person, good for ${CODE_DAYS} days.</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 28px 24px">
    <p style="line-height:1.6;margin:0 0 12px">Have something coming up? Just reply to this email or text (773) 849-1854.
      I'd love to make something with you again.</p>
    <p style="margin:0 0 14px">Thank you for being part of June's Tees,<br><b>June</b></p>
    <p style="text-align:center;margin:0">${btn(SITE, 'Visit jtees.net', '#12203c')}</p>
  </td></tr>
</table>
</td></tr></table>`,
  };
}

module.exports = { CAMPAIGN, SIGNUP_PATH, PCT, CODE_DAYS, SOURCES, cleanSource, helloText, codeText, newCode, marketingPhones, emailAudience, helloEmail };
