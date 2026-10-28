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
       choosing the garment. Turnaround (owner, 2026-10-28): small orders
       5–7 business days, rush for a fee, Christmas orders by Nov 24. */
    body: `June's Tees: Hi${f ? ' ' + f : ''}! Christmas shirts? Order by Nov 24. Small orders are ready in 5-7 business days ` +
      `(rush available). New: design your own online, 190+ products, live prices: ${short(SITE)} Reply STOP to opt out.`,
  };
}

/** The confirmation that carries their code, sent once they have signed up.
 *  A first message after an opt-in has to say who it is from, how often we
 *  text, that rates may apply, and HELP and STOP (carrier rules). */
function codeText({ code }) {
  return {
    template: 'reintro-code',
    body: `June's Tees: You're in, thank you! Your ${PCT}% off code: ${plain(code, 20)}. ` +
      `Use it at jtees.net or mention it on your quote. Up to 4 msgs/mo, msg & data rates may apply. ` +
      `Reply HELP for help, STOP to opt out.`,
  };
}

/** The ask (owner, 2026-10-28): one plain text to every number on file that
 *  has not signed up for deals, asking whether they want them. It sells
 *  nothing (no offer, no prices); replying JOIN signs them up (joinByText in
 *  server.js), and only then do they get the hello text. */
function askText() {
  return {
    template: 'reintro-ask',
    body: `June's Tees: Hi from June's Tees in Lakeview! Would you like our Christmas order dates and deals by text ` +
      `(up to 4/mo)? Reply JOIN to sign up. Msg & data rates may apply. Reply STOP to opt out.`,
  };
}

const STOP_SOURCES = ['sms-reply:stop', 'twilio:21610'];

/**
 * Who gets the ask: every phone on file (consent rows, oldest first, and
 * numbers from quotes), minus anyone whose consent already includes deals
 * and anyone whose newest consent row is a STOP. Phones are normalized US
 * numbers; one each, in the order first seen.
 */
function askAudience(consentRows, otherPhones, fold) {
  const by = new Map();
  for (const r of consentRows || []) {
    if (!r.phone) continue;
    if (!by.has(r.phone)) by.set(r.phone, []);
    by.get(r.phone).push(r);
  }
  const out = [];
  const seen = new Set();
  for (const phone of [...by.keys(), ...(otherPhones || [])]) {
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    const rows = by.get(phone) || [];
    if (rows.length && STOP_SOURCES.includes(rows[rows.length - 1].source)) continue;
    if (fold(rows).marketing) continue;
    out.push(phone);
  }
  return out;
}

/** Where a sign-up came from, for the campaign page's count. */
const SOURCES = { email: 'The hello email', receipt: 'Other emails (quotes, orders)', shop: 'Shop sign (QR)', site: 'Website', popup: 'Website popup', sms: 'Texted JOIN' };
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

