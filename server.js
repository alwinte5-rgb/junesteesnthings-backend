require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const crypto     = require('crypto');
const { Pool }   = require('pg');
const { Resend } = require('resend');
const axios      = require('axios');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET || process.env.CLUDINARY_API_SECRET,
});

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false, // site uses inline scripts and CDN resources throughout
  // Public images are embedded in emails and on design.jtees.net — the default
  // same-origin policy makes browsers/webmail refuse to render them.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: ['https://www.jtees.net', 'https://jtees.net', 'https://design.jtees.net'] }));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    if (req.url && req.url.startsWith('/webhooks/')) req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Grad season pages are retired — redirect old links home.
app.get(['/grad', '/grad/', '/grad/*'], (_req, res) => res.redirect(302, '/'));
// Design Ideas is replaced by the online Design Studio — permanent redirect.
app.get('/design-ideas.html', (_req, res) => res.redirect(301, 'https://design.jtees.net/'));

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// ─── Database ─────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS submissions (
      id                  SERIAL PRIMARY KEY,
      name                TEXT NOT NULL,
      phone               TEXT NOT NULL,
      email               TEXT NOT NULL,
      description         TEXT,
      photo_url           TEXT,
      hubspot_contact_id  TEXT,
      hubspot_deal_id     TEXT,
      clover_customer_id  TEXT,
      clover_order_id     TEXT,
      status              TEXT DEFAULT 'new',
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Quotes texted from June's phone. The row is the source of truth — Brevo is
  // mirrored best-effort, so a CRM outage can never lose a quote.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id                SERIAL PRIMARY KEY,
      code              TEXT UNIQUE NOT NULL,
      name              TEXT,
      phone             TEXT,
      email             TEXT,
      items             JSONB NOT NULL DEFAULT '[]',
      subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
      notes             TEXT,
      status            TEXT NOT NULL DEFAULT 'sent',
      valid_until       DATE,
      viewed_at         TIMESTAMPTZ,
      accepted_at       TIMESTAMPTZ,
      followed_up_at    TIMESTAMPTZ,
      brevo_contact_id  TEXT,
      brevo_deal_id     TEXT,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Added after the first release; ALTERs are idempotent so this is safe to re-run.
  for (const col of [
    'needed_by DATE',                 // when the customer needs it
    'tax NUMERIC(10,2) DEFAULT 0',
    'total NUMERIC(10,2) DEFAULT 0',  // subtotal + tax (card fee is added at payment)
    'deposit NUMERIC(10,2) DEFAULT 0',
    'paid_amount NUMERIC(10,2) DEFAULT 0',
    'paid_method TEXT',
    'paid_at TIMESTAMPTZ',
    'stripe_session TEXT',
    'change_request TEXT',            // what the customer asked to change
    'revision INT DEFAULT 1',         // bumped each time June edits it
    'deposit_nudged_at TIMESTAMPTZ',  // accepted but deposit unpaid reminder
  ]) {
    await pool.query(`ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ${col}`).catch(() => {});
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS quotes_phone_idx ON quotes (phone)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS quotes_email_idx ON quotes (email)`);

  // Customer reviews. Collected after delivery, shown on the storefront, and
  // fed into aggregateRating schema so search results can show stars.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id           SERIAL PRIMARY KEY,
      token        TEXT UNIQUE NOT NULL,
      name         TEXT,
      email        TEXT,
      phone        TEXT,
      rating       INT,
      title        TEXT,
      body         TEXT,
      product      TEXT,
      source       TEXT DEFAULT 'site',
      order_ref    TEXT,
      quote_code   TEXT,
      approved     BOOLEAN DEFAULT FALSE,
      requested_at TIMESTAMPTZ,
      submitted_at TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS reviews_approved_idx ON reviews (approved, submitted_at DESC)`);
  await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`).catch(() => {});

  // Marketing opt-outs. Required to honour the one-click unsubscribe that
  // Gmail/Yahoo mandate of bulk senders — an unsubscribe link that does not
  // actually suppress mail is worse than none (it earns spam complaints).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_optouts (
      email       TEXT PRIMARY KEY,
      source      TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grad_orders (
      id             SERIAL PRIMARY KEY,
      order_ref      TEXT UNIQUE NOT NULL,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      status         TEXT DEFAULT 'new',
      parent_name    TEXT,
      student_name   TEXT,
      email          TEXT,
      phone          TEXT,
      school         TEXT,
      event_date     TEXT,
      needed_by      TEXT,
      address        TEXT,
      event_type     TEXT,
      products       JSONB,
      apparel        JSONB,
      designs        JSONB,
      upload_method  TEXT,
      upload_link    TEXT,
      payment_method TEXT,
      notes          TEXT,
      signature      TEXT,
      photos         JSONB DEFAULT '[]'::jsonb,
      admin_notes         TEXT,
      raw_data            JSONB,
      hubspot_contact_id  TEXT,
      hubspot_deal_id     TEXT,
      clover_customer_id  TEXT,
      clover_order_id     TEXT
    )
  `);
  // Add columns if they were added after initial deploy
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT`);
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS hubspot_deal_id TEXT`);
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS clover_customer_id TEXT`);
  await pool.query(`ALTER TABLE grad_orders ADD COLUMN IF NOT EXISTS clover_order_id TEXT`);
  console.log('Database ready.');
}

// ─── Email ────────────────────────────────────────────────────────────────────

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const NOTIFY_EMAIL = process.env.NOTIFICATION_EMAIL;
const FROM_ADDRESS = `June's Tees & Things <${NOTIFY_EMAIL}>`;
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://www.jtees.net').replace(/\/+$/, '');
// Every customer-facing message is signed as June. Single constant so the SMS
// templates, quote page and order emails can never drift apart.
const SHOP_NAME = "June's Tees & Things";
const SHOP_SIGNER = 'June';
const SHOP_PHONE = '(773) 849-1854';
const SHOP_EMAIL = process.env.JT_SHOP_EMAIL || NOTIFY_EMAIL;


// Plain-text alternative. Mail with no text/plain part scores measurably worse
// with spam filters, and every message here was HTML-only.
function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
             (_m, href, label) => `${label.replace(/<[^>]+>/g, '').trim()} (${href})`)
    .replace(/<\/td>\s*<td[^>]*>/gi, '  ')   // keep table cells apart
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '\u00b7').replace(/&mdash;/g, '\u2014').replace(/&ndash;/g, '\u2013')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim();
}

// One-click unsubscribe. Gmail and Yahoo have REQUIRED this of bulk senders
// since Feb 2024 (RFC 8058) — marketing mail without it gets spam-foldered,
// which is why the shop's abandoned-cart mail was landing in junk.
// Transactional mail (order receipts) is exempt and passes marketing:false.
function unsubHeaders(to) {
  const token = unsubToken(to);
  const url = `${PUBLIC_BASE_URL}/api/unsubscribe?e=${encodeURIComponent(to)}&t=${token}`;
  return {
    'List-Unsubscribe': `<${url}>, <mailto:${NOTIFY_EMAIL}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

function unsubToken(email) {
  return crypto.createHmac('sha256', process.env.JT_INTERNAL_KEY || 'jtees')
    .update(String(email).toLowerCase()).digest('hex').slice(0, 32);
}

function unsubFooter(to) {
  const token = unsubToken(to);
  const url = `${PUBLIC_BASE_URL}/api/unsubscribe?e=${encodeURIComponent(to)}&t=${token}`;
  return `<p style="color:#9ca3af;font-size:11px;margin-top:18px;line-height:1.5;">
    June&rsquo;s Tees &amp; Things &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657<br>
    Don't want these emails? <a href="${url}" style="color:#9ca3af;">Unsubscribe</a>.</p>`;
}

/** Has this address opted out of marketing mail? */
async function isUnsubscribed(email) {
  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM email_optouts WHERE email = $1 LIMIT 1', [String(email).toLowerCase()]);
    return rows.length > 0;
  } catch { return false; }   // never block a send because the table is unreachable
}

// ─── Brevo email (preferred for customer messages; Resend is the fallback) ───
// marketing:true adds the unsubscribe headers/footer and honours opt-outs.
// Order receipts and shipping notices are transactional and stay exempt.
async function sendEmail({ to, subject, html, replyTo, marketing = false, text }) {
  if (marketing && await isUnsubscribed(to)) {
    console.log(`sendEmail: skipped ${to} (unsubscribed)`);
    return;
  }
  if (marketing) html = html + unsubFooter(to);
  const textContent = text || htmlToText(html);
  const extraHeaders = marketing ? unsubHeaders(to) : {};

  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey) {
    try {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: { name: "June's Tees & Things", email: NOTIFY_EMAIL },
          to: [{ email: to }],
          replyTo: { email: replyTo || NOTIFY_EMAIL },
          subject,
          htmlContent: html,
          textContent,
          ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
        }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error(`Brevo ${r.status}: ${t.slice(0, 200)}`);
      }
      return;
    } catch (err) {
      console.error('sendEmail: Brevo failed, falling back to Resend:', err.message);
    }
  }
  if (!resend) throw new Error('Email send failed: Brevo errored and no RESEND_API_KEY fallback is configured');
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS, reply_to: replyTo || NOTIFY_EMAIL, to, subject, html,
    text: textContent,
    ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
  });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
}

// Single source of truth for email validation across all endpoints
function isValidEmail(str) {
  return /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(str || '').trim());
}

// Rotating promo code — MUST match the designer's jt_promo_config() on
// design.jtees.net: pool from JT_PROMO_CODES (comma list), index =
// floor(now/1week) % len. Codes are emailed only, never displayed on-page,
// and rotate weekly (the designer also accepts last week's).
function activePromoCode() {
  const pool = (process.env.JT_PROMO_CODES || process.env.JT_PROMO_CODE || 'SAVE10')
    .split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
  if (!pool.length) pool.push('SAVE10');
  return pool[Math.floor(Date.now() / 1000 / 604800) % pool.length];
}
console.log(`Active recovery promo code this week: ${activePromoCode()}`);

function escEmail(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// Shared "design it online" promo appended to customer-facing emails.
// Images live in public/assets/images/email/ and are served from the live site,
// so they only render once the site is deployed.
function designerPromoBlock() {
  const img = (file, alt) =>
    `<td style="padding:0 4px;"><a href="https://design.jtees.net/"><img src="https://www.jtees.net/assets/images/email/${file}" alt="${alt}" width="170" style="width:100%;max-width:170px;border-radius:8px;display:block;" /></a></td>`;
  return `
    <div style="margin-top:28px;padding-top:22px;border-top:1px solid #E5E7EB;">
      <h3 style="color:#0B1F4B;margin:0 0 6px;">Try our new online Design Studio 🎨</h3>
      <p style="color:#374151;margin:0 0 14px;">Put your own design on tees, hoodies and more — create it online and see it instantly.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;"><tr>
        ${img('work-meaq.jpg', 'Custom brand hoodie and hat we printed')}
        ${img('work-ghost.jpg', 'Custom Halloween tee we printed')}
        ${img('work-kennedy.jpg', 'Custom contractor hoodies we printed')}
      </tr></table>
      <p style="text-align:center;margin:18px 0 6px;">
        <a href="https://design.jtees.net/" style="background:#1848B8;color:#fff;font-weight:800;text-decoration:none;padding:13px 28px;border-radius:100px;display:inline-block;">Start Designing &rarr;</a>
      </p>
    </div>`;
}

async function sendNotificationEmail(s) {
  const photoRow = s.photo_url
    ? `<tr><td style="padding:8px;font-weight:bold;vertical-align:top;">Photo</td><td style="padding:8px;"><a href="${escEmail(s.photo_url)}">View Photo</a><br/><img src="${escEmail(s.photo_url)}" style="max-width:300px;margin-top:8px;border-radius:6px;" /></td></tr>`
    : '';
  await sendEmail({
    to:      NOTIFY_EMAIL,
    subject: `New Quote Request — ${s.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#A52429;">New Quote Request</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;font-weight:bold;width:120px;">Name</td><td style="padding:8px;">${escEmail(s.name)}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;"><a href="tel:${escEmail(s.phone)}">${escEmail(s.phone)}</a></td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;"><a href="mailto:${escEmail(s.email)}">${escEmail(s.email)}</a></td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;vertical-align:top;">Description</td><td style="padding:8px;">${escEmail(s.description) || '—'}</td></tr>
          ${photoRow}
        </table>
        <p style="color:#999;font-size:12px;margin-top:24px;">Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
      </div>
    `,
  });
}

async function sendCustomerConfirmationEmail(s) {
  const firstName = escEmail((s.name || '').split(' ')[0]);
  await sendEmail({
    to:      s.email,
    subject: `We got your request, ${(s.name || '').split(' ')[0]}!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#A52429;">Thanks for reaching out!</h2>
        <p>Hi ${firstName},</p>
        <p>We received your quote request and will get back to you within 1 business day.</p>
        <p><strong>What you submitted:</strong></p>
        <p style="background:#f9f9f9;padding:1rem;border-radius:8px;">${escEmail(s.description) || 'No description provided.'}</p>
        <p>Questions? Call or text us at <a href="tel:+17738491854">(773) 849-1854</a></p>
        ${designerPromoBlock()}
        <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees & Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
      </div>
    `,
  });
}

async function sendPaymentReceivedEmail(s, amount) {
  await sendEmail({
    to:      s.email,
    subject: `Payment confirmed — your order is in production!`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#A52429;">Payment Received!</h2>
        <p>Hi ${escEmail((s.name || '').split(' ')[0])},</p>
        <p>We received your payment of <strong>$${(amount / 100).toFixed(2)}</strong>. Your order is now in production.</p>
        <p><strong>Estimated delivery:</strong> 2–3 weeks from today.</p>
        <p>We'll reach out when your order is ready for pickup.</p>
        <p>Questions? Call or text us at <a href="tel:+17738491854">(773) 849-1854</a></p>
        ${designerPromoBlock()}
        <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees & Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
      </div>
    `,
  });
}

// ─── Brevo ────────────────────────────────────────────────────────────────────

const brevo = axios.create({
  baseURL: 'https://api.brevo.com/v3',
  headers: { 'api-key': process.env.JTEES_BREVO_MCP_API || process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
});

async function syncToBrevo(s) {
  if (isSpamName(s.name)) {
    console.warn('syncToBrevo: skipping spam contact:', s.name);
    return;
  }
  const [firstname, ...rest] = (s.name || '').trim().split(' ');
  await brevo.post('/contacts', {
    email:      s.email,
    attributes: {
      FIRSTNAME: firstname || '',
      LASTNAME:  rest.join(' ') || '',
      SMS:       s.phone || '',
    },
    listIds:        process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
    updateEnabled:  true,
  });
}

// Upsert a tawk.to chat/ticket contact. Chat leads go to their own list when
// BREVO_TAWK_LIST_ID is set, otherwise they fall back to the main list.
async function syncTawkContactToBrevo({ name, email }) {
  if (isSpamName(name)) {
    console.warn('syncTawkContactToBrevo: skipping spam contact:', name);
    return;
  }
  const [firstname, ...rest] = (name || '').trim().split(' ');
  const listId = process.env.BREVO_TAWK_LIST_ID || process.env.BREVO_LIST_ID;
  await brevo.post('/contacts', {
    email,
    attributes:    { FIRSTNAME: firstname || '', LASTNAME: rest.join(' ') || '' },
    listIds:       listId ? [parseInt(listId)] : [],
    updateEnabled: true,
  });
}

// ─── Grad order pricing ───────────────────────────────────────────────────────

const GRAD_PRICES = {
  tee_1to4:      { name: 'Custom Grad Tee (1–4)',            price: 25  },
  tee_5to9:      { name: 'Custom Grad Tee (5–9)',            price: 20  },
  family_1to4:   { name: 'Family Matching Tee (1–4)',        price: 25  },
  family_5to9:   { name: 'Family Matching Tee (5–9)',        price: 20  },
  hoodie:        { name: 'Custom Hoodie',                    price: 45  },
  stole:         { name: 'Graduation Stole',                 price: 45  },
  yard_sign:     { name: 'Yard Sign (18"×12")',              price: 25  },
  banner_4x2:    { name: "Banner (4'×2')",                   price: 45  },
  banner_6x3:    { name: "Banner (6'×3')",                   price: 80  },
  bighead_single:{ name: 'Big Head Cutout — Single',         price: 25  },
  bighead_5pk:   { name: 'Big Head 5-Pack',                  price: 100 },
  mini_standee:  { name: 'Mini Standee (24")',               price: 35  },
  standee:       { name: 'Life-Size Standee (up to 6ft)',    price: 125 },
  arch:          { name: 'Corroplast Arch',                  price: 250 },
  backdrop:      { name: "Vinyl Backdrop Banner (6'×6')",    price: 150 },
  button_4pk:    { name: 'Photo Buttons (set of 4)',         price: 28  },
  button_10pk:   { name: 'Photo Buttons (set of 10)',        price: 60  },
  magnet:        { name: 'Custom Photo Magnets (set of 6)',  price: 25  },
  sticker:       { name: 'Custom Sticker Sheet (10-pack)',   price: 20  },
  chipbag_6:     { name: 'Custom Chip Bags (set of 6)',      price: 18  },
  chipbag_12:    { name: 'Custom Chip Bags (set of 12)',     price: 35  },
  gable_box:     { name: 'Custom Gable Boxes (set of 6)',    price: 22  },
  tumbler:       { name: 'Custom Photo Tumbler',             price: 28  },
  cup_4pk:       { name: 'Custom Cup (set of 4)',            price: 36  },
  can_cooler:    { name: 'Custom Can Coolers (6-Pack)',       price: 60  },
  koozie:        { name: 'Koozies (set of 6)',               price: 35  },
  step_repeat:   { name: "Step-and-Repeat Banner (8'×8')",  price: 200 },
  prom_arch:     { name: 'Prom Arch',                        price: 250 },
  photo_props:   { name: 'Photo Props',                      price: 89  },
  prom_decal:    { name: 'Prom Decal',                       price: 80  },
};

function buildGradLineItems(order) {
  const items = [];
  for (const [key, { name, price }] of Object.entries(GRAD_PRICES)) {
    const qty = order.products[key] || 0;
    if (qty > 0) items.push({ name, price, quantity: qty });
  }
  const shirtQty = order.apparel?.shirt_qty || 0;
  if (shirtQty > 0) {
    const shirtPrice = shirtQty >= 100 ? 9.75 : shirtQty >= 50 ? 14.00 : 18.50;
    items.push({ name: `Custom Shirts (qty: ${shirtQty})`, price: shirtPrice, quantity: shirtQty });
  }
  return items;
}

// ─── HubSpot ──────────────────────────────────────────────────────────────────

const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || '';

const hubspot = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` },
});

async function createOrUpdateHubSpotContact(s) {
  try {
    const res = await hubspot.post('/crm/v3/objects/contacts', {
      properties: {
        firstname:      s.name.split(' ')[0],
        lastname:       s.name.split(' ').slice(1).join(' ') || '',
        email:          s.email,
        phone:          s.phone,
        hs_lead_status: 'NEW',
      },
    });
    return res.data.id;
  } catch (err) {
    if (err.response?.status === 409) {
      const search = await hubspot.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: s.email }] }],
      });
      return search.data.results[0]?.id;
    }
    throw err;
  }
}

async function createHubSpotDeal(s, contactId) {
  const res = await hubspot.post('/crm/v3/objects/deals', {
    properties: {
      dealname:  `Quote — ${s.name}`,
      dealstage: '3348333265',
      pipeline:  'default',
    },
    associations: [{
      to:    { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
    }],
  });
  return res.data.id;
}

async function addHubSpotNote(s, contactId, dealId) {
  const noteLines = [
    `Description: ${s.description || 'N/A'}`,
    s.photo_url ? `Reference photo: ${s.photo_url}` : null,
  ].filter(Boolean);

  const noteRes = await hubspot.post('/crm/v3/objects/notes', {
    properties: { hs_note_body: noteLines.join('\n'), hs_timestamp: Date.now().toString() },
  });
  const noteId = noteRes.data.id;
  await Promise.all([
    hubspot.put('/crm/v4/associations/notes/contacts/batch/associate/default', {
      inputs: [{ from: { id: noteId }, to: { id: contactId } }],
    }),
    hubspot.put('/crm/v4/associations/notes/deals/batch/associate/default', {
      inputs: [{ from: { id: noteId }, to: { id: dealId } }],
    }),
  ]);
}

async function createHubSpotTask(s, contactId) {
  const taskRes = await hubspot.post('/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Follow up with ${s.name} about quote`,
      hs_task_body:    `Phone: ${s.phone} | Email: ${s.email}`,
      hs_timestamp:    (Date.now() + 86_400_000).toString(),
      hs_task_status:  'NOT_STARTED',
      hs_task_type:    'TODO',
    },
  });
  const taskId = taskRes.data.id;
  await hubspot.put('/crm/v4/associations/tasks/contacts/batch/associate/default', {
    inputs: [{ from: { id: taskId }, to: { id: contactId } }],
  });
}

async function updateHubSpotDealStage(dealId, stage) {
  await hubspot.patch(`/crm/v3/objects/deals/${dealId}`, {
    properties: { dealstage: stage },
  });
}

async function syncToHubSpot(s) {
  const contactId = await createOrUpdateHubSpotContact(s);
  const dealId    = await createHubSpotDeal(s, contactId);
  await Promise.all([
    addHubSpotNote(s, contactId, dealId),
    createHubSpotTask(s, contactId),
  ]);
  return { contactId, dealId };
}

// ─── Clover ───────────────────────────────────────────────────────────────────

const clover = axios.create({ baseURL: 'https://api.clover.com' });
// Read token dynamically on every request so Railway env changes take effect without redeploy
clover.interceptors.request.use(cfg => {
  cfg.headers['Authorization'] = `Bearer ${process.env.CLOVER_API_TOKEN}`;
  return cfg;
});

const MID = () => process.env.CLOVER_MERCHANT_ID;

async function createCloverCustomer(s) {
  const res = await clover.post(`/v3/merchants/${MID()}/customers`, {
    firstName:    s.name.split(' ')[0],
    lastName:     s.name.split(' ').slice(1).join(' ') || '',
    emailAddresses: [{ emailAddress: s.email }],
    phoneNumbers:   [{ phoneNumber: s.phone }],
  });
  return res.data.id;
}

async function createCloverOrder(submissionId, cloverCustomerId, items) {
  // items: [{ name, price (cents), quantity }]

  // 1. Create the order
  const orderRes = await clover.post(`/v3/merchants/${MID()}/orders`, {
    title:    `Quote #${submissionId}`,
    customers: [{ id: cloverCustomerId }],
  });
  const orderId = orderRes.data.id;

  // 2. Add line items
  await Promise.all(items.map(item =>
    clover.post(`/v3/merchants/${MID()}/orders/${orderId}/line_items`, {
      name:     item.name,
      price:    item.price,
      unitQty:  item.quantity,
    })
  ));

  return orderId;
}

async function getCloverInventory() {
  const res = await clover.get(`/v3/merchants/${MID()}/inventory/items`, {
    params: { limit: 100 },
  });
  return res.data.elements || [];
}

async function getCloverPayment(paymentId) {
  const res = await clover.get(`/v3/merchants/${MID()}/payments/${paymentId}`);
  return res.data;
}

