#!/usr/bin/env node
/*
 * Give every product attribute back its `id` and `name`.
 *
 *   ... | node tools/repair-attribute-ids.js            # dry run
 *   ... | node tools/repair-attribute-ids.js --apply
 *
 * The cart field renderers build their input as name="'+data.id+'"
 * (core/includes/tmpl.php, render_color() and the quantity renderer). Products
 * written by ssa-add-products carried no `id` at all, so the input rendered as
 * the literal name="undefined". lumise.cart.calc then does:
 *
 *     if (attrs[field.name] == undefined) return;
 *
 * which misses, and the field contributes NOTHING: no colour on the order, and
 * lumise.cart.qty never increments, so the line has no quantity to price. A
 * variation keyed on COL cannot match either, because the value it compares
 * against is never collected.
 *
 * `name` is the caption shown beside the field. Missing, it renders as a bare
 * ": " — which is how 57 live products came to have an unlabelled colour
 * picker and an unlabelled size grid.
 *
 * The id must equal the attribute KEY, because that is what cart.calc looks up.
 */

const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./lib/db');

const APPLY = process.argv.includes('--apply');

/* Captions matching the products that were built correctly by hand. */
const LABEL = {
  product_color: 'Color',
  quantity: 'Quantity per Size',
  color: 'Color',
  select: 'Options',
};

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  const url = urlFromStdinJson(buf);
  const rows = mysql(url,
    'SELECT id, name, active, attributes FROM lumise_products ORDER BY id;', { rows: true });

  const stmts = [];
  let touched = 0, fixed = 0;
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + rows.length + ' products\n');

  for (const p of rows) {
    const at = dejson(p.attributes);
    if (!at || typeof at !== 'object') continue;
    const notes = [];
    for (const key of Object.keys(at)) {
      const a = at[key];
      if (!a || typeof a !== 'object') continue;
      if (!a.id) { a.id = key; notes.push(key + '.id=' + key); fixed++; }
      if (!a.name) {
        a.name = LABEL[a.type] || key;
        notes.push(key + '.name="' + a.name + '"');
        fixed++;
      }
    }
    if (!notes.length) continue;
    touched++;
    console.log('  #' + String(p.id).padStart(3) + (p.active === '1' ? ' live ' : ' off  ') +
      p.name.slice(0, 42).padEnd(44) + notes.join('  '));
    stmts.push('UPDATE lumise_products SET attributes=' + sq(enjson(at)) + ' WHERE id=' + p.id + ';');
  }

  console.log('\n  ' + touched + ' products · ' + fixed + ' fields repaired');
  console.log('\n' + stmts.length + ' statements' +
    (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));
  if (!APPLY || !stmts.length) process.exit(0);
  mysql(url, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
});
