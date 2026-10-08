#!/usr/bin/env node
/* The sign families as designer products (2026-10-08): one product per family
 * in tools/lib/sign-families.js, each with only its own materials and upgrades.
 *
 *   node tools/add-sign-products.js --vars=~/.jtees-art.json            dry run
 *   node tools/add-sign-products.js --vars=~/.jtees-art.json --apply    write
 *
 * Options (fixed ids; the designer's jt-signs.php and page script read them):
 *   SMAT      the material, valued "<family>:<material>" so the family travels
 *             with every order line
 *   SW, SH    width and height in inches (area families)
 *   SSIZE     the size, "WxH" (stock families)
 *   SUP_<k>   each upgrade and per-sheet finish, "yes"/"no"; the page shows one
 *             only when the chosen material takes it, the cart refuses it otherwise
 *   QTY       quantity
 * No price lives on the product: the backend's `signs` table carries it.
 */
const fs = require('fs');
const F = require('./lib/sign-families');
const { mysql, enjson, sq } = require('./lib/db');

const NAMES = {
  yard_sign: 'Custom Yard Signs', rigid_sign: 'Custom Rigid Signs', window_graphic: 'Custom Window Graphics',
  wall_floor: 'Custom Wall & Floor Graphics', vehicle_graphic: 'Custom Vehicle Graphics', vehicle_magnet: 'Custom Vehicle Magnets',
  custom_magnet: 'Custom Magnets (any size)', photo_panel: 'Custom Photo Panels & Prints', stretched_canvas: 'Custom Stretched Canvas',
};

/* The storefront tabs the sign products are filed under, after the apparel
   tabs (orders 1-9). Resolved by slug, created when missing, so a re-run only
   adds what is not there. The any-size banner (tools/add-banner-product.js)
   is filed here too, since it belongs with the signs. */
const CATEGORIES = [
  { name: 'Banners', slug: 'custom-banners', order: 10, products: ['Custom Size Vinyl Banner'] },
  { name: 'Yard & Rigid Signs', slug: 'custom-yard-rigid-signs', order: 11, families: ['yard_sign', 'rigid_sign'] },
  { name: 'Window, Wall & Floor Graphics', slug: 'custom-window-wall-floor-graphics', order: 12, families: ['window_graphic', 'wall_floor'] },
  { name: 'Vehicle Graphics & Magnets', slug: 'custom-vehicle-graphics-magnets', order: 13, families: ['vehicle_graphic', 'vehicle_magnet', 'custom_magnet'] },
  { name: 'Photo Panels & Canvas', slug: 'custom-photo-panels-canvas', order: 14, families: ['photo_panel', 'stretched_canvas'] },
];

const yesNo = (def = 'no') => ({ options: ['no', 'yes'].map((v) => ({ value: v, title: v === 'yes' ? 'Yes' : 'No', price: '', default: v === def })) });

/** One family's options, in Lumise's attribute shape. Pure, so the test reads it. */
function familyAttributes(key) {
  const fam = F.FAMILIES[key];
  const a = {
    SMAT: { id: 'SMAT', name: 'Material', type: 'select', required: true,
      values: { options: fam.materials.map((m, i) => ({ value: `${key}:${m.key}`, title: m.label, price: '', default: i === 0 })) } },
  };
  if (fam.sizing === 'area') {
    const L = fam.limits;
    const inches = (max, pick) => ({ options: Array.from({ length: max - L.min + 1 }, (_, i) => {
      const n = L.min + i; return { value: String(n), title: `${n} in`, price: '', default: n === pick };
    }) });
    a.SW = { id: 'SW', name: 'Width (inches)', type: 'select', required: true, values: inches(L.max_w, Math.min(36, L.max_w)) };
    a.SH = { id: 'SH', name: 'Height (inches)', type: 'select', required: true, values: inches(L.max_h, Math.min(24, L.max_h)) };
  } else {
    const def = fam.sizes.find(([w, h]) => w === 24 && h === 18) || fam.sizes[0];
    a.SSIZE = { id: 'SSIZE', name: 'Size', type: 'select', required: true,
      values: { options: fam.sizes.map(([w, h]) => ({ value: `${w}x${h}`, title: `${w}" x ${h}"`, price: '', default: w === def[0] && h === def[1] })) } };
  }
  for (const [k, v] of Object.entries(fam.sheet_upgrades || {})) a[`SUP_${k}`] = { id: `SUP_${k}`, name: v.label, type: 'select', required: true, values: yesNo() };
  for (const u of fam.upgrades) a[`SUP_${u.key}`] = { id: `SUP_${u.key}`, name: u.label, type: 'select', required: true, values: yesNo() };
  a.QTY = { id: 'QTY', name: 'Quantity', type: 'quantity', required: true,
    /* A size minimum (small yard signs: 10) is enforced by the price lookup,
       which refuses below it with the reason, since it differs by size. */
    values: { type: 'standard', min_qty: '1', max_qty: '' } };
  return a;
}

