'use strict';

/* The shop's list prices, written out for Claude's reply to a lead (owner,
 * 2026-10-22: "but you know the prices"). Built from the designer's catalogue
 * (getCatalog: the same garments and print ladders the quote form and the
 * designer price from), so a reply quotes what the customer would see there:
 * Bella+Canvas 3001 with one DTF print at 1 piece is $9.24 + $20.75 = $29.99,
 * exactly what the designer showed Linda.
 *
 * Only figures from here reach the prompt. The garments listed are the ones the
 * enquiry names or plainly asks for (a style number, "hoodie", "long sleeve"),
 * plus a few staples, so the list stays short enough to read.
 */

const MAX_PRODUCTS = 12;
/* A colour list is cut here; the colours they named are always kept. */
const MAX_COLOURS = 40;
/* The jtees.net link to a garment's page in the designer (GET /p/:id). Customers
   only ever see jtees.net (owner, 2026-10-05). */
const productLink = (id) => `https://www.jtees.net/p/${Number(id)}`;
/* The everyday blanks, offered when the enquiry names nothing more specific. */
const STAPLES = [/\bbella\s*\+?\s*canvas 3001 unisex jersey tee\b/i, /\bgildan 5000 /i, /\bgildan 18500 /i, /\bgildan 5400 /i];
/* The shop's own pick for a job, listed first and marked so the reply leads with
   it (owner, 2026-10-22): the Gildan 5000 Heavy Cotton for a regular order, the
   Gildan 8000 50/50 for a uniform order. */