async function syncGradToBrevo(order) {
  const [first, ...rest] = (order.parent_name || '').trim().split(' ');

  // 1. Create / update contact
  await brevo.post('/contacts', {
    email:          order.email,
    attributes:     { FIRSTNAME: first || '', LASTNAME: rest.join(' ') || '', SMS: order.phone || '' },
    listIds:        process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
    updateEnabled:  true,
  });

  // 2. Get the contact's numeric ID for deal linking
  const contactRes = await brevo.get(`/contacts/${encodeURIComponent(order.email)}`);
  const contactId  = contactRes.data.id;

  // 3. Build order summary
  const lineItems      = buildGradLineItems(order);
  const estimatedTotal = lineItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const itemSummary    = lineItems.map(i =>
    `• ${i.name} × ${i.quantity} @ $${i.price.toFixed(2)} = $${(i.price * i.quantity).toFixed(2)}`
  ).join('\n');

  // 4. Design selections
  const eventTypes  = (order.event_type || '').split(',').map(s => s.trim()).filter(Boolean);
  const designMap   = { 'senior-night': 'senior_night', graduation: 'graduation', prom: 'prom' };
  const designLines = eventTypes.map(evt => {
    const key  = designMap[evt] || evt;
    const name = order.designs?.[`${key}_name`] || order.designs?.[key] || '—';
    const img  = order.designs?.[`${key}_img`]  || '';
    return `  ${evt.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${name}${img ? `\n  Image: ${img}` : ''}`;
  }).join('\n');

  // 5. Build full note
  const photoLines = (order.photos || []).length
    ? `\nUPLOADED PHOTOS (${order.photos.length}):\n${order.photos.map((u, i) => `  Photo ${i + 1}: ${u}`).join('\n')}`
    : '\n  No photos uploaded.';

  const noteText = [
    `============================`,
    `GRAD ORDER — ${order.order_ref}`,
    `============================`,
    ``,
    `CUSTOMER`,
    `  Name:    ${order.parent_name}`,
    `  Student: ${order.student_name || '—'}`,
    `  Email:   ${order.email}`,
    `  Phone:   ${order.phone || '—'}`,
    `  Address: ${order.address || '—'}`,
    ``,
    `EVENT`,
    `  Type:      ${order.event_type}`,
    `  Date:      ${order.event_date || '—'}`,
    `  Needed By: ${order.needed_by || '—'}`,
    `  School:    ${order.school || '—'}`,
    `  Colors:    ${order.school_colors || '—'}`,
    ``,
    `DESIGN SELECTED`,
    designLines || '  —',
    ``,
    `ORDER ITEMS`,
    `  ${itemSummary.replace(/\n/g, '\n  ') || 'None'}`,
    ``,
    `  ESTIMATED TOTAL: $${estimatedTotal.toFixed(2)}`,
    `  * Final price confirmed after design review`,
    ``,
    `PAYMENT METHOD: ${order.payment_method || '—'}`,
    ``,
    `PROOF AGREEMENT`,
    `  Signed By: ${order.signature || '—'}`,
    `  Date:      ${order.sign_date || '—'}`,
    order.apparel?.design_notes ? `\nDESIGN NOTES:\n  ${order.apparel.design_notes}` : null,
    order.notes ? `\nSPECIAL INSTRUCTIONS:\n  ${order.notes}` : null,
    photoLines,
  ].filter(l => l !== null).join('\n');

  // 6. Create deal
  const dealRes = await brevo.post('/crm/deals', {
    name:       `Grad Order — ${order.parent_name} (${order.order_ref})`,
    attributes: {
      amount:     parseFloat(estimatedTotal.toFixed(2)),
      close_date: order.needed_by ? new Date(order.needed_by).toISOString() : new Date().toISOString(),
    },
  });
  const dealId = dealRes.data.id;
  console.log('Brevo deal created:', dealId);

  // 7. Link contact to deal
  await brevo.patch(`/crm/deals/${dealId}`, { linkedContactsIds: [contactId] })
    .catch(err => console.error('Brevo contact→deal link failed:', JSON.stringify(err.response?.data || err.message)));

  // 8. Create note linked to contact + deal
  await brevo.post('/crm/notes', {
    text:       noteText,
    contactIds: [contactId],
    dealIds:    [dealId],
  }).then(() => console.log('Brevo note created OK'))
    .catch(err => console.error('Brevo note failed:', JSON.stringify(err.response?.data || err.message)));

  return { contactId, dealId };
}

async function createGradCloverCustomerAndOrder(order) {
  console.log('Clover MID:', MID(), 'Token set:', !!process.env.CLOVER_API_TOKEN);
  try {
    const customerRes = await clover.post(`/v3/merchants/${MID()}/customers`, {
      firstName:      (order.parent_name || '').split(' ')[0],
      lastName:       (order.parent_name || '').split(' ').slice(1).join(' ') || '',
      emailAddresses: [{ emailAddress: order.email }],
      phoneNumbers:   [{ phoneNumber: order.phone }],
    });
    const cloverCustomerId = customerRes.data.id;
    const orderRes = await clover.post(`/v3/merchants/${MID()}/orders`, {
      title:     `Grad Order ${order.order_ref}`,
      customers: [{ id: cloverCustomerId }],
    });
    const cloverOrderId = orderRes.data.id;
    const lineItems = buildGradLineItems(order);
    await Promise.all(lineItems.map(item =>
      clover.post(`/v3/merchants/${MID()}/orders/${cloverOrderId}/line_items`, {
        name:    `${item.name}${item.quantity > 1 ? ` (×${item.quantity})` : ''}`,
        price:   Math.round(item.price * item.quantity * 100), // total in cents
        unitQty: 1000, // 1 unit in Clover milliUnits
      })
    ));
    return { cloverCustomerId, cloverOrderId };
  } catch (err) {
    console.error('Clover error:', err.response?.status, JSON.stringify(err.response?.data || err.message));
    throw err;
  }
}

// ─── Auth (admin routes) ──────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_PASSWORD || '';
  let valid = false;

  /* The PASSWORD is the secret; the username is not checked.
     Phone keyboards autocapitalise the first letter, so "Admin" was failing and
     the browser re-prompted forever — an unguessable password is what actually
     protects this, and a case-sensitive username only ever locked out the owner. */
  try {
    const provided = req.headers['authorization'] || '';
    if (secret && provided.startsWith('Basic ')) {
      const decoded = Buffer.from(provided.slice(6), 'base64').toString('utf8');
      const pass = decoded.slice(decoded.indexOf(':') + 1);
      const a = Buffer.from(pass);
      const b = Buffer.from(secret);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    }
  } catch { valid = false; }

  if (!valid) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized — any username, the password is what matters.');
  }
  next();
}

const orderRateLimit     = makeRateLimit(10, 60 * 60 * 1000);
const signatureRateLimit = makeRateLimit(30, 60 * 60 * 1000);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Form token — fetched by the browser on page load ─────────────────────────
app.get('/api/form-token', signatureRateLimit, (_req, res) => {
  res.json({ token: generateFormToken() });
});

// ── Form submission ──────────────────────────────────────────────────────────

app.post('/submit', makeRateLimit(4, 60 * 60 * 1000), rejectBots, async (req, res) => {
  const { name, phone, email, description, photo_url } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }

  if (String(name).length > 200 || String(phone).length > 50 || String(email).length > 254) {
    return res.status(400).json({ error: 'Input too long.' });
  }
  // US phone: 10 digits, or 11 with leading 1 (formatting characters allowed)
  const phoneDigits = String(phone).replace(/\D/g, '');
  if (phoneDigits.length !== 10 && !(phoneDigits.length === 11 && phoneDigits.startsWith('1'))) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (description && String(description).length > 2000) {
    return res.status(400).json({ error: 'Description too long.' });
  }
  if (photo_url && (
    typeof photo_url !== 'string' ||
    !photo_url.startsWith('https://res.cloudinary.com/')
  )) {
    return res.status(400).json({ error: 'Invalid photo URL.' });
  }

  const s = { name: name.trim(), phone: phone.trim(), email: email.trim().toLowerCase(), description, photo_url };

  // Save to DB first
  let submissionId;
  try {
    const { rows } = await pool.query(
      `INSERT INTO submissions (name, phone, email, description, photo_url)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [s.name, s.phone, s.email, s.description, s.photo_url]
    );
    submissionId = rows[0].id;
  } catch (err) {
    console.error('DB insert failed:', err.message);
    return res.status(500).json({ error: 'Failed to save submission.' });
  }

  // Fire everything in parallel
  const [emailResult, customerEmailResult, brevoResult, hubspotResult, cloverResult] =
    await Promise.allSettled([
      sendNotificationEmail(s),
      sendCustomerConfirmationEmail(s),
      syncToBrevo(s),
      syncToHubSpot(s),
      createCloverCustomer(s),
    ]);

  if (emailResult.status         === 'rejected') console.error('Notification email failed:', emailResult.reason?.message, JSON.stringify(emailResult.reason?.response?.data ?? emailResult.reason?.response ?? null));
  if (customerEmailResult.status === 'rejected') console.error('Confirmation email failed:', customerEmailResult.reason?.message, JSON.stringify(customerEmailResult.reason?.response?.data ?? customerEmailResult.reason?.response ?? null));
  if (brevoResult.status         === 'rejected') console.error('Brevo sync failed:',         brevoResult.reason?.message, JSON.stringify(brevoResult.reason?.response?.data));
  if (hubspotResult.status       === 'rejected') console.error('HubSpot failed:',            hubspotResult.reason?.message, JSON.stringify(hubspotResult.reason?.response?.data));
  if (cloverResult.status        === 'rejected') console.error('Clover failed:',             cloverResult.reason?.message, JSON.stringify(cloverResult.reason?.response?.data));

  // Persist IDs
  const updates = {};
  if (hubspotResult.status === 'fulfilled') {
    updates.hubspot_contact_id = hubspotResult.value.contactId;
    updates.hubspot_deal_id    = hubspotResult.value.dealId;
  }
  if (cloverResult.status === 'fulfilled') {
    updates.clover_customer_id = cloverResult.value;
  }

  if (updates.hubspot_contact_id !== undefined) {
    pool.query(
      'UPDATE submissions SET hubspot_contact_id=$1, hubspot_deal_id=$2 WHERE id=$3',
      [updates.hubspot_contact_id, updates.hubspot_deal_id ?? null, submissionId]
    ).catch(err => console.error('HubSpot ID update failed:', err.message));
  }
  if (updates.clover_customer_id !== undefined) {
    pool.query(
      'UPDATE submissions SET clover_customer_id=$1 WHERE id=$2',
      [updates.clover_customer_id, submissionId]
    ).catch(err => console.error('Clover ID update failed:', err.message));
  }

  res.json({ ok: true });
});

// ── Create Clover order (called when you approve a quote) ─────────────────────

app.post('/orders/create', requireAdmin, async (req, res) => {
  const { submissionId, items } = req.body;
  // items: [{ name, price (in dollars), quantity }]

  if (!submissionId || !items?.length) {
    return res.status(400).json({ error: 'submissionId and items are required.' });
  }
  for (const item of items) {
    if (!item.name || typeof item.name !== 'string' || item.name.length > 200) {
      return res.status(400).json({ error: 'Each item must have a valid name.' });
    }
    if (typeof item.price !== 'number' || item.price <= 0 || item.price > 100000) {
      return res.status(400).json({ error: 'Each item price must be a positive number up to $100,000.' });
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000) {
      return res.status(400).json({ error: 'Each item quantity must be a positive integer.' });
    }
  }

  try {
    const { rows } = await pool.query('SELECT * FROM submissions WHERE id=$1', [submissionId]);
    if (!rows.length) return res.status(404).json({ error: 'Submission not found.' });

    const sub = rows[0];

    const cloverItems = items.map(i => ({
      name:     i.name,
      price:    Math.round(i.price * 100), // convert dollars to cents
      quantity: i.quantity,
    }));

    const orderId = await createCloverOrder(submissionId, sub.clover_customer_id, cloverItems);

    await pool.query(
      'UPDATE submissions SET clover_order_id=$1, status=$2 WHERE id=$3',
      [orderId, 'quoted', submissionId]
    );

    // Update HubSpot deal to "Presentation Scheduled" (= quote sent)
    if (sub.hubspot_deal_id) {
      updateHubSpotDealStage(sub.hubspot_deal_id, 'presentationscheduled')
        .catch(err => console.error('HubSpot stage update failed:', err.message));
    }

    res.json({ ok: true, orderId });
  } catch (err) {
    console.error('Order creation failed:', err.message);
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

// ── Clover payment webhook ─────────────────────────────────────────────────────
// In your Clover Developer Dashboard, set the webhook URL to:
// https://www.jtees.net/webhooks/clover

// GET handler for Clover URL verification
app.get('/webhooks/clover', (_req, res) => res.sendStatus(200));

app.post('/webhooks/clover', async (req, res) => {
  // Verify the request came from Clover using the app secret
  const signature = req.headers['x-clover-auth'];
  if (!process.env.CLOVER_APP_SECRET) {
    console.warn('Clover webhook rejected — CLOVER_APP_SECRET not set');
    return res.sendStatus(503);
  }
  if (!signature) {
    console.warn('Clover webhook rejected — missing signature');
    return res.sendStatus(401);
  }
  // Use raw body (not re-serialized JSON) to avoid serialization mismatch
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto
    .createHmac('sha256', process.env.CLOVER_APP_SECRET)
    .update(rawBody)
    .digest('base64');
  let sigValid = false;
  try {
    sigValid = signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { sigValid = false; }
  if (!sigValid) {
    console.warn('Clover webhook signature mismatch — rejected');
    return res.sendStatus(401);
  }

  res.sendStatus(200); // acknowledge immediately

  const { merchantId, type, id: paymentId } = req.body;

  // Validate merchant and event type
  if (process.env.CLOVER_MERCHANT_ID && merchantId !== process.env.CLOVER_MERCHANT_ID) {
    console.warn('Clover webhook rejected — merchant ID mismatch');
    return;
  }
  if (type !== 'PAYMENT' || !paymentId) return;

  try {
    const payment = await getCloverPayment(paymentId);
    const amount  = payment.amount; // in cents

    // Find the submission by clover order ID
    const { rows } = await pool.query(
      'SELECT * FROM submissions WHERE clover_order_id=$1',
      [payment.order?.id]
    );

    if (!rows.length) return;
    const sub = rows[0];

    // Idempotency check — skip if already marked paid
    if (sub.status === 'paid') return;

    // Update status in DB
    await pool.query('UPDATE submissions SET status=$1 WHERE id=$2', ['paid', sub.id]);

    // Update HubSpot deal to Closed Won
    if (sub.hubspot_deal_id) {
      updateHubSpotDealStage(sub.hubspot_deal_id, 'closedwon')
        .catch(err => console.error('HubSpot deal close failed:', err.message));
    }

    // Confirm to customer via email
    sendPaymentReceivedEmail(sub, amount)
      .catch(err => console.error('Payment email failed:', err.message));

  } catch (err) {
    console.error('Webhook processing failed:', err.message);
  }
});

// ── tawk.to chat webhook ───────────────────────────────────────────────────────
// In the tawk.to dashboard (Administration → Settings → Webhooks), set the URL to:
// https://www.jtees.net/webhooks/tawk
// Enable the "Chat Start" and "Ticket Create" events, and copy the secret key
// it generates into the TAWK_WEBHOOK_SECRET env var on Railway.

app.post('/webhooks/tawk', async (req, res) => {
  const signature = req.headers['x-tawk-signature'];
  if (!process.env.TAWK_WEBHOOK_SECRET) {
    console.warn('tawk webhook rejected — TAWK_WEBHOOK_SECRET not set');
    return res.sendStatus(503);
  }
  if (!signature) {
    console.warn('tawk webhook rejected — missing signature');
    return res.sendStatus(401);
  }
  // Use raw body (not re-serialized JSON) to avoid serialization mismatch
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
  const expected = crypto
    .createHmac('sha1', process.env.TAWK_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  let sigValid = false;
  try {
    sigValid = signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch { sigValid = false; }
  if (!sigValid) {
    console.warn('tawk webhook signature mismatch — rejected');
    return res.sendStatus(401);
  }

  res.sendStatus(200); // acknowledge immediately; tawk retries non-2XX for 12 hours

  // chat:* events carry `visitor`; ticket:create carries `requester`
  const { event, visitor, requester } = req.body;
  const contact = visitor || requester;
  if (!contact?.email) return; // anonymous visitor (no pre-chat form) — nothing to sync

  try {
    await syncTawkContactToBrevo(contact);
    console.log(`tawk webhook: synced ${contact.email} to Brevo (${event})`);
  } catch (err) {
    console.error('tawk → Brevo sync failed:', err.response?.data?.message || err.message);
  }
});

// ── Inventory (for building order forms) ──────────────────────────────────────

app.get('/inventory', requireAdmin, async (_req, res) => {
  try {
    const items = await getCloverInventory();
    res.json(items);
  } catch (err) {
    console.error('Inventory fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch inventory.' });
  }
});

// ── Admin dashboard ───────────────────────────────────────────────────────────

app.get('/admin', requireAdmin, (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Admin — June's Tees & Things</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e5e5e5;padding:2rem}
    h1{font-size:1.4rem;margin-bottom:1.5rem;color:#fff}
    h1 span{color:#A52429}
    .toolbar{display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;align-items:center}
    .toolbar select,.toolbar input{background:#1a1a1a;border:1px solid #333;color:#e5e5e5;padding:.5rem .75rem;border-radius:8px;font-size:.85rem}
    .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:1.25rem;margin-bottom:1rem}
    .card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}
    .card-name{font-weight:700;font-size:1rem;color:#fff}
    .badge{display:inline-block;font-size:.65rem;padding:3px 10px;border-radius:999px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
    .badge-new{background:#1d4ed8;color:#fff}
    .badge-quoted{background:#d97706;color:#fff}
    .badge-paid{background:#16a34a;color:#fff}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:.2rem}
    .value{font-size:.875rem;color:#e5e5e5;word-break:break-word}
    .value a{color:#A52429}
    .desc{grid-column:1/-1}
    .photo img{max-width:200px;border-radius:8px;margin-top:.4rem}
    .photo{grid-column:1/-1}
    .date{grid-column:1/-1;font-size:.72rem;color:#555;margin-top:.25rem}
    .actions{display:flex;gap:.75rem;margin-top:1rem;flex-wrap:wrap}
    .btn{padding:.5rem 1rem;border-radius:8px;border:none;font-size:.8rem;font-weight:600;cursor:pointer;text-decoration:none}
    .btn-primary{background:#A52429;color:#fff}
    .btn-secondary{background:#2a2a2a;color:#e5e5e5;border:1px solid #444}
    .empty{color:#555;text-align:center;padding:4rem}
    #order-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:100;align-items:center;justify-content:center}
    #order-modal.open{display:flex}
    .modal-box{background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:2rem;width:100%;max-width:520px;max-height:90vh;overflow-y:auto}
    .modal-box h2{margin-bottom:1.25rem;font-size:1.1rem}
    .form-group{margin-bottom:1rem}
    .form-group label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-bottom:.3rem}
    .form-group input{width:100%;background:#111;border:1px solid #333;color:#e5e5e5;padding:.6rem .9rem;border-radius:8px;font-size:.875rem}
    .item-row{display:grid;grid-template-columns:1fr 100px 80px 32px;gap:.5rem;margin-bottom:.5rem;align-items:center}
    .item-row input{margin:0}
    .remove-item{background:#333;border:none;color:#999;border-radius:6px;cursor:pointer;font-size:.9rem;height:36px;width:32px}
    #add-item-btn{background:none;border:1px dashed #444;color:#999;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-size:.8rem;width:100%;margin-bottom:1rem}
    .modal-actions{display:flex;gap:.75rem;justify-content:flex-end;margin-top:1.25rem}
  </style>
</head>
<body>
  <h1>June's Tees <span>&</span> Things — Submissions</h1>

  <div class="toolbar">
    <select id="filter-status">
      <option value="">All statuses</option>
      <option value="new">New</option>
      <option value="quoted">Quoted</option>
      <option value="paid">Paid</option>
    </select>
    <input id="search" type="text" placeholder="Search by name or email..." />
  </div>

  <div id="list"><p class="empty">Loading...</p></div>

  <!-- Create Order Modal -->
  <div id="order-modal">
    <div class="modal-box">
      <h2>Create Clover Order</h2>
      <input type="hidden" id="modal-submission-id" />
      <div id="item-rows"></div>
      <button id="add-item-btn" type="button">+ Add Line Item</button>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitOrder()">Create Order</button>
      </div>
    </div>
  </div>

  <script>
    const authHeader = 'Basic ' + btoa('admin:' + prompt('Admin password:'));
    let allRows = [];

    function esc(str) {
      if (str == null) return '';
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
    }

    function statusBadge(s) {
      const map = { new:'badge-new', quoted:'badge-quoted', paid:'badge-paid' };
      return \`<span class="badge \${map[esc(s)]||'badge-new'}">\${esc(s)||'new'}</span>\`;
    }

    function renderRows(rows) {
      const list = document.getElementById('list');
      if (!rows.length) { list.innerHTML = '<p class="empty">No submissions found.</p>'; return; }
      list.innerHTML = rows.map(r => \`
        <div class="card">
          <div class="card-header">
            <div class="card-name">\${esc(r.name)}</div>
            \${statusBadge(r.status)}
          </div>
          <div class="grid">
            <div><div class="label">Phone</div><div class="value"><a href="tel:\${esc(r.phone)}">\${esc(r.phone)}</a></div></div>
            <div><div class="label">Email</div><div class="value"><a href="mailto:\${esc(r.email)}">\${esc(r.email)}</a></div></div>
            <div><div class="label">HubSpot</div><div class="value">\${r.hubspot_contact_id ? '<a href="https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/'+encodeURIComponent(r.hubspot_contact_id)+'" target="_blank">View</a>' : '—'}</div></div>
            <div><div class="label">Clover</div><div class="value">\${r.clover_order_id ? 'Order created' : r.clover_customer_id ? 'Customer only' : '—'}</div></div>
            <div class="desc"><div class="label">Description</div><div class="value">\${esc(r.description)||'—'}</div></div>
            \${r.photo_url && r.photo_url.startsWith('https://res.cloudinary.com/') ? \`<div class="photo"><div class="label">Photo</div><a href="\${esc(r.photo_url)}" target="_blank"><img src="\${esc(r.photo_url)}" /></a></div>\` : ''}
            <div class="date">Submitted \${new Date(r.created_at).toLocaleString('en-US',{timeZone:'America/Chicago'})} CT &nbsp;·&nbsp; ID #\${parseInt(r.id,10)}</div>
          </div>
          <div class="actions">
            \${!r.clover_order_id ? \`<button class="btn btn-primary" onclick="openModal(\${parseInt(r.id,10)})">Create Clover Order</button>\` : ''}
            \${r.hubspot_contact_id ? \`<a class="btn btn-secondary" href="https://app.hubspot.com/contacts/${HUBSPOT_PORTAL_ID}/contact/\${esc(r.hubspot_contact_id)}" target="_blank">HubSpot Contact</a>\` : ''}
          </div>
        </div>
      \`).join('');
    }

    function applyFilters() {
      const status = document.getElementById('filter-status').value;
      const search = document.getElementById('search').value.toLowerCase();
      renderRows(allRows.filter(r =>
        (!status || r.status === status) &&
        (!search || r.name.toLowerCase().includes(search) || r.email.toLowerCase().includes(search))
      ));
    }

    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('search').addEventListener('input', applyFilters);

    fetch('/admin/data', { headers: { Authorization: authHeader } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(rows => { allRows = rows; renderRows(rows); })
      .catch(err => { document.getElementById('list').innerHTML = '<p class="empty">Failed to load: ' + err + '</p>'; });

    // Order modal
    function openModal(submissionId) {
      document.getElementById('modal-submission-id').value = submissionId;
      document.getElementById('item-rows').innerHTML = '';
      addItemRow();
      document.getElementById('order-modal').classList.add('open');
    }

    function closeModal() {
      document.getElementById('order-modal').classList.remove('open');
    }

    function addItemRow() {
      const row = document.createElement('div');
      row.className = 'item-row';
      row.innerHTML = \`
        <input type="text" placeholder="Item name" class="item-name" />
        <input type="number" placeholder="Price $" step="0.01" class="item-price" />
        <input type="number" placeholder="Qty" min="1" value="1" class="item-qty" />
        <button type="button" class="remove-item" onclick="this.parentElement.remove()">✕</button>
      \`;
      document.getElementById('item-rows').appendChild(row);
    }

    document.getElementById('add-item-btn').addEventListener('click', addItemRow);

    async function submitOrder() {
      const submissionId = document.getElementById('modal-submission-id').value;
      const rows = document.querySelectorAll('.item-row');
      const items = [...rows].map(r => ({
        name:     r.querySelector('.item-name').value,
        price:    parseFloat(r.querySelector('.item-price').value),
        quantity: parseInt(r.querySelector('.item-qty').value),
      })).filter(i => i.name && i.price);

      if (!items.length) { alert('Add at least one line item.'); return; }

      const res = await fetch('/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ submissionId: parseInt(submissionId), items }),
      });

      if (res.ok) {
        closeModal();
        location.reload();
      } else {
        const err = await res.json();
        alert('Error: ' + (err.error || 'Unknown error'));
      }
    }
  </script>
</body>
</html>`);
});

app.get('/admin/data', requireAdmin, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0,   0);
    const { rows } = await pool.query(
      'SELECT * FROM submissions ORDER BY created_at DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error('Admin data fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

// ─── Grad 2026 API ────────────────────────────────────────────────────────────

// Simple in-memory rate limiter
// Prefers CF-Connecting-IP (set by Cloudflare) so the real visitor IP is used,
// not Cloudflare's proxy IP. Falls back to req.ip for non-Cloudflare traffic.
function makeRateLimit(maxReqs, windowMs) {
  const store = new Map();
  // Prune expired entries every 15 minutes to prevent unbounded memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of store) {
      if (now > entry.reset) store.delete(ip);
    }
  }, 15 * 60 * 1000).unref();

  return (req, res, next) => {
    const ip    = req.headers['cf-connecting-ip'] || req.ip || req.socket.remoteAddress || 'unknown';
    const now   = Date.now();
    const entry = store.get(ip) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count++;
    store.set(ip, entry);
    if (entry.count > maxReqs) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}
// ── Bot rejection middleware ───────────────────────────────────────────────────
const BOT_UA_PATTERNS = [
  /^$/,                        // empty user-agent
  /curl\//i,
  /python-requests/i,
  /go-http-client/i,
  /java\//i,
  /libwww-perl/i,
  /wget/i,
  /scrapy/i,
  /axios\/[0-9]/i,             // raw axios (not a browser)
  /node-fetch/i,
  /okhttp/i,
];

// Known spam name patterns — catches name-rotating bots
const SPAM_NAME_PATTERNS = [
  /robertwex/i,
  /robert\s*wex/i,
  /aidend\d/i,
  /leonel.*thymn/i,
];

function isSpamName(name) {
  return SPAM_NAME_PATTERNS.some(p => p.test((name || '').trim()));
}

// ── Form token ────────────────────────────────────────────────────────────────
// Short-lived HMAC token that proves the browser loaded the page before submitting.
// Token rotates every 30 minutes; the previous window is also accepted to avoid
// edge-case failures at the boundary.

