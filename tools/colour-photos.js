#!/usr/bin/env node
/* The photograph of each colourway, so a quote shows the colour that was picked.
 *
 *   node tools/colour-photos.js --vars=~/.jtees-art.json            # report only
 *   node tools/colour-photos.js --vars=~/.jtees-art.json --write
 *   node tools/colour-photos.js --from-env --write
 *
 * WHY
 * ---
 * A quote line resolves the chosen colourway and then asks it for a picture.
 * server.js has preferred the colourway's own photo over the product thumbnail
 * since the per-colourway art landed — but only 409 of 2212 colourways HAVE
 * one, because jt-catalog.php derives `image` from a product's variation
 * stages, and only the 29 products that went through tools/product-art/ have
 * variations. The other 74 products fall through to `thumbnail`, which is one
 * photo of ONE colourway for the whole product.
 *
 * So quote CDAF2C showed a white-grey Gildan 18600 under the word "Black":
 * #23 has no art, its thumbnail is the Ash colourway, and Ash is what every
 * one of its eighteen colours displayed.
 *
 * S&S already has the photo. `colorFrontImage` is the garment alone in that
 * colour — `Images/Color/19893_f_fm.jpg` is the Black 18600 — and it is a
 * different field from `styleImage`, which is the marketing shot of a person
 * wearing it. tools/product-art/README.md says that in capitals; this file
 * only ever reads the former.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a replacement for the product-art pipeline. That art is cut out on a
 * transparent ground and aligned to a print area, so the designer can put a
 * design ON it. This is a photograph for a customer to look at. server.js
 * prefers the art wherever it exists and reaches for this only when it does
 * not, which is why the map below deliberately still carries a colourway that
 * already has art: the fallback order is server.js's to decide, not this
 * file's, and a map that second-guesses it goes stale the day art is added.
 *
 * WHY A COMMITTED FILE RATHER THAN A COLUMN
 * -----------------------------------------
 * The catalogue reaches server.js over HTTP from jt-catalog.php, which lives
 * in the Lumise image — NOT on its volume — so a change there is wiped by the
 * next deploy. MySQL is reachable but nothing in the quote path reads it. A
 * generated file next to the tool that generates it is the pattern this repo
 * already uses for a derived price table, and it has the property that
 * matters here: what shipped is readable in the diff.
 *
 * STALENESS is safe by construction. A colour added after the last run is
 * simply absent, and an absent colour falls back to the thumbnail exactly as
 * it does today. Re-run it after tools/resync-colours.js.
 */
const fs = require('fs');
const path = require('path');
const { mysql, dejson, mysqlUrlFrom } = require('./lib/db');

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const only = argv.filter((a) => /^\d+$/.test(a)).map(Number);
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile && !argv.includes('--from-env')) {
  console.error('usage: colour-photos.js --vars=<file> | --from-env [productId...] [--write]');
  process.exit(2);
}
const fromFile = varsFile ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : {};
const env = argv.includes('--from-env') ? Object.assign({}, fromFile, process.env) : fromFile;
const url = mysqlUrlFrom(env);
if (!url) { console.error('no MySQL URL'); process.exit(2); }
if (!env.SSA_ACCOUNT || !env.SSA_API_KEY) { console.error('SSA credentials missing'); process.exit(2); }

const OUT = path.join(__dirname, '..', 'data', 'colour-photos.json');
const CDN = 'https://cdn.ssactivewear.com/';
const API = 'https://api.ssactivewear.com/v2/';
const auth = 'Basic ' + Buffer.from(env.SSA_ACCOUNT + ':' + env.SSA_API_KEY).toString('base64');

/* S&S throttles a long sweep and answers 429/503 while doing it. A throttled
   response deserializes to an empty list, which is indistinguishable from a
   style with no colours — the trap resync-colours.js documents, where a tool
   that believed it emptied a palette. So a throttle is retried, and a style
   that still will not answer is reported as UNREACHABLE and left out of the
   map rather than written as having no photos. */
