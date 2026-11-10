'use strict';

/* A quote as a sheet of paper (owner, 2026-11-10: "make a quote into a
 * printable invoice for customers needing a paper copy").
 *
 * Titled QUOTE until the customer accepts it and INVOICE after, numbered with
 * the quote code they already know. Opened from the customer's quote page and
 * from the back office (GET /q/:code/print in server.js).
 *
 * server.js builds the model from the same helpers the customer's quote page
 * uses (quoteTotals, customerLineFigures, shownAddons, decorationSummary,
 * balanceOf), so the paper and the screen show the same figures. This file
 * only lays them out. Every value in the model is plain text and is escaped
 * here, in one place; amounts arrive already formatted ("$12.50").
 */

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** The document's heading word and the stamp across it, from the quote's state. */
function docState(m) {
  const title = m.accepted ? 'Invoice' : 'Quote';
  const stamp = m.cancelled ? 'Cancelled' : m.paidInFull ? 'Paid in full' : '';
  return { title, stamp };
}

function lineRows(lines) {
  return (lines || []).map((l) => {
    const extras = [
      l.colour ? `<div class="sub">Color: ${esc(l.colour)}</div>` : '',
      ...(l.deco || []).map((d) => `<div class="sub">&#9656; ${esc(d)}</div>`),
      l.details ? `<div class="sub">${esc(l.details)}</div>` : '',
    ].join('');
    const opt = l.optional ? '<div class="opt">Optional &mdash; not in the total unless chosen</div>' : '';
    const row = `
      <tr class="line${l.optional ? ' optional' : ''}">
        <td>${opt}<div class="item">${esc(l.title)}</div>${extras}</td>
        <td class="num">${esc(l.qty)}</td>
        <td class="num">${esc(l.each)}</td>
        <td class="num">${esc(l.amount)}</td>
      </tr>`;
    const addons = (l.addons || []).map((a) => `
      <tr class="addon${l.optional ? ' optional' : ''}">
        <td>&#8627; ${esc(a.label)}${a.once ? ' <span class="muted">one time</span>' : ''}</td>
        <td class="num">${a.count ? esc(a.count) : ''}</td>
        <td class="num">${a.rate ? esc(a.rate) : ''}</td>
        <td class="num">${esc(a.total)}</td>
      </tr>`).join('');
    return row + addons;
  }).join('');
}

function totalRows(totals) {
  return (totals || []).map((t) => `
      <tr class="t-${esc(t.kind || 'row')}">
        <td colspan="3" class="num">${esc(t.label)}</td>
        <td class="num">${esc(t.amount)}</td>
      </tr>`).join('');
}

/** The whole printable page, as an HTML document. */
function renderQuotePrint(m) {
  const s = m.shop || {};
  const { title, stamp } = docState(m);
  const bill = m.billTo || {};
  const billLines = [bill.name, bill.business, ...(bill.address || []), bill.phone, bill.email].filter(Boolean);
  const dates = (m.dates || []).filter((d) => d && d.value);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} ${esc(m.code)} - ${esc(s.name)}</title>
