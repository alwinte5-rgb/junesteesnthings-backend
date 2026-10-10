#!/usr/bin/env node
/* A photograph of a person wearing each colourway, for the designer's
 * "See it on a person" preview (plan section E, 2026-10-09).
 *
 *   node tools/model-photos.js --vars=~/.jtees-art.json            # report only
 *   railway run --service junesteesnthings-backend node tools/model-photos.js --from-env
 *   ... --write [--out=<file>]
 *
 * The owner's rule: the person must be wearing THE product being sold, in the
 * colour the customer picked. S&S photographs some styles on a model per
 * colour (`colorOnModelFrontImage`, `...BackImage`, `...SideImage`). Those are
 * the only source. A colourway without one is left out, and the designer hides
 * the button for it; nothing is tinted or invented.
 *
 * This is tools/colour-photos.js reading different fields: same product list
 * (lumise_products with a supplier_style_id), same case-insensitive colour
 * match, same throttle handling, same refusal to write a map built while S&S
 * was failing (a product missing from a partial run would lose its photos).
 *
 * Output: { "<productId>": { "<colour title>": { "front": url, "back": url, "side": url } } }
 * with only the views S&S has. Every url is on cdn.ssactivewear.com.
 */
const fs = require('fs');
const path = require('path');
const { mysql, dejson, mysqlUrlFrom } = require('./lib/db');

const CDN = 'https://cdn.ssactivewear.com/';
const API = 'https://api.ssactivewear.com/v2/';
let auth = '';
const VIEWS = { front: 'colorOnModelFrontImage', back: 'colorOnModelBackImage', side: 'colorOnModelSideImage' };

/* Same throttle handling as colour-photos.js: a throttled answer reads as an
   empty list, so it is retried, and a style that will not answer is reported
   UNREACHABLE rather than written as having no photos. */
let last = 0;
async function ssa(p, tries = 5) {
  let st = 0;
  for (let i = 0; i < tries; i++) {
    const wait = Math.max(0, last + 700 - Date.now()) + (i ? 1200 * i * i : 0);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const r = await fetch(API + p, { headers: { Authorization: auth, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
      st = r.status;
      if (r.status === 429 || r.status >= 500) continue;
      if (!r.ok) throw new Error('S&S returned ' + r.status);
      return await r.json();
    } catch (e) {
      if (e.message && e.message.startsWith('S&S returned')) throw e;
    }
  }
  throw new Error('S&S unreachable (last ' + st + ')');
}

function colourTitles(attributes) {
  const attrs = dejson(attributes) || {};
  const key = Object.keys(attrs).find((k) => attrs[k] && attrs[k].type === 'product_color');
  const opts = (key && attrs[key].values && attrs[key].values.options) || [];
  return Array.isArray(opts) ? opts.map((o) => String(o.title || '')).filter(Boolean) : [];
}
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

/** The views S&S has for one colour row, as absolute CDN urls. Exported for the test. */
function viewsOf(row) {
  const out = {};
  for (const [view, field] of Object.entries(VIEWS)) {
    const v = row && row[field];
    if (typeof v === 'string' && /^Images\/[A-Za-z0-9_./-]+\.(jpg|jpeg|png)$/i.test(v)) out[view] = CDN + v;
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const WRITE = argv.includes('--write');
  const only = argv.filter((a) => /^\d+$/.test(a)).map(Number);
  const arg = (name) => ((argv.find((a) => a.startsWith('--' + name + '=')) || '').split('=').slice(1).join('=') || '')
    .replace(/^~/, process.env.HOME);
  const varsFile = arg('vars');
  if (!varsFile && !argv.includes('--from-env')) {
    console.error('usage: model-photos.js --vars=<file> | --from-env [productId...] [--write] [--out=<file>]');
    process.exit(2);
  }
  const fromFile = varsFile ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : {};
  const env = argv.includes('--from-env') ? Object.assign({}, fromFile, process.env) : fromFile;
  const url = mysqlUrlFrom(env);
  if (!url) { console.error('no MySQL URL'); process.exit(2); }
  if (!env.SSA_ACCOUNT || !env.SSA_API_KEY) { console.error('SSA credentials missing'); process.exit(2); }

  const OUT = arg('out') || path.join(__dirname, '..', 'data', 'model-photos.json');
  auth = 'Basic ' + Buffer.from(env.SSA_ACCOUNT + ':' + env.SSA_API_KEY).toString('base64');

  let where = 'active=1 AND supplier_style_id IS NOT NULL AND supplier_style_id>0';
  if (only.length) where += ' AND id IN (' + only.join(',') + ')';
  const rows = mysql(url, 'SELECT id, name, supplier_style_id sid, attributes FROM lumise_products WHERE ' +
    where + ' ORDER BY id;', { rows: true });
  console.log((WRITE ? 'WRITING' : 'DRY RUN') + ' — ' + rows.length + ' products with a supplier style\n');

  const map = {};
  let colourways = 0, withFront = 0, errors = 0;
  const brandless = [];
  for (const p of rows) {
    const titles = colourTitles(p.attributes);
    if (!titles.length) continue;
    let prods;
    try { prods = await ssa('products/?styleid=' + p.sid); }
    catch (e) { console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 42).padEnd(44) + 'UNREACHABLE'); errors++; continue; }
    if (!Array.isArray(prods) || !prods.length) { console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 42).padEnd(44) + 'no S&S rows'); errors++; continue; }

    const byColour = new Map();
    for (const r of prods) {
      if (!r.colorName || byColour.has(norm(r.colorName))) continue;
      const v = viewsOf(r);
      if (Object.keys(v).length) byColour.set(norm(r.colorName), v);
    }
    const forProduct = {};
    let hit = 0;
    for (const t of titles) {
      colourways++;
      const v = byColour.get(norm(t));
      if (!v) continue;
      forProduct[t] = v;
      if (v.front) { hit++; withFront++; }
    }
    if (Object.keys(forProduct).length) map[p.id] = forProduct;
    else brandless.push('#' + p.id + ' ' + p.name.slice(0, 40));
    console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 42).padEnd(44) + String(hit) + '/' + titles.length + ' on a model (front)');
  }

  console.log('\n  ' + withFront + ' of ' + colourways + ' colourways have a front model photo · ' +
    Object.keys(map).length + ' of ' + rows.length + ' products have at least one · ' + errors + ' unreachable');
  if (brandless.length) {
    console.log('\n  NO MODEL PHOTO FOR ANY COLOUR (' + brandless.length + ') — no "See it on a person" here:');
    for (const n of brandless) console.log('    ' + n);
  }
  if (!WRITE) { console.log('\n  dry run — pass --write to update ' + OUT); return; }
  if (errors) { process.exitCode = 1; console.error('\n  refusing to write an incomplete map'); return; }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, null, 1) + '\n');
  console.log('\n  wrote ' + OUT);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { viewsOf, colourTitles };
