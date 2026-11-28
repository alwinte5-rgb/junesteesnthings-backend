'use strict';

/* GOOTEN (print on demand): the API client and every rule that needs no
 * database, so they can be tested directly. Routes, the job card and the
 * hourly check are tools/lib/gooten-orders.js.
 *
 * Sources: Gooten's API docs (gooten.com/api-documentation) and the Postman
 * collection they publish, read 2026-11-25. What they do NOT document, and so
 * is never guessed here:
 *   - the list of item statuses: any word is kept and shown as Gooten says it;
 *   - webhook payloads or a signature: nothing incoming is trusted, the shop
 *     asks Gooten instead (gooten-orders.js sweep);
 *   - whether the estimate's totals are the exact charge: they are shown as an
 *     estimate, and the real charge is read from Gooten's own billing record.
 *
 * The Partner Billing Key spends money. It is only ever sent to api.print.io
 * over HTTPS, never follows a redirect, and never appears in an error. */

const BASE = 'https://api.print.io';
const V5 = '/api/v/5/source/api/';
const CATALOG_URL = 'https://gtnadminassets.blob.core.windows.net/productdatav3/catalog.json';
const SHIP_TYPES = ['standard', 'expedited', 'overnight'];
const MAX_LINES = 20;
const MAX_QTY = 500;
const SKU_RE = /^[A-Za-z0-9][A-Za-z0-9._+&()/ -]{2,119}$/;
/* Gooten prints from pictures; a stitch file or an .ai is not one. */
const PRINT_EXTS = ['png', 'jpg', 'jpeg'];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const text = (v, max) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);

function keys(env = process.env) {
  return { recipe: String(env.GOOTEN_RECIPE_ID || '').trim(), billing: String(env.GOOTEN_PARTNER_BILLING_KEY || '').trim() };
}
/** Both keys present. Without them the feature is off and says so. */
function configured(env = process.env) { const k = keys(env); return !!(k.recipe && k.billing); }
/** Real, charged orders only when the owner sets GOOTEN_LIVE=1. */
function live(env = process.env) { return String(env.GOOTEN_LIVE || '').trim() === '1'; }

class GootenError extends Error {
  /** kind: 'refused' Gooten said no, nothing was made;
   *        'unknown' no clear answer, it may or may not have been made. */
  constructor(message, kind) { super(message); this.name = 'GootenError'; this.kind = kind; }
}

/** Gooten's own words for an error, without our key or what was sent. */
function errorText(body, billing = '') {
  const list = body && Array.isArray(body.Errors) ? body.Errors : [];
  let msg = list.map((e) => [text(e && e.PropertyName, 60), text(e && e.ErrorMessage, 200)].filter(Boolean).join(': '))
    .filter(Boolean).slice(0, 4).join('; ');
  for (const secret of [billing, billing && encodeURIComponent(billing)]) if (secret) msg = msg.split(secret).join('[key]');
  return msg.slice(0, 400);
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Did this submit answer say no, yes or neither? */
function submitOutcome(status, body) {
  const ok = status >= 200 && status < 300;
  /* A refusal only counts from an answer that is one: a 500 (or a conflict,
     timeout or throttle) that says HadError may have made the order first. */
  if (ok && isObj(body) && body.HadError === true) return 'refused';
  if (ok && isObj(body) && typeof body.Id === 'string' && /^[A-Za-z0-9-]{4,100}$/.test(body.Id)) return 'sent';
  /* 4xx is Gooten refusing the request, except the ones that are about the
     connection rather than the order. */
  if (status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status)) return 'refused';
  return 'unknown';
}

/** A refusal because an order with this SourceId already exists: the order is
 *  there, so this is "go and look", never "send another". */
function isDuplicate(body) {
  return !!(body && Array.isArray(body.Errors) && body.Errors.some((e) =>
    /source\s*id/i.test(`${(e && e.PropertyName) || ''} ${(e && e.ErrorMessage) || ''}`)));
}

