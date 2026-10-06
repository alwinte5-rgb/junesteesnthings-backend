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

const { plain, short } = require('./sms-templates');
const { normalizeUsPhone } = require('./sms-consent');

const CAMPAIGN = 'reintro-2026-10';
const SITE = 'https://www.jtees.net';
const SIGNUP_PATH = '/texts';
const PCT = 10;
const DESIGN = 'https://design.jtees.net';
const CODE_DAYS = 60;

/** The hello text, to people who agreed to promotional texts. */
function helloText({ first }) {
  const f = plain(first, 20).split(' ')[0];
  return {
    template: 'reintro',
    /* What is actually new (owner, 2026-10-05): designing your own online and
       choosing the garment. No delivery or turnaround promises until those
       are ready. */
    body: `June's Tees: Hi${f ? ' ' + f : ''}! New at June's Tees: design your own shirts online. Pick from 45+ garments ` +
      `(tees, hoodies, tanks, kids, hats), add your logo or text, and see the price live. Try it: ${short(DESIGN)} Reply STOP to opt out.`,
  };
}

/** The confirmation that carries their code, sent once they have signed up.
 *  A first message after an opt-in has to say who it is from, how often we
 *  text, that rates may apply, and HELP and STOP (carrier rules). */
function codeText({ code }) {
  return {
    template: 'reintro-code',
    body: `June's Tees: You're in, thank you! Your ${PCT}% off code: ${plain(code, 20)}. ` +
      `Use it at design.jtees.net or mention it on your quote. Up to 4 msgs/mo, msg & data rates may apply. ` +
      `Reply HELP for help, STOP to opt out.`,
  };
}

