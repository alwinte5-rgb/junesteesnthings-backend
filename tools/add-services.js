#!/usr/bin/env node
/* Add the staff-only services to the catalogue: design fees and folding.
 *
 *   node tools/add-services.js --vars=~/.jtees-art.json
 *   node tools/add-services.js --vars=~/.jtees-art.json --apply
 *
 * WHY THEY ARE STORED INACTIVE
 * ----------------------------
 * The quote form's product list is the shop catalogue, and every storefront
 * page (products, search, collections, sitemap, home, product.php) shows only
 * `active = 1`. A design fee must be quotable and never sold online, so each
 * service is written INACTIVE and tagged `supplier = 'service'`. jt-catalog.php
 * publishes that tag to the quote tool alongside the active products, flagged
 * `service`, and the quote engine prices it flat (no garment volume break).
 *
 * ORDER MATTERS: the lumise-designer change that teaches jt-catalog.php and
 * products.php about `supplier = 'service'` must be deployed BEFORE --apply.
 * Without it products.php gives any printing-less product DTF on the next page
 * load, and the services would not reach the quote form at all.
 *
 * Prices are the owner's (2026-10-14). Design fees are one unit per piece of
 * work; folding is per brochure. Upserted by name, so re-running reprices.
 */
const fs = require('fs');
const { mysql, enjson, sq } = require('./lib/db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-services.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;

const SERVICES = [
  { name: 'Trifold Brochure Folding (per brochure, $25 min)', price: '0.10',
    description: 'Folding flat trifold brochures in house, per brochure. Minimum charge $25 ' +
      '(250 brochures). Not needed when the printer delivers them folded.' },
  { name: 'Brochure Design — Trifold, New', price: '350.00',
    description: 'A new trifold brochure designed from scratch, both sides.' },
  { name: 'Brochure Design — Revision', price: '150.00',
    description: 'Updating an existing brochure: new prices, wording and specials.' },
  { name: 'Business Card Design — New (front + back)', price: '95.00',
    description: 'A new two-sided business card design.' },
  { name: 'Business Card Design — Revision', price: '45.00',
    description: 'Updating an existing business card.' },
  { name: 'TV Screen Design — New (per screen)', price: '95.00',
    description: 'A new menu or promo design for one TV screen.' },
  { name: 'TV Screen Design — Revision (per screen)', price: '40.00',
    description: 'Updating an existing TV screen design, per screen.' },
];

for (const s of SERVICES) {
  if (!(parseFloat(s.price) > 0)) { console.error('!! no price on ' + s.name + ' — refusing'); process.exit(1); }
}

const rows = mysql(url, "SELECT id,name,price,active,supplier FROM lumise_products WHERE name IN (" +
  SERVICES.map((s) => sq(s.name)).join(',') + ');', { rows: true });
const have = new Map(rows.map((r) => [r.name, r]));

/* A same-named product that is NOT a service is somebody's real product. */
for (const r of rows) {
  if (r.supplier !== 'service') {
    console.error('!! "' + r.name + '" exists as #' + r.id + ' and is not a service — refusing');
    process.exit(1);
  }
}

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '\n');
for (const s of SERVICES) {
  const h = have.get(s.name);
  console.log('  ' + (h ? 'update #' + h.id + ' ($' + h.price + ' -> $' + s.price + ')' : 'create') +
    '  ' + s.name + '  $' + s.price);
}
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
for (const s of SERVICES) {
  const h = have.get(s.name);
  if (h) {
    mysql(url, 'UPDATE lumise_products SET price=' + sq(s.price) + ', description=' + sq(s.description) +
      ", active=0, supplier='service', updated=NOW() WHERE id=" + Number(h.id) + ';');
  } else {
    mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,supplier,stages,attributes,' +
      'printings,thumbnail_url,active,`order`,author,created,updated) VALUES (' +
      sq(s.name) + ',' + sq(s.description) + ',' + sq(s.price) + ",0,'service'," + sq(enjson({})) + ',' +
      sq(enjson({})) + ",'','',0,999," + sq(author) + ',NOW(),NOW());');
  }
}
const after = mysql(url, "SELECT id,name,price,active,supplier FROM lumise_products WHERE supplier='service' ORDER BY id;", { rows: true });
for (const a of after) console.log('  verified #' + a.id + '  active=' + a.active + '  $' + a.price + '  ' + a.name);
