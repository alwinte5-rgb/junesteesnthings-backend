'use strict';

/* Which contacts are businesses, for the Brevo "Business" list (owner,
   2026-11-14: "lets start segmenting the customers. we can add anyone with a
   custom domain to business"). The list was seeded by hand that day (Brevo
   list 11, 46 contacts); this keeps it growing as new people get in touch.

   The rule is the email's domain: anything that is not a personal mail
   provider is treated as a business or organisation (a church, a school, a
   team's club domain all count, as the owner asked). Our own domains, test
   domains and the typo domains seen in the contact list are left out, so a
   staff test or "gmail.con" never lands on the business list.

   Pure functions only — tests/business-contact.test.js. */

const PERSONAL = new Set(`gmail.com googlemail.com yahoo.com ymail.com rocketmail.com yahoo.co.uk hotmail.com outlook.com live.com msn.com
 aol.com icloud.com me.com mac.com comcast.net att.net sbcglobal.net bellsouth.net verizon.net charter.net cox.net earthlink.net
 protonmail.com proton.me pm.me mail.com gmx.com gmx.us gmx.de web.de zoho.com yandex.com mail.ru aim.com frontier.com frontiernet.net
 windstream.net centurylink.net q.com juno.com netzero.net optonline.net rcn.com wowway.com wideopenwest.com ameritech.net prodigy.net
 hotmail.co.uk live.co.uk outlook.co.uk icloud.co yahoo.ca hotmail.ca bigpond.com tutanota.com hey.com fastmail.com duck.com
 privaterelay.appleid.com uwalumni.com
 example.com example.org example.net example.invalid test.com
 jtees.net jtees.bet junesteesnthings.com
 gmail.con gmaill.com gamil.com gmai.com yahooo.com hotmial.com aolmailcandy.com`.split(/\s+/).filter(Boolean));

/** The email's domain, lower-cased, or '' if it has none. */
function emailDomain(email) {
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(String(email || '').trim().toLowerCase());
  return m ? m[1] : '';
}

/** True when the address is on a custom (non-personal) domain. */
function isBusinessEmail(email) {
  const d = emailDomain(email);
  if (!d || PERSONAL.has(d)) return false;
  // Personal providers' country variants: yahoo.fr, hotmail.it, outlook.de …
  if (/^(yahoo|hotmail|outlook|live|gmx|aol|icloud)\.[a-z.]{2,6}$/.test(d)) return false;
  return true;
}

/** The Brevo list new business contacts join, or null when it is switched off.
 *  BREVO_BUSINESS_LIST_ID: a list id, or "off". Unset means the list made
 *  for this on 2026-11-14 (11). */
function businessListId(env = process.env) {
  const raw = String(env.BREVO_BUSINESS_LIST_ID ?? '').trim();
  if (raw.toLowerCase() === 'off') return null;
  if (raw === '') return 11;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A contact write's body with the business list added when it applies.
 *  Returns the same object when nothing changes. */
function withBusinessList(body, env = process.env) {
  if (!body || typeof body !== 'object' || !body.email || !isBusinessEmail(body.email)) return body;
  const id = businessListId(env);
  if (!id) return body;
  const lists = Array.isArray(body.listIds) ? body.listIds : [];
  if (lists.includes(id)) return body;
  return { ...body, listIds: [...lists, id] };
}

module.exports = { emailDomain, isBusinessEmail, businessListId, withBusinessList, PERSONAL };
