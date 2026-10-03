'use strict';

/* Shipping: what is waiting to go out, what a quote needs before it can be
 * accepted, and what the shop and the customer are told.
 *
 * Why this exists. Studio order #10 (2026-08-11) paid $6.00 for USPS Ground
 * Advantage and sat unshipped for seven weeks. The postage was charged, but
 * nothing recorded which service it paid for, no label was ever bought, and
 * nothing anywhere said a paid order was waiting to go out: the daily digest
 * listed quotes only, and the job board showed the order as "In production"
 * for as long as anyone liked.
 *
 * Now one Shipping page lists every paid order waiting to leave — studio
 * orders from the studio's feed, and quote jobs set to ship — buys its label
 * through the studio (which holds the Shippo key, see the studio's
 * jt-ship.php), and marks it shipped, which is what emails the customer their
 * tracking. The morning reminder says what is waiting while anything is.
 *
 * Pure functions only: no database, no studio, no Shippo, so the rules are
 * tested directly (tests/shipping.test.js). */

const DAY = 86400000;

/** Whole days since `at` (a Date, ISO string or MySQL DATETIME); null if unknown. */
function daysSince(at, now = Date.now()) {
  if (!at) return null;
  const t = at instanceof Date ? at.getTime() : new Date(String(at).replace(' ', 'T')).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / DAY));
}

/* ── Studio orders ────────────────────────────────────────────────────────── */

/** Where a studio order from the feed stands, for shipping.
 *
 *  'to-ship'   paid, going by post, no label yet
 *  'pending'   a label purchase Shippo was still making (never buy another)
 *  'labelled'  label bought, not yet marked shipped (the customer has no tracking)
 *  'pickup'    paid, being collected, not yet ready
 *  'local'     paid, going by local delivery: the delivery board's, never a label
 *  'held'      paid on a tax certificate the shop has not checked: don't produce
 *  'shipped'   marked shipped (or ready to collect), or complete
 *  'unpaid' | 'refunded' | 'gone'  not work for this page */
function studioShipState(o) {
  const status = String(o.status || '').toLowerCase();
  const paid = Number(o.paid || 0);
  const refunded = Number(o.refunded || 0);
  const m = o.delivery && o.delivery.method;
  const method = m === 'pickup' || m === 'local' ? m : 'ship';
  if (status === 'cancel') return 'gone';
  if (refunded > 0 && refunded >= paid - 0.005) return 'refunded';
  if (status === 'shipped' || status === 'complete') return 'shipped';
  if (!(paid > 0)) return 'unpaid';
  if (String(o.tax_exempt || '') === 'pending') return 'held';
  if (method === 'pickup') return 'pickup';
  if (method === 'local') return 'local';
  if (o.label && o.label.label_url) return 'labelled';
  if (o.label_pending) return 'pending';
  return 'to-ship';
}

/** A balance still owed on a paid order: a deposit order is paid in part. */
function studioBalance(o) {
  return Math.max(0, Math.round((Number(o.total || 0) - Number(o.paid || 0)) * 100) / 100);
}

/** The feed's orders sorted into the Shipping page's lists, oldest wait first. */
function studioShipQueues(orders, now = Date.now()) {
  const q = { toShip: [], labelled: [], pickups: [], held: [], shipped: [] };
  for (const o of orders || []) {
    const state = studioShipState(o);
    const item = Object.assign({}, o, { state, waitingDays: daysSince(o.created, now), balance: studioBalance(o) });
    if (state === 'to-ship' || state === 'pending') q.toShip.push(item);
    else if (state === 'labelled') q.labelled.push(item);
    else if (state === 'pickup') q.pickups.push(item);
    else if (state === 'held') q.held.push(item);
    else if (state === 'shipped') {
      const since = daysSince(o.shipped_at || o.updated, now);
      if (since !== null && since <= 30) q.shipped.push(Object.assign(item, { shippedDays: since }));
    }
  }
  const oldest = (a, b) => (b.waitingDays || 0) - (a.waitingDays || 0);
  q.toShip.sort(oldest); q.labelled.sort(oldest); q.pickups.sort(oldest); q.held.sort(oldest);
  q.shipped.sort((a, b) => (a.shippedDays || 0) - (b.shippedDays || 0));
  return q;
}

