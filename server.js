require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const { Pool } = require('pg');
const nodemailer = require('nodemailer');
const twilio   = require('twilio');
const axios    = require('axios');

const app = express();

// ─── Middleware ──────────────────────────────────────────────────────────────

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Database ────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
      created_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('Database ready.');
}

// ─── Email ───────────────────────────────────────────────────────────────────

const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '465'),
  secure: process.env.SMTP_PORT !== '587',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendNotificationEmail(s) {
  await mailer.sendMail({
    from:    `"June's Tees Website" <${process.env.SMTP_USER}>`,
    to:      process.env.NOTIFICATION_EMAIL,
    subject: `New Quote Request — ${s.name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#A52429;">New Quote Request</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;font-weight:bold;width:120px;">Name</td><td style="padding:8px;">${s.name}</td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;">Phone</td><td style="padding:8px;"><a href="tel:${s.phone}">${s.phone}</a></td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Email</td><td style="padding:8px;"><a href="mailto:${s.email}">${s.email}</a></td></tr>
          <tr style="background:#f9f9f9;"><td style="padding:8px;font-weight:bold;vertical-align:top;">Description</td><td style="padding:8px;">${s.description || '—'}</td></tr>
          ${s.photo_url ? `<tr><td style="padding:8px;font-weight:bold;vertical-align:top;">Photo</td><td style="padding:8px;"><a href="${s.photo_url}">View Photo</a><br/><img src="${s.photo_url}" style="max-width:300px;margin-top:8px;border-radius:6px;" /></td></tr>` : ''}
        </table>
        <p style="color:#999;font-size:12px;margin-top:24px;">Submitted ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
      </div>
    `,
  });
}

// ─── SMS ─────────────────────────────────────────────────────────────────────

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function sendSMS(s) {
  const body = [
    `New quote from ${s.name}`,
    `📞 ${s.phone}`,
    `✉️  ${s.email}`,
    s.description ? `"${s.description.slice(0, 120)}${s.description.length > 120 ? '...' : ''}"` : null,
    s.photo_url ? `📷 ${s.photo_url}` : null,
  ].filter(Boolean).join('\n');

  await twilioClient.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to:   process.env.TWILIO_TO_NUMBER,
    body,
  });
}

// ─── HubSpot ─────────────────────────────────────────────────────────────────

const hubspot = axios.create({
  baseURL: 'https://api.hubapi.com',
  headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}` },
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
    // Contact already exists — find it by email and return its id
    if (err.response?.status === 409) {
      const search = await hubspot.post('/crm/v3/objects/contacts/search', {
        filterGroups: [{
          filters: [{ propertyName: 'email', operator: 'EQ', value: s.email }],
        }],
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
      // Default HubSpot pipeline stage. In HubSpot, go to:
      // Settings → Objects → Deals → Pipelines
      // and copy the stage ID you want here.
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
    properties: {
      hs_note_body:  noteLines.join('\n'),
      hs_timestamp:  Date.now().toString(),
    },
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
      hs_timestamp:    (Date.now() + 86_400_000).toString(), // due in 24 hrs
      hs_task_status:  'NOT_STARTED',
      hs_task_type:    'TODO',
    },
    associations: [{
      to:    { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 1 }],
    }],
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

// ─── Auth helper (admin routes) ───────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const expected = 'Basic ' + Buffer.from(`admin:${process.env.ADMIN_PASSWORD}`).toString('base64');
  if (req.headers['authorization'] !== expected) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Unauthorized');
  }
  next();
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/', (_req, res) => res.json({ status: 'ok' }));

// Form submission
app.post('/submit', async (req, res) => {
  const { name, phone, email, description, photo_url } = req.body;

  if (!name || !phone || !email) {
    return res.status(400).json({ error: 'Name, phone, and email are required.' });
  }

  const s = { name: name.trim(), phone: phone.trim(), email: email.trim(), description, photo_url };

  // 1. Save to database immediately
  let submissionId;
  try {
    const { rows } = await pool.query(
      `INSERT INTO submissions (name, phone, email, description, photo_url)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [s.name, s.phone, s.email, s.description, s.photo_url]
    );
    submissionId = rows[0].id;
  } catch (err) {
    console.error('DB insert failed:', err.message);
    return res.status(500).json({ error: 'Failed to save submission.' });
  }

  // 2. Fire email, SMS, and HubSpot in parallel — failures don't block the user
  const [emailResult, smsResult, hubspotResult] = await Promise.allSettled([
    sendNotificationEmail(s),
    sendSMS(s),
    syncToHubSpot(s),
  ]);

  if (emailResult.status   === 'rejected') console.error('Email failed:',   emailResult.reason?.message);
  if (smsResult.status     === 'rejected') console.error('SMS failed:',     smsResult.reason?.message);
  if (hubspotResult.status === 'rejected') console.error('HubSpot failed:', hubspotResult.reason?.message);

  // Save HubSpot IDs if sync succeeded
  if (hubspotResult.status === 'fulfilled') {
    const { contactId, dealId } = hubspotResult.value;
    pool.query(
      `UPDATE submissions SET hubspot_contact_id=$1, hubspot_deal_id=$2 WHERE id=$3`,
      [contactId, dealId, submissionId]
    ).catch(err => console.error('HubSpot ID update failed:', err.message));
  }

  res.json({ ok: true });
});

