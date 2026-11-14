'use strict';

/* Wholesale connector, v1: the pure half (server.js does the I/O).
 *
 * A business that sells its own brand (through Biz Dashboard or any other
 * system) asks June's Tees to make the goods. This module is the contract
 * between them. It is deliberately THIN: it never prices, never accepts a quote
 * and never takes a payment. Those stay where they already are:
 *
 *   - pricing   -> the shop builds a normal quote in the quote builder
 *   - accepting -> the business owner accepts on the quote's own /q/<code> page
 *                  (which runs the Business Partner code rules, tax, delivery)
 *   - paying    -> the same page's Stripe checkout, banked by the webhook into
 *                  quote_payments
 *   - producing -> the job board's milestone columns on `quotes`
 *
 * So every status the API reports is DERIVED from those records (statusOf),
 * and nothing a partner sends can move money or start production.
 *
 * Spec: docs/wholesale-api-v1.md.
 */

const crypto = require('crypto');

const API_VERSION = '2026-11-14';

/** The whole connector is off until the owner switches it on. */
function on(env = process.env) {
  return String(env.JT_WHOLESALE || '').toLowerCase() === 'on';
}

/* ── Statuses ─────────────────────────────────────────────────────────────
   One enum for the request, in the order a job moves through it. `expired`,
   `declined` and `cancelled` are ends; a revised quote moves an `expired`
   request back to `quoted`. */
const STATUSES = [
  'requested',        // received; the shop has not sent a quote yet
  'quoted',           // a quote is out and still valid
  'expired',          // the quote's valid-until has passed unaccepted
  'awaiting_payment', // accepted on the quote page, nothing paid
  'deposit_paid',     // part paid (the shop's deposit rule)
  'paid',             // paid in full, not started
  'in_production',    // artwork / proof / blanks / printing under way
  'ready',            // checked, ready to go out
  'shipped',
  'delivered',
  'declined',         // the shop will not quote it
  'cancelled',
];

const QUOTE_HIDDEN = new Set(['held', 'draft']);   // never shown to a partner
const PRODUCTION_COLS = ['artwork_at', 'proof_sent_at', 'proof_ok_at', 'blanks_ordered_at', 'blanks_in_at', 'production_at'];

/* A DATE column as YYYY-MM-DD. node-postgres builds a DATE as local midnight,
   so its LOCAL parts are the stored date whatever the server's zone;
   row_to_json gives the string itself. */
function dateOnly(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const t = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(t.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

/* Today in the shop's zone. The database session and the quote page both
   count a quote's last day in Chicago time, so a quote is still valid here
   until midnight there, not until midnight UTC. */
function shopToday(now = new Date(), tz = process.env.JT_TIMEZONE || 'America/Chicago') {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: tz });
}

/** Whether a partner may see this quote at all. A draft or held quote is the
 *  shop still working: its figures are not an offer. */
function quoteVisible(q) {
  return !!q && !QUOTE_HIDDEN.has(String(q.status || ''));
}

/**
 * The request's status, from the request row and its linked quote.
 * `now` is injectable for tests. Money is read from the quote's paid_amount,
 * the cached rollup of the quote_payments ledger (append-only, webhook-banked).
 */
function statusOf(req, q, now = new Date()) {
  if (!req) return null;
  if (req.cancelled_at) return 'cancelled';
  if (req.declined_at) return 'declined';
  if (!q || !quoteVisible(q)) return 'requested';
  if (q.cancelled_at || q.status === 'cancelled') return 'cancelled';
  if (q.delivered_at) return 'delivered';
  if (q.shipped_at) return 'shipped';
  const total = Number(q.total || 0);
  const paid = Number(q.paid_amount || 0);
  if (q.qc_at && paid > 0) return 'ready';
  if (paid > 0 && PRODUCTION_COLS.some((c) => q[c])) return 'in_production';
  if (total > 0 && paid >= total - 0.005) return 'paid';
  if (paid > 0) return 'deposit_paid';
  if (q.accepted_at || q.status === 'accepted') return 'awaiting_payment';
  const until = dateOnly(q.valid_until);
  if (q.status === 'expired' || (until && until < shopToday(now))) return 'expired';
  return 'quoted';
}

