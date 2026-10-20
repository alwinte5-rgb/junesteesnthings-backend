#!/usr/bin/env node
/*
 * The designer offers FRONT and BACK only (owner, 2026-10-20: "lets only do
 * front and back on the designer. The extra sides will have to come in a
 * quote").
 *
 *   node tools/front-back-only.js < ~/.jtees-art.json            # dry run
 *   node tools/front-back-only.js --apply < ~/.jtees-art.json    # write
 *
 * The 2026-10-18 placement sets (tools/lib/placements.js) added a Left chest
 * tab to tees and hoodies and a Right chest tab to polos, zips and jackets,
 * on the product's own stages AND on every colourway's (wire.js writes one
 * cfgstages variation per colour). This removes every stage that is not
 * `front` or `back` from both, and labels the two that stay "Front" and
 * "Back". Their drawings, photos and print boxes are kept as they are: a zip
 * garment's `front` already IS its left chest, clear of the zipper, and a
 * tee's full front box covers the chest, so a chest logo still goes there.
 *
 * A colourway with a front but no back (S&S had no back photo of that
 * colour) is given the product's back DRAWING — never another colour's back
 * photo (tools/lib/placements.js standins) — so every colour offers both.
 *
 * Caps keep their one front. Live and staged products alike. Every changed
 * row's old stages and variations are saved to ~/jtees-backups first.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql, enjson, dejson, sq } = require('./lib/db');
const { standins } = require('./lib/placements');

const KEEP = ['front', 'back'];
const LABEL = { front: 'Front', back: 'Back' };

/** Stages cut to front + back, or null when there is nothing to change.
 *  A stage set with neither key is left alone: it is not a garment. */
function frontBack(stages) {
  if (!stages || typeof stages !== 'object') return null;
  const keys = Object.keys(stages);
  if (!keys.some((k) => KEEP.includes(k))) return null;
  const out = {};
  for (const k of KEEP) if (stages[k]) out[k] = { ...stages[k], label: LABEL[k] };
  const same = keys.length === Object.keys(out).length &&
    Object.keys(out).every((k) => stages[k].label === out[k].label);
  return same ? null : out;
}

/** { stages, variations, dropped, backs } for one product row, or null when
 *  it is already front + back. `dropped` lists the stage keys removed,
 *  `backs` how many colourways were given the back drawing. */
function cutProduct(p, opts = {}) {
  const st = dejson(p.stages);
  const vars = p.variations ? dejson(p.variations) : null;
  const dropped = new Set();
  const note = (s) => Object.keys(s || {}).filter((k) => !KEEP.includes(k)).forEach((k) => dropped.add(k));
  const newSt = frontBack(st);
  if (newSt) note(st);
  let varsChanged = false, backs = 0;
  const newVars = vars ? JSON.parse(JSON.stringify(vars)) : null;
  const drawn = standins(newSt || st, vars);
  /* Every back is another colour's photo: measure one on the garment's own
     drawing instead (tees, long sleeves, tanks, hoodies, crews). */
  if (!drawn.back && opts.drawnBack) {
    const anyFront = Object.values((vars && vars.variations) || {}).some((v) => v && v.stages && v.stages.front && !v.stages.back);
    if (anyFront) drawn.back = opts.drawnBack(p.name, (newSt || st || {}).front);
  }
  for (const v of Object.values((newVars && newVars.variations) || {})) {
    if (!v || !v.stages) continue;
    const cut = frontBack(v.stages);
    if (cut) { note(v.stages); v.stages = cut; varsChanged = true; }
    if (v.stages.front && !v.stages.back && drawn.back) {
      v.stages = { front: v.stages.front, back: { ...JSON.parse(JSON.stringify(drawn.back)), label: LABEL.back } };
      backs++; varsChanged = true;
    }
  }
  if (!newSt && !varsChanged) return null;
  return { stages: newSt, variations: varsChanged ? newVars : null, dropped: [...dropped], backs };
}

function run(buf) {
  const APPLY = process.argv.includes('--apply');
  const url = urlFromStdinJson(buf);
  const { drawnBack } = require('./product-art/standin-placements');
  const rows = mysql(url, "SELECT id, name, active, IFNULL(supplier,'') supplier, stages, IFNULL(variations,'') variations " +
    'FROM lumise_products ORDER BY id;', { rows: true });
  const bdir = path.join(os.homedir(), 'jtees-backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let n = 0;
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — front + back only, ' + rows.length + ' products\n');
  for (const p of rows) {
    const c = cutProduct(p, { drawnBack });
    if (!c) continue;
    n++;
    const tag = p.supplier === 'ssa-staged' ? 'staged' : Number(p.active) ? 'live' : 'off';
    console.log('  #' + String(p.id).padStart(3) + ' ' + tag.padEnd(7) + p.name.slice(0, 56).padEnd(58) +
      [c.dropped.length && 'drops ' + c.dropped.join(', '), c.backs && c.backs + ' colourway(s) given the back drawing']
        .filter(Boolean).join(' · ') || 'relabels');
    if (!APPLY) continue;
    fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, 'front-back-' + p.id + '-' + stamp + '.json'),
      JSON.stringify({ id: p.id, stages: p.stages, variations: p.variations }));
    const sets = [];
    if (c.stages) sets.push('stages=' + sq(enjson(c.stages)));
    if (c.variations) sets.push('variations=' + sq(enjson(c.variations)));
    mysql(url, 'UPDATE lumise_products SET ' + sets.join(', ') + ', updated=NOW() WHERE id=' + Number(p.id) + ';');
  }
  console.log('\n' + n + ' product(s) ' + (APPLY ? 'written (backups in ' + bdir + ')' : 'to change — pass --apply to write'));
}

if (require.main === module) {
  let b = ''; process.stdin.on('data', (d) => (b += d)); process.stdin.on('end', () => run(b));
}
module.exports = { frontBack, cutProduct };
