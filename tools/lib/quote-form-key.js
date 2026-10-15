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
 * would change to a different person, and never a quote that is cancelled,
 * accepted or paid (that one is finished; a re-save starts a new quote).
 */
const FORM_KEY_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const QUOTE_FORM_ACTION = 'quote form saved';

function formKeyOf(v) {
  const k = String(Array.isArray(v) ? v[0] : v || '').trim().toLowerCase();
  return FORM_KEY_RE.test(k) ? k : '';
}

/* The shop's one contact normaliser, shared with the edit locks that run on
   the same save, so the two never disagree about whether a detail changed. */
const { emailKey, phoneKey } = require('./fraud-signals');
const nameKey = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

/* Same person, or not yet known to be someone else:
   - a detail both saves have, and that differs, is someone else;
   - a detail both saves have, and that matches, is the same person;
   - otherwise one save had no contact the other can be checked against, and
     the name decides: the same, or blank on either side, is the same person.
   Email on the first save and only a phone on the second, with nothing in
   common, is someone else: the form was reused, not added to. */
function sameCustomer(saved, posted) {
  const pairs = [[emailKey(saved.email), emailKey(posted.email)], [phoneKey(saved.phone), phoneKey(posted.phone)]];
  if (pairs.some(([a, b]) => a && b && a !== b)) return false;
  if (pairs.some(([a, b]) => a && b && a === b)) return true;
  const hasContact = (side) => pairs.some((pr) => pr[side]);
  if (hasContact(0) && hasContact(1)) return false;
  const [n1, n2] = [nameKey(saved.name), nameKey(posted.name)];
  return !n1 || !n2 || n1 === n2;
}

/* The quote an earlier save of this form made, newest first; null when the
   save should create one. `candidates` are quote rows ({ code, name, email, phone }). */
function pickQuoteForKey(candidates, posted) {
  for (const q of candidates || []) if (q && q.code && sameCustomer(q, posted || {})) return q.code;
  return null;
}

module.exports = { FORM_KEY_RE, nameKey, QUOTE_FORM_ACTION, formKeyOf, sameCustomer, pickQuoteForKey };