/* ── What a partner may see of a quote ────────────────────────────────────
   A WHITELIST. A quote line also carries what the shop paid for the blank,
   hand-typed overrides and catalogue ids; none of that is the partner's. */
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const str = (v, max) => (v == null ? null : String(v).slice(0, max));

/* `figures` is the quote page's own reading of a line (server.js
   customerLineFigures + shownAddons), so the partner sees the same each-price,
   amount and extras as the customer page: supplier charges folded into an
   item's price stay folded in, and a legacy setup fee shows once. Without it
   (fixtures, tests) the stored fields are used as they are. */
function lineView(i, figures) {
  /* line_total is the item's OWN amount; extras are listed beside it, so
     line_total + extras is what the line costs, and nothing is counted twice. */
  const f = figures ? figures(i) : {
    unit_price: r2(i.unit_price),
    extras: Array.isArray(i.addons) ? i.addons : [],
    line_total: r2(Number(i.line_total || 0) - (Array.isArray(i.addons) ? i.addons : [])
      .reduce((n, a) => n + (Number(a && (a.amount ?? a.total)) || 0), 0)),
  };
  return {
    description: str(i.description, 300),
    details: str(i.details, 400),
    colour: str(i.colour, 80),
    qty: Number(i.qty) || 0,
    sizes: i.size_mix && typeof i.size_mix === 'object' ? i.size_mix : null,
    unit_price: Number(f.unit_price) || 0,
    line_total: r2(f.line_total),
    optional: !!i.optional,
    prints: Array.isArray(i.prints)
      ? i.prints.map((p) => ({ location: str(p.loc, 40), method_id: p.method_id ?? null, colours: p.colours ?? null }))
      : null,
    extras: (f.extras || [])
      .map((a) => ({ label: str(a && (a.label || a.name), 120), amount: r2(a && (a.amount ?? a.total)) })),
    mockups: [].concat(i.images || []).filter((u) => typeof u === 'string' && u.startsWith('https://')).slice(0, 10),
  };
}

/**
 * The quote as the partner sees it. `totals` is quoteTotals(q) from server.js,
 * passed in so this module never re-implements a price rule. `quoteUrl` is the
 * page the business owner accepts and pays on.
 */
function quoteView(q, totals, quoteUrl, figures = null) {
  if (!quoteVisible(q)) return null;
  const t = totals || {};
  const total = r2(t.total != null ? t.total : q.total);
  const paid = r2(q.paid_amount);
  return {
    id: q.code,
    revision: Number(q.revision) || 1,
    valid_until: dateOnly(q.valid_until),
    needed_by: dateOnly(q.needed_by),
    url: quoteUrl,
    lines: (q.items || []).filter(Boolean).map((i) => lineView(i, figures)),
    pricing: {
      subtotal: r2(t.subtotal), rush: r2(t.rush), rush_pct: r2(t.rushPct),
      discount: r2(t.discount), discount_note: str(q.discount_note, 200),
      promo_code: str(q.promo_code, 40),
      tax: r2(t.tax), delivery: r2(t.delivery), shipping: r2(t.shipping),
      total, deposit_required: r2(t.deposit), currency: 'usd',
    },
    payment: {
      paid,
      balance: r2(Math.max(0, total - paid)),
      state: total > 0 && paid >= total - 0.005 ? 'paid_in_full' : paid > 0 ? 'deposit_paid' : 'unpaid',
      terms: 'Deposit before production; balance before the goods leave. Paid on the quote page.',
    },
    accepted_at: q.accepted_at || null,
    production: Object.fromEntries(
      [...PRODUCTION_COLS, 'qc_at', 'shipped_at', 'delivered_at'].map((c) => [c.replace(/_at$/, ''), q[c] || null])),
  };
}

/**
 * The request as the partner sees it. `totals` (quoteTotals) and `quoteUrl` are
 * passed in by server.js, so no price rule lives here.
 */
