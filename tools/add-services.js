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
const { mysql, mysqlUrlFrom, enjson, sq } = require('./lib/db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-services.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = mysqlUrlFrom(env);
if (!url) { console.error('no MySQL connection in ' + varsFile); process.exit(2); }

const SERVICES = [
  /* No minimum: the quote engine cannot enforce one on a flat price, and a
     minimum written only in the name is one nobody is held to. */
  { name: 'Trifold Brochure Folding (per brochure)', price: '0.10',
    description: 'Folding flat trifold brochures in house, per brochure. Not needed when ' +
      'the printer delivers them folded.' },
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
  /* Design work for the SinaLite items (owner's prices, 2026-10-15). Mugs,
     tumblers, bottles, canvas and X-frames take the general design tiers on
     the quote form (tweak / setup / commission) instead of a service of
     their own. */
  { name: 'Calendar Design — New (13 pages)', price: '250.00',
    description: 'A new wall calendar laid out from your photos and dates: cover plus twelve months.' },
  { name: 'Calendar Design — Revision', price: '75.00',
    description: 'Updating an existing calendar: new year, dates, photos or wording.' },
  { name: 'Label or Sticker Design — New', price: '95.00',
    description: 'A new product label or sticker design, set up for the cut shape.' },
  { name: 'Label or Sticker Design — Revision', price: '45.00',
    description: 'Updating an existing label or sticker.' },
  { name: 'Pouch Design — New', price: '150.00',
    description: 'A new stand-up or lay-flat pouch design, front and back, laid out on the printer\'s template.' },
  { name: 'Pouch Design — Revision', price: '60.00',
    description: 'Updating an existing pouch design.' },
  { name: 'Table Cover Design — New', price: '95.00',
    description: 'A new table cover design for the front panel, set up on the printer\'s template.' },
  { name: 'Table Cover Design — Revision', price: '45.00',
    description: 'Updating an existing table cover design.' },
  /* Outsourced print, priced by the owner's rule (2026-10-14): supplier cost
     x2, plus shipping at cost + $25 rounded up to $5 (never marked up),
     divided by the run and rounded up to the cent. The price is only right
     for the run in the name, so the run is in the name.
     SinaLite 3,000 trifold: $274.17 x2 = $548.34 + ($106.62 + $25 -> $135)
     = $683.34 / 3,000 = $0.228 -> $0.23. */
  { name: 'Trifold Brochures 8.5x11, folded — 3,000 run (per brochure)', price: '0.23',
    description: '8.5 x 11 trifold brochures, 100lb gloss text, full color both sides, ' +
      'folded, shipping included. Printed by SinaLite. Price is for a 3,000 run only.' },
];

for (const s of SERVICES) {
  if (!(parseFloat(s.price) > 0)) { console.error('!! no price on ' + s.name + ' — refusing'); process.exit(1); }
}

const rows = mysql(url, "SELECT id,name,price,active,supplier FROM lumise_products WHERE name IN (" +
  SERVICES.map((s) => sq(s.name)).join(',') + ');', { rows: true });
/* Matched the way MySQL matched them: its collation ignores case, so a row
   whose case was changed in the admin is still this service, not a new one. */
const key = (n) => String(n).toLowerCase().trim();
const have = new Map(rows.map((r) => [key(r.name), r]));

/* A same-named product that is NOT a service is somebody's real product. */
for (const r of rows) {
  if (r.supplier !== 'service') {
    console.error('!! "' + r.name + '" exists as #' + r.id + ' and is not a service — refusing');
    process.exit(1);
  }
}

console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '\n');
for (const s of SERVICES) {
  const h = have.get(key(s.name));
  console.log('  ' + (h ? 'update #' + h.id + ' ($' + h.price + ' -> $' + s.price + ')' : 'create') +
    '  ' + s.name + '  $' + s.price);
}
if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;
for (const s of SERVICES) {
  const h = have.get(key(s.name));
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
