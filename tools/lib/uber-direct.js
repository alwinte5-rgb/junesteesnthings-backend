'use strict';

/* Uber Direct: an on-demand courier for a local delivery, booked from the
 * delivery board at Uber's live price.
 *
 * Why. The fixed-price courier partner (Metrobi) is not set up yet, and the
 * team cannot always drive. Uber's price moves with demand, so it is never
 * booked blind: the board asks for a quote, shows the price and when it
 * expires, and the shop books it at that price or not at all. The customer
 * always pays the zone fee; Uber's fee is the shop's cost.
 *
 * API (checked against Uber's own SDK, uber/uber-direct-sdk, 2026-10-02):
 *   token   POST https://login.uber.com/oauth/v2/token  client_credentials,
 *           scope eats.deliveries; good for 30 days, so it is cached.
 *   quote   POST https://api.uber.com/v1/customers/{id}/delivery_quotes
 *   book    POST .../deliveries   (with quote_id, so the quoted fee holds)
 *   cancel  POST .../deliveries/{delivery_id}/cancel
 *   Addresses are JSON STRINGS ({"street_address":[..],"city",..}); fees are
 *   cents. Webhooks are signed: lowercase hex HMAC-SHA256 of the raw body with
 *   the webhook's own signing key, in x-uber-signature (or the older
 *   x-postmates-signature).
 *
 * Nothing here runs without UBER_DIRECT_CLIENT_ID, UBER_DIRECT_CLIENT_SECRET
 * and UBER_DIRECT_CUSTOMER_ID: configured() says so and the board offers
 * nothing. The webhook refuses everything without UBER_DIRECT_WEBHOOK_SECRET. */

const crypto = require('crypto');

const SHOP = {
  name: "June's Tees & Things",
  phone: '+17738491854',
  address: { street_address: ['3047 N Lincoln Ave'], city: 'Chicago', state: 'IL', zip_code: '60657', country: 'US' },
};

/* Uber's delivery states, and what each means for our booking. */
const UBER_STATUS = {
  pending: { label: 'Finding a courier', booking: null },
  pickup: { label: 'Courier on the way to the shop', booking: null },
  pickup_complete: { label: 'Picked up', booking: 'out' },
  dropoff: { label: 'On the way to the customer', booking: 'out' },
  delivered: { label: 'Delivered', booking: 'delivered' },
  canceled: { label: 'Cancelled by Uber', booking: null, problem: true },
  returned: { label: 'Returned to the shop', booking: null, problem: true },
};

function uberStatus(s) {
  return UBER_STATUS[String(s || '')] || { label: String(s || 'unknown'), booking: null };
}

/** Our address object as the JSON string Uber wants. */
function uberAddress(a) {
  const street = [a && a.street1, a && a.street2].map((s) => String(s || '').trim()).filter(Boolean);
  return JSON.stringify({ street_address: street, city: String((a && a.city) || ''), state: String((a && a.state) || ''),
    zip_code: String((a && a.zip) || ''), country: 'US' });
}

/** +1XXXXXXXXXX, or '' when it is not a US number. */
function e164(p) {
  const d = String(p || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '';
}

/** A shop-local wall time ('YYYY-MM-DD', 'HH:MM') as an ISO instant. */
function shopTimeIso(ymd, hhmm, tz = 'America/Chicago') {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mi] = String(hhmm).split(':').map(Number);
  // Start from the wall time read as UTC, then correct by the zone's offset then.
  const guess = Date.UTC(y, m - 1, d, hh, mi);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asShop = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(guess - (asShop - guess)).toISOString();
}

/**
 * When Uber should come: drop off inside the booked window. A window already
 * under way (or a booking the shop is sending early) gets "as soon as you
 * can" — no ready time, and a deadline at the window's end when that is still
 * ahead. Returns the dt fields for a quote or a delivery.
 */
function uberTimes(booking, endTime, now = new Date()) {
  const start = shopTimeIso(booking.date, booking.window_start || '09:00');
  const end = endTime ? shopTimeIso(booking.date, endTime) : null;
  const t = {};
  if (new Date(start) > now) {
    t.dropoff_ready_dt = start;
    // Ready at the shop an hour before the window opens, never in the past.
    t.pickup_ready_dt = new Date(Math.max(now.getTime(), new Date(start).getTime() - 3600e3)).toISOString();
  }
  if (end && new Date(end) > now) t.dropoff_deadline_dt = end;
  return t;
}