function requestView(r, q, totals, quoteUrl, figures = null, now = new Date()) {
  const p = r.payload || {};
  const quote = q ? quoteView(q, totals, quoteUrl, figures) : null;
  /* A quote revised after the business authorized it needs a fresh look: the
     approval was for different figures. */
  const reapproval = !!(quote && r.authorized_revision && quote.revision > r.authorized_revision);
  return {
    id: r.public_id, external_ref: r.external_ref, status: statusOf(r, q, now),
    created_at: r.created_at, updated_at: r.updated_at,
    needed_by: p.needed_by || null, notes: p.notes || null,
    lines: p.lines || [], ship_to: p.ship_to || null,
    artwork: r.artwork || [],
    authorized_revision: r.authorized_revision || null, authorized_at: r.authorized_at || null,
    reapproval_required: reapproval,
    declined_reason: r.declined_at ? r.decline_reason || null : null,
    cancel_reason: r.cancelled_at ? r.cancel_reason || null : null,
    quote,
  };
}

/* ── Validating what a partner sends ──────────────────────────────────────
   Unknown fields are refused, every string is capped, every array bounded. */
const EXT_RE = /^[A-Za-z0-9._:-]{1,80}$/;
const SIZE_RE = /^[A-Za-z0-9]{1,8}$/;
const MAX_LINES = 50;
const MAX_QTY = 10000;

function httpsUrl(v, max = 1000) {
  const s = String(v || '').trim();
  if (!s || s.length > max) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.toString() : null;
  } catch { return null; }
}

function err(code, message, field) {
  return { error: { code, message, ...(field ? { field } : {}) } };
}

/** {value} or {error}. */
function parseRequest(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  if (!b) return err('invalid_body', 'Send a JSON object.');
  const allowed = new Set(['external_ref', 'lines', 'needed_by', 'notes', 'ship_to', 'contact']);
  for (const k of Object.keys(b)) if (!allowed.has(k)) return err('unknown_field', `Unknown field: ${k}`, k);
  if (!EXT_RE.test(String(b.external_ref || ''))) return err('invalid_field', 'external_ref: 1-80 of A-Z a-z 0-9 . _ : -', 'external_ref');
  if (!Array.isArray(b.lines) || !b.lines.length || b.lines.length > MAX_LINES)
    return err('invalid_field', `lines: 1-${MAX_LINES} lines`, 'lines');
  const lines = [];
  for (let n = 0; n < b.lines.length; n++) {
    const l = b.lines[n];
    const f = (k) => `lines[${n}].${k}`;
    if (!l || typeof l !== 'object' || Array.isArray(l)) return err('invalid_field', 'Each line is an object.', `lines[${n}]`);
    const lineAllowed = new Set(['product', 'colour', 'qty', 'sizes', 'decoration', 'artwork_urls', 'notes', 'external_line_ref']);
    for (const k of Object.keys(l)) if (!lineAllowed.has(k)) return err('unknown_field', `Unknown field: ${f(k)}`, f(k));
    const product = String(l.product || '').trim();
    if (!product || product.length > 200) return err('invalid_field', 'product: 1-200 characters', f('product'));
    let qty = 0;
    let sizes = null;
    if (l.sizes != null) {
      if (typeof l.sizes !== 'object' || Array.isArray(l.sizes)) return err('invalid_field', 'sizes: {"M": 10, ...}', f('sizes'));
      const ents = Object.entries(l.sizes);
      if (!ents.length || ents.length > 20) return err('invalid_field', 'sizes: 1-20 sizes', f('sizes'));
      sizes = {};
      for (const [s, c] of ents) {
        if (!SIZE_RE.test(s) || !Number.isInteger(c) || c < 0 || c > MAX_QTY) return err('invalid_field', `sizes.${String(s).slice(0, 8)}: whole number 0-${MAX_QTY}`, f('sizes'));
        /* "m" and "M" are one size: added together, never one overwriting the other. */
        if (c) sizes[s.toUpperCase()] = (sizes[s.toUpperCase()] || 0) + c;
        qty += c;
      }
      if (l.qty != null && l.qty !== qty) return err('invalid_field', 'qty does not match the sizes', f('qty'));
    } else {
      qty = l.qty;
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return err('invalid_field', `qty: whole number 1-${MAX_QTY}`, f('qty'));
    const art = l.artwork_urls == null ? [] : l.artwork_urls;
    if (!Array.isArray(art) || art.length > 10) return err('invalid_field', 'artwork_urls: up to 10 https links', f('artwork_urls'));
    const artwork = [];
    for (const u of art) {
      const ok = httpsUrl(u);
      if (!ok) return err('invalid_field', 'artwork_urls: https links only', f('artwork_urls'));
      artwork.push(ok);
    }
    if (l.external_line_ref != null && !EXT_RE.test(String(l.external_line_ref))) return err('invalid_field', 'external_line_ref: 1-80 of A-Z a-z 0-9 . _ : -', f('external_line_ref'));
    lines.push({
      product,
      colour: str(l.colour, 80),
      qty,
      sizes,
      decoration: str(l.decoration, 500),
      artwork_urls: artwork,
      notes: str(l.notes, 1000),
      external_line_ref: l.external_line_ref != null ? String(l.external_line_ref) : null,
    });
  }
  let needed_by = null;
  if (b.needed_by != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.needed_by)) || !Number.isFinite(Date.parse(b.needed_by))) return err('invalid_field', 'needed_by: YYYY-MM-DD', 'needed_by');
    needed_by = String(b.needed_by);
  }
  let ship_to = null;
  if (b.ship_to != null) {
    if (typeof b.ship_to !== 'object' || Array.isArray(b.ship_to)) return err('invalid_field', 'ship_to: an address object', 'ship_to');
    ship_to = {};
    for (const k of ['name', 'company', 'street1', 'street2', 'city', 'state', 'zip', 'country', 'phone']) {
      if (b.ship_to[k] != null) ship_to[k] = str(b.ship_to[k], 120);
    }
  }
  let contact = null;
  if (b.contact != null) {
    if (typeof b.contact !== 'object' || Array.isArray(b.contact)) return err('invalid_field', 'contact: {name, email, phone}', 'contact');
    const email = String(b.contact.email || '').trim().toLowerCase();
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return err('invalid_field', 'contact.email is not an email address', 'contact.email');
    contact = { name: str(b.contact.name, 120), email: email || null, phone: str(b.contact.phone, 40) };
  }
  return { value: { external_ref: String(b.external_ref), lines, needed_by, notes: str(b.notes, 2000), ship_to, contact } };
}

