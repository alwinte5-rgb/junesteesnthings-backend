'use strict';
/*
 * Failures a customer hits that nobody would otherwise see (plan Phase 1d).
 *
 * Two kinds, counted per day in the `site_health` table and listed in the
 * owner's morning email:
 *
 *  - quote_form: a quote or embroidery request the server refused — the
 *    4-an-hour limit, the bot filter, the human check, a field it would not
 *    take, or a crash. A real customer refused here used to leave no trace.
 *  - not_found: a 404 page a person actually saw (the page reports it from
 *    the browser, so scanners that never run scripts stay out of the list),
 *    with the site that linked to it, so a dead link can be fixed at source.
 *
 * Everything stored is a server-chosen reason or a capped path/hostname —
 * never a name, email, phone or the text someone typed.
 */

/** Why /submit (or the embroidery form) refused a request, in a few fixed words. */
function formFailureReason(status, error) {
  const s = Number(status) || 0;
  const e = String(error || '');
  if (s === 429) return 'rate_limit';
  if (s >= 500) return 'server_error';
  if (e === 'Bad request') return 'bot_filter';
  if (/human check/i.test(e)) return 'human_check';
  if (s >= 400) return 'validation: ' + e.slice(0, 60);
  return '';
}

/** What a reason means to the owner. */
const REASON_WORDS = {
  rate_limit: 'Hit the 4-an-hour limit',
  server_error: 'Server error',
  bot_filter: 'Stopped by the bot filter',
  human_check: 'Failed the human check',
};
const reasonWords = (r) => REASON_WORDS[r] || (r.startsWith('validation: ') ? 'Refused: ' + r.slice(12) : r);

const SITES = { www: 'jtees.net', design: 'Design Studio' };

/** A 404 report from a browser, cleaned, or null. The path keeps no query
 *  string (it could carry anything); the referrer keeps only its hostname. */
function cleanNotFound(body) {
  if (!body || typeof body !== 'object') return null;
  const site = SITES[body.site] ? body.site : null;
  const p = typeof body.path === 'string' ? body.path.split(/[?#]/)[0].trim() : '';
  if (!site || !p.startsWith('/') || p.length > 200 || /[\u0000-\u001f]/.test(p)) return null;
  let ref = '';
  if (typeof body.ref === 'string' && body.ref && body.ref.length <= 500) {
    try {
      const u = new URL(body.ref);
      if (u.protocol === 'https:' || u.protocol === 'http:') ref = u.hostname.toLowerCase().slice(0, 100);
    } catch { /* not a URL: no referrer */ }
  }
  return { site, path: p, ref };
}

/**
 * The morning email's "Something went wrong for a customer" section, or ''.
 * formFails: [{ detail, n }] for yesterday. notFound: [{ detail, ref, n }] for
 * the last 7 days, detail being notFoundDetail(); the caller passes it on
 * Mondays only (a weekly list, per the plan).
 */
function siteHealthDigestHtml({ formFails = [], notFound = [], esc }) {
  /* detail is the reason, prefixed "embroidery " for the embroidery form. */
  const split = (d) => (/^embroidery /.test(d) ? { form: ' (embroidery form)', reason: d.slice(11) } : { form: '', reason: d });
  const real = formFails.filter((f) => split(f.detail).reason !== 'bot_filter');
  const bots = formFails.filter((f) => split(f.detail).reason === 'bot_filter').reduce((a, f) => a + f.n, 0);
  if (!real.length && !notFound.length) return '';
  let html = `<h3 style="color:#b91c1c;margin:20px 0 6px">When something went wrong for a customer</h3>`;
  if (real.length) {
    const total = real.reduce((a, f) => a + f.n, 0);
    html += `<p style="margin:0 0 4px;font-size:13px"><b>${total} quote request${total === 1 ? '' : 's'} refused yesterday</b>${
      bots ? ` <span style="color:#6b7280">(plus ${bots} stopped as bots)</span>` : ''}</p>` +
      real.map((f) => { const x = split(f.detail);
        return `<div style="font-size:13px;margin-left:10px">${esc(reasonWords(x.reason) + x.form)}: ${f.n}</div>`; }).join('') +
      `<p style="color:#6b7280;font-size:12px;margin:4px 0 10px">A refused request never reaches the Leads page. ` +
      `If the limit or the human check shows up here, someone may have given up — check missed calls and texts.</p>`;
  }
  if (notFound.length) {
    html += `<p style="margin:8px 0 4px;font-size:13px"><b>Pages people could not find, last 7 days</b></p>` +
      notFound.map((f) => {
        const [site, ...rest] = String(f.detail).split(' ');
        return `<div style="font-size:13px;margin-left:10px">${esc(SITES[site] || site)} ${esc(rest.join(' '))} — ${f.n}×${
          f.ref ? ` <span style="color:#6b7280">from ${esc(f.ref)}</span>` : ''}</div>`;
      }).join('') +
      `<p style="color:#6b7280;font-size:12px;margin:4px 0 10px">Fix the link where it comes from, or ask for a redirect.</p>`;
  }
  return html;
}

/** How a 404 is keyed in site_health.detail: "www /old-page.html". */
const notFoundDetail = (nf) => `${nf.site} ${nf.path}`;

module.exports = { notFoundDetail, formFailureReason, reasonWords, cleanNotFound, siteHealthDigestHtml, SITES };
