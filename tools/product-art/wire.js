#!/usr/bin/env node
/*
 * Step 5: turn a packed manifest into Lumise colourway variations.
 *
 *   ... | node tools/product-art/wire.js <productId> <manifest.json>
 *   ... | node tools/product-art/wire.js <productId> <manifest.json> --apply
 *
 * A variation carrying `cfgstages: true` supplies its own `stages`, which
 * replaces the product's when its conditions match. Conditions key on the
 * colour option's VALUE, which is why tools/unique-colour-swatches.js has to
 * have run first — two colourways sharing a hex cannot be told apart here
 * either.
 *
 * The stage is written with `overlay: false`. With `true`, app.js hands the art
 * to canvas.setOverlayImage() and it is painted OVER the customer's design —
 * right for a translucent shading wash, wrong for a photograph, which would
 * hide the design completely. With `false` the photo is added beneath, and the
 * design sits on the garment.
 *
 * `image` is set to the absolute Cloudinary URL. app.js only prefixes the
 * assets path `if (!stages[s].image)`, so setting it is what keeps the URL
 * from being rewritten to a local raws path that does not exist.
 */

const fs = require('fs');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./../lib/db');

const APPLY = process.argv.includes('--apply');
const [productId, manifestPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));

if (!productId || !manifestPath) {
  console.error('usage: wire.js <productId> <manifest.json> [--apply]');
  process.exit(2);
}

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  const url = urlFromStdinJson(buf);
  const man = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rows = mysql(url,
    'SELECT id, name, stages, attributes FROM lumise_products WHERE id=' + Number(productId) + ';',
    { rows: true });
  if (!rows.length) { console.error('no product ' + productId); process.exit(1); }
  const p = rows[0];
  const stages = dejson(p.stages), attrs = dejson(p.attributes);
  const opts = attrs && attrs.COL && attrs.COL.values && attrs.COL.values.options;
  if (!Array.isArray(opts)) { console.error(p.name + ' has no colour attribute'); process.exit(1); }

  /* A duplicated swatch would silently give two colourways the same variation,
     so refuse rather than write something that cannot be read back. */
  const vals = opts.map((o) => o.value);
  if (new Set(vals).size !== vals.length) {
    console.error('colour swatches are not unique on this product — run ' +
      'tools/unique-colour-swatches.js --apply first');
    process.exit(1);
  }

  const byTitle = new Map(opts.map((o) => [o.title, o.value]));
  const variations = {};
  let n = 0; const skipped = [];

  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + p.name + '\n');
  for (const c of man) {
    const value = byTitle.get(c.name);
    if (!value) { skipped.push(c.name + ' — no such colour on the product'); continue; }
    if (!c.front_url) { skipped.push(c.name + ' — no uploaded art'); continue; }
    n++;
    const st = JSON.parse(JSON.stringify(stages));
    for (const [side, url2] of [['front', c.front_url], ['back', c.back_url]]) {
      if (!st[side] || !url2) continue;          // a cap has no back stage; leave it alone
      st[side].source = 'uploads';
      st[side].url = url2;
      st[side].image = url2;
      st[side].overlay = false;
    }
    variations[String(n)] = {
      id: String(n), conditions: { COL: value }, price: '', sku: '',
      minqty: '', maxqty: '', description: '',
      cfgstages: true, cfgprinting: false, stages: st, printings: null,
    };
    console.log('  ' + c.name.padEnd(26) + value + '  ' +
      Object.keys(st).filter((s) => st[s].overlay === false).join('+'));
  }

  if (skipped.length) {
    console.log('\n  not wired:');
    for (const s of skipped) console.log('    ' + s);
  }
  console.log('\n  ' + n + ' colourway variations');
  if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

  const blob = { default: { COL: opts[0].value }, attrs: ['COL'], variations };
  mysql(url, 'UPDATE lumise_products SET variations=' + sq(enjson(blob)) +
    ' WHERE id=' + Number(productId) + ';');
  console.log('  written.');
});