function client({ env = process.env, fetcher = fetch } = {}) {
  const { recipe, billing } = keys(env);
  async function call(method, path, { query = {}, body, key = false, timeoutMs = 30000 } = {}) {
    if (!recipe || !billing) throw new GootenError('Gooten is not set up on the server.', 'refused');
    const qs = new URLSearchParams({ recipeid: recipe, ...(key ? { partnerBillingKey: billing } : {}), ...query });
    let r;
    try {
      r = await fetcher(`${BASE}${path}?${qs}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      /* fetch's own message can carry the address, and the address the key. */
      throw new GootenError(e && e.name === 'TimeoutError' ? 'Gooten did not answer in time.' : 'Gooten could not be reached.', 'unknown');
    }
    let json = null;
    try { json = await r.json(); } catch { /* not JSON: the status decides */ }
    return { status: r.status, json };
  }
  async function read(method, path, opts) {
    const { status, json } = await call(method, path, opts);
    if (isObj(json) && json.HadError === true) throw new GootenError(errorText(json, billing) || 'Gooten refused that.', 'refused');
    if (status < 200 || status >= 300 || json == null) {
      throw new GootenError(`Gooten answered ${status}${status === 401 || status === 403 ? ': check the two Gooten keys' : ''}.`, 'refused');
    }
    return json;
  }
  return {
    variants: (productId) => read('GET', `${V5}productvariants/`, { query: { productId: String(productId), countryCode: 'US', currencyCode: 'USD' } }),
    outOfStock: (skus, to) => read('POST', '/api/variantstatus', { body: { Skus: skus, CountryCode: 'US', State: to.state, PostalCode: to.zip } }),
    validateAddress: (a) => read('GET', `${V5}addressvalidation/`, { query: {
      line1: a.street1, line2: a.street2 || '', city: a.city, state: a.state, postalCode: a.zip, countryCode: 'US' } }),
    price: (items, to, shipType) => read('POST', `${V5}price`, { body: {
      ShipToAddress: { Line1: to.street1, Line2: to.street2 || '', City: to.city, State: to.state, CountryCode: 'US', PostalCode: to.zip },
      /* Their price page capitalizes the speed; their order page does not. */
      Items: items.map((i) => ({ Quantity: i.qty, SKU: i.sku, ShipType: shipType[0].toUpperCase() + shipType.slice(1) })),
      Payment: { CurrencyCode: 'USD', PartnerBillingKey: billing } } }),
    /** The blank and its print areas for one SKU (Gooten's "product templates"). */
    templates: (sku) => read('GET', `${V5}producttemplates/`, { query: { sku: String(sku) } }),
    order: (id) => read('GET', `${V5}orders/`, { query: { id: String(id) } }),
    billing: (gootenId) => read('GET', `${V5}orderbilling`, { key: true, query: { orderid: String(gootenId) } }),
    search: (sourceId, startDate) => read('GET', `${V5}ordersearch`, { key: true, query: { genericValues: sourceId, startDate, pageSize: '50', page: '1' } }),
    /** { id } when made. Throws GootenError: 'refused' (nothing was made) or
     *  'unknown' (it may have been; never send again without looking). */
    async submit(payload) {
      const { status, json } = await call('POST', `${V5}orders/`, { timeoutMs: 60000,
        body: { ...payload, Payment: { PartnerBillingKey: billing } } });
      const out = submitOutcome(status, json);
      if (out === 'sent') return { id: json.Id };
      if (out === 'refused' && !isDuplicate(json)) throw new GootenError(errorText(json, billing) || `Gooten refused the order (${status}).`, 'refused');
      throw new GootenError(out === 'refused' ? 'Gooten already has an order with this reference.' : `Gooten gave no clear answer (${status}).`, 'unknown');
    },
  };
}

/* ── What staff typed ──────────────────────────────────────────────────── */

/** The artwork a job has that Gooten can print, final art first. Lines name a
 *  file by its address, which must be on this list, so a form can never hand
 *  Gooten one this shop did not store. (Not by place: the list moves when art is
 *  approved or a photo deleted, and the wrong picture would be printed.) */
function artworkChoices({ artFiles = [], photos = [], artOk, photoOk }) {
  const out = [];
  const add = (f, ok, label) => {
    const url = f && typeof f === 'object' ? f.url : f;
    if (typeof url !== 'string' || !ok(url) || out.some((o) => o.url === url)) return;
    if (!PRINT_EXTS.includes(url.split('.').pop().toLowerCase())) return;
    out.push({ url, label: `${label}: ${text(f.name, 80) || url.split('/').pop()}` });
  };
  for (const f of artFiles) add(f, artOk, 'Final art');
  for (const f of photos) add(f, photoOk, 'Customer file');
  return out;
}

/** The form's lines → { items } or { error }. A wholly empty row is skipped;
 *  a half-filled one is refused, never quietly dropped from a paid order. */
function parseLines(body, choices) {
  const col = (k) => [].concat(body && body[k] != null ? body[k] : []).map((v) => String(v).trim());
  const skus = col('sku'), qtys = col('qty'), arts = col('art'), backs = col('art2');
  const rows = Math.max(skus.length, qtys.length, arts.length);
  if (rows > MAX_LINES) return { error: `No more than ${MAX_LINES} lines on one Gooten order.` };
  const pick = (v) => choices.find((c) => c.url === v) || null;
  const items = [];
  for (let i = 0; i < rows; i++) {
    const sku = skus[i] || '', qty = qtys[i] || '', art = arts[i] || '', back = backs[i] || '';
    if (!sku && !qty && !art && !back) continue;
    const at = `Line ${i + 1}: `;
    if (!SKU_RE.test(sku)) return { error: `${at}choose the product and its size and color (or type the SKU exactly as the Gooten page shows it).` };
    if (!/^\d{1,4}$/.test(qty) || Number(qty) < 1 || Number(qty) > MAX_QTY) return { error: `${at}the quantity must be 1 to ${MAX_QTY}.` };
    const front = pick(art);
    if (!front) return { error: `${at}choose the artwork.` };
    const images = [front];
    if (back) {
      const b = pick(back);
      if (!b) return { error: `${at}choose the second artwork again.` };
      images.push(b);
    }
    items.push({ sku, qty: Number(qty), images: images.map((c) => c.url), names: images.map((c) => c.label) });
  }
  return items.length ? { items } : { error: 'Add at least one item.' };
}

/** 'First Last Name' → Gooten's two required fields. */
function splitName(name) {
  const parts = text(name, 80).split(' ').filter(Boolean);
  return { FirstName: parts[0] || 'Customer', LastName: parts.slice(1).join(' ') || parts[0] || 'Customer' };
}

const address = (a, { phone, email }) => ({
  ...splitName(a.name), Line1: a.street1, ...(a.street2 ? { Line2: a.street2 } : {}), City: a.city, State: a.state,
  CountryCode: 'US', PostalCode: a.zip, Phone: String(phone || '').replace(/\D/g, '').slice(-10), Email: email,
});

/** The order as Gooten takes it (the key is added by the client). The shop's
 *  email on both addresses: Gooten never writes to a customer. */
function orderPayload(row, { shop, phone }) {
  const bill = address(shop, shop);
  return {
    /* The customer's phone only on a parcel going to the customer. */
    ShipToAddress: address(row.ship_to, { email: shop.email,
      phone: row.ship_dest === 'customer' && String(phone || '').replace(/\D/g, '').length >= 10 ? phone : shop.phone }),
    BillingAddress: bill,
    Items: row.items.map((it, i) => ({
      Quantity: it.qty, SKU: it.sku, ShipType: row.ship_type, SourceId: `${sourceId(row)}-${i + 1}`,
      Images: it.images.map((Url, n) => ({ Url, Index: n + 1 })),
    })),
    SourceId: sourceId(row), IsPartnerSourceIdUnique: true, IsInTestMode: row.test !== false,
  };
}

/** Our name for the order at Gooten: the same one on every try, which is what
 *  makes a second try unable to make a second order. */
const sourceId = (row) => `JT-${row.quote_code}-${row.id}`;

const amount = (m) => {
  const v = isObj(m) ? m.Price : m;
  /* Number(null) and Number('') are 0, and no figure is not free. */
  if (typeof v !== 'number' && !(typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()))) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
};

/** Gooten's estimate → { items, shipping, total }, or null when it did not
 *  give both figures: no figure is never shown as $0. */
function estimate(p) {
  const items = amount(p && p.ItemsPrice && p.ItemsPrice.ItemsTotalPrice);
  const shipping = amount(p && p.ShippingPrice && p.ShippingPrice.ShippingTotal);
  if (items === null || shipping === null || !(items > 0)) return null;
  return { items, shipping, total: round2(items + shipping) };
}

/** What Gooten actually charged, from its billing record, or null. */
function billed(b) {
  const n = amount(b && b.Result && b.Result.Total);
  return n !== null && n > 0 ? n : null;
}

const safeUrl = (u) => (/^https:\/\/[^\s"'<>]{4,400}$/.test(String(u || '')) ? String(u) : '');

/** Where an order stands, from Gooten's own record. */
function standing(o) {
  const items = (o && Array.isArray(o.Items) ? o.Items : []).map((it) => {
    const ships = [...(Array.isArray(it.Shipments) ? it.Shipments : []), it].filter(Boolean);
    const parcels = new Map();   // every box, each number once
    for (const x of ships) {
      const n = text(x.TrackingNumber, 80);
      if (n && !(parcels.has(n) && parcels.get(n).url)) parcels.set(n, { number: n, url: safeUrl(x.TrackingUrl), carrier: text(x.ShipCarrierName, 60) });
    }
    return { sku: text(it.Sku, 120), status: text(it.Status, 60), parcels: [...parcels.values()] };
  });
  const is = (it, re) => re.test(it.status.replace(/[\s_-]/g, ''));
  const gone = (it) => is(it, /^cancel/i);
  const left = items.filter((it) => !gone(it));
  /* Its status alone: a number exists from the moment a label is printed. */
  const done = (it) => is(it, /^(shipped|delivered)/i);
  return {
    items,
    cancelled: items.length > 0 && !left.length,
    partCancelled: left.length < items.length && left.length > 0,
    problem: left.some((it) => is(it, /issue|hold|needs|error|fail/i)),
    shipped: left.length > 0 && left.every(done),
    tracking: [...new Set(left.flatMap((it) => it.parcels.map((p) => p.number)))],
  };
}

/** Tracking numbers as one line of at most `max`, whole numbers only. */
function trackingLine(numbers, max = 120) {
  let out = '';
  for (const n of numbers) {
    const next = out ? `${out}, ${n}` : n;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/** The order with exactly this SourceId in a search answer, or null. */
function findBySource(res, src) {
  const o = (res && Array.isArray(res.Orders) ? res.Orders : []).find((x) => x && x.SourceId === src);
  return o && typeof o.Id === 'string' && /^[A-Za-z0-9-]{4,100}$/.test(o.Id) ? o : null;
}

/** Every product in Gooten's public catalog, once each, by name. */
function catalogProducts(cat) {
  const seen = new Map();
  const walk = (node, group) => {
    for (const i of (node && Array.isArray(node.items) ? node.items : [])) {
      if (i.type !== 'product') { walk(i, i.name || group); continue; }
      const id = Number(i.product_id);
      if (!Number.isSafeInteger(id) || id < 1 || i.deprecated) continue;
      if (!seen.has(id)) seen.set(id, { id, name: text(i.name, 120), cost: text(i.cheapest_price, 20), ship: text(i.cheapest_shipping, 20), out: !!i.out_of_stock, groups: [] });
      const g = text(group, 60);
      if (g && g !== 'All' && g !== 'Bestsellers' && !seen.get(id).groups.includes(g)) seen.get(id).groups.push(g);
    }
  };
  for (const top of (cat && Array.isArray(cat['product-catalog']) ? cat['product-catalog'] : [])) walk(top, top.name);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/* Gooten's docs name the variant price PriceInfo; PartnerPriceInfo was read
   first and came back empty on all 5,377 live SKUs (2026-11-26). */
const firstAmount = (...ms) => { for (const m of ms) { const a = amount(m); if (a != null) return a; } return null; };

/** The field NAMES a variant answer carries (never values), so a missing
 *  figure can be traced to the field Gooten really uses. */
function variantFields(v) {
  const x = v && Array.isArray(v.ProductVariants) ? v.ProductVariants.find(isObj) : null;
  return x ? Object.keys(x).slice(0, 40).map((k) => text(k, 40)) : [];
}

/** A product's SKUs: { sku, options, cost }. */
function variantRows(v) {
  return (v && Array.isArray(v.ProductVariants) ? v.ProductVariants : []).filter((x) => x && x.Sku).map((x) => ({
    sku: text(x.Sku, 120), cost: firstAmount(x.PartnerPriceInfo, x.PriceInfo, x.Price), images: Number(x.MaxImages) || null,
    options: (Array.isArray(x.Options) ? x.Options : []).map((o) => [text(o.Name, 40), text(o.Value, 60)].filter(Boolean).join(': ')).join(', '),
  }));
}

/* ── Templates (the blank product and where art goes) ─────────────────── */

/* null, '' and booleans are no figure: Number() would make them 0 or 1. */
const num = (v) => ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v)) ? Number(v) : null);
/** Only a plain https picture address is kept: these are drawn on admin pages
 *  and copied into the designer. */
function imageUrl(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s.length > 800 || /[\s"'<>\\]/.test(s)) return '';
  try { const u = new URL(s); return u.protocol === 'https:' && u.hostname ? u.href : ''; } catch { return ''; }
}
function box(o, pre = '') {
  const b = { x1: num(o[`${pre}X1`]), y1: num(o[`${pre}Y1`]), x2: num(o[`${pre}X2`]), y2: num(o[`${pre}Y2`]) };
  return [b.x1, b.y1, b.x2, b.y2].every((n) => n !== null) && b.x2 > b.x1 && b.y2 > b.y1 ? b : null;
}

/** Gooten's template answer, read defensively (null when unreadable): [{ name, isDefault, preview,
 *  spaces: [{ id, name, final, layers: [{ id, type, print, box, z, bg, overlay }] }] }].
 *  A layer of type "Image" is where artwork goes; "Design" layers carry the
 *  blank's pictures (bg under the art, overlay over it). */
function templateOptions(t) {
  /* An answer without an Options list is unreadable, not "no template". */
  if (!t || !Array.isArray(t.Options)) return null;
  const opts = t.Options;
  return opts.filter(isObj).slice(0, 20).map((o) => ({
    name: text(o.Name, 60), isDefault: o.IsDefault === true, preview: imageUrl(o.ImageUrl),
    spaces: (Array.isArray(o.Spaces) ? o.Spaces : []).filter(isObj).slice(0, 20).map((sp) => ({
      id: text(sp.Id, 40), name: text(sp.Description || sp.Name || sp.Id, 60), final: box(sp, 'Final'),
      layers: (Array.isArray(sp.Layers) ? sp.Layers : []).filter(isObj).slice(0, 40).map((l) => ({
        id: text(l.Id, 60), type: text(l.Type, 20), print: l.IncludeInPrint === true, box: box(l), z: num(l.ZIndex),
        bg: imageUrl(l.BackgroundImageUrl), overlay: imageUrl(l.OverlayImageUrl),
      })),
    })),
  }));
}

/** Every SKU of a product as plain rows (the JSON export). */
function variantExport(product, rows, fields = []) {
  return { product: product ? { id: product.id, name: product.name, groups: product.groups, shipFrom: product.ship } : null,
    count: rows.length, fields, variants: rows };
}

module.exports = {
  templateOptions, imageUrl, variantExport, variantFields, SKU_RE,
  CATALOG_URL, SHIP_TYPES, MAX_LINES, MAX_QTY, PRINT_EXTS, GootenError, keys, configured, live, client, errorText,
  submitOutcome, isDuplicate, artworkChoices, parseLines, splitName, orderPayload, sourceId, estimate, billed,
  standing, trackingLine, findBySource, catalogProducts, variantRows,
};