// Admin — view all submissions
app.get('/admin', requireAdmin, (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Submissions — June's Tees & Things</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0f0f0f; color: #e5e5e5; padding: 2rem; }
    h1 { font-size: 1.5rem; margin-bottom: 1.5rem; color: #fff; }
    h1 span { color: #A52429; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .card-photo { grid-column: 1 / -1; }
    .card-photo img { max-width: 240px; border-radius: 8px; margin-top: 0.5rem; }
    .label { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 0.25rem; }
    .value { font-size: 0.9rem; color: #e5e5e5; word-break: break-word; }
    .value a { color: #A52429; }
    .date { font-size: 0.75rem; color: #555; grid-column: 1 / -1; margin-top: 0.25rem; }
    .badge { display: inline-block; background: #A52429; color: #fff; font-size: 0.65rem; padding: 2px 8px; border-radius: 999px; margin-left: 0.5rem; }
    #loading { color: #666; }
    .empty { color: #555; text-align: center; padding: 4rem; }
  </style>
</head>
<body>
  <h1>June's Tees <span>&</span> Things — Submissions</h1>
  <div id="list"><p id="loading">Loading...</p></div>

  <script>
    fetch('/admin/data', { headers: { Authorization: 'Basic ' + btoa('admin:' + prompt('Admin password:')) } })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(rows => {
        const list = document.getElementById('list');
        if (!rows.length) { list.innerHTML = '<p class="empty">No submissions yet.</p>'; return; }
        list.innerHTML = rows.map(r => \`
          <div class="card">
            <div>
              <div class="label">Name</div>
              <div class="value">\${r.name}</div>
            </div>
            <div>
              <div class="label">Phone</div>
              <div class="value"><a href="tel:\${r.phone}">\${r.phone}</a></div>
            </div>
            <div>
              <div class="label">Email</div>
              <div class="value"><a href="mailto:\${r.email}">\${r.email}</a></div>
            </div>
            <div>
              <div class="label">HubSpot</div>
              <div class="value">\${r.hubspot_contact_id ? '<a href="https://app.hubspot.com/contacts/0/contact/' + r.hubspot_contact_id + '" target="_blank">View Contact</a>' : '—'}</div>
            </div>
            <div style="grid-column:1/-1">
              <div class="label">Description</div>
              <div class="value">\${r.description || '—'}</div>
            </div>
            \${r.photo_url ? \`<div class="card-photo"><div class="label">Photo</div><a href="\${r.photo_url}" target="_blank"><img src="\${r.photo_url}" /></a></div>\` : ''}
            <div class="date">\${new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</div>
          </div>
        \`).join('');
      })
      .catch(err => { document.getElementById('list').innerHTML = '<p class="empty">Failed to load: ' + err + '</p>'; });
  </script>
</body>
</html>`);
});

// Admin — raw JSON data endpoint
app.get('/admin/data', requireAdmin, async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM submissions ORDER BY created_at DESC');
  res.json(rows);
});

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