const FORM_TOKEN_WINDOW_S = 30 * 60;

function generateFormToken() {
  const secret = process.env.FORM_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'dev-insecure';
  const window = Math.floor(Date.now() / 1000 / FORM_TOKEN_WINDOW_S);
  return crypto.createHmac('sha256', secret).update(String(window)).digest('hex');
}

function isValidFormToken(token) {
  if (!token || typeof token !== 'string') return false;
  const secret = process.env.FORM_TOKEN_SECRET || process.env.ADMIN_PASSWORD || 'dev-insecure';
  for (let offset = 0; offset <= 1; offset++) {
    const window = Math.floor(Date.now() / 1000 / FORM_TOKEN_WINDOW_S) - offset;
    const expected = crypto.createHmac('sha256', secret).update(String(window)).digest('hex');
    try {
      if (token.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return true;
    } catch { /* length mismatch or invalid input */ }
  }
  return false;
}

function rejectBots(req, res, next) {
  // Block requests that bypass Cloudflare entirely — set REQUIRE_CLOUDFLARE=true in Railway
  if (!req.headers['cf-ray']) {
    if (process.env.REQUIRE_CLOUDFLARE === 'true') {
      return res.status(400).json({ error: 'Bad request' });
    }
    console.warn('Non-Cloudflare request to form endpoint:', req.method, req.path, req.headers['user-agent']);
  }

  const ua = req.headers['user-agent'] || '';
  if (!ua || BOT_UA_PATTERNS.some(p => p.test(ua))) {
    return res.status(400).json({ error: 'Bad request' });
  }

  // Honeypot: any submission with this field filled in is a bot
  const hp = req.body?.website || req.body?.url || req.body?.company || '';
  if (hp) return res.status(400).json({ error: 'Bad request' });

  // Form token — proves the browser loaded the page. Set REQUIRE_FORM_TOKEN=true in Railway
  if (process.env.REQUIRE_FORM_TOKEN === 'true') {
    const token = req.body?._token || req.headers['x-form-token'] || '';
    if (!isValidFormToken(token)) {
      console.warn('Form token invalid or missing from', req.headers['cf-connecting-ip'] || req.ip);
      return res.status(400).json({ error: 'Bad request' });
    }
  }

  // Block known spam name patterns
  const submittedName = (req.body?.name || req.body?.parent_name || '').trim();
  if (isSpamName(submittedName)) {
    console.warn('Blocked spam name:', submittedName);
    return res.status(400).json({ error: 'Bad request' });
  }

  next();
}

// Bearer-token admin auth for grad order panel
function requireGradAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const adminToken = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD || '';
  if (!adminToken || !token) return res.status(401).json({ error: 'Unauthorized' });
  let valid = false;
  try {
    valid = token.length === adminToken.length &&
      crypto.timingSafeEqual(Buffer.from(token), Buffer.from(adminToken));
  } catch { valid = false; }
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function generateGradRef() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${yy}${mm}-${rand}`;
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function validateGradOrder(body) {
  const errors = [];
  if (!body.parent_name || !String(body.parent_name).trim()) errors.push('parent_name is required');
  if (String(body.parent_name || '').length > 100) errors.push('parent_name too long');
  if (!isValidEmail(body.email)) errors.push('valid email is required');
  if (!body.event_type || !String(body.event_type).trim()) errors.push('event_type is required');
  if (String(body.student_name || '').length > 100) errors.push('student_name too long');
  if (String(body.phone || '').length > 30) errors.push('phone too long');
  if (String(body.school || '').length > 200) errors.push('school too long');
  if (String(body.address || '').length > 300) errors.push('address too long');
  if (String(body.notes || '').length > 2000) errors.push('notes too long');
  if (String(body.upload_link || '').length > 500) errors.push('upload_link too long');
  return errors;
}

function buildOrderEmailTable(order) {
  const lineItems = buildGradLineItems(order);
  if (!lineItems.length) return '<p>No items selected.</p>';
  let total = 0;
  const rows = lineItems.map(({ name, price, quantity }) => {
    const subtotal = price * quantity;
    total += subtotal;
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escHtml(name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${price.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;">$${subtotal.toFixed(2)}</td>
    </tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#0B1F4B;color:#fff;">
        <th style="padding:8px 12px;text-align:left;">Item</th>
        <th style="padding:8px 12px;text-align:center;">Qty</th>
        <th style="padding:8px 12px;text-align:right;">Unit Price</th>
        <th style="padding:8px 12px;text-align:right;">Subtotal</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr style="background:#f9f9f9;font-weight:bold;">
        <td colspan="3" style="padding:10px 12px;text-align:right;">Estimated Total</td>
        <td style="padding:10px 12px;text-align:right;color:#0B1F4B;">$${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  <p style="font-size:12px;color:#999;margin-top:6px;">* Final price confirmed after design review. Does not include applicable taxes or rush fees.</p>`;
}

async function sendGradOrderEmail(order) {
  if (!process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) return;

  const sec = (title, content) =>
    `<div style="margin-bottom:28px;">
      <div style="background:#0B1F4B;color:#fff;padding:8px 16px;border-radius:6px 6px 0 0;font-weight:800;font-size:.9rem;letter-spacing:.04em;text-transform:uppercase;">${title}</div>
      <div style="border:1px solid #E5E7EB;border-top:none;border-radius:0 0 6px 6px;padding:16px;">${content}</div>
    </div>`;

  const row = (label, value) =>
    `<tr><td style="padding:5px 8px 5px 0;font-weight:700;white-space:nowrap;vertical-align:top;width:160px;color:#374151;">${label}</td><td style="padding:5px 0;">${value || '—'}</td></tr>`;

  // Design selections
  const eventTypes = (order.event_type || '').split(',').map(s => s.trim()).filter(Boolean);
  const designMap = { 'senior-night': 'senior_night', 'graduation': 'graduation', 'prom': 'prom' };
  const designSection = eventTypes.map(evt => {
    const key = designMap[evt] || evt.replace('-', '_');
    const name = order.designs?.[`${key}_name`];
    const img  = order.designs?.[`${key}_img`];
    const label = evt.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return `<div style="margin-bottom:12px;">
      <strong>${label}:</strong> ${escHtml(name || order.designs?.[key] || '—')}
      ${img ? `<br/><img src="${escHtml(img)}" alt="${escHtml(name || '')}" style="max-width:220px;margin-top:8px;border-radius:6px;border:1px solid #E5E7EB;" />` : ''}
    </div>`;
  }).join('');

  // Uploaded photos
  const photoHtml = (order.photos || []).length
    ? (order.photos.map((url, i) =>
        `<div style="margin-bottom:10px;">
          <div style="font-size:.82rem;color:#6B7280;margin-bottom:4px;">Photo ${i + 1}: <a href="${escHtml(url)}">${escHtml(url)}</a></div>
          <img src="${escHtml(url)}" alt="Uploaded photo ${i + 1}" style="max-width:300px;border-radius:6px;border:1px solid #E5E7EB;display:block;" />
        </div>`
      ).join(''))
    : '<p style="color:#6B7280;">No photos uploaded.</p>';

  await sendEmail({
    to:      NOTIFY_EMAIL,
    replyTo: order.email || NOTIFY_EMAIL,
    subject: `New Grad Order ${order.order_ref} — ${order.parent_name}`,
    html: `<div style="font-family:sans-serif;max-width:700px;margin:0 auto;color:#1C1C2E;">
      <div style="background:#0B1F4B;padding:20px 24px;border-radius:10px 10px 0 0;margin-bottom:24px;">
        <div style="color:#F4A623;font-size:.8rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">New Grad Order</div>
        <h1 style="color:#fff;font-size:1.4rem;margin:4px 0 0;">${escHtml(order.order_ref)} &mdash; ${escHtml(order.parent_name)}</h1>
      </div>

      ${sec('Customer Info', `<table style="width:100%;border-collapse:collapse;">
        ${row('Parent / Guardian', escHtml(order.parent_name))}
        ${row('Student', escHtml(order.student_name))}
        ${row('Email', `<a href="mailto:${escHtml(order.email)}">${escHtml(order.email)}</a>`)}
        ${row('Phone', `<a href="tel:${escHtml(order.phone)}">${escHtml(order.phone)}</a>`)}
        ${row('Delivery Address', escHtml(order.address))}
      </table>`)}

      ${sec('Event Info', `<table style="width:100%;border-collapse:collapse;">
        ${row('Event Type', escHtml(order.event_type))}
        ${row('Event Date', escHtml(order.event_date))}
        ${row('Order Needed By', escHtml(order.needed_by))}
        ${row('School', escHtml(order.school))}
        ${row('School Colors', escHtml(order.school_colors))}
      </table>`)}

      ${sec('Design Selected', designSection || '<p style="color:#6B7280;">No design selected.</p>')}

      ${sec('Design Notes & Personalization', order.apparel?.design_notes
        ? `<p style="white-space:pre-wrap;margin:0;">${escHtml(order.apparel.design_notes)}</p>`
        : '<p style="color:#6B7280;">None provided.</p>')}

      ${sec('Items Ordered', buildOrderEmailTable(order))}

      ${order.apparel?.shirt_qty > 0 ? sec('Apparel', `<table style="width:100%;border-collapse:collapse;">
        ${row('Total Shirt Qty', String(order.apparel.shirt_qty))}
      </table>`) : ''}

      ${sec('Payment & Proof Agreement', `<table style="width:100%;border-collapse:collapse;">
        ${row('Payment Method', escHtml(order.payment_method))}
        ${row('Signed By', escHtml(order.signature))}
        ${row('Date Signed', escHtml(order.sign_date))}
      </table>
      <p style="margin-top:12px;font-size:.85rem;color:#6B7280;">Customer agreed to: digital proof within 2 business days, 24-hour approval window, 50% deposit invoice via Clover, 7–14 business day production after deposit.</p>`)}

      ${order.notes ? sec('Special Instructions', `<p style="white-space:pre-wrap;margin:0;">${escHtml(order.notes)}</p>`) : ''}

      ${sec(`Uploaded Photos (${(order.photos || []).length})`, photoHtml)}

    </div>`,
  });
}

