#!/usr/bin/env node
/* Give pocket tees already in the shop a Right chest side.
 *
 *   jtees-env | node tools/add-pocket-right-chest.js                 dry run, every product
 *   jtees-env | node tools/add-pocket-right-chest.js --only=269      dry run, one product
 *   jtees-env | node tools/add-pocket-right-chest.js --apply
 *   jtees-env | node tools/add-pocket-right-chest.js --restore=<backup file> [--apply]
 *
 * Owner, 2026-11-09: "pocket tees need a right chest print area. The right
 * chest area should be on the same side as the left chest and full front."
 * tools/lib/placements.js now gives new pocket tees SETS.pocket; this adds the
 * right_chest side to the ones already in the shop.
 *
 * The new side is a copy of the product's own left_chest (same photo, so the
 * designer draws its box on the Front side, Phase 2b) with the box mirrored
 * across the front box's centre line: the same size and height as the left
 * chest the owner already placed, on the other side of the shirt.
 *
 * The designer must already tell a pocket tee from a zip (core/cart.php
 * jt_front_open: right chest and NO left chest is a zip) before this runs, or
 * the full front would price as a chest logo. Designer #245 does that.
 *
 * Both copies are written: the product's own stages and every colourway's in
 * `variations`. A product or colourway that already has a right_chest, or has
 * no left_chest to mirror, is skipped, so re-running is safe. Every product
 * written is saved first to ~/jtees-backups/pocket-right-chest-<timestamp>.json;
 * --restore puts it back. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('./lib/db');
const { placementSet, aliasStages } = require('./lib/placements');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const RESTORE = (args.find((a) => a.startsWith('--restore=')) || '').slice(10);

const r1 = (n) => Math.round(n * 10) / 10;

/** A right_chest side mirrored from `left` across `front`'s centre, or null. */
function rightFrom(front, left) {
  const fe = front && front.edit_zone, le = left && left.edit_zone;
  const ok = (z) => z && ['width', 'height', 'left', 'top'].every((k) => z[k] !== '' && z[k] !== null && Number.isFinite(Number(z[k])))
    && Number(z.width) > 0 && Number(z.height) > 0;
  if (!ok(fe) || !ok(le)) return null;
  /* left_chest units per front unit (a colour photo can be drawn at its own size). */
  const fpw = Number(front.product_width), lpw = Number(left.product_width);
  const u = fpw > 0 && lpw > 0 ? lpw / fpw : 1;
  const side = JSON.parse(JSON.stringify(left));
  side.edit_zone = { ...le, left: r1(2 * Number(fe.left) * u - Number(le.left)) };
  delete side.jt_key;
  if ('label' in side) side.label = 'Right chest';
  return side;
}

/** `stages` with right_chest right after left_chest, or null when nothing changes. */
function withRight(stages) {
  if (!stages || !stages.front || !stages.left_chest || stages.right_chest) return null;
  const rc = rightFrom(stages.front, stages.left_chest);
  if (!rc) return null;
  const out = {};
  for (const [k, v] of Object.entries(stages)) { out[k] = v; if (k === 'left_chest') out.right_chest = rc; }
  return out;
}

/** Pure: the new stages and variations for one product, or null. */
function planProduct(p) {
  if (placementSet(p.name) !== 'pocket') return null;
  const raw = dejson(p.stages);
  if (!raw) return { error: 'stages could not be read' };
  /* Stored plain or wrapped as {stages: {...}, colors}. */
  const wrapped = raw.stages && typeof raw.stages === 'object' && raw.stages.front !== undefined;
  const pa = aliasStages(wrapped ? raw.stages : raw);
  const own = withRight(pa.stages);
  let variations = null, copies = 0;
  if (p.variations && !['NULL', '{}', ''].includes(String(p.variations).trim())) {
    variations = dejson(p.variations);
    if (!variations) return { error: 'variations could not be read' };
    for (const v of Object.values(variations.variations || {})) {
      if (!v || !v.stages) continue;
      const vw = v.stages.stages && typeof v.stages.stages === 'object';
      const va = aliasStages(vw ? v.stages.stages : v.stages);
      const st = withRight(va.stages);
      if (!st) continue;
      if (vw) v.stages.stages = va.restore(st); else v.stages = va.restore(st);
      copies++;
    }
  }
  if (!own && !copies) return null;
  let stages = raw;
  if (own) stages = wrapped ? { ...raw, stages: pa.restore(own) } : pa.restore(own);
  return { stages, variations: copies ? variations : null, own: !!own, copies,
    box: own ? own.right_chest.edit_zone : null, left: own ? own.left_chest.edit_zone : null };
}

function main(url) {
  if (RESTORE) return restore(url);
  const where = ONLY ? ' WHERE id=' + Number(ONLY) : '';
  const rows = mysql(url, 'SELECT id, name, active, stages, variations FROM lumise_products' + where +
    ' ORDER BY id;', { rows: true });
  const plans = [];
  for (const p of rows) {
    if (placementSet(p.name) === 'pocket' && !planProduct(p)) console.log('  #' + p.id + ' nothing to add (already has one, or no left chest to mirror) — ' + p.name);
    const plan = planProduct(p);
    if (!plan) continue;
    if (plan.error) { console.log('  #' + p.id + ' SKIPPED: ' + plan.error + ' — ' + p.name); continue; }
    plans.push({ p, plan });
    console.log('  #' + p.id + (String(p.active) === '1' ? '' : ' (inactive)') + ' ' + p.name +
      '\n      left chest  ' + (plan.left ? JSON.stringify(plan.left) : 'kept') +
      '\n      right chest ' + (plan.own ? JSON.stringify(plan.box) : 'kept') + ', ' + plan.copies + ' colourway copies');
  }
  console.log('\n  ' + plans.length + ' product(s) to give a right chest');
  if (!APPLY) { console.log('  dry run — pass --apply to write'); return; }
  if (!plans.length) return;

  const bdir = path.join(os.homedir(), 'jtees-backups');
  fs.mkdirSync(bdir, { recursive: true });
  const bfile = path.join(bdir, 'pocket-right-chest-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
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

module.exports = { planProduct, rightFrom, withRight };
