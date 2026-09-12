#!/usr/bin/env node
/*
 * Give every colourway its own swatch value.
 *
 *   ... | node tools/unique-colour-swatches.js            # dry run
 *   ... | node tools/unique-colour-swatches.js --apply
 *
 * A `product_color` option's `value` is doing two jobs: it is the colour the
 * swatch is painted, and it is the identity Lumise writes onto the cart line
 * (`item.options.COL`). S&S returns ONE body colour per colourway, so a style
 * with "Black/ Black" and "Black/ White", or "Loden/ Black" and "Loden/ Khaki",
 * comes back with the same #hex twice.
 *
 * The customer then sees two swatches that are the same colour, and — the part
 * that costs money — the order records the same value whichever they pick. The
 * shop has no way to tell which cap was bought, and orders the wrong blank.
 *
 * A flat swatch cannot show two colours, so the body colour stays and the tie
 * is broken by stepping one unit along: invisible at 1/255, distinct in the
 * record. The full colourway name is already carried on the option's title.
 */

const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./lib/db');

const APPLY = process.argv.includes('--apply');

function dedupe(options) {
  const used = new Set();
  let moved = 0;
  const out = options.map((o) => {
    let h = String(o.value || '').toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(h)) { return o; }        // not a hex: leave it
    if (!used.has(h)) { used.add(h); return o; }
    const n = parseInt(h.slice(1), 16);
  /* Step to the nearest FREE shade, trying +1, -1, +2, -2 ... and never
     wrapping. The old rule was `n = (n + 1) & 0xffffff`, which turns #ffffff
     into #000000 — so "White" would have been given a BLACK swatch, and the
     premise of the whole trick ("invisible at 1/255, distinct in the record")
     was false at exactly the colour a shop sells most of. */
  for (let i = 1; i <= 512; i++) {
    for (const cand of [n + i, n - i]) {
      if (cand < 0 || cand > 0xffffff) continue;
      const c = '#' + cand.toString(16).padStart(6, '0');
      if (!used.has(c)) { used.add(c); moved++; return Object.assign({}, o, { value: c }); }
    }
  }
    used.add(h);
    return o;
  });
  return { out, moved };
}

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  const url = urlFromStdinJson(buf);
  const rows = mysql(url,
    'SELECT id, name, attributes FROM lumise_products WHERE active=1 ORDER BY id;', { rows: true });

  const stmts = [];
  let touched = 0, colours = 0;
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + rows.length + ' live products\n');

  const skipped = [];
  for (const p of rows) {
    const at = dejson(p.attributes);
    /* Find the colour attribute by its TYPE, not by the key 'COL'.
       15 of 102 active products key it 'BCOL' — including #88, which has 115
       colourways sharing 45 swatches. This loop used to read at.COL, miss
       them, and `continue` in silence, so the run reported a clean catalogue
       while every one of those products still recorded the wrong colour on an
       order. A reader that skips a row must say which row and why. */
    const key = at && Object.keys(at).find((k) => at[k] && at[k].type === 'product_color');
    const opts = key && at[key].values && at[key].values.options;
    if (!Array.isArray(opts)) {
      skipped.push('#' + p.id + '  ' + String(p.name).slice(0, 44) +
        (at ? ' — no product_color attribute' : ' — attributes could not be decoded'));
      continue;
    }
    const { out, moved } = dedupe(opts);
    if (!moved) continue;
    touched++; colours += moved;
    console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 46).padEnd(48) +
      moved + ' colourway' + (moved > 1 ? 's' : '') + ' given their own swatch');
    for (let i = 0; i < out.length; i++) {
      if (out[i].value !== opts[i].value) {
        console.log('        ' + String(opts[i].title).slice(0, 34).padEnd(36) +
          opts[i].value + '  ->  ' + out[i].value);
      }
    }
    at[key].values.options = out;
    stmts.push('UPDATE lumise_products SET attributes=' + sq(enjson(at)) + ' WHERE id=' + p.id + ';');
  }

  console.log('\n  ' + touched + ' products · ' + colours + ' colourways separated');
  if (skipped.length) {
    console.log('\n  ' + skipped.length + ' product(s) NOT checked — say so rather than imply they are clean:');
    for (const x of skipped) console.log('    ' + x);
  }
  console.log('\n' + stmts.length + ' statements' +
    (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));
  if (!APPLY || !stmts.length) process.exit(0);
  mysql(url, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
});
