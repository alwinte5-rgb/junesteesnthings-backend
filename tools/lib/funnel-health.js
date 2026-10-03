'use strict';
/*
 * The morning email's watch on the funnel (plan Phase 1f).
 *
 *  - problemLines(): every morning, the customer-facing failures that are not
 *    already their own list — leads waiting over a day, and yesterday's
 *    checkout / upload / AI-design / quote-form errors as the sites report
 *    them to GA4. Joined to the "When something went wrong for a customer"
 *    section from tools/lib/site-health.js.
 *  - funnelHealthHtml(): Mondays, last week against the week before, so a
 *    drop shows within days rather than at the end of the month. A step that
 *    fell by 40% or more (from at least 5) is marked.
 */

const pct = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
const DROP = 0.6, DROP_MIN = 5;

/** Lines for the failures section: [{ text, href? }] (text is plain; the
 *  caller escapes). Empty when nothing went wrong. */
function problemLines({ waiting = [], problems = null, problemNames = [] } = {}) {
  const out = [];
  if (waiting.length) {
    const oldest = waiting[waiting.length - 1];
    const days = Math.max(1, Math.floor((Date.now() - new Date(oldest.created_at)) / 86400000));
    out.push({ text: `${waiting.length} lead${waiting.length === 1 ? '' : 's'} waiting over a day for a reply (oldest ${days} day${days === 1 ? '' : 's'})`,
      href: '/admin/leads' });
  }
  if (problems && problems.ok) {
    for (const [name, label] of problemNames) {
      const n = problems.counts[name] || 0;
      if (n) out.push({ text: `${label} yesterday: ${n}` });
    }
  }
  return out;
}

/**
 * Monday's "Funnel health" table, or ''. ga: weeklyFunnel() result (may be
 * { ok: false }); db: { leads, sent, accepted, orders } each { now, before }.
 */
function funnelHealthHtml({ ga, db, esc }) {
  const rows = [];
  const add = (label, v) => { if (v) rows.push({ label, now: v.now || 0, before: v.before || 0 }); };
  if (ga && ga.ok) {
    const ev = (n) => ga.events[n] || { now: 0, before: 0 };
    add('Visits (both sites)', ga.sessions);
    add('Opened the designer', ev('designer_open'));
    add('Started a design', ev('design_started'));
    add('Added to cart', ev('add_to_cart'));
    add('Reached checkout', ev('begin_checkout'));
    add('Paid online', ev('purchase'));
  }
  if (db) {
    add('Studio orders', db.orders);
    add('Leads in', db.leads);
    add('Quotes sent', db.sent);
    add('Quotes accepted', db.accepted);
  }
  if (!rows.length) return '';
  const cell = 'padding:4px 8px;border-bottom:1px solid #eef1f6;font-size:13px';
  const body = rows.map((r) => {
    const p = pct(r.now, r.before);
    const drop = r.before >= DROP_MIN && r.now <= r.before * DROP;
    const change = p === null ? (r.now ? 'new' : '—') : `${p > 0 ? '+' : ''}${p}%`;
    return `<tr><td style="${cell}">${esc(r.label)}</td><td style="${cell};text-align:right">${r.now}</td>
      <td style="${cell};text-align:right;color:#6b7280">${r.before}</td>
      <td style="${cell};text-align:right;${drop ? 'color:#b91c1c;font-weight:700' : p > 0 ? 'color:#166534' : 'color:#6b7280'}">${drop ? '⚠ ' : ''}${change}</td></tr>`;
  }).join('');
  const gaNote = ga && !ga.ok ? `<p style="color:#6b7280;font-size:12px;margin:4px 0">Website numbers missing: ${esc(ga.reason || 'Google Analytics did not answer')}</p>` : '';
  return `<h3 style="color:#1848B8;margin:20px 0 6px">Funnel health: last week vs the week before</h3>
    <table style="width:100%;border-collapse:collapse"><tr>
      <th style="text-align:left;font-size:12px;color:#6b7280;padding:4px 8px">Step</th>
      <th style="text-align:right;font-size:12px;color:#6b7280;padding:4px 8px">Last week</th>
      <th style="text-align:right;font-size:12px;color:#6b7280;padding:4px 8px">Week before</th>
      <th style="text-align:right;font-size:12px;color:#6b7280;padding:4px 8px">Change</th></tr>${body}</table>${gaNote}
    <p style="color:#6b7280;font-size:12px;margin:4px 0 10px">⚠ marks a step down 40% or more. A drop in one step with the steps before it steady points at that page.</p>`;
}

module.exports = { problemLines, funnelHealthHtml, pct };
