/* Sign families for the designer (2026-10-08): every Signs365 product the
 * shop sells online, grouped by what the customer is making. Each family is
 * ONE designer product with only its own materials and upgrades, so an option
 * never appears on an item it does not belong to (owner, 2026-10-07).
 *
 * Costs come from tools/lib/signage.js and tools/lib/signs365-catalog.js
 * (read off the Signs365 order screens 2026-10-07); nothing is re-typed here
 * except the few catalogue rows signage.js does not hold yet, which are read
 * from the catalogue record by name.
 *
 * TWO WAYS A FAMILY IS SIZED
 *   area   the customer types width and height in inches. The price per piece
 *          is worked out by ONE small formula, the same one add-signage.js uses
 *          for its sign methods (cost + shop time, x2, evened up):
 *              units = sqft: each side rounded UP to a whole foot, multiplied
 *                      sqin: width x height
 *              piece = evenUp((units x cost + labour_each) x markup)
 *          The designer holds a copy of that formula in PHP and in the browser,
 *          and tests/sign-agreement (designer) checks both against this file.
 *   stock  a fixed list of sizes. Every price is precomputed here as a ladder
 *          by quantity (sheet nesting makes ten signs cheaper each than one),
 *          so the designer only looks it up.
 *
 * Upgrades: a per-piece price, offered only on the materials listed. Upgrades
 * charged per SHEET (coro gloss, coro grommets) are folded into the ladders.
 * Delivery: Signs365's charge once per line, inside the price (as banners).
 */

const sg = require('./signage');
const cat = require('./signs365-catalog').CATALOG;

const evenUp = sg.evenUp;
const labourEach = (kind) => sg.labourCost(kind, 1);

/* Stretcher bars, per bar, Stretcher Bar Warehouse 1-1/2" heavy duty radiata
   pine, single bars (bought per job; owner 2026-10-07). Read 2026-10-08. Their
   box of 20 is only ~3% less. They brace bars over 44", so no standard size
   below needs one. Shipping from them is not included (tiered flat rate). */
const STRETCHER_BAR = { 8: 3.35, 10: 3.40, 11: 3.46, 12: 3.65, 14: 4.05, 16: 4.59, 18: 5.13, 20: 5.67,
  24: 6.75, 30: 8.37, 36: 9.99, 40: 11.07 };
const CANVAS_WRAP_IN = 3;   // 1.5" depth + 1.5" to staple, each side

/** Supplier cost of a stretched gallery-wrap canvas at WxH inches. */
function stretchedCanvasCost(w, h) {
  const print = sg.billableSqft(w + 2 * CANVAS_WRAP_IN, h + 2 * CANVAS_WRAP_IN) * sg.CANVAS;
  const bw = STRETCHER_BAR[w], bh = STRETCHER_BAR[h];
  if (bw === undefined || bh === undefined) return null;
  return print + 2 * bw + 2 * bh;
}

/* Labour for stretching: the rigid row (mount, inspect, wrap) plus the
   stretching itself, estimated at 20 minutes a canvas — UNTIMED, like the
   other labour rows in signage.js. */
const STRETCH_MINUTES = 20;

/* ── Families ────────────────────────────────────────────────────────────── */

const m = (key, label, unit, cost, extra = {}) => ({ key, label, unit, cost, ...extra });

