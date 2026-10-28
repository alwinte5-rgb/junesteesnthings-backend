#!/usr/bin/env node
/*
 * The order products appear in, in the shop (design.jtees.net/products.php)
 * and in the designer's product picker. Both sort by `order` ascending.
 *
 *   ... | node tools/shop-order.js            # dry run: the first 30 and the count
 *   ... | node tools/shop-order.js --apply    # backs up every row's order first
 *
 * The rule (owner, 2026-10-28: "make the gildan heavy cotton the first shirt …
 * dont put high priced items directly on the first page … use more common items
 * first"):
 *
 *   1        the Gildan 5000 Heavy Cotton tee (#12)
 *   2-99     the owner's hand-ranked basics, left exactly where they are
 *   100+     everything else, by section (the top-level category's own
 *            order: tees, hoodies, polos & workwear, women's, kids, hats, bags,
 *            …) and cheapest first inside a section
 *   997-999  the one-off products the adders park at the end (signs,
 *            services, cutouts), left alone
 *
 * New S&S styles arrive at 900 (tools/lib/ssa-staged.js NEW_PRODUCT_ORDER), so
 * they sit after the catalogue until this is re-run. A re-run re-sorts the 100+
 * band and converges; the hand-ranked band is never touched.
 *
 * Before 2026-10-28 every new style was written as 1, so 171 of them sorted
 * ahead of all the basics and a $39 hoodie was the shop's second product.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql } = require('./lib/db');

const FIRST_ID = 12;            // Gildan 5000 Unisex Heavy Cotton Tee
const RANKED_MAX = 99;          // 2..99 are hand-ranked
const PARKED_MIN = 997;         // 997+ are parked by the one-off adders
const BAND_START = 100;

/** Pure. products: [{id, order, price, cats: [categoryId]}], categories:
 *  [{id, parent, order, active}]. Returns [{id, from, to}] for every product. */
function planOrder(products, categories) {
  const cat = new Map(categories.map((c) => [Number(c.id), c]));
  const top = (id) => {
    let c = cat.get(Number(id));
    for (let i = 0; c && Number(c.parent) && i < 10; i++) c = cat.get(Number(c.parent));
    return c;
  };
  const section = (p) => {
    let best = Infinity;
    for (const id of p.cats || []) {
      const t = top(id);
      if (t && Number(t.active) === 1 && Number(t.order) < best) best = Number(t.order);
    }
    return best;
  };
  const out = [];
  const band = [];
  for (const p of products) {
    const o = Number(p.order);
    if (Number(p.id) === FIRST_ID) out.push({ id: Number(p.id), from: o, to: 1 });
    else if (o >= 2 && o <= RANKED_MAX) out.push({ id: Number(p.id), from: o, to: o });
    else if (o >= PARKED_MIN) out.push({ id: Number(p.id), from: o, to: o });
    else band.push(p);
  }
  band.sort((a, b) => section(a) - section(b) || Number(a.price) - Number(b.price) || Number(a.id) - Number(b.id));
  band.forEach((p, i) => out.push({ id: Number(p.id), from: Number(p.order), to: BAND_START + i }));
  return out.sort((a, b) => a.to - b.to || a.id - b.id);
}

function run(buf) {
  const APPLY = process.argv.includes('--apply');
  const url = urlFromStdinJson(buf);
  const categories = mysql(url, "SELECT id, parent, `order`, active FROM lumise_categories WHERE type='products';", { rows: true });
  const rows = mysql(url,
    "SELECT p.id, p.name, p.price, p.`order`, GROUP_CONCAT(c.category_id) cats FROM lumise_products p " +
    "LEFT JOIN lumise_categories_reference c ON c.item_id = p.id AND c.type = 'products' " +
    'WHERE p.active = 1 GROUP BY p.id;', { rows: true });
  const products = rows.map((r) => ({ ...r, cats: String(r.cats || '').split(',').filter(Boolean).map(Number) }));
  const name = new Map(products.map((p) => [Number(p.id), p]));
  const plan = planOrder(products, categories);
  for (const x of plan.slice(0, 30)) {
    const p = name.get(x.id);
    console.log(String(x.to).padStart(4) + '  #' + String(x.id).padEnd(4) + ' $' + String(p.price).padEnd(7) + p.name.slice(0, 56));
  }
  const ch = plan.filter((x) => x.from !== x.to);
  console.log('\n' + plan.length + ' live products, ' + ch.length + ' would move');
  if (!APPLY || !ch.length) { if (!APPLY) console.log('dry run — pass --apply to write'); return; }

  const bfile = path.join(os.homedir(), 'jtees-backups', 'product-order-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.mkdirSync(path.dirname(bfile), { recursive: true });
  fs.writeFileSync(bfile, JSON.stringify(mysql(url, 'SELECT id, `order` FROM lumise_products;', { rows: true })));
  console.log('backup ' + bfile);
  mysql(url, 'UPDATE lumise_products SET `order` = CASE id ' +
    ch.map((x) => 'WHEN ' + x.id + ' THEN ' + x.to).join(' ') +
    ' ELSE `order` END WHERE id IN (' + ch.map((x) => x.id).join(',') + ');');
  const after = new Map(mysql(url, 'SELECT id, `order` o FROM lumise_products;', { rows: true }).map((r) => [Number(r.id), Number(r.o)]));
  const bad = plan.filter((x) => after.get(x.id) !== x.to);
  console.log(ch.length + ' written' + (bad.length ? ', ' + bad.length + ' DID NOT TAKE' : ''));
  if (bad.length) process.exitCode = 1;
}

if (require.main === module) {
  let b = '';
  process.stdin.on('data', (d) => (b += d));
  process.stdin.on('end', () => run(b));
}

module.exports = { planOrder, FIRST_ID, BAND_START };