let last = 0;
async function ssa(p, tries = 5) {
  let st = 0;
  for (let i = 0; i < tries; i++) {
    const wait = Math.max(0, last + 700 - Date.now()) + (i ? 1200 * i * i : 0);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const r = await fetch(API + p, {
        headers: { Authorization: auth, Accept: 'application/json' },
        signal: AbortSignal.timeout(60000),
      });
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

/** The colour option's own titles, in catalogue order. */
function colourTitles(attributes) {
  const attrs = dejson(attributes) || {};
  const key = Object.keys(attrs).find((k) => attrs[k] && attrs[k].type === 'product_color');
  const opts = (key && attrs[key].values && attrs[key].values.options) || [];
  return Array.isArray(opts) ? opts.map((o) => String(o.title || '')).filter(Boolean) : [];
}

/* Titles come from S&S originally, but 15 products were created by copying
   another and carry a palette the garment is not made in — that is the whole
   reason resync-colours.js exists. So a title is matched case-insensitively
   and on nothing else: a fuzzy match here would put the wrong photograph on a
   real colourway, which is the exact bug being fixed. An unmatched title is
   NAMED, never silently dropped. */
const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

(async () => {
  let where = 'active=1 AND supplier_style_id IS NOT NULL AND supplier_style_id>0';
  if (only.length) where += ' AND id IN (' + only.join(',') + ')';
  const rows = mysql(url,
    'SELECT id, name, supplier_style_id sid, attributes FROM lumise_products WHERE ' +
    where + ' ORDER BY id;', { rows: true });

  console.log((WRITE ? 'WRITING' : 'DRY RUN') + ' — ' + rows.length + ' products with a supplier style\n');

  const map = {};
  let colourways = 0, matched = 0, errors = 0;
  /* Two different failures, kept apart because only one of them is anybody's
     to fix. A colour S&S has never heard of means the palette is wrong and the
     shop may be offering a colour the garment is not made in — that is the
     #97 Harriton bug and it wants resync-colours.js. A colour S&S knows but
     has no photograph of is nothing anyone can do: it falls back to the
     thumbnail and stays there. Reporting them as one list buried the first
     kind inside the second, and pointed at a tool that would not have helped. */
  const wrongName = [], noPhoto = [], noneAtAll = [];

  for (const p of rows) {
    const titles = colourTitles(p.attributes);
    if (!titles.length) continue;

    let prods;
    try { prods = await ssa('products/?styleid=' + p.sid); }
    catch (e) {
      console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 42).padEnd(44) +
                  'UNREACHABLE: ' + e.message.slice(0, 40));
      errors++; continue;
    }
    if (!Array.isArray(prods) || !prods.length) {
      console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 42).padEnd(44) +
                  'no S&S rows — skipped');
      errors++; continue;
    }

    /* Every colour S&S sells this style in, whether or not it has a photo —
       so "we do not stock that colour" can be told apart from "we have no
       picture of it". Keying only the photographed ones reported a real
       colourway as a palette error. */
    const known = new Set(), byColour = new Map();
    for (const r of prods) {
      if (!r.colorName) continue;
      known.add(norm(r.colorName));
      if (!r.colorFrontImage) continue;
      if (!byColour.has(norm(r.colorName))) byColour.set(norm(r.colorName), r.colorFrontImage);
    }

    const forProduct = {};
    let hit = 0;
    for (const t of titles) {
      colourways++;
      const img = byColour.get(norm(t));
      if (!img) {
        const where = known.has(norm(t)) ? noPhoto : wrongName;
        where.push('#' + p.id + ' ' + p.name.slice(0, 30) + ' — ' + t);
        continue;
      }
      forProduct[t] = CDN + img;
      hit++; matched++;
    }
    if (hit) map[p.id] = forProduct;
    else noneAtAll.push('#' + p.id + ' ' + p.name.slice(0, 40));

    console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 42).padEnd(44) +
                String(hit) + '/' + titles.length);
  }

  console.log('\n  ' + matched + ' of ' + colourways + ' colourways have a photo · ' +
              Object.keys(map).length + ' products · ' + errors + ' unreachable');

  if (wrongName.length) {
    console.log('\n  S&S DOES NOT SELL THIS STYLE IN THIS COLOUR (' + wrongName.length + ')' +
                '\n  ACT ON THESE. The picture is the least of it: the shop is offering a' +
                '\n  colour the garment is not made in, so the order cannot be filled as' +
                '\n  sold. Run tools/resync-colours.js to rebuild the palette.\n');
    for (const u of wrongName) console.log('    ' + u);
  }
  if (noPhoto.length) {
    console.log('\n  S&S SELLS IT BUT HAS NO PHOTOGRAPH (' + noPhoto.length + ') — nothing to' +
                '\n  fix here. The colour is real and orderable; the supplier simply has no' +
                '\n  shot of it, so the line keeps the product thumbnail.\n');
    for (const u of noPhoto.slice(0, 25)) console.log('    ' + u);
    if (noPhoto.length > 25) console.log('    ... and ' + (noPhoto.length - 25) + ' more');
  }
  if (noneAtAll.length) {
    console.log('\n  NOT ONE COLOURWAY PHOTOGRAPHED (' + noneAtAll.length + ') — these show the' +
                '\n  product thumbnail on every colour, exactly as they did before:');
    for (const n of noneAtAll) console.log('    ' + n);
  }
  if (errors) {
    console.error('\n  Some styles failed AT THE API. Nothing above is a fact about the' +
                  '\n  catalogue until that is fixed, and this run must not be written:' +
                  '\n  a product missing here loses the photos it already had.');
  }

  if (!WRITE) { console.log('\n  dry run — pass --write to update ' + path.relative(process.cwd(), OUT)); return; }
  if (errors) { process.exitCode = 1; console.error('\n  refusing to write an incomplete map'); return; }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(map, null, 1) + '\n');
  console.log('\n  wrote ' + path.relative(process.cwd(), OUT));
})().catch((e) => { console.error(e.message); process.exit(1); });
