'use strict';

/* Customer email replies onto the job page (2026-10-06), through Brevo's
 * inbound parsing.
 *
 * Emails about a job go out with Reply-To order-<code>@<reply domain>. That
 * subdomain's MX points at Brevo, which parses each message and POSTs it to
 * /webhooks/brevo/inbound/<secret>. The reply is kept on the job's message list
 * and forwarded to the shop's inbox, so the owner still sees it where she
 * always has.
 *
 * The Reply-To only changes once the reply domain's MX really points at Brevo
 * and the webhook is registered (see ready() in server.js): until then a reply
 * to that address would bounce, so emails keep the shop's own address. */

const LIMITS = { text: 20000, subject: 300, name: 200, files: 10 };

const clip = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);

/** The domain from the environment, or '' when it is missing or malformed. */
function domainOf(raw) {
  const d = String(raw || '').trim().toLowerCase().replace(/\.$/, '');
  return /^(?=.{4,200}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d) ? d : '';
}

/** Where a customer's reply about this job goes. */
function replyAddress(code, domain) {
  return `order-${String(code).toLowerCase()}@${domain}`;
}

/** The job code a message was addressed to, from its To and Cc, or ''. */
function codeFrom(item, domain, codeRe) {
  const boxes = [].concat(item && item.To || [], item && item.Cc || [], item && item.Recipients || []);
  for (const b of boxes) {
    const addr = String(typeof b === 'string' ? b : b && b.Address || '').trim().toLowerCase();
    const at = addr.lastIndexOf('@');
    if (at < 0 || addr.slice(at + 1) !== domain) continue;
    const m = addr.slice(0, at).match(/^order-([a-z0-9]{6,10})$/);
    if (m && codeRe.test(m[1].toUpperCase())) return m[1].toUpperCase();
  }
  return '';
}

/** One parsed message, cut down to what is kept. `text` is the reply without
 *  the quoted history or signature when Brevo could extract it. */
function shapeItem(item) {
  const i = item && typeof item === 'object' ? item : {};
  const from = i.From && typeof i.From === 'object' ? i.From : {};
  const address = clip(from.Address, 254).toLowerCase();
  const text = clip(i.ExtractedMarkdownMessage, LIMITS.text) || clip(i.RawTextBody, LIMITS.text);
  const files = (Array.isArray(i.Attachments) ? i.Attachments : []).slice(0, LIMITS.files)
    .filter((a) => a && typeof a.DownloadToken === 'string' && /^[A-Za-z0-9._~+/=-]{8,1000}$/.test(a.DownloadToken))
    .map((a) => ({ name: clip(a.Name, LIMITS.name) || 'attachment', type: clip(a.ContentType, 100),
                   bytes: Number(a.ContentLength) || null, token: a.DownloadToken }));
  return {
    id: clip(i.Uuid || i.MessageId, 300),
    from: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) ? address : '',
    fromName: clip(from.Name, LIMITS.name),
    subject: clip(i.Subject, LIMITS.subject).replace(/[\r\n]+/g, ' '),
    text,
    files,
  };
}

/** The items of a webhook body, at most 50. */
function itemsOf(body) {
  const b = body && typeof body === 'object' ? body : {};
  return (Array.isArray(b.items) ? b.items : []).slice(0, 50);
}

module.exports = { LIMITS, domainOf, replyAddress, codeFrom, shapeItem, itemsOf };