async function sendGradOrderConfirmationEmail(order) {
  if ((!process.env.BREVO_API_KEY && !process.env.RESEND_API_KEY) || !order.email) return;
  await sendEmail({
    to:      order.email,
    subject: `Your Grad Order is Confirmed — ${order.order_ref}`,
    html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;">
      <h2 style="color:#0B1F4B;">Thanks, ${escHtml(order.parent_name.split(' ')[0])}! 🎓</h2>
      <p>We've received your grad order and will be in touch soon to confirm your design and next steps.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;font-weight:bold;width:140px;">Order Ref</td><td>${escHtml(order.order_ref)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Student</td><td>${escHtml(order.student_name) || '—'}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Event</td><td>${escHtml(order.event_type)} — ${escHtml(order.event_date) || '—'}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Needed By</td><td>${escHtml(order.needed_by) || '—'}</td></tr>
        <tr><td style="padding:6px 0;font-weight:bold;">Payment</td><td>${escHtml(order.payment_method) || '—'}</td></tr>
      </table>
      <h3 style="color:#0B1F4B;">Your Order Summary</h3>
      ${buildOrderEmailTable(order)}
      ${order.apparel?.design_notes ? `<h3 style="color:#0B1F4B;">Your Design Notes</h3><p style="background:#f9f9f9;padding:12px;border-radius:6px;">${escHtml(order.apparel.design_notes)}</p>` : ''}
      ${order.notes ? `<p><strong>Special Instructions:</strong> ${escHtml(order.notes)}</p>` : ''}
      <p style="margin-top:24px;">Questions? Reply to this email or call/text us at <a href="tel:+17738491854">(773) 849-1854</a></p>
      ${designerPromoBlock()}
      <p style="color:#999;font-size:12px;">June's Tees &amp; Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
    </div>`,
  });
}

// Cloudinary public config
app.get('/api/config', signatureRateLimit, (req, res) => {
  res.json({
    cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '',
    cloudinaryApiKey:    process.env.CLOUDINARY_API_KEY    || '',
  });
});

// Cloudinary signed upload
app.post('/api/cloudinary-signature', signatureRateLimit, (req, res) => {
  const apiSecret = process.env.CLOUDINARY_API_SECRET || process.env.CLUDINARY_API_SECRET;
  if (!apiSecret) return res.status(503).json({ error: 'Cloudinary not configured' });
  // Allow the caller to specify the upload folder, but validate against an allowlist
  // so the server retains control over where files can be stored.
  const ALLOWED_FOLDERS = ['grad_orders', 'quote_requests', 'embroidery_quotes'];
  const requestedFolder = typeof req.body.folder === 'string' ? req.body.folder : '';
  const folder = ALLOWED_FOLDERS.includes(requestedFolder) ? requestedFolder : 'grad_orders';
  // Use the widget's timestamp — overwriting it causes a mismatch since the widget
  // uses its own timestamp for the actual upload request, not the one we return.
  const paramsToSign = { ...req.body, folder };
  if (!paramsToSign.timestamp) paramsToSign.timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
  res.json({ signature, timestamp: paramsToSign.timestamp, folder });
});


// Embroidery order request from design.jtees.net product pages.
// Embroidery files (DST/PES/...) can't render in the online designer, so this
// flow collects the file + size + contact info and June follows up directly.
app.post('/api/embroidery-quote', orderRateLimit, async (req, res) => {
  try {
    const b = req.body || {};
    const name  = String(b.name || '').trim().slice(0, 120);
    const email = String(b.email || '').trim().slice(0, 200);
    const phone = String(b.phone || '').trim().slice(0, 40);
    const size  = String(b.size || '').trim().slice(0, 60);
    const qty   = String(b.qty || '').trim().slice(0, 12);
    const product = String(b.product || '').trim().slice(0, 200);
    const hasFile = b.has_file === true || b.has_file === 'yes';
    const fileUrl = String(b.file_url || '').trim().slice(0, 500);
    const notes = String(b.notes || '').trim().slice(0, 2000);
    if (!name || !size || (!email && !phone)) {
      return res.status(400).json({ error: 'Name, embroidery size, and an email or phone number are required.' });
    }
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'That email address does not look valid.' });
    }
    if (fileUrl && !fileUrl.startsWith('https://res.cloudinary.com/')) {
      return res.status(400).json({ error: 'Invalid file reference.' });
    }
    const fileRow = fileUrl
      ? `<tr><td style="padding:8px;font-weight:bold;">File</td><td style="padding:8px;"><a href="${escEmail(fileUrl)}">Download uploaded file</a></td></tr>`
      : `<tr><td style="padding:8px;font-weight:bold;">File</td><td style="padding:8px;">None uploaded — digitizing needed</td></tr>`;
    await sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: email || NOTIFY_EMAIL,
      subject: `New EMBROIDERY request — ${name} (${size})`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1848B8;">New Embroidery Request</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;font-weight:bold;width:140px;">Name</td><td style="padding:8px;">${escEmail(name)}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;">${escEmail(phone) || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;">${escEmail(email) || '—'}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Product</td><td style="padding:8px;">${escEmail(product) || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Embroidery size</td><td style="padding:8px;">${escEmail(size)}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Quantity</td><td style="padding:8px;">${escEmail(qty) || '—'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">Has stitch file</td><td style="padding:8px;">${hasFile ? 'Yes' : 'No (digitizing fee applies)'}</td></tr>
            ${fileRow}
            <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;vertical-align:top;">Notes</td><td style="padding:8px;">${escEmail(notes) || '—'}</td></tr>
          </table>
          <p style="color:#999;font-size:12px;margin-top:24px;">Submitted from design.jtees.net · ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
        </div>`,
    });
    if (email) {
      await sendEmail({
        to: email,
        subject: 'We got your embroidery request!',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#1848B8;">Thanks, ${escEmail(name.split(' ')[0])}!</h2>
            <p>We received your embroidery request (${escEmail(size)}${qty ? ', qty ' + escEmail(qty) : ''}) and will confirm pricing and timing within 1 business day.</p>
            ${hasFile ? '' : '<p>Since you don\'t have a stitch file yet, we\'ll digitize your artwork — the one-time digitizing fee will be included in your quote.</p>'}
            <p>Questions? Call or text <a href="tel:+17738491854">(773) 849-1854</a>.</p>
            ${designerPromoBlock()}
            <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees &amp; Things · Chicago, IL</p>
          </div>`,
      }).catch(() => {});
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('embroidery-quote error:', err.message);
    res.status(500).json({ error: 'Something went wrong — please call or text (773) 849-1854.' });
  }
});


// ─── Internal APIs for design.jtees.net (shared-secret) ──────────────────────

function requireInternalKey(req, res, next) {
  const k = process.env.JT_INTERNAL_KEY;
  if (!k || req.get('X-JT-Key') !== k) return res.status(403).json({ error: 'forbidden' });
  next();
}

// Passwordless login code for customer accounts on the designer site
app.post('/api/send-login-code', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const code = String(req.body.code || '').replace(/\D/g, '').slice(0, 6);
    if (!isValidEmail(email) || code.length !== 6) {
      return res.status(400).json({ error: 'bad input' });
    }
    await sendEmail({
      to: email,
      subject: `${code} is your June's Tees sign-in code`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;text-align:center;">
          <h2 style="color:#1848B8;">Your sign-in code</h2>
          <div style="font-size:38px;font-weight:900;letter-spacing:10px;color:#0B1F4B;background:#F7F6F3;border-radius:12px;padding:18px 0;margin:14px 0;">${code}</div>
          <p style="color:#374151;">Enter this code on design.jtees.net to sign in. It expires in 15 minutes.</p>
          <p style="color:#999;font-size:12px;">Didn't request this? You can ignore this email.</p>
        </div>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('send-login-code error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

// Upsert any designer-captured email into the Brevo CRM (exit popup, saved
// cart, login, order). Fire-and-forget from the designer's jt_crm_contact().
app.post('/api/crm-contact', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const source = String(req.body.source || 'designer').slice(0, 40);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'bad input' });
    await brevo.post('/contacts', {
      email,
      attributes:    { SOURCE: source },
      listIds:       process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
      updateEnabled: true,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('crm-contact error:', err.response?.data?.message || err.message);
    res.status(500).json({ error: 'sync failed' });
  }
});

// Forward a designer event (cart_updated / order_completed) into Brevo so
// Brevo Automations can trigger workflows off it. Fired by jt-auth.php.
app.post('/api/brevo-event', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const eventName = String(req.body.event || '');
    if (!isValidEmail(email) || !/^[a-z_]{3,40}$/.test(eventName)) {
      return res.status(400).json({ error: 'bad input' });
    }
    const props = {};
    if (req.body.item_count !== undefined) props.item_count = parseInt(req.body.item_count, 10) || 0;
    if (req.body.total !== undefined) props.total = Number(req.body.total) || 0;
    if (req.body.restore_url !== undefined) {
      const url = String(req.body.restore_url);
      if (!url.startsWith('https://design.jtees.net/')) return res.status(400).json({ error: 'bad input' });
      props.restore_url = url;
    }
    await brevo.post('/events', {
      event_name: eventName,
      identifiers: { email_id: email },
      event_properties: props,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('brevo-event error:', err.response?.data?.message || err.message);
    res.status(500).json({ error: 'event failed' });
  }
});

// Cart-recovery sequence email (stage 1-5: immediate/4h/24h/3d/7d), triggered
// by the designer at capture time and by its hourly sweep. Empty carts
// (exit-popup leads with no items) get the welcome/discount variant.
// Dedup guard: the PHP sweep is supposed to send each stage once, but overlapping
// sweeps or retries must not double-email a customer.
const recentCartEmails = new Map(); // "email|stage" -> timestamp
const CART_EMAIL_DEDUP_MS = 6 * 60 * 60 * 1000;
app.post('/api/abandoned-cart-email', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const count = parseInt(req.body.item_count, 10) || 0;
    const total = Number(req.body.total || 0);
    const url = String(req.body.restore_url || '');
    const stage = Math.min(5, Math.max(1, parseInt(req.body.stage, 10) || 2));
    if (!isValidEmail(email) || !url.startsWith('https://design.jtees.net/')) {
      return res.status(400).json({ error: 'bad input' });
    }
    const dedupKey = `${email.toLowerCase()}|${stage}`;
    const lastSent = recentCartEmails.get(dedupKey);
    if (lastSent && Date.now() - lastSent < CART_EMAIL_DEDUP_MS) {
      return res.json({ ok: true, deduped: true });
    }
    if (recentCartEmails.size > 5000) {
      for (const [k, t] of recentCartEmails) if (Date.now() - t > CART_EMAIL_DEDUP_MS) recentCartEmails.delete(k);
    }
    const promoCode = activePromoCode();
    const promoPct = parseInt(process.env.JT_PROMO_PCT, 10) || 10;
    const cartLine = `Your cart at June's Tees &amp; Things has <strong>${count} item${count === 1 ? '' : 's'}</strong>${total ? ` (about $${total.toFixed(2)})` : ''} — including your custom design work. It's saved and ready whenever you are.`;
    const copy = count > 0 ? {
      1: { subject: `Your cart is saved + here's ${promoPct}% off ✅`, heading: `We saved your cart!`, body: `${cartLine} This link works on any device, whenever you're ready — and code <strong style="color:#F0275A;">${promoCode}</strong> takes ${promoPct}% off at checkout.`, cta: `Pick Up Where I Left Off →` },
      2: { subject: `Your custom design is waiting for you 🎨`, heading: `You left something great behind!`, body: cartLine, cta: `Pick Up Where I Left Off →` },
      3: { subject: `Take ${promoPct}% off and finish your order 🎉`, heading: `Here's a little something to help`, body: `${cartLine} Use code <strong style="color:#F0275A;">${promoCode}</strong> at checkout for ${promoPct}% off.`, cta: `Finish My Order →` },
      4: { subject: `Still thinking it over? Your design is safe`, heading: `No rush — it's all saved`, body: `${cartLine} Want a hand with sizing, colors, or bulk pricing? Just reply to this email or text us.`, cta: `See My Saved Cart →` },
      5: { subject: `Last call — your saved cart expires soon ⏳`, heading: `Don't lose your design`, body: `${cartLine} Saved carts are cleared after a while, so grab it before it's gone — code <strong style="color:#F0275A;">${promoCode}</strong> still gets you ${promoPct}% off.`, cta: `Rescue My Cart →` },
    } : {
      1: { subject: `Welcome to June's Tees — here's ${promoPct}% off 🎁`, heading: `Thanks for stopping by!`, body: `Ready when you are: design custom tees, hoodies, hats and more in minutes. Use code <strong style="color:#F0275A;">${promoCode}</strong> for ${promoPct}% off your order.`, cta: `Start Designing →` },
      2: { subject: `Ready to create something custom?`, heading: `Your ideas, printed`, body: `Custom apparel for teams, events, businesses and birthdays — designed by you, printed with love in Chicago. Your ${promoPct}% off code <strong style="color:#F0275A;">${promoCode}</strong> is waiting.`, cta: `Start Designing →` },
      3: { subject: `Your ${promoPct}% off code is still waiting 🎉`, heading: `Don't forget your discount`, body: `Code <strong style="color:#F0275A;">${promoCode}</strong> takes ${promoPct}% off anything you design — tees, hoodies, hats, tote bags and more.`, cta: `Browse Products →` },
      4: { subject: `Need ideas? Custom apparel made easy`, heading: `From idea to printed in days`, body: `Family reunions, team uniforms, memorials, birthdays, business merch — tell us what you're planning and we'll help you design it. Reply to this email or text us anytime.`, cta: `Get Started →` },
      5: { subject: `Last call for your ${promoPct}% off ⏳`, heading: `Your discount is about to expire`, body: `This is the last reminder for code <strong style="color:#F0275A;">${promoCode}</strong> — ${promoPct}% off your custom order. We'd love to make something great with you.`, cta: `Use My Discount →` },
    };
    const c = copy[stage];
    recentCartEmails.set(dedupKey, Date.now());
    await sendEmail({
      to: email,
      marketing: true,
      subject: c.subject,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#1848B8;">${c.heading}</h2>
          <p style="color:#374151;">${c.body}</p>
          <p style="text-align:center;margin:26px 0;">
            <a href="${escEmail(url)}" style="background:#1848B8;color:#fff;font-weight:800;text-decoration:none;padding:14px 30px;border-radius:100px;display:inline-block;">${c.cta}</a>
          </p>
          <p style="color:#374151;">Questions or want a hand? Just reply, or call/text <a href="tel:+17738491854">(773) 849-1854</a>.</p>
          <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees &amp; Things · Chicago, IL</p>
        </div>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('abandoned-cart-email error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

/* ══ Quotes ═══════════════════════════════════════════════════════════════
   June texts a short link instead of typing prices into a message. The system
   writes the wording, keeps the record, syncs the contact and chases it up —
   she still sends the text herself from her own number, which keeps it personal
   and avoids US A2P 10DLC carrier registration entirely. */

/* Real Google reviews, mirrored from the storefront. Shown on the quote page
   because someone deciding whether to hand money to a small shop they found
   online is exactly who needs the reassurance. */
const SHOP_REVIEWS = [
  {
    "title": "Quality AND friendly",
    "text": "Went there for an order of 30 shirts. First thing I noticed was her friendly smile. She helped with the design and the shirts came out perfect! Highly recommended!",
    "who": "Rob Simpson · Google Review"
  },
  {
    "title": "Decal on a mirror for my event",
    "text": "Thank you so much June for helping me on two separate projects, especially for putting a decal on a mirror for my event. Amazing work every time!",
    "who": "Nyla Pruitt · Google Review"
  },
  {
    "title": "Great job on the hats",
    "text": "Great job on the hats!! We loved them!",
    "who": "Diane Alarcon · Google Review"
  },
  {
    "title": "A very precious memorial sweatshirt",
    "text": "She did a great job — reasonable pricing on a very precious memorial sweatshirt. So thoughtful and professional throughout the whole process.",
    "who": "Dawn Nash · Google Review"
  },
  {
    "title": "Better than ordering online",
    "text": "June was helpful and accommodative to a small embroidery order I had for polos and dress shirts. Quality turned out great! Much better than trying to find a corporate apparel provider online!",
    "who": "Anthony Krcik · Google Review"
  },
  {
    "title": "Fast turnaround",
    "text": "Fast turn around time. Coat turned out great! Easy to work with. Would highly recommend.",
    "who": "Kim Miniscalco · Google Review"
  },
  {
    "title": "Matched my custom request",
    "text": "They were able to match my custom request and are super reasonably priced. Quality work, completed in a timely manner — would absolutely use them again.",
    "who": "Adrianne Hall · Google Review"
  },
  {
    "title": "Family graduation shirts",
    "text": "I called her to make T-shirts for me and my family for my son's college graduation. She was professional, timely, and the quality was outstanding!",
    "who": "Gloria Silmon · Google Review"
  },
  {
    "title": "Extremely talented",
    "text": "Very professional! Extremely talented artist and she's self taught! Whatever you need she delivers!! I absolutely love her work!",
    "who": "Corvina Hollingsworth · Google Review"
  }
];

/** Auto-scrolling review strip. Pauses on hover/touch so it can be read, and
 *  degrades to a plain scrollable row if the animation is unsupported. */
function reviewStrip() {
  const cards = SHOP_REVIEWS.map(r => `
    <div class="rv">
      <div class="stars">★★★★★</div>
      <div class="rv-t">${escEmail(r.title)}</div>
      <div class="rv-x">${escEmail(r.text)}</div>
      <div class="rv-w">${escEmail(r.who)}</div>
    </div>`).join('');
  // Duplicated once so the marquee loops without a visible jump.
  return `
    <div class="card" style="overflow:hidden">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:10px">
        <b style="color:#0B1F4B">What customers say</b>
        <span class="muted" style="font-size:12px">${SHOP_REVIEWS.length} Google reviews</span>
      </div>
      <div class="rv-wrap"><div class="rv-track">${cards}${cards}</div></div>
    </div>`;
}

const REVIEW_CSS = `
.rv-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.rv-wrap::-webkit-scrollbar{display:none}
.rv-track{display:flex;gap:10px;width:max-content;animation:rvscroll 60s linear infinite}
.rv-wrap:hover .rv-track,.rv-wrap:active .rv-track{animation-play-state:paused}
.rv{flex:0 0 250px;background:#f7f9fc;border:1px solid #e3e8f2;border-radius:12px;padding:12px 14px}
.rv .stars{color:#F4A623;font-size:13px;letter-spacing:1px}
.rv-t{font-weight:700;font-size:13.5px;color:#0B1F4B;margin:4px 0 3px}
.rv-x{font-size:12.5px;line-height:1.5;color:#46505f;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.rv-w{font-size:11px;color:#8b95a5;margin-top:7px}
@keyframes rvscroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.rv-track{animation:none}}
`;

const QUOTE_CODE_RE = /^[A-Z0-9]{6}$/;

/* ── Quote money rules ────────────────────────────────────────────────────
   All in one place so the quote page, the payment page and the emails can
   never disagree about what someone owes. */

const TAX_RATE   = Number(process.env.JT_TAX_RATE || 0.1025);   // Chicago combined
const CARD_FEE   = Number(process.env.JT_CARD_FEE || 0.04);     // 4% card surcharge
const DEPOSIT_PC = Number(process.env.JT_DEPOSIT_PCT || 0.5);   // 50% deposit
const DEPOSIT_FULL_UNDER = Number(process.env.JT_DEPOSIT_FULL_UNDER || 100); // pay in full below this
const ZELLE_HANDLE = process.env.JT_ZELLE || '(773) 849-1854';
/* Zelle shows the ACCOUNT HOLDER's name at confirmation, which is the legal
   name, not the shop name. Saying so up front stops customers stalling when
   "Andrea Winters" appears instead of "June" or "June's Tees". */
const ZELLE_NAME = process.env.JT_ZELLE_NAME || 'Andrea Winters';
// When the remaining balance is expected. Wording only — nothing enforces it.
const BALANCE_WHEN = process.env.JT_BALANCE_WHEN || 'on pickup or before delivery';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Tax applies to Illinois work. Toggle per quote; rate is env-configurable so
 *  it can be corrected without a deploy. */
function quoteTax(subtotal, taxable) {
  return taxable ? round2(Number(subtotal) * TAX_RATE) : 0;
}

/** Deposit: half, unless the job is small enough that it is simpler to take it
 *  all up front. Never more than the total. */
function depositFor(total) {
  const t = round2(total);
  if (t <= 0) return 0;
  if (t < DEPOSIT_FULL_UNDER) return t;
  return Math.min(t, round2(t * DEPOSIT_PC));
}

/** Card surcharge — only applied when they actually choose to pay by card. */
function cardFee(amount) { return round2(Number(amount) * CARD_FEE); }

/** Business-day arithmetic in the shop's timezone, mirroring the designer's
 *  jt_business_days() so the two never quote different lead times. */
function addBusinessDays(from, days) {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) left--;
  }
  return d;
}

/** Estimated ready/delivery window, same env knobs the designer uses. */
function deliveryEstimate(from = new Date()) {
  const pmin = parseInt(process.env.JT_PROD_MIN || '7', 10);
  const pmax = parseInt(process.env.JT_PROD_MAX || '10', 10);
  const smin = parseInt(process.env.JT_SHIP_MIN || '2', 10);
  const smax = parseInt(process.env.JT_SHIP_MAX || '5', 10);
  return {
    ready: addBusinessDays(from, pmin),
    deliver_from: addBusinessDays(from, pmin + smin),
    deliver_to: addBusinessDays(from, pmax + smax),
  };
}

/** Recompute every figure from the stored lines. Single source of truth. */
function quoteTotals(q) {
  const subtotal = round2((q.items || []).reduce((a, i) => a + Number(i.line_total || 0), 0));
  const tax = Number(q.tax != null ? q.tax : 0);
  const total = round2(subtotal + tax);
  return { subtotal, tax, total, deposit: depositFor(total) };
}



function newQuoteCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

/** "24 tees + 12 hoodies" — the {summary} in the text message. */
function quoteSummary(items) {
  const parts = (items || [])
    .filter(i => i && i.description)
    .map(i => {
      const d = String(i.description).trim();
      // A hand-typed description may already start with the quantity.
      const startsWithQty = new RegExp('^' + i.qty + '\\b').test(d);
      return (i.qty > 0 && !startsWithQty) ? `${i.qty} ${d}` : d;
    });
  if (!parts.length) return 'your order';
  if (parts.length <= 2) return parts.join(' + ');
  return `${parts[0]} + ${parts.length - 1} more`;
}

function quoteLink(code) { return `${PUBLIC_BASE_URL}/q/${code}`; }

function fmtDate(d) {
  if (!d) return '';
  // DATE columns carry no time; timezone-converting them shifts the day back.
  const iso = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m && !(String(d).includes('T') && !(d instanceof Date))) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
}

/** The three message templates. Kept together so the voice stays consistent. */
function quoteMessages(q) {
  const first = String(q.name || '').trim().split(/\s+/)[0] || 'there';
  const link = quoteLink(q.code);
  const until = fmtDate(q.valid_until);
  return {
    initial: `Hi ${first} — ${SHOP_SIGNER} from ${SHOP_NAME}. Your quote for ${quoteSummary(q.items)} is ready:\n${link}\n` +
             (until ? `Good through ${until}. ` : '') + `Tap Accept when you're ready, or text me any changes.`,
    followup: `Hi ${first} — just checking in on your quote: ${link}\n` +
              (until ? `Still good through ${until}. ` : '') + `Happy to adjust quantities or colors — just text back.`,
    accepted: `Got it, ${first} — thank you! You're on the schedule. I'll follow up with an artwork proof and timeline. — ${SHOP_SIGNER}, ${SHOP_PHONE}`,
  };
}

/** Brevo's SMS attribute must be E.164 (+1XXXXXXXXXX) — a bare 10-digit
 *  number is rejected outright with "Invalid phone number", which silently
 *  cost the whole contact sync. Returns '' when it cannot be made valid. */
function toE164(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  if (d.length > 11) return '+' + d;      // already international
  return '';                               // too short to be real
}

/** Mirror a quote into Brevo: contact -> deal -> note, same shape as
 *  syncGradToBrevo(). Every call is guarded; the Postgres row already holds the
 *  truth, so a Brevo outage must never surface as a failed quote. */
async function syncQuoteToBrevo(q) {
  const out = { contactId: null, dealId: null };
  const email = String(q.email || '').trim();
  const phone = String(q.phone || '').trim();
  if (!email && !phone) return out;

  const [first, ...rest] = String(q.name || '').trim().split(/\s+/);

  try {
    // Brevo keys contacts on email; fall back to a phone-only contact.
    const attrs = { FIRSTNAME: first || '', LASTNAME: rest.join(' ') || '' };
    const e164 = toE164(phone);
    if (e164) attrs.SMS = e164;
    const body = {
      attributes: attrs,
      listIds: process.env.BREVO_LIST_ID ? [parseInt(process.env.BREVO_LIST_ID)] : [],
      updateEnabled: true,
    };
    // Brevo identifies a contact by email, or by SMS when there is no email.
    if (email) body.email = email;
    else if (e164) body.SMS = e164;
    else return out;                       // nothing to key on
    await brevo.post('/contacts', body);

    if (email) {
      const c = await brevo.get(`/contacts/${encodeURIComponent(email)}`);
      out.contactId = c.data && c.data.id ? String(c.data.id) : null;
    }
  } catch (err) {
    console.error('quote->brevo contact failed:', err.response?.data?.message || err.message);
  }

  try {
    const lines = (q.items || []).map(i =>
      `  ${i.qty} x ${i.description}` +
      (i.unit_price != null ? ` @ ${money(i.unit_price)}` : '') +
      (i.line_total != null ? ` = ${money(i.line_total)}` : '') +
      (i.manual ? '   [manual price]' : '')
    ).join('\n');
    const noteText =
      `QUOTE ${q.code} — ${money(q.subtotal)}\n` +
      `${lines}\n` +
      (q.notes ? `\nNOTES:\n  ${q.notes}\n` : '') +
      `\nLink: ${quoteLink(q.code)}` +
      (q.valid_until ? `\nValid until: ${fmtDate(q.valid_until)}` : '');

    const deal = await brevo.post('/crm/deals', {
      name: `Quote — ${q.name || phone || email} (${q.code})`,
      attributes: {
        amount: parseFloat(Number(q.subtotal || 0).toFixed(2)),
        close_date: q.valid_until ? new Date(q.valid_until).toISOString() : new Date().toISOString(),
      },
    });
    out.dealId = deal.data && deal.data.id ? String(deal.data.id) : null;

    if (out.dealId && out.contactId) {
      await brevo.patch(`/crm/deals/${out.dealId}`, { linkedContactsIds: [parseInt(out.contactId)] })
        .catch(e => console.error('quote deal link failed:', e.response?.data?.message || e.message));
    }
    if (out.dealId) {
      await brevo.post('/crm/notes', {
        text: noteText,
        ...(out.contactId ? { contactIds: [parseInt(out.contactId)] } : {}),
        dealIds: [out.dealId],
      }).catch(e => console.error('quote note failed:', e.response?.data?.message || e.message));
    }
  } catch (err) {
    console.error('quote->brevo deal failed:', err.response?.data?.message || err.message);
  }

  return out;
}

/** Push the lead into the Lumise Customers page (separate database, reached
 *  over the shared internal key). Fire-and-forget by design. */
async function syncQuoteToLumise(q) {
  const key = process.env.JT_INTERNAL_KEY;
  if (!key) return;
  try {
    const url = `https://design.jtees.net/jt-contact.php?key=${encodeURIComponent(key)}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: q.name || '', email: q.email || '', phone: q.phone || '',
        note: `Quote ${q.code} — ${money(q.subtotal)} (${quoteSummary(q.items)})`,
        source: 'quote',
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('quote->lumise failed:', err.message);
  }
}

/* ── Quote routes ────────────────────────────────────────────────────────── */

const QUOTE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#f4f6fb;color:#12203c;padding:16px}
.wrap{max-width:640px;margin:0 auto}
h1{font-size:21px;margin-bottom:2px;color:#0B1F4B}
.sub{color:#6b7280;font-size:13px;margin-bottom:16px}
.card{background:#fff;border:1px solid #e3e8f2;border-radius:14px;padding:18px;margin-bottom:14px;box-shadow:0 1px 3px rgba(12,28,60,.05)}
label{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin:12px 0 5px}
input,select,textarea{width:100%;padding:12px;border:1px solid #cfd8e8;border-radius:9px;font-size:16px;font-family:inherit;background:#fff}
input:focus,select:focus,textarea:focus{outline:2px solid #1848B8;outline-offset:-1px;border-color:#1848B8}
.row{display:flex;gap:10px}.row>*{flex:1}
button,.btn{display:inline-block;text-align:center;background:#1848B8;color:#fff;border:0;border-radius:100px;padding:14px 26px;font-size:16px;font-weight:700;cursor:pointer;text-decoration:none;font-family:inherit}
button:active{transform:translateY(1px)}
.btn-ghost{background:#eef1f8;color:#33415c}
.items th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#8b95a5;padding:6px 4px;border-bottom:1px solid #e3e8f2}
.items td{padding:9px 4px;border-bottom:1px solid #f0f3f9;vertical-align:top}
.items{width:100%;border-collapse:collapse}
.num{text-align:right;white-space:nowrap}
.tot{font-size:19px;font-weight:800;color:#0B1F4B}
.msg{background:#0B1F4B;color:#e8eefc;border-radius:12px;padding:14px;white-space:pre-wrap;font-size:14px;line-height:1.55;margin:12px 0}
.ok{background:#e7f6ec;border:1px solid #b7e0c4;color:#166534;padding:12px 14px;border-radius:10px;margin-bottom:12px}
.warn{background:#fdecea;border:1px solid #f5c6cb;color:#b71c1c;padding:12px 14px;border-radius:10px;margin-bottom:12px}
.chip{display:inline-block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:3px 10px;border-radius:20px}
.muted{color:#6b7280;font-size:13px}
@media(max-width:560px){.row{flex-direction:column;gap:0}}
`;

function quotePage(title, body) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${escEmail(title)}</title><style>${QUOTE_CSS}${REVIEW_CSS}</style></head><body><div class="wrap">${body}</div></body></html>`;
}

/* The form June opens on her phone. Also serves /quote/:code/edit, pre-filled,
   so editing is the same screen rather than a second thing to maintain. */
app.get(['/quote/new', '/quote/:code/edit'], requireAdmin, async (req, res) => {
  let catalog = { products: [], methods: [] };
  try { catalog = await getCatalog(); } catch (e) { /* form still works manually */ }

  let existing = null;
  const editCode = String(req.params.code || '').toUpperCase();
  if (QUOTE_CODE_RE.test(editCode)) {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [editCode]);
    if (!rows.length) {
      return res.status(404).send(quotePage('Not found',
        `<div class="card"><div class="warn">No quote with that code.</div>
         <a class="btn btn-ghost" href="/quotes">All quotes</a></div>`));
    }
    existing = rows[0];
  }
  const E = existing || {};
  const eItems = (E.items && E.items.length) ? E.items : [null];
  const val = (v) => v == null ? '' : escEmail(String(v));
  const [eFirst, ...eRest] = String(E.name || '').trim().split(/\s+/);

  const prodOpts = catalog.products.map(p =>
    `<option value="${escEmail(String(p.id))}">${escEmail(p.name)} — ${money(p.price)}</option>`
  ).join('');
  const methodOpts = catalog.methods
    .filter(m => m.use_for_quoting && Object.keys(m.positions || {}).length)
    .map(m => `<option value="${m.id}">${escEmail(m.title)}</option>`).join('');

  const lineHtml = (n, it) => `
    <div class="line" data-n="${n}">
      <div class="row">
        <div style="flex:2"><select name="product${n}" class="p"><option value="">— product (or type below) —</option>${prodOpts}</select></div>
      </div>
      <div class="row">
        <div style="flex:2"><select name="method${n}" class="m"><option value="">— decoration —</option>${methodOpts}</select></div>
      </div>
      <input name="description${n}" class="d" value="${it ? val(it.description) : ''}" placeholder="Description (type anything for a custom line)">
      <input name="details${n}" class="dt" value="${it ? val(it.details) : ''}" placeholder="Details the customer should see (colour, ink, placement…)" style="margin-top:6px">
      <div class="shots" style="margin-top:8px">
        <label style="margin:0 0 6px">Photos / mockups</label>
        <input type="file" class="fi" accept="image/*" multiple style="padding:8px;font-size:14px">
        <input type="hidden" name="images${n}" class="im" value="${it && it.images ? escEmail(JSON.stringify(it.images)) : ''}">
        <div class="thumbs" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px"></div>
      </div>
      <div class="sizes" style="display:none;margin-top:8px"></div>
      <input type="hidden" name="sizemix${n}" class="sm" value="">
      <div class="row" style="margin-top:8px">
        <div><input name="qty${n}" class="q" type="number" inputmode="numeric" min="1" value="${it ? val(it.qty) : ''}" placeholder="Qty"></div>
        <div><input name="unit_price${n}" class="u" type="number" step="0.01" inputmode="decimal" value="${it && it.manual ? val(it.unit_price) : ''}" placeholder="Each $"></div>
        <div style="flex:0 0 84px;display:flex;align-items:center;justify-content:flex-end"><b class="lt muted">—</b></div>
      </div>
    </div>`;

  res.send(quotePage('New quote', `
    <h1>${existing ? 'Edit quote ' + escEmail(existing.code) : 'New quote'}</h1>
    <div class="sub">${existing
      ? 'Their link stays the same — it updates the moment you save.'
      : 'Fills in the message for you — you still send it from your phone.'}</div>
    ${existing && existing.change_request ? `<div class="card"><b>They asked for:</b>
      <div class="muted" style="margin-top:6px">"${escEmail(existing.change_request)}"</div></div>` : ''}
    <form method="POST" action="${existing ? '/api/quotes/' + existing.code : '/api/quotes'}" id="qf">
      <div class="card">
        <div class="row">
          <div><label>First name <span style="text-transform:none;font-weight:400">(optional)</span></label>
               <input name="first_name" value="${val(eFirst)}" autocomplete="off"></div>
          <div><label>Last name <span style="text-transform:none;font-weight:400">(optional)</span></label>
               <input name="last_name" value="${val(eRest.join(' '))}" autocomplete="off"></div>
        </div>
        <div class="row">
          <div><label>Mobile <span style="text-transform:none;font-weight:400">(optional)</span></label><input name="phone" type="tel" inputmode="tel" value="${val(E.phone)}" autocomplete="off"></div>
          <div><label>Email <span style="text-transform:none;font-weight:400">(optional)</span></label><input name="email" type="email" value="${val(E.email)}" autocomplete="off"></div>
        </div>
        <p class="muted" style="margin-top:8px">All optional. Leave the name blank for an online or walk-up enquiry and
          the customer is asked for it when they open the quote. Phone or email — either one is enough;
          with neither you still get a link you can show or print.</p>
        <div id="prior"></div>
      </div>

      <div class="card">
        <label style="margin-top:0">Items</label>
        <div id="lines">${eItems.map((it, ix) => lineHtml(ix, it)).join('')}</div>
        <button type="button" class="btn btn-ghost" style="padding:9px 18px;font-size:14px" onclick="addLine()">+ Add another item</button>
        <table style="width:100%;margin-top:14px;border-top:1px solid #e3e8f2;padding-top:10px">
          <tr><td class="muted">Subtotal</td><td class="num" id="sub">$0.00</td></tr>
          <tr><td class="muted"><label style="display:inline;margin:0;text-transform:none;letter-spacing:0;font-size:14px;font-weight:400">
            <input type="checkbox" name="taxable" value="1" ${!existing || Number(E.tax) > 0 ? 'checked' : ''} style="width:auto;margin-right:6px" onchange="calc()"> Illinois sales tax</label></td>
            <td class="num" id="tax">$0.00</td></tr>
          <tr><td class="tot">Total</td><td class="num tot" id="tot">$0.00</td></tr>
          <tr><td class="muted" style="padding-top:6px">Deposit to start</td><td class="num" id="dep" style="padding-top:6px">$0.00</td></tr>
        </table>
      </div>

      <div class="card">
        <label>Needed by <span style="text-transform:none;font-weight:400">(optional)</span></label>
        <input name="needed_by" type="date" value="${E.needed_by ? String(E.needed_by).slice(0,10) : ''}">
        <p class="muted" id="eta" style="margin-top:8px"></p>
        <label>Quote good for (days)</label>
        <input name="valid_days" type="number" value="14" inputmode="numeric">
        <label>Notes for the customer</label><textarea name="notes" rows="2" placeholder="Optional">${val(E.notes)}</textarea>
      </div>

      <button type="submit">${existing ? 'Save changes' : 'Create quote &amp; get the message'}</button>
    </form>
    <p style="margin-top:14px"><a class="muted" href="/quotes">View all quotes →</a></p>
    <script>
      var CAT = ${JSON.stringify(catalog)};
      var TAX = ${TAX_RATE}, DEP = ${DEPOSIT_PC}, FULL_UNDER = ${DEPOSIT_FULL_UNDER};
      var n = ${eItems.length};
      function tierFor(m, qty){
        var pos = m && m.positions ? (m.positions.front || m.positions[Object.keys(m.positions)[0]]) : null;
        if (!pos || !pos.length) return 0;
        var price = pos[0].price;
        for (var i=0;i<pos.length;i++) if (qty >= pos[i].min_qty) price = pos[i].price;
        return price;
      }
      function m2(v){ return '$' + (Math.round(v*100)/100).toFixed(2); }
      /* One tap to charge a returning customer what they paid last time — this
         is what actually stops prices drifting between jobs. */
      function usePrice(v){
        var line = document.querySelector('.line');
        if (!line) return;
        line.querySelector('.u').value = v.toFixed(2);
        calc();
        line.querySelector('.u').scrollIntoView({block:'center', behavior:'smooth'});
      }
      /* Draw a size row for the chosen product so extended-size upcharges are
         applied automatically instead of being forgotten. */
      function buildSizes(L, prod){
        var box = L.querySelector('.sizes');
        var key = prod ? String(prod.id) : '';
        if (box.dataset.for === key) return;
        box.dataset.for = key;
        if (!prod || !prod.sizes || !prod.sizes.length) { box.style.display='none'; box.innerHTML=''; return; }
        box.style.display = 'block';
        box.innerHTML = '<div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">How many of each size</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:6px">' +
          prod.sizes.map(function(sz){
            return '<label style="flex:0 0 62px;text-align:center;margin:0">' +
              '<span style="display:block;font-size:11px;color:#6b7280">' + sz.size +
              (sz.upcharge>0 ? '<br><span style="color:#b45309">+$'+sz.upcharge.toFixed(2)+'</span>' : '<br>&nbsp;') + '</span>' +
              '<input type="number" min="0" inputmode="numeric" class="sz" data-size="'+sz.size+'" data-up="'+sz.upcharge+
              '" style="padding:7px;text-align:center" placeholder="0"></label>';
          }).join('') + '</div>';
        box.querySelectorAll('.sz').forEach(function(el){ el.oninput = calc; });
      }

      function calc(){
        var sub = 0;
        document.querySelectorAll('.line').forEach(function(L){
          var prod = CAT.products.find(function(x){return String(x.id)===L.querySelector('.p').value;});
          var meth = CAT.methods.find(function(x){return String(x.id)===L.querySelector('.m').value;});
          var u    = L.querySelector('.u');
          var qEl  = L.querySelector('.q');
          buildSizes(L, prod);

          var boxes = L.querySelectorAll('.sz');
          var mix = {}, sizeQty = 0, upTotal = 0;
          boxes.forEach(function(el){
            var v = parseInt(el.value,10)||0;
            if (v>0){ mix[el.dataset.size]=v; sizeQty+=v; upTotal += v * parseFloat(el.dataset.up||0); }
          });
          L.querySelector('.sm').value = sizeQty ? JSON.stringify(mix) : '';

          // Sizes drive the quantity when a product is chosen.
          var qty = sizeQty > 0 ? sizeQty : (parseInt(qEl.value,10)||0);
          if (sizeQty > 0) { qEl.value = sizeQty; qEl.readOnly = true; } else { qEl.readOnly = false; }

          var base = prod ? prod.price + tierFor(meth, qty) : 0;
          if (prod) u.placeholder = base.toFixed(2);
          var unit = u.value !== '' ? parseFloat(u.value) : base;
          // Upcharges apply only to the pieces in those sizes.
          var lt = (unit||0) * qty + (u.value !== '' ? 0 : upTotal);
          L.querySelector('.lt').textContent = lt ? m2(lt) : '—';
          sub += lt;

          var d = L.querySelector('.d');
          if (!d.value && prod) d.value = prod.name + (meth ? ' — ' + meth.title : '');
        });
        var tax = document.querySelector('[name=taxable]').checked ? sub*TAX : 0;
        var tot = sub + tax;
        var dep = tot <= 0 ? 0 : (tot < FULL_UNDER ? tot : tot*DEP);
        document.getElementById('sub').textContent = m2(sub);
        document.getElementById('tax').textContent = m2(tax);
        document.getElementById('tot').textContent = m2(tot);
        document.getElementById('dep').textContent = m2(dep) + (tot>0 && tot<FULL_UNDER ? ' (paid in full)' : ' (50%)');
      }
      function addLine(){
        var tpl = document.getElementById('lines').firstElementChild.cloneNode(true);
        tpl.querySelectorAll('input,select').forEach(function(el){
          /* \\d, not \d — this whole script lives inside a template literal, so a
             single backslash is eaten before the browser ever sees it. It was,
             and /d+$/ matched nothing: every added line kept the first line's
             name, so five items posted as one and the price arrived as NaN. */
          el.name = el.name.replace(/\\d+$/, n); el.value='';
        });
        tpl.querySelector('.lt').textContent = '—';
        document.getElementById('lines').appendChild(tpl); n++;
        bind();
      }
      var CLOUD = ${JSON.stringify(process.env.CLOUDINARY_NAME || '')};
      var CKEY  = ${JSON.stringify(process.env.CLOUDINARY_API_KEY || '')};

      /* Upload through the existing signed-upload endpoint so the API secret
         never reaches the browser. Files go to the allow-listed
         "quote_requests" folder. */
      function uploadFiles(L, files){
        if (!CLOUD || !CKEY || !files.length) return;
        var hidden = L.querySelector('.im');
        var thumbs = L.querySelector('.thumbs');
        Array.prototype.forEach.call(files, function(file){
          var ph = document.createElement('div');
          ph.style.cssText = 'width:58px;height:58px;border-radius:8px;background:#eef1f8;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6b7280';
          ph.textContent = '…';
          thumbs.appendChild(ph);
          var ts = Math.round(Date.now()/1000);
          fetch('/api/cloudinary-signature', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ folder:'quote_requests', timestamp: ts })
          }).then(function(r){return r.json();}).then(function(sig){
            var fd = new FormData();
            fd.append('file', file);
            fd.append('api_key', CKEY);
            fd.append('timestamp', sig.timestamp);
            fd.append('folder', sig.folder);
            fd.append('signature', sig.signature);
            return fetch('https://api.cloudinary.com/v1_1/'+CLOUD+'/image/upload', {method:'POST', body:fd});
          }).then(function(r){return r.json();}).then(function(d){
            if(!d.secure_url) throw new Error(d.error ? d.error.message : 'upload failed');
            var list = hidden.value ? JSON.parse(hidden.value) : [];
            list.push(d.secure_url);
            hidden.value = JSON.stringify(list);
            ph.style.background = 'url('+d.secure_url+') center/cover';
            ph.textContent = '';
          }).catch(function(e){
            ph.textContent = '✕'; ph.style.color = '#b71c1c';
            console.error('upload failed', e);
          });
        });
      }

      function bind(){
        document.querySelectorAll('#qf input, #qf select').forEach(function(el){
          if (el.type === 'file') return;
          el.oninput = calc; el.onchange = calc;
        });
        document.querySelectorAll('.fi').forEach(function(fi){
          fi.onchange = function(){ uploadFiles(fi.closest('.line'), fi.files); };
        });
      }
      bind(); calc();
      // Delivery estimate hint
      var eta = ${JSON.stringify(deliveryEstimate())};
      document.getElementById('eta').textContent =
        'Typical turnaround: ready about ' + new Date(eta.ready).toLocaleDateString('en-US',{month:'short',day:'numeric'}) +
        ', delivered ' + new Date(eta.deliver_from).toLocaleDateString('en-US',{month:'short',day:'numeric'}) +
        '–' + new Date(eta.deliver_to).toLocaleDateString('en-US',{month:'short',day:'numeric'}) + '.';
      // Prior pricing for a returning customer
      var t;
      function lookup(){
        clearTimeout(t); t = setTimeout(function(){
          var f = document.forms[0];
          var q = (f.phone.value||f.email.value||'').trim();
          if(q.length < 5){ document.getElementById('prior').innerHTML=''; return; }
          fetch('/api/quotes/prior?q='+encodeURIComponent(q))
            .then(function(r){return r.json();})
            .then(function(d){
              if(!d.found){ document.getElementById('prior').innerHTML=''; return; }
              var lines = (d.lines||[]).map(function(l,ix){
                return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:5px">'+
                  '<span style="font-size:12.5px">'+l.desc+'</span>'+
                  '<button type="button" class="btn btn-ghost" style="padding:4px 10px;font-size:12px;white-space:nowrap"'+
                  ' onclick="usePrice('+l.unit+')">$'+l.unit.toFixed(2)+' ea — use</button></div>';
              }).join('');
              document.getElementById('prior').innerHTML =
                '<div class="ok" style="margin-top:12px">'+
                '<b>Returning customer</b> — '+d.count+' quote'+(d.count===1?'':'s')+
                ', quoted '+d.lifetime_quoted+', paid '+d.lifetime_spent+
                ' &middot; <a href="'+d.link+'" target="_blank">full history</a>'+
                '<div class="muted" style="margin-top:6px;font-size:12px">Last quoted '+d.when+':</div>'+
                lines+'</div>';
            }).catch(function(){});
        }, 400);
      }
      document.forms[0].phone.addEventListener('input', lookup);
      document.forms[0].email.addEventListener('input', lookup);
    </script>
  `));
});

/* Catalogue from the designer, cached. Falls back to the last good copy so a
   slow designer never blocks quoting. */
let _catCache = { at: 0, data: null };
async function getCatalog() {
  if (_catCache.data && Date.now() - _catCache.at < 10 * 60 * 1000) return _catCache.data;
  const key = process.env.JT_INTERNAL_KEY;
  if (!key) return _catCache.data || { products: [], methods: [] };
  try {
    const r = await fetch(`https://design.jtees.net/jt-catalog.php?key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d && d.ok) { _catCache = { at: Date.now(), data: d }; return d; }
    throw new Error('bad payload');
  } catch (err) {
    console.error('catalog fetch failed:', err.message);
    return _catCache.data || { products: [], methods: [] };
  }
}

/** Everything known about one customer, matched across phone and email so a
 *  person quoted by text and one who ordered online resolve to the same record.
 *  Phone matching uses the last 10 digits, since formatting varies wildly. */
async function customerHistory(q) {
  const email = String(q || '').includes('@') ? String(q).trim().toLowerCase() : '';
  const digits = String(q || '').replace(/\D/g, '').slice(-10);
  if (!email && digits.length < 10) return null;

  const { rows } = await pool.query(
    `SELECT * FROM quotes
      WHERE ($1 <> '' AND lower(email) = $1)
         OR ($2 <> '' AND regexp_replace(coalesce(phone,''), '\\D', '', 'g') LIKE '%' || $2)
      ORDER BY created_at DESC`, [email, digits]);
  if (!rows.length) return null;

  const paidRows = rows.filter(r => Number(r.paid_amount || 0) > 0);
  const quoted = rows.reduce((a, r) => a + Number(r.total || r.subtotal || 0), 0);
  const spent = paidRows.reduce((a, r) => a + Number(r.paid_amount || 0), 0);
  const accepted = rows.filter(r => r.accepted_at).length;

  // Per-year, so a glance shows whether they are a repeat buyer or a repeat asker.
  const byYear = {};
  for (const r of rows) {
    const y = new Date(r.created_at).getFullYear();
    byYear[y] = byYear[y] || { quoted: 0, spent: 0, count: 0 };
    byYear[y].quoted += Number(r.total || r.subtotal || 0);
    byYear[y].spent += Number(r.paid_amount || 0);
    byYear[y].count++;
  }

  const name = (rows.find(r => r.name) || {}).name || '';
  return {
    name,
    email: (rows.find(r => r.email) || {}).email || '',
    phone: (rows.find(r => r.phone) || {}).phone || '',
    quotes: rows,
    count: rows.length,
    accepted,
    quoted: round2(quoted),
    spent: round2(spent),
    first: rows[rows.length - 1].created_at,
    last: rows[0].created_at,
    byYear,
  };
}

/* Prior pricing for a returning customer — what keeps a repeat quote consistent. */
app.get('/api/quotes/prior', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 5) return res.json({ found: false });
  const digits = q.replace(/\D/g, '');
  try {
    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE (email <> '' AND lower(email) = lower($1))
           OR ($2 <> '' AND regexp_replace(coalesce(phone,''), '\\D', '', 'g') LIKE '%' || $2)
        ORDER BY created_at DESC LIMIT 25`, [q, digits.slice(-10)]);
    if (!rows.length) return res.json({ found: false });
    const last = rows[0];
    const item = (last.items || [])[0] || {};
    const quoted = rows.reduce((a, r) => a + Number(r.total || r.subtotal || 0), 0);
    // Spent means money actually received, not merely accepted.
    const spent = rows.reduce((a, r) => a + Number(r.paid_amount || 0), 0);
    res.json({
      found: true,
      name: last.name || '',
      summary: quoteSummary(last.items),
      unit: item.unit_price != null ? money(item.unit_price) + ' ea' : money(last.total || last.subtotal),
      when: fmtDate(last.created_at),
      count: rows.length,
      lifetime_quoted: money(quoted),
      lifetime_spent: money(spent),
      link: `/customer?q=${encodeURIComponent(last.email || last.phone || '')}`,
      // The exact lines they were charged before, so a repeat quote can match.
      lines: (last.items || []).slice(0, 4).map(i => ({
        desc: i.description, qty: i.qty, unit: Number(i.unit_price || 0),
      })),
    });
  } catch (err) {
    console.error('prior lookup failed:', err.message);
    res.json({ found: false });
  }
});

/* Create a quote, then show the ready-to-send message. */
app.post(['/api/quotes', '/api/quotes/:code'], requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const name = [String(b.first_name || '').trim(), String(b.last_name || '').trim()]
      .filter(Boolean).join(' ').slice(0, 120)
      || String(b.name || '').trim().slice(0, 120);
    const phone = String(b.phone || '').trim().slice(0, 40);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);

    const catalog = await getCatalog();

    /* Collect however many item rows the form posted. Any row with a
       description or a quantity counts; a product is optional so a purely
       manual line ("banner, 3ft x 8ft") works exactly as well. */
    const items = [];
    /* Two fields sharing a name arrive as an array. Stringifying one silently
       merges every value into a single field and turns a price into NaN, which
       renders as $0.00 — so read only the first value. */
    const one = (v) => (Array.isArray(v) ? v[0] : v);
    for (let i = 0; i < 40; i++) {
      const desc = String(one(b['description' + i]) || '').trim();
      const qty = parseInt(one(b['qty' + i]), 10) || 0;
      const prod = catalog.products.find(p => String(p.id) === String(one(b['product' + i])));
      const method = catalog.methods.find(m => String(m.id) === String(one(b['method' + i])));
      /* Count a row as real if ANY field was filled in. Previously a line with
         only a price (or only a size mix) was silently dropped, which for a
         single-line quote produced "Add at least one item" and lost the work. */
      const priceTyped = String(one(b['unit_price' + i]) || '').trim() !== '';
      const sizeTyped = String(one(b['sizemix' + i]) || '').trim() !== '';
      const detailTyped = String(one(b['details' + i]) || '').trim() !== '';
      if (!desc && !qty && !prod && !priceTyped && !sizeTyped && !detailTyped) continue;

      /* Size mix, when the product has sizes. Extended sizes carry an upcharge
         that applies only to those pieces — quoting 24 shirts of which 4 are
         2XL is NOT the same price as 24 mediums, and forgetting that silently
         eats the difference on every order. */
      let mix = null, sizeQty = 0, upTotal = 0;
      try {
        const parsed = JSON.parse(one(b['sizemix' + i]) || 'null');
        if (parsed && typeof parsed === 'object') {
          mix = {};
          for (const [sz, n] of Object.entries(parsed)) {
            const c = parseInt(n, 10) || 0;
            if (c <= 0) continue;
            mix[sz] = c;
            sizeQty += c;
            const row = prod && prod.sizes ? prod.sizes.find(x => x.size === sz) : null;
            upTotal += c * Number(row ? row.upcharge : 0);
          }
          if (!sizeQty) mix = null;
        }
      } catch { mix = null; }

      const q = sizeQty > 0 ? sizeQty : (qty || 1);

      const rawUnit = one(b['unit_price' + i]);
      let unit = (rawUnit !== '' && rawUnit != null) ? Number(rawUnit) : null;
      // A price that will not parse must never become NaN and show as $0.00.
      if (unit != null && !Number.isFinite(unit)) unit = null;
      const manual = unit != null;
      if (unit == null && prod) {
        let tier = 0;
        const pos = method && method.positions
          ? (method.positions.front || method.positions[Object.keys(method.positions)[0]]) : null;
        if (pos && pos.length) { tier = pos[0].price; for (const t of pos) if (q >= t.min_qty) tier = t.price; }
        unit = Number(prod.price) + Number(tier);
      }
      if (unit == null) unit = 0;

      // A manually typed unit price is taken as final — no upcharges layered on.
      const lineTotal = round2(unit * q + (manual ? 0 : upTotal));

      let description = desc || (prod ? `${prod.name}${method ? ' — ' + method.title : ''}` : 'Custom item');
      if (mix) description += ` (${Object.entries(mix).map(([sz, n]) => `${n} ${sz}`).join(', ')})`;

      /* Only accept our own Cloudinary URLs — these are rendered straight into
         the customer's page, so an arbitrary URL would let anything be embedded. */
      let images = [];
      try {
        const parsed = JSON.parse(one(b['images' + i]) || '[]');
        if (Array.isArray(parsed)) {
          images = parsed
            .filter(u => typeof u === 'string' && /^https:\/\/res\.cloudinary\.com\//.test(u))
            .slice(0, 6);
        }
      } catch { images = []; }
      // Fall back to the catalogue photo so a line is never imageless.
      if (!images.length && prod && prod.thumbnail && /^https?:\/\//.test(prod.thumbnail)) {
        images = [prod.thumbnail];
      }

      items.push({
        description,
        details: String(one(b['details' + i]) || '').trim().slice(0, 300),
        images,
        qty: q,
        unit_price: round2(lineTotal / q),      // blended, so qty x each = total
        line_total: lineTotal,
        size_mix: mix,
        size_upcharge: round2(manual ? 0 : upTotal),
        manual,
        product_id: prod ? prod.id : null,
        method_id: method ? method.id : null,
      });
    }

    if (!items.length) {
      const backTo = QUOTE_CODE_RE.test(String(req.params.code || '').toUpperCase())
        ? `/quote/${String(req.params.code).toUpperCase()}/edit` : '/quote/new';
      return res.status(400).send(quotePage('Nothing to quote', `
        <div class="card">
          <div class="warn">Nothing was saved — the quote needs at least one item.</div>
          <p class="muted" style="margin-top:8px">Fill in a description, or pick a product and a quantity.
             A price on its own is enough too.</p>
          <p style="margin-top:12px"><a class="btn" href="${backTo}">Go back</a></p>
        </div>`));
    }

    const subtotal = round2(items.reduce((a, i) => a + i.line_total, 0));
    const taxable = b.taxable === '1' || b.taxable === 'on' || b.taxable === true;
    const tax = quoteTax(subtotal, taxable);
    const total = round2(subtotal + tax);
    const deposit = depositFor(total);

    const days = Math.max(1, parseInt(b.valid_days, 10) || 14);
    const validUntil = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const neededBy = String(b.needed_by || '').trim() || null;

    const editing = String(req.params.code || '').toUpperCase();
    let rows;

    if (QUOTE_CODE_RE.test(editing)) {
      /* Edit in place. The code never changes, so the link the customer already
         has updates itself — no need to re-send unless June wants to. Clearing
         change_request marks the request as handled. */
      ({ rows } = await pool.query(
        `UPDATE quotes SET name=$2, phone=$3, email=$4, items=$5, subtotal=$6, tax=$7,
                total=$8, deposit=$9, notes=$10, valid_until=$11, needed_by=$12,
                change_request=NULL, revision=COALESCE(revision,1)+1,
                status = CASE WHEN accepted_at IS NULL THEN 'sent' ELSE status END
          WHERE code=$1 RETURNING *`,
        [editing, name, phone, email, JSON.stringify(items), subtotal, tax, total, deposit,
         String(b.notes || '').trim().slice(0, 2000), validUntil, neededBy]));
      if (!rows.length) {
        return res.status(404).send(quotePage('Not found',
          `<div class="card"><div class="warn">That quote no longer exists.</div>
           <a class="btn btn-ghost" href="/quotes">All quotes</a></div>`));
      }
    } else {
      let code = newQuoteCode();
      for (let i = 0; i < 5; i++) {
        const { rows: dup } = await pool.query('SELECT 1 FROM quotes WHERE code=$1', [code]);
        if (!dup.length) break;
        code = newQuoteCode();
      }
      ({ rows } = await pool.query(
        `INSERT INTO quotes (code,name,phone,email,items,subtotal,tax,total,deposit,notes,status,valid_until,needed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'sent',$11,$12) RETURNING *`,
        [code, name, phone, email, JSON.stringify(items), subtotal, tax, total, deposit,
         String(b.notes || '').trim().slice(0, 2000), validUntil, neededBy]));
    }

    const q = rows[0];
    const code = q.code;

    syncQuoteToBrevo(q).then(ids => {
      if (ids.contactId || ids.dealId) {
        pool.query('UPDATE quotes SET brevo_contact_id=$1, brevo_deal_id=$2 WHERE id=$3',
          [ids.contactId, ids.dealId, q.id]).catch(() => {});
      }
    }).catch(() => {});
    syncQuoteToLumise(q).catch(() => {});

    const msgs = quoteMessages(q);
    const digits = phone.replace(/[^0-9+]/g, '');
    const smsHref = digits
      ? `sms:${digits}${/iPhone|iPad|Mac/.test(req.get('user-agent') || '') ? '&' : '?'}body=${encodeURIComponent(msgs.initial)}`
      : '';

    res.send(quotePage('Quote ready', `
      <h1>Quote ${escEmail(code)}${q.revision > 1 ? ` <span class="muted" style="font-size:14px">rev ${q.revision}</span>` : ''}</h1>
      <div class="sub">${escEmail(name || phone || email || 'No contact on file')} &middot; ${money(total)}
        &middot; deposit ${money(deposit)} &middot; good through ${fmtDate(validUntil)}</div>
      <div class="card">
        <div class="msg" id="m">${escEmail(msgs.initial)}</div>
        <div class="row">
          <button type="button" onclick="cp()">Copy message</button>
          ${smsHref ? `<a class="btn btn-ghost" href="${escEmail(smsHref)}">Open in Messages</a>` : ''}
        </div>
        <p class="muted" style="margin-top:10px">They see: <a href="${quoteLink(code)}">${quoteLink(code)}</a></p>
      </div>
      <div class="card">
        <a class="btn btn-ghost" href="/quote/${code}/edit">Edit this quote</a>
        ${(phone || email) ? `<a class="btn btn-ghost" href="/q/${code}/vcard">Save to contacts</a>` : ''}
        <a class="btn btn-ghost" href="/quote/new">Another quote</a>
        <a class="btn btn-ghost" href="/quotes">All quotes</a>
      </div>
      <script>
        function cp(){
          var t=document.getElementById('m').innerText;
          (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject())
            .then(function(){alert('Message copied — paste it into a text.');})
            .catch(function(){
              var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);
              a.select();document.execCommand('copy');a.remove();alert('Message copied.');
            });
        }
      </script>
    `));
  } catch (err) {
    console.error('create quote failed:', err.message);
    res.status(500).send(quotePage('Something went wrong',
      `<div class="card"><div class="warn">The quote could not be saved. Please try again.</div>
       <a class="btn btn-ghost" href="/quote/new">Back</a></div>`));
  }
});

/* What the customer opens. Public, no login. Reads like an invoice. */
app.get('/q/:code', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const friendly = (msg) => res.status(404).send(quotePage('Quote not found', `
    <div class="card"><h1>We couldn't find that quote</h1>
    <p class="muted" style="margin-top:8px">${msg}</p>
    <p style="margin-top:14px"><a class="btn" href="tel:+17738491854">Call ${SHOP_SIGNER}</a></p></div>`));
  if (!QUOTE_CODE_RE.test(code)) return friendly('That link looks incomplete — please check the text message.');

  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return friendly('It may have been removed. Text or call and we will resend it.');
    const q = rows[0];

    if (!q.viewed_at) {
      pool.query(`UPDATE quotes SET viewed_at=NOW(),
                  status=CASE WHEN status='sent' THEN 'viewed' ELSE status END WHERE id=$1`, [q.id]).catch(() => {});
    }

    const t = quoteTotals(q);
    const expired = q.valid_until && new Date(q.valid_until) < new Date(new Date().toDateString());
    const accepted = !!q.accepted_at;
    const paid = Number(q.paid_amount || 0) > 0;
    const balanceDue = round2(Math.max(0, Number(t.total) - Number(q.paid_amount || 0)));
    const eta = deliveryEstimate(q.accepted_at ? new Date(q.accepted_at) : new Date());
    /* A DATE column has no time, so converting it through a timezone shifts it
       a day backwards (2026-08-20 rendered as Aug 19). Format the calendar date
       literally; only real timestamps get timezone treatment. */
    const dayFmt = (d) => {
      if (!d) return '';
      const iso = (d instanceof Date) ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m) return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const lines = (q.items || []).map(i => {
      const imgs = (i.images || []).filter(u => /^https:\/\//.test(u));
      const gallery = imgs.length ? `
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
          ${imgs.map(u => `<a href="${escEmail(u)}" target="_blank" rel="noopener">
            <img src="${escEmail(u)}" alt="" loading="lazy"
                 style="width:74px;height:74px;object-fit:cover;border-radius:8px;border:1px solid #e3e8f2;background:#fff"></a>`).join('')}
        </div>` : '';
      return `
      <tr>
        <td>
          ${escEmail(i.description)}
          ${i.details ? `<div class="muted" style="font-size:13px;margin-top:3px">${escEmail(i.details)}</div>` : ''}
          ${gallery}
        </td>
        <td class="num">${i.qty}</td>
        <td class="num">${money(i.unit_price)}</td>
        <td class="num">${money(i.line_total)}</td>
      </tr>`;
    }).join('');

    res.send(quotePage(`Your quote from ${SHOP_NAME}`, `
      <div class="card">
        <h1>${SHOP_NAME}</h1>
        <div class="sub">Quote ${escEmail(q.code)} &middot; ${fmtDate(q.created_at)}${q.name ? ' &middot; for ' + escEmail(q.name) : ''}</div>

        ${paid ? `<div class="ok"><b>Payment received — ${money(q.paid_amount)}.</b> You're on the schedule. ${SHOP_SIGNER} will follow up with a proof.${
            balanceDue > 0 ? ` A balance of <b>${money(balanceDue)}</b> is due ${BALANCE_WHEN}.` : ' Paid in full — nothing further to pay.'}</div>`
          : accepted ? `<div class="ok"><b>Accepted — thank you!</b> Choose how you'd like to pay the deposit below.</div>` : ''}
        ${(!accepted && expired) ? `<div class="warn">This quote has expired, but prices usually still stand — just text and we'll refresh it.</div>` : ''}

        <table class="items"><thead><tr>
          <th>Item</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Amount</th>
        </tr></thead><tbody>
          ${lines}
          <tr><td colspan="3" class="num muted" style="padding-top:12px">Subtotal</td>
              <td class="num" style="padding-top:12px">${money(t.subtotal)}</td></tr>
          ${t.tax > 0 ? `<tr><td colspan="3" class="num muted">Sales tax</td><td class="num">${money(t.tax)}</td></tr>` : ''}
          <tr><td colspan="3" class="num tot">Total</td><td class="num tot">${money(t.total)}</td></tr>
          ${!paid ? `<tr><td colspan="3" class="num" style="color:#1848B8;font-weight:700">
              ${t.deposit >= t.total ? 'Due now (paid in full)' : 'Deposit to start (50%)'}</td>
              <td class="num" style="color:#1848B8;font-weight:700">${money(t.deposit)}</td></tr>` : `
            <tr><td colspan="3" class="num muted">Paid ${q.paid_at ? fmtDate(q.paid_at) : ''}</td>
                <td class="num" style="color:#166534">&minus;${money(q.paid_amount)}</td></tr>
            ${balanceDue > 0 ? `<tr><td colspan="3" class="num" style="color:#1848B8;font-weight:700">Balance due</td>
                <td class="num" style="color:#1848B8;font-weight:700">${money(balanceDue)}</td></tr>` : ''}`}
        </tbody></table>

        ${q.notes ? `<p class="muted" style="margin-top:12px">${escEmail(q.notes)}</p>` : ''}

        <div style="margin-top:16px;border-top:1px solid #eef1f8;padding-top:12px">
          ${q.needed_by ? `<p class="muted"><b>You need it by:</b> ${dayFmt(q.needed_by)}</p>` : ''}
          <p class="muted"><b>Estimated:</b> ready ${dayFmt(eta.ready)}, delivered ${dayFmt(eta.deliver_from)}–${dayFmt(eta.deliver_to)}
            ${accepted ? '' : ' once the deposit is in'}.</p>
          ${q.valid_until ? `<p class="muted">Quote good through ${fmtDate(q.valid_until)}.</p>` : ''}
        </div>
      </div>

      ${(paid && balanceDue > 0) ? `
      <div class="card">
        <h1 style="font-size:18px">Balance due — ${money(balanceDue)}</h1>
        <p class="muted" style="margin:6px 0 14px">${money(q.paid_amount)} received, thank you. The rest is due
          ${BALANCE_WHEN}.</p>

        <a class="btn" style="width:100%;margin-bottom:10px" href="/q/${q.code}/pay/balance">
          Card or Apple&nbsp;Pay — ${money(round2(balanceDue + cardFee(balanceDue)))}
        </a>
        <p class="muted" style="margin:-4px 0 14px;font-size:12px">Includes the ${Math.round(CARD_FEE*100)}% card processing fee (${money(cardFee(balanceDue))}).</p>

        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:12px;margin-bottom:10px">
          <b>Zelle — ${money(balanceDue)}</b> <span class="muted">(no fee)</span>
          <p class="muted" style="margin-top:4px">Send to <b>${escEmail(ZELLE_HANDLE)}</b>, memo <b>${escEmail(q.code)}</b>.<br>
            It will show as <b>${escEmail(ZELLE_NAME)}</b> — that's us.</p>
        </div>
        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:12px">
          <b>Cash on pickup — ${money(balanceDue)}</b> <span class="muted">(no fee)</span>
        </div>
      </div>` : ''}

      ${paid ? '' : accepted ? `
      <div class="card">
        <h1 style="font-size:18px">Pay your ${t.deposit >= t.total ? 'balance' : 'deposit'} — ${money(t.deposit)}</h1>
        <p class="muted" style="margin:6px 0 14px">Whichever is easiest. Nothing else is due until pickup or delivery.</p>

        <a class="btn" style="width:100%;margin-bottom:10px" href="/q/${q.code}/pay/card">
          Card or Apple&nbsp;Pay — ${money(round2(t.deposit + cardFee(t.deposit)))}
        </a>
        <p class="muted" style="margin:-4px 0 14px;font-size:12px">Includes the ${Math.round(CARD_FEE*100)}% card processing fee (${money(cardFee(t.deposit))}).</p>

        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:12px;margin-bottom:10px">
          <b>Zelle — ${money(t.deposit)}</b> <span class="muted">(no fee)</span>
          <p class="muted" style="margin-top:4px">Send to <b>${escEmail(ZELLE_HANDLE)}</b> and put <b>${escEmail(q.code)}</b> in the memo.<br>
            It will show as <b>${escEmail(ZELLE_NAME)}</b> — that's us.</p>
        </div>
        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:12px">
          <b>Cash in person — ${money(t.deposit)}</b> <span class="muted">(no fee)</span>
          <p class="muted" style="margin-top:4px">Text ${SHOP_SIGNER} at ${SHOP_PHONE} to arrange.</p>
        </div>
      </div>` : `
      <div class="card">
        <form method="POST" action="/q/${q.code}/accept">
          ${!q.name ? `
          <div class="row">
            <div><label>First name</label><input name="first_name" required autocomplete="given-name"></div>
            <div><label>Last name</label><input name="last_name" autocomplete="family-name"></div>
          </div>` : ''}
          ${!q.email ? `<label>Email <span style="text-transform:none;font-weight:400">(optional — for your receipt)</span></label>
            <input type="email" name="email" autocomplete="email">` : ''}
          ${!q.phone ? `<label>Mobile <span style="text-transform:none;font-weight:400">(optional)</span></label>
            <input type="tel" name="phone" autocomplete="tel">` : ''}
          <label>When do you need it? <span style="text-transform:none;font-weight:400">(optional)</span></label>
          <input type="date" name="needed_by" value="${q.needed_by ? String(q.needed_by).slice(0,10) : ''}">
          <button type="submit" style="width:100%;margin-top:14px">Accept &amp; choose payment</button>
        </form>
        <p class="muted" style="margin-top:10px;text-align:center">Nothing is charged yet — you'll pick how to pay next.</p>
      </div>`}

      ${(paid || accepted) ? '' : `
      <div class="card">
        <b style="color:#0B1F4B">Need something changed?</b>
        <p class="muted" style="margin:4px 0 10px">Quantities, sizes, colours, artwork — just say the word.
          ${SHOP_SIGNER} updates the quote and <b>this same link refreshes</b>, so there is nothing new to open.</p>
        <form method="POST" action="/q/${q.code}/changes">
          <textarea name="message" rows="3" required
            placeholder="e.g. make it 36 instead of 24, or navy rather than black"></textarea>
          <button type="submit" class="btn-ghost" style="width:100%;margin-top:10px">Send to ${SHOP_SIGNER}</button>
        </form>
      </div>`}

      ${(paid || !accepted) ? '' : `
      <div class="card">
        <b style="color:#0B1F4B">Need a change before we start?</b>
        <p class="muted" style="margin:4px 0 10px">Nothing has been printed yet — tell ${SHOP_SIGNER} and the quote is updated.</p>
        <form method="POST" action="/q/${q.code}/changes">
          <textarea name="message" rows="2" required placeholder="What would you like different?"></textarea>
          <button type="submit" class="btn-ghost" style="width:100%;margin-top:10px">Send to ${SHOP_SIGNER}</button>
        </form>
      </div>`}

      ${q.change_request && !paid ? `
      <div class="card"><div class="ok">Change requested — ${SHOP_SIGNER} is updating this quote.
        <div class="muted" style="margin-top:6px">"${escEmail(q.change_request)}"</div></div></div>` : ''}

      ${(paid && balanceDue <= 0) ? '' : reviewStrip()}

      <div class="card" style="text-align:center">
        <p class="muted">Questions? <a href="tel:+17738491854">${SHOP_PHONE}</a> &middot; ${SHOP_SIGNER}</p>
      </div>
    `));
  } catch (err) {
    console.error('view quote failed:', err.message);
    friendly('Something went wrong on our end. Please text us.');
  }
});

/* Card / Apple Pay via Stripe Checkout.
   Uses the REST API directly rather than adding the stripe package — one
   form-encoded POST is all a Checkout Session needs, and Apple Pay + Google Pay
   appear automatically on supported devices with no extra work.
   The card fee is added as its own visible line so nobody feels surprised. */
app.get(['/q/:code/pay/card', '/q/:code/pay/balance'], async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/q/' + encodeURIComponent(code));
  const secret = process.env.STRIPE_SECRET_KEY;

  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return res.redirect('/q/' + code);
    const q = rows[0];
    const t = quoteTotals(q);
    const alreadyPaid = Number(q.paid_amount || 0);
    /* Same route serves the deposit and the balance: charging the deposit when
       it is already paid, or a balance when nothing is owed, would both be
       wrong, so the amount is derived rather than passed in. */
    const wantsBalance = req.path.endsWith('/balance');
    const amount = wantsBalance
      ? round2(Math.max(0, Number(t.total) - alreadyPaid))
      : t.deposit;
    const fee = cardFee(amount);

    if (!secret) return res.redirect('/q/' + code);
    if (!wantsBalance && alreadyPaid > 0) return res.redirect('/q/' + code);
    if (amount <= 0) return res.redirect('/q/' + code);

    /* Stripe refuses anything under $0.50, and the error it returns is opaque
       ("total amount due must add up to at least $0.50 USD") — which surfaced
       to the customer as a bare "card payment unavailable". Catch it here and
       say what is actually wrong. */
    const chargeable = round2(amount + cardFee(amount));
    if (chargeable < 0.5) {
      return res.status(200).send(quotePage('Too small to charge', `
        <div class="card">
          <div class="warn">This quote totals ${money(t.total)}, which is below the ${money(0.5)} minimum
            a card payment can process.</div>
          <p class="muted">Zelle to <b>${escEmail(ZELLE_HANDLE)}</b> or cash works for an amount this small,
             or ask ${SHOP_SIGNER} to update the quote.</p>
          <p style="margin-top:12px"><a class="btn btn-ghost" href="/q/${q.code}">Back to the quote</a></p>
        </div>`));
    }

    const label = wantsBalance
      ? `Remaining balance — quote ${q.code}`
      : (t.deposit >= t.total ? `Payment in full — quote ${q.code}` : `50% deposit — quote ${q.code}`);

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', `${PUBLIC_BASE_URL}/q/${q.code}/paid?s={CHECKOUT_SESSION_ID}`);
    form.set('metadata[kind]', wantsBalance ? 'balance' : 'deposit');
    form.set('cancel_url', `${PUBLIC_BASE_URL}/q/${q.code}`);
    form.set('client_reference_id', q.code);
    if (q.email) form.set('customer_email', q.email);
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', 'usd');
    form.set('line_items[0][price_data][unit_amount]', String(Math.round(amount * 100)));
    form.set('line_items[0][price_data][product_data][name]', label);
    form.set('line_items[1][quantity]', '1');
    form.set('line_items[1][price_data][currency]', 'usd');
    form.set('line_items[1][price_data][unit_amount]', String(Math.round(fee * 100)));
    form.set('line_items[1][price_data][product_data][name]',
             `Card processing fee (${Math.round(CARD_FEE * 100)}%)`);
    form.set('metadata[quote_code]', q.code);
    /* payment_method_types is deliberately NOT set. Omitting it lets Stripe
       show whatever is enabled under Dashboard > Payment methods — Apple Pay and
       Google Pay appear automatically on supported devices, and PayPal, Link,
       Cash App Pay or Klarna can be switched on there without touching code. */
    form.set('automatic_tax[enabled]', 'false');

    const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secret,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(15000),
    });
    const d = await r.json();
    if (!r.ok || !d.url) {
      console.error('stripe session failed:', d.error ? d.error.message : r.status);
      /* 200, not 502 — Cloudflare swaps any 5xx for its own error page, so a
         customer clicking "Pay by card" would see a raw gateway error instead
         of being pointed at Zelle. */
      return res.status(200).send(quotePage('Card payment unavailable', `
        <div class="card"><div class="warn">Card payment isn't available right now.</div>
        <p class="muted">Zelle to <b>${escEmail(ZELLE_HANDLE)}</b> works, or text ${SHOP_SIGNER} at ${SHOP_PHONE}.</p>
        <p style="margin-top:12px"><a class="btn btn-ghost" href="/q/${q.code}">Back to the quote</a></p></div>`));
    }

    await pool.query('UPDATE quotes SET stripe_session=$1 WHERE id=$2', [d.id, q.id]).catch(() => {});
    res.redirect(303, d.url);
  } catch (err) {
    console.error('card pay failed:', err.message);
    res.redirect('/q/' + code);
  }
});

/* Stripe sends them back here. Confirm against the API rather than trusting
   the redirect — anyone can visit this URL. */
app.get('/q/:code/paid', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  const sid = String(req.query.s || '');
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/');
  try {
    const secret = process.env.STRIPE_SECRET_KEY;
    if (secret && sid.startsWith('cs_')) {
      const r = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sid)}`,
        { headers: { 'Authorization': 'Bearer ' + secret }, signal: AbortSignal.timeout(15000) });
      const d = await r.json();
      if (r.ok && d.payment_status === 'paid' && d.client_reference_id === code) {
        const amount = round2((d.amount_total || 0) / 100);
        const isBalance = (d.metadata || {}).kind === 'balance';
        /* A balance payment ADDS to what has already been received — overwriting
           would erase the deposit and make it look like the customer paid less
           than they did. The session id guard makes this idempotent, so a
           refreshed success page cannot double-count. */
        const { rows } = await pool.query(
          isBalance
            ? `UPDATE quotes SET paid_amount = COALESCE(paid_amount,0) + $1,
                      paid_method='card', paid_at=NOW(), status='accepted'
                WHERE code=$2 AND (stripe_session IS DISTINCT FROM $3) RETURNING *`
            : `UPDATE quotes SET paid_amount=$1, paid_method='card', paid_at=NOW(), status='accepted'
                WHERE code=$2 AND (paid_amount IS NULL OR paid_amount = 0) AND $3 IS NOT NULL RETURNING *`,
          [amount, code, sid]);
        if (rows.length) {
          // Record which session was banked so it cannot be applied twice.
          await pool.query('UPDATE quotes SET stripe_session=$2 WHERE code=$1', [code, sid]).catch(() => {});
        }
        if (rows.length) {
          const q = rows[0];
          sendEmail({
            to: SHOP_EMAIL,
            subject: `💳 ${isBalance ? 'Balance' : 'Deposit'} paid — quote ${q.code}, ${money(amount)}`,
            html: `<div style="font-family:system-ui,sans-serif"><h2 style="color:#1848B8">Deposit received</h2>
              <p>${escEmail(q.name || '')} paid <b>${money(amount)}</b> by card for quote ${q.code}
                 (${isBalance ? 'remaining balance' : 'deposit'}).</p>
              <p style="color:#6b7280">Total received: ${money(q.paid_amount)} of ${money(q.total)}.</p>
              <p><a href="${quoteLink(q.code)}">${quoteLink(q.code)}</a></p></div>`,
          }).catch(() => {});
          if (q.email) {
            sendEmail({
              to: q.email,
              subject: `Payment received — quote ${q.code}`,
              html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
                <h2 style="color:#1848B8">Thank you!</h2>
                <p style="color:#374151;line-height:1.6">We've received ${money(amount)} for quote ${q.code}. You're on the schedule —
                ${SHOP_SIGNER} will follow up with an artwork proof and timeline.</p>
                <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_PHONE}</p></div>`,
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    console.error('payment confirm failed:', err.message);
  }
  res.redirect('/q/' + code);
});

/* Customer accepts. Idempotent. */
app.post('/q/:code/accept', orderRateLimit, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/q/' + encodeURIComponent(code));
  try {
    const rb = req.body || {};
    const nb = String(rb.needed_by || '').trim() || null;
    /* Details the customer fills in themselves when the quote went out without
       them — common for online and walk-up enquiries. NULLIF keeps existing
       values intact rather than overwriting them with a blank. */
    const cname = [String(rb.first_name || '').trim(), String(rb.last_name || '').trim()]
      .filter(Boolean).join(' ').slice(0, 120) || null;
    const cemail = String(rb.email || '').trim().toLowerCase().slice(0, 200) || null;
    const cphone = String(rb.phone || '').trim().slice(0, 40) || null;

    const { rows } = await pool.query(
      `UPDATE quotes SET accepted_at=NOW(), status='accepted',
              needed_by = COALESCE($2::date, needed_by),
              name  = COALESCE(NULLIF(name,''),  $3),
              email = COALESCE(NULLIF(email,''), $4),
              phone = COALESCE(NULLIF(phone,''), $5)
        WHERE code=$1 AND accepted_at IS NULL RETURNING *`,
      [code, nb, cname, cemail, cphone]);

    if (rows.length) {                       // first acceptance only
      const q = rows[0];
      const msgs = quoteMessages(q);
      const lines = (q.items || []).map(i =>
        `<tr><td style="padding:8px 4px">${escEmail(i.description)}</td>
             <td style="padding:8px 4px;text-align:right">${i.qty}</td>
             <td style="padding:8px 4px;text-align:right">${money(i.line_total)}</td></tr>`).join('');
      const table = `<table style="width:100%;border-collapse:collapse;margin:12px 0">${lines}
        <tr><td colspan="2" style="padding:8px 4px;text-align:right;font-weight:700;border-top:2px solid #111">Total</td>
        <td style="padding:8px 4px;text-align:right;font-weight:700;border-top:2px solid #111">${money(q.subtotal)}</td></tr></table>`;

      const tt = quoteTotals(q);
      const payBlock = `
        <div style="border:1px solid #e3e8f2;border-radius:10px;padding:14px;margin:14px 0">
          <p style="margin:0 0 6px"><b>${tt.deposit >= tt.total ? 'Payment due' : 'Deposit to start (50%)'}: ${money(tt.deposit)}</b></p>
          <p style="margin:0;color:#6b7280;font-size:14px">
            Card or Apple Pay: <a href="${quoteLink(q.code)}">${quoteLink(q.code)}</a> (adds ${Math.round(CARD_FEE*100)}% processing)<br>
            Zelle to <b>${escEmail(ZELLE_HANDLE)}</b>, memo <b>${q.code}</b> — no fee
              <span style="color:#9ca3af">(shows as ${escEmail(ZELLE_NAME)})</span><br>
            Cash in person — no fee
          </p>
        </div>`;
      if (q.email) {
        sendEmail({
          to: q.email,
          subject: `Thanks — quote ${q.code} accepted`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
            <h2 style="color:#1848B8">Thank you!</h2>
            <p style="color:#374151;line-height:1.6">${escEmail(msgs.accepted)}</p>${table}${payBlock}
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657</p></div>`,
        }).catch(e => console.error('accept email failed:', e.message));
      }
      sendEmail({
        to: SHOP_EMAIL,
        replyTo: q.email || undefined,
        subject: `✅ Quote ${q.code} accepted — ${escEmail(q.name || q.phone)} ${money(q.subtotal)}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#1848B8">Quote accepted</h2>
          <p style="color:#374151"><b>${escEmail(q.name || '')}</b><br>${escEmail(q.phone || '')}<br>${escEmail(q.email || '')}</p>
          ${table}${q.notes ? `<p style="color:#6b7280">${escEmail(q.notes)}</p>` : ''}</div>`,
      }).catch(e => console.error('accept alert failed:', e.message));

      if (q.brevo_deal_id) {
        brevo.post('/crm/notes', {
          text: `QUOTE ${q.code} ACCEPTED ${new Date().toISOString()} — ${money(q.subtotal)}`,
          dealIds: [q.brevo_deal_id],
        }).catch(() => {});
      }

      /* The customer may have just given us their name, email or number for the
         first time (common on online and walk-up enquiries), so push the record
         again — otherwise the CRM keeps the blank version forever. */
      if (cname || cemail || cphone) {
        syncQuoteToBrevo(q).catch(() => {});
        syncQuoteToLumise(q).catch(() => {});
      }
    }
    res.redirect('/q/' + code);
  } catch (err) {
    console.error('accept failed:', err.message);
    res.redirect('/q/' + code);
  }
});