<style>
  @page{size:letter;margin:0.55in}
  *{box-sizing:border-box}
  body{margin:0;background:#eef1f6;color:#111827;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .sheet{max-width:8.5in;margin:24px auto;background:#fff;padding:0.6in;box-shadow:0 2px 14px rgba(0,0,0,.08);position:relative}
  .bar{max-width:8.5in;margin:16px auto 0;display:flex;gap:10px;flex-wrap:wrap;padding:0 16px}
  .bar button,.bar a{font:600 15px system-ui,sans-serif;padding:10px 20px;border-radius:100px;border:1px solid #0B1F4B;cursor:pointer;text-decoration:none}
  .bar button{background:#0B1F4B;color:#fff}.bar a{background:#fff;color:#0B1F4B}
  .top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;flex-wrap:wrap}
  .shop img{width:170px;height:auto;display:block;margin-bottom:6px}
  .shop div{font-size:13px;color:#374151}
  .doc{text-align:right}
  .doc h1{margin:0;font-size:34px;letter-spacing:.06em;text-transform:uppercase;color:#0B1F4B}
  .doc .no{font-size:15px;font-weight:700;margin-top:2px}
  .doc table{margin:8px 0 0 auto;border-collapse:collapse;font-size:13px}
  .doc td{padding:1px 0 1px 12px}.doc td:first-child{color:#6b7280}
  .stamp{display:inline-block;margin-top:8px;padding:4px 12px;border:2px solid currentColor;border-radius:6px;font-weight:800;
         letter-spacing:.08em;text-transform:uppercase;font-size:13px}
  .stamp.paid{color:#166534}.stamp.cancelled{color:#b91c1c}
  .bill{margin:26px 0 18px;display:flex;gap:40px;flex-wrap:wrap}
  .bill h2{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin:0 0 4px}
  .bill div{font-size:14px}
  table.items{width:100%;border-collapse:collapse}
  table.items th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;text-align:left;
                 border-bottom:2px solid #0B1F4B;padding:6px 6px}
  table.items td{padding:8px 6px;vertical-align:top;border-bottom:1px solid #e5e7eb}
  table.items .num{text-align:right;white-space:nowrap}
  tr.addon td{padding-top:2px;padding-bottom:6px;font-size:13px;color:#4b5563;border-bottom:1px solid #e5e7eb}
  tr.line + tr.addon td{border-top:0}
  .item{font-weight:600}.sub{font-size:12.5px;color:#4b5563;margin-top:2px}
  .opt{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#1848B8;margin-bottom:2px}
  tr.optional td{color:#6b7280}
  .muted{color:#6b7280}
  tbody.totals td{border-bottom:0;padding:4px 6px}
  tbody.totals tr:first-child td{padding-top:12px}
  tr.t-minus td{color:#166534}
  tr.t-total td{font-size:17px;font-weight:800;border-top:2px solid #0B1F4B;padding-top:8px}
  tr.t-due td{font-size:16px;font-weight:800;color:#0B1F4B}
  tr.t-note td{color:#6b7280;font-size:12.5px}
  .notes{margin-top:18px;font-size:13px;color:#374151;white-space:pre-wrap}
  .warn{margin-top:14px;padding:8px 12px;border:1px solid #f59e0b;border-radius:8px;background:#fffbeb;font-size:13px}
  .pay{margin-top:22px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:13px;color:#374151}
  .pay h2{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin:0 0 6px}
  .pay ul{margin:0;padding-left:18px}
  .thanks{margin-top:18px;text-align:center;font-size:13px;color:#6b7280}
  @media (max-width:640px){
    .sheet{margin:12px 0;padding:20px 16px;box-shadow:none}
    .doc{text-align:left}.doc table{margin-left:0}.doc td{padding:1px 12px 1px 0}
    table.items{font-size:13px}
  }
  @media print{
    body{background:#fff}
    .bar{display:none}
    .sheet{margin:0;padding:0;box-shadow:none;max-width:none}
    tr{break-inside:avoid}
  }
</style></head><body>
<div class="bar">
  <button type="button" onclick="window.print()">Print or save as PDF</button>
  ${m.backUrl ? `<a href="${esc(m.backUrl)}">${esc(m.backLabel || 'Back')}</a>` : ''}
</div>
<div class="sheet">
  <div class="top">
    <div class="shop">
      ${s.logo ? `<img src="${esc(s.logo)}" alt="${esc(s.name)}">` : ''}
      <div><b>${esc(s.name)}</b></div>
      ${[s.address, s.phone, s.email, s.web].filter(Boolean).map((x) => `<div>${esc(x)}</div>`).join('')}
    </div>
    <div class="doc">
      <h1>${esc(title)}</h1>
      <div class="no">#${esc(m.code)}</div>
      ${dates.length ? `<table>${dates.map((d) => `<tr><td>${esc(d.label)}</td><td>${esc(d.value)}</td></tr>`).join('')}</table>` : ''}
      ${stamp ? `<div class="stamp ${m.cancelled ? 'cancelled' : 'paid'}">${esc(stamp)}</div>` : ''}
    </div>
  </div>

  <div class="bill">
    ${billLines.length ? `<div><h2>${m.accepted ? 'Bill to' : 'Prepared for'}</h2>${billLines.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
    ${m.shipTo && m.shipTo.length ? `<div><h2>Ship to</h2>${m.shipTo.map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
  </div>

  <table class="items">
    <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Each</th><th class="num">Amount</th></tr></thead>
    <tbody>${lineRows(m.lines)}</tbody>
    <tbody class="totals">${totalRows(m.totals)}</tbody>
  </table>

  ${m.pendingChange ? `<div class="warn">A change to this order is with ${esc(s.signer || 'us')}. These figures may change once it is confirmed.</div>` : ''}
  ${m.notes ? `<div class="notes">${esc(m.notes)}</div>` : ''}

  ${(m.payHow || []).length ? `<div class="pay"><h2>How to pay</h2><ul>${m.payHow.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
  <div class="thanks">Thank you for your business!</div>
</div>
</body></html>`;
}

module.exports = { renderQuotePrint, docState, esc };
