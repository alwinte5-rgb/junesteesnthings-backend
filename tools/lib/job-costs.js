'use strict';

/* What a job cost to make, worked out from the price lists we already hold.
 *
 * Why this exists (the owner, 2026-10-02: "why isn't job costs inserted ... fill
 * in the costs of each job"). Every job's cost was a box someone had to type
 * into, line by line, from the supplier's invoice. Nobody did, so Finances
 * showed sales with no costs against them and a profit that was really just the
 * sales again. Everything needed to work the cost out is already here:
 *
 *   - the garment: each catalogue product carries its S&S cost
 *     (`supplier_cost`, sold at x2 by tools/lib/markup.js);
 *   - screen print and DTF: Anchorfish's 2026 contract sheets, the same numbers
 *     tools/reprice-anchorfish-2026.js prices the store from (tests/job-costs
 *     fails if the two drift apart);
 *   - screens: $20 each from Anchorfish (invoice #16899);
 *   - embroidery is sewn in house, so there is no bill: the owner chose
 *     Anchorfish's embroidery sheet as the cost (2026-10-02), a cautious figure;
 *   - cutouts, buttons, signs and anything else priced as the shop's x2 on its
 *     cost: half the price, marked "rough".
 *
 * An estimate is marked as one on every line it fills, so the job page and
 * Finances can say so, and a figure typed from the real invoice replaces it.
 * A job is only filled when EVERY line it bought can be worked out: a job half
 * costed would read as fully costed and overstate the margin, which is the
 * failure this exists to fix. Those jobs are listed instead, with why.
 *
 * Pure functions only: the caller passes the catalogue and the quote's lines. */

/* Anchorfish 2026, what they charge US. Keys are quantity FLOORS. */
const SCREEN_PRINT = {          // per piece, per location, by ink colours 1..6
    50: [1.80, 2.25, 2.72, 3.19, 3.66, 4.13],
   100: [1.65, 2.06, 2.53, 3.00, 3.47, 3.94],
   250: [1.47, 1.84, 2.31, 2.78, 3.25, 3.72],
   500: [1.32, 1.65, 2.12, 2.59, 3.06, 3.53],
  1000: [1.17, 1.46, 1.93, 2.40, 2.87, 3.34],
  2500: [0.99, 1.24, 1.71, 2.18, 2.65, 3.12],
};
const SCREEN_MIN_QTY = 50;      // their contract minimum: under it they bill 50
const SCREEN_COST = 20;         // per screen
const SCREEN_FEE = 25;          // what a screen is billed at (server.js SCREEN_FEE_RATE)
const DTF = {                   // [16sq, 132sq (the standard print), 252sq, additional location]
     1: [5.00, 7.03, 9.38, 1.80],
     4: [5.00, 7.03, 9.38, 1.80],
    12: [3.23, 5.63, 7.50, 1.80],
    25: [2.58, 4.50, 6.00, 1.50],
    50: [2.73, 3.60, 4.80, 1.50],
   100: [1.65, 3.06, 4.08, 1.35],
   250: [1.47, 2.60, 3.47, 1.20],
   500: [1.32, 2.21, 2.95, 1.11],
  1000: [1.17, 1.88, 2.51, 1.05],
  2500: [0.99, 1.60, 2.13, 1.02],
};
/* [0-8k, 8k-10k, 10k-14k, 14k-18k, 20k-22k, 22k-25k, puff, small name, large name] */
const EMBROIDERY = {
    1: [4.25, 6.25, 8.25, 10.25, 12.25, 14.25, 1.50, 2, 5],
   12: [4.25, 6.25, 8.25, 10.25, 12.25, 14.25, 1.50, 2, 5],
   25: [3.85, 5.85, 7.85,  9.85, 11.85, 13.85, 1.50, 2, 5],
   50: [3.25, 5.25, 7.25,  9.25, 11.25, 13.25, 1.25, 2, 5],
   75: [3.25, 5.20, 7.20,  9.15, 11.15, 13.15, 1.25, 2, 5],
  100: [3.25, 5.15, 7.15,  9.05, 11.05, 13.05, 1.25, 2, 5],
  150: [3.25, 5.15, 7.15,  9.05, 11.05, 13.05, 1.25, 2, 5],
};
/* The shop's x2 (tools/lib/markup.js): cost is half the price where no sheet says otherwise. */
const SHOP_MARKUP = 2;

