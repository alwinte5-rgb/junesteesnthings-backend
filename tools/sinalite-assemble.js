#!/usr/bin/env node
/* Write tools/data/sinalite-costs.json from what tools/sinalite-capture.js read.
 *
 *   node tools/sinalite-assemble.js <captured.json> [--captured=2026-10-15]
 *
 * <captured.json> is { "<key>": { rows: [...] }, ... } — the capture results
 * keyed by family. Several captures can feed one family (the 6 ft and 8 ft
 * table covers are separate SinaLite pages): list them under `from`.
 *
 * What each item IS — its catalogue name, quote category, design service and
 * whether the designer sells it online — lives here, next to the rows it
 * describes, so a re-capture never loses it. The NAME is what the quote form
 * matches a product's ladder by; change one only together with the catalogue
 * row (tools/add-sinalite-products.js).
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'data', 'sinalite-costs.json');

const META = {
  brochure: {
    name: 'Trifold Brochures — 8.5x11, score and fold', label: 'Trifold Brochures', group: 'Print & Paper',
    /* Former names: the catalogue row is found (and renamed) by these, and a
       row still under one keeps pricing until it is renamed (owner, 2026-10-15). */
    aliases: ['Trifold Brochures — 8.5x11, folded'],
    design: 'brochure', online: false,
    url: 'https://sinalite.com/en_us/print-products/brochures/100lb-gloss-text.html',
    note: '100lb gloss text, full color, scored and tri-folded (scoring stops the fold cracking). Opens to 8.5" x 11".',
    materials: [{ key: '1s', label: 'Printed one side' }, { key: '2s', label: 'Printed both sides' }],
    sizes: [{ key: '8.5x11', label: '8.5" x 11" (folds to 3.67" x 8.5")' }],
  },
  calendar: {
    name: 'Wall Calendars — 8.5x11', label: 'Wall Calendars', group: 'Print & Paper',
    design: 'calendar', online: true,
    url: 'https://sinalite.com/en_us/print-products/calendars/100lb-gloss-text.html',
    note: 'Saddle-stitched wall calendar on 100lb gloss text, full color, cover plus twelve months.',
    materials: [{ key: '28pg', label: '28 pages, self cover' }, { key: '24pg_cover', label: '24 pages plus a heavier cover' }],
    sizes: [{ key: '8.5x11', label: '8.5" x 11"' }],
  },
  table_cover: {
    name: 'Table Covers — full-color, printed all over', label: 'Table Covers', group: 'Signs & Display',
    design: 'table_cover', online: true, from: ['table_cover_6', 'table_cover_8'],
    url: 'https://sinalite.com/en_us/large-format/table-covers.html',
    /* WHAT IS PRINTED (checked 2026-10-15). SinaLite's only stock here is
       "Polyester Printed 1 Side (4/0)", and its support told the owner that
       means one side of the cover. Their own file-prep templates say
       otherwise: 6-feet-table-3-sided.pdf is ONE 127" x 60" artwork over the
       top, front and both ends, and the 4-sided one 128" x 86" over all four
       sides — "fill with art". "1 Side (4/0)" is one FACE of the fabric, the
       outside, so the whole visible cover prints, as in their photo. A
       front-only design is the same item at the same price, so there is no
       second product. "3/4 Sided" is the cut: open or closed back. */
    note: 'Polyester table cover, machine washable. One full-color design printed edge to edge over the top, front and ends (and the back on the closed-back cover); leave panels plain for a front-only look at the same price.',
    materials: [{ key: '3sided', label: '3-sided (open back), printed all over' },
      { key: '4sided', label: '4-sided (closed back), printed all over' }],
    sizes: [{ key: '6ft', label: 'Fits a 6 ft table' }, { key: '8ft', label: 'Fits an 8 ft table' }],
  },
  xframe: {
    name: 'X-Frame Banners — 23.6x63', label: 'X-Frame Banners', group: 'Signs & Display',
    design: null, online: true,
    url: 'https://sinalite.com/en_us/large-format/x-frame-banners/13oz-matte-vinyl.html',
    note: '13oz matte vinyl banner with grommets in all four corners, with or without the X-frame stand.',
    materials: [{ key: 'banner', label: 'Banner only' }, { key: 'stand', label: 'Banner and X-frame stand' }],
    sizes: [{ key: '23.6x63', label: '23.6" x 63"' }],
  },
  sticker: {
    name: 'Cut-to-Shape Stickers — white vinyl', label: 'Cut-to-Shape Stickers', group: 'Labels, Stickers & Packaging',
    design: 'label', online: true,
    /* The $25 label design is in every run's price, never a separate line
       (owner, 2026-10-20). tools/lib/sinalite.js adds it to each run total. */
    design_in: 25,
    url: 'https://sinalite.com/en_us/decals/cut-to-shape/white-vinyl-permanent.html',
    note: 'Permanent white vinyl stickers, full color, cut to the shape.',
    materials: [{ key: 'white_perm', label: 'White vinyl, permanent' }],
    sizes: [{ key: 'circle2', label: '2" circle' }, { key: 'circle3', label: '3" circle' },
      { key: 'rect2x3', label: '2" x 3" rectangle' }, { key: 'rect3x4', label: '3" x 4" rectangle' }],
  },
  roll_label: {
    name: 'Roll Labels — white gloss BOPP', label: 'Roll Labels', group: 'Labels, Stickers & Packaging',
    design: 'label', online: false,
    design_in: 25,
    url: 'https://sinalite.com/en_us/packaging/roll-labels/bopp-labels.html',
    note: 'Waterproof white gloss BOPP product labels on a roll, gloss laminated, full color.',
    materials: [{ key: 'white_bopp', label: 'White gloss BOPP, gloss laminated' }],
    sizes: [{ key: 'circle2', label: '2" circle' }, { key: 'circle3', label: '3" circle' },
      { key: 'rect2x3', label: '2" x 3" rectangle' }, { key: 'rect3x4', label: '3" x 4" rectangle' }],
  },
  pouch: {
    name: 'Stand-Up Pouches — white, zipper', label: 'Stand-Up Pouches', group: 'Labels, Stickers & Packaging',
    design: 'pouch', online: false,
    /* Any quantity from 500 is typed in, not picked from set runs. */
    any_qty: true,
    url: 'https://sinalite.com/en_us/packaging/flexible-packaging/stand-up-pouches-2.html',
    note: 'Custom printed stand-up pouches: gloss laminated, white inside, resealable zipper and tear notch, full color. Minimum 500.',
    materials: [{ key: 'white_zip', label: 'White, gloss, zipper and tear notch' }],
    sizes: [{ key: '4.375x6x2', label: '4.375" x 6" x 2" gusset' }, { key: '5x8x3', label: '5" x 8" x 3" gusset' },
      { key: '7x9x3', label: '7" x 9" x 3" gusset' }],
  },
  /* Drinkware: SinaLite sells any quantity from 1 with a bulk discount, and
     the price includes ONE printed side. Their "2 sides" option (+$7.02 on
     mugs, +$6.29 on tumblers) does not show in the page's total, so it is
     not in these prices — a two-sided job needs that added by hand. */
  mug: {
    name: 'Ceramic Mugs — 11oz, printed', label: 'Ceramic Mugs', group: 'Drinkware',
    design: null, online: true, any_qty: true,
    url: 'https://sinalite.com/en_us/promotional-products/mugs/11oz-ceramic-mug.html',
    note: 'White 11oz ceramic mug, full-color sublimation print on one side. No minimum.',
    materials: [{ key: '1side', label: 'Printed one side' }],
    sizes: [{ key: '11oz', label: '11 oz' }],
  },
  tumbler: {
    name: 'Tumblers — 20oz stainless, printed', label: 'Tumblers', group: 'Drinkware',
    design: null, online: true, any_qty: true,
    url: 'https://sinalite.com/en_us/promotional-products/tumblers/20-oz-tumbler.html',
    note: '20oz stainless steel tumbler with clear lid and steel straw, full-color print on one side. No minimum.',
    materials: [{ key: '1side', label: 'Printed one side' }],
    sizes: [{ key: '20oz', label: '20 oz' }],
  },
  /* Bottles (17oz stainless, https://sinalite.com/en_us/promotional-products/
     bottles/17oz-stainless-steel-bottle.html) go here once captured with
     dwCapture — left out until then, because a declared item must have prices. */
};

