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
}));
app.use(cors({ origin: 'https://www.jtees.net' }));
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    if (req.url && req.url.startsWith('/webhooks/')) req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

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
      admin_notes    TEXT,
      raw_data       JSONB
    )
  `);
  console.log('Database ready.');
}

// ─── Email ────────────────────────────────────────────────────────────────────

const resend = new Resend(process.env.RESEND_API_KEY);

function escEmail(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

async function sendNotificationEmail(s) {
  const photoRow = s.photo_url
    ? `<tr><td style="padding:8px;font-weight:bold;vertical-align:top;">Photo</td><td style="padding:8px;"><a href="${escEmail(s.photo_url)}">View Photo</a><br/><img src="${escEmail(s.photo_url)}" style="max-width:300px;margin-top:8px;border-radius:6px;" /></td></tr>`
    : '';
  await resend.emails.send({
    from:     "June's Tees & Things <info@jtees.net>",
    reply_to: 'info@jtees.net',
    to:       process.env.NOTIFICATION_EMAIL || 'info@jtees.net',
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
    from:     "June's Tees & Things <info@jtees.net>",
    reply_to: 'info@jtees.net',
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
        <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees & Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
      </div>
    `,
  });
}

async function sendPaymentReceivedEmail(s, amount) {
  await resend.emails.send({
    from:     "June's Tees & Things <info@jtees.net>",
    reply_to: 'info@jtees.net',
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
        <p style="color:#999;font-size:12px;margin-top:24px;">June's Tees & Things · 3047 N Lincoln Ave #435, Chicago, IL 60657</p>
      </div>
    `,
  });
}

// ─── Brevo ────────────────────────────────────────────────────────────────────

const brevo = axios.create({
  baseURL: 'https://api.brevo.com/v3',
  headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
});

async function syncToBrevo(s) {
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

// ─── HubSpot ──────────────────────────────────────────────────────────────────

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
      dealstage: 'appointmentscheduled',
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

  await hubspot.post('/crm/v3/objects/notes', {
    properties: { hs_note_body: noteLines.join('\n'), hs_timestamp: Date.now().toString() },
    associations: [
      { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1   }] },
      { to: { id: dealId    }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] },
    ],
  });
}

async function createHubSpotTask(s, contactId) {
  await hubspot.post('/crm/v3/objects/tasks', {
    properties: {
      hs_task_subject: `Follow up with ${s.name} about quote`,
      hs_task_body:    `Phone: ${s.phone} | Email: ${s.email}`,
      hs_timestamp:    (Date.now() + 86_400_000).toString(),
      hs_task_status:  'NOT_STARTED',
      hs_task_type:    'TODO',
    },
    associations: [{
      to:    { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }],
    }],
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

const clover = axios.create({
  baseURL: 'https://api.clover.com',
  headers: { Authorization: `Bearer ${process.env.CLOVER_API_TOKEN}` },
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

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Form submission ──────────────────────────────────────────────────────────

app.post('/submit', gradRateLimit(10, 60 * 60 * 1000), async (req, res) => {
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

  if (emailResult.status         === 'rejected') console.error('Notification email failed:', emailResult.reason?.message);
  if (customerEmailResult.status === 'rejected') console.error('Confirmation email failed:', customerEmailResult.reason?.message);
  if (brevoResult.status         === 'rejected') console.error('Brevo sync failed:',         brevoResult.reason?.message);
  if (hubspotResult.status       === 'rejected') console.error('HubSpot failed:',            hubspotResult.reason?.message);
  if (cloverResult.status        === 'rejected') console.error('Clover failed:',             cloverResult.reason?.message);

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
            <div><div class="label">HubSpot</div><div class="value">\${r.hubspot_contact_id ? '<a href="https://app.hubspot.com/contacts/0/contact/'+encodeURIComponent(r.hubspot_contact_id)+'" target="_blank">View</a>' : '—'}</div></div>
            <div><div class="label">Clover</div><div class="value">\${r.clover_order_id ? 'Order created' : r.clover_customer_id ? 'Customer only' : '—'}</div></div>
            <div class="desc"><div class="label">Description</div><div class="value">\${esc(r.description)||'—'}</div></div>
            \${r.photo_url && r.photo_url.startsWith('https://res.cloudinary.com/') ? \`<div class="photo"><div class="label">Photo</div><a href="\${esc(r.photo_url)}" target="_blank"><img src="\${esc(r.photo_url)}" /></a></div>\` : ''}
            <div class="date">Submitted \${new Date(r.created_at).toLocaleString('en-US',{timeZone:'America/Chicago'})} CT &nbsp;·&nbsp; ID #\${parseInt(r.id,10)}</div>
          </div>
          <div class="actions">
            \${!r.clover_order_id ? \`<button class="btn btn-primary" onclick="openModal(\${parseInt(r.id,10)})">Create Clover Order</button>\` : ''}
            \${r.hubspot_contact_id ? \`<a class="btn btn-secondary" href="https://app.hubspot.com/contacts/0/contact/\${esc(r.hubspot_contact_id)}" target="_blank">HubSpot Contact</a>\` : ''}
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
const gradRateLimitStore = new Map();
function gradRateLimit(maxReqs, windowMs) {
  return (req, res, next) => {
    const ip    = req.ip || req.socket.remoteAddress || 'unknown';
    const now   = Date.now();
    const entry = gradRateLimitStore.get(ip) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + windowMs; }
    entry.count++;
    gradRateLimitStore.set(ip, entry);
    if (entry.count > maxReqs) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}
const orderRateLimit     = gradRateLimit(10, 60 * 60 * 1000);
const signatureRateLimit = gradRateLimit(30, 60 * 60 * 1000);

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

async function sendGradOrderEmail(order) {
  if (!process.env.RESEND_API_KEY) return;
  const productLines = Object.entries(order.products || {})
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => `  • ${key}: ${qty}`)
    .join('\n');
  await resend.emails.send({
    from:     "June's Tees & Things <info@jtees.net>",
    reply_to: 'info@jtees.net',
    to:       process.env.NOTIFICATION_EMAIL || 'info@jtees.net',
    subject:  `New Grad Order ${order.order_ref} — ${order.parent_name}`,
    html: `<h2>New Grad Order — ${escHtml(order.order_ref)}</h2>
      <p><strong>Name:</strong> ${escHtml(order.parent_name)}<br>
      <strong>Student:</strong> ${escHtml(order.student_name) || '—'}<br>
      <strong>Email:</strong> ${escHtml(order.email)}<br>
      <strong>Phone:</strong> ${escHtml(order.phone) || '—'}<br>
      <strong>Event:</strong> ${escHtml(order.event_type)}<br>
      <strong>Event Date:</strong> ${escHtml(order.event_date) || '—'}<br>
      <strong>Needed By:</strong> ${escHtml(order.needed_by) || '—'}</p>
      <h3>Products</h3><pre>${escHtml(productLines) || 'None selected'}</pre>
      <h3>Payment</h3><p>${escHtml(order.payment_method) || '—'}</p>`,
  });
}

async function sendGradOrderConfirmationEmail(order) {
  if (!process.env.RESEND_API_KEY || !order.email) return;
  const productLines = Object.entries(order.products || {})
    .filter(([, qty]) => qty > 0)
    .map(([key, qty]) => `  • ${key}: ${qty}`)
    .join('\n');
  await resend.emails.send({
    from:     "June's Tees & Things <info@jtees.net>",
    reply_to: 'info@jtees.net',
    to:       order.email,
    subject:  `Your Grad Order is Confirmed — ${order.order_ref}`,
    html: `<h2>Thanks for your order, ${escHtml(order.parent_name)}!</h2>
      <p>We've received your grad order and will be in touch soon to confirm details and next steps.</p>
      <p><strong>Order Reference:</strong> ${escHtml(order.order_ref)}<br>
      <strong>Student:</strong> ${escHtml(order.student_name) || '—'}<br>
      <strong>Event:</strong> ${escHtml(order.event_type)}<br>
      <strong>Event Date:</strong> ${escHtml(order.event_date) || '—'}<br>
      <strong>Needed By:</strong> ${escHtml(order.needed_by) || '—'}</p>
      <h3>Items Ordered</h3><pre>${escHtml(productLines) || 'None selected'}</pre>
      <p><strong>Payment Method:</strong> ${escHtml(order.payment_method) || '—'}</p>
      <p>Questions? Reply to this email or reach us at jtees.net.</p>
      <p>— June's Tees &amp; Things</p>`,
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
  const timestamp    = Math.round(Date.now() / 1000);
  const paramsToSign = { timestamp, folder: 'grad_orders' };
  const signature    = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
  res.json({ signature, timestamp, folder: 'grad_orders' });
});

// Submit grad order
app.post('/api/submit-order', orderRateLimit, async (req, res) => {
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

    sendGradOrderEmail(order).catch(err => console.error('Grad order email error:', err));
    sendGradOrderConfirmationEmail(order).catch(err => console.error('Grad order confirmation email error:', err));
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
      from:     "June's Tees & Things <info@jtees.net>",
      reply_to: 'info@jtees.net',
      to:       'info@jtees.net',
      subject:  'Email Test — June\'s Tees',
      text:     'Resend is working correctly.',
    });
    if (error) return res.status(500).json({ success: false, error: error.message });
    res.json({ success: true, message: 'Test email sent to info@jtees.net' });
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

// ─── Start ────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = ['DATABASE_URL', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'NOTIFICATION_EMAIL'];
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