/** How a studio order leaves, in the shop's words, for the page and the emails. */
function deliveryPhrase(d, money) {
  if (!d || !['pickup', 'ship', 'local'].includes(d.method)) return '';
  if (d.method === 'pickup') return 'Pickup — free curbside pickup, no label needed';
  if (d.method === 'local') return `Local delivery — we drive it, no label needed${d.paid ? ` (they paid ${money(d.paid)})` : ''}`;
  if (d.source === 'rate' && d.service) return `Ship by ${d.service} — they paid ${money(d.paid || 0)} postage`;
  if (d.source === 'free') return 'Ship — free shipping, so the postage is yours';
  if (d.source === 'flat') return `Ship — flat ${money(d.paid || 0)} charged (live rates were down at checkout)`;
  if (d.recorded === false) {
    return d.paid != null ? `Ship — ${money(d.paid)} postage charged` : 'Ship — placed before the service was recorded';
  }
  return 'Ship';
}

/* ── Quote jobs ───────────────────────────────────────────────────────────── */

const SHIPPING_METHODS = ['ground', 'expedited'];

/** Whether the shop has set this quote job to go by post. */
function quoteShips(q) {
  return SHIPPING_METHODS.includes(String((q && q.ship_method) || '').toLowerCase());
}

/** Where a quote job stands, for shipping; the same words as studioShipState. */
function quoteShipState(q) {
  if (q.cancelled_at) return 'gone';
  if (!quoteShips(q)) return 'not-shipping';
  if (q.shipped_at || q.delivered_at) return 'shipped';
  if (!q.accepted_at) return 'not-accepted';
  if (!(Number(q.paid_amount || 0) > 0)) return 'unpaid';
  const label = q.ship_label || null;
  if (label && label.label_url) return 'labelled';
  if (label && label.pending) return 'pending';
  return 'to-ship';
}

function quoteShipQueues(quotes, now = Date.now()) {
  const q = { toShip: [], labelled: [], shipped: [] };
  for (const job of quotes || []) {
    const state = quoteShipState(job);
    const item = Object.assign({}, job, { state, waitingDays: daysSince(job.accepted_at || job.created_at, now) });
    if (state === 'to-ship' || state === 'pending') q.toShip.push(item);
    else if (state === 'labelled') q.labelled.push(item);
    else if (state === 'shipped' && job.ship_label && job.ship_label.label_url) {
      const since = daysSince(job.shipped_at || job.delivered_at, now);
      if (since !== null && since <= 30) q.shipped.push(Object.assign(item, { shippedDays: since }));
    }
  }
  const oldest = (a, b) => (b.waitingDays || 0) - (a.waitingDays || 0);
  q.toShip.sort(oldest); q.labelled.sort(oldest);
  q.shipped.sort((a, b) => (a.shippedDays || 0) - (b.shippedDays || 0));
  return q;
}

/* ── A delivery address ───────────────────────────────────────────────────── */

const STATE_RE = /^[A-Z]{2}$/;
const ZIP_RE = /^\d{5}(-\d{4})?$/;

/** An address as a label needs it, tidied, or null with nothing usable in it. */
function cleanShipTo(src, fallbackName = '') {
  const s = src || {};
  const g = (k, max) => String(s[k] == null ? '' : s[k]).replace(/\s+/g, ' ').trim().slice(0, max);
  const a = {
    name: g('name', 80) || String(fallbackName || '').trim().slice(0, 80),
    street1: g('street1', 100),
    street2: g('street2', 100),
    city: g('city', 60),
    state: g('state', 2).toUpperCase(),
    zip: g('zip', 10),
    country: 'US',
  };
  if (!a.street1 && !a.city && !a.zip) return null;
  return a;
}

