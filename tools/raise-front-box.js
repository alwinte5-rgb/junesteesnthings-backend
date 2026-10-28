#!/usr/bin/env node
/* Move the full-front design box 2" higher on shirts, hoodies and sweats.
 *
 *   jtees-env | node tools/raise-front-box.js                  dry run, every product
 *   jtees-env | node tools/raise-front-box.js --only=125       dry run, one product
 *   jtees-env | node tools/raise-front-box.js --only=125 --apply
 *   jtees-env | node tools/raise-front-box.js --apply
 *   jtees-env | node tools/raise-front-box.js --restore=<backup file> [--apply]
 *
 * WHY
 * ---
 * Owner, 2026-10-24: "the edit box on the hoodie is low. Can we move it up a
 * couple inches" — for shirts, hoodies and sweats, not caps, bags, signs or
 * mugs. tools/lib/placements.js now places new products 2" higher; this moves
 * the ones already in the shop.
 *
 * Only the `front` stage of a product whose placement set is `closed` (tees,
 * long sleeves, pullover hoodies and sweatshirts) or `kids` moves. On a zip,
 * polo or jacket `front` is the LEFT CHEST, and a tank's box already starts at
 * the strap line, so those are left alone; so are the left chest and the back.
 *
 * The box lives in two places and both must move: the product's own `stages`
 * and a copy inside every colourway in `variations`. Moving one would put the
 * box back where it was the moment a customer picks a colour.
 *
 * Inches come from the box itself: a full front is SETS.front.w inches wide, so
 * its width in canvas units gives the scale. The box never moves above the top
 * of the photo.
 *
 * Re-running is safe: a product already moved carries `jt_front_raised` on its
 * own front stage and is skipped. Every product written is saved first to
 * ~/jtees-backups/raise-front-<timestamp>.json, and --restore puts it back. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./lib/db');
const { placementSet, SETS, aliasStages } = require('./lib/placements');

const RAISE_IN = 2;
const MARK = 'jt_front_raised';
const MOVES = ['closed', 'kids'];

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const RESTORE = (args.find((a) => a.startsWith('--restore=')) || '').slice(10);

const r1 = (n) => Math.round(n * 10) / 10;

/** The width in inches of `set`'s full front, the scale for its box. */
function frontWidthIn(set) {
  const f = (SETS[set] || []).find((b) => b.key === 'front');
  return f ? f.w : null;
}

/** `stage.edit_zone` moved RAISE_IN inches up, or null when it cannot move. */
function raised(stage, set) {
  const ez = stage && stage.edit_zone;
  const win = frontWidthIn(set);
  if (!ez || !win || !(Number(ez.width) > 0)) return null;
  const dy = RAISE_IN * (Number(ez.width) / win);
  let top = Number(ez.top) - dy;
  /* Never above the photo: the top edge is centre + top - height/2. */
  const ph = Number(stage.product_height);
  if (ph > 0) top = Math.max(top, Number(ez.height) / 2 - ph / 2);
  top = r1(top);
  if (top >= Number(ez.top)) return null;
  return { ...ez, top };
}

/** Pure: the new stages and variations for one product, or null if nothing moves. */
function planProduct(p) {
  const set = placementSet(p.name);
  if (!MOVES.includes(set)) return null;
  /* By role, not key: an admin-made product keeps random stage ids (#14). */
  const pa = aliasStages(dejson(p.stages));
  const stages = pa.stages;
  if (!stages || !stages.front || stages.front[MARK]) return null;
  const front = raised(stages.front, set);
  if (!front) return null;

  const before = stages.front.edit_zone.top;
  stages.front = { ...stages.front, edit_zone: front, [MARK]: new Date().toISOString().slice(0, 10) };

  let variations = null;
  let copies = 0;
  /* No colourways: mysql -B prints NULL as the word, and an empty set is "{}". */
  if (p.variations && !['NULL', '{}', ''].includes(String(p.variations).trim())) {
    variations = dejson(p.variations);
    if (!variations) return { error: 'variations could not be read' };
    for (const v of Object.values(variations.variations || {})) {
      if (!v || !v.stages) continue;
      const va = aliasStages(v.stages);
      const f = va.stages.front;
      const ez = f && raised(f, set);
      if (ez) { va.stages.front = { ...f, edit_zone: ez }; copies++; }
      v.stages = va.restore(va.stages);
    }
  }
  return { set, before, after: front.top, stages: pa.restore(stages), variations, copies };
}

function main(url) {
  if (RESTORE) return restore(url);
  const where = ONLY ? ' WHERE id=' + Number(ONLY) : '';
  const rows = mysql(url, 'SELECT id, name, stages, variations FROM lumise_products' + where +
    ' ORDER BY id;', { rows: true });
  const plans = [];
  for (const p of rows) {
    const plan = planProduct(p);
    if (!plan) continue;
    if (plan.error) { console.log('  #' + p.id + ' SKIPPED: ' + plan.error + ' — ' + p.name); continue; }
    plans.push({ p, plan });
    console.log('  #' + p.id + ' ' + plan.set.padEnd(6) + ' top ' + plan.before + ' -> ' + plan.after +
      ', ' + plan.copies + ' colourway copies — ' + p.name);
  }
  console.log('\n  ' + plans.length + ' product(s) to move');
  if (!APPLY) { console.log('  dry run — pass --apply to write'); return; }
  if (!plans.length) return;

  const bdir = path.join(os.homedir(), 'jtees-backups');
  fs.mkdirSync(bdir, { recursive: true });
  const bfile = path.join(bdir, 'raise-front-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(bfile, JSON.stringify(plans.map(({ p }) =>
    ({ id: p.id, stages: p.stages, variations: p.variations }))));
  console.log('  backup ' + bfile);

  for (const { p, plan } of plans) {
    mysql(url, 'UPDATE lumise_products SET stages=' + sq(enjson(plan.stages)) +
      (plan.variations ? ', variations=' + sq(enjson(plan.variations)) : '') +
      ' WHERE id=' + Number(p.id) + ';');
  }
  console.log('  written. Restore with --restore=' + bfile + ' --apply');
}

function restore(url) {
  const saved = JSON.parse(fs.readFileSync(RESTORE, 'utf8'));
  console.log('  ' + saved.length + ' product(s) in ' + RESTORE);
  if (!APPLY) { console.log('  dry run — pass --apply to put them back'); return; }
  for (const s of saved) {
    mysql(url, 'UPDATE lumise_products SET stages=' + sq(s.stages) +
      (s.variations ? ', variations=' + sq(s.variations) : '') + ' WHERE id=' + Number(s.id) + ';');
  }
  console.log('  restored.');
}

if (require.main === module) {
  let buf = '';
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => main(urlFromStdinJson(buf)));
}

module.exports = { planProduct, raised, RAISE_IN, MARK };