/** Where a sign-up came from, for the campaign page's count. */
const SOURCES = { email: 'The hello email', receipt: 'Other emails (quotes, orders)', shop: 'Shop sign (QR)', site: 'Website', sms: 'Texted JOIN' };
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
function helloEmail({ first, email }) {
  const link = `${SITE}${SIGNUP_PATH}?src=email&e=${encodeURIComponent(email)}`;
  const btn = (href, label, bg = '#0B1F4B') => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;
    padding:13px 26px;border-radius:100px;text-decoration:none;font-weight:700;font-size:15px">${label}</a>`;
  const photo = (p, alt) => `<td width="50%" style="padding:4px"><a href="${SITE}"><img src="${IMG(p)}" alt="${esc(alt)}" width="262"
    style="display:block;width:100%;max-width:262px;height:auto;border-radius:10px;border:0"></a></td>`;
  const garment = (img, label, cat) => `<td width="33%" align="center" style="padding:4px;vertical-align:top">
    <a href="${DESIGN}/products.php?category_id=${cat}" style="text-decoration:none;color:#0B1F4B">
    <img src="${IMG('shop/' + img + '.jpg')}" alt="Custom ${label.replace('&amp;', '&')}" width="164"
      style="display:block;width:100%;max-width:164px;height:auto;border-radius:10px;border:0;margin:0 auto">
    <div style="font-weight:700;font-size:13.5px;margin-top:4px">${label}</div></a></td>`;
  const feature = (icon, title, text) => `<tr><td style="padding:7px 10px 7px 0;vertical-align:top;font-size:20px">${icon}</td>
    <td style="padding:7px 0;color:#374151;line-height:1.5"><b style="color:#0B1F4B">${title}</b><br>${text}</td></tr>`;
  return {
    subject: `New: design your own at June's Tees (+${PCT}% off)`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:18px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:14px;
  font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#374151">
  <tr><td align="center" style="padding:22px 24px 6px"><a href="${SITE}"><img src="${IMG('brand/logo.png')}" alt="June's Tees &amp; Things"
    width="150" style="display:block;width:150px;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:10px 28px 0">
    <h1 style="color:#0B1F4B;font-size:24px;margin:8px 0 6px">Hi${first ? ' ' + esc(first) : ''}, it's June!</h1>
    <p style="line-height:1.6;margin:0 0 12px">It's been a while, and I have something new I couldn't wait to share:
      you can now <b>design your own</b> custom apparel online at the June's Tees Design Lab. Pick the exact garment you want,
      make it yours, and see the price before you order. Any time, from your phone or computer. We still print every
      order right here in Chicago.</p>
  </td></tr>
  <tr><td style="padding:6px 24px"><a href="${DESIGN}"><img src="${IMG('work/design-studio-live.jpg')}"
    alt="The June's Tees Design Lab, designing a shirt online" width="512"
    style="display:block;width:100%;max-width:512px;height:auto;border-radius:12px;border:0"></a></td></tr>
  <tr><td style="padding:14px 24px 4px">
    <h2 style="font-size:18px;color:#0B1F4B;margin:0 0 4px 4px">New: choose your garment</h2>
    <p style="line-height:1.6;margin:0 4px 8px">Start with the piece you want: 45+ real garments in your choice of color and size.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${garment('ssa-33929_f_fm', 'T-shirts', 52)}${garment('ssa-107784_f_fm', 'Hoodies', 53)}${garment('ssa-18365_f_fm', 'Tank tops', 54)}</tr>
      <tr>${garment('ssa-113683_f_fm', 'Kids &amp; youth', 55)}${garment('ssa-36262_f_fm', 'Baby', 56)}${garment('ssa-97052_f_fm', 'Hats', 57)}</tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 28px 4px">
    <h2 style="font-size:18px;color:#0B1F4B;margin:0 0 6px">New: design it your way</h2>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${feature('⬆️', 'Upload your logo or photo', 'Bring your own artwork, or start from ours.')}
      ${feature('🔤', 'Hundreds of fonts and graphics', 'Add names, numbers, dates and designs in a few taps.')}
      ${feature('✨', 'AI design help', 'Describe your idea, like "a family reunion shirt with our last name and year", and get a starting point.')}
      ${feature('👕', 'See it on the garment instantly', 'Your design on the exact piece and color you picked, in full color.')}
      ${feature('💲', 'Live pricing with volume discounts', 'No minimums. Order one piece or a whole team.')}
      ${feature('💾', 'Save your designs and track your order', 'Free account, so it is all there next time.')}
    </table>
    <p style="text-align:center;margin:16px 0 6px">${btn(DESIGN, 'Start designing')}</p>
  </td></tr>
  <tr><td style="padding:14px 24px 4px">
    <h2 style="font-size:18px;color:#0B1F4B;margin:0 0 8px 4px">Still printing everything you love</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${photo('work/full-color-team-logo-print.jpg', 'Full-color team logo print')}${photo('work/company-zip-hoodies.jpg', 'Company zip hoodies')}</tr>
      <tr>${photo('work/embroidery-machine-polos.jpg', 'Embroidered polos')}${photo('work/screen-printing-press.jpg', 'Our screen printing press in Chicago')}</tr>
    </table>
    <p style="line-height:1.6;margin:10px 4px">Screen printing, embroidery and full-color prints for teams, schools, businesses,
      churches, birthdays and family reunions. Pick up at the shop in Lakeview.</p>
  </td></tr>
  <tr><td style="padding:10px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8ed;border:1px solid #fde3c0;border-radius:12px">
      <tr><td style="padding:18px 20px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#0B1F4B">Get ${PCT}% off your next order</div>
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
    <p style="text-align:center;margin:0">${btn(SITE, 'Visit jtees.net', '#0B1F4B')}</p>
  </td></tr>
</table>
</td></tr></table>`,
  };
}

/** The small sign-up box added to every customer email until the new year
 *  (withTextsInvite in server.js). */
function inviteBlock(email) {
  const link = `${SITE}${SIGNUP_PATH}?src=receipt&e=${encodeURIComponent(email)}`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:18px auto 0">
  <tr><td style="background:#fff8ed;border:1px solid #fde3c0;border-radius:12px;padding:14px 16px;font-family:system-ui,sans-serif;
    color:#374151;text-align:center">
    <div style="font-weight:800;font-size:16px;color:#0B1F4B">Get ${PCT}% off your next order</div>
    <div style="font-size:13.5px;line-height:1.5;margin:4px 0 10px">Join our texts for new products, seasonal deals and first dibs on specials.</div>
    <a href="${esc(link)}" style="display:inline-block;background:#F0275A;color:#fff;padding:10px 22px;border-radius:100px;
      text-decoration:none;font-weight:700;font-size:14px">Sign up and get ${PCT}% off</a>
    <div style="font-size:11px;color:#6b7280;margin-top:8px">Up to 4 texts a month, msg &amp; data rates may apply, reply STOP any time.</div>
  </td></tr></table>`;
}

module.exports = { inviteBlock, CAMPAIGN, SIGNUP_PATH, PCT, CODE_DAYS, SOURCES, cleanSource, helloText, codeText, newCode, marketingPhones, emailAudience, helloEmail };
