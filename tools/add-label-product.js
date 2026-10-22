#!/usr/bin/env node
/* Roll labels in the designer (owner, 2026-10-22): the SinaLite catalogue row
 * "Roll Labels — white gloss BOPP" becomes a product customers design, see on
 * a jar ("See it in place") and buy online.
 *
 *   node tools/add-label-product.js --vars=<(jtees-env)            # dry run
 *   node tools/add-label-product.js --vars=<(jtees-env) --apply    # write
 *
 * The SAME row the quote form prices by name (sinalite.js kindOf), switched
 * active: jt-catalog.php keeps publishing it to the quote form, the designer's
 * product loader serves an active SinaLite row (lib.php), and products.php
 * still keeps every SinaLite row out of the shop grid, so it is reached from
 * /print/stickers-labels.html. Run AFTER the backend that publishes the
 * family (/api/pricing-rules signs.families.roll_label) is deployed, and
 * after the designer that prices it (jt-signs.php runs_only / no_pool).
 *
 * Options, as a sign family's (tools/add-sign-products.js): SMAT
 * "roll_label:<material>", SSIZE "WxH" (sinalite.js DESIGNER), QTY. No price
 * lives on the product: the published table carries it.
 */
const fs = require('fs');
const SL = require('./lib/sinalite');
const { mysql, enjson, sq, mysqlUrlFrom } = require('./lib/db');

const KEY = 'roll_label';
const THUMB = 'https://www.jtees.net/assets/images/print/labels-jar.jpg';
const DESCRIPTION = 'Waterproof white gloss labels on a roll for jars, bottles, candles and boxes, '
  + 'printed in full color and gloss laminated. Design yours here, see it on a jar, and pick 500 or 1,000.';

/** The options, in Lumise's attribute shape. Pure, so the test reads it. */
function labelAttributes(fam) {
  const def = fam.sizes.find((s) => s.key === '3x3') || fam.sizes[0];
  /* The smallest run of any size: the quantity box opens there. */
  const first = Math.min(...Object.values(fam.prices).flatMap((bySize) => Object.values(bySize).map((c) => c[''][0][0])));
  return {
    SMAT: { id: 'SMAT', name: 'Material', type: 'select', required: true,
      values: { options: fam.materials.map((m, i) => ({ value: `${KEY}:${m.key}`, title: m.label, price: '', default: i === 0 })) } },
    SSIZE: { id: 'SSIZE', name: 'Size', type: 'select', required: true,
      values: { options: fam.sizes.map((s) => ({ value: s.key, title: s.label, price: '', default: s.key === def.key })) } },
    /* The runs (500, 1,000) are enforced by the price lookup, which refuses
       any other quantity with the reason (jt-signs.php runs_only). */
    QTY: { id: 'QTY', name: 'Quantity', type: 'quantity', required: true,
      values: { type: 'standard', min_qty: String(Number.isFinite(first) ? first : 1), max_qty: '' } },
  };
}

/** One printed side. */
function labelStages() {
  return { front: { source: 'raws', overlay: false, url: 'products/jt-banner-backdrop.png', label: 'Label',
    edit_zone: { width: 360, height: 360, left: 0, top: 0, radius: '0' }, product_width: 500, product_height: 500 } };
}

module.exports = { labelAttributes, labelStages, DESCRIPTION, THUMB };
if (require.main !== module) return;

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
const env = varsFile ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : process.env;
const url = mysqlUrlFrom(env);
if (!url) { console.error('usage: add-label-product.js --vars=<(jtees-env) [--apply]'); process.exit(2); }

const fam = SL.designerFamilies()[KEY];
if (!fam) { console.error('!! no priced roll labels in tools/data/sinalite-costs.json — refusing'); process.exit(1); }
const name = (JSON.parse(fs.readFileSync(SL.DATA_FILE, 'utf8')).products[KEY] || {}).name;
if (!name || SL.kindOf(name) !== KEY) { console.error('!! the roll label name does not map back to ' + KEY + ' — refusing'); process.exit(1); }

const rows = mysql(url, 'SELECT id,name,active,supplier FROM lumise_products WHERE name=' + sq(name) + ';', { rows: true });
if (rows.length !== 1) { console.error('!! expected one "' + name + '" row, found ' + rows.length + ' (run add-sinalite-products.js first) — refusing'); process.exit(1); }
const row = rows[0];
if (row.supplier !== 'sinalite') { console.error('!! #' + row.id + ' is not tagged sinalite — refusing'); process.exit(1); }

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + `  #${row.id}  ${name}  active ${row.active} -> 1`);
for (const s of fam.sizes) {
  const lad = fam.prices[fam.materials[0].key][s.key][''];
  console.log(`    ${s.label.padEnd(20)} ${lad.map(([q, e]) => `${q} at $${e.toFixed(2)} = $${(q * e).toFixed(2)}`).join('   ')}`);
}
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

mysql(url, 'UPDATE lumise_products SET description=' + sq(DESCRIPTION) + ', price=0, attributes=' + sq(enjson(labelAttributes(fam)))
  + ', stages=' + sq(enjson(labelStages())) + ", printings='', thumbnail_url=" + sq(THUMB)
  + ", active=1, updated=NOW() WHERE id=" + Number(row.id) + " AND supplier='sinalite';");
const after = mysql(url, 'SELECT id,active,supplier FROM lumise_products WHERE id=' + Number(row.id) + ';', { rows: true })[0];
console.log(`  verified #${after.id}  active=${after.active}  supplier=${after.supplier}`);
if (String(after.active) !== '1') process.exit(1);