const REGULAR_TEE = /\bgildan 5000 /i;
const UNIFORM_TEE = /\bgildan 8000\b/i;
const UNIFORM = /\b(uniforms?|staff|employees?|workwear|work\s*shirts?)\b/i;
/* Light tees are never offered: the shop does not sell them (lib/ssa-costs). */
const { isLightTee: LIGHT_TEE } = require('./ssa-costs');
/* A garment for a child: only the youth kind offers one. */
const CHILD = /\b(youth|infant|toddler|kids?|girls?[’']?)\b/i;
/* A women's cut, asked for and in a catalogue name (which writes Women's or Women’s).
   2026-10-24: "women's fit tees" got the cheapest tees of any cut, so the reply
   offered a women's performance tee and led with the unisex pick. */
/* "Girls" is a child's size here (CHILD), never a women's fit. */
const WOMEN_ASK = /\b(wom[ae]n[’']?s?|ladies|ladys?|female)\b/i;
const WOMEN = /\bwomen[’']?s\b|\bladies\b/i;
/* What it is made of, so a reply can tell cotton from performance. A name that
   says it is the best source; KNOWN_FABRIC covers everyday styles whose name does not.
   Cotton asked for, not "no cotton" and not the color "cotton candy". */
const COTTON_ASK = /(?<!\b(?:no|not|non)[\s-])\bcotton\b(?![\s-]candy)/i;
/* A blend says so (50/50, CVC, cotton/poly); checked before performance, so "Cotton/Poly" is a blend. */
const BLEND = /\b\d{2}\s*\/\s*\d{2}\b|\bcvc\b|\btri[- ]?blend\b|\bcotton\s*\/\s*poly(ester)?\b|\bpoly\s*\/\s*cotton\b/i;
const PERFORMANCE = /\b(performance|100% polyester|moisture[- ]?wicking|wicking|dri[- ]?fit|cool[- ]?dry|posicharge)\b/i;
const KNOWN_FABRIC = [
  [/\bgildan 5000\b/i, '100% cotton (heather colors are blends)'],
  [/\bgildan 64000\b/i, '100% ring-spun cotton (heather colors are blends)'],
  [/\b(bella\s*\+?\s*canvas|bc) ?3001\b/i, '100% cotton (heather colors are blends)'],
  [/\b(bella\s*\+?\s*canvas|bc) ?6004\b/i, '100% cotton (heather colors are blends)'],
  [/\b(next level|nl) ?3600\b/i, '100% cotton'],
  [/\b(next level|nl) ?3900\b/i, '100% cotton'],
  [/\bec3000\b/i, '100% organic cotton'],
];
/** What a garment is made of, from its name: '' when the name does not say. A blend
 *  first (a 3001 CVC is not the cotton 3001), then performance, then the known styles. */
function fabric(name) {
  const n = String(name || '');
  if (BLEND.test(n)) {
    const r = n.match(/\b(\d{2})\s*\/\s*(\d{2})\b/);
    return r ? `${r[1]}/${r[2]} cotton-polyester blend` : 'cotton-polyester blend';
  }
  if (PERFORMANCE.test(n)) return 'performance (polyester), not cotton';
  const known = KNOWN_FABRIC.find(([re]) => re.test(n));
  if (known) return known[1];
  const m = n.match(/\b(100% )?(organic |ring[- ]spun |combed )*cotton\b/i);
  return m ? m[0].toLowerCase() : '';
}
/** True when it is cotton through, by its fabric() (a blend is not). */
const isCotton = (name) => { const f = fabric(name); return /cotton/.test(f) && !/blend|polyester/.test(f.replace(/\(heather colors are blends\)/, '')); };
/* Words a customer uses for a garment, and the words in a catalogue name that mean it. */
const KINDS = [
  { ask: /\b(t-?shirts?|tees?|shirts?)\b/i, name: /\b(tee|t-shirt)\b/i },
  /* "long sleeve", and "long and short sleeved" */
  { ask: /\blong\b[\w\s&-]{0,12}?\bsleeve/i, name: /\blong[\s-]sleeve\b/i },
  { ask: /\b(hoodies?|hooded|sweatshirts?)\b/i, name: /\b(hood(ed|ie)|sweatshirt)\b/i },
  { ask: /\bcrew\s*necks?\b/i, name: /\bcrewneck\b/i },
  { ask: /\bpolos?\b/i, name: /\bpolo\b/i },
  { ask: /\btanks?\b/i, name: /\btank\b/i },
  { ask: /\baprons?\b/i, name: /\bapron\b/i },
  { ask: /\b(hats?|caps?)\b/i, name: /\b(cap|hat)\b/i },
  { ask: /\bbeanies?\b/i, name: /\bbeanie\b/i },
  { ask: /\b(totes?|bags?)\b/i, name: /\b(tote|bag)\b/i },
  { ask: /\b(youth|kids?|children|girls?)\b/i, name: CHILD, child: true },
  { ask: /\b(jackets?|quarter[\s-]?zip)\b/i, name: /\b(jacket|quarter-zip|1\/4-zip)\b/i },
];

const money = (n) => '$' + Number(n).toFixed(2);

/** A ladder as "1-4 $20.75, 5-11 $18.75, ..." Bands key on their CEILING. */
function ladder(bands, { from = 1, price = (b) => b.price } = {}) {
  const sorted = (bands || []).filter((b) => b && Number(b.min_qty) > 0).slice().sort((a, b) => a.min_qty - b.min_qty);
  let lo = Math.max(1, Number(from) || 1);
  const out = [];
  for (const b of sorted) {
    const hi = Number(b.min_qty);
    if (hi < lo) continue;
    const p = Number(price(b));
    if (!Number.isFinite(p)) continue;
    out.push(`${lo === hi ? lo : lo + '-' + hi} ${money(p)}`);
    lo = hi + 1;
  }
  return out.join(', ');
}

/** One print method, as lines of the price list; [] when it has no usable bands. */
function methodLines(m) {
  const pos = m.positions || {};
  const keys = Object.keys(pos);
  if (!keys.length) return [];
  const from = Number(m.min_order_qty) || 1;
  const min = from > 1 ? ` (minimum ${from} pieces)` : '';
  if (m.type === 'color') {
    const bands = (pos[keys[0]] || []).slice().sort((a, b) => a.min_qty - b.min_qty);
    const cols = Object.keys((bands[0] && bands[0].colors) || {});
    if (!cols.length) return [];
    return [`${m.title}${min}, per piece per location, by ink colors:`,
      ...cols.map((c) => `  ${c}: ${ladder(bands, { from, price: (b) => (b.colors || {})[c] })}`)];
  }
  const main = ladder(pos[keys[0]], { from });
  if (!main) return [];
  const extra = keys[1] ? ladder(pos[keys[1]], { from }) : '';
  return extra
    ? [`${m.title}${min}, per piece:`, `  first location: ${main}`, `  each additional location: ${extra}`]
    : [`${m.title}${min}, per piece: ${main}`];
}

/** The garments the enquiry asks about: a style number they typed first, then
 *  the cheapest few of EACH kind they named (aprons and tees both, not twelve
 *  tees), then the staples while there is room. */
function pickProducts(products, asked) {
  const text = String(asked || '').toLowerCase();
  const words = new Set(text.match(/[a-z0-9]+/g) || []);
  const kinds = KINDS.filter((k) => k.ask.test(text));
  const women = WOMEN_ASK.test(text);
  const cotton = COTTON_ASK.test(text);
  /* Staff-only services (design fees, folding) are not garments to offer; nor, when
     they asked for cotton, a performance one. */
  const usable = (products || []).filter((p) => p && p.name && Number(p.price) > 0 && !p.service && !LIGHT_TEE(p.name)
    && !(cotton && /^performance/.test(fabric(p.name))))
    .slice().sort((a, b) => a.price - b.price);
  const out = [];
  const add = (p) => { if (out.length < MAX_PRODUCTS && !out.includes(p)) out.push(p); };
  const adult = (re) => usable.find((x) => re.test(x.name) && !CHILD.test(x.name));
  /* "3001", "IND5000P": the strongest sign there is. */
  for (const p of usable) {
    const codes = (p.name.toLowerCase().match(/[a-z0-9]+/g) || []).filter((t) => /\d/.test(t) && t.length >= 3);
    if (codes.some((c) => words.has(c))) add(p);
  }
  /* A women's fit: the women's cuts of each kind they named come next, ahead of the
     shop's unisex pick, the ones whose fabric is known first when they asked for cotton. */
  if (women) {
    /* "Polo shirts" also reads as the tee kind ("shirts"): tees only when they said tee or t-shirt, or nothing else. */
    const adults = kinds.filter((k) => !k.child);
    const others = adults.filter((k) => k !== KINDS[0]);
    const wanted = !adults.length ? [KINDS[0]]
      : others.length && !/\b(t-?shirts?|tees?)\b/i.test(text) ? others : adults;
    for (const k of wanted) {
      const pool = usable.filter((p) => WOMEN.test(p.name) && k.name.test(p.name) && !CHILD.test(p.name));
      const ranked = cotton ? [...pool.filter((p) => isCotton(p.name)), ...pool.filter((p) => !isCotton(p.name))] : pool;
      for (const p of ranked.slice(0, 4)) add(p);
    }
  }
  /* The shop's pick for tees, ahead of the cheaper ones. */
  if (!kinds.length || kinds.includes(KINDS[0])) {
    const pick = UNIFORM.test(text) ? [UNIFORM_TEE, REGULAR_TEE] : [REGULAR_TEE];
    for (const re of pick) { const p = adult(re); if (p) add(p); }
  }
  const perKind = Math.max(2, Math.floor(MAX_PRODUCTS / Math.max(1, kinds.length)) - 1);
  for (const k of kinds) {
    /* Children's sizes come only from the youth kind, so they never fill the adult slots. */
    const pool = usable.filter((p) => k.name.test(p.name) && (k.child || !CHILD.test(p.name)));
    for (const p of pool.slice(0, perKind)) add(p);
  }
  for (const re of STAPLES) { const p = adult(re); if (p) add(p); }
  return out;
}

/** What the shop says about a garment in the list: its pick for regular orders,
 *  and on a uniform enquiry its pick for uniforms. */
function shopPick(p, asked) {
  if (CHILD.test(p.name)) return '';
  if (REGULAR_TEE.test(p.name)) return 'our regular tee';
  if (UNIFORM_TEE.test(p.name) && UNIFORM.test(String(asked || ''))) return 'our tee for uniform orders';
  return '';
}

/** A garment's colourways, the ones the enquiry names first, cut at MAX_COLOURS. */
function colourList(p, asked) {
  const text = String(asked || '').toLowerCase();
  const names = (Array.isArray(p.colours) ? p.colours : []).map((c) => String((c && c.name) || '').trim()).filter(Boolean)
    .filter((n, i, a) => a.indexOf(n) === i);
  const named = names.filter((n) => n.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 2 && text.includes(w)));
  const rest = names.filter((n) => !named.includes(n));
  const shown = [...named, ...rest].slice(0, Math.max(MAX_COLOURS, named.length));
  return shown.length < names.length ? `${shown.join(', ')} and ${names.length - shown.length} more` : shown.join(', ');
}

/** The price list for one enquiry, as plain text for the prompt; '' with no catalogue.
 *  `blankTiers` [{min, pct}], `screenFee` (0 when screens are in the per-piece
 *  rate), `addons` [{label, kind, rate, note}]. */
function priceSheet(catalog, asked, { blankTiers = [], screenFee = 0, addons = [] } = {}) {
  if (!catalog || catalog.failed || !Array.isArray(catalog.methods) || !catalog.methods.length) return '';
  const methods = catalog.methods.filter((m) => m && m.active && m.use_for_quoting !== false);
  const byId = new Map(methods.map((m) => [Number(m.id), m]));
  const lines = ['How a garment is priced: (garment + size upcharge + the print for each location) x quantity. Sales tax is extra.'];

  const products = pickProducts(catalog.products, asked);
  if (products.length) {
    lines.push('', 'Garments (price each, before the volume break):');
    for (const p of products) {
      const up = (p.sizes || []).filter((s) => Number(s.upcharge) > 0).map((s) => `${s.size} +${money(s.upcharge)}`);
      const can = (p.printing_ids || []).map((id) => byId.get(Number(id))).filter(Boolean)
        .map((m) => String(m.title).split(' — ')[0]).filter((t, i, a) => a.indexOf(t) === i);
      const colours = colourList(p, asked);
      const pick = shopPick(p, asked);
      const made = fabric(p.name);
      lines.push(`- ${p.name}${pick ? ` (${pick})` : ''}${WOMEN.test(p.name) ? ' [women\'s cut]' : ''}${made ? ` [${made}]` : ''}: ${money(p.price)}${up.length ? ` (${up.join(', ')})` : ''}${can.length ? `; can take: ${can.join(', ')}` : ''}`
        + `; link: ${productLink(p.id)}; colors: ${colours || 'not listed'}`);
    }
  }
  const tiers = (blankTiers || []).slice().sort((a, b) => a.min - b.min);
  if (tiers.length) lines.push(`Garment volume break: ${tiers.map((t) => `${t.pct}% off at ${t.min}+`).join(', ')}; none below ${tiers[0].min}.`);

  lines.push('', 'Prints and other items (ranges are piece counts):');
  let screen = false;
  for (const m of methods) {
    const ml = methodLines(m);
    lines.push(...ml);
    if (ml.length && m.type === 'color') screen = true;
  }
  if (screen) lines.push('Screen printing: every garment gets a white base, so price a design one ink color up (a 1-color design uses the 2-color price).');
  if (screenFee > 0) lines.push(`Screens: ${money(screenFee)} per screen, once per order (one screen per ink color plus the white base, per location).`);
  const extras = (addons || []).filter((a) => a && a.label && a.kind === 'per_piece' && Number(a.rate) > 0);
  if (extras.length) lines.push('', 'Add-ons per piece:', ...extras.map((a) => `- ${a.label}: ${money(a.rate)}${a.note ? ` (${a.note})` : ''}`));
  return lines.join('\n');
}

module.exports = { priceSheet, pickProducts, shopPick, colourList, productLink, ladder, methodLines, fabric, MAX_PRODUCTS, MAX_COLOURS };