const { escHtml: esc } = require('./html-escape');

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
    <img src="${IMG('email/' + img + '.jpg')}" alt="Custom ${label.replace('&amp;', '&')}, your design here" width="164"
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
  <tr><td align="center" style="padding:22px 24px 6px"><a href="${SITE}"><img src="${IMG('brand/logo-current-900.png')}" alt="June's Tees &amp; Things"
    width="150" style="display:block;width:150px;height:auto;border:0"></a></td></tr>
  <tr><td style="padding:10px 28px 0">
    <h1 style="color:#0B1F4B;font-size:24px;margin:8px 0 6px">Hi${first ? ' ' + esc(first) : ''}, it's June!</h1>
    <p style="line-height:1.6;margin:0 0 12px">It's been a while, and I have something new I couldn't wait to share:
      you can now <b>design your own</b> custom apparel online at the June's Tees Design Lab. Pick the exact garment you want,
      make it yours, and see the price before you order. Any time, from your phone or computer. We still print every
      order right here in Chicago.</p>
  </td></tr>
  <tr><td style="padding:6px 24px"><a href="${SITE}"><img src="${IMG('work/design-studio-live.jpg')}"
    alt="The June's Tees Design Lab, designing a shirt online" width="512"
    style="display:block;width:100%;max-width:512px;height:auto;border-radius:12px;border:0"></a></td></tr>
  <tr><td style="padding:14px 24px 4px">
    <h2 style="font-size:18px;color:#0B1F4B;margin:0 0 4px 4px">New: choose your product</h2>
    <p style="line-height:1.6;margin:0 4px 8px">Start with the piece you want: 190+ real products, from tees and hoodies to mugs, pillows and totes, in your choice of color and size.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${/* The Design Studio's own listing photos, June's Tees "your design
            here" mark on each (owner 2026-10-28), from the shop feed: products
            12, 81, 19, 28, 100, 25 and 27, and the owner's mug and pillow
            mockups, saved as JPG for mail apps without WebP. Real products only. */ ''}<tr>${garment('listing-tee', 'T-shirts', 52)}${garment('listing-hoodie', 'Hoodies', 53)}${garment('listing-tank', 'Tank tops', 54)}</tr>
      <tr>${garment('listing-youth', 'Kids &amp; youth', 55)}${garment('listing-baby', 'Baby', 56)}${garment('listing-hat', 'Hats', 57)}</tr>
      <tr>${garment('listing-mug', 'Mugs', 97)}${garment('listing-pillow', 'Pillows', 98)}${garment('listing-tote', 'Totes &amp; bags', 58)}</tr>
    </table>
  </td></tr>
  <tr><td style="padding:14px 28px 4px">
    <h2 style="font-size:18px;color:#0B1F4B;margin:0 0 6px">New: design it your way</h2>
    <table role="presentation" cellpadding="0" cellspacing="0">
      ${feature('⬆️', 'Upload your logo or photo', 'Bring your own artwork, or start from ours.')}
      ${feature('🔤', 'Hundreds of fonts and graphics', 'Add names, numbers, dates and designs in a few taps.')}
      ${feature('✨', 'AI design help', 'Describe your idea, like "a family reunion shirt with our last name and year", and get a starting point.')}
      ${feature('👕', 'See it on the product instantly', 'Your design on the exact piece and color you picked, in full color.')}
      ${feature('💲', 'Live pricing with volume discounts', 'No minimums online. Order one piece or a whole team.')}
      ${feature('💾', 'Save your designs and track your order', 'Free account, so it is all there next time.')}
    </table>
    <p style="text-align:center;margin:16px 0 6px">${btn(SITE, 'Start designing')}</p>
  </td></tr>
  <tr><td style="padding:14px 24px 4px">
    <h2 style="font-size:18px;color:#0B1F4B;margin:0 0 8px 4px">Still printing everything you love</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${photo('email/work-family-christmas.jpg', 'Family Christmas shirts we printed')}${photo('email/work-santa-came-twice.jpg', 'Santa Came Twice Christmas shirt')}</tr>
      <tr>${photo('email/work-embroidered-polo.jpg', 'Embroidered logo polo')}${photo('email/work-family-reunion-order.jpg', 'Family reunion shirts, a full box ready for pickup')}</tr>
    </table>
    <p style="line-height:1.6;margin:10px 4px">Screen printing, embroidery and full-color prints for teams, schools, businesses,
      churches, birthdays and family reunions. Pick up at the shop in Lakeview, by appointment.</p>
  </td></tr>
  <tr><td style="padding:10px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdeef6;border:1px solid #f6c3de;border-radius:12px">
      <tr><td style="padding:16px 20px;text-align:center">
        <div style="font-size:20px;font-weight:800;color:#0B1F4B">🎄 Christmas orders: order by Nov 24</div>
        <p style="line-height:1.6;margin:8px 0 12px">⚡ Small orders are ready in <b>5–7 business days</b>, larger orders 7–14.
          Need it in under 5 days? Rush turnaround is available for a fee.</p>
        ${btn(`${SITE}/contact`, 'Get a quote')}
      </td></tr>
    </table>
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
    <p style="line-height:1.6;margin:0 0 12px">Have something coming up? Just reply to this email or text (773) 900-4592.
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

module.exports = { inviteBlock, CAMPAIGN, SIGNUP_PATH, PCT, CODE_DAYS, SOURCES, cleanSource, helloText, codeText, askText, askAudience, newCode, marketingPhones, emailAudience, helloEmail };
