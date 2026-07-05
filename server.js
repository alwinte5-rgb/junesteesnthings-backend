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

// Grad season pages are retired for now (files kept for next year) — temporary redirect home.
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

const resend = new Resend(process.env.RESEND_API_KEY);

const NOTIFY_EMAIL = process.env.NOTIFICATION_EMAIL;
const FROM_ADDRESS = `June's Tees & Things <${NOTIFY_EMAIL}>`;


// ─── Brevo email (preferred for customer messages; Resend is the fallback) ───
async function sendEmail({ to, subject, html, replyTo }) {
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
  const { error } = await resend.emails.send({ from: FROM_ADDRESS, reply_to: replyTo || NOTIFY_EMAIL, to, subject, html });
  if (error) throw new Error(`Resend: ${error.message || JSON.stringify(error)}`);
}

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
        ${img('designer-tee.jpg', 'Custom printed t-shirt')}
        ${img('designer-hoodie.jpg', 'Custom hoodie')}
        ${img('designer-print.jpg', 'Full-color custom print')}
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
  await resend.emails.send({
    from:     FROM_ADDRESS,
    reply_to: NOTIFY_EMAIL,
    to:       NOTIFY_EMAIL,
    subject:  `New Quote Request — ${s.name}`,
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
  await resend.emails.send({
    from:     FROM_ADDRESS,
    reply_to: NOTIFY_EMAIL,
    to:       s.email,
    subject:  `We got your request, ${(s.name || '').split(' ')[0]}!`,
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
  await resend.emails.send({
    from:     FROM_ADDRESS,
    reply_to: NOTIFY_EMAIL,
    to:       s.email,
    subject:  `Payment confirmed — your order is in production!`,
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
  const expected = 'Basic ' + Buffer.from(`admin:${process.env.ADMIN_PASSWORD || ''}`).toString('base64');
  const provided  = req.headers['authorization'] || '';
  let valid = false;
  try {
    valid = provided.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch { valid = false; }
  if (!valid) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
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
  if (description && String(description).length > 2000) {
    return res.status(400).json({ error: 'Description too long.' });
  }
  if (photo_url && (
    typeof photo_url !== 'string' ||
    !photo_url.startsWith('https://res.cloudinary.com/')
  )) {
    return res.status(400).json({ error: 'Invalid photo URL.' });
  }

  const s = { name: name.trim(), phone: phone.trim(), email: email.trim(), description, photo_url };

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

  const { rows } = await pool.query('SELECT * FROM submissions WHERE id=$1', [submissionId]);
  if (!rows.length) return res.status(404).json({ error: 'Submission not found.' });

  const sub = rows[0];

  try {
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
  if (!body.email || !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(String(body.email).trim())) errors.push('valid email is required');
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
  if (!process.env.RESEND_API_KEY) return;

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

  await resend.emails.send({
    from:     FROM_ADDRESS,
    reply_to: order.email || NOTIFY_EMAIL,
    to:       NOTIFY_EMAIL,
    subject:  `New Grad Order ${order.order_ref} — ${order.parent_name}`,
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
  if (!process.env.RESEND_API_KEY || !order.email) return;
  await resend.emails.send({
    from:     FROM_ADDRESS,
    reply_to: NOTIFY_EMAIL,
    to:       order.email,
    subject:  `Your Grad Order is Confirmed — ${order.order_ref}`,
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
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || code.length !== 6) {
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'bad input' });
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-z_]{3,40}$/.test(eventName)) {
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
app.post('/api/abandoned-cart-email', requireInternalKey, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const count = parseInt(req.body.item_count, 10) || 0;
    const total = Number(req.body.total || 0);
    const url = String(req.body.restore_url || '');
    const stage = Math.min(5, Math.max(1, parseInt(req.body.stage, 10) || 2));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !url.startsWith('https://design.jtees.net/')) {
      return res.status(400).json({ error: 'bad input' });
    }
    const promoCode = process.env.JT_PROMO_CODE || 'SAVE10';
    const promoPct = parseInt(process.env.JT_PROMO_PCT, 10) || 10;
    const cartLine = `Your cart at June's Tees &amp; Things has <strong>${count} item${count === 1 ? '' : 's'}</strong>${total ? ` (about $${total.toFixed(2)})` : ''} — including your custom design work. It's saved and ready whenever you are.`;
    const copy = count > 0 ? {
      1: { subject: `Your cart is saved — pick up anytime ✅`, heading: `We saved your cart!`, body: `${cartLine} This link works on any device, whenever you're ready.`, cta: `Pick Up Where I Left Off →` },
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
    await sendEmail({
      to: email,
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

// Hourly abandoned-cart sweep trigger (the designer PHP does the real work)
if (process.env.JT_INTERNAL_KEY) {
  setInterval(() => {
    fetch(`https://design.jtees.net/jt-cron.php?key=${encodeURIComponent(process.env.JT_INTERNAL_KEY)}`)
      .then(r => r.text()).then(t => console.log('abandoned-cart sweep:', t.trim()))
      .catch(e => console.error('abandoned-cart sweep failed:', e.message));
  }, 60 * 60 * 1000);
}

// Submit grad order
app.post('/api/submit-order', orderRateLimit, rejectBots, async (req, res) => {
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
    const products = {
      // Apparel
      tee_1to4: parseInt(body.qty_tee_1to4) || 0,
      tee_5to9: parseInt(body.qty_tee_5to9) || 0,
      family_1to4: parseInt(body.qty_family_1to4) || 0,
      family_5to9: parseInt(body.qty_family_5to9) || 0,
      hoodie: parseInt(body.qty_hoodie) || 0,
      stole: parseInt(body.qty_stole) || 0,
      // Signs & Banners
      yard_sign: parseInt(body.qty_yard_sign) || 0,
      banner_4x2: parseInt(body.qty_banner_4x2) || 0,
      banner_6x3: parseInt(body.qty_banner_6x3) || 0,
      // Cutouts & Standees
      bighead_single: parseInt(body.qty_bighead_single) || 0,
      bighead_5pk: parseInt(body.qty_bighead_5pk) || 0,
      mini_standee: parseInt(body.qty_mini_standee) || 0,
      standee: parseInt(body.qty_standee) || 0,
      // Arches & Backdrops
      arch: parseInt(body.qty_arch) || 0,
      backdrop: parseInt(body.qty_backdrop) || 0,
      // Party Favors
      button_4pk: parseInt(body.qty_button_4pk) || 0,
      button_10pk: parseInt(body.qty_button_10pk) || 0,
      magnet: parseInt(body.qty_magnet) || 0,
      sticker: parseInt(body.qty_sticker) || 0,
      chipbag_6: parseInt(body.qty_chipbag_6) || 0,
      chipbag_12: parseInt(body.qty_chipbag_12) || 0,
      gable_box: parseInt(body.qty_gable_box) || 0,
      // Drinkware
      tumbler: parseInt(body.qty_tumbler) || 0,
      cup_4pk: parseInt(body.qty_cup_4pk) || 0,
      can_cooler: parseInt(body.qty_can_cooler) || 0,
      koozie: parseInt(body.qty_koozie) || 0,
      // Prom Night
      step_repeat: parseInt(body.qty_step_repeat) || 0,
      prom_arch: parseInt(body.qty_prom_arch) || 0,
      photo_props: parseInt(body.qty_photo_props) || 0,
      prom_decal: parseInt(body.qty_prom_decal) || 0,
    };
    const apparel = {
      shirt_qty: parseInt(body.shirt_qty) || 0, print_method: body.print_method || '',
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
  const { rows } = await pool.query('SELECT * FROM grad_orders WHERE order_ref = $1', [req.params.ref]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
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

// Email test
app.get('/api/test-email', requireAdmin, async (_req, res) => {
  try {
    const { error } = await resend.emails.send({
      from:     FROM_ADDRESS,
      reply_to: NOTIFY_EMAIL,
      to:       NOTIFY_EMAIL,
      subject:  'Email Test — June\'s Tees',
      text:     'Resend is working correctly.',
    });
    if (error) return res.status(500).json({ success: false, error: error.message });
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

const REQUIRED_ENV = ['DATABASE_URL', 'RESEND_API_KEY', 'NOTIFICATION_EMAIL'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]?.trim());
if (missingEnv.length) {
  console.error('Missing required environment variables:', missingEnv.join(', '));
  process.exit(1);
}
if (!process.env.ADMIN_PASSWORD?.trim()) {
  console.warn('WARNING: ADMIN_PASSWORD is not set — admin routes will be inaccessible.');
}

const PORT = process.env.PORT || 3000;
initDB().then(() => app.listen(PORT, () => console.log(`Listening on port ${PORT}`)));
