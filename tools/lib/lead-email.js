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

/** The greeting name for a lead: the first word of their name, cleaned. A name
 *  typed all lower or all upper case is capitalised, trailing punctuation goes,
 *  and anything that is not a name (an email address, digits) gives '' so the
 *  message says plain "Hi". Shared by the emails and the texts. */
function firstName(name) {
  const w = String(name || '').trim().split(/\s+/)[0].replace(/^[^\p{L}]+|[^\p{L}'’-]+$/gu, '').slice(0, 20);
  if (!w || /[@\d]/.test(w) || !/^[\p{L}'’-]+$/u.test(w)) return '';
  return w === w.toLowerCase() || w === w.toUpperCase() ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w;
}

/** The ready-made "more information needed" email for one lead. */
function infoRequest(lead, { signer = 'June', shop = "June's Tees" } = {}) {
  const l = lead || {};
  const first = firstName(l.name);
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
  const first = firstName(l.name);
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

/* A text to a lead from the Leads page (owner, 2026-11-12: "add something where
 * I can send text messages from the lead"). 300 is the job page's text limit:
 * the brand and the opt-out are added around it when it is sent. */
const TEXT_LIMIT = 300;

/* "June's Tees:" typed at the start; the send adds it, so it is taken off. */
const BRAND_PREFIX = /^\s*june['’]?s\s+tees\s*(&\s*things\s*)?[:,-]\s*/i;

/** The text typed in the lead's text box, cleaned to what a text can carry
 *  (plain characters: one emoji makes a text cost three times as much, and the
 *  sender strips them). Accents become plain letters, so Spanish keeps its
 *  words ("señora" goes as "senora"); anything else that cannot go is left out
 *  and `dropped` says so. Returns { text, dropped } or { error }. */
function cleanText(body) {
  const b = body && typeof body === 'object' ? body : {};
  const typed = String(b.body || '').replace(/\s+/g, ' ').trim();
  if (!typed) return { error: 'Write the text first.' };
  if (typed.length > TEXT_LIMIT) return { error: `The text is too long (${TEXT_LIMIT} characters at most).` };
  if (FILL_IN.test(typed)) return { error: 'Fill in the [June to fill in] parts first.' };
  const folded = typed.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-');
  const text = folded.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim().replace(BRAND_PREFIX, '').trim();
  if (!text) return { error: 'There is nothing left to send: texts carry plain letters only, and "June\'s Tees:" is added for you.' };
  return { text, dropped: /[^\x20-\x7E]/.test(folded) };
}

/** A text to a lead as it goes out: "June's Tees: <words> jtees.net Reply STOP
 *  to opt out." The site link is added unless the words already carry one. One
 *  wrapper for the lead's "Text them" box and the automatic follow-ups. */
function textBody(words) {
  return `June's Tees: ${words}${/https?:\/\/|jtees\.net/i.test(words) ? '' : ' jtees.net'} Reply STOP to opt out.`;
}

/* Ready-made texts for the lead's text box (owner, 2026-11-12: "make message
 * templates for people who send us messages so I can respond back"). Picking
 * one fills the box with the lead's first name in it, to edit before sending.
 * "June's Tees:" and "Reply STOP to opt out." are added when it is sent, so
 * neither is written here. No prices: those change and belong on the quote. */
const TEXT_TEMPLATES = [
  { key: 'missed_call', label: 'Missed their call',
    text: (hi) => `${hi}, sorry we missed your call. How can we help? Tell us what you'd like made and we'll get back to you.` },
  { key: 'details', label: 'Ask for the details',
    text: (hi) => `${hi}, thanks for reaching out! So we can price it, please tell us the item and color, how many and what sizes, where the design goes, and the date you need it by.` },
  { key: 'artwork', label: 'Ask for their design',
    text: (hi, l) => `${hi}, please text a photo of your logo or design here${l.email ? ', or reply to our email with the file' : ''}. A large, clear image works best.` },
  { key: 'quote_sent', label: 'Quote is in their email', needsEmail: true,
    text: (hi) => `${hi}, your quote is in your email now. Any questions, just reply here.` },
  { key: 'next_week', label: 'Booked this week, next week OK',
    text: (hi) => `${hi}, our printer is booked for the rest of this week, but we can print yours next week. Does that still work for your date?` },
  { key: 'no_trademarks', label: "Can't print brand logos",
    text: (hi) => `${hi}, we can't print brand, team or character logos we don't have permission to use. We'd be happy to print your own original design.` },
  { key: 'check_in', label: 'Checking in',
    text: (hi) => `${hi}, just checking in. Are you still looking to get this made? We're happy to help whenever you're ready.` },
];

/** The templates with "{hi}" where the greeting goes: with an email on the
 *  lead, or without (the ones about email left out or worded for texts). */
function textTemplateSet(hasEmail) {
  return TEXT_TEMPLATES.filter((t) => !t.needsEmail || hasEmail)
    .map((t) => ({ key: t.key, label: t.label, text: t.text('{hi}', { email: hasEmail }) }));
}

/** The text templates for one lead: [{ key, label, text }], each with the lead's
 *  first name in it. Ones about email are left out for a lead with no email.
 *  firstName caps the name at 20, and the test holds every template under
 *  TEXT_LIMIT at that length; one over it is refused by cleanText, never cut. */
function textTemplates(lead) {
  const l = lead || {};
  const first = firstName(l.name);
  const hi = first ? `Hi ${first}` : 'Hi';
  return textTemplateSet(!!l.email).map((t) => ({ ...t, text: t.text.replace('{hi}', hi) }));
}

/** The script that fills every lead text box's template picker on the page
 *  (select[data-jt-tt], with data-first and data-email), written once per page
 *  rather than the whole list inside every card. Picking one fills the box,
 *  asking first when something is already typed. */
function textTemplatesScript() {
  const sets = JSON.stringify({ e: textTemplateSet(true), n: textTemplateSet(false) }).replace(/</g, '\\u003c');
  return `<script>(function(){var S=${sets};
function fill(sel){if(sel.dataset.jtFilled)return;sel.dataset.jtFilled='1';var list=S[sel.dataset.email==='1'?'e':'n'];
for(var i=0;i<list.length;i++){var o=document.createElement('option');o.value=list[i].key;o.textContent=list[i].label;sel.appendChild(o);}}
var all=document.querySelectorAll('select[data-jt-tt]');for(var i=0;i<all.length;i++)fill(all[i]);
document.addEventListener('change',function(ev){var sel=ev.target;if(!sel||!sel.matches||!sel.matches('select[data-jt-tt]'))return;
var key=sel.value;sel.selectedIndex=0;if(!key)return;var list=S[sel.dataset.email==='1'?'e':'n'],t=null;
for(var i=0;i<list.length;i++)if(list[i].key===key)t=list[i];if(!t)return;
var hi=sel.dataset.first?'Hi '+sel.dataset.first:'Hi',v=t.text.replace('{hi}',hi),box=sel.form&&sel.form.body;if(!box)return;
if(box.value.trim()&&box.value!==v&&!confirm('Replace what you have typed with this template?'))return;
box.value=v;box.dispatchEvent(new Event('input'));box.focus();});})();</script>`;
}

module.exports = { textBody, textTemplateSet, textTemplatesScript, firstName, followUp, LIMITS, TEXT_LIMIT, infoRequest, cleanEmail, cleanText, toHtml, textTemplates };
