'use strict';

/* Studio orders (design.jtees.net) as jobs the shop can talk to the customer
 * about, with the same Messages card quote jobs have (owner, 2026-11-23).
 *
 * A studio order has no quote, so its messages are kept under a key of their
 * own: STUDIO-<order id>. The hyphen means it can never be a quote code (six
 * or ten letters and digits), so nothing that reads a quote by its code can
 * pick one up by mistake.
 *
 * Pure functions: server.js reads the feed and the database. */

const KEY_RE = /^STUDIO-([1-9]\d{0,8})$/;

/** The message key of a studio order, or '' when the id is not one. */
function keyOf(id) {
  const s = String(id == null ? '' : id).trim();
  return /^[1-9]\d{0,8}$/.test(s) ? `STUDIO-${s}` : '';
}

/** The order id in a key, or 0. */
function idOf(key) {
  const m = KEY_RE.exec(String(key == null ? '' : key).toUpperCase());
  return m ? Number(m[1]) : 0;
}

/** What the customer and the shop call it: "#12", or the quote's own code. */
function labelOf(code) {
  const id = idOf(code);
  return id ? `#${id}` : String(code || '');
}

/** The admin page of a job, quote or studio. */
function adminPath(code) {
  const id = idOf(code);
  return id ? `/admin/studio/${id}` : `/admin/production/${encodeURIComponent(String(code || ''))}`;
}

const day10 = (p) => { const d = String(p == null ? '' : p).replace(/\D/g, '').slice(-10); return d.length === 10 ? d : ''; };
const mail = (e) => String(e == null ? '' : e).trim().toLowerCase();
const when = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

/** What is kept here about each order in the feed, so a text or an email from
 *  its buyer finds it without asking the studio: [{id, name, email, phone, paid, placed_at}]. */
function contacts(feedOrders, abandoned = []) {
  const row = (o, paid) => ({ id: Number(o.id), name: String(o.name || '').trim().slice(0, 120), email: mail(o.email).slice(0, 254),
    phone: day10(o.phone || (o.ship_to && o.ship_to.phone)), paid, placed_at: when(o.created) });
  const out = new Map();
  for (const a of abandoned || []) if (keyOf(a && a.id)) out.set(Number(a.id), row(a, false));
  for (const o of feedOrders || []) if (keyOf(o && o.id)) out.set(Number(o.id), row(o, Number(o.paid) > 0));
  return [...out.values()];
}

/** A studio order shaped like the quote row the Messages card reads. `o` is
 *  the feed's order (or a left checkout), `kept` the row kept here; either may
 *  be missing. Null when there is neither. */
function jobRow(id, o, kept) {
  const code = keyOf(id);
  if (!code || (!o && !kept)) return null;
  const f = o || {};
  const k = kept || {};
  return {
    code, studio_id: Number(id), studio: o || null,
    name: String(f.name || k.name || '').trim(),
    email: String(f.email || k.email || '').trim(),
    phone: String(f.phone || (f.ship_to && f.ship_to.phone) || k.phone || '').trim(),
    status: 'sent', created_at: f.created || k.placed_at || null,
    items: (Array.isArray(f.items) ? f.items : []).map((i) => ({ qty: Number(i && i.qty) || 0, description: String((i && i.name) || 'Item') })),
    total: Number(f.total) || 0, paid_amount: Number(f.paid) || 0, refunded: Number(f.refunded) || 0,
    /* Whether it was paid at all: the copy kept here answers for an order the
       feed no longer lists, so it never reads as a checkout left unpaid. */
    paid: o ? Number(f.paid) > 0 : !!k.paid, left: !!f.left,
    refunded_full: Number(f.refunded) > 0 && Number(f.refunded) >= Number(f.paid || 0) - 0.005,
    ship_method: String((f.delivery && f.delivery.method) || ''), tracking: String(f.tracking || ''),
    shipped_at: ['shipped', 'complete'].includes(String(f.status || '').toLowerCase()) ? (f.shipped_at || f.updated || f.created || null) : null,
    delivered_at: String(f.status || '').toLowerCase() === 'complete' ? (f.updated || f.created || null) : null,
    production_at: k.production_at || null, replies_handled_at: k.replies_handled_at || null,
  };
}

/** What is still owed on a studio order. `paid` is what was received, so money
 *  refunded is never shown as owed again (the board's own rule). Nothing is
 *  owed on one that was never paid: it is a checkout, not an order yet. */
function dueOn(job) {
  if (!(Number(job.paid_amount) > 0)) return 0;
  return Math.round(Math.max(0, Number(job.total || 0) - Number(job.paid_amount || 0)) * 100) / 100;
}

/** Why production cannot start on this order, or ''. */
function startBlock(o) {
  if (!o) return 'gone';
  const st = String(o.status || '').toLowerCase();
  if (['shipped', 'complete'].includes(st)) return 'out';
  if (st === 'cancel') return 'cancelled';
  const paid = Number(o.paid || 0);
  if (!(paid > 0)) return 'unpaid';
  if (Number(o.refunded || 0) >= paid - 0.005) return 'refunded';
  if (String(o.tax_exempt || '') === 'pending') return 'certificate';
  return '';
}

/** Which job a text or email from a customer belongs to, when they have both a
 *  quote and a studio order: the one the shop last wrote to them about, else
 *  the newer. `studio` and `quote` are { code, at } or null; `lastOut` is the
 *  code of the last message the shop sent them, or ''. */
function pickJob({ studio, quote, lastOut = '' }) {
  if (!studio) return quote ? quote.code : '';
  if (!quote) return studio.code;
  const out = String(lastOut || '').toUpperCase();
  if (out === studio.code || out === quote.code) return out;
  return new Date(studio.at || 0).getTime() > new Date(quote.at || 0).getTime() ? studio.code : quote.code;
}

module.exports = { KEY_RE, keyOf, idOf, labelOf, adminPath, contacts, jobRow, dueOn, startBlock, pickJob };
