'use strict';

/* Follow-up emails for "Save your design" leads (owner, 2026-10-28: "yes, add
   follow-ups"). Someone who saves a design in the Design Lab is a Designer
   lead (submissions.source = 'designer'). They get up to three short emails,
   1, 3 and 7 days after saving, each linking back to their own design.

   They stop as soon as a person is on it: a quote made from the lead, a
   reply logged by the shop, an outcome set, or the lead dismissed. Only
   leads saved on or after START get them, so switching this on does not
   email everyone who saved a design months ago.

   Pure functions only, so the timing and the stop rules can be tested
   without a database or an email account. */

const { escHtml: esc } = require('./html-escape');

const START = Date.parse('2026-10-28T00:00:00Z');
const DAY = 86400000;
/* Days after the save for each email, and the least time between two, so a
   sweep that was down for a while never sends two in a row. */
const STEPS = [1, 3, 7];
const MIN_GAP_DAYS = 2;

/** Why a lead gets no more follow-ups, or '' when it may. */
function stopReason(lead) {
  if (!lead.email) return 'no email';
  if (lead.dismissed_at) return 'dismissed';
  if (lead.outcome) return 'outcome set';
  if (lead.first_response_at) return 'the shop replied';
  if (lead.has_quote) return 'quoted';
  if (new Date(lead.created_at).getTime() < START) return 'saved before follow-ups started';
  return '';
}

/** The follow-up due now (1, 2 or 3), or 0. `sent` is how many it has had. */
function dueStep(lead, now = new Date()) {
  if (stopReason(lead)) return 0;
  const sent = lead.design_fu_sent || 0;
  if (sent >= STEPS.length) return 0;
  const age = (now.getTime() - new Date(lead.created_at).getTime()) / DAY;
  if (age < STEPS[sent]) return 0;
  if (lead.design_fu_at && (now.getTime() - new Date(lead.design_fu_at).getTime()) / DAY < MIN_GAP_DAYS) return 0;
  return sent + 1;
}

/** The email for follow-up `step`. `link` is their saved design (already
 *  checked to be on the designer site), `code` the shop's current promo code
 *  for the last one. Returns { subject, heading, inner } for the shop's
 *  customer email wrapper. */
function followupEmail(step, { name, product, link, preview, code, pct = 10 }) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  const hi = first ? `Hi ${esc(first)},` : 'Hi,';
  const what = product ? esc(product) : 'your design';
  const btn = (label) => `<p style="margin:22px 0"><a href="${esc(link)}" style="background:#E0107A;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:700">${label}</a></p>`;
  const img = preview ? `<p><img src="${esc(preview)}" alt="Your saved design" style="max-width:100%;border:1px solid #e3e8f2;border-radius:8px"></p>` : '';
  const help = '<p>Questions about sizes, colors or price? Just reply to this email, or call or text us at (773) 900-4592.</p>';
  if (step === 1) {
    return {
      subject: 'Your design is saved',
      heading: 'Your design is saved',
      inner: `<p>${hi}</p><p>Thanks for designing with us. We saved ${what} so you can pick up right where you left off.</p>${img}
        ${btn('Open my design')}<p>Small orders are ready in 5–7 business days after you approve the proof.</p>${help}`,
    };
  }
  if (step === 2) {
    return {
      subject: 'Want us to look over your design?',
      heading: 'A second pair of eyes',
      inner: `<p>${hi}</p><p>If you are not sure about the size, the placement or the garment for ${what}, reply and tell us
        what it is for. We will check it and send a proof before anything prints.</p>
        ${btn('Open my design')}${help}`,
    };
  }
  return {
    subject: `Your design is still saved, plus ${pct}% off`,
    heading: 'Still thinking it over?',
    inner: `<p>${hi}</p><p>${what.charAt(0).toUpperCase() + what.slice(1)} is still saved. When you are ready, code
      <b style="color:#E0107A">${esc(code)}</b> takes ${pct}% off at checkout.</p>
      ${btn('Finish my order')}${help}<p style="color:#6b7280">This is our last reminder about this design.</p>`,
  };
}

module.exports = { START, STEPS, MIN_GAP_DAYS, stopReason, dueStep, followupEmail };