/* Labour and design work cost the shop no supplier money. Same words the cost
   form already treats as a service (server.js COST_SERVICE_WORDS). */
const SERVICE_WORDS = /\b(digitiz\w*|stitch\w*|setup|set\s*up|design\w*|artwork|fees?|rush|shipping|delivery|labou?r|vector\w*|proof\w*)\b/i;

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function rowAt(table, qty) {
  const floors = Object.keys(table).map(Number).sort((a, b) => a - b);
  let row = table[floors[0]];
  for (const f of floors) if (qty >= f) row = table[f];
  return row;
}

function colourCount(method, picked) {
  if (method && method.type === 'color') return Math.max(1, parseInt(picked, 10) || 1);
  return Math.max(1, parseInt((String((method && method.title) || '').match(/(\d+)\s*Colou?r/i) || [0, 1])[1], 10) || 1);
}

/** Which price list a decoration method is costed from. */
function methodKind(method) {
  const t = String((method && method.title) || '');
  if (/screen\s*print/i.test(t)) return 'screen';
  if (/\bdtf\b/i.test(t) || /^printing$/i.test(t.trim())) return 'dtf';
  if (/digitiz/i.test(t)) return 'digitizing';
  if (/embroider/i.test(t)) return 'embroidery';
  return 'rough';
}

/* Which column of the embroidery sheet a method is. */
function embroideryColumn(title) {
  const t = String(title || '');
  if (/name|text/i.test(t)) return /upper|back/i.test(t) ? 8 : 7;
  if (/extra\s*large/i.test(t)) return 4;
  if (/full\s*back/i.test(t)) return 5;
  if (/large/i.test(t)) return 2;
  if (/medium/i.test(t)) return 1;
  return 0;
}

/** One decoration's cost per piece. `sellEach` is what it was billed at per
 *  piece, used only where no sheet exists (rough: half of it). */
function decorationEach(method, stage, colours, bandQty, sellEach) {
  if (!method) return { each: 0, basis: null };
  const kind = methodKind(method);
  const locs = stage === 'both' ? 2 : 1;
  if (kind === 'screen') {
    const c = Math.min(6, colourCount(method, colours));
    const row = rowAt(SCREEN_PRINT, Math.max(bandQty, SCREEN_MIN_QTY));
    let each = row[c - 1] * locs;
    if (bandQty > 0 && bandQty < SCREEN_MIN_QTY) each = each * SCREEN_MIN_QTY / bandQty;
    return { each, basis: 'Anchorfish screen print' };
  }
  if (kind === 'dtf') {
    const row = rowAt(DTF, Math.max(1, bandQty));
    return { each: row[1] + (locs === 2 ? row[3] : 0), basis: 'Anchorfish DTF' };
  }
  if (kind === 'embroidery') {
    const row = rowAt(EMBROIDERY, Math.max(1, bandQty));
    return { each: row[embroideryColumn(method.title)] * locs, basis: 'Anchorfish embroidery rate' };
  }
  if (kind === 'digitizing') return { each: num(sellEach), basis: 'digitizing at the vendor rate' };
  return { each: num(sellEach) / SHOP_MARKUP, basis: 'rough: half the price' };
}

/* Where a line is printed, as [{ loc, method, colours }]. A line saved since
   2026-10-06 carries `prints`; an older one is read from its placement fields
   (front/back/both, the back's own count, sleeves, a second method). `gone` is
   true when the line names a method the catalogue no longer has. */