/** Front and back; the page shows the back only for a two-sided material. */
function familyStages() {
  const side = (label) => ({ source: 'raws', overlay: false, url: 'products/jt-banner-backdrop.png', label,
    edit_zone: { width: 360, height: 240, left: 0, top: 0, radius: '0' }, product_width: 500, product_height: 500 });
  return { front: side('Front'), back: side('Back') };
}

module.exports = { NAMES, CATEGORIES, familyAttributes, familyStages };
if (require.main !== module) return;

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((x) => x.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '').replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-sign-products.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
if (!url) { console.error('no MySQL URL'); process.exit(2); }

console.log(APPLY ? 'APPLYING' : 'DRY RUN');
const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
for (const [key, name] of Object.entries(NAMES)) {
  const fam = F.FAMILIES[key];
  const got = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(name) + ';', { rows: true });
  console.log(`  ${got.length ? 'update #' + got[0].id : 'create'}  ${name}  (${fam.materials.length} materials, ${fam.sizing})`);
  if (!APPLY) continue;
  const attrs = sq(enjson(familyAttributes(key))), stages = sq(enjson(familyStages()));
  const desc = sq(`${fam.note} Design it here; the price updates as you choose.`);
  if (got.length) {
    mysql(url, `UPDATE lumise_products SET description=${desc}, price=0, attributes=${attrs}, stages=${stages}, printings='', active=1, updated=NOW() WHERE id=${Number(got[0].id)};`);
  } else {
    mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,stages,attributes,printings,'
      + 'thumbnail_url,active,`order`,author,created,updated) VALUES (' + sq(name) + ',' + desc
      + ',0,0,' + stages + ',' + attrs + ",'','',1,997," + sq(author) + ',NOW(),NOW());');
  }
}

console.log('');
for (const c of CATEGORIES) {
  let cat = mysql(url, "SELECT id FROM lumise_categories WHERE type='products' AND slug=" + sq(c.slug) + ';', { rows: true })[0];
  console.log(`  ${cat ? 'category #' + cat.id : 'create category'}  ${c.name}`);
  if (!cat && APPLY) {
    mysql(url, 'INSERT INTO lumise_categories (name,slug,upload,thumbnail_url,parent,type,active,`order`,author,created,updated) VALUES ('
      + sq(c.name) + ',' + sq(c.slug) + ",'','',0,'products',1," + Number(c.order) + ",'',NOW(),NOW());");
    cat = mysql(url, "SELECT id FROM lumise_categories WHERE type='products' AND slug=" + sq(c.slug) + ';', { rows: true })[0];
  }
  for (const name of [...(c.products || []), ...(c.families || []).map((k) => NAMES[k])]) {
    const p = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(name) + ';', { rows: true })[0];
    if (!p) { console.log(`      SKIP (no such product)  ${name}`); continue; }
    const filed = cat && mysql(url, "SELECT 1 FROM lumise_categories_reference WHERE type='products' AND category_id="
      + Number(cat.id) + ' AND item_id=' + Number(p.id) + ';', { rows: true }).length;
    if (filed) continue;
    console.log(`      file #${p.id}  ${name}`);
    if (APPLY) mysql(url, 'INSERT INTO lumise_categories_reference (category_id,item_id,author,type) VALUES ('
      + Number(cat.id) + ',' + Number(p.id) + ",'','products');");
  }
}
if (!APPLY) console.log('\n  dry run: pass --apply to write');
