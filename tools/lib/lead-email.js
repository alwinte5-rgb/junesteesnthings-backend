'use strict';

/* An email to a lead from the Leads page (2026-10-07). Most enquiries from the
 * website form are missing something a quote needs, so the box opens with a
 * "we need a few more details" message the owner can edit before sending.
 * Plain text in, escaped HTML out: what was typed is what the customer reads.
 */

const LIMITS = { subject: 150, body: 10000 };
const FILL_IN = /\[\s*(june|owner)\s+to\s+fill\s+in\b/i;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** The ready-made "more information needed" email for one lead. */
function infoRequest(lead, { signer = 'June', shop = "June's Tees" } = {}) {
  const l = lead || {};
  const first = String(l.name || '').trim().split(/\s+/)[0];
  const asked = String(l.description || '').replace(/\s+/g, ' ').trim();
  const about = asked ? ` about "${asked.length > 80 ? asked.slice(0, 77).trimEnd() + '...' : asked}"` : '';
  return {
    subject: `Your enquiry with ${shop}`,
    body: `Hi${first ? ' ' + first : ''},

Thank you for reaching out to ${shop}${about}! To put your quote together, could you tell us a little more:

1. How many pieces, and the sizes you need
2. The item and color (for example a black t-shirt or a navy hoodie)
3. Where the design goes (front, back, sleeve) and how many colors it has
4. Your logo or artwork file, if you have one
5. The date you need them by

Just reply to this email and we'll get your quote over to you.

Thank you,
${signer}
${shop}`,
  };
}

/** The follow-up for a lead the shop already wrote to and has not heard
 *  back from (owner, 2026-10-15: "suggest a followup reply. add that to the
 *  contacted leads"). Short, warm, one easy next step; editable. */
function followUp(lead, { signer = 'June', shop = "June's Tees" } = {}) {
  const l = lead || {};
  const first = String(l.name || '').trim().split(/\s+/)[0];
  const asked = String(l.description || '').replace(/\s+/g, ' ').trim();
  const about = asked ? ` for ${asked.length > 70 ? asked.slice(0, 67).trimEnd() + '...' : asked}` : '';
  return {
    subject: `Following up on your enquiry with ${shop}`,
    body: `Hi${first ? ' ' + first : ''},

I wanted to follow up on your request${about}. Are you still looking to get these made?

If so, just reply with anything you have so far (quantities, sizes, colors, your artwork and the date you need them) and I'll put your quote together right away. If your plans have changed, no problem at all, a quick note lets me know.

Thank you,
${signer}
${shop}`,
  };
}

/** The subject and message from the form, cleaned; or an error to show. */
function cleanEmail(body) {
  const b = body && typeof body === 'object' ? body : {};
  const subject = String(b.subject || '').replace(/[\r\n]+/g, ' ').trim().slice(0, LIMITS.subject);
  const text = String(b.body || '').replace(/\r\n?/g, '\n').trim();
  if (!subject) return { error: 'Add a subject.' };
  if (!text) return { error: 'Write the message first.' };
  if (text.length > LIMITS.body) return { error: `The message is too long (${LIMITS.body} characters at most).` };
  /* Claude marks what it could not know; none of it may reach a customer. */
  if (FILL_IN.test(`${subject}\n${text}`)) return { error: 'Fill in the [June to fill in] parts first.' };
  return { subject, text };
}

/** The message as the customer sees it: each paragraph escaped, line breaks kept. */
function toHtml(text) {
  return String(text).split(/\n{2,}/).map((p) =>
    `<p style="margin:0 0 12px;line-height:1.55">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}

module.exports = { followUp, LIMITS, infoRequest, cleanEmail, toHtml };
