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
      /* `image` is the load-bearing one: app.js only builds a path from `url`
         when image is absent (`if (!stages[s].image)`), so with image set the
         URL in `url` was a second copy of the same ~130 characters. Stored
         through enjson — urlencode then base64 — each copy costs roughly 240
         bytes, and `variations` is TEXT with a hard 65,535-byte ceiling. #25
         at 55 colourways did not fit. `url` keeps the file name so the row is
         still readable by eye. */
      st[side].url = String(url2).split('/').pop();
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

  const blob = { default: { COL: opts[0].value }, attrs: ['COL'], variations };
  const encoded = enjson(blob);

  /* What is stored is enjson's base64(urlencode(json)), roughly nine times the
     raw JSON, and MySQL reports going over as "Data too long for column" —
     which says nothing about how many colourways would fit. Refuse here
     instead, with the numbers.

     The ceiling is READ from the column, never assumed: it was TEXT (65,535)
     and is now MEDIUMTEXT (16MB), and a hardcoded limit outlived the change by
     exactly one run — refusing a write that would have succeeded. */
  const col = mysql(url,
    'SELECT CHARACTER_MAXIMUM_LENGTH n FROM information_schema.COLUMNS ' +
    "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='lumise_products' AND COLUMN_NAME='variations';",
    { rows: true });
  const LIMIT = Number(col[0] && col[0].n) || 65535;
  console.log('  ' + encoded.length + ' bytes of ' + LIMIT + ' (' +
    Math.round((encoded.length / LIMIT) * 100) + '% of the column)');
  if (encoded.length > LIMIT) {
    console.error('  TOO LARGE — ' + n + ' colourways need ' + encoded.length +
      ' bytes, the column holds ' + LIMIT + '.');
    console.error('  About ' + Math.floor(LIMIT / (encoded.length / n)) +
      ' colourways fit. Either cut what each variation stores, or widen the ' +
      'column (MEDIUMTEXT holds 16MB).');
    process.exit(1);
  }

  /* After the size report, so a dry run answers the question that actually
     matters about a large style: will this fit. */
  if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

  mysql(url, 'UPDATE lumise_products SET variations=' + sq(encoded) +
    ' WHERE id=' + Number(productId) + ';');
  console.log('  written.');
});