/** What is missing or wrong in an address, as field names; [] when complete. */
function shipToProblems(a) {
  if (!a) return ['street1', 'city', 'state', 'zip'];
  const out = [];
  if (!a.name) out.push('name');
  if (!a.street1) out.push('street1');
  if (!a.city) out.push('city');
  if (!STATE_RE.test(a.state || '')) out.push('state');
  if (!ZIP_RE.test(a.zip || '')) out.push('zip');
  return out;
}

function shipToLines(a) {
  if (!a) return [];
  return [a.name, a.street1, a.street2, `${a.city}${a.city ? ', ' : ''}${a.state} ${a.zip}`.trim()].filter(Boolean);
}

/* ── Accepting a quote ────────────────────────────────────────────────────── */

/** A phone a person can be called or texted on: ten US digits, or 1 + ten. */
function phoneOk(p) {
  const d = String(p || '').replace(/\D/g, '');
  return d.length === 10 || (d.length === 11 && d[0] === '1');
}

/**
 * What a customer still has to give before they can accept, from what the
 * quote already holds and what the form sent.
 *
 * The owner's rule (2026-09-30): name, email and mobile on every quote, and a
 * delivery address when the job ships. Before, only a first name was ever
 * asked for, and only when the quote had none, so a job could be accepted with
 * no way to reach the customer and nowhere to send it.
 *
 * What is on file and valid is kept and not asked again; what is missing or
 * unusable is asked for. Returns the values to store with the problems.
 */
function acceptRequirements(q, body, { isValidEmail }) {
  const b = body || {};
  const onFile = (v) => String(v || '').trim();
  const typedName = [b.first_name, b.last_name].map((s) => String(s || '').trim()).filter(Boolean).join(' ');
  const name = onFile(q.name) || typedName.slice(0, 120);
  const email = isValidEmail(onFile(q.email)) ? onFile(q.email) : String(b.email || '').trim().toLowerCase().slice(0, 200);
  const phone = phoneOk(q.phone) ? onFile(q.phone) : String(b.phone || '').trim().slice(0, 40);

  const problems = [];
  if (!onFile(q.name) && (!String(b.first_name || '').trim() || !String(b.last_name || '').trim())) problems.push('name');
  if (!isValidEmail(email)) problems.push('email');
  if (!phoneOk(phone)) problems.push('phone');

  let shipTo = null;
  if (quoteShips(q)) {
    const have = cleanShipTo(q.ship_to, name);
    if (have && !shipToProblems(have).length) {
      shipTo = null;                       // already on file and complete: nothing to store
    } else {
      shipTo = cleanShipTo({
        name, street1: b.ship_street1, street2: b.ship_street2, city: b.ship_city, state: b.ship_state, zip: b.ship_zip,
      }, name);
      if (shipToProblems(shipTo).filter((f) => f !== 'name').length) problems.push('address');
    }
  }
  return { problems, name, email, phone, shipTo };
}

/** Which details the accept form has to ask for, so it shows only those. */
function acceptAsks(q, { isValidEmail }) {
  const have = cleanShipTo(q.ship_to, q.name);
  return {
    name: !String(q.name || '').trim(),
    email: !isValidEmail(String(q.email || '').trim()),
    phone: !phoneOk(q.phone),
    address: quoteShips(q) && !(have && !shipToProblems(have).length),
  };
}

const ACCEPT_PROBLEM_WORDS = {
  name: 'your first and last name',
  email: 'an email address we can send your receipt to',
  phone: 'a mobile number (10 digits)',
  address: 'the delivery address: street, city, two-letter state and 5-digit ZIP',
};

/** "Please add X, Y and Z so ..." for the quote page. */
function acceptProblemsSentence(list) {
  const words = (list || []).map((k) => ACCEPT_PROBLEM_WORDS[k]).filter(Boolean);
  if (!words.length) return '';
  const joined = words.length === 1 ? words[0]
    : words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
  return `Please add ${joined} before accepting, so we can reach you about your order.`;
}

/* ── The label form ───────────────────────────────────────────────────────── */

/** Box choices, as the studio names them (the feed sends its own list). */
const DEFAULT_BOXES = { mailer: 'Poly mailer 12 × 10 × 1', small: 'Small box 14 × 12 × 3',
  medium: 'Medium box 18 × 14 × 6', large: 'Large box 20 × 16 × 10' };