function linePlaces(it, methods) {
  const get = (id) => (id != null && id !== '' ? methods.get(Number(id)) || null : null);
  const out = [];
  let gone = false;
  if (Array.isArray(it.prints)) {
    for (const p of it.prints) {
      const m = get(p && p.method_id);
      if (!m) { gone = true; continue; }
      out.push({ loc: p.loc, method: m, colours: p.colours });
    }
    return { places: out, gone };
  }
  const has = (v) => v !== undefined && v !== null && v !== '';
  const add = (m, stage, c, back) => {
    if (!m) return;
    if (stage === 'both') { out.push({ loc: 'front', method: m, colours: c }); out.push({ loc: 'back', method: m, colours: has(back) ? back : c }); }
    else out.push({ loc: stage && stage !== 'front' ? 'back' : 'front', method: m, colours: c });
  };
  const m1 = get(it.method_id), m2 = get(it.method2_id);
  if ((it.method_id != null && !m1) || (it.method2_id != null && !m2)) gone = true;
  add(m1, it.stage, it.colours, it.back_colours);
  if (m1) {
    const sc = has(it.sleeve_colours) ? it.sleeve_colours : it.colours;
    if (it.sleeves === 'left' || it.sleeves === 'both') out.push({ loc: 'left', method: m1, colours: sc });
    if (it.sleeves === 'right' || it.sleeves === 'both') out.push({ loc: 'right', method: m1, colours: sc });
  }
  add(m2, it.stage2, it.colours2 != null ? it.colours2 : it.colours, null);
  return { places: out, gone };
}

/* The decoration's cost for every place printed: screen and embroidery are
   one run per place; DTF is the front rate for a method's first place and its
   second-location rate for each one after; anything costed off the sell price
   is costed once per method, its share of the decoration billed. */
function placesCost(places, bandQty, decoSellEach, dark = false) {
  const groups = [];
  for (const p of places) {
    let g = groups.find((x) => x.method === p.method);
    if (!g) groups.push(g = { method: p.method, places: [] });
    g.places.push(p);
  }
  const share = groups.length > 1 ? 1 / groups.length : 1;
  let each = 0;
  const basis = [];
  for (const g of groups) {
    const kind = methodKind(g.method);
    if (kind === 'screen' || kind === 'embroidery' || kind === 'dtf') {
      g.places.forEach((p, k) => {
        /* On a dark garment Anchorfish bills the white BASE as a colour on
           every piece: a 1-colour white print is their "2 Color" rate
           (invoices #16899, #18249). Screen printing only. */
        const c = kind === 'screen' && dark ? (parseInt(p.colours, 10) > 0 ? parseInt(p.colours, 10) : 1) + 1 : p.colours;
        const one = decorationEach(g.method, '', c, bandQty, 0);
        const extra = kind === 'dtf' && k > 0
          ? decorationEach(g.method, 'both', c, bandQty, 0).each - one.each : one.each;
        each += extra;
        if (one.basis && !basis.includes(one.basis)) basis.push(one.basis);
      });
    } else {
      const d = decorationEach(g.method, '', g.places[0].colours, bandQty, decoSellEach * share);
      each += d.each;
      if (d.basis && !basis.includes(d.basis)) basis.push(d.basis);
    }
  }
  return { each, basis };
}

/* What add-ons cost us, split by where the books keep it. */
function addonCosts(addons) {
  let outsourced = 0, shipping = 0, perLine = 0;
  for (const a of addons || []) {
    if (!a) continue;
    const total = num(a.total);
    switch (a.code) {
      case 'screens': {
        const count = a.count != null ? num(a.count) : total / SCREEN_FEE;
        outsourced += count * SCREEN_COST; break;
      }
      case 'digitizing': case 'unbagging': outsourced += total; break;
      case 'specialty_ink': perLine += total / SHOP_MARKUP; break;
      case 'cutout_ship': case 'cutout_ship_sat': case 'cutout_ship_large': shipping += total; break;
      default: break;   // design work and puff/hoop are handled as labour or with the embroidery
    }
  }
  return { outsourced, shipping, perLine };
}

/* ── Lines typed by hand ─────────────────────────────────────────────────
   A line written into the quote rather than picked from the catalogue has no
   product or method to read, only its words and its price: "Comfort Colors
   T-shirt - Navy Blue", "Embroidery Chest Logo", "2XL Upcharge", "24x18 Yard
   Signs - 100 pack". The words name the garment and the decoration well enough
   to cost them from the same sheets; whatever they do not name is costed at half
   what it was sold for (the shop's x2), and every such line says "rough". */
