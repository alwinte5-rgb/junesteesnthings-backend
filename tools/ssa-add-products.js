#!/usr/bin/env node
/*
 * Add S&S styles to the designer catalogue, priced and configured.
 *
 *   node tools/ssa-add-products.js < vars.json           # dry run
 *   node tools/ssa-add-products.js --apply < vars.json   # write
 *   node tools/ssa-add-products.js --only=112,6606 ...   # just these styles
 *
 * For each style this pulls live S&S data and writes a product with:
 *   - price      cheapest core-size piece cost x 2 (the shop's rule)
 *   - sizes      every size S&S stocks, with upcharges derived from the real
 *                per-size cost difference rather than guessed
 *   - colours    the actual colour range, with swatch hexes
 *   - stages     the print area for that GARMENT TYPE, from the existing
 *                configured products — a cap is not a tee and must not get a
 *                tee's 175x280 print area
 *   - printings  only the decorations the garment can physically take
 *
 * Nothing here invents data. A style S&S cannot price is skipped rather than
 * added with a placeholder, because a product that cannot be costed is a
 * product that will be quoted wrong.
 */

const { mysql, sq } = require('./lib/db');
const { sellPrice, sizeUpcharge } = require('./lib/markup');
const { CORE_SIZES, classify, DECORATIONS, resolveRoles } = require('./lib/garments');

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
  .split(',').filter(Boolean).map((s) => s.toUpperCase());
const HOME = 'IL';
/* Costing and stock sizes: lib/garments' copy, shared with ssa-sync. */
const CORE = CORE_SIZES;

/* ── Garment types ────────────────────────────────────────────────────────
 *
 * `stages` is the print area, and it is the one thing that cannot be shared
 * across types: a cap prints 165x100 on the front only, a tote prints
 * 200x280 both sides. These are lifted from products already configured and
 * selling, so they match what the shop actually produces.
 *
 * `printings` — which decorations the garment can take — is NOT here any more.
 * It used to be a list of literal printing ids per type, and those ids went
 * stale: the seven per-colour screen rows were replaced by one combined method
 * and the single embroidery row became seven placements, so every product added
 * after that carried retired methods and could not be screen printed at all.
 * 32 live products were in that state before it was spotted. The rules now come
 * from tools/lib/garments.js and are resolved against the live printings table
 * by title on every run, which is the same path tools/decorations-2026.js takes.
 */
const TYPES = {
  tee:      { raws: 'basic_tshirt',       front: { height: 280, width: 175, left: -2.5, top: -7.5 },
              back: { height: 339, width: 160, left: -4, top: -11 } },
  longslv:  { raws: 'long_sleeve',        front: { height: 280, width: 175, left: -2.5, top: -7.5 },
              back: { height: 339, width: 160, left: -4, top: -11 } },
  polo:     { raws: 'polo_core365',       front: { height: 200, width: 170, left: 0, top: 25 },
              back: { height: 240, width: 180, left: 0, top: 0 } },
  /* No back stage on headwear — decided 2026-09-12. A stage is somewhere a
     customer can put a design, so adding one to a cap is not an artwork
     change: it commits the shop to decorating and pricing a cap back. */
  cap:      { raws: 'hat',                front: { height: 100, width: 165, left: -1, top: -5 },
              back: null },
  bag:      { raws: 'bag',                front: { height: 280, width: 200, left: 0, top: -5 },
              back: { height: 280, width: 200, left: 0, top: -5 } },
  hoodie:   { raws: 'hoodies_sweatshirt', front: { height: 240, width: 175, left: 0, top: 10 },
              back: { height: 320, width: 175, left: 0, top: -5 } },
  kids:     { raws: 'kids_babies',        front: { height: 200, width: 140, left: 0, top: 0 },
              back: { height: 200, width: 140, left: 0, top: 0 } },
  premium:  { raws: 'premium',            front: { height: 260, width: 170, left: 0, top: 0 },
              back: { height: 300, width: 170, left: 0, top: 0 } },
  /* Vests and jackets are decorated left-chest and centre-back, and are almost
     always embroidered rather than printed — a puffer will not take a screen.
     NOTE: the designer has no vest or jacket base artwork, so these borrow the
     sweatshirt silhouette. The catalogue thumbnail is the real garment; only
     the design canvas shows the wrong shape until proper art is uploaded. */
  vest:     { raws: 'hoodies_sweatshirt', front: { height: 200, width: 150, left: 0, top: 20 },
              back: { height: 280, width: 170, left: 0, top: 0 }, borrowedArt: true },
  jacket:   { raws: 'hoodies_sweatshirt', front: { height: 210, width: 160, left: 0, top: 15 },
              back: { height: 300, width: 175, left: 0, top: -5 }, borrowedArt: true },
};

