/* Signs365's whole catalog: every material's price, its options, and the
 * combinations its order screen refuses. Read off the portal on 2026-10-07
 * (each product's own order screen, signed in to June's account).
 *
 * This is the RECORD, for quoting: what we pay and what can be ordered. The
 * prices the shop SELLS at are worked out from it in tools/lib/signage.js
 * (which holds the banner, coro, poster, window, wall, magnet, paper, acrylic
 * and canvas costs it already sells), and a test checks the two agree.
 *
 * Units, exactly as the supplier bills them:
 *   sqft   per square foot; EACH side rounded up to a whole foot (billableSqft)
 *   sqin   per square INCH, not foot (acrylic, window cling, custom magnet)
 *   sheet  per 48x96 sheet, bought whole however much is used
 *   item / set / box   per piece as sold
 * Prices are ex-freight: delivery is $10 a weekday order (signage.js FREIGHT).
 * Production is 24 hours on everything read.
 *
 * NOT YET PRICED (an order screen locks the option until real artwork is
 * uploaded): the gloss/matte laminate on GF 203OAPAE and the other adhesive
 * vinyls, the paper coating, and gloss on foamcore and PVC. Confirm them on
 * the first real order and add them here. */

const READ_ON = '2026-10-07';

const CATALOG = {
  banner: {
    hd_banner:   { id: 18, name: 'HD Banner (vinyl scrim)', unit: 'sqft',
      prices: { '13oz': { single: 1.25 }, '15oz': { single: 1.75 }, '18oz': { single: 2.25, double: 4.25 } },
      options: ['welding (included)', 'grommets (included)', 'rope', 'pole pockets', 'wind slits', 'double-sided'],
      rules: [
        'Grommets and welded edges are included; turning them off saves nothing.',
        'Rope: $1.00 per foot of roped edge, top and/or bottom only. Needs welded edges ON and grommets OFF.',
        'Pole pockets: $10.00 a banner + $1.00 per foot of pocketed edge, any edge, 1" to 4" all the same price. Needs welded edges OFF.',
        'Rope and pole pockets cannot go on the same banner.',
        'Wind slits: $0.50 per square foot, only on banners over 24"x24" and under 120"x120".',
        'Double-sided: 18oz only.',
      ] },
    hdpe:        { id: 20, name: 'HDPE water and tear resistant paper', unit: 'sqft', prices: { single: 1.50 } },
    canvas:      { id: 19, name: 'Canvas 11oz poly-cotton', unit: 'sqft', prices: { single: 4.98 }, rules: ['Indoor only.'] },
    mesh:        { id: 23, name: 'Mesh 8oz, 37% air-flow', unit: 'sqft', prices: { single: 2.44 } },
    poster:      { id: 21, name: 'Poster 8mil satin paper', unit: 'sqft', prices: { single: 2.00 }, rules: ['Short-term indoor.'] },
    no_curl:     { id: 121, name: 'No Curl banner 8mil', unit: 'sqft', prices: { single: 3.00 } },
    econo_stand: { id: 124, name: 'Econo Banner Stand', unit: 'item', prices: { single: 90.00 } },
    econo_stand_plus: { id: 1021, name: 'Econo Banner Stand Plus (retractable, with case)', unit: 'item', prices: { single: 95.00 } },
  },
  rigid: {
    coro:        { id: 13, name: 'Coro (corrugated plastic)', unit: 'sheet',
      prices: { '4mm': { single: 44.00, double: 55.00 }, '10mm': { single: 70.00, double: 90.00 } },
      options: ['double-sided', 'gloss', 'grommets', 'step stakes', 'flute direction'],
      rules: [
        'Gloss: +$4.00 a sheet.',
        'Grommets: +$25.00 a sheet, flat, whatever the layout or spacing.',
        'Step stakes: $1.25 each.',
        'Contour cutting only on full 48"x96" sheets.',
      ] },
    acrylic:     { id: 79, name: 'Acrylic 3/16", printed on the back with a white underbase', unit: 'sqin', prices: { single: 0.10 }, rules: ['Indoor.'] },
    foamcore:    { id: 7, name: 'Foamcore 3/16"', unit: 'sheet', prices: { single: 70.00, double: 80.00 }, options: ['double-sided', 'gloss (price not read)'] },
    pvc:         { id: 14, name: 'PVC', unit: 'sheet', prices: { '3mm': { single: 65.00, double: 85.00 }, '6mm': { single: 95.00, double: 115.00 } } },
    polystyrene: { id: 15, name: 'Polystyrene .03"', unit: 'sheet', prices: { single: 55.00, double: 65.00 } },
    aluminum:    { id: 16, name: 'Aluminum', unit: 'sheet', prices: { '.040': { single: 175.00, double: 200.00 }, '.080': { single: 300.00, double: 325.00 } },
      rules: ['A custom-size rate is also listed ($0.06/$0.07 for .040, $0.10/$0.11 for .080); its unit is not stated on the screen, so quote by the sheet.'] },
    backlite:    { id: 38, name: 'Backlite polycarbonate .01"', unit: 'sqft', prices: { single: 4.00 }, rules: ['For backlit boxes.'] },
    jbond:       { id: 39, name: 'Jbond aluminum composite', unit: 'sheet', prices: { '3mm': { single: 160.00, double: 180.00 }, '6mm': { single: 220.00, double: 260.00 } },
      rules: ['A custom-size rate is also listed (3mm $0.05/$0.06, 6mm $0.08/$0.09); unit not stated, so quote by the sheet.'] },
    polyair:     { id: 53, name: 'PolyAir 4mm bubble core', unit: 'sheet', prices: { single: 50.00, double: 60.00 } },
  },
  adhesive: {
    ij35c:          { id: 59, name: '3M IJ-35C', unit: 'sqft', prices: { single: 2.99 } },
    controltac:     { id: 41, name: '3M Controltac print wrap film', unit: 'sqft', prices: { single: 4.99 } },
    window_cling:   { id: 160, name: 'Window cling', unit: 'sqin', prices: { single: 0.02 }, options: ['applied inside or outside', 'viewed from inside or outside'] },
    gf203:          { id: 122, name: 'GF 203OAPAE vinyl', unit: 'sqft', prices: { single: 2.49 }, options: ['gloss / matte / no laminate (price not read)'] },
    gf830:          { id: 163, name: 'GF830 AutoMark', unit: 'sqft', prices: { single: 3.99 } },
    orajet_clear:   { id: 42, name: 'Orajet clear', unit: 'sqft', prices: { single: 6.00 } },
    one_way_window: { id: 43, name: 'One Way Window perforated', unit: 'sqft', prices: { laminate: 3.99, no_laminate: 2.75 },
      rules: ['50/50 and 70/30 perforation cost the same.', 'Single-sided only.'] },
    dual_view:      { id: 24, name: 'Dual View', unit: 'sqft', prices: { single: 2.79, double: 4.99 } },
    footprints:     { id: 47, name: 'FootPrints floor graphic', unit: 'sqft', prices: { single: 2.50 } },
    bootprints:     { id: 120, name: 'BootPrints heavy floor graphic', unit: 'sqft', prices: { single: 12.50 } },
    low_tac_wall:   { id: 45, name: 'Low Tac Wall fabric', unit: 'sqft', prices: { single: 3.47 }, rules: ['Indoor only.'] },
    dry_erase:      { id: 46, name: 'Dry Erase', unit: 'sqft', prices: { single: 3.50 } },
    reflective:     { id: 44, name: 'Reflective', unit: 'sqft', prices: { single: 8.00 } },
  },
  handheld: {
    paper:     { id: 37, name: 'Paper 16pt', unit: 'sheet', prices: { single: 2.00, double: 2.00 }, options: ['coating (price not read)', 'orientation'] },
    hard_card: { id: 72, name: 'Hard Card', unit: 'set', prices: { '.040': { single: 55.00, double: 60.00 }, '.025': { single: 40.00, double: 45.00 } } },
  },
  magnet: {
    vehicle: { id: 48, name: 'Vehicle magnet (fixed sizes)', unit: 'item',
      prices: { '18x12': 11.95, '24x12': 14.95, '24x18': 20.95, '42x12': 29.95, '72x24': 89.70 },
      rules: ['Rounded corners (1/4", 1/2", 3/4") are free.'] },
    custom:  { id: 164, name: 'Custom magnet', unit: 'sqin', prices: { single: 0.07 } },
  },
  misc: {
    step_stakes:    { id: 58, name: 'Step stakes, box', unit: 'box', prices: { single: 69.00 } },
    hd_step_stakes: { id: 125, name: 'Heavy duty step stakes, box', unit: 'box', prices: { single: 62.50 } },
    standoffs:      { id: 1018, name: 'Standoffs, box of 50', unit: 'box', prices: { silver: 100.00, black: 150.00 } },
    catalog:        { id: 5, name: 'Printed product catalog', unit: 'item', prices: { plain: 19.95, branded: 24.95 } },
  },
  apparel: {
    dtf_film: { id: 1013, name: 'DTF transfer film', unit: 'linear inch', prices: { single: 0.50 } },
  },
};

/** Every product as a flat list: { group, key, ...product }. */
const all = () => Object.entries(CATALOG).flatMap(([group, items]) =>
  Object.entries(items).map(([key, p]) => ({ group, key, ...p })));

module.exports = { READ_ON, CATALOG, all };
