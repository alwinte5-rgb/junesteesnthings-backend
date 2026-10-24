'use strict';
/* The software leads board (plan PR 4): the board the software sales course
 * promises (software-core lesson "The leads board"), replacing the shared
 * Google Sheet. One row per prospect for the shop's software (COS, CartBook),
 * owned by the agent who found them (rep_id), with its notes in
 * software_lead_notes.
 *
 * The rules are the course's: every lead has where it was found and one real
 * detail; every open lead has a next step and its date; a lost lead says why.
 * A lead counts for the agent once a contact is logged on it (contacted_at),
 * the same proof rule as the shop's leads (owner, 2026-10-21: "a lead counts
 * only when contacted and logged"). */

const { safeUrl, domainKey } = require('./lead-finder');

const PRODUCTS = { cos: 'COS (Content OS)', cartbook: 'CartBook' };
/* In order, as the lesson teaches them. */
const STATUSES = {
  new: 'New', contacted: 'Contacted', replied: 'Replied', demo: 'Demo booked', trial: 'Trial', won: 'Won', lost: 'Lost',
};
const OPEN = ['new', 'contacted', 'replied', 'demo', 'trial'];
/* What a logged entry was. Every kind but a note is a contact. */
const KINDS = { email: 'Email', linkedin: 'LinkedIn message', dm: 'Other DM', call: 'Call or video', note: 'Note (no contact)' };
const LIMITS = { company: 200, contact: 120, email: 254, plan: 60, detail: 600, nextStep: 200, lostWhy: 300, note: 2000 };
const EMAIL_RE = /^[^\s@<>"']{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').trim().slice(0, n);
const one = (v, n) => clip(v, n).replace(/\s+/g, ' ');
const isDate = (s) => {
  const v = String(s || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};

/** The next step and its date, checked for a lead in `status`: required while
 *  the lead is open, cleared once it is won or lost. */
function nextStepFor(status, b) {
  if (!OPEN.includes(status)) return { next_step: null, next_on: null };
  const next_step = one(b.next_step, LIMITS.nextStep);
  const next_on = String(b.next_on || '').trim();
  if (!next_step) return { error: 'Every open lead needs a next step.' };
  if (!isDate(next_on)) return { error: 'Give the next step a date.' };
  return { next_step, next_on };
}

/** A new lead from the add form: { lead } or { error }. */
function shapeNew(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const product = Object.hasOwn(PRODUCTS, String(b.product || '')) ? String(b.product) : '';
  if (!product) return { error: 'Pick the product.' };
  const company = one(b.company, LIMITS.company);
  if (company.length < 2) return { error: 'Give the company or person\'s business name.' };
  const source_url = safeUrl(b.source_url);
  if (!source_url) return { error: 'Add the link where you found them (https).' };
  const detail = clip(b.detail, LIMITS.detail);
  if (detail.length < 10) return { error: 'Write the one detail you found about them: it is what makes the first message personal.' };
  const email = one(b.email, LIMITS.email).toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { error: 'That email does not look right.' };
  const website = String(b.website || '').trim() ? safeUrl(b.website) : '';
  if (String(b.website || '').trim() && !website) return { error: 'The website must be an https link.' };
  const next = nextStepFor('new', { next_step: b.next_step || 'Send the first message', next_on: b.next_on });
  if (next.error) return next;
  return {
    lead: {
      product, company, contact: one(b.contact, LIMITS.contact) || null, email: email || null,
      website: website || null, website_key: domainKey(website) || null, source_url, detail,
      plan: one(b.plan, LIMITS.plan) || null, status: 'new', ...next,
    },
  };
}

/** A change of status and next step: { change } or { error }. Lost needs a
 *  reason; open needs a next step and date. */
function shapeUpdate(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const status = Object.hasOwn(STATUSES, String(b.status || '')) ? String(b.status) : '';
  if (!status) return { error: 'Pick a status.' };
  const lost_why = status === 'lost' ? one(b.lost_why, LIMITS.lostWhy) : null;
  if (status === 'lost' && (!lost_why || lost_why.length < 3)) return { error: 'Say why it was lost: it is how we learn what to change.' };
  const next = nextStepFor(status, b);
  if (next.error) return next;
  return { change: { status, lost_why, plan: one(b.plan, LIMITS.plan) || null, ...next } };
}

/** An entry for the lead's log: { entry } or { error }. */
function shapeEntry(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const kind = Object.hasOwn(KINDS, String(b.kind || '')) ? String(b.kind) : '';
  if (!kind) return { error: 'Say what it was: email, message, call or note.' };
  const text = clip(b.body, LIMITS.note);
  if (text.length < 3) return { error: 'Write what was sent or said.' };
  return { entry: { kind, body: text, contact: kind !== 'note' } };
}

/** Where a lead stands today: due (next step today or earlier), open, or closed. */
function standing(l, today) {
  if (!OPEN.includes(l.status)) return 'closed';
  const on = l.next_on instanceof Date ? l.next_on.toISOString().slice(0, 10) : String(l.next_on || '').slice(0, 10);
  return on && on <= today ? 'due' : 'open';
}

/** The board's numbers for a set of leads: found, counted (a contact logged)
 *  and how many sit in each status now. */
function tally(leads) {
  const t = { found: leads.length, counted: leads.filter((l) => l.contacted_at).length };
  for (const k of Object.keys(STATUSES)) t[k] = leads.filter((l) => l.status === k).length;
  return t;
}

/** A company name as shapeNew saves it, for finding the lead again. */
const shapeCompany = (v) => one(v, LIMITS.company);

module.exports = { PRODUCTS, STATUSES, OPEN, KINDS, LIMITS, isDate, nextStepFor, shapeNew, shapeUpdate, shapeEntry, standing, tally, shapeCompany };