/** An artwork submission on an existing request. */
function parseArtwork(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  for (const k of Object.keys(b)) if (!['url', 'name', 'note', 'line'].includes(k)) return err('unknown_field', `Unknown field: ${k}`, k);
  const url = httpsUrl(b.url);
  if (!url) return err('invalid_field', 'url: an https link', 'url');
  const line = b.line == null ? null : b.line;
  if (line !== null && (!Number.isInteger(line) || line < 0 || line >= MAX_LINES)) return err('invalid_field', 'line: the line index', 'line');
  return { value: { url, name: str(b.name, 200), note: str(b.note, 1000), line } };
}

/* ── Credentials ──────────────────────────────────────────────────────────
   A partner key is `jtw_<prefix>_<secret>`. The prefix finds the row; only
   SHA-256 of the whole key is stored, and the check is timing-safe. */
function newApiKey() {
  const prefix = crypto.randomBytes(6).toString('hex');
  const secret = crypto.randomBytes(24).toString('base64url');
  return { key: `jtw_${prefix}_${secret}`, prefix };
}
const KEY_RE = /^jtw_([0-9a-f]{12})_[A-Za-z0-9_-]{32}$/;
function keyPrefix(key) {
  const m = KEY_RE.exec(String(key || ''));
  return m ? m[1] : null;
}
function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}
function keyMatches(key, storedHash) {
  const a = Buffer.from(hashKey(key), 'hex');
  const b = Buffer.from(String(storedHash || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/* ── Webhook signatures ───────────────────────────────────────────────────
   Each partner's signing secret is derived from the server's master secret
   (JT_WHOLESALE_SECRET) and the partner id, so no signing secret is stored.
   Signature = HMAC-SHA256(secret, `${timestamp}.${rawBody}`), sent as
   `X-JT-Signature: t=<unix>,v1=<hex>`. Receivers refuse anything older than
   five minutes and any event id they have already processed. */
const SIG_TOLERANCE_S = 300;
function partnerSecret(master, partnerId) {
  if (!master || String(master).length < 32) return null;
  return crypto.createHmac('sha256', String(master)).update(`wholesale-webhook:${partnerId}`).digest('base64url');
}
function sign(secret, ts, rawBody) {
  return crypto.createHmac('sha256', String(secret)).update(`${ts}.${rawBody}`).digest('hex');
}
function signatureHeader(secret, rawBody, now = Date.now()) {
  const ts = Math.floor(now / 1000);
  return `t=${ts},v1=${sign(secret, ts, rawBody)}`;
}
/** For receivers and tests: true only for a fresh, correct signature. */
function verifySignature(secret, header, rawBody, now = Date.now()) {
  const m = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(String(header || ''));
  if (!m) return false;
  const want = Buffer.from(sign(secret, m[1], rawBody), 'hex');
  const got = Buffer.from(m[2], 'hex');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false;
  return Math.abs(Math.floor(now / 1000) - Number(m[1])) <= SIG_TOLERANCE_S;
}

/* ── Idempotency ──────────────────────────────────────────────────────────
   The same key with the same body returns the first answer; the same key with
   a different body is a 409, never a second request. */
const IDEM_RE = /^[A-Za-z0-9._:-]{8,100}$/;
function idempotencyKey(v) {
  const s = String(v || '');
  return IDEM_RE.test(s) ? s : null;
}
function bodyHash(value) {
  const canon = (x) => (Array.isArray(x) ? x.map(canon)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x);
  return crypto.createHash('sha256').update(JSON.stringify(canon(value))).digest('hex');
}

/* ── Webhook retries ──────────────────────────────────────────────────────
   The first try, then retries after 1m, 5m, 30m, 2h, 6h, 12h, 24h, 24h:
   nine tries over about three days, then the delivery is given up and
   reported. The pull feed (/events) still has every event, so a receiver
   that was down can always catch up.
   `failedTries` is how many tries have failed so far, this one included. */
const RETRY_MINUTES = [1, 5, 30, 120, 360, 720, 1440, 1440];
function nextAttemptAt(failedTries, now = Date.now()) {
  const ix = failedTries - 1;
  if (ix < 0 || ix >= RETRY_MINUTES.length) return null;   // give up
  return new Date(now + RETRY_MINUTES[ix] * 60e3);
}

/* A webhook URL must be https on a public-looking host. Private addresses are
   refused so the shop's server cannot be pointed at its own network. */
function webhookUrl(v) {
  const u = httpsUrl(v, 500);
  if (!u) return null;
  const h = new URL(u).hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.railway.internal')) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || h.startsWith('[')) return null;   // no raw IPs
  return u;
}

/* Checked again at every delivery, on what the host resolves to NOW: a name
   that passed webhookUrl() can later be pointed at a private address. */
function privateIp(ip) {
  const v = String(ip || '').toLowerCase();
  if (v.includes(':')) {
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb)/.test(v);
  }
  const p = v.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function resolvesPublic(url, lookup = require('dns').promises.lookup) {
  try {
    const addrs = await lookup(new URL(url).hostname, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch { return false; }
}

function publicId(prefix) {
  return `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
}

module.exports = {
  API_VERSION, on, STATUSES, statusOf, dateOnly, shopToday, quoteVisible, quoteView, lineView, requestView,
  parseRequest, parseArtwork, httpsUrl, err,
  newApiKey, keyPrefix, hashKey, keyMatches,
  partnerSecret, sign, signatureHeader, verifySignature, SIG_TOLERANCE_S,
  idempotencyKey, bodyHash, RETRY_MINUTES, nextAttemptAt, webhookUrl, privateIp, resolvesPublic, publicId,
};
