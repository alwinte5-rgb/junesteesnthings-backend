#!/usr/bin/env node
/* Write tools/data/sinalite-costs.json from what tools/sinalite-capture.js read.
 *
 *   node tools/sinalite-assemble.js <captured.json>
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
    name: 'Trifold Brochures — 8.5x11, folded', label: 'Trifold Brochures', group: 'Print & Paper',
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
    name: 'Table Covers — printed polyester', label: 'Table Covers', group: 'Signs & Display',
    design: 'table_cover', online: true, from: ['table_cover_6', 'table_cover_8'],
    url: 'https://sinalite.com/en_us/large-format/table-covers.html',
    note: 'Full-color printed polyester table cover, machine washable.',
    materials: [{ key: '3sided', label: '3-sided (open back)' }, { key: '4sided', label: '4-sided (closed back)' }],
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
    url: 'https://sinalite.com/en_us/decals/cut-to-shape/white-vinyl-permanent.html',
    note: 'Permanent white vinyl stickers, full color, cut to the shape.',
    materials: [{ key: 'white_perm', label: 'White vinyl, permanent' }],
    sizes: [{ key: 'circle2', label: '2" circle' }, { key: 'circle3', label: '3" circle' },
      { key: 'rect2x3', label: '2" x 3" rectangle' }, { key: 'rect3x4', label: '3" x 4" rectangle' }],
  },
  roll_label: {
    name: 'Roll Labels — white gloss BOPP', label: 'Roll Labels', group: 'Labels, Stickers & Packaging',
    design: 'label', online: false,
    url: 'https://sinalite.com/en_us/packaging/roll-labels/bopp-labels.html',
    note: 'Waterproof white gloss BOPP product labels on a roll, gloss laminated, full color.',
    materials: [{ key: 'white_bopp', label: 'White gloss BOPP, gloss laminated' }],
    sizes: [{ key: 'circle2', label: '2" circle' }, { key: 'circle3', label: '3" circle' },
      { key: 'rect2x3', label: '2" x 3" rectangle' }, { key: 'rect3x4', label: '3" x 4" rectangle' }],
  },
};

function assemble(captured, meta = META) {
  const products = {};
  for (const [key, m] of Object.entries(meta)) {
    const sources = m.from || [key];
    const rows = [];
    for (const src of sources) for (const r of ((captured[src] || {}).rows || [])) rows.push(r);
    if (!rows.length) continue;
    const { from, ...rest } = m;
    products[key] = {
      ...rest,
      description: m.note,
      turnaround: rows.map((r) => r.turnaround).find(Boolean) || null,
      rows: rows.map(({ mat, size, qty, cost, ship, ship_assumed }) =>
        ({ mat, size, qty, cost, ship, ...(ship_assumed ? { ship_assumed: true } : {}) })),
    };
  }
  return products;
}

module.exports = { META, assemble };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('usage: sinalite-assemble.js <captured.json>'); process.exit(2); }
  const captured = JSON.parse(fs.readFileSync(file, 'utf8'));
  const products = assemble(captured);
  const out = {
    captured: new Date().toISOString(),
    ship_to: 'Chicago IL 60657 (the shop), cheapest rate SinaLite offers',
    source: 'tools/sinalite-capture.js, logged-in SinaLite trade prices (sale prices included)',
    products,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  for (const [k, p] of Object.entries(products)) console.log(k.padEnd(12), String(p.rows.length).padStart(3), 'rows ', p.name);
}