const FAMILIES = {
  yard_sign: {
    label: 'Yard Signs', sizing: 'stock', target_dpi: 150, labour: 'yard_sign',
    note: 'Corrugated plastic signs. 4mm takes step stakes; 10mm is stiff enough to stand on its own.',
    sizes: [[18, 12], [24, 18], [36, 24], [48, 36], [96, 48]],
    materials: [
      m('4s', '4mm coroplast, one side', 'sheet', sg.CORO[4].single, { mm: 4, sides: 'single' }),
      m('4d', '4mm coroplast, both sides', 'sheet', sg.CORO[4].double, { mm: 4, sides: 'double', double: true }),
      m('10s', '10mm coroplast, one side', 'sheet', sg.CORO[10].single, { mm: 10, sides: 'single' }),
      m('10d', '10mm coroplast, both sides', 'sheet', sg.CORO[10].double, { mm: 10, sides: 'double', double: true }),
    ],
    sheet_upgrades: {
      gloss: { label: 'Gloss finish', per_sheet: 4.00 },
      grommets: { label: 'Grommets', per_sheet: 25.00 },
    },
    upgrades: [
      { key: 'stake', label: 'A step stake with each sign', cost: sg.STEP_STAKE, only: ['4s', '4d'] },
    ],
    oversized_freight: sg.FREIGHT.oversized_coro,
    /* The minimum is a full Signs365 sheet: coro is bought by the whole 48x96
       sheet, so one sign pays for every sign that would have fit beside it.
       One 36x24 was $115 + freight against a $30-58 market (owner, 2026-10-10,
       "1 36x24 board is $125 when more can fit on the sheet"); four, a full
       sheet, are about $30 each. Capped at YARD_SIGN_MIN_QTY (10): an 18x12
       fits 20 but 10 already prices inside the market. 96x48 is one board. */
    min_qty_by_size: Object.fromEntries([[18, 12], [24, 18], [36, 24], [48, 36], [96, 48]]
      .map(([w, h]) => [`${w}x${h}`, Math.max(1, Math.min(sg.perSheet(w, h), sg.YARD_SIGN_MIN_QTY))])),
    /* ...and sold in whole sheets where a sheet holds 2-9: a 5th 36x24 opens a
       second sheet, so selling "any number from 4" priced the 4 at the 5's
       $42 (the ladder never lets a bigger order cost more each). In sets of a
       sheet, 4 is $30 each and 8 is two sheets. 18x12 and 24x18 sit at the
       10 minimum, already inside the market, so they keep a step of 1. */
    qty_step_by_size: Object.fromEntries([[18, 12], [24, 18], [36, 24], [48, 36], [96, 48]]
      .map(([w, h]) => { const per = sg.perSheet(w, h); return [`${w}x${h}`, per >= 2 && per < sg.YARD_SIGN_MIN_QTY ? per : 1]; })),
  },
  rigid_sign: {
    label: 'Rigid Signs', sizing: 'stock', target_dpi: 150, labour: 'rigid',
    note: 'Flat signs on board, plastic or metal, for walls, easels and posts.',
    sizes: [[18, 12], [24, 18], [36, 24], [48, 36], [96, 48]],
    materials: [
      m('foam_s', 'Foamcore 3/16", one side', 'sheet', cat.rigid.foamcore.prices.single, { foam: true }),
      m('foam_d', 'Foamcore 3/16", both sides', 'sheet', cat.rigid.foamcore.prices.double, { foam: true, double: true }),
      m('pvc3_s', 'PVC 3mm, one side', 'sheet', cat.rigid.pvc.prices['3mm'].single),
      m('pvc3_d', 'PVC 3mm, both sides', 'sheet', cat.rigid.pvc.prices['3mm'].double, { double: true }),
      m('pvc6_s', 'PVC 6mm, one side', 'sheet', cat.rigid.pvc.prices['6mm'].single),
      m('pvc6_d', 'PVC 6mm, both sides', 'sheet', cat.rigid.pvc.prices['6mm'].double, { double: true }),
      m('styrene_s', 'Polystyrene .03", one side', 'sheet', cat.rigid.polystyrene.prices.single),
      m('polyair_s', 'PolyAir 4mm, one side', 'sheet', cat.rigid.polyair.prices.single),
      m('alu040_s', 'Aluminum .040", one side', 'sheet', cat.rigid.aluminum.prices['.040'].single),
      m('alu080_s', 'Aluminum .080", one side', 'sheet', cat.rigid.aluminum.prices['.080'].single),
      m('jbond3_s', 'Aluminum composite (Jbond) 3mm, one side', 'sheet', cat.rigid.jbond.prices['3mm'].single),
      m('jbond6_s', 'Aluminum composite (Jbond) 6mm, one side', 'sheet', cat.rigid.jbond.prices['6mm'].single),
    ],
    upgrades: [
      /* Four standoffs a sign, from the silver box of 50 ($100 = $2 each). */
      { key: 'standoffs', label: 'Wall standoffs (4, polished silver)', cost: 4 * (cat.misc.standoffs.prices.silver / 50),
        only: ['pvc3_s', 'pvc6_s', 'alu040_s', 'alu080_s', 'jbond3_s', 'jbond6_s'] },
    ],
    oversized_freight: sg.FREIGHT.oversized_coro,
  },
  window_graphic: {
    label: 'Window Graphics', sizing: 'area', target_dpi: 150, labour: 'adhesive',
    note: 'For shop windows and glass doors.',
    limits: { min: 6, max_w: 120, max_h: 120, max_short: 54 },
    materials: [
      m('oww', 'One Way Window (see-through from inside)', 'sqft', sg.ONE_WAY_WINDOW.no_laminate),
      m('oww_lam', 'One Way Window, gloss laminated (longer life)', 'sqft', sg.ONE_WAY_WINDOW.laminate),
      m('cling', 'Window cling (no adhesive, reusable)', 'sqin', cat.adhesive.window_cling.prices.single),
      m('dual_s', 'Dual View (reads from both sides), one print', 'sqft', cat.adhesive.dual_view.prices.single),
      m('dual_d', 'Dual View, different print each side', 'sqft', cat.adhesive.dual_view.prices.double, { double: true }),
      m('clear', 'Clear vinyl (Orajet clear)', 'sqft', cat.adhesive.orajet_clear.prices.single),
    ],
    upgrades: [
      { key: 'outside', label: 'Mounted on the outside of the glass', cost: 0, only: ['cling'] },
    ],
  },
  wall_floor: {
    label: 'Wall & Floor Graphics', sizing: 'area', target_dpi: 150, labour: 'adhesive',
    note: 'Wall murals, floor decals and specialty surfaces.',
    limits: { min: 6, max_w: 120, max_h: 120, max_short: 54 },
    materials: [
      m('lowtac', 'Removable wall fabric (indoor only)', 'sqft', sg.ADHESIVE.low_tac_wall),
      m('ij35c', '3M IJ-35C vinyl (walls, smooth surfaces)', 'sqft', cat.adhesive.ij35c.prices.single),
      m('controltac', '3M Controltac (textured walls, long life)', 'sqft', sg.ADHESIVE.controltac_3m),
      m('footprints', 'Floor graphic (FootPrints)', 'sqft', cat.adhesive.footprints.prices.single),
      m('bootprints', 'Heavy-traffic floor graphic (BootPrints)', 'sqft', cat.adhesive.bootprints.prices.single),
      m('dryerase', 'Dry-erase vinyl', 'sqft', cat.adhesive.dry_erase.prices.single),
      m('reflective', 'Reflective vinyl', 'sqft', cat.adhesive.reflective.prices.single),
    ],
    upgrades: [],
  },
  vehicle_graphic: {
    label: 'Vehicle Graphics', sizing: 'area', target_dpi: 150, labour: 'adhesive',
    note: 'Lettering and graphics for cars, vans and trucks.',
    limits: { min: 6, max_w: 120, max_h: 120, max_short: 54 },
    materials: [
      m('controltac', '3M Controltac wrap film (gloss laminated)', 'sqft', sg.ADHESIVE.controltac_3m),
      m('gf830', 'GF830 AutoMark (economy vehicle vinyl)', 'sqft', cat.adhesive.gf830.prices.single),
    ],
    upgrades: [],
  },
  vehicle_magnet: {
    label: 'Vehicle Magnets', sizing: 'stock', target_dpi: 150, labour: 'magnet',
    note: 'Stock sizes; they lift off for the car wash.',
    sizes: Object.keys(sg.MAGNET_FIXED).map((k) => k.split('x').map(Number)),
    materials: [m('magnet', 'Vehicle magnet, one side', 'item', null)],
    upgrades: [
      { key: 'corners', label: 'Rounded corners', cost: 0, only: ['magnet'] },
    ],
  },
  custom_magnet: {
    label: 'Custom Magnets', sizing: 'area', target_dpi: 150, labour: 'magnet',
    note: 'Any size, priced by the square inch.',
    limits: { min: 2, max_w: 48, max_h: 48, max_short: 24 },
    materials: [m('magnet', 'Magnet, one side', 'sqin', sg.MAGNET_SQIN)],
    upgrades: [
      { key: 'corners', label: 'Rounded corners', cost: 0, only: ['magnet'] },
    ],
  },
  photo_panel: {
    label: 'Photo Panels & Prints', sizing: 'area', target_dpi: 200, labour: 'rigid',
    note: 'Wall art and photo prints, indoor.',
    limits: { min: 6, max_w: 96, max_h: 96, max_short: 48 },
    materials: [
      m('acrylic', 'Acrylic 3/16", printed behind with a white base', 'sqin', sg.ACRYLIC_SQIN),
      m('canvas', 'Canvas print, rolled (not stretched)', 'sqft', sg.CANVAS),
      m('poster', 'Poster paper (satin)', 'sqft', sg.POSTER),
    ],
    upgrades: [
      { key: 'standoffs', label: 'Wall standoffs (4, polished silver)', cost: 4 * (cat.misc.standoffs.prices.silver / 50), only: ['acrylic'] },
    ],
  },
  stretched_canvas: {
    label: 'Stretched Canvas', sizing: 'stock', target_dpi: 200, labour: 'rigid',
    note: 'Gallery-wrapped on 1-1/2" bars, ready to hang.',
    sizes: [[10, 8], [14, 11], [12, 12], [20, 16], [24, 18], [30, 20], [36, 24], [40, 30]],
    materials: [m('canvas', 'Canvas, gallery wrapped 1-1/2"', 'item', null)],
    upgrades: [],
  },
};

