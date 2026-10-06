'use strict';

/* What a helper may not do quietly, and how the owner sees what they did.

   The staff workspace (tools/lib/staff.js) decides who may open which page.
   This file covers what a page cannot: a helper who IS allowed to edit quotes
   renaming one after the customer paid, steering a customer to pay them
   directly, or writing a quote to themselves. Each rule here is pure so the
   tests can hold it to account; server.js does the reading and writing.

   Owner, 2026-10-06: "add something that keeps the worker from deleting
   quotes and renaming them and any possible fraud against the business. not
   just in this area but the whole thing." tests/fraud-guards.test.js. */

/** The last ten digits of a phone number, or '' when there are fewer. */
function phoneKey(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : '';
}

function emailKey(v) {
  return String(v || '').trim().toLowerCase();
}

/** Does this contact belong to anyone on `team` ([{ email, phone }])? */
function isTeamContact({ email, phone }, team) {
  const e = emailKey(email);
  const p = phoneKey(phone);
  if (!e && !p) return false;
  return (team || []).some((t) => (e && emailKey(t.email) === e) || (p && phoneKey(t.phone) === p));
}

/* Ways to be paid that bypass the shop: an app, a personal handle, or plain
   words asking for it. Card links and the quote page are the shop's own, so
   "pay on your quote page" never trips this. Zelle is the shop's own too
   (mark-paid takes it), so only Zelle to a number or address in the same
   message counts. */
const OUTSIDE_PAYMENT = [
  /\bcash\s*app\b/i,
  /\$cashtag\b|(^|\s)\$[a-z][a-z0-9_]{2,}/i,
  /\bvenmo\b/i,
  /\bpaypal\.me\b|\bpaypal\s+me\b/i,
  /\bapple\s*pay\s+(me|to)\b/i,
  /\bpay\s+me\s+(directly|direct|personally|instead)\b/i,
  /\b(send|pay)\s+(it|the\s+money|payment)\s+to\s+(me|my)\b/i,
  /\bmy\s+(personal\s+)?(zelle|venmo|cash\s*app|paypal|account)\b/i,
  /\bzelle\b[^.\n]{0,40}(\d{3}\D{0,2}\d{3}\D?\d{4}|@[a-z0-9-]+\.[a-z]{2,})/i,
  /\b(off\s+the\s+books|cash\s+only\s+to\s+me|don'?t\s+tell\s+(june|the\s+owner))\b/i,
];

/** The phrase that made a message look like outside payment, or ''. */
function mentionsOutsidePayment(text) {
  const s = String(text || '');
  for (const re of OUTSIDE_PAYMENT) {
    const m = re.exec(s);
    if (m) return m[0].trim();
  }
  return '';
}

/* The fields a quote's history compares, with the words the owner reads.
   Items are compared as a whole: a line-by-line diff of priced JSON is noise,
   and "the items changed, total $480 → $310" is what matters. */
const DIFF_FIELDS = [
  ['name', 'Customer name', 'contact'],
  ['email', 'Email', 'contact'],
  ['phone', 'Phone', 'contact'],
  ['total', 'Total', 'money'],
  ['tax', 'Tax', 'money'],
  ['deposit', 'Deposit', 'money'],
  ['discount_value', 'Discount', 'money'],
  ['rush_pct', 'Rush %', 'money'],
  ['taxable', 'Charged tax', 'money'],
  ['status', 'Status', 'state'],
  ['cancelled_at', 'Cancelled', 'state'],
  ['credited_to', 'Sales credit', 'state'],
  ['needed_by', 'Needed by', 'state'],
  ['notes', 'Notes', 'state'],
];

function norm(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  const n = Number(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    return String(Math.round(n * 100) / 100);
  }
  return String(v);
}

function itemsKey(items) {
  const list = Array.isArray(items) ? items : (() => { try { return JSON.parse(items || '[]'); } catch { return []; } })();
  return JSON.stringify(list.map((i) => [i.description || '', i.qty || 0, i.line_total || 0, i.prints || null]));
}

/** What changed between two versions of a quote row, field by field.
 *  → [{ field, label, kind, from, to }], contact changes first. */
function quoteDiff(before, after) {
  if (!before || !after) return [];
  const out = [];
  for (const [field, label, kind] of DIFF_FIELDS) {
    const a = norm(before[field]);
    const b = norm(after[field]);
    if (a !== b) out.push({ field, label, kind, from: a, to: b });
  }
  if (itemsKey(before.items) !== itemsKey(after.items)) {
    out.push({ field: 'items', label: 'Items', kind: 'money', from: '', to: '' });
  }
  const rank = { contact: 0, money: 1, state: 2 };
  return out.sort((x, y) => rank[x.kind] - rank[y.kind]);
}

/* What a helper may still change on a quote, by how far it has gone.

     not yet with the customer (held / draft)   everything
     sent, not accepted, no money               not the customer's name, email
                                                or phone: the quote is theirs
     accepted, or any money in                  nothing: the job is agreed

   A refused change goes to the owner as a note; the owner can edit anything. */
function staffEditLocks(existing) {
  if (!existing) return { contact: false, all: false };
  const reached = !['held', 'draft'].includes(existing.status);
  const agreed = !!existing.accepted_at || Number(existing.paid_amount || 0) > 0;
  return { contact: reached, all: reached && agreed };
}

/** The customer-facing fields a helper tried to change on a locked quote. */
function lockedChanges(existing, incoming) {
  const locks = staffEditLocks(existing);
  const tried = [];
  if (locks.contact) {
    const nameKey = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (nameKey(existing.name) !== nameKey(incoming.name)) tried.push('the customer’s name');
    if (emailKey(existing.email) !== emailKey(incoming.email)) tried.push('the email');
    if (phoneKey(existing.phone) !== phoneKey(incoming.phone) && norm(existing.phone) !== norm(incoming.phone)) tried.push('the phone');
  }
  if (locks.all) {
    if (itemsKey(existing.items) !== itemsKey(incoming.items)) tried.push('the items');
    if (norm(existing.total) !== norm(incoming.total)) tried.push('the total');
  }
  return { locks, tried };
}

/* A cancellation a helper may make on their own: nothing agreed, no money.
   Anything else becomes a request for the owner. */
function staffMayCancel(q) {
  return !!q && !q.accepted_at && !(Number(q.paid_amount || 0) > 0);
}

module.exports = {
  phoneKey, emailKey, isTeamContact, mentionsOutsidePayment, OUTSIDE_PAYMENT,
  DIFF_FIELDS, quoteDiff, staffEditLocks, lockedChanges, staffMayCancel,
};
