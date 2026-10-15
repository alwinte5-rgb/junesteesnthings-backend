/* SINALITE PRODUCTS (owner, 2026-10-14): printed items bought from SinaLite and
 * resold — brochures, labels, stickers, pouches, table covers, X-frames,
 * calendars, mugs, tumblers, bottles.
 *
 * WHERE THE COSTS COME FROM
 *   tools/data/sinalite-costs.json, captured from SinaLite's own site while
 *   logged in (tools/sinalite-capture.js). Each row is one SinaLite quantity
 *   tier: what SinaLite charges and the cheapest shipping to the shop. Their
 *   prices include whatever sale is running, so the file carries the date it
 *   was read and `stale()` says when it is old enough to re-read.
 *
 * THE PRICE RULE (owner, 2026-10-14, the same one tools/add-services.js wrote
 * by hand for the 3,000 brochure run):
 *     supplier cost x2, plus shipping at cost + $25 rounded UP to $5 (never
 *     marked up), divided by the quantity, rounded UP to the cent.
 *
 * WHAT THIS PUBLISHES
 *   Families in the shape tools/lib/sign-families.js signsTable() gives a
 *   STOCK family — sizes x materials -> a [minQty, price each] ladder — so the
 *   quote form's sizer (tools/lib/quote-signs.js) and the designer price them
 *   with code that already exists. Shipping is inside every price, so a
 *   SinaLite family carries no separate freight.
 *
 * MINIMUMS ARE REAL (owner, 2026-10-15): a calendar cannot be bought under 25.
 * A ladder starts at the family's minimum and nothing under it is priced —
 * quote-signs.js refuses it in words, the designer refuses it at the cart.
 */
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'sinalite-costs.json');
const MARKUP = 2;              // the shop's x2 (tools/lib/markup.js)
const SHIP_HANDLING = 25;      // added to shipping before rounding (owner rule)
const STALE_DAYS = 35;         // SinaLite runs monthly sales; re-read after one

const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;
const ceil5 = (n) => Math.ceil(n / 5 - 1e-9) * 5;

/** Shipping as the rule bills it: cost + $25, rounded up to the next $5. */
const shipBilled = (ship) => ceil5((Number(ship) || 0) + SHIP_HANDLING);

/** The price EACH at one SinaLite tier, by the owner rule. */
function priceEach(cost, ship, qty) {
  const c = Number(cost), q = Number(qty);
  if (!(c > 0) || !(q > 0)) return null;
  return ceil2((c * MARKUP + shipBilled(ship)) / q);
}

/**
 * A [minQty, each] ladder from tier rows [{ qty, cost, ship }]. Floor-keyed,
 * as quote-signs.js ladderPrice reads it: a quantity between two tiers pays
 * the lower tier's price each, because the next tier up has not been reached.
 * SinaLite's own table sometimes charges more per piece at a bigger tier; the
 * ladder keeps that tier's real price rather than undercutting its cost.
 */
function ladderFrom(rows, where = 'sinalite') {
  /* A row that cannot be priced is SAID, never skipped quietly: a missing tier
     reads as a gap nobody sees until a job is quoted from the wrong one. */
  const ok = [];
  for (const r of rows || []) {
    /* Shipping too: a missing or negative `ship` would become $0 in
       shipBilled() and quote only the $25 handling (Codex on #293). */
    if (r && Number(r.qty) > 0 && Number(r.cost) > 0 && r.ship !== null && r.ship !== '' &&
        Number.isFinite(Number(r.ship)) && Number(r.ship) >= 0) ok.push(r);
    else console.error('[sinalite] ' + where + ': unpriceable row skipped ' + JSON.stringify(r));
  }
  return ok.sort((a, b) => a.qty - b.qty)
    .map((r) => [Number(r.qty), priceEach(r.cost, r.ship, r.qty)]);
}

/* Re-read when the file changes, so a fresh capture reaches the next quote
   without a restart. A file that cannot be read is reported (and published
   as `error`), not mistaken for "no SinaLite items". */