const DEFAULT_FILES = { PDF: 'Letter paper (any printer)', PDF_4x6: '4 × 6 label printer' };

/** The box a weight starts in: the studio's own rule (jt_parcel_dims). */
function boxFor(oz) {
  const w = Number(oz) || 0;
  if (w <= 16) return 'mailer';
  if (w <= 48) return 'small';
  if (w <= 160) return 'medium';
  return 'large';
}

/** A weight typed in pounds and ounces, as whole ounces; null when unusable. */
function ouncesFrom(lb, oz) {
  const L = lb === '' || lb == null ? 0 : Number(lb);
  const O = oz === '' || oz == null ? 0 : Number(oz);
  if (!Number.isFinite(L) || !Number.isFinite(O) || L < 0 || O < 0) return null;
  const total = Math.ceil(L * 16 + O);
  return total >= 1 && total <= 1120 ? total : null;
}

/** The rate to start on: the service the customer paid for, else the cheapest. */
function preferredRate(rates, paidService) {
  const list = Array.isArray(rates) ? rates : [];
  if (!list.length) return null;
  const want = String(paidService || '').trim().toLowerCase();
  return (want && list.find((r) => String(r.name || '').toLowerCase() === want)) || list[0];
}

/* ── The morning reminder ─────────────────────────────────────────────────── */

/** The lines of the "waiting to ship" email; null when there is nothing. */
function shippingReminder(studio, quotes, { money }) {
  const s = studio || { toShip: [], labelled: [], pickups: [] };
  const j = quotes || { toShip: [], labelled: [] };
  const toShip = [...s.toShip.map((o) => ({ kind: 'studio', o })), ...j.toShip.map((q) => ({ kind: 'quote', o: q }))];
  const labelled = [...s.labelled.map((o) => ({ kind: 'studio', o })), ...j.labelled.map((q) => ({ kind: 'quote', o: q }))];
  const pickups = s.pickups.map((o) => ({ kind: 'studio', o }));
  const n = toShip.length + labelled.length + pickups.length;
  if (!n) return null;
  const oldest = Math.max(0, ...[...toShip, ...labelled, ...pickups].map((x) => x.o.waitingDays || 0));
  const parts = [];
  if (toShip.length) parts.push(`${toShip.length} to ship`);
  if (labelled.length) parts.push(`${labelled.length} label${labelled.length === 1 ? '' : 's'} not marked shipped`);
  if (pickups.length) parts.push(`${pickups.length} pickup${pickups.length === 1 ? '' : 's'} to get ready`);
  const subject = `📦 ${parts.join(' · ')}` + (oldest >= 3 ? ` — oldest waiting ${oldest} days` : '');
  const name = (x) => x.kind === 'studio' ? `Studio order #${x.o.id}` : `Quote ${x.o.code}`;
  const who = (x) => String(x.o.name || '').trim();
  const line = (x, what) => ({ title: name(x), who: who(x), what, days: x.o.waitingDays || 0,
    anchor: x.kind === 'studio' ? `studio-${x.o.id}` : `quote-${x.o.code}` });
  return {
    subject,
    count: n,
    oldest,
    toShip: toShip.map((x) => line(x, x.kind === 'studio'
      ? deliveryPhrase(x.o.delivery, money) : `Ship ${String(x.o.ship_method || '')}`)),
    labelled: labelled.map((x) => line(x, 'label printed — mark it shipped once USPS has it; that emails the tracking')),
    pickups: pickups.map((x) => line(x, 'pickup — mark it ready and they are emailed')),
  };
}

module.exports = {
  daysSince, studioShipState, studioBalance, studioShipQueues, deliveryPhrase,
  quoteShips, quoteShipState, quoteShipQueues, SHIPPING_METHODS,
  cleanShipTo, shipToProblems, shipToLines,
  phoneOk, acceptRequirements, acceptAsks, acceptProblemsSentence,
  DEFAULT_BOXES, DEFAULT_FILES, boxFor, ouncesFrom, preferredRate,
  shippingReminder,
};
