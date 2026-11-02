#!/usr/bin/env node
/* Give kids garments already in the shop a Left chest side.
 *
 *   jtees-env | node tools/add-kids-left-chest.js                 dry run, every product
 *   jtees-env | node tools/add-kids-left-chest.js --only=68       dry run, one product
 *   jtees-env | node tools/add-kids-left-chest.js --apply
 *   jtees-env | node tools/add-kids-left-chest.js --restore=<backup file> [--apply]
 *
 * Owner, 2026-11-02: "the left chest area isn't available on youth sizes".
 * Kids garments were set to Front and Back only (2026-10-18), so the youth tee
 * (#68) had no left_chest side and the designer drew no chest box on it.
 * tools/lib/placements.js now gives new kids products one; this adds it to the
 * ones already in the shop.
 *
 * The new side is a copy of the front (same photo, so the designer draws its
 * box on the front, Phase 2b) with SETS.kids' left_chest box. Inches come from
 * the front box itself, as in tools/raise-front-box.js: it is SETS.kids' front
 * width wide and its top edge sits that front's `top` below the shoulder line.
 *
 * Both copies are written: the product's own stages and every colourway's in
 * `variations`. A product or colourway that already has a left_chest is
 * skipped, so re-running is safe. Every product written is saved first to
 * ~/jtees-backups/kids-left-chest-<timestamp>.json; --restore puts it back.
 * Link the chest-logo price after: tools/add-dtf-chest-logo.js --apply. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./lib/db');
const { placementSet, SETS, aliasStages } = require('./lib/placements');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const RESTORE = (args.find((a) => a.startsWith('--restore=')) || '').slice(10);

const r1 = (n) => Math.round(n * 10) / 10;
const spec = (key) => SETS.kids.find((b) => b.key === key);

/** A left_chest side built from `front`, or null when the front has no box. */
function chestFrom(front) {
  const ez = front && front.edit_zone, F = spec('front'), C = spec('left_chest');
  if (!ez || !(Number(ez.width) > 0) || !(Number(ez.height) > 0)) return null;
  const u = Number(ez.width) / F.w;                    // units per inch
  const shoulder = Number(ez.top) - Number(ez.height) / 2 - F.top * u;
  let w = C.w * u, h = C.h * u, left = C.x * u, top = shoulder + C.cy * u;
  /* On the photo: centre offset + half the box within half the photo. */
  const pw = Number(front.product_width), ph = Number(front.product_height);
  if (pw > 0) left = Math.min(left, pw / 2 - w / 2);
  if (ph > 0) top = Math.max(top, h / 2 - ph / 2);
  const side = { ...front, edit_zone: { ...ez, width: r1(w), height: r1(h), left: r1(left), top: r1(top) } };
  delete side.jt_front_raised; delete side.jt_key;
  if ('label' in side) side.label = C.label;
  return side;
}

/** `stages` with left_chest right after front, or null when nothing changes. */
function withChest(stages) {
  if (!stages || !stages.front || stages.left_chest || stages.right_chest) return null;
  const lc = chestFrom(stages.front);
  if (!lc) return null;
  const out = {};
  for (const [k, v] of Object.entries(stages)) { out[k] = v; if (k === 'front') out.left_chest = lc; }
  return out;
}

/** Pure: the new stages and variations for one product, or null. */
function planProduct(p) {
  if (placementSet(p.name) !== 'kids') return null;
  const raw = dejson(p.stages);
  if (!raw) return { error: 'stages could not be read' };
  /* Stored plain or wrapped as {stages: {...}, colors}. */
  const wrapped = raw.stages && typeof raw.stages === 'object' && raw.stages.front !== undefined;
  const pa = aliasStages(wrapped ? raw.stages : raw);
  const own = withChest(pa.stages);
  let variations = null, copies = 0;
  if (p.variations && !['NULL', '{}', ''].includes(String(p.variations).trim())) {
    variations = dejson(p.variations);
    if (!variations) return { error: 'variations could not be read' };
    for (const v of Object.values(variations.variations || {})) {
      if (!v || !v.stages) continue;
      const vw = v.stages.stages && typeof v.stages.stages === 'object';
      const va = aliasStages(vw ? v.stages.stages : v.stages);
      const st = withChest(va.stages);
      if (!st) continue;
      if (vw) v.stages.stages = va.restore(st); else v.stages = va.restore(st);
      copies++;
    }
  }
  if (!own && !copies) return null;
  let stages = raw;
  if (own) stages = wrapped ? { ...raw, stages: pa.restore(own) } : pa.restore(own);
  return { stages, variations: copies ? variations : null, own: !!own, copies,
    box: own ? own.left_chest.edit_zone : null };
}

function main(url) {
  if (RESTORE) return restore(url);
  const where = ONLY ? ' WHERE id=' + Number(ONLY) : '';
  const rows = mysql(url, 'SELECT id, name, active, stages, variations FROM lumise_products' + where +
    ' ORDER BY id;', { rows: true });
  const plans = [];
  for (const p of rows) {
    const plan = planProduct(p);
    if (!plan) continue;
    if (plan.error) { console.log('  #' + p.id + ' SKIPPED: ' + plan.error + ' — ' + p.name); continue; }
    plans.push({ p, plan });
    console.log('  #' + p.id + (String(p.active) === '1' ? '' : ' (inactive)') + ' own ' + (plan.own ? JSON.stringify(plan.box) : 'kept') +
      ', ' + plan.copies + ' colourway copies — ' + p.name);
  }
  console.log('\n  ' + plans.length + ' product(s) to give a left chest');
  if (!APPLY) { console.log('  dry run — pass --apply to write'); return; }
  if (!plans.length) return;

  const bdir = path.join(os.homedir(), 'jtees-backups');
  fs.mkdirSync(bdir, { recursive: true });
  const bfile = path.join(bdir, 'kids-left-chest-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
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
      (s.variations && s.variations !== 'NULL' ? ', variations=' + sq(s.variations) : '') + ' WHERE id=' + Number(s.id) + ';');
  }
  console.log('  restored.');
}

if (require.main === module) {
  let buf = '';
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => main(urlFromStdinJson(buf)));
}

module.exports = { planProduct, chestFrom, withChest };