/* The styles to add, each with the garment type that decides its print area.
   Stock is checked but no longer gates the choice: limiting the catalogue to
   what sits in Lockport was leaving whole categories unserved — not one classic
   corporate dress shirt is stocked in Illinois — so freight is accepted where
   the product is worth carrying, and local stock is reported instead.
   No single brand is banned; the mix is managed by choosing across brands. */
const WANTED = [
  ['112',      'cap',     'Richardson',  'Richardson 112 Snapback Trucker Cap'],
  ['6606',     'cap',     'YP',          'YP Classics 6606 Retro Trucker Cap'],
  ['VC300A',   'cap',     'Valucap',     'Valucap VC300A Bio-Washed Dad Hat'],
  ['6245CM',   'cap',     'YP',          'YP Classics 6245CM Classic Dad Hat'],
  ['8881',     'bag',     'Liberty',     'Liberty Bags 8881 Drawstring Pack'],
  ['EC8056',   'bag',     'econscious',  'econscious EC8056 Eco Promo Tote'],
  ['CCET0',    'bag',     'Comfort',     'Comfort Colors CCET0 Everyday Tote'],
  ['88181',    'polo',    'CORE365',     "CORE365 88181 Men's Origin Performance Polo"],
  ['78181',    'polo',    'CORE365',     "CORE365 78181 Women's Origin Performance Polo"],
  ['CE104',    'polo',    'CORE365',     "CORE365 CE104 Men's Market Snag Protect Polo"],
  ['5900',     'polo',    'C2',          "C2 Sport 5900 Men's Utility Polo"],
  ['CE10',     'tee',     'CORE365',     'CORE365 CE10 Unisex Capital Performance Tee'],
  ['42000',    'tee',     'Gildan',      'Gildan 42000 Unisex Performance Tee'],
  ['CO200',    'hoodie',  'Champion',    'Champion CO200 Packable Anorak Jacket'],
  ['IND5000P', 'hoodie',  'Independent', 'Independent Trading IND5000P Legend Pullover'],
  ['78190',    'hoodie',  'CORE365',     "CORE365 78190 Women's Journey Fleece Jacket"],
  ['HMB000',   'premium', 'Hanes',       "Hanes HMB000 Men's V-Neck Scrub Top"],
  ['CE520',    'premium', 'CORE365',     "CORE365 CE520 Men's Shoreline Shirt"],
  /* Purpose-made sublimation blanks — white polyester, which is what makes
     sublimation possible at all. The women's and Blackout styles are out of
     stock across the whole S&S network, so they are deliberately absent. */
  ['1910',     'tee',     'SubliVie',    "SubliVie 1910 Men's Polyester Sublimation Tee"],
  ['1210',     'kids',    'SubliVie',    'SubliVie 1210 Youth Polyester Sublimation Tee'],
  ['1310',     'kids',    'SubliVie',    'SubliVie 1310 Toddler Polyester Sublimation Tee'],

  /* Fall 2026. Corporate and team orders move to layers from September, and
     every one of these was checked for Illinois stock first. Classic corporate
     dress shirts are deliberately absent: not one from Devon & Jones, Harriton,
     Van Heusen or North End is stocked locally, so they would carry freight on
     every order. */
  ['RP021',    'premium', 'Artisan',     'Artisan Collection RP021 Utility Shirt'],
  ['CE702',    'vest',    'CORE365',     "CORE365 CE702 Men's Prevail Packable Puffer Vest"],
  ['CE702W',   'vest',    'CORE365',     "CORE365 CE702W Women's Prevail Packable Puffer Vest"],
  ['CE703',    'vest',    'CORE365',     "CORE365 CE703 Men's Techno Lite Unlined Vest"],
  ['1580',     'hoodie',  'Comfort',     'Comfort Colors 1580 Garment-Dyed Quarter-Zip'],
  ['5102',     'hoodie',  'C2',          "C2 Sport 5102 Men's Quarter-Zip Pullover"],
  ['S450',     'hoodie',  'Champion',    'Champion S450 Powerblend Quarter-Zip'],
  ['88183',    'jacket',  'CORE365',     "CORE365 88183 Men's Techno Lite Jacket"],
  ['CE700',    'jacket',  'CORE365',     "CORE365 CE700 Men's Prevail Packable Puffer Jacket"],
  ['M750',     'jacket',  'Harriton',    "Harriton M750 Men's Packable Hooded Nylon Jacket"],

  /* Round two, freight accepted. Deliberately spread across brands: the
     corporate categories all have a CORE365 answer, and taking it every time is
     how it reached 15% of the catalogue. */

  // Button-downs — the gap local-only stock could not fill at all.
  ['D620',     'premium', 'Devon',       "Devon & Jones D620 Men's Crown Broadcloth Shirt"],
  ['M500',     'premium', 'Harriton',    "Harriton M500 Men's Easy Blend Twill Shirt"],
  ['RP144',    'premium', 'Artisan',     'Artisan Collection RP144 Annex Oxford Shirt'],
  ['BU7401',   'premium', 'Boxercraft',  "Boxercraft BU7401 Men's Flannel Button Down"],

  // Vests — Adidas and Independent rather than another CORE365.
  ['A572',     'vest',    'Adidas',      "Adidas A572 Men's Puffer Full-Zip Vest"],
  ['EXP120PFV','vest',    'Independent', "Independent Trading EXP120PFV Men's Puffer Vest"],
  ['88191',    'vest',    'CORE365',     "CORE365 88191 Men's Journey Fleece Vest"],

  // Quarter-zips at three price points, three different brands.
  ['18810',    'hoodie',  'Gildan',      'Gildan 18810 Heavy Blend Quarter-Zip'],
  ['9643',     'hoodie',  'Next Level',  'Next Level 9643 Fleece Quarter-Zip Pullover'],
  ['EXP15WPQ', 'hoodie',  'Independent', "Independent Trading EXP15WPQ Women's Quarter-Zip"],
  ['M421',     'hoodie',  'Harriton',    'Harriton M421 Pilbloc Quarter-Zip Pullover'],

  // Soft shell / tech.
  ['EXP35SSZ', 'jacket',  'Independent', "Independent Trading EXP35SSZ Poly-Tech Soft Shell"],
  ['M740',     'jacket',  'Harriton',    'Harriton M740 Fleece Lined Nylon Jacket'],

  // Headwear — a beanie for winter, and cheaper cap options.
  ['1500KC',   'cap',     'YP',          'YP Classics 1500KC Cuffed Beanie'],
  ['8804H',    'cap',     'Valucap',     'Valucap 8804H Five-Panel Trucker Cap'],
  ['2260',     'cap',     'Valucap',     'Valucap 2260 Cotton Twill Cap'],

  // Bags — a duffel and a backpack, neither of which the catalogue has.
  ['INDDUFBAG','bag',     'Independent', 'Independent Trading 29L Day Tripper Duffel'],
  ['1240539',  'bag',     'Under Armour','Under Armour Ozsee Sackpack'],

  // Workwear — trades and industrial, a customer type not served at all.
  ['2574',     'premium', 'Dickies',     "Dickies 2574 Men's Short Sleeve Work Shirt"],
  ['M585',     'premium', 'Harriton',    "Harriton M585 Advantage Short Sleeve Work Shirt"],

  /* Sustainable line, September 2026 — asked for by a customer.
     S&S flags 1,595 styles `sustainableStyle`; these are the subset whose own
     title or description makes a specific claim (organic, recycled, hemp) that
     the shop can repeat to a customer without overstating it. A blanket
     "sustainable" flag covers a lot of ordinary polyester, so the flag alone
     was not treated as the qualification.

     Every one is a garment type already proven by a product on the storefront,
     so none needs the canvas review that held the August batch. Spread across
     nine brands on purpose. Deliberately absent: econscious EC8710 Grove Sling
     Bag and the Hemp Pouch — real products, but a 200x280 both-sides tote print
     area is not their shape, and they need their own before they can be sold. */

  // Headwear — the gap the catalogue felt most, with two recycled versions of
  // caps already selling (Richardson 112, YP 6606) so a customer can swap up.
  ['EC7070',   'cap',     'econscious',  'econscious EC7070 Eco Trucker Cap'],
  ['EC7090',   'cap',     'econscious',  'econscious EC7090 Hemp Structured Baseball Cap'],
  ['EC7000',   'cap',     'econscious',  'econscious EC7000 Organic Baseball Cap'],
  ['112RE',    'cap',     'Richardson',  'Richardson 112RE Sustainable Trucker Cap'],
  ['110R',     'cap',     'Flexfit',     'Flexfit 110R Recycled Mesh Cap'],
  ['FRASER',   'cap',     'Atlantis',    'Atlantis FRASER Sustainable Dad Hat'],
  ['6606R',    'cap',     'YP',          'YP Classics 6606R Sustainable Retro Trucker Cap'],
  ['EC7045',   'cap',     'econscious',  'econscious EC7045 Base Camp Beanie'],
  ['NELSON',   'cap',     'Atlantis',    'Atlantis NELSON Sustainable Cuffed Beanie'],

  // Totes and packs, from a $5 promo tote to a hemp market bag.
  ['EC8000',   'bag',     'econscious',  'econscious EC8000 Everyday Organic Tote'],
  ['EC8015',   'bag',     'econscious',  'econscious EC8015 Hemp Market Tote'],
  ['EC8040',   'bag',     'econscious',  'econscious EC8040 Organic Market Tote'],
  ['S800',     'bag',     'Q-Tees',      'Q-Tees S800 Sustainable Canvas Tote Bag'],
  ['OAD113R',  'bag',     'OAD',         'OAD OAD113R Midweight Recycled Tote Bag'],
  ['8860R',    'bag',     'Liberty',     'Liberty Bags 8860R Nicole Recycled Tote'],
  ['8875',     'bag',     'Liberty',     'Liberty Bags 8875 Canvas Drawstring Backpack'],

  // Apparel — organic cotton from econscious, recycled poly/cotton from Recover.
  ['EC1000',   'tee',     'econscious',  'econscious EC1000 Unisex Classic Organic T-Shirt'],
  ['EC3000',   'tee',     'econscious',  "econscious EC3000 Women's Classic Organic T-Shirt"],
  ['EC100',    'tee',     'Recover',     "Recover EC100 Men's Eco Recycled T-Shirt"],
  ['EY100',    'kids',    'Recover',     'Recover EY100 Youth Eco Recycled T-Shirt'],
  ['EC1500',   'longslv', 'econscious',  'econscious EC1500 Unisex Organic Long Sleeve T-Shirt'],
  ['EC5500',   'hoodie',  'econscious',  'econscious EC5500 Unisex Heritage Hooded Sweatshirt'],
  ['EC950',    'hoodie',  'econscious',  'econscious EC950 Unisex Hemp Hero Hooded Sweatshirt'],
  ['RC1093',   'hoodie',  'Recover',     'Recover RC1093 Unisex Recycled Fleece Hooded Sweatshirt'],
  ['EC500',    'polo',    'Recover',     "Recover EC500 Men's Eco Polo"],

  /* Asked for by name, September 2026, for a quote. The catalogue already
     carries Gildan's cotton tee (5000), its ringspun (64000) and its all-poly
     performance tee (42000) — 8000 is the 50/50 DryBlend between them, which is
     the blend team and school orders ask for by number. Not flagged poly: a
     50/50 will not take dye sublimation, so `isPoly` must stay false here or
     the page offers a method the shop has to refuse. */
  ['8000',     'tee',     'Gildan',      'Gildan 8000 Adult DryBlend 50/50 Tee'],
];

