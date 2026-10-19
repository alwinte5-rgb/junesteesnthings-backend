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
 *
 * PLACEMENTS (2026-10-18). Each colourway's photos are measured
 * (measure.py) and given the garment's full placement set from
 * tools/lib/placements.js — Full front / Left chest / Back on a tee, Left chest
 * / Right chest / Back on a quarter-zip or polo — sized and positioned on THAT
 * photo, instead of a copy of the silhouette's one box. The product's own
 * `stages` get the default colourway's, so every surface lists the same
 * placements. --sheet=<file> appends the default colourway's boxes to a
 * review file for placement-sheet.py. A garment with no placement set, or a
 * photo that cannot be measured, keeps the old copy-the-box behaviour.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./../lib/db');
const { placementSet, boxesFor, stagesFor, keepUncovered, standins } = require('./../lib/placements');

const SHEET = (process.argv.find((a) => a.startsWith('--sheet=')) || '').slice(8);
const OVERRIDES = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'placement-overrides.json'), 'utf8')); }
  catch { return {}; }
})();

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
    'SELECT id, name, stages, attributes, variations, IFNULL(supplier_style_id,0) sid FROM lumise_products WHERE id=' + Number(productId) + ';',
    { rows: true });
  if (!rows.length) { console.error('no product ' + productId); process.exit(1); }
  const p = rows[0];
  const stages = dejson(p.stages), attrs = dejson(p.attributes);
  /* Find the colour attribute by its TYPE. 15 of 102 active products key it
     'BCOL' rather than 'COL' — #88 among them — and reading attrs.COL reported
     every one of them as having no colour attribute at all, after its 115
     images had already been cut and uploaded.

     The key matters twice: the variations written below key their conditions on
     it too, so hardcoding 'COL' here and there would have produced variations
     that look wired and match nothing. */
  const colKey = attrs && Object.keys(attrs).find((k) => attrs[k] && attrs[k].type === 'product_color');
  const opts = colKey && attrs[colKey].values && attrs[colKey].values.options;
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

  /* Measure every cut-out once. Keyed by file name, which is how the manifest
     names them (front_web / back_web). */
  const set = placementSet(p.name);
  const ov = OVERRIDES[String(p.sid)] || {};
  let meas = {};
  if (set) {
    const r = spawnSync('python3', [path.join(__dirname, 'measure.py'), path.dirname(path.resolve(manifestPath))],
      { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (r.status === 0) { try { meas = JSON.parse(r.stdout); } catch { meas = {}; } }
    else console.log('  could not measure the photos — keeping the single copied box');
  }
  let productStages = null, sheetItem = null;
  const STANDIN = standins(stages, dejson(p.variations));
  if (stages && stages.back && !STANDIN.back) {
    console.log('  no stand-in Back left on this product or its colourways — a colour without a back photo gets no Back; restore stages from ~/jtees-backups');
  }
  const stagesByValue = new Map();
  /* One colour's photo that cannot be measured borrows the first measurable
     colour's measurements (same style, same photo set), so every colourway
     lists the same placements — deciding per colour left one swatch on the
     old single box, or with no Back at all. */
  let ref = null;
  for (const c of man) {
    const f = c.front_web && meas[path.basename(c.front_web)];
    if (f && !f.error) {
      const b = c.back_web && meas[path.basename(c.back_web)];
      ref = { front: f, back: b && !b.error ? b : null };
      break;
    }
  }

  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + p.name + '\n');
  for (const c of man) {
    const value = byTitle.get(c.name);
    if (!value) { skipped.push(c.name + ' — no such colour on the product'); continue; }
    if (!c.front_url) { skipped.push(c.name + ' — no uploaded art'); continue; }
    n++;
    const mm = {}, sizes = {}, files = {};
    for (const side of ['front', 'back']) {
      const f = c[side + '_web'] && meas[path.basename(c[side + '_web'])];
      if (f && !f.error) { mm[side] = f; sizes[side] = { W: f.W, H: f.H }; files[side] = c[side + '_web']; }
      else if (ref && ref[side] && c[side + '_url']) { mm[side] = ref[side]; sizes[side] = { W: ref[side].W, H: ref[side].H }; }
    }
    const boxes = set && mm.front ? boxesFor(set, mm, ov) : [];
    if (boxes.length) {
      const st = keepUncovered(STANDIN, boxes, stagesFor(stages, boxes, { front: c.front_url, back: c.back_url }, sizes));
      variations[String(n)] = {
        id: String(n), conditions: { [colKey]: value }, price: '', sku: '',
        minqty: '', maxqty: '', description: '',
        cfgstages: true, cfgprinting: false, stages: st, printings: null,
      };
      /* The sheet is drawn from the STORED edit zones (converted back the way
         app.js draws them), so it checks the unit conversion too, not just the
         boxes before it. */
      stagesByValue.set(value, st);
      if (!productStages) {
        productStages = st;
        sheetItem = { title: '#' + p.id + ' [' + set + '] ' + p.name, files,
          /* A kept stand-in may carry no edit zone; the sheet cannot draw one. */
          boxes: Object.entries(st).filter(([, s]) => s.edit_zone).map(([key, s]) => ({ key, label: s.label, side: (boxes.find((b) => b.key === key) || { side: key }).side,   // a kept stand-in side has no box
            ez: s.edit_zone, pw: s.product_width })) };
      }
      console.log('  ' + c.name.padEnd(26) + value + '  ' + Object.values(st).map((s) => s.label).join(' · '));
      continue;
    }
    /* Only front and back: an earlier placement run may have left chest
       stages in the product's stages, drawn on ONE colour's photo, and this
       path swaps only front/back — they would show that colour on every swatch. */
    const st = JSON.parse(JSON.stringify(Object.fromEntries(['front', 'back'].filter((k) => stages[k]).map((k) => [k, stages[k]]))));
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
      id: String(n), conditions: { [colKey]: value }, price: '', sku: '',
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

  /* The product's own stages are what an unpicked or unwired colour draws:
     the DEFAULT colourway's (opts[0]), not whichever the manifest listed first. */
  if (stagesByValue.has(opts[0].value)) productStages = stagesByValue.get(opts[0].value);
  const blob = { default: { [colKey]: opts[0].value }, attrs: [colKey], variations };
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

  if (SHEET && sheetItem) {
    let all = []; try { all = JSON.parse(fs.readFileSync(SHEET, 'utf8')); } catch { /* new file */ }
    all = all.filter((x) => !x.title.startsWith('#' + p.id + ' ')).concat([sheetItem]);
    fs.writeFileSync(SHEET, JSON.stringify(all));
  }

  /* After the size report, so a dry run answers the question that actually
     matters about a large style: will this fit. */
  if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

  /* The blobs being replaced, saved first: they hold every colourway's
     canvas and print areas, and nothing else in the shop remembers them. */
  const bdir = path.join(require('os').homedir(), 'jtees-backups');
  fs.mkdirSync(bdir, { recursive: true });
  const bfile = path.join(bdir, 'wire-' + p.id + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(bfile, JSON.stringify({ id: p.id, stages: p.stages, variations: p.variations }));
  console.log('  backup ' + bfile);

  /* The product's own stages carry the same placements (the default
     colourway's), so the placement list is the same before a colour is picked. */
  mysql(url, 'UPDATE lumise_products SET variations=' + sq(encoded) +
    (productStages ? ', stages=' + sq(enjson(productStages)) : '') +
    ' WHERE id=' + Number(productId) + ';');
  console.log('  written.');
});
