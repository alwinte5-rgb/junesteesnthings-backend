/* SINALITE PRODUCTS (owner, 2026-10-14): printed items bought from SinaLite and
 * resold — brochures, labels, stickers, pouches, table covers, X-frames,
 * calendars, mugs, tumblers, bottles.
 *
 * WHERE THE COSTS COME FROM
 *   tools/data/sinalite-costs.json, captured from SinaLite's own site while
 *   logged in (tools/sinalite-capture.js). Each row is one SinaLite quantity
 *   tier: what SinaLite charges and the cheapest shipping to the shop, at its
 *   REGULAR price, never a sale price (owner, 2026-10-15 and 2026-10-20).
 *
 *   FIXED PRICES (owner, 2026-10-20: "keep a constant price on sinalite").
 *   Regular prices do not end with a sale, so they never go stale by age:
 *   they change only when the owner has them re-read. `stale()` is true only
 *   when there is no table at all. Until SinaLite opens its API, a monthly
 *   reminder in the daily summary asks the owner to check (server.js,
 *   sinaliteApiReminder).
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

const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;
const ceil5 = (n) => Math.ceil(n / 5 - 1e-9) * 5;

/** Shipping as the rule bills it: cost + $25, rounded up to the next $5. */
const shipBilled = (ship) => ceil5((Number(ship) || 0) + SHIP_HANDLING);

/** The price EACH at one SinaLite tier, by the owner rule. `designIn` is a
 *  flat design charge carried inside the run's price (labels and stickers,
 *  $25, owner 2026-10-20), so it is never a separate line. */
function priceEach(cost, ship, qty, designIn = 0) {
  const c = Number(cost), q = Number(qty);
  if (!(c > 0) || !(q > 0)) return null;
  return ceil2((c * MARKUP + shipBilled(ship) + (Number(designIn) || 0)) / q);
}

/**
 * A [minQty, each] ladder from tier rows [{ qty, cost, ship }]. Floor-keyed,
 * as quote-signs.js ladderPrice reads it: a quantity between two tiers pays
 * the lower tier's price each, because the next tier up has not been reached.
 * SinaLite's own table sometimes charges more per piece at a bigger tier; the
 * ladder keeps that tier's real price rather than undercutting its cost.
 */
function ladderFrom(rows, where = 'sinalite', designIn = 0) {
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
    .map((r) => [Number(r.qty), priceEach(r.cost, r.ship, r.qty, designIn)]);
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
function eachFor(ladder, qty, anyQty, designIn) {
  /* Self-contained: the public quote page runs this same function (sent with
     toString()) for a customer's quantity estimate. */
  const ceil2 = (n) => Math.ceil(n * 100 - 1e-9) / 100;
  /* designIn: a flat design charge inside every run's price (stickers, $25).
     Charged once per order, never once per run (code review): taken out of
     each run before runs are combined, and added back once. */
  const d = Number(designIn) || 0;
  const q = Math.floor(Number(qty));
  /* 100,000: the same ceiling /admin/api/sign-price refuses above, so the
     preview and the save can never price one quantity two ways. */
  if (!Array.isArray(ladder) || !ladder.length || !(q >= ladder[0][0]) || q > 100000) return null;
  /* A typed-quantity item (pouches): SinaLite's price for 700 is no more
     than its 1,000 price and no more than 700 at the 500 each — the lower of
     those two totals is never under cost, and 700 never costs more than 1,000. */
  if (anyQty) {
    let below = null, above = null;
    for (const r of ladder) { if (q >= r[0]) below = r; else if (!above) above = r; }
    const t = Math.min(below[1] * q, above ? above[0] * above[1] : Infinity);
    return ceil2(t / q);
  }
  const runs = ladder.map(([n, each]) => [n, n * each - d]);
  /* Iterative over every remainder (Codex on #293: the recursive version ran
     out of stack near the cap). best[x] = cheapest runs covering x pieces. */
  const best = new Float64Array(q + 1);
  for (let x = 1; x <= q; x++) {
    let m = Infinity;
    for (const [n, total] of runs) { const t = total + best[x > n ? x - n : 0]; if (t < m) m = t; }
    best[x] = m;
  }
  return ceil2((best[q] + d) / q);
}

let cache = null, cacheMtime = null, loadError = null;
let checkedAt = 0;
function load() {
  /* The file is looked at most once a second: kindOf() runs for every
     catalogue product on each quote-form render (code review, 2026-10-15). */
  if (cache && Date.now() - checkedAt < 1000) return cache;
  checkedAt = Date.now();
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
    /* Published (pricing-rules, the digest) without the server's file path;
       the log keeps the full detail. */
    loadError = 'SinaLite prices unreadable: ' + e.message;
    console.error('[sinalite] ' + DATA_FILE + ': ' + loadError + (cache && Object.keys(cache.products || {}).length ? ' — still using the last good table' : ''));
    if (!cache) cache = { captured: null, products: {} };
  }
  return cache;
}