const LADDER_BANDS = [1, 2, 3, 5, 10, 25, 50, 100, 250];

/** Every on/off combination of a family's per-sheet upgrades, as sorted keys ('' = none). */
function sheetCombos(fam) {
  const keys = Object.keys(fam.sheet_upgrades || {}).sort();
  const out = [''];
  for (const k of keys) for (const c of out.slice()) out.push(c ? `${c}+${k}` : k);
  return out.map((c) => c.split('+').filter(Boolean).sort().join('+'));
}

/** Supplier cost of `qty` stock pieces, or null when the size does not fit. */
function stockCost(famKey, fam, mat, w, h, qty, combo) {
  if (famKey === 'vehicle_magnet') return qty * sg.magnetCost(w, h);
  if (famKey === 'stretched_canvas') { const c = stretchedCanvasCost(w, h); return c === null ? null : qty * c; }
  const per = sg.perSheet(w, h);
  if (!per) return null;
  const sheets = Math.ceil(qty / per);
  let perSheetCost = mat.cost;
  for (const k of combo ? combo.split('+') : []) perSheetCost += fam.sheet_upgrades[k].per_sheet;
  return sheets * perSheetCost;
}

/** Labour on a stock line of `qty`. */
function stockLabour(famKey, fam, qty) {
  const l = sg.labourCost(fam.labour, qty);
  return famKey === 'stretched_canvas' ? l + (sg.SHOP_RATE * STRETCH_MINUTES * qty) / 60 : l;
}

