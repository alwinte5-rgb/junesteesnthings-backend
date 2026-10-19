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
 *
 * 3. The TREE (tools/data/category-tree.js, owner 2026-10-19): seven groups,
 *    each opening into specific garments. Every group and leaf is created or
 *    renamed and moved into place; a live product is filed under each leaf it
 *    matches and that leaf's group, and taken OUT of any tree category it no
 *    longer matches, so a re-run after a rename or a rule change converges.
 *    A switched-off product keeps its filings: no list shows it, and they are
 *    right again if it comes back.
 *    Sustainable stays as membership (it drives the shop's Organic filter) but
 *    is switched off as a menu category. The reference rows the run replaces
 *    are saved to ~/jtees-backups first.
 */

const { urlFromStdinJson, mysql, sq } = require('./lib/db');
const { classify } = require('./lib/garments');
const TREE = require('./data/category-tree');

/** Tree category slugs a product belongs in: matching leaves and their group. */
function treeSlugs(name) {
  const p = { name, cls: classify(name) };
  const out = [];
  for (const g of TREE) {
    if (g.manual) continue;
    const leaves = (g.leaves || []).filter((l) => l.match(p)).map((l) => l.slug);
    if (leaves.length || (g.match && g.match(p))) out.push(g.slug, ...leaves);
  }
  return out;
}

const APPLY = process.argv.includes('--apply');

const SUSTAINABLE = { name: 'Sustainable', slug: 'custom-sustainable-apparel', order: 9 };

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
if (require.main === module) process.stdin.on('data', (d) => (buf += d));
if (require.main !== module) module.exports = { treeSlugs };
else process.stdin.on('end', async () => {
  const env = JSON.parse(buf);
  const url = urlFromStdinJson(buf);
  if (!env.SSA_ACCOUNT || !env.SSA_API_KEY) { console.error('SSA credentials missing'); process.exit(2); }

  const sustainable = await ssaSustainableIds(env);
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + sustainable.size +
    ' styles carry both the flag and an explicit eco claim\n');

  const cats = mysql(url,
    "SELECT id, name, slug, parent, active, `order` FROM lumise_categories WHERE type='products';", { rows: true });
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

  /* The tree: every group and leaf exists, named, ordered and parented. */
  const treeIds = new Map();   // slug -> id
  const ensure = (slug, name, parent, order) => {
    const c = bySlug.get(slug);
    if (c) {
      if (c.name !== name || String(c.parent) !== String(parent) || String(c.order) !== String(order) || String(c.active) !== '1') {
        console.log('  category ' + slug + ': ' + c.name + ' -> ' + name + (String(c.parent) !== String(parent) ? ' (moved)' : ''));
        stmts.push('UPDATE lumise_categories SET name=' + sq(name) + ', parent=' + Number(parent) + ', `order`=' + Number(order) +
          ', active=1, updated=NOW() WHERE id=' + Number(c.id) + ';');
      }
      return c.id;
    }
    console.log('  creating category ' + name + ' (' + slug + ')');
    if (!APPLY) return '<new:' + slug + '>';
    mysql(url, 'INSERT INTO lumise_categories (name, slug, upload, thumbnail_url, parent, type, active, `order`, author, created, updated) VALUES (' +
      sq(name) + ', ' + sq(slug) + ", '', '', " + Number(parent) + ", 'products', 1, " + Number(order) + ", '', NOW(), NOW());");
    const id = mysql(url, 'SELECT id FROM lumise_categories WHERE slug=' + sq(slug) + " AND type='products';", { rows: true })[0].id;
    bySlug.set(slug, { id, name, slug, parent, order, active: '1' });
    return id;
  };
  for (const g of TREE) {
    const gid = ensure(g.slug, g.name, 0, g.order);
    treeIds.set(g.slug, gid);
    /* In a dry run a new group has no id yet: its leaves are shown as new, unparented. */
    (g.leaves || []).forEach((l, i) => treeIds.set(l.slug, ensure(l.slug, l.name, String(gid).startsWith('<') ? 0 : gid, i + 1)));
    for (const a of g.adopt || []) {
      const c = bySlug.get(a);
      if (String(gid).startsWith('<')) { console.log('  ' + a + ' moves under ' + g.name + ' once it exists (next --apply)'); continue; }
      if (c && String(c.parent) !== String(gid)) stmts.push('UPDATE lumise_categories SET parent=' + Number(gid) + ', updated=NOW() WHERE id=' + Number(c.id) + ';');
    }
  }
  /* Sustainable: membership kept for the Organic filter, off the menus. */
  if (susId && bySlug.get(SUSTAINABLE.slug) && String(bySlug.get(SUSTAINABLE.slug).active) !== '0') {
    stmts.push('UPDATE lumise_categories SET active=0, updated=NOW() WHERE id=' + Number(susId) + ';');
  }

  const managed = new Set([...TREE.filter((g) => !g.manual).flatMap((g) => [g.slug, ...(g.leaves || []).map((l) => l.slug)])]
    .map((sl) => String(treeIds.get(sl))));
  const held = mysql(url, "SELECT category_id, item_id FROM lumise_categories_reference WHERE type='products';", { rows: true });
  const backup = held.filter((r) => managed.has(String(r.category_id)));
  if (APPLY) {
    const bdir = require('os').homedir() + '/jtees-backups';
    require('fs').mkdirSync(bdir, { recursive: true });
    require('fs').writeFileSync(bdir + '/categories-ref-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json', JSON.stringify(backup));
  }

  let nSus = 0, nType = 0, nOut = 0; const unfiled = [];
  const count = {};
  for (const p of products) {
    if (p.sid && sustainable.has(String(p.sid))) {
      if (add(susId || '<new>', p.id)) { nSus++; console.log('  sustainable  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 52)); }
    }
    const want = new Set(treeSlugs(p.name).map((sl) => String(treeIds.get(sl))));
    if (!want.size) { unfiled.push(p); continue; }
    for (const id of want) { count[id] = (count[id] || 0) + 1; if (add(id, p.id)) nType++; }
    for (const r of backup) {
      if (String(r.item_id) === String(p.id) && !want.has(String(r.category_id))) {
        stmts.push('DELETE FROM lumise_categories_reference WHERE type=\'products\' AND category_id=' + Number(r.category_id) + ' AND item_id=' + Number(p.id) + ';');
        nOut++;
      }
    }
  }

  console.log('\n  per category (live products):');
  for (const g of TREE.filter((x) => !x.manual)) {
    console.log('    ' + g.name.padEnd(24) + (count[String(treeIds.get(g.slug))] || 0));
    for (const l of g.leaves || []) console.log('      ' + l.name.padEnd(22) + (count[String(treeIds.get(l.slug))] || 0));
  }
  console.log('\n  ' + nSus + ' products into Sustainable · ' + nType + ' new tree filings · ' + nOut + ' taken out of a tree category they no longer match');
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
