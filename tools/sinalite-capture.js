/* Read SinaLite's prices into tools/data/sinalite-costs.json.
 *
 * SinaLite shows trade prices only to a logged-in account and has no public
 * price API, so this runs IN THE BROWSER, on a SinaLite product page, in the
 * owner's logged-in session (Claude in Chrome's javascript tool, or the
 * DevTools console). Paste the function, then call it with one product spec:
 *
 *   await slCapture({ key: 'calendar', fixed: { Turnaround: '4 - 6' },
 *     materials: [{ key: '28pg', label: '28 pages', set: { Pages: '28 pg' } }],
 *     sizes: [{ key: '8.5x11', label: '8.5" x 11"', set: { size: '8.5 x 11' } }],
 *     tiers: ['25', '50', '100'] })
 *
 * A page with a typed quantity box (pouches) takes `qtyInput: 'item_qty'`.
 *
 * It returns { rows: [{ mat, size, qty, cost, ship, turnaround }] }, which is
 * pasted into that product's entry in the JSON file. For each tier it:
 *   - sets the page's own option boxes and waits for SinaLite's price to stop
 *     moving (the page updates it a beat after a change, and reading it at
 *     once returns the PREVIOUS combination's price);
 *   - asks SinaLite's own shipping estimate for the shop (Chicago 60657) with
 *     exactly the request the page's "Get a Quote" button sends, and keeps
 *     the cheapest rate;
 *   - waits between requests: SinaLite answers 503 to a fast burst.
 *
 * REGULAR PRICES, NEVER SALE PRICES (owner, 2026-10-15: "those are
 * sinalites sale prices. make sure we are using the real prices and we can
 * put on sale ourselfs as needed"). A sale is SinaLite's, for a limited time;
 * the shop's prices are built on what the job costs without it. On a sale,
 * some pages move window.product.price to the sale figure (roll labels) and
 * some leave it regular (calendars), so the price is read from the page's own
 * "Regular Price" box whenever it shows one. Re-run monthly
 * (tools/lib/sinalite.js marks the file stale after STALE_DAYS).
 */