/* Customer asks for a change rather than accepting. Keeps the same code so the
   link they already have keeps working once June edits it. */
app.post('/q/:code/changes', orderRateLimit, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/');
  const msg = String((req.body && req.body.message) || '').trim().slice(0, 1000);
  try {
    const { rows } = await pool.query(
      `UPDATE quotes SET change_request=$2, status='changes'
        WHERE code=$1 AND accepted_at IS NULL RETURNING *`, [code, msg]);
    if (rows.length && msg) {
      const q = rows[0];
      sendEmail({
        to: SHOP_EMAIL,
        replyTo: q.email || undefined,
        subject: `✏️ Change requested — quote ${q.code} (${q.name || q.phone || 'customer'})`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#1848B8">They'd like a change</h2>
          <p style="color:#374151"><b>${escEmail(q.name || '')}</b> ${escEmail(q.phone || '')} ${escEmail(q.email || '')}</p>
          <blockquote style="border-left:3px solid #1848B8;padding-left:12px;color:#374151">${escEmail(msg)}</blockquote>
          <p style="margin-top:16px"><a href="${PUBLIC_BASE_URL}/quote/${q.code}/edit"
             style="background:#1848B8;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:700">Edit this quote →</a></p>
          <p style="color:#6b7280;font-size:13px">Their link stays the same — it updates when you save.</p></div>`,
      }).catch(e => console.error('change alert failed:', e.message));
    }
  } catch (err) {
    console.error('change request failed:', err.message);
  }
  res.redirect('/q/' + code);
});

/* Record a payment that arrived outside Stripe — Zelle, cash, a bank transfer.
   Without this a customer who pays by Zelle stays "unpaid" forever, the deposit
   reminder keeps chasing them, and the balance never reflects reality. */
app.post('/quote/:code/mark-paid', requireAdmin, async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.redirect('/quotes');
  const b = req.body || {};
  const method = ['zelle', 'cash', 'transfer', 'other'].includes(String(b.method))
    ? String(b.method) : 'other';

  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return res.redirect('/quotes');
    const q = rows[0];
    const t = quoteTotals(q);

    // Blank amount means "they paid what was due" — deposit, or the balance if
    // a deposit is already in.
    const outstanding = round2(Math.max(0, Number(t.total) - Number(q.paid_amount || 0)));
    const suggested = Number(q.paid_amount || 0) > 0 ? outstanding : t.deposit;
    let amount = String(b.amount || '').trim() === '' ? suggested : round2(Number(b.amount));
    if (!(amount > 0)) return res.redirect('/quotes');
    // Never let a typo record more than is owed.
    amount = Math.min(amount, outstanding || amount);

    const { rows: upd } = await pool.query(
      `UPDATE quotes SET paid_amount = COALESCE(paid_amount,0) + $2,
              paid_method = $3, paid_at = NOW(),
              status = 'accepted',
              accepted_at = COALESCE(accepted_at, NOW())
        WHERE code = $1 RETURNING *`, [code, amount, method]);

    const nq = upd[0];
    const stillDue = round2(Math.max(0, Number(nq.total) - Number(nq.paid_amount)));

    if (nq.email) {
      sendEmail({
        to: nq.email,
        subject: `Payment received — quote ${nq.code}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#1848B8">Thank you!</h2>
          <p style="color:#374151;line-height:1.6">We've received <b>${money(amount)}</b> by
            ${escEmail(method)} for quote ${nq.code}.
            ${stillDue > 0 ? `A balance of <b>${money(stillDue)}</b> remains, due ${BALANCE_WHEN}.`
                           : 'That settles it in full — nothing further to pay.'}</p>
          <p style="color:#374151;line-height:1.6">You're on the schedule. ${SHOP_SIGNER} will follow up
            with an artwork proof and timeline.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_PHONE}</p>
        </div>`,
      }).catch(e => console.error('manual payment receipt failed:', e.message));
    }

    if (nq.brevo_deal_id) {
      brevo.post('/crm/notes', {
        text: `PAYMENT ${money(amount)} via ${method} on quote ${nq.code}. ` +
              (stillDue > 0 ? `Balance ${money(stillDue)}.` : 'Paid in full.'),
        dealIds: [nq.brevo_deal_id],
      }).catch(() => {});
    }
  } catch (err) {
    console.error('mark-paid failed:', err.message);
  }
  res.redirect('/quotes');
});

/* One tap to add them to the iPhone address book. */
app.get('/q/:code/vcard', async (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  if (!QUOTE_CODE_RE.test(code)) return res.status(400).send('bad code');
  try {
    const { rows } = await pool.query('SELECT * FROM quotes WHERE code=$1', [code]);
    if (!rows.length) return res.status(404).send('not found');
    const q = rows[0];
    const [first, ...rest] = String(q.name || '').trim().split(/\s+/);
    const vcf = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:${rest.join(' ')};${first || ''};;;`,
      `FN:${q.name || q.phone || q.email}`,
      q.phone ? `TEL;TYPE=CELL:${q.phone}` : '',
      q.email ? `EMAIL;TYPE=INTERNET:${q.email}` : '',
      `NOTE:${SHOP_NAME} quote ${q.code} — ${quoteSummary(q.items).replace(/[\r\n]+/g, ' ')} — ${money(q.subtotal)}`,
      'END:VCARD',
    ].filter(Boolean).join('\r\n');
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${(q.name || q.code).replace(/[^a-z0-9]+/gi, '-')}.vcf"`);
    res.send(vcf);
  } catch (err) {
    res.status(500).send('error');
  }
});