/* Sublimation needs a poly garment, so it is added only where the fabric
   supports it rather than offered everywhere and refused later. Matched by
   TITLE, not by a literal id — it has no role in lib/garments (nothing else
   offers it) and a bare 14 is exactly the kind of number that went stale in
   this file once already. */
const SUBLIMATION_RE = /^sublimation/i;

/* ── S&S ─────────────────────────────────────────────────────────────────── */

let last = 0;
function makeClient(acct, key) {
  const auth = 'Basic ' + Buffer.from(acct + ':' + key).toString('base64');
  return async function ssa(path, tries = 5) {
    let st = 0;
    for (let i = 0; i < tries; i++) {
      const wait = Math.max(0, last + 700 - Date.now()) + (i ? 1200 * i * i : 0);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      try {
        const r = await fetch('https://api.ssactivewear.com/v2/' + path,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) });
        st = r.status;
        if (r.status === 429 || r.status >= 500) continue;
        if (r.status === 404) return null;                  // answered: not there
        /* Anything else — 401 above all — is the API refusing to talk, not the
           API saying the style is absent. Returning null here made a dead key
           print "no such style at S&S" once per style and exit 0, which reads
           as a catalogue problem and sends you looking at S&S's data instead of
           at the credential. ssa-sync.js has drawn this line since it was
           written; this is the same line, in the tool that was missing it. */
        if (!r.ok) throw new Error('S&S returned ' + r.status + ' for ' + path);
        return await r.json();
      } catch (e) {
        /* Let our own refusal out. Without this the throw above is caught as
           if it were a timeout and retried five times, so a dead key costs
           five requests per style and still reports a retry exhaustion rather
           than the 401 that caused it. Same guard as ssa-sync.js. */
        if (e.message && e.message.startsWith('S&S returned')) throw e;
        /* anything else — timeout, socket — is worth retrying */
      }
    }
    /* Throwing rather than returning null: a throttled call must never be
       mistaken for "this style does not exist", which would add nothing and
       report success. */
    throw new Error('S&S unreachable (last ' + st + '): ' + path);
  };
}