/* eslint-disable no-undef */
async function slCapture(spec) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sel = (n) => document.querySelector('#productForm select[name="' + n + '"]');
  const pick = async (name, text) => {
    const s = sel(name);
    if (!s) throw new Error('no option box ' + name);
    const o = [...s.options].find((x) => !x.disabled && x.text.trim() === text) ||
      [...s.options].find((x) => !x.disabled && x.text.trim().startsWith(text));
    if (!o) throw new Error(name + ' has no "' + text + '" (has: ' + [...s.options].map((x) => x.text.trim()).join(' / ') + ')');
    if (s.value !== o.value) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); await sleep(500); }
  };
  const settled = async () => {
    let a = window.product.price;
    for (let i = 0; i < 10; i++) { await sleep(200); const b = window.product.price; if (a === b) return Number(a); a = b; }
    throw new Error('price never settled');
  };
  /* The "Regular Price" box beside a sale price. No box (no sale running,
     or a page that only shows "Price") leaves the settled price. A regular
     price below the settled one means the page was misread, so it stops. */
  const regularBox = () => {
    const label = [...document.querySelectorAll('.priceLabel')].find((e) => e.offsetParent && /regular price/i.test(e.textContent));
    const box = label && label.querySelector('.price');
    return box ? box.textContent : null;
  };
  /* The box can update a beat after window.product.price, and showed the
     previous size's price when read at once (code review): read it until two
     reads a second apart agree. */
  const regular = async (settledPrice) => {
    let text = regularBox(), prev = null;
    for (let i = 0; i < 10 && (i < 2 || text !== prev); i++) { await sleep(500); prev = text; text = regularBox(); }
    if (text !== prev) throw new Error('the regular price never settled');
    if (!text) return settledPrice;
    const box = { textContent: text };
    const r = Number(box.textContent.replace(/[$,\s]/g, ''));
    if (!(r > 0) || r + 0.005 < settledPrice) throw new Error('regular price ' + box.textContent + ' unreadable or below ' + settledPrice);
    return r;
  };
  /* Some pages (cut-to-shape decals) have no shipping estimator. Those take
     spec.shipFallback — a measured rate for a parcel of the same size — and
     the row says so (ship_assumed), so it can be re-checked at checkout. */
  const hasEstimator = !!(window.pricingData && window.pricingData.shippingData);
  if (!hasEstimator && spec.shipFallback == null) throw new Error('no shipping estimator on this page; pass shipFallback');
  /* SinaLite's own "Get a Quote" button builds the estimate request — the
     options differ by page type (dropdowns, typed sizes, shape buttons), and
     a request rebuilt by hand gets a 500 on the pages it misreads. So the
     address is filled once, the button is clicked for every tier, and the
     answer is read off the page's own request. */
  let shipReady = false;
  const ship = async () => {
    if (!hasEstimator) return spec.shipFallback;
    const vis = (q) => [...document.querySelectorAll(q)].find((e) => e.offsetParent);
    if (!shipReady) {
      const open = [...document.querySelectorAll('button')].find((b) => /calculate shipping cost/i.test(b.textContent));
      if (open && !vis('.btn-shipping-quote')) { open.click(); await sleep(1500); }
      const region = vis('select[name=region]');
      region.value = [...region.options].find((o) => o.text === 'Illinois').value;
      region.dispatchEvent(new Event('change', { bubbles: true }));
      const city = vis('input[name=city]');
      city.value = 'Chicago'; city.dispatchEvent(new Event('change', { bubbles: true }));
      const zip = vis('input[name=postcode]') || vis('input[name=postal_code]');
      zip.value = '60657'; zip.dispatchEvent(new Event('change', { bubbles: true }));
      if (!window.__slOrigPost) {
        window.__slOrigPost = window.jQuery.post;
        window.jQuery.post = function (u, d, cb) {
          if (!/shipping\/product\/estimate/.test(String(u))) return window.__slOrigPost.apply(this, arguments);
          return window.__slOrigPost.call(this, u, d, function (res) { window.__slShipRes = res; return cb && cb.apply(this, arguments); })
            .fail(function (x) { window.__slShipRes = { failed: x.status }; });
        };
      }
      shipReady = true;
    }
    window.__slShipRes = null;
    vis('.btn-shipping-quote').click();
    for (let i = 0; i < 50 && !window.__slShipRes; i++) await sleep(200);
    const res = window.__slShipRes;
    if (!res) throw new Error('no answer from the shipping estimate');
    if (res.failed) throw new Error('shipping estimate ' + res.failed);
    const rates = (String(res.html || '').match(/\$\s?[\d,]+\.\d\d/g) || []).map((x) => Number(x.replace(/[$,\s]/g, '')));
    if (!rates.length) throw new Error('no shipping rate in the estimate');
    return Math.min(...rates);
  };
  /* Typed sizes and shape buttons, on the "plus" pages (stickers, labels). */
  const typeIn = async (vals) => {
    for (const [n, v] of Object.entries(vals || {})) {
      const radio = document.querySelector('#productForm input[type=radio][name="' + n + '"][value="' + v + '"]');
      if (radio) { radio.click(); await sleep(600); continue; }
      const box = document.querySelector('#productForm input[name="' + n + '"]');
      if (!box) throw new Error('no input ' + n);
      box.value = String(v);
      ['input', 'change', 'keyup', 'blur'].forEach((t) => box.dispatchEvent(new Event(t, { bubbles: true })));
      await sleep(700);
    }
  };
  const qtyName = spec.qtyName || 'qty';
  const rows = [];
  for (const [n, t] of Object.entries(spec.fixed || {})) await pick(n, t);
  for (const mat of spec.materials) {
    for (const size of spec.sizes) {
      for (const [n, t] of Object.entries({ ...(mat.set || {}), ...(size.set || {}) })) await pick(n, t);
      for (const [n, t] of Object.entries(spec.fixed || {})) await pick(n, t);
      await typeIn({ ...(mat.inputs || {}), ...(size.inputs || {}) });
      for (const tier of spec.tiers) {
        if (spec.qtyInput) {
          /* A typed quantity (flexible packaging): the page snaps anything
             under its minimum back up, so a tier it did not keep is skipped. */
          await typeIn({ [spec.qtyInput]: tier });
          await sleep(1500);
          const box = document.querySelector('#productForm input[name="' + spec.qtyInput + '"]');
          if (!box || box.value !== String(tier)) continue;
        } else {
          const qbox = sel(qtyName);
          if (!qbox || ![...qbox.options].some((o) => o.text.trim() === tier)) continue;
          await pick(qtyName, tier);
        }
        if (spec.turnaroundSlowest !== false && sel('Turnaround')) {
          const t = sel('Turnaround');
          const days = (x) => /next/i.test(x) ? 1 : (parseInt(x, 10) || 0);
          const slow = [...t.options].filter((o) => !o.disabled && o.value).sort((a, b) => days(b.text) - days(a.text))[0];
          if (slow && t.value !== slow.value) { t.value = slow.value; t.dispatchEvent(new Event('change', { bubbles: true })); await sleep(500); }
        }
        const cost = await regular(await settled());
        await sleep(spec.pace || 1200);
        const shipping = await ship();
        const ta = sel('Turnaround') || sel('turnaround');
        rows.push({ mat: mat.key, size: size.key, qty: Number(tier), cost, ship: shipping,
          ...(hasEstimator ? {} : { ship_assumed: true }),
          turnaround: ta ? ta.selectedOptions[0].text.trim() : null });
      }
    }
  }
  return { key: spec.key, rows };
}

