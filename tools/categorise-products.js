#!/usr/bin/env node
/*
 * Put live products into the category list, including a Sustainable tab.
 *
 *   ... | node tools/categorise-products.js            # dry run
 *   ... | node tools/categorise-products.js --apply
 *
 * Two jobs, because they share all the same plumbing:
 *
 * 1. A "Sustainable" product category. A customer asked for sustainable
 *    options and there was no way to browse them. Membership is not a guess or
 *    a keyword match on the name — it is S&S's own `sustainableStyle` flag on
 *    the style the product was built from, so the shop can stand behind it.
 *
 * 2. Every other live product into the category for what it IS. 57 live
 *    products belonged to no category at all: everything added by
 *    ssa-add-products, which writes the product but never a category row. A
 *    customer browsing "Hats & Caps" saw four of the nine caps on sale.
 *
 * Categories are resolved by SLUG rather than id, so this does not break if the
 * list is reordered.
 */

const { urlFromStdinJson, mysql, sq } = require('./lib/db');
const { classify } = require('./lib/garments');

const APPLY = process.argv.includes('--apply');

const SUSTAINABLE = { name: 'Sustainable', slug: 'custom-sustainable-apparel', order: 9 };

/* What a garment class is filed under. Vests and jackets are deliberately
   absent: there is no outerwear category yet, and inventing one while every
   vest is held for artwork would put an empty tab on the storefront. */
const FILE_UNDER = {
  tee: 'custom-t-shirts', longslv: 'custom-t-shirts',
  hoodie: 'custom-hoodies-sweatshirts', qzip: 'custom-hoodies-sweatshirts',
  tank: 'custom-tank-tops',
  kids: 'custom-kids-youth-apparel',
  onesie: 'custom-baby-onesies',
  cap: 'custom-hats-caps',
  bag: 'custom-tote-bags',
  polo: 'custom-business-apparel', woven: 'custom-business-apparel',
};

/* An explicit, repeatable claim — organic, recycled, hemp, RPET, post-consumer.
   S&S's own `sustainableStyle` flag alone is too broad to sell against: it
   covers 1,595 of 5,677 styles, plain Gildan and Bella included, and filing 76
   of 102 live products under "Sustainable" tells a customer nothing. Both tests
   together is the set the shop can actually stand behind in writing. */
const ECO_CLAIM = /organic|recycled|hemp|sustainab|eco[-\s]?|repreve|post-consumer|rpet/i;

async function ssaSustainableIds(env) {
  const auth = 'Basic ' + Buffer.from(env.SSA_ACCOUNT + ':' + env.SSA_API_KEY).toString('base64');
  const r = await fetch('https://api.ssactivewear.com/v2/styles/',
    { headers: { Authorization: auth }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('S&S styles/ returned ' + r.status);
  const all = await r.json();
  const ids = new Set();
  for (const s of all) {
    if (!s.sustainableStyle) continue;
    const copy = (s.title || '') + ' ' + String(s.description || '').replace(/<[^>]+>/g, ' ');
    if (ECO_CLAIM.test(copy)) ids.add(String(s.styleID));
  }
  return ids;
}

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', async () => {
  const env = JSON.parse(buf);
  const url = urlFromStdinJson(buf);
  if (!env.SSA_ACCOUNT || !env.SSA_API_KEY) { console.error('SSA credentials missing'); process.exit(2); }

  const sustainable = await ssaSustainableIds(env);
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + sustainable.size +
    ' styles carry both the flag and an explicit eco claim\n');

  const cats = mysql(url,
    "SELECT id, name, slug FROM lumise_categories WHERE type='products';", { rows: true });
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const stmts = [];

  let susId = bySlug.get(SUSTAINABLE.slug) && bySlug.get(SUSTAINABLE.slug).id;
  if (!susId) {
    console.log('  creating category "' + SUSTAINABLE.name + '" (' + SUSTAINABLE.slug + ')\n');
    if (APPLY) {
      mysql(url, 'INSERT INTO lumise_categories (name, slug, upload, thumbnail_url, parent, ' +
        "type, active, `order`, author, created, updated) VALUES (" + sq(SUSTAINABLE.name) + ', ' +
        sq(SUSTAINABLE.slug) + ", '', '', 0, 'products', 1, " + SUSTAINABLE.order + ", '', NOW(), NOW());");
      susId = mysql(url, 'SELECT id FROM lumise_categories WHERE slug=' + sq(SUSTAINABLE.slug) + ';',
        { rows: true })[0].id;
    }
  }

  const products = mysql(url,
    "SELECT id, name, IFNULL(supplier_style_id,'') sid FROM lumise_products WHERE active=1 ORDER BY id;",
    { rows: true });
  const existing = new Set(mysql(url,
    "SELECT CONCAT(category_id,':',item_id) k FROM lumise_categories_reference WHERE type='products';",
    { rows: true }).map((r) => r.k));

  const add = (catId, itemId) => {
    if (!catId || existing.has(catId + ':' + itemId)) return false;
    existing.add(catId + ':' + itemId);
    stmts.push('INSERT INTO lumise_categories_reference (category_id, item_id, author, type) ' +
      'VALUES (' + Number(catId) + ', ' + Number(itemId) + ", '', 'products');");
    return true;
  };

  let nSus = 0, nType = 0; const unfiled = [];
  for (const p of products) {
    if (p.sid && sustainable.has(String(p.sid))) {
      if (add(susId || '<new>', p.id)) { nSus++; console.log('  sustainable  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 52)); }
    }
    const slug = FILE_UNDER[classify(p.name)];
    if (!slug) { unfiled.push(p); continue; }
    const c = bySlug.get(slug);
    if (!c) { unfiled.push(p); continue; }
    if (add(c.id, p.id)) { nType++; }
  }

  console.log('\n  ' + nSus + ' products into Sustainable · ' + nType + ' into their garment category');
  if (unfiled.length) {
    console.log('\n  no category for these (' + unfiled.length + '):');
    for (const p of unfiled) console.log('    #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 52));
  }
  console.log('\n' + stmts.length + ' statements' +
    (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));
  if (!APPLY || !stmts.length) process.exit(0);
  mysql(url, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
});