/** The slowest of SinaLite's turnaround texts, by their largest day count. */
function slowest(list) {
  const days = (t) => /next/i.test(t) ? 1 : Math.max(0, ...((String(t).match(/\d+/g) || []).map(Number)));
  return list.filter(Boolean).sort((a, b) => days(b) - days(a))[0] || null;
}

function assemble(captured, meta = META) {
  const products = {};
  for (const [key, m] of Object.entries(meta)) {
    const sources = m.from || [key];
    const rows = [];
    for (const src of sources) for (const r of ((captured[src] || {}).rows || [])) rows.push(r);
    /* Every declared item must have prices: a silent skip left a declared
       item out of the catalogue with nothing saying so (Codex on #293). */
    if (!rows.length) throw new Error(key + ' is declared but has no captured rows — capture it, or take it out of META');
    const { from, ...rest } = m;
    products[key] = {
      ...rest,
      description: m.note,
      /* The SLOWEST tier's turnaround: brochures take 4 days up to 1,000 and
         4-5 from 2,500, and a ready date must hold for the big run (Codex on
         #293). */
      turnaround: slowest(rows.map((r) => r.turnaround)),
      rows: rows.map(({ mat, size, qty, cost, ship, ship_assumed }) =>
        ({ mat, size, qty, cost, ship, ...(ship_assumed ? { ship_assumed: true } : {}) })),
    };
  }
  return products;
}

