'use strict';

/* SMS consent — the wording, and reading it back off a form.

   Carriers (and Twilio's toll-free verification) require that a text is only
   sent to someone who agreed to that KIND of text, and that marketing consent is
   its own unchecked box, never a condition of buying anything. So there are two
   boxes, both off by default:

     sms_transactional — quotes, order status, pickup and delivery updates
     sms_marketing     — deals and promotions

   The exact wording shown is stored with each consent row (CONSENT_VERSION plus
   the text), because "what did they agree to" has to be answerable later from
   the record, not from whatever the form says today.

   The same wording is hand-copied into public/index.html and the designer's
   checkout.php / product.php; tests/sms-consent.test.js pins the backend copies
   to these constants. Change them together and bump CONSENT_VERSION. */

const CONSENT_VERSION = '2026-09-25';

const TRANSACTIONAL_TEXT =
  "Text me about my order (quotes, order status, pickup and delivery updates) from June's Tees & Things. " +
  'Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.';

const MARKETING_TEXT =
  "Also text me deals and promotions from June's Tees & Things (up to 4 msgs/month). " +
  'Consent is not a condition of purchase. Msg & data rates may apply. Reply STOP to opt out.';

// US numbers only (the shop's customers). Returns +1XXXXXXXXXX or '' if invalid.
function normalizeUsPhone(raw) {
  let d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  if (d.length !== 10 || /^[01]/.test(d)) return '';
  return '+1' + d;
}

// A checkbox posts "on"/"1"/"true"/true; anything else — including absence — is no.
function checked(v) {
  if (v === true) return true;
  return ['on', '1', 'true', 'yes'].includes(String(v == null ? '' : v).toLowerCase());
}

// Reads the two boxes off a request body. null when there is no usable phone or
// neither box was ticked — nothing to record.
function parseSmsConsent(body) {
  const b = body || {};
  const phone = normalizeUsPhone(b.phone);
  const transactional = checked(b.sms_transactional);
  const marketing = checked(b.sms_marketing);
  if (!phone || (!transactional && !marketing)) return null;
  return { phone, transactional, marketing };
}

/* A phone's consent from its rows, oldest first.

   A form can only GRANT: an unticked box means "not asking for this now", not
   "stop" — otherwise ticking only the marketing box in a popup would silently
   switch off the order updates the same person asked for at checkout. The only
   way consent is removed is a row with BOTH false, which only STOP (or Twilio
   reporting STOP) writes; parseSmsConsent never produces one. */
function foldSmsConsent(rows) {
  const state = { transactional: false, marketing: false };
  for (const r of rows || []) {
    if (!r.transactional && !r.marketing) {
      state.transactional = false; state.marketing = false;
    } else {
      if (r.transactional) state.transactional = true;
      if (r.marketing) state.marketing = true;
    }
  }
  return state;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// The two boxes as HTML, for server-rendered pages. Both unchecked by default.
function consentCheckboxesHtml() {
  const row = (name, text) => `
    <label style="display:flex;gap:8px;align-items:flex-start;font-size:12.5px;line-height:1.45;font-weight:400;text-transform:none;letter-spacing:0;margin:8px 0;color:inherit">
      <input type="checkbox" name="${name}" value="1" style="width:auto;margin-top:3px;flex:none">
      <span>${esc(text)}</span>
    </label>`;
  return `<div class="sms-consent">
    ${row('sms_transactional', TRANSACTIONAL_TEXT)}
    ${row('sms_marketing', MARKETING_TEXT)}
    <p style="font-size:11.5px;margin:4px 0 0;opacity:.8">See our <a href="https://www.jtees.net/sms-terms" target="_blank" rel="noopener">SMS Terms</a>
      and <a href="https://design.jtees.net/privacy.php" target="_blank" rel="noopener">Privacy Policy</a>.</p>
  </div>`;
}

module.exports = {
  CONSENT_VERSION, TRANSACTIONAL_TEXT, MARKETING_TEXT,
  normalizeUsPhone, parseSmsConsent, consentCheckboxesHtml, foldSmsConsent,
};