const GARMENT_WORDS = [
  ['hoodie', /\b(hood(ie|ed)?|pullover)\b/i],
  ['sweatshirt', /\b(sweat\s*shirt|crew\s*neck|crewneck|fleece)\b/i],
  ['polo', /\bpolos?\b/i],
  ['tank', /\btanks?\b/i],
  ['long sleeve', /\blong\s*sleeve\b/i],
  ['tee', /\b(t-?shirts?|tees?|shirts?)\b/i],
];
const STOP = new Set(['the', 'and', 'for', 'with', 'bulk', 'custom', 'print', 'printed', 'shirt', 'shirts', 'tee', 'tees', 't', 'pack', 'pair',
  'black', 'white', 'navy', 'blue', 'red', 'green', 'grey', 'gray', 'pink', 'purple', 'orange', 'yellow', 'gold', 'maroon', 'royal', 'heather']);
const words = (t) => String(t || '').toLowerCase().replace(/t-shirt/g, 'tshirt').split(/[^a-z0-9]+/).filter((x) => x.length > 1);

/** The catalogue garment a description names, or null. Needs the garment type
 *  in both; brand and age words ("comfort colors", "toddler") pick between
 *  candidates, and a tie goes to the cheaper blank. */
function garmentFromWords(desc, products) {
  const kind = GARMENT_WORDS.find(([, re]) => re.test(desc));
  if (!kind) return null;
  const want = words(desc).filter((x) => !STOP.has(x));
  let best = null;
  for (const p of products || []) {
    if (!(num(p.cost) > 0 && num(p.price) > 0)) continue;
    const name = String(p.name || '');
    if (!kind[1].test(name)) continue;
    const have = new Set(words(name));
    const score = want.filter((x) => have.has(x)).length;
    /* An age word in the description must be in the product, and one in the
       product must be in the description: a toddler tee is not an adult one. */
    const ages = ['toddler', 'youth', 'infant', 'baby', 'kids', 'ladies', 'womens', 'women'];
    if (ages.some((a) => want.includes(a) !== have.has(a))) continue;
    if (!best || score > best.score || (score === best.score && num(p.cost) < num(best.p.cost))) best = { p, score };
  }
  return best ? best.p : null;
}

/** A decoration a description names, as a method-like object for decorationEach. */
function decorationFromWords(desc) {
  const t = String(desc || '');
  if (/embroider/i.test(t)) {
    const size = /full\s*back/i.test(t) ? 'Full Back' : /extra\s*large/i.test(t) ? 'Extra Large Logo'
      : /large/i.test(t) ? 'Large Logo' : /medium/i.test(t) ? 'Medium Logo'
      : /name|text/i.test(t) ? 'Name/Text' : 'Small Logo';
    return { title: `Embroidery — ${size}`, type: 'fixed' };
  }
  if (/\bdtf\b|direct\s*to\s*film/i.test(t)) return { title: 'DTF Printing', type: 'fixed' };
  if (/screen\s*print/i.test(t)) {
    const c = (t.match(/(\d)\s*-?\s*colou?r/i) || [])[1];
    return { title: `Screen Printing — ${c || 1} Color`, type: 'fixed' };
  }
  return null;
}

/** Cost of a hand-typed line from its words, or null when there is nothing to go on. */
function fromWording(it, catalog, bandQty) {
  const desc = `${it.description || ''} ${it.details || ''}`;
  const qty = parseInt(it.qty, 10) || 0;
  const sell = num(it.unit_price);
  const g = garmentFromWords(desc, catalog && catalog.products);
  const deco = decorationFromWords(desc);
  const stage = /front\s*(and|&|\+)\s*back|both\s*sides|2-?\s*sided|two[-\s]sided/i.test(desc) ? 'both' : null;
  const garmentEach = g ? num(g.cost) : 0;
  const garmentSell = g ? num(g.price) : 0;
  const parts = [];
  if (g) parts.push(`S&S cost of ${g.name} (matched by wording)`);
  let decoEach = 0;
  if (deco) {
    const d = decorationEach(deco, stage, 1, Math.max(bandQty, qty), 0);
    decoEach = d.each;
    parts.push(`${d.basis} (matched by wording)`);
  } else if (sell > garmentSell) {
    /* Whatever the words do not name — the print on a typed shirt line, a sign,
       an upcharge — at half its price. */
    decoEach = (sell - garmentSell) / SHOP_MARKUP;
    parts.push('rough: half the price');
  }
  if (!g && !deco && !(sell > 0)) return null;
  return { each: garmentEach + decoEach, basis: parts.join(' + ') };
}

