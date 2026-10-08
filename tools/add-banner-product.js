#!/usr/bin/env node
/* The any-size vinyl banner in the designer (2026-10-07).
 *
 *   node tools/add-banner-product.js --vars=~/.jtees-art.json            dry run
 *   node tools/add-banner-product.js --vars=~/.jtees-art.json --apply    write
 *
 * One product, "Custom Size Vinyl Banner", that the customer designs on: they
 * pick the vinyl and the width and height in whole feet. It carries NO price
 * of its own and no printing method. The price comes from the backend's
 * banner table (tools/lib/signage.js bannerTable, published on
 * /api/pricing-rules), which the designer's jt-banner.php looks up for the
 * cart and its page script looks up for the screen. The option ids BMAT, BW
 * and BH are how the designer recognises a banner, and BHANG/BSLIT carry the
 * finishing, so all five ids are fixed here.
 *
 * The existing "Vinyl Banners" product and its four fixed-size methods are
 * left alone: the quote form still offers those sizes.
 */
const fs = require('fs');
const sg = require('./lib/signage');
const { mysql, enjson, sq } = require('./lib/db');

const NAME = 'Custom Size Vinyl Banner';
const DESCRIPTION = 'Design your own vinyl banner at any size, in whole feet: pick the vinyl, type the width and height, '
  + 'and the price updates as you go. Hemmed with welded edges and grommets included. Indoor or outdoor.';

/** The product's options, in Lumise's attribute shape. Pure, so the test reads it. */
function bannerAttributes({ width = 6, height = 3 } = {}) {
  const feet = (pick) => Array.from({ length: sg.BANNER_MAX_FT.long }, (_, i) => {
    const n = String(i + 1);
    return { value: n, title: `${n} ft`, price: '', default: Number(n) === pick };
  });
  return {
    BMAT: { id: 'BMAT', name: 'Vinyl', type: 'select', required: true,
      values: { options: sg.BANNER_MATERIALS.map((m, i) => ({ value: m.key, title: m.label, price: '', default: i === 0 })) } },
    BW: { id: 'BW', name: 'Width (feet)', type: 'select', required: true, values: { options: feet(width) } },
    BH: { id: 'BH', name: 'Height (feet)', type: 'select', required: true, values: { options: feet(height) } },
    /* Finishing (signage.js BANNER_HANGING): ONE hanging choice, because
       Signs365 will not put rope and pole pockets on the same banner. Wind
       slits are refused by the page on sizes Signs365 does not cut them for. */
    BHANG: { id: 'BHANG', name: 'Hanging', type: 'select', required: true,
      values: { options: Object.entries(sg.BANNER_HANGING).map(([value, h]) => ({ value, title: h.label, price: '', default: value === 'grommets' })) } },
    /* Free: which edges get grommets (a Signs365 preset). The page shows it,
       with the diagram, only when the hanging is grommets. */
    BGROM: { id: 'BGROM', name: 'Grommet placement', type: 'select', required: true,
      values: { options: Object.entries(sg.BANNER_GROMMETS).map(([value, g]) => ({ value, title: g.label, price: '', default: value === 'tb' })) } },
    BSLIT: { id: 'BSLIT', name: 'Wind slits (for outdoor banners over 2ft x 2ft and under 10ft x 10ft)', type: 'select', required: true,
      values: { options: [{ value: 'no', title: 'No', price: '', default: true }, { value: 'yes', title: 'Yes', price: '', default: false }] } },
    QTY: { id: 'QTY', name: 'Quantity', type: 'quantity', required: true, values: { type: 'standard', min_qty: '1', max_qty: '' } },
  };
}

/** Front and back on a plain backdrop; the page reshapes the zone to the size
 *  chosen, and shows the Back only when the vinyl is printed both sides. */
function bannerStages() {
  const side = (label) => ({ source: 'raws', overlay: false, url: 'products/jt-banner-backdrop.png', label,
    edit_zone: { width: 400, height: 200, left: 0, top: 0, radius: '0' }, product_width: 500, product_height: 500 });
  return { front: side('Front'), back: side('Back') };
}

module.exports = { NAME, bannerAttributes, bannerStages };
if (require.main !== module) return;

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '').replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-banner-product.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
if (!url) { console.error('no MySQL URL'); process.exit(2); }

const t = sg.bannerTable();
console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}  ${NAME}`);
for (const m of t.materials) {
  console.log(`  ${m.label.padEnd(48)} 2x4 $${t.prices[m.key]['4x2']}  3x6 $${t.prices[m.key]['6x3']}  2x10 $${t.prices[m.key]['10x2']}  4x8 $${t.prices[m.key]['8x4']}`);
}
const got = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(NAME) + ';', { rows: true });
console.log(`  ${got.length ? 'update product #' + got[0].id : 'create product'}`);
if (!APPLY) { console.log('\n  dry run: pass --apply to write'); process.exit(0); }

const attrs = sq(enjson(bannerAttributes()));
const stages = sq(enjson(bannerStages()));
if (got.length) {
  mysql(url, `UPDATE lumise_products SET description=${sq(DESCRIPTION)}, price=0, attributes=${attrs}, stages=${stages}, `
    + `printings='', active=1, updated=NOW() WHERE id=${Number(got[0].id)};`);
} else {
  const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
  mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,stages,attributes,printings,'
    + 'thumbnail_url,active,`order`,author,created,updated) VALUES (' + sq(NAME) + ',' + sq(DESCRIPTION)
    + ',0,0,' + stages + ',' + attrs + ",'','',1,998," + sq(author) + ',NOW(),NOW());');
}
const id = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(NAME) + ';', { rows: true })[0].id;
console.log(`\n  written: product #${id}. Open it at design.jtees.net/editor.php?product_base=${id}`);