/** Days since the costs were read, or null when there are none. */
function ageDays(now = Date.now()) {
  const d = load().captured ? Date.parse(load().captured) : NaN;
  return Number.isFinite(d) ? Math.floor((now - d) / 86400000) : null;
}
const stale = (now) => ageDays(now) === null;

/** One family from one captured product. */
function familyOf(key, p) {
  const prices = {};
  let min = Infinity;
  const runs = new Set();
  for (const mat of p.materials) {
    prices[mat.key] = {};
    for (const size of p.sizes) {
      const rows = (p.rows || []).filter((r) => r.mat === mat.key && r.size === size.key);
      const lad = ladderFrom(rows, key + ' ' + mat.key + '/' + size.key, p.design_in);
      if (!lad.length) continue;
      prices[mat.key][size.key] = { '': lad };
      min = Math.min(min, lad[0][0]);
      for (const [q] of lad) runs.add(q);
    }
  }
  return {
    label: p.label, note: p.note || '', sizing: 'stock', supplier: 'sinalite',
    group: p.group, design: p.design || null, online: !!p.online,
    /* Design charge already inside every run price (priceEach). */
    design_in: Number(p.design_in) || 0,
    /* true: SinaLite takes any quantity (typed box), so a quantity between
       captured tiers pays the tier below's each (each falls as the run grows,
       so that is never under cost). false: set runs only (eachFor). */
    any_qty: !!p.any_qty,
    turnaround: p.turnaround || null, url: p.url || null,
    min: Number.isFinite(min) ? min : null,
    /* Every quantity SinaLite sells (or prices) this item at, for the sizer. */
    runs: [...runs].sort((a, b) => a - b),
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
  /* Worked out on every call, so a table that goes missing says so at once. */
  return { ...built, stale: stale(), ...(loadError ? { error: loadError } : {}) };
}

/* Product name -> family, first match wins. The names are the ones
   tools/add-sinalite-products.js writes, so a quote line finds its ladder. */
function kindOf(name, { aliases = false } = {}) {
  const n = String(name || '');
  for (const [key, p] of Object.entries(load().products || {})) {
    /* Former names count only for a row already tagged supplier='sinalite'
       (server.js sizedKindOf): any other product under a retired name must not
       be priced off a SinaLite ladder (code review on #296). */
    const names = [p.name, ...(aliases && Array.isArray(p.aliases) ? p.aliases : [])].filter(Boolean);
    if (names.some((x) => n.toLowerCase() === String(x).toLowerCase())) return key;
  }
  return null;
}

/* The largest quantity any sized line is priced at (quote-signs.js MAX_QTY
   is this). eachFor() repeats the literal because it is sent to the browser
   as source; a test holds the two together. */
const MAX_QTY = 100000;

/* Inbound shipping, SinaLite (New York) to the shop, business days. */
const INBOUND_DAYS = [2, 5];
/* A saved SinaLite line whose family the table does not have right now (no
   table on a cold start, a family dropped): the slowest lead any SinaLite item
   has (pouches, 10-12 days + inbound), never the in-house window. */
const FALLBACK_LEAD = [12, 17];

/**
 * [min, max] business days before a SinaLite item is AT THE SHOP: SinaLite's
 * own turnaround ("10 - 12 Business Days", "Next Business Day") plus inbound
 * shipping. Null for a kind that is not SinaLite. An unreadable turnaround
 * fails closed to two weeks, never to "ready tomorrow".
 */
function leadDays(kind) {
  const fam = table().families[kind];
  if (!fam) return null;  // not a SinaLite kind here; deliveryEstimate decides (FALLBACK_LEAD)
  const t = String(fam.turnaround || '');
  const n = (t.match(/\d+/g) || []).map(Number);
  const prod = /next/i.test(t) ? [1, 1] : n.length ? [n[0], n[n.length - 1]] : [10, 10];
  return [prod[0] + INBOUND_DAYS[0], prod[1] + INBOUND_DAYS[1]];
}

/** For tests: swap the data in. */
/** For tests: look at the file again on the next call. */
function _recheck() { checkedAt = 0; }

function _setData(d) { checkedAt = 0; cache = d; cacheMtime = (() => { try { return fs.statSync(DATA_FILE).mtimeMs; } catch { return null; } })(); loadError = null; }

module.exports = { _recheck, priceEach, shipBilled, ladderFrom, eachFor, leadDays, FALLBACK_LEAD, MAX_QTY, table, kindOf, ageDays, stale, familyOf, _setData, DATA_FILE };
