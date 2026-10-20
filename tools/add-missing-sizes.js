#!/usr/bin/env node
/*
 * Sizes S&S sells that a product does not offer (owner, 2026-10-20: "Are
 * there more like this that we just aren't offering?" — the Richardson 112
 * offered no size list though S&S sells it in M/L and XL).
 *
 *   <vars json> | node tools/add-missing-sizes.js                    # report every product
 *   <vars json> | node tools/add-missing-sizes.js --only=88,94 --apply
 *
 * The vars JSON carries MYSQL_PUBLIC_URL and SSA_ACCOUNT / SSA_API_KEY, as for
 * tools/catalog-inventory.js. Only sizes S&S PRICES count (an unpriced row is
 * one the shop cannot buy). A missing size is added in S&S's size order, with
 * the same upcharge rule every other size uses (lib/ssa-costs.js sizeOptions:
 * the real cost difference at the garment markup). A product with no size
 * list gets one. Nothing is removed. --apply needs --only: the report is for
 * the owner to choose from.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./lib/db');
const { makeClient } = require('./lib/ssa-client');
const { pieceCost, costBySize, baseCostOf, readSizes, sizeOptions } = require('./lib/ssa-costs');

/** { missing: [size], order: [size] } — the priced S&S sizes this product
 *  does not offer, and every priced S&S size in S&S's order. */
function missingSizes(attrs, rows) {
  const order = {};
  for (const r of rows) if (r.sizeName && pieceCost(r) > 0 && order[r.sizeName] === undefined) order[r.sizeName] = Number(r.sizeOrder || 999);
  const theirs = Object.keys(order).sort((a, b) => order[a] - order[b]);
  const s = readSizes(attrs);
  const ours = new Set(((s && s.values && s.values.multiple_options) || []).map((o) => String(o.value || o.title)));
  return { missing: theirs.filter((t) => !ours.has(t)), order: theirs };
}

/** The product's attributes with `add` sizes put into its size list, in S&S
 *  order, or a new size list when it has none. */
function withSizes(attrs, add, order, bySize) {
  const out = JSON.parse(JSON.stringify(attrs || {}));
  const s = readSizes(out);
  const base = baseCostOf(bySize);
  const old = (s && s.values && s.values.multiple_options) || [];
  const rank = (t) => { const i = order.indexOf(t); return i < 0 ? 999 : i; };
  const opts = [...old, ...add.map((t) => ({ title: t, value: t, price: '', default: '' }))]
    .map((o, i) => ({ o, i })).sort((a, b) => (rank(a.o.value || a.o.title) - rank(b.o.value || b.o.title)) || (a.i - b.i)).map((x) => x.o);
  const values = sizeOptions({ ...((s && s.values) || {}), multiple_options: opts }, bySize, base);
  if (s) { out[s.key].values = s.asString ? JSON.stringify(values) : values; return out; }
  out.QTYS = { id: 'QTYS', name: 'Quantity per Size', type: 'quantity', title: '', values: JSON.stringify(values) };
  return out;
}

async function main(buf) {
  const APPLY = process.argv.includes('--apply');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const ONLY = onlyArg ? onlyArg.slice(7).split(',').map((x) => x.trim()) : null;
  /* A typo must never become "no filter" or an empty IN (). */
  if (ONLY && (!ONLY.length || ONLY.some((x) => !/^\d+$/.test(x) || Number(x) <= 0))) { console.error('--only takes product ids, e.g. --only=88,94'); process.exit(2); }
  if (APPLY && !ONLY) { console.error('--apply needs --only=<ids>'); process.exit(2); }
  const e = JSON.parse(buf || '{}');
  const url = urlFromStdinJson(buf);
  if (!e.SSA_ACCOUNT || !e.SSA_API_KEY) { console.error('no SSA_ACCOUNT / SSA_API_KEY on stdin'); process.exit(2); }
  const ssa = makeClient(e.SSA_ACCOUNT, e.SSA_API_KEY);
  const rows = mysql(url, "SELECT id, name, active, IFNULL(supplier,'') supplier, supplier_style_id sid, attributes FROM lumise_products " +
    "WHERE IFNULL(supplier_style_id,0) > 0 AND (active=1 OR supplier='ssa-staged')" +
    (ONLY ? ' AND id IN (' + ONLY.join(',') + ')' : '') + ' ORDER BY id;', { rows: true });
  console.log((APPLY ? 'APPLYING' : 'REPORT') + ' — sizes S&S sells that the product does not offer, ' + rows.length + ' products\n');
  let n = 0;
  for (const p of rows) {
    let prods;
    try { prods = await ssa('products/?styleid=' + Number(p.sid)) || []; } catch (err) { console.log('  #' + p.id + ' S&S failed: ' + err.message.slice(0, 60)); continue; }
    const attrs = dejson(p.attributes) || {};
    const { missing, order } = missingSizes(attrs, prods);
    if (!missing.length) continue;
    n++;
    const tag = p.supplier === 'ssa-staged' ? 'staged' : 'live';
    console.log('  #' + String(p.id).padStart(3) + ' ' + tag.padEnd(7) + p.name.slice(0, 56).padEnd(58) + 'adds ' + missing.join(', '));
    if (!APPLY) continue;
    const dir = path.join(os.homedir(), 'jtees-backups');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'sizes-' + p.id + '-' + Date.now() + '.json'), JSON.stringify({ id: p.id, attributes: p.attributes }));
    const next = withSizes(attrs, missing, order, costBySize(prods));
    mysql(url, 'UPDATE lumise_products SET attributes=' + sq(enjson(next)) + ', updated=NOW() WHERE id=' + Number(p.id) + ';');
  }
  console.log('\n' + n + ' product(s) ' + (APPLY ? 'given their missing sizes' : 'missing sizes S&S sells'));
}

if (require.main === module) {
  let b = ''; process.stdin.on('data', (d) => (b += d)); process.stdin.on('end', () => main(b).catch((e) => { console.error(e.message); process.exit(1); }));
}
module.exports = { missingSizes, withSizes };
