'use strict';

/* Analytics on the customer's quote page (/q/:code).

   Until October 2026 the quote page loaded no analytics at all: a quote being
   opened, accepted, sent back for changes or paid was invisible in GA4, so ad
   spend could not be tied to quote revenue. The page now loads the site's own
   analytics.js and fires one event for what just happened.

   What just happened is carried by the redirect that lands the customer back
   on the page (?ev=accepted, ?ev=changes, ?ev=paid&v=..&k=..&tx=..). Those
   values come from a URL anyone can type, so every one is checked against a
   fixed shape here and anything else is dropped. A forged one can only add a
   wrong row to analytics, never touch the quote.

   No personal data: the quote code, amounts and a short payment reference. */

const EVENTS = { accepted: 'quote_accepted', changes: 'quote_changes_requested', paid: 'purchase' };
const KINDS = new Set(['deposit', 'balance', 'full']);
const MAX_VALUE = 100000;

/** The redirect query for a confirmed card payment. */
function paidQuery({ amount, kind, sessionId }) {
  const v = Math.round(Number(amount) * 100) / 100;
  const k = KINDS.has(kind) ? kind : 'deposit';
  const tx = String(sessionId || '').replace(/[^A-Za-z0-9]/g, '').slice(-16);
  return `?ev=paid&v=${encodeURIComponent(v)}&k=${k}&tx=${encodeURIComponent(tx)}`;
}

/** The event (if any) a quote-page request should fire. */
function quoteEvent(code, query) {
  const q = query || {};
  const key = String(q.ev || '');
  const name = Object.prototype.hasOwnProperty.call(EVENTS, key) ? EVENTS[key] : null;
  if (!name) return null;
  if (name !== 'purchase') return { once: `${name}_${code}`, name, params: { quote_code: code } };
  const value = Number(q.v);
  const tx = String(q.tx || '');
  if (!Number.isFinite(value) || value <= 0 || value > MAX_VALUE) return null;
  if (!/^[A-Za-z0-9]{1,16}$/.test(tx)) return null;
  const kind = KINDS.has(String(q.k)) ? String(q.k) : 'deposit';
  return {
    once: `purchase_q_${tx}`,
    name,
    params: { transaction_id: `Q-${code}-${tx}`, value: Math.round(value * 100) / 100,
              currency: 'USD', kind, quote_code: code },
  };
}

/* JSON inside a <script> block: escape everything that could end the block or
   open a comment, whatever the input. */
function scriptJson(v) {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** The tags appended to the quote page: analytics.js, then quote_viewed once
 *  per browser per quote, then the redirect's event once. */
function quoteAnalyticsTags(code, query) {
  const ev = quoteEvent(code, query);
  const calls = [`once(${scriptJson(`quote_viewed_${code}`)}, 'quote_viewed', ${scriptJson({ quote_code: code })});`];
  if (ev) calls.push(`once(${scriptJson(ev.once)}, ${scriptJson(ev.name)}, ${scriptJson(ev.params)});`);
  return `<script src="/assets/js/analytics.js"></script>
<script>(function(){
  function once(key, name, params){
    if (!window.jtTrack) return;
    var k = 'jt_ev_' + key;
    try { if (localStorage.getItem(k)) return; } catch (e) {}
    window.jtTrack(name, params);
    try { localStorage.setItem(k, '1'); } catch (e) {}
  }
  ${calls.join('\n  ')}
})();</script>`;
}

module.exports = { quoteEvent, quoteAnalyticsTags, paidQuery, EVENTS };
