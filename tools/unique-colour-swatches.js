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
    let n = parseInt(h.slice(1), 16);
    for (let i = 0; i < 256; i++) {
      n = (n + 1) & 0xffffff;
      const c = '#' + n.toString(16).padStart(6, '0');
      if (!used.has(c)) {
        used.add(c); moved++;
        return Object.assign({}, o, { value: c });
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

  for (const p of rows) {
    const at = dejson(p.attributes);
    const opts = at && at.COL && at.COL.values && at.COL.values.options;
    if (!Array.isArray(opts)) continue;
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
    at.COL.values.options = out;
    stmts.push('UPDATE lumise_products SET attributes=' + sq(enjson(at)) + ' WHERE id=' + p.id + ';');
  }

  console.log('\n  ' + touched + ' products · ' + colours + ' colourways separated');
  console.log('\n' + stmts.length + ' statements' +
    (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));
  if (!APPLY || !stmts.length) process.exit(0);
  mysql(url, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
});