/** A stock ladder: [[minQty, perPiece], ...], each band at the WORST per-piece
 *  cost inside it so the price never rises with quantity, never under x2. */
function stockLadder(famKey, fam, mat, w, h, combo) {
  const out = [];
  let worst = 0;
  const min = (fam.min_qty_by_size || {})[`${w}x${h}`] || 1;
  /* A size sold in sets (qty_step_by_size) has bands on whole sets, and only
     whole sets are priced: a quantity between them is not for sale. */
  const step = (fam.qty_step_by_size || {})[`${w}x${h}`] || 1;
  const up = (b) => Math.ceil(b / step) * step;
  const bands = [...new Set(LADDER_BANDS.map(up).filter((b) => b >= min))];
  if (bands[0] !== min) bands.unshift(min);
  for (let i = bands.length - 1; i >= 0; i--) {
    const lo = bands[i], hi = (bands[i + 1] || lo + step) - 1;
    let bandWorst = 0;
    for (let q = lo; q <= Math.min(hi, lo + 60); q += step) {
      const c = stockCost(famKey, fam, mat, w, h, q, combo);
      if (c === null) return null;
      bandWorst = Math.max(bandWorst, (c + stockLabour(famKey, fam, q)) / q);
    }
    worst = Math.max(worst, bandWorst);
    out.unshift([lo, evenUp(worst * sg.MARKUP)]);
  }
  return out;
}

