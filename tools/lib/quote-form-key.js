/* ONE FORM, ONE QUOTE (owner, 2026-10-15: "Duplicate quotes are created if I
 * go back through the system and add information").
 *
 * The new-quote form posts to /admin/api/quotes, and every post there used to
 * INSERT. Saving, pressing Back to the still-filled form, adding a detail and
 * saving again therefore made a second quote. The form now carries a one-time
 * key; the first save records which quote it made (staff_activity, action
 * QUOTE_FORM_ACTION), and a later save carrying the same key updates that
 * quote instead.
 *
 * Going Back to reuse the form for SOMEONE ELSE is still a new quote: a save
 * only joins an earlier quote whose email and phone it adds to, never one it
 * would change to a different person.
 */
const FORM_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const QUOTE_FORM_ACTION = 'quote form saved';

function formKeyOf(v) {
  const k = String(Array.isArray(v) ? v[0] : v || '').trim().toLowerCase();
  return FORM_KEY_RE.test(k) ? k : '';
}

const emailKey = (e) => String(e || '').trim().toLowerCase();
const phoneKey = (p) => String(p || '').replace(/\D/g, '').slice(-10);

/* Same person, or not yet known to be someone else: each detail is either
   still empty on the saved quote, empty on this save, or the same. */
function sameCustomer(saved, posted) {
  const fits = (a, b) => !a || !b || a === b;
  return fits(emailKey(saved.email), emailKey(posted.email))
    && fits(phoneKey(saved.phone), phoneKey(posted.phone));
}

/* The quote an earlier save of this form made, newest first; null when the
   save should create one. `candidates` are quote rows ({ code, email, phone }). */
function pickQuoteForKey(candidates, posted) {
  for (const q of candidates || []) if (q && q.code && sameCustomer(q, posted || {})) return q.code;
  return null;
}

module.exports = { FORM_KEY_RE, QUOTE_FORM_ACTION, formKeyOf, sameCustomer, pickQuoteForKey };