/* One customer, everything about them. Reached from the quotes list. */
app.get('/customer', requireAdmin, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.redirect('/quotes');
  try {
    const h = await customerHistory(q);
    if (!h) {
      return res.send(quotePage('Not found', `
        <div class="card"><h1>No history for that customer</h1>
        <p class="muted" style="margin-top:8px">${escEmail(q)}</p>
        <p style="margin-top:12px"><a class="btn btn-ghost" href="/quotes">All quotes</a></p></div>`));
    }

    const years = Object.keys(h.byYear).sort().reverse();
    const maxY = Math.max(...years.map(y => h.byYear[y].quoted), 1);

    const rows = h.quotes.map(r => {
      const paid = Number(r.paid_amount || 0);
      const total = Number(r.total || r.subtotal || 0);
      const bal = round2(Math.max(0, total - paid));
      const state = paid > 0
        ? (bal > 0 ? `paid ${money(paid)}, ${money(bal)} due` : `paid in full`)
        : (r.accepted_at ? 'accepted, unpaid' : r.status);
      return `
        <tr>
          <td><a href="/q/${r.code}">${escEmail(r.code)}</a>
            <div class="muted" style="font-size:12px">${escEmail(quoteSummary(r.items))}</div></td>
          <td class="num">${fmtDate(r.created_at)}</td>
          <td class="num">${money(total)}</td>
          <td class="num" style="font-size:12.5px;color:${paid > 0 ? '#166534' : '#6b7280'}">${state}</td>
        </tr>`;
    }).join('');

    /* Per-line price history — what this person has actually been charged, so a
       repeat quote can match it instead of relying on memory. */
    const lineHistory = [];
    for (const r of h.quotes) {
      for (const i of (r.items || [])) {
        lineHistory.push({
          desc: i.description, unit: Number(i.unit_price || 0),
          qty: i.qty, when: r.created_at, code: r.code,
        });
      }
    }
    const priceRows = lineHistory.slice(0, 12).map(l => `
      <tr><td>${escEmail(l.desc)}</td>
          <td class="num">${l.qty}</td>
          <td class="num"><b>${money(l.unit)}</b> ea</td>
          <td class="num muted" style="font-size:12px">${fmtDate(l.when)}</td></tr>`).join('');

    res.send(quotePage(h.name || 'Customer', `
      <h1>${escEmail(h.name || h.phone || h.email)}</h1>
      <div class="sub">
        ${h.email ? `<a href="mailto:${escEmail(h.email)}">${escEmail(h.email)}</a> &middot; ` : ''}
        ${h.phone ? `<a href="tel:${escEmail(String(h.phone).replace(/[^0-9+]/g,''))}">${escEmail(h.phone)}</a>` : ''}
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0">
        <div class="card" style="flex:1 1 150px;margin:0;text-align:center">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Quotes</div>
          <div class="tot" style="font-size:22px">${h.count}</div>
          <div class="muted" style="font-size:12px">${h.accepted} accepted</div>
        </div>
        <div class="card" style="flex:1 1 150px;margin:0;text-align:center">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Quoted</div>
          <div class="tot" style="font-size:22px">${money(h.quoted)}</div>
          <div class="muted" style="font-size:12px">lifetime</div>
        </div>
        <div class="card" style="flex:1 1 150px;margin:0;text-align:center;border-color:#b7e0c4;background:#f6fbf7">
          <div class="muted" style="font-size:11px;text-transform:uppercase;letter-spacing:.05em">Spent</div>
          <div class="tot" style="font-size:22px;color:#166534">${money(h.spent)}</div>
          <div class="muted" style="font-size:12px">${h.quoted > 0 ? Math.round(h.spent / h.quoted * 100) : 0}% of quoted</div>
        </div>
      </div>

      ${years.length > 1 ? `
      <div class="card">
        <b style="color:#0B1F4B">By year</b>
        <table style="width:100%;margin-top:10px">
          ${years.map(y => {
            const v = h.byYear[y];
            return `<tr>
              <td style="width:52px;font-weight:700;color:#0B1F4B">${y}</td>
              <td style="padding:6px 0">
                <div style="background:#eef1f8;border-radius:4px;height:9px;position:relative">
                  <div style="background:#c3cbd8;height:9px;border-radius:4px;width:${Math.round(v.quoted / maxY * 100)}%"></div>
                  <div style="background:#166534;height:9px;border-radius:4px;width:${Math.round(v.spent / maxY * 100)}%;position:absolute;top:0;left:0"></div>
                </div>
              </td>
              <td class="num muted" style="font-size:12px;white-space:nowrap;padding-left:10px">
                ${money(v.spent)} of ${money(v.quoted)}</td>
            </tr>`;
          }).join('')}
        </table>
        <div class="muted" style="font-size:11px;margin-top:6px">green = paid &middot; grey = quoted</div>
      </div>` : ''}

      ${priceRows ? `
      <div class="card">
        <b style="color:#0B1F4B">What they've been charged</b>
        <div class="muted" style="font-size:12px;margin-bottom:6px">Quote the same price again so it never drifts.</div>
        <table class="items">${priceRows}</table>
      </div>` : ''}

      <div class="card">
        <b style="color:#0B1F4B">Quote history</b>
        <table class="items" style="margin-top:8px">
          <thead><tr><th>Quote</th><th class="num">Date</th><th class="num">Total</th><th class="num">Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <p><a class="btn btn-ghost" href="/quotes">← All quotes</a>
         <a class="btn btn-ghost" href="/quote/new">New quote</a></p>
    `));
  } catch (err) {
    console.error('customer page failed:', err.message);
    res.status(500).send(quotePage('Error', '<div class="card"><div class="warn">Could not load that customer.</div></div>'));
  }
});