/** The area formula, the one the designer copies: price per piece or null. */
function areaPrice(fam, mat, w, h) {
  const L = fam.limits;
  if (!(w >= L.min && h >= L.min && w <= L.max_w && h <= L.max_h && Math.min(w, h) <= L.max_short)) return null;
  const units = mat.unit === 'sqft' ? sg.billableSqft(w, h) : w * h;
  return evenUp((units * mat.cost + labourEach(fam.labour)) * sg.MARKUP);
}

/** The whole table, as /api/pricing-rules publishes it under `signs`. */
function signsTable() {
  const families = {};
  for (const [key, fam] of Object.entries(FAMILIES)) {
    const out = {
      label: fam.label, note: fam.note, sizing: fam.sizing, target_dpi: fam.target_dpi,
      markup: sg.MARKUP, freight: sg.FREIGHT.standard,
      materials: fam.materials.map((x) => ({ key: x.key, label: x.label, unit: x.unit, double: !!x.double,
        ...(fam.sizing === 'area' ? { cost: x.cost } : {}) })),
      upgrades: fam.upgrades.map((u) => ({ key: u.key, label: u.label, price: u.cost ? evenUp(u.cost * sg.MARKUP) : 0, only: u.only })),
    };
    if (fam.sizing === 'area') {
      out.limits = fam.limits;
      out.labour_each = Math.round(labourEach(fam.labour) * 10000) / 10000;
    } else {
      out.sizes = fam.sizes.map(([w, h]) => ({ key: `${w}x${h}`, w, h, label: `${w}" x ${h}"`,
        step: (fam.qty_step_by_size || {})[`${w}x${h}`] || 1 }));
      out.sheet_upgrades = Object.fromEntries(Object.entries(fam.sheet_upgrades || {}).map(([k, v]) => [k, { label: v.label }]));
      out.prices = {};
      out.freight_by_size = {};
      for (const mat of fam.materials) {
        out.prices[mat.key] = {};
        for (const [w, h] of fam.sizes) {
          const sk = `${w}x${h}`;
          out.prices[mat.key][sk] = {};
          for (const combo of sheetCombos(fam)) {
            const lad = stockLadder(key, fam, mat, w, h, combo);
            if (lad) out.prices[mat.key][sk][combo] = lad;
          }
          /* A full 48x96 board ships oversized (June, 2026-09-22): $75, foam $199. */
          if (fam.oversized_freight && sg.isFullBoard(Math.min(w, h), Math.max(w, h))) {
            out.freight_by_size[`${sk}:${mat.key}`] = mat.foam ? sg.FREIGHT.oversized_foam : fam.oversized_freight;
          }
        }
      }
    }
    families[key] = out;
  }
  return { families, read_on: require('./signs365-catalog').READ_ON };
}

module.exports = { FAMILIES, STRETCHER_BAR, LADDER_BANDS, stretchedCanvasCost, stockLadder, areaPrice, sheetCombos, signsTable };