/**
 * Estimate a job's costs.
 *   items:   the quote's lines (accepted: optional ones already resolved)
 *   catalog: { products: [{id, price, cost}], methods: [{id, title, type}] }
 * Returns { complete, lines: [{ ix, unit_cost, basis, estimated }], outsourced, shipping,
 *           missing: [description] }. Lines that already carry a cost keep it.
 */
function estimateJob(items, catalog) {
  const list = Array.isArray(items) ? items : [];
  const products = new Map(((catalog && catalog.products) || []).map((p) => [Number(p.id), p]));
  const methods = new Map(((catalog && catalog.methods) || []).map((m) => [Number(m.id), m]));
  const pooled = {};
  for (const it of list) {
    const g = it && it.run_group != null ? String(it.run_group).trim() : '';
    if (g) pooled[g] = (pooled[g] || 0) + (parseInt(it.qty, 10) || 0);
  }
  const out = { complete: true, lines: [], outsourced: 0, shipping: 0, missing: [] };

  list.forEach((it, ix) => {
    if (!it || it.optional) return;                        // declined, never bought
    const qty = parseInt(it.qty, 10) || 0;
    if (qty <= 0) return;
    const g = it.run_group != null ? String(it.run_group).trim() : '';
    const bandQty = Math.max(qty, g ? pooled[g] || 0 : 0);
    const prod = it.product_id != null ? products.get(Number(it.product_id)) : null;
    const { places, gone: methodGone } = linePlaces(it, methods);

    const ad = addonCosts(it.addons);
    out.outsourced += ad.outsourced;
    out.shipping += ad.shipping;

    if (num(it.unit_cost) > 0) return;                     // typed by hand: theirs to keep

    const desc = String(it.description || `Line ${ix + 1}`);
    /* A product or method the catalogue no longer has cannot be costed honestly. */
    const gone = (it.product_id != null && !prod) || methodGone;
    if (gone || (!prod && !places.length)) {
      if (!gone && SERVICE_WORDS.test(desc)) { out.lines.push({ ix, unit_cost: 0, basis: 'service: no supplier cost', estimated: false }); return; }
      /* Typed by hand, or picked from a catalogue that has since changed: read
         the words instead. */
      const w = fromWording(it, catalog, bandQty);
      if (w) { out.lines.push({ ix, unit_cost: r2(w.each + ad.perLine / qty), basis: w.basis, estimated: true }); return; }
      out.complete = false; out.missing.push(gone ? `${desc} (no longer in the catalogue)` : desc); return;
    }

    /* The garment, at S&S cost. A typed garment price is a SELL price (it
       replaces the catalogue price on the form), so it is costed at the same
       ratio the catalogue price is. */
    let garmentEach = 0, garmentSellEach = 0;
    const basis = [];
    if (prod && num(prod.price) > 0) {
      const ratio = num(prod.cost) > 0 ? num(prod.cost) / num(prod.price) : 1 / SHOP_MARKUP;
      garmentSellEach = (num(it.blank_price) > 0 ? num(it.blank_price) : num(prod.price)) + num(it.size_upcharge) / qty;
      garmentEach = garmentSellEach * ratio;
      basis.push(num(prod.cost) > 0 ? 'S&S cost' : 'garment at half price');
    }
    /* What the decoration was billed at per piece: only the rough rule uses it. */
    const decoSellEach = Math.max(0, num(it.unit_price) - garmentSellEach);
    const deco = placesCost(places, bandQty, decoSellEach, !!it.garment_dark);
    basis.push(...deco.basis);

    const each = garmentEach + deco.each + ad.perLine / qty;
    out.lines.push({ ix, unit_cost: r2(each), basis: basis.join(' + '), estimated: true });
  });

  out.outsourced = r2(out.outsourced);
  out.shipping = r2(out.shipping);
  return out;
}

module.exports = { SCREEN_PRINT, SCREEN_MIN_QTY, SCREEN_COST, SCREEN_FEE, DTF, EMBROIDERY, SHOP_MARKUP, SERVICE_WORDS,
  methodKind, embroideryColumn, decorationEach, linePlaces, placesCost, addonCosts, garmentFromWords, decorationFromWords, fromWording, estimateJob };