/* ── Encoding, matching lumise's lib->enjson() ───────────────────────────── */

const enjson = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o)), 'utf8').toString('base64');
const money = (n) => Math.round(Number(n) * 100) / 100;

function buildStages(type) {
  const t = TYPES[type];
  const shape = (side, zone) => ({
    source: 'raws', overlay: true,
    url: 'products/' + t.raws + (t.back ? '_' + side : '') + '.png',
    label: side === 'front' ? 'Front' : 'Back',
    edit_zone: { ...zone, radius: '0' },
    product_width: 400, product_height: 475,
  });
  const stages = { front: shape('front', t.front) };
  if (t.back) stages.back = shape('back', t.back);
  return enjson(stages);
}

/** Sizes and colours, from what S&S actually stocks. */
function buildAttributes(rows, baseCost) {
  const sizeCost = {}, order = {}, colours = new Map();
  for (const r of rows) {
    const c = Number(r.piecePrice || r.casePrice || 0);
    if (!r.sizeName || !c) continue;
    if (!sizeCost[r.sizeName] || c < sizeCost[r.sizeName]) sizeCost[r.sizeName] = c;
    if (order[r.sizeName] === undefined) order[r.sizeName] = Number(r.sizeOrder || 999);
    if (r.colorName && !colours.has(r.colorName)) {
      colours.set(r.colorName, '#' + String(r.color1 || '000000').replace(/^#/, ''));
    }
  }
  const sizes = Object.keys(sizeCost).sort((a, b) => order[a] - order[b]);
  if (!sizes.length) return null;

  /* The upcharge is the REAL cost difference carrying the same markup as the
     base, not a flat guess: a 2XL that costs $3.68 more must sell for more than
     $3.68 more or the shop loses on every extended size it sells. The multiple
     lives in lib/markup.js so it cannot drift from the base price. */
  const multiple_options = sizes.map((s) => {
    const up = sizeUpcharge(sizeCost[s], baseCost);
    return { title: s, price: up > 0 ? String(up) : '', default: s === 'L' ? '1' : '' };
  });

  /* `id` is not decoration: the field renderers build the cart input as
     name="'+data.id+'" (core/includes/tmpl.php render_color, and the same for
     quantity). With it missing the input is literally name="undefined",
     lumise.cart.calc looks up attrs['undefined'], finds nothing and returns
     early — so no colour is recorded, the quantity never counts, and a
     variation keyed on COL can never match. `name` is the visible label; blank
     renders the field with a bare ": " for a caption. */
  const attrs = {
    QTYS: { id: 'QTYS', name: 'Quantity per Size', type: 'quantity', title: '',
      values: JSON.stringify({ multiple_options }) },
  };
  if (colours.size) {
    /* Every swatch value must be UNIQUE, because it is not only the colour
       drawn on the picker — it is the identity Lumise writes onto the order.
       S&S gives one body colour per colourway, so "Loden/ Black" and
       "Loden/ Khaki" both come back #777056, and a shop reading the order
       cannot tell which cap was bought. The swatch can only ever show the body
       colour, so the tie is broken by nudging one step along: invisible on a
       screen, distinct in the record. */
    const used = new Set();
    const uniq = (hex) => {
      let h = String(hex).toLowerCase();
      if (!used.has(h)) { used.add(h); return h; }
      const n = parseInt(h.slice(1), 16);
      if (!Number.isFinite(n)) { used.add(h); return h; }
      /* Nearest free shade, never wrapping: (n+1)&0xffffff turned #ffffff into
         #000000, giving "White" a black swatch. */
      for (let i = 1; i <= 512; i++) {
        for (const cand of [n + i, n - i]) {
          if (cand < 0 || cand > 0xffffff) continue;
          const c = '#' + cand.toString(16).padStart(6, '0');
          if (!used.has(c)) { used.add(c); return c; }
        }
      }
      used.add(h); return h;
    };
    attrs.COL = { id: 'COL', name: 'Color', type: 'product_color', title: '', values: {
      options: [...colours].map(([title, value], i) => ({
        value: uniq(value), title, price: '', default: i === 0 ? '1' : '' })) } };
  }
  return enjson(attrs);
}

/** The catalogue photo: the DEFAULT colourway's garment shot.
 *
 * NOT `style.styleImage`. tools/product-art/README.md says this in capitals and
 * it is worth repeating here, where the mistake was actually made:
 * `Images/Style/<id>_fl.jpg` is the marketing photograph and for apparel that
 * is a PERSON WEARING IT — head, hands and trousers included, in whichever
 * colourway the supplier chose to shoot. `Images/Color/<id>_f_fm.jpg` is the
 * garment alone, in a colour the customer can actually order.
 *
 * Ordered exactly as buildAttributes() orders its colour options, so the
 * thumbnail is the colourway the product opens on rather than a different one.
 */
function defaultColourImage(rows) {
  for (const r of rows) {
    const c = Number(r.piecePrice || r.casePrice || 0);
    if (!r.sizeName || !c || !r.colorName) continue;
    if (r.colorFrontImage) return 'https://cdn.ssactivewear.com/' + r.colorFrontImage;
  }
  return '';
}

/** Which decorations this garment can take, as lumise stores them.
 *
 * The garment class comes from the product NAME through lib/garments' own
 * classifier rather than from this file's `type`. The two are not the same
 * vocabulary — `type` says which print AREA and canvas art to use, so a
 * quarter-zip borrows 'hoodie' and a scrub top 'premium' — and decorations must
 * be decided the way the catalogue sweep decides them, or the two disagree the
 * moment either runs.
 *
 * Returns null when nothing can be resolved, so the caller skips the style
 * instead of publishing a product with no decorations or guessed ones.
 */
function buildPrintings(name, roleIds, subId, isPoly) {
  const cls = classify(name);
  const roles = DECORATIONS[cls];
  if (!roles) return null;
  const ids = roles.map((r) => roleIds[r]).filter((n) => Number.isFinite(n));
  if (!ids.length) return null;
  if (isPoly && subId && !ids.includes(subId)) ids.push(subId);
  const o = {};
  for (const id of ids.sort((a, b) => a - b)) o['_' + id] = 'A3';
  return { cls, ids, encoded: encodeURIComponent(JSON.stringify(o)) };
}

/* ── SQL ─────────────────────────────────────────────────────────────────── */

/* ── Main ────────────────────────────────────────────────────────────────── */

/* Credentials arrive one of two ways.
 *
 *   railway run --service <svc> -- node tools/ssa-add-products.js --from-env
 *   <the lib/db.js piped-variables form, kept for compatibility>
 *
 * --from-env is the better of the two and the one to reach for. The piped form
 * materialises the WHOLE credential store as text on a shell pipeline, where it
 * lands in shell history, in any transcript of the session, and in the argv of
 * anything that mishandles it. `railway run` hands the same values to the child
 * process's environment and nowhere else. The piped form is kept because
 * lib/db.js documents it and other tools still use it. */
async function run(env) {
  const dbUrl = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
  if (!env.SSA_ACCOUNT || !env.SSA_API_KEY) { console.error('SSA credentials missing'); process.exit(2); }
  if (!dbUrl) { console.error('no MySQL URL'); process.exit(2); }
  const ssa = makeClient(env.SSA_ACCOUNT, env.SSA_API_KEY);

  const existing = mysql(dbUrl,
    'SELECT id, name, IFNULL(supplier_style_id,0) sid FROM lumise_products;', { rows: true });
  const haveStyle = new Set(existing.map((p) => String(p.sid)));

  /* Decoration ids are read from the live table every run. The sweep in
     tools/decorations-2026.js refuses to run when a role is unresolved; this
     refuses for the same reason, because a product created with a decoration
     set built from a half-resolved map is a product nobody will notice is
     wrong until a customer cannot pick screen printing on it. */
  const methods = mysql(dbUrl, 'SELECT id, title FROM lumise_printings ORDER BY id;', { rows: true });
  const { ids: roleIds, missing } = resolveRoles(methods);
  if (missing.length) {
    console.error('these decoration roles match no live method:\n    ' + missing.join('\n    ') +
      '\n\n  lib/garments.js ROLES is keyed on method TITLES. If one was renamed,' +
      '\n  update it there. Refusing to add products with a half-resolved set.');
    process.exit(2);
  }
  const subMethod = methods.find((m) => SUBLIMATION_RE.test(String(m.title || '')));
  const subId = subMethod ? Number(subMethod.id) : null;

  const list = ONLY.length ? WANTED.filter((w) => ONLY.includes(w[0].toUpperCase())) : WANTED;
  const seenIds = new Set();
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + list.length + ' styles\n');
  console.log('  style      name                                         price   sizes col  IL      type');
  console.log('  ' + '-'.repeat(96));

  const stmts = [];
  let added = 0, skipped = 0, apiErrors = 0;
  for (const [token, type, brand, name] of list) {
    let s, rows;
    try {
      const found = await ssa('styles/?search=' + encodeURIComponent(token));
      /* Match the BRAND as well as the style number. Style numbers are not
         unique across brands — "1310" is SubliVie's toddler sublimation tee and
         also Colortone's oil-wash tee, and taking the first match added the
         wrong garment at the wrong price under the right name. */
      s = (found || []).find((x) => String(x.styleName).toUpperCase() === token.toUpperCase() &&
        String(x.brandName).toUpperCase().includes(brand.toUpperCase()));
      if (!s) {
        const anyName = (found || []).filter((x) => String(x.styleName).toUpperCase() === token.toUpperCase());
        console.log('  ' + token.padEnd(11) + (anyName.length
          ? 'style exists but not from ' + brand + ' (' + anyName.map((x) => x.brandName).join(', ') + ') — skipped'
          : 'no such style at S&S — skipped'));
        skipped++; continue;
      }
      if (haveStyle.has(String(s.styleID))) {
        console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) + 'already in the catalogue');
        skipped++; continue;
      }
      rows = await ssa('products/?styleid=' + s.styleID);
    } catch (e) {
      console.log('  ' + token.padEnd(11) + 'API: ' + e.message.slice(0, 46));
      apiErrors++; skipped++; continue;
    }
    if (!Array.isArray(rows) || !rows.length) {
      console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) + 'no live pricing — skipped');
      skipped++; continue;
    }

    let baseCost = Infinity, il = 0;
    const seenSizes = new Set(), seenCols = new Set();
    for (const r of rows) {
      const c = Number(r.piecePrice || r.casePrice || 0);
      if (!r.sizeName || !c) continue;
      seenSizes.add(r.sizeName);
      if (r.colorName) seenCols.add(r.colorName);
      if (CORE.includes(r.sizeName) && c < baseCost) baseCost = c;
      if (CORE.includes(r.sizeName)) {
        for (const w of r.warehouses || []) if (w.warehouseAbbr === HOME) il += w.qty;
      }
    }
    if (!isFinite(baseCost)) {
      console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) + 'no core-size cost — skipped');
      skipped++; continue;
    }

    const attributes = buildAttributes(rows, baseCost);
    if (!attributes) { console.log('  ' + token.padEnd(11) + 'no sizes — skipped'); skipped++; continue; }

    const price = sellPrice(baseCost);
    /* Sublimation is offered ONLY on blanks made for it.
       The looser test — anything "performance" or "polyester" — enabled it on
       the CORE365 polos, which come in 19 colours that are mostly dark. Dye
       sublimation cannot print onto a dark garment at all, so that would have
       put a method on the page that has to be refused whenever it is chosen. */
    const isPoly = /^SubliVie/i.test(name);
    const prt = buildPrintings(name, roleIds, subId, isPoly);
    if (!prt) {
      console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) +
        'no decoration set for garment class "' + classify(name) + '" — skipped');
      skipped++; continue;
    }
    /* Falls back to the style image only when no colourway has a photo at all,
       because a product with no thumbnail renders as a broken image. */
    const thumb = defaultColourImage(rows) ||
      (s.styleImage ? 'https://cdn.ssactivewear.com/' + s.styleImage : '');

    console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) +
      ('$' + price.toFixed(2)).padStart(7) + String(seenSizes.size).padStart(6) +
      String(seenCols.size).padStart(5) + String(il).padStart(8) + '  ' + type +
      '  deco=' + prt.ids.join(',') +
      (isPoly && subId ? '  +sublimation' : '') +
      (TYPES[type].borrowedArt ? '  [borrowed canvas art]' : ''));

    stmts.push(
      'INSERT INTO lumise_products (name, price, product, thumbnail, thumbnail_url, template, ' +
      'description, stages, variations, attributes, printings, `order`, active, author, ' +
      'created, updated, supplier, supplier_style_id, supplier_cost, ssa_seen_at)\n' +
      "  SELECT " + sq(name) + ', ' + price + ", 0, '', " + sq(thumb) + ", '', '', " +
      sq(buildStages(type)) + ", '', " + sq(attributes) + ', ' + sq(prt.encoded) +
      ", 1, 1, '', NOW(), NOW(), 'ssa', " + s.styleID + ', ' + money(baseCost) + ', NOW()\n' +
      '  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_products ' +
      'WHERE supplier_style_id=' + s.styleID + ') AS t);');
    added++;
  }

  console.log('\n  ' + added + ' to add · ' + skipped + ' skipped' +
    (apiErrors ? ' · ' + apiErrors + ' unreachable' : ''));
  /* A run where nothing could be reached must not exit 0. The whole failure
     mode this guards is a tool that adds nothing, says so calmly, and is read
     as "S&S has none of these" when the real answer is a dead credential. */
  if (apiErrors) {
    console.error('\n  ' + apiErrors + ' style(s) failed AT THE API, not in the data.\n' +
      '  A 401 here means SSA_API_KEY is wrong or expired — fix the credential\n' +
      '  before reading anything above as "S&S does not carry this style".');
  }
  console.log('\n' + stmts.length + ' statements' + (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));
  if (!APPLY || !stmts.length) process.exit(apiErrors ? 1 : 0);

  mysql(dbUrl, "SET SESSION sql_mode='';\nSTART TRANSACTION;\n" + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
  process.exit(apiErrors ? 1 : 0);
}

const varsArg = (process.argv.find((a) => a.startsWith('--vars=')) || '')
  .slice(7).replace(/^~/, process.env.HOME);

if (process.argv.includes('--from-env') || varsArg) {
  /* The two credentials this needs do not live on the same Railway service:
     SSA_* is on the app service, MYSQL_* on the database's own. So a file may
     supply one set and the live environment the other, and the environment
     wins on conflict — it is the fresher of the two, and a local file goes
     stale exactly when a key is rotated. */
  const fromFile = varsArg ? JSON.parse(require('fs').readFileSync(varsArg, 'utf8')) : {};
  run(process.argv.includes('--from-env')
    ? Object.assign({}, fromFile, process.env)
    : fromFile);
} else {
  let buf = '';
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => run(JSON.parse(buf)));
}