/* The tracking list. */
app.get('/quotes', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM quotes ORDER BY created_at DESC LIMIT 200');
    const colour = {
      sent: '#eef1f8|#33415c', viewed: '#fff4e0|#8a5a00', changes: '#fdecea|#b45309',
      accepted: '#e7f6ec|#166534', paid: '#1848B8|#ffffff', expired: '#f3f4f6|#6b7280',
    };
    const body = rows.map(q => {
      const expired = q.status !== 'accepted' && q.valid_until && new Date(q.valid_until) < new Date(new Date().toDateString());
      /* "accepted" and "paid" looked identical, so there was no way to see at a
         glance who had actually handed over money. Paid wins over every other
         state. */
      const paid = Number(q.paid_amount || 0) > 0;
      const st = paid ? 'paid' : (expired ? 'expired' : q.status);

      /* Nudges are email-only, so a phone-only quote can never be chased
         automatically — and a quote already chased without reply needs a person
         too. Surface both, with the message ready to copy. */
      const ageDays = (Date.now() - new Date(q.created_at)) / 86400000;
      const noEmail = !q.email;
      const outstanding = round2(Math.max(0, Number(q.total || q.subtotal || 0) - Number(q.paid_amount || 0)));
      const wantsChange = !paid && !!q.change_request;
      const needsText = !paid && !expired && q.phone && (
        (noEmail && ageDays >= 2 && !q.accepted_at) ||
        (q.followed_up_at && !q.accepted_at) ||
        (q.accepted_at && q.deposit_nudged_at)
      );
      const textReason = !needsText ? '' :
        (q.accepted_at ? 'accepted but deposit unpaid'
         : noEmail ? 'no email on file — we cannot chase this one'
         : 'emailed once, no reply');
      const textMsg = needsText ? (q.accepted_at
        ? quoteMessages(q).accepted.replace(/^Got it[^—]*—\s*/, '')
        : quoteMessages(q).followup) : '';
      const [bg, fg] = (colour[st] || colour.sent).split('|');
      return `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div>
            <a href="/customer?q=${encodeURIComponent(q.email || q.phone || '')}"
               style="color:#0B1F4B;text-decoration:none"><b>${escEmail(q.name || q.phone || q.email || '—')}</b></a>
            <div class="muted">${escEmail(quoteSummary(q.items))} &middot; ${fmtDate(q.created_at)}</div>
          </div>
          <div style="text-align:right;white-space:nowrap">
            <div class="tot" style="font-size:16px">${money(q.total || q.subtotal)}</div>
            <span class="chip" style="background:${bg};color:${fg}">${paid ? 'paid ' + money(q.paid_amount) : st}</span>
          </div>
        </div>
        ${paid && Number(q.total) > Number(q.paid_amount)
          ? `<div class="muted" style="margin-top:6px;color:#b45309">balance due ${money(round2(Number(q.total) - Number(q.paid_amount)))}</div>`
          : ''}
        ${wantsChange ? `
          <div style="margin-top:10px;background:#eef4ff;border:1px solid #c3d4f8;border-radius:10px;padding:10px 12px">
            <div style="font-weight:700;color:#1848B8;font-size:13px">✏️ Change requested</div>
            <div class="muted" style="font-size:12.5px;margin-top:3px">"${escEmail(q.change_request)}"</div>
            <a class="btn" style="padding:8px 18px;font-size:13px;margin-top:8px;display:inline-block"
               href="/quote/${q.code}/edit">Edit the quote →</a>
          </div>` : ''}
        ${needsText ? `
          <div style="margin-top:10px;background:#fff8e6;border:1px solid #f3dfa8;border-radius:10px;padding:10px 12px">
            <div style="font-weight:700;color:#8a5a00;font-size:13px">📱 Needs a text</div>
            <div class="muted" style="font-size:12.5px;margin-top:2px">${escEmail(textReason)}</div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
              <a class="btn btn-ghost" style="padding:8px 16px;font-size:13px"
                 href="sms:${escEmail(String(q.phone).replace(/[^0-9+]/g, ''))}${/iPhone|iPad|Mac/.test(req.get('user-agent') || '') ? '&' : '?'}body=${encodeURIComponent(textMsg)}">Text ${escEmail(String(q.name || '').split(' ')[0] || 'them')}</a>
              <button type="button" class="btn btn-ghost" style="padding:8px 16px;font-size:13px"
                 onclick="cpq(this)" data-msg="${escEmail(textMsg)}">Copy message</button>
            </div>
          </div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <a class="btn btn-ghost" style="padding:8px 16px;font-size:13px" href="/quote/${q.code}/edit">Edit</a>
          <a class="btn btn-ghost" style="padding:8px 16px;font-size:13px" href="/q/${q.code}" target="_blank" rel="noopener">View as customer</a>
          ${outstanding > 0 ? `<button type="button" class="btn btn-ghost" style="padding:8px 16px;font-size:13px"
             onclick="document.getElementById('mp-${q.code}').style.display='block';this.style.display='none'">Record a payment</button>` : ''}
        </div>
        ${outstanding > 0 ? `
        <form id="mp-${q.code}" method="POST" action="/quote/${q.code}/mark-paid"
              style="display:none;margin-top:10px;background:#f7f9fc;border:1px solid #e3e8f2;border-radius:10px;padding:12px">
          <div class="muted" style="font-size:12.5px;margin-bottom:8px">
            Money received outside the card checkout — Zelle, cash, bank transfer.</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <select name="method" style="flex:0 0 130px;padding:9px">
              <option value="zelle">Zelle</option>
              <option value="cash">Cash</option>
              <option value="transfer">Bank transfer</option>
              <option value="other">Other</option>
            </select>
            <input name="amount" type="number" step="0.01" inputmode="decimal"
                   placeholder="${money(paid ? outstanding : Number(q.deposit || 0)).replace('$','')}"
                   style="flex:0 0 120px;padding:9px">
            <button type="submit" style="padding:9px 20px;font-size:14px">Record</button>
          </div>
          <div class="muted" style="font-size:12px;margin-top:6px">
            Leave the amount blank for ${money(paid ? outstanding : Number(q.deposit || 0))}
            (${paid ? 'the remaining balance' : 'the deposit'}). Outstanding: ${money(outstanding)}.</div>
        </form>` : ''}
        <div class="muted" style="margin-top:8px;font-size:12px">/q/${q.code}
        ${q.phone ? ` &middot; <a class="muted" href="tel:${escEmail(q.phone)}">${escEmail(q.phone)}</a>` : ''}</div>
      </div>`;
    }).join('');
    const needCount = (body.match(/Needs a text/g) || []).length;
    const changeCount = (body.match(/Change requested/g) || []).length;
    res.send(quotePage('Quotes', `<h1>Quotes</h1>
      <div class="sub">${rows.length} total${
        changeCount ? ` &middot; <b style="color:#1848B8">${changeCount} awaiting your edit</b>` : ''}${
        needCount ? ` &middot; <b style="color:#8a5a00">${needCount} need a text</b>` : ''}</div>
      <p style="margin-bottom:14px"><a class="btn" href="/quote/new">New quote</a></p>
      ${body || '<div class="card"><p class="muted">No quotes yet.</p></div>'}
      <script>
        function cpq(btn){
          var t = btn.getAttribute('data-msg');
          (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject())
            .then(function(){ btn.textContent = 'Copied ✓'; })
            .catch(function(){
              var a=document.createElement('textarea');a.value=t;document.body.appendChild(a);
              a.select();document.execCommand('copy');a.remove();btn.textContent='Copied ✓';
            });
        }
      </script>`));
  } catch (err) {
    console.error('quotes list failed:', err.message);
    res.status(500).send(quotePage('Error', '<div class="card"><div class="warn">Could not load quotes.</div></div>'));
  }
});


/* ══ Reviews ══════════════════════════════════════════════════════════════
   A review request goes out after delivery with a one-tap star link. Happy
   customers (4-5) are then pointed at Google, which is where reviews actually
   help the shop get found; anything lower stays private and comes straight to
   June so a problem can be fixed instead of published. Everything collected is
   held for approval before it appears anywhere. */

const GOOGLE_REVIEW_URL = process.env.JT_GOOGLE_REVIEW_URL || '';

function reviewToken() { return crypto.randomBytes(9).toString('base64url'); }

const STAR = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

/** Approved reviews, newest first. Cached briefly — the storefront asks often. */
let _revCache = { at: 0, rows: [] };
async function approvedReviews(limit = 50) {
  if (Date.now() - _revCache.at < 300000) return _revCache.rows.slice(0, limit);
  try {
    const { rows } = await pool.query(
      `SELECT name, rating, title, body, product, submitted_at
         FROM reviews WHERE approved = TRUE AND rating IS NOT NULL
        ORDER BY submitted_at DESC LIMIT 200`);
    _revCache = { at: Date.now(), rows };
    return rows.slice(0, limit);
  } catch { return _revCache.rows.slice(0, limit); }
}

/* The page a customer lands on from the request email. */
app.get('/review/:token', async (req, res) => {
  const token = String(req.params.token || '');
  const pre = Math.max(0, Math.min(5, parseInt(req.query.r, 10) || 0));
  try {
    const { rows } = await pool.query('SELECT * FROM reviews WHERE token=$1', [token]);
    if (!rows.length) {
      return res.status(404).send(quotePage('Link not found', `
        <div class="card"><h1>That link has expired</h1>
        <p class="muted" style="margin-top:8px">We'd still love your feedback — just reply to our email or
        text ${SHOP_PHONE}.</p></div>`));
    }
    const r = rows[0];
    if (r.submitted_at) {
      return res.send(quotePage('Thank you', `
        <div class="card"><h1>Thanks — we have your review</h1>
        <p class="muted" style="margin-top:8px">You rated us ${STAR(r.rating || 0)}. We appreciate you taking the time.</p>
        ${(r.rating >= 4 && GOOGLE_REVIEW_URL) ? `<p style="margin-top:14px">
          <a class="btn" href="${escEmail(GOOGLE_REVIEW_URL)}" target="_blank" rel="noopener">Share it on Google →</a></p>` : ''}
        </div>`));
    }

    res.send(quotePage('How did we do?', `
      <div class="card">
        <h1>How did we do?</h1>
        <div class="sub">${r.name ? escEmail(String(r.name).split(' ')[0]) + ', your' : 'Your'} feedback helps a small Chicago shop.</div>
        <form method="POST" action="/review/${escEmail(token)}">
          <label>Your rating</label>
          <div class="stars-pick" style="display:flex;gap:6px;margin-bottom:6px">
            ${[1,2,3,4,5].map(n => `
              <label style="flex:1;text-align:center;margin:0;cursor:pointer">
                <input type="radio" name="rating" value="${n}" ${pre === n ? 'checked' : ''} required
                       style="position:absolute;opacity:0;width:0" onchange="pick(${n})">
                <span class="st" data-n="${n}"
                      style="display:block;font-size:30px;line-height:1.1;color:#d6dae5">★</span>
              </label>`).join('')}
          </div>
          <label>A short headline</label>
          <input name="title" maxlength="80" placeholder="e.g. Great job on the hats">
          <label>What stood out?</label>
          <textarea name="body" rows="4" maxlength="1200" placeholder="Anything you'd tell a friend"></textarea>
          <label>Name to show <span style="text-transform:none;font-weight:400">(first name and initial is fine)</span></label>
          <input name="name" value="${escEmail(r.name || '')}" maxlength="60">
          <button type="submit" style="width:100%;margin-top:14px">Send my review</button>
        </form>
        <p class="muted" style="margin-top:10px;text-align:center">We read every one. Nothing is published without your name as you enter it here.</p>
      </div>
      <script>
        function pick(n){
          document.querySelectorAll('.st').forEach(function(s){
            s.style.color = Number(s.dataset.n) <= n ? '#F4A623' : '#d6dae5';
          });
        }
        ${pre ? `pick(${pre});` : ''}
      </script>
    `));
  } catch (err) {
    console.error('review page failed:', err.message);
    res.status(500).send(quotePage('Something went wrong',
      `<div class="card"><div class="warn">Please try again shortly.</div></div>`));
  }
});

/* Submission. 4-5 stars are invited to Google; 1-3 stay private and alert June. */
app.post('/review/:token', orderRateLimit, async (req, res) => {
  const token = String(req.params.token || '');
  const b = req.body || {};
  const rating = Math.max(1, Math.min(5, parseInt(b.rating, 10) || 0));
  try {
    const { rows } = await pool.query(
      `UPDATE reviews SET rating=$2, title=$3, body=$4, name=COALESCE(NULLIF($5,''), name),
              submitted_at=NOW()
        WHERE token=$1 AND submitted_at IS NULL RETURNING *`,
      [token, rating,
       String(b.title || '').trim().slice(0, 80),
       String(b.body || '').trim().slice(0, 1200),
       String(b.name || '').trim().slice(0, 60)]);

    if (rows.length) {
      const r = rows[0];
      _revCache = { at: 0, rows: [] };          // force a refresh
      sendEmail({
        to: SHOP_EMAIL,
        replyTo: r.email || undefined,
        subject: `${rating >= 4 ? '⭐' : '⚠️'} ${rating}-star review — ${r.name || 'customer'}`,
        html: `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:${rating >= 4 ? '#166534' : '#b45309'}">${STAR(rating)} ${rating}/5</h2>
          <p><b>${escEmail(r.title || '')}</b></p>
          <p style="color:#374151;line-height:1.6">${escEmail(r.body || '')}</p>
          <p style="color:#6b7280;font-size:13px">${escEmail(r.name || '')} ${escEmail(r.email || '')} ${escEmail(r.phone || '')}</p>
          ${rating <= 3 ? `<p style="background:#fdecea;padding:12px;border-radius:8px;color:#b71c1c">
            Not published. Worth reaching out before this becomes a public review elsewhere.</p>` : `
            <p><a href="${PUBLIC_BASE_URL}/admin/reviews">Approve it for the website →</a></p>`}
        </div>`,
      }).catch(e => console.error('review alert failed:', e.message));
    }

    const thanks = (extra) => quotePage('Thank you', `
      <div class="card">
        <h1>Thank you${rows.length && rows[0].name ? ', ' + escEmail(String(rows[0].name).split(' ')[0]) : ''}!</h1>
        <p class="muted" style="margin-top:8px">${extra}</p>
      </div>`);

    if (rating >= 4 && GOOGLE_REVIEW_URL) {
      return res.send(quotePage('Thank you', `
        <div class="card" style="text-align:center">
          <div style="font-size:34px;color:#F4A623">${STAR(rating)}</div>
          <h1 style="margin-top:8px">Thank you!</h1>
          <p class="muted" style="margin:8px 0 16px">Would you mind sharing that on Google? It genuinely helps
            people find a small shop like ours.</p>
          <a class="btn" href="${escEmail(GOOGLE_REVIEW_URL)}" target="_blank" rel="noopener"
             style="width:100%">Post it on Google →</a>
          <p class="muted" style="margin-top:12px;font-size:12px">Takes about 20 seconds.</p>
        </div>`));
    }
    res.send(thanks(rating >= 4
      ? 'We really appreciate it.'
      : `Sorry we fell short — ${SHOP_SIGNER} will be in touch personally to put it right.`));
  } catch (err) {
    console.error('review submit failed:', err.message);
    res.status(500).send(quotePage('Something went wrong',
      `<div class="card"><div class="warn">Please try again shortly.</div></div>`));
  }
});

/* Ask a customer for a review. Called after delivery. */
async function requestReview({ token, name, email, phone, product, order_ref, quote_code }) {
  if (!isValidEmail(String(email || ''))) return null;
  if (!token) {
    token = reviewToken();
    await pool.query(
      `INSERT INTO reviews (token,name,email,phone,product,order_ref,quote_code,requested_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [token, name || '', email, phone || '', product || '', order_ref || null, quote_code || null]);
  }

  const link = `${PUBLIC_BASE_URL}/review/${token}`;
  const stars = [1,2,3,4,5].map(n =>
    `<a href="${link}?r=${n}" style="text-decoration:none;font-size:30px;color:#F4A623">★</a>`).join(' ');

  await sendEmail({
    to: email,
    subject: `How did we do${name ? ', ' + String(name).split(' ')[0] : ''}?`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1848B8">How did we do?</h2>
      <p style="color:#374151;line-height:1.6">
        ${name ? escEmail(String(name).split(' ')[0]) + ', thanks' : 'Thanks'} again for your order${product ? ' — ' + escEmail(product) : ''}.
        If you have a moment, tap a star. It takes seconds and it genuinely helps a small Chicago shop.</p>
      <p style="text-align:center;margin:22px 0">${stars}</p>
      <p style="text-align:center"><a href="${link}"
         style="background:#1848B8;color:#fff;padding:12px 26px;border-radius:100px;text-decoration:none;font-weight:700">Leave a review</a></p>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin-top:18px">
        Something not right? Reply to this email or text ${SHOP_PHONE} — ${SHOP_SIGNER} would much rather fix it.</p>
      <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
    </div>`,
  });
  return token;
}

/* Public feed for the storefront + schema. */
app.get('/api/reviews', async (req, res) => {
  const rows = await approvedReviews(parseInt(req.query.limit, 10) || 20);
  const count = rows.length;
  const avg = count ? Math.round((rows.reduce((a, r) => a + r.rating, 0) / count) * 10) / 10 : null;
  res.set('Cache-Control', 'public, max-age=600');
  res.json({
    count, average: avg,
    reviews: rows.map(r => ({
      name: r.name, rating: r.rating, title: r.title, body: r.body,
      product: r.product, date: r.submitted_at,
    })),
  });
});

/* June approves what appears publicly. */
app.get('/admin/reviews', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reviews WHERE submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 200`);
    const body = rows.map(r => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;gap:10px">
          <div><b>${escEmail(r.title || '(no headline)')}</b>
            <div class="muted">${escEmail(r.name || 'anonymous')} &middot; ${fmtDate(r.submitted_at)}
              ${r.product ? '&middot; ' + escEmail(r.product) : ''}</div></div>
          <div style="color:#F4A623;white-space:nowrap">${STAR(r.rating || 0)}</div>
        </div>
        <p style="margin-top:8px;color:#46505f">${escEmail(r.body || '')}</p>
        <form method="POST" action="/admin/reviews/${r.id}" style="margin-top:10px;display:flex;gap:8px">
          <button name="action" value="${r.approved ? 'hide' : 'approve'}"
            class="${r.approved ? 'btn-ghost' : ''}" style="padding:8px 18px;font-size:14px">
            ${r.approved ? 'Hide from site' : 'Approve for site'}</button>
          <span class="chip" style="align-self:center;background:${r.approved ? '#e7f6ec' : '#eef1f8'};color:${r.approved ? '#166534' : '#6b7280'}">
            ${r.approved ? 'live' : 'not shown'}</span>
        </form>
      </div>`).join('');
    const live = rows.filter(r => r.approved).length;
    const avg = rows.length ? (rows.reduce((a, r) => a + (r.rating || 0), 0) / rows.length).toFixed(1) : '—';
    res.send(quotePage('Reviews', `<h1>Reviews</h1>
      <div class="sub">${rows.length} received &middot; ${live} live on the site &middot; average ${avg}</div>
      ${body || '<div class="card"><p class="muted">No reviews yet.</p></div>'}`));
  } catch (err) {
    console.error('reviews admin failed:', err.message);
    res.status(500).send(quotePage('Error', '<div class="card"><div class="warn">Could not load reviews.</div></div>'));
  }
});

app.post('/admin/reviews/:id', requireAdmin, async (req, res) => {
  const approve = (req.body || {}).action === 'approve';
  await pool.query('UPDATE reviews SET approved=$2 WHERE id=$1', [parseInt(req.params.id, 10) || 0, approve])
    .catch(e => console.error('review approve failed:', e.message));
  _revCache = { at: 0, rows: [] };
  res.redirect('/admin/reviews');
});

/* ── One-click unsubscribe (RFC 8058) ──────────────────────────────────────
   Gmail/Yahoo require BOTH a GET landing page (for the link in the footer)
   and a POST that unsubscribes without any further interaction (for the
   header button). The token is an HMAC of the address, so an unsubscribe
   link cannot be used to opt out somebody else. */
async function doUnsubscribe(email, source) {
  await pool.query(
    `INSERT INTO email_optouts (email, source) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING`,
    [String(email).toLowerCase(), source || 'one-click']);
}

app.post('/api/unsubscribe', async (req, res) => {
  const email = String(req.query.e || req.body.e || '').trim().toLowerCase();
  const token = String(req.query.t || req.body.t || '');
  if (!isValidEmail(email) || token !== unsubToken(email)) {
    return res.status(400).json({ error: 'bad token' });
  }
  try {
    await doUnsubscribe(email, 'one-click-post');
    res.json({ ok: true });
  } catch (err) {
    console.error('unsubscribe error:', err.message);
    res.status(500).json({ error: 'failed' });
  }
});

app.get('/api/unsubscribe', async (req, res) => {
  const email = String(req.query.e || '').trim().toLowerCase();
  const token = String(req.query.t || '');
  const page = (title, body) => `<!doctype html><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${title}</title>
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:12vh auto;padding:0 20px;text-align:center;">
      <h1 style="color:#1848B8;font-size:22px;">${title}</h1>
      <p style="color:#374151;line-height:1.6;">${body}</p>
      <p style="margin-top:26px;"><a href="https://www.jtees.net" style="color:#1848B8;">Back to jtees.net</a></p>
      <p style="color:#9ca3af;font-size:12px;margin-top:30px;">June&rsquo;s Tees &amp; Things &middot; Chicago, IL</p>
    </div>`;
  if (!isValidEmail(email) || token !== unsubToken(email)) {
    return res.status(400).send(page('That link is not valid',
      'Please use the unsubscribe link from a recent email, or reply to any of our emails and we will remove you.'));
  }
  try {
    await doUnsubscribe(email, 'one-click-get');
    res.send(page('You are unsubscribed',
      `We won't send <strong>${escEmail(email)}</strong> any more promotional email. Order receipts for purchases you make will still come through.`));
  } catch (err) {
    console.error('unsubscribe error:', err.message);
    res.status(500).send(page('Something went wrong', 'Please reply to any of our emails and we will remove you by hand.'));
  }
});

/* ── Order emails (transactional — no unsubscribe suppression) ──────────────
   Called by the Lumise designer's save_order() / update_order_status() over
   the shared internal key. Before these existed the shop emailed people who
   ABANDONED a cart but said nothing to people who actually paid. */

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

function orderItemsTable(items) {
  if (!Array.isArray(items) || !items.length) return '';
  const rows = items.map(i => `
    <tr>
      <td style="padding:9px 6px;border-bottom:1px solid #eee;">${escEmail(i.name || 'Custom item')}</td>
      <td style="padding:9px 6px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">${money(i.total)}</td>
    </tr>`).join('');
  return `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;">${rows}</table>`;
}

function orderShell({ heading, intro, orderId, items, total, shipping, tax, address, footer }) {
  const lines = [];
  if (Number(shipping) > 0) lines.push(`<tr><td style="padding:3px 6px;text-align:right;color:#6b7280;">Shipping</td><td style="padding:3px 6px;text-align:right;white-space:nowrap;">${money(shipping)}</td></tr>`);
  if (Number(tax) > 0) lines.push(`<tr><td style="padding:3px 6px;text-align:right;color:#6b7280;">Sales tax</td><td style="padding:3px 6px;text-align:right;white-space:nowrap;">${money(tax)}</td></tr>`);
  return `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:8px;">
    <h2 style="color:#1848B8;margin:0 0 4px;">${heading}</h2>
    <p style="color:#6b7280;margin:0 0 18px;font-size:14px;">Order #${escEmail(String(orderId))}</p>
    <p style="color:#374151;line-height:1.6;">${intro}</p>
    ${orderItemsTable(items)}
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${lines.join('')}
      <tr><td style="padding:8px 6px;text-align:right;font-weight:700;border-top:2px solid #111;">Total</td>
          <td style="padding:8px 6px;text-align:right;font-weight:700;border-top:2px solid #111;white-space:nowrap;">${money(total)}</td></tr>
    </table>
    ${address ? `<p style="color:#6b7280;font-size:13px;margin-top:16px;"><strong style="color:#374151;">Ship to</strong><br>${escEmail(address)}</p>` : ''}
    ${footer}
    <p style="color:#9ca3af;font-size:12px;margin-top:26px;border-top:1px solid #eee;padding-top:12px;">
      June&rsquo;s Tees &amp; Things &middot; 3047 N Lincoln Ave #435, Chicago, IL 60657<br>
      Questions? Reply to this email or text (773) 849-1854.</p>
  </div>`;
}

// Customer receipt
app.post('/api/order-confirmation', requireInternalKey, async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'bad email' });
    const name = String(b.name || '').trim();
    await sendEmail({
      to: email,
      subject: `Thanks${name ? ', ' + name.split(' ')[0] : ''}! Order #${b.order_id} is in 🎉`,
      html: orderShell({
        heading: 'Thank you for your order!',
        intro: `We&rsquo;ve got it and we&rsquo;re on it. You&rsquo;ll hear from us again as soon as it ships &mdash; most orders print and go out within 7&ndash;10 business days. Need it sooner? Just reply, rush is often possible.`,
        orderId: b.order_id, items: b.items, total: b.total,
        shipping: b.shipping, tax: b.tax, address: b.address,
        footer: `<p style="color:#374151;line-height:1.6;">We print every order ourselves right here in Chicago &mdash; thanks for supporting a small shop.</p>`,
      }),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('order-confirmation error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

// Shop's own new-order alert
app.post('/api/order-notification', requireInternalKey, async (req, res) => {
  try {
    const b = req.body || {};
    const to = String(b.to || SHOP_EMAIL || '').trim();
    if (!isValidEmail(to)) return res.status(400).json({ error: 'bad recipient' });
    await sendEmail({
      to,
      replyTo: isValidEmail(String(b.email || '')) ? String(b.email) : undefined,
      subject: `🧾 New order #${b.order_id} — ${money(b.total)}`,
      html: orderShell({
        heading: 'New order received',
        intro: `<strong>${escEmail(b.name || 'A customer')}</strong>${b.email ? ` (${escEmail(b.email)})` : ''} just checked out${b.payment ? ` via ${escEmail(b.payment)}` : ''}.`,
        orderId: b.order_id, items: b.items, total: b.total,
        shipping: b.shipping, tax: b.tax, address: b.address,
        footer: `<p style="margin:18px 0;"><a href="https://design.jtees.net/admin.php?lumise-page=order&order_id=${encodeURIComponent(b.order_id)}" style="background:#1848B8;color:#fff;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:100px;display:inline-block;">Open in admin →</a></p>`,
      }),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('order-notification error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

// "Your order shipped"
/* Review requests ride on the shipped notice: the designer calls this when June
   marks an order shipped, so the ask lands a sensible number of days later
   rather than needing its own trigger. */
app.post('/api/order-shipped', requireInternalKey, async (req, res) => {
  try {
    const b = req.body || {};
    const email = String(b.email || '').trim();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'bad email' });
    const name = String(b.name || '').trim();
    const tracking = String(b.tracking || '').trim();
    await sendEmail({
      to: email,
      subject: `Your order #${b.order_id} is on the way 📦`,
      html: orderShell({
        heading: 'It&rsquo;s on the way!',
        intro: `${name ? escEmail(name.split(' ')[0]) + ', y' : 'Y'}our order just left our shop.`
          + (tracking
              ? ` Tracking number: <strong>${escEmail(tracking)}</strong>.`
              : ` We&rsquo;ll follow up with tracking as soon as it&rsquo;s available.`),
        orderId: b.order_id, items: b.items, total: b.total,
        shipping: b.shipping, tax: b.tax, address: b.address,
        footer: tracking
          ? `<p style="margin:18px 0;"><a href="https://www.google.com/search?q=${encodeURIComponent(tracking)}" style="background:#1848B8;color:#fff;font-weight:700;text-decoration:none;padding:12px 26px;border-radius:100px;display:inline-block;">Track my package →</a></p>`
          : '',
      }),
    });
    /* Record the ask as DUE rather than holding a timer — a setTimeout would be
       lost on the next deploy, and this service redeploys often. The hourly
       sweep sends it when the date arrives. */
    if (isValidEmail(String(b.email || ''))) {
      const days = Math.max(0, parseInt(process.env.JT_REVIEW_DELAY_DAYS || '7', 10));
      await pool.query(
        `INSERT INTO reviews (token, name, email, phone, product, order_ref, requested_at)
         VALUES ($1,$2,$3,$4,$5,$6, NOW() + ($7 || ' days')::interval)
         ON CONFLICT (token) DO NOTHING`,
        [reviewToken(), b.name || '', String(b.email), b.phone || '',
         Array.isArray(b.items) && b.items[0] ? b.items[0].name : '',
         String(b.order_id || ''), String(days)]
      ).catch(e => console.error('review queue failed:', e.message));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('order-shipped error:', err.message);
    res.status(500).json({ error: 'send failed' });
  }
});

/* Quote nudges. A quote that is sent and then goes quiet is the most common way
   work is lost, so this chases it — but only in ways that respect the customer:
   ONE follow-up, only if they have not accepted, only while the quote is still
   valid, and never to someone who has opted out. June still texts personally;
   this is the safety net for the ones she does not get back to. */
async function sendQuoteFollowUps() {
  const days = Math.max(1, parseInt(process.env.JT_QUOTE_FOLLOWUP_DAYS || '3', 10));
  try {
    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE accepted_at IS NULL
          AND followed_up_at IS NULL
          AND status IN ('sent','viewed')
          AND created_at <= NOW() - ($1 || ' days')::interval
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
          AND email <> ''
        LIMIT 20`, [String(days)]);

    for (const q of rows) {
      // Mark first: a send that throws must not re-fire every hour.
      await pool.query('UPDATE quotes SET followed_up_at=NOW() WHERE id=$1', [q.id]);
      if (await isUnsubscribed(q.email)) continue;

      const msgs = quoteMessages(q);
      const t = quoteTotals(q);
      try {
        await sendEmail({
          to: q.email,
          subject: `Still thinking it over? Quote ${q.code}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#1848B8">Just checking in</h2>
            <p style="color:#374151;line-height:1.6">${escEmail(msgs.followup.split('\n')[0])}</p>
            <p style="text-align:center;margin:22px 0">
              <a href="${quoteLink(q.code)}" style="background:#1848B8;color:#fff;padding:13px 28px;
                 border-radius:100px;text-decoration:none;font-weight:700">View your quote — ${money(t.total)}</a></p>
            <p style="color:#374151;line-height:1.6">Happy to adjust quantities, colours or sizes — just reply
               or text ${SHOP_PHONE}. If the timing is wrong, no problem at all.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_SIGNER} &middot; ${SHOP_PHONE}</p>
          </div>`,
        });
        console.log('quote follow-up sent:', q.code, q.email);
      } catch (e) {
        console.error('quote follow-up failed', q.code, e.message);
      }
    }
  } catch (e) {
    console.error('quote follow-up sweep failed:', e.message);
  }
}

/* Accepted but never paid. This is the expensive one — the customer has said
   yes and is waiting on June, while June is waiting on the deposit and nothing
   moves. One reminder, two days after acceptance. */
async function sendDepositReminders() {
  const days = Math.max(1, parseInt(process.env.JT_DEPOSIT_NUDGE_DAYS || '2', 10));
  try {
    const { rows } = await pool.query(
      `SELECT * FROM quotes
        WHERE accepted_at IS NOT NULL
          AND COALESCE(paid_amount,0) = 0
          AND deposit_nudged_at IS NULL
          AND accepted_at <= NOW() - ($1 || ' days')::interval
          AND email <> ''
        LIMIT 20`, [String(days)]);

    for (const q of rows) {
      await pool.query('UPDATE quotes SET deposit_nudged_at=NOW() WHERE id=$1', [q.id]);
      const t = quoteTotals(q);
      try {
        await sendEmail({
          to: q.email,
          subject: `Ready when you are — deposit for quote ${q.code}`,
          html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto">
            <h2 style="color:#1848B8">We're ready to start</h2>
            <p style="color:#374151;line-height:1.6">
              ${q.name ? escEmail(String(q.name).split(' ')[0]) + ', thanks' : 'Thanks'} for approving your quote.
              We'll get straight on it as soon as the deposit is in — that's what reserves your spot in the
              print schedule.</p>
            <p style="text-align:center;margin:22px 0">
              <a href="${quoteLink(q.code)}" style="background:#1848B8;color:#fff;padding:13px 28px;
                 border-radius:100px;text-decoration:none;font-weight:700">Pay ${money(t.deposit)} deposit</a></p>
            <p style="color:#374151;line-height:1.6">Card, Apple Pay, Zelle to <b>${escEmail(ZELLE_HANDLE)}</b>
               (shows as ${escEmail(ZELLE_NAME)}), or cash — whichever suits. Questions? Just reply or text ${SHOP_PHONE}.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:22px">${SHOP_NAME} &middot; ${SHOP_SIGNER}</p>
          </div>`,
        });
        console.log('deposit reminder sent:', q.code);
      } catch (e) {
        console.error('deposit reminder failed', q.code, e.message);
      }
    }
  } catch (e) {
    console.error('deposit reminder sweep failed:', e.message);
  }
}

/* Expire quotes whose validity has passed, so the list reflects reality
   instead of showing stale "sent" rows forever. */
async function expireOldQuotes() {
  try {
    const r = await pool.query(
      `UPDATE quotes SET status='expired'
        WHERE accepted_at IS NULL AND status IN ('sent','viewed','changes')
          AND valid_until IS NOT NULL AND valid_until < CURRENT_DATE`);
    if (r.rowCount) console.log('quotes expired:', r.rowCount);
  } catch (e) {
    console.error('quote expiry failed:', e.message);
  }
}

/* Send review requests that have come due. Runs inside the existing hourly
   sweep — no new scheduler, and it survives deploys because the due date lives
   in the database rather than in a timer. */
async function sendDueReviewRequests() {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM reviews
        WHERE sent_at IS NULL AND submitted_at IS NULL
          AND requested_at IS NOT NULL AND requested_at <= NOW()
          AND email <> '' LIMIT 25`);
    for (const r of rows) {
      // Never mail someone who has opted out.
      if (await isUnsubscribed(r.email)) {
        await pool.query('UPDATE reviews SET sent_at=NOW() WHERE id=$1', [r.id]);
        continue;
      }
      try {
        await requestReview({
          token: r.token, name: r.name, email: r.email, phone: r.phone,
          product: r.product, order_ref: r.order_ref, quote_code: r.quote_code,
        });
        await pool.query('UPDATE reviews SET sent_at=NOW() WHERE id=$1', [r.id]);
        console.log('review request sent:', r.email);
      } catch (e) {
        console.error('review request failed for', r.email, e.message);
        // Mark it anyway so one bad address cannot block the queue forever.
        await pool.query('UPDATE reviews SET sent_at=NOW() WHERE id=$1', [r.id]);
      }
    }
  } catch (e) {
    console.error('review sweep failed:', e.message);
  }
}

// Hourly abandoned-cart sweep trigger (the designer PHP does the real work).
// Self-rescheduling with a timeout so a slow sweep can never overlap the next one.
if (process.env.JT_INTERNAL_KEY) {
  const runSweep = async () => {
    try {
      const r = await fetch(
        `https://design.jtees.net/jt-cron.php?key=${encodeURIComponent(process.env.JT_INTERNAL_KEY)}`,
        { signal: AbortSignal.timeout(120000) }
      );
      console.log('abandoned-cart sweep:', (await r.text()).trim());
      await sendDueReviewRequests();
      await sendQuoteFollowUps();
      await sendDepositReminders();
      await expireOldQuotes();
    } catch (e) {
      console.error('abandoned-cart sweep failed:', e.message);
    }
    setTimeout(runSweep, 60 * 60 * 1000);
  };
  setTimeout(runSweep, 60 * 60 * 1000);
}