function createUberDirect({ env = process.env, fetchImpl = (...a) => fetch(...a), now = () => new Date() } = {}) {
  const authUrl = env.UBER_DIRECT_AUTH_URL || 'https://login.uber.com/oauth/v2/token';
  const apiBase = (env.UBER_DIRECT_API_BASE || 'https://api.uber.com/v1').replace(/\/+$/, '');
  let token = null;   // { value, until }

  function configured() {
    return !!(env.UBER_DIRECT_CLIENT_ID && env.UBER_DIRECT_CLIENT_SECRET && env.UBER_DIRECT_CUSTOMER_ID);
  }

  async function accessToken() {
    if (token && token.until > now().getTime()) return token.value;
    const r = await fetchImpl(authUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.UBER_DIRECT_CLIENT_ID, client_secret: env.UBER_DIRECT_CLIENT_SECRET,
        grant_type: 'client_credentials', scope: 'eats.deliveries' }).toString(),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || !body.access_token) {
      throw new Error(`Uber sign-in failed (${r.status}): ${String(body.error_description || body.error || body.message || '').slice(0, 200)}`);
    }
    // Their tokens last 30 days; a request is rate-limited to 100 an hour, so reuse it.
    const life = Math.max(60, Number(body.expires_in) || 3600) * 1000;
    token = { value: body.access_token, until: now().getTime() + life - 3600e3 };
    return token.value;
  }

  /* Every call names Uber, the step and Uber's own message when it fails. */
  async function call(step, path, payload) {
    const tok = await accessToken();
    const url = `${apiBase}/customers/${encodeURIComponent(env.UBER_DIRECT_CUSTOMER_ID)}${path}`;
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 401) token = null;   // signed out on their side: sign in again next time
    if (!r.ok) {
      const e = new Error(`Uber ${step} failed (${r.status}): ${String(body.message || body.code || 'no message').slice(0, 300)}`);
      e.status = r.status; e.code = body.code;
      throw e;
    }
    return body;
  }

  /** Uber's price for this booking right now: {id, fee (dollars), expires, dropoff_eta}. */
  async function quote(booking, { endTime } = {}) {
    const body = await call('quote', '/delivery_quotes', {
      pickup_address: uberAddress({ street1: SHOP.address.street_address[0], city: 'Chicago', state: 'IL', zip: '60657' }),
      dropoff_address: uberAddress(booking.address),
      pickup_phone_number: SHOP.phone,
      dropoff_phone_number: e164(booking.phone) || undefined,
      ...uberTimes(booking, endTime, now()),
    });
    const fee = Number(body.fee);
    if (!body.id || !Number.isFinite(fee)) throw new Error('Uber quote came back without a price');
    return { id: String(body.id), fee: Math.round(fee) / 100, currency: body.currency || 'usd',
      expires: body.expires || null, dropoff_eta: body.dropoff_eta || null };
  }

  /** Book it at the quoted price. Idempotent per booking and quote. */
  async function book(booking, q, { endTime, items } = {}) {
    const phone = e164(booking.phone);
    if (!phone) throw new Error("Uber needs the customer's mobile number; add one to the order first");
    const body = await call('booking', '/deliveries', {
      quote_id: q.id,
      idempotency_key: `jt-delivery-${booking.id}-${q.id}`.slice(0, 120),
      external_id: String(booking.ref),
      pickup_name: SHOP.name,
      pickup_business_name: SHOP.name,
      pickup_address: uberAddress({ street1: SHOP.address.street_address[0], city: 'Chicago', state: 'IL', zip: '60657' }),
      pickup_phone_number: SHOP.phone,
      pickup_notes: `Order ${String(booking.ref).replace(/^\w+:/, '')}. Curbside at the shop; text ${SHOP.phone} on arrival.`,
      dropoff_name: String(booking.name || 'Customer').slice(0, 80),
      dropoff_address: uberAddress(booking.address),
      dropoff_phone_number: phone,
      manifest_reference: String(booking.ref).slice(0, 40),
      manifest_items: (items && items.length ? items : [{ name: 'Custom apparel order', quantity: 1, size: 'medium' }]),
      ...uberTimes(booking, endTime, now()),
    });
    if (!body.id) throw new Error('Uber accepted the booking but sent no delivery id');
    return { id: String(body.id), status: body.status || 'pending', tracking_url: body.tracking_url || '',
      fee: Number.isFinite(Number(body.fee)) ? Math.round(Number(body.fee)) / 100 : q.fee };
  }

  async function cancel(deliveryId) {
    return call('cancel', `/deliveries/${encodeURIComponent(deliveryId)}/cancel`, {});
  }

  /** The webhook really came from Uber: HMAC of the raw bytes, compared in constant time. */
  function verifyWebhook(raw, signature) {
    const key = env.UBER_DIRECT_WEBHOOK_SECRET;
    if (!key || !raw || !signature) return false;
    const sig = String(signature).trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sig)) return false;
    const want = crypto.createHmac('sha256', key).update(raw).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(want, 'hex'), Buffer.from(sig, 'hex'));
  }

  return { configured, quote, book, cancel, verifyWebhook, webhookReady: () => !!env.UBER_DIRECT_WEBHOOK_SECRET };
}

module.exports = { createUberDirect, uberAddress, uberTimes, uberStatus, shopTimeIso, e164, UBER_STATUS, SHOP };