/**
 * The price EACH for `qty` pieces, from a family's [runQty, each] ladder.
 *
 * SinaLite sells only the quantities in its dropdown (1, 2, 3, 5, 10 table
 * covers; 25, 50, 100 calendars), so a quantity between runs has to be BOUGHT
 * as runs, and the customer pays what those runs cost. Four table covers are
 * a 5-run, not 4 x the 3-run price (Codex on #293: that undercharged
 * $168.10); 3,000 brochures are 2,500 + 500 when that beats a 5,000 run. So:
 * the cheapest set of runs that covers the quantity, each run carrying its
 * own shipping (never under-charges). Null under the minimum or with no ladder.
 */
function eachFor(ladder, qty, anyQty) {
  /* Self-contained: the public quote page runs this same function (sent with
     toString()) for a customer's quantity estimate. */
  const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;
  const q = Math.floor(Number(qty));
  if (!Array.isArray(ladder) || !ladder.length || !(q >= ladder[0][0]) || q > 1e6) return null;
  /* A typed-quantity item (pouches): SinaLite's price for 700 is no more
     than its 1,000 price and no more than 700 at the 500 each — the lower of
     those two totals is never under cost, and 700 never costs more than 1,000. */
  if (anyQty) {
    let below = null, above = null;
    for (const r of ladder) { if (q >= r[0]) below = r; else if (!above) above = r; }
    const t = Math.min(below[1] * q, above ? above[0] * above[1] : Infinity);
    return ceil2(t / q);
  }
  const runs = ladder.map(([n, each]) => [n, n * each]);
  /* Iterative over every remainder (Codex on #293: the recursive version ran
     out of stack near the cap). best[x] = cheapest runs covering x pieces. */
  const best = new Float64Array(q + 1);
  for (let x = 1; x <= q; x++) {
    let m = Infinity;
    for (const [n, total] of runs) { const t = total + best[x > n ? x - n : 0]; if (t < m) m = t; }
    best[x] = m;
  }
  return ceil2(best[q] / q);
}

let cache = null, cacheMtime = null, loadError = null;
function load() {
  let mtime = null;
  try { mtime = fs.statSync(DATA_FILE).mtimeMs; } catch { /* reported below */ }
  if (cache && mtime === cacheMtime) return cache;
  cacheMtime = mtime;
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!d || typeof d.products !== 'object' || !Object.keys(d.products).length) throw new Error('no products in it');
    /* Build every family from it BEFORE it replaces the last good table: a
       product missing its materials must fail here, not in every quote
       request after (Codex on #293). */
    for (const [k, p] of Object.entries(d.products)) {
      if (!p || !Array.isArray(p.materials) || !Array.isArray(p.sizes) || !Array.isArray(p.rows)) throw new Error(k + ' is missing materials, sizes or rows');
      /* Every material x size the item offers must price: a re-capture that
         missed one would otherwise publish an option the quote cannot price
         (Codex on #293). */
      const f = familyOf(k, p);
      for (const m of p.materials) for (const z of p.sizes) {
        if (!(((f.prices[m.key] || {})[z.key] || {})[''] || []).length) throw new Error(k + ' has no prices for ' + m.key + ' / ' + z.key);
      }
    }
    cache = d;
    loadError = null;
  } catch (e) {
    /* Keep the last good table: a half-written or broken file must not turn
       every SinaLite item into an unknown, $0 catalogue row (Codex on #293).
       With no good table ever loaded, the quote save refuses SinaLite rows
       (server.js, by the catalogue's supplier tag). */
    loadError = 'SinaLite prices unreadable (' + DATA_FILE + '): ' + e.message;
    console.error('[sinalite] ' + loadError + (cache && Object.keys(cache.products || {}).length ? ' — still using the last good table' : ''));
    if (!cache) cache = { captured: null, products: {} };
  }
  return cache;
}