// Submit grad order
app.post('/api/submit-order', orderRateLimit, rejectBots, async (req, res) => {
  // Grad ordering is retired — delete this early return to reactivate the
  // handler below, which is kept intact in case the program returns.
  if (!process.env.GRAD_ORDERS_ENABLED) {
    return res.status(410).json({ success: false, error: 'Grad ordering has ended. Visit https://design.jtees.net/ to place a custom order.' });
  }
  try {
    const body = req.body;
    const errors = validateGradOrder(body);
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('; ') });

    let photos = [];
    try {
      const raw = Array.isArray(body.photos) ? body.photos : (body.photos_json ? JSON.parse(body.photos_json) : []);
      photos = Array.isArray(raw) ? raw.filter(u => typeof u === 'string' && u.startsWith('https://res.cloudinary.com/')).slice(0, 20) : [];
    } catch { photos = []; }

    const orderRef = generateGradRef();
    // Clamp quantities to a sane range so junk input can't produce
    // negative or absurd totals in emails and CRM records.
    const gradQty = (v) => {
      const n = parseInt(v, 10);
      return Number.isInteger(n) && n > 0 ? Math.min(n, 10000) : 0;
    };
    const products = {
      // Apparel
      tee_1to4: gradQty(body.qty_tee_1to4),
      tee_5to9: gradQty(body.qty_tee_5to9),
      family_1to4: gradQty(body.qty_family_1to4),
      family_5to9: gradQty(body.qty_family_5to9),
      hoodie: gradQty(body.qty_hoodie),
      stole: gradQty(body.qty_stole),
      // Signs & Banners
      yard_sign: gradQty(body.qty_yard_sign),
      banner_4x2: gradQty(body.qty_banner_4x2),
      banner_6x3: gradQty(body.qty_banner_6x3),
      // Cutouts & Standees
      bighead_single: gradQty(body.qty_bighead_single),
      bighead_5pk: gradQty(body.qty_bighead_5pk),
      mini_standee: gradQty(body.qty_mini_standee),
      standee: gradQty(body.qty_standee),
      // Arches & Backdrops
      arch: gradQty(body.qty_arch),
      backdrop: gradQty(body.qty_backdrop),
      // Party Favors
      button_4pk: gradQty(body.qty_button_4pk),
      button_10pk: gradQty(body.qty_button_10pk),
      magnet: gradQty(body.qty_magnet),
      sticker: gradQty(body.qty_sticker),
      chipbag_6: gradQty(body.qty_chipbag_6),
      chipbag_12: gradQty(body.qty_chipbag_12),
      gable_box: gradQty(body.qty_gable_box),
      // Drinkware
      tumbler: gradQty(body.qty_tumbler),
      cup_4pk: gradQty(body.qty_cup_4pk),
      can_cooler: gradQty(body.qty_can_cooler),
      koozie: gradQty(body.qty_koozie),
      // Prom Night
      step_repeat: gradQty(body.qty_step_repeat),
      prom_arch: gradQty(body.qty_prom_arch),
      photo_props: gradQty(body.qty_photo_props),
      prom_decal: gradQty(body.qty_prom_decal),
    };
    const apparel = {
      shirt_qty: gradQty(body.shirt_qty), print_method: body.print_method || '',
      sizes: {
        youth_s: parseInt(body.size_ys) || 0, youth_m: parseInt(body.size_ym) || 0,
        youth_l: parseInt(body.size_yl) || 0, youth_xl: parseInt(body.size_yxl) || 0,
        adult_s: parseInt(body.size_as) || 0, adult_m: parseInt(body.size_am) || 0,
        adult_l: parseInt(body.size_al) || 0, adult_xl: parseInt(body.size_axl) || 0,
        '2xl': parseInt(body.size_2xl) || 0, '3xl': parseInt(body.size_3xl) || 0,
        '4xl': parseInt(body.size_4xl) || 0, '5xl': parseInt(body.size_5xl) || 0,
      },
      design_notes: body.design_notes || '',
    };
    const designs = {
      senior_night: body['design_senior-night'] || '',
      graduation:   body.design_graduation || '',
      prom:         body.design_prom || '',
      senior_night_name: body['design_name_senior-night'] || '',
      graduation_name:   body.design_name_graduation || '',
      prom_name:         body.design_name_prom || '',
      senior_night_img:  body['design_img_senior-night'] || '',
      graduation_img:    body.design_img_graduation || '',
      prom_img:          body.design_img_prom || '',
    };
    const order = {
      order_ref: orderRef, parent_name: String(body.parent_name).trim(),
      student_name: (body.student_name || '').trim(), email: String(body.email).trim().toLowerCase(),
      phone: (body.phone || '').trim(), school: (body.school || '').trim(),
      event_date: body.event_date || '', needed_by: body.needed_by || '',
      address: (body.address || '').trim(), event_type: String(body.event_type).trim(),
      products, apparel, designs,
      upload_method: body.upload_method || '', upload_link: body.upload_link || '',
      payment_method: body.payment_method || '', notes: (body.notes || '').trim(),
      signature: (body.signature || '').trim(), sign_date: (body.sign_date || '').trim(),
      school_colors: (body.school_colors || '').trim(), photos,
    };

    const rawData = {
      school_colors: order.school_colors,
      sign_date: order.sign_date,
      design_selection: designs,
    };

    await pool.query(
      `INSERT INTO grad_orders
        (order_ref, parent_name, student_name, email, phone, school,
         event_date, needed_by, address, event_type, products, apparel,
         designs, upload_method, upload_link, payment_method, notes, signature, photos, raw_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [order.order_ref, order.parent_name, order.student_name, order.email,
       order.phone, order.school, order.event_date, order.needed_by,
       order.address, order.event_type,
       JSON.stringify(order.products), JSON.stringify(order.apparel), JSON.stringify(order.designs),
       order.upload_method, order.upload_link, order.payment_method,
       order.notes, order.signature, JSON.stringify(order.photos), JSON.stringify(rawData)]
    );

    const [emailResult, confirmResult, hubspotResult, cloverResult] = await Promise.allSettled([
      sendGradOrderEmail(order),
      sendGradOrderConfirmationEmail(order),
      syncGradToBrevo(order),
      createGradCloverCustomerAndOrder(order),
    ]);
    if (emailResult.status   === 'rejected') console.error('Grad notification email failed:', emailResult.reason?.message);
    if (confirmResult.status === 'rejected') console.error('Grad confirmation email failed:',  confirmResult.reason?.message);
    if (hubspotResult.status === 'rejected') console.error('Grad Brevo sync failed:',          hubspotResult.reason?.message, JSON.stringify(hubspotResult.reason?.response?.data));
    if (cloverResult.status  === 'rejected') console.error('Grad Clover sync failed:',         cloverResult.reason?.message, JSON.stringify(cloverResult.reason?.response?.data));

    const idUpdates = [];
    const idValues  = [];
    let   idx       = 1;
    if (hubspotResult.status === 'fulfilled') {
      idUpdates.push(`hubspot_contact_id=$${idx++}`, `hubspot_deal_id=$${idx++}`);
      idValues.push(hubspotResult.value.contactId, hubspotResult.value.dealId);
    }
    if (cloverResult.status === 'fulfilled') {
      idUpdates.push(`clover_customer_id=$${idx++}`, `clover_order_id=$${idx++}`);
      idValues.push(cloverResult.value.cloverCustomerId, cloverResult.value.cloverOrderId);
    }
    if (idUpdates.length) {
      idValues.push(orderRef);
      pool.query(
        `UPDATE grad_orders SET ${idUpdates.join(', ')} WHERE order_ref=$${idx}`,
        idValues
      ).catch(err => console.error('Grad ID update failed:', err.message));
    }

    res.json({ success: true, orderRef });
  } catch (err) {
    console.error('Grad order error:', err);
    res.status(500).json({ success: false, error: 'Failed to save order. Please try again.' });
  }
});

// Grad orders admin
app.get('/api/orders', requireGradAdmin, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM grad_orders ORDER BY created_at DESC LIMIT 200');
    res.json(rows);
  } catch (err) {
    console.error('Grad orders fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});
const ORDER_REF_RE = /^ORD-\d{4}-[A-F0-9]{6}$/;

function validateOrderRef(req, res, next) {
  if (!ORDER_REF_RE.test(String(req.params.ref || ''))) {
    return res.status(400).json({ error: 'Invalid order reference format' });
  }
  next();
}

app.get('/api/orders/:ref', requireGradAdmin, validateOrderRef, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM grad_orders WHERE order_ref = $1', [req.params.ref]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Grad order fetch failed:', err.message);
    res.status(500).json({ error: 'Failed to load order.' });
  }
});
app.patch('/api/orders/:ref/status', requireGradAdmin, validateOrderRef, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new','in_review','proof_sent','approved','in_production','shipped','complete'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    await pool.query('UPDATE grad_orders SET status = $1 WHERE order_ref = $2', [status, req.params.ref]);
    res.json({ success: true });
  } catch (err) {
    console.error('Status update failed:', err.message);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});
app.patch('/api/orders/:ref/notes', requireGradAdmin, validateOrderRef, async (req, res) => {
  try {
    const { admin_notes } = req.body;
    if (typeof admin_notes !== 'string' || admin_notes.length > 5000) return res.status(400).json({ error: 'Invalid notes' });
    await pool.query('UPDATE grad_orders SET admin_notes = $1 WHERE order_ref = $2', [admin_notes, req.params.ref]);
    res.json({ success: true });
  } catch (err) {
    console.error('Notes update failed:', err.message);
    res.status(500).json({ error: 'Failed to update notes.' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

// ─── Global error handler ─────────────────────────────────────────────────────

// Email test — exercises the same Brevo-first path production emails use
app.get('/api/test-email', requireAdmin, async (_req, res) => {
  try {
    await sendEmail({
      to:      NOTIFY_EMAIL,
      subject: 'Email Test — June\'s Tees',
      html:    '<p>Email sending is working correctly.</p>',
    });
    res.json({ success: true, message: `Test email sent to ${NOTIFY_EMAIL}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large.' });
  }
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── 404 catch-all (HTML pages) ──────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = ['DATABASE_URL', 'BREVO_API_KEY', 'NOTIFICATION_EMAIL'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]?.trim());
if (missingEnv.length) {
  console.error('Missing required environment variables:', missingEnv.join(', '));
  process.exit(1);
}
if (!process.env.RESEND_API_KEY?.trim()) {
  console.warn('WARNING: RESEND_API_KEY is not set — no fallback if Brevo sending fails.');
}
if (!process.env.ADMIN_PASSWORD?.trim()) {
  console.warn('WARNING: ADMIN_PASSWORD is not set — admin routes will be inaccessible.');
}

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});

const PORT = process.env.PORT || 3000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`Listening on port ${PORT}`)))
  .catch(err => {
    console.error('DB init failed, exiting:', err.message);
    process.exit(1);
  });