/* Drinkware (mugs, tumblers, bottles) are Magento pages of another kind: a
 * typed quantity box (custom_qty[<id>]) with a bulk discount and a "Total
 * Cost" box showing the regular and the sale total. Run on the product page:
 *
 *   await dwCapture({ qtySel: 'input[name="custom_qty[711]"]', mat: '1side',
 *     size: '11oz', tiers: [1, 12, 36, 72, 144] })
 *
 * The price includes ONE printed side; the page's "2 sides" option does not
 * move its total, so it is not captured. Shipping comes from the same
 * "Calculate shipping cost" estimate as slCapture. */
async function dwCapture(spec) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (s) => [...document.querySelectorAll(s)].find((e) => e.offsetParent);
  const q = document.querySelector(spec.qtySel);
  if (!q) throw new Error('no quantity box ' + spec.qtySel);
  const regularTotal = () => {
    const e = [...document.querySelectorAll('*')].find((x) => /^Total Cost/.test(x.textContent.trim()) && x.textContent.length < 60);
    const m = e ? e.parentElement.innerText.match(/\$[\d,]+\.\d\d/g) : null;
    /* Regular first, then the sale total when one is running: the FIRST. */
    return m ? Number(m[0].replace(/[$,]/g, '')) : null;
  };
  const open = [...document.querySelectorAll('button')].find((b) => /calculate shipping cost/i.test(b.textContent));
  if (open && !vis('.btn-shipping-quote')) { open.click(); await sleep(1500); }
  const region = vis('select[name=region]');
  region.value = [...region.options].find((o) => o.text === 'Illinois').value;
  region.dispatchEvent(new Event('change', { bubbles: true }));
  const city = vis('input[name=city]'); city.value = 'Chicago'; city.dispatchEvent(new Event('change', { bubbles: true }));
  const zip = vis('input[name=postcode]') || vis('input[name=postal_code]'); zip.value = '60657'; zip.dispatchEvent(new Event('change', { bubbles: true }));
  if (!window.__slOrigPost) {
    window.__slOrigPost = window.jQuery.post;
    window.jQuery.post = function (u, d, cb) {
      if (!/shipping\/product\/estimate/.test(String(u))) return window.__slOrigPost.apply(this, arguments);
      return window.__slOrigPost.call(this, u, d, function (res) { window.__slShipRes = res; return cb && cb.apply(this, arguments); })
        .fail(function (x) { window.__slShipRes = { failed: x.status }; });
    };
  }
  const rows = [];
  for (const n of spec.tiers) {
    q.value = String(n);
    ['input', 'change', 'keyup', 'blur'].forEach((t) => q.dispatchEvent(new Event(t, { bubbles: true })));
    window.jQuery(q).trigger('change').trigger('keyup');
    /* The box answers a beat late, and a fixed wait read the PREVIOUS
       quantity's total (2026-10-15): read until two reads agree. */
    let cost = regularTotal();
    let steady = false;
    for (let i = 0, prev = null; i < 12 && !steady; i++) { await sleep(1000); prev = cost; cost = regularTotal(); steady = i >= 2 && prev === cost; }
    if (!steady) throw new Error('tier ' + n + ': the total never settled');
    window.__slShipRes = null;
    vis('.btn-shipping-quote').click();
    for (let i = 0; i < 60 && !window.__slShipRes; i++) await sleep(250);
    const res = window.__slShipRes;
    const rates = res && !res.failed ? (String(res.html || '').match(/\$\s?[\d,]+\.\d\d/g) || []).map((x) => Number(x.replace(/[$,\s]/g, ''))) : [];
    if (!(cost > 0) || !rates.length) throw new Error('tier ' + n + ': no ' + (cost > 0 ? 'shipping rate' : 'price'));
    rows.push({ mat: spec.mat, size: spec.size, qty: n, cost, ship: Math.min(...rates) });
    await sleep(spec.pace || 1200);
  }
  return { rows };
}

if (typeof module !== 'undefined') module.exports = { slCapture, dwCapture };