/** Days since the costs were read, or null when there are none. */
function ageDays(now = Date.now()) {
  const d = load().captured ? Date.parse(load().captured) : NaN;
  return Number.isFinite(d) ? Math.floor((now - d) / 86400000) : null;
}
const stale = (now) => { const a = ageDays(now); return a === null || a > STALE_DAYS; };

/** One family from one captured product. */
function familyOf(key, p) {
  const prices = {};
  let min = Infinity;
  for (const mat of p.materials) {
    prices[mat.key] = {};
    for (const size of p.sizes) {
      const rows = (p.rows || []).filter((r) => r.mat === mat.key && r.size === size.key);
      const lad = ladderFrom(rows, key + ' ' + mat.key + '/' + size.key);
      if (!lad.length) continue;
      prices[mat.key][size.key] = { '': lad };
      min = Math.min(min, lad[0][0]);
    }
  }
  return {
    label: p.label, note: p.note || '', sizing: 'stock', supplier: 'sinalite',
    group: p.group, design: p.design || null, online: !!p.online,
    /* true: SinaLite takes any quantity (typed box), so a quantity between
       captured tiers pays the tier below's each (each falls as the run grows,
       so that is never under cost). false: set runs only (eachFor). */
    any_qty: !!p.any_qty,
    turnaround: p.turnaround || null, url: p.url || null,
    min: Number.isFinite(min) ? min : null,
    markup: MARKUP, freight: 0, freight_by_size: {},
    materials: p.materials.map((m) => ({ key: m.key, label: m.label })),
    sizes: p.sizes.map((s) => ({ key: s.key, label: s.label, step: 1 })),
    sheet_upgrades: {}, upgrades: [], prices,
  };
}

/** Every SinaLite family, as /api/pricing-rules publishes it under `sinalite`. */
let built = null, builtFrom = null;
function table() {
  const d = load();
  if (!built || builtFrom !== d) {
    const families = {};
    for (const [key, p] of Object.entries(d.products || {})) families[key] = familyOf(key, p);
    built = { families, captured: d.captured || null, ship_to: d.ship_to || null };
    builtFrom = d;
  }
  /* Worked out on every call: a long-running server must start saying
     "stale" the day the prices pass STALE_DAYS, not at its next restart. */
  return { ...built, stale: stale(), ...(loadError ? { error: loadError } : {}) };
}

/* Product name -> family, first match wins. The names are the ones
   tools/add-sinalite-products.js writes, so a quote line finds its ladder. */
function kindOf(name) {
  const n = String(name || '');
  for (const [key, p] of Object.entries(load().products || {})) {
    if (p.name && n.toLowerCase() === String(p.name).toLowerCase()) return key;
  }
  return null;
}

/* Inbound shipping, SinaLite (New York) to the shop, business days. */
const INBOUND_DAYS = [2, 5];

/**
 * [min, max] business days before a SinaLite item is AT THE SHOP: SinaLite's
 * own turnaround ("10 - 12 Business Days", "Next Business Day") plus inbound
 * shipping. Null for a kind that is not SinaLite. An unreadable turnaround
 * fails closed to two weeks, never to "ready tomorrow".
 */
function leadDays(kind) {
  const fam = table().families[kind];
  if (!fam) return null;
  const t = String(fam.turnaround || '');
  const n = (t.match(/\d+/g) || []).map(Number);
  const prod = /next/i.test(t) ? [1, 1] : n.length ? [n[0], n[n.length - 1]] : [10, 10];
  return [prod[0] + INBOUND_DAYS[0], prod[1] + INBOUND_DAYS[1]];
}

/** For tests: swap the data in. */
function _setData(d) { cache = d; cacheMtime = (() => { try { return fs.statSync(DATA_FILE).mtimeMs; } catch { return null; } })(); loadError = null; }

module.exports = { priceEach, shipBilled, ladderFrom, eachFor, leadDays, table, kindOf, ageDays, stale, familyOf, _setData, DATA_FILE, STALE_DAYS };