module.exports = { META, assemble };

if (require.main === module) {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: sinalite-assemble.js <captured.json>'); process.exit(2); }
  const captured = JSON.parse(fs.readFileSync(file, 'utf8'));
  const products = assemble(captured);
  /* A capture that lost a whole product must not drop it from the file: its
     catalogue row would stop pricing and every quote with it would be refused
     (Codex on #293). Adding new products is fine; losing one is not. */
  let before = {};
  try { before = JSON.parse(fs.readFileSync(OUT, 'utf8')).products || {}; } catch { /* first run */ }
  const lost = Object.keys(before).filter((k) => !products[k]);
  if (lost.length) { console.error('refusing: these products would be dropped: ' + lost.join(', ') + ' — capture them again'); process.exit(1); }
  /* The date is when SinaLite's prices were READ, not when this ran: re-running
     it to change a label must not make old (sale) prices look fresh. A new
     capture passes --captured=<date>; otherwise the existing file's date stays. */
  const flag = (process.argv.find((a) => a.startsWith('--captured=')) || '').slice(11);
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')).captured; } catch { /* first run */ }
  const when = flag ? new Date(flag) : prev ? new Date(prev) : null;
  if (!when || isNaN(when)) { console.error('pass --captured=<date the prices were read>'); process.exit(2); }
  const out = {
    captured: when.toISOString(),
    ship_to: 'Chicago IL 60657 (the shop), cheapest rate SinaLite offers',
    source: 'tools/sinalite-capture.js, logged-in SinaLite trade prices at REGULAR price (SinaLite sales left out; the shop runs its own)',
    products,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  for (const [k, p] of Object.entries(products)) console.log(k.padEnd(12), String(p.rows.length).padStart(3), 'rows ', p.name);
}
