#!/usr/bin/env node
/*
 * Give every colour a back to design on.
 *
 *   node tools/fill-colour-backs.js < ~/.jtees-art.json                 # dry run
 *   node tools/fill-colour-backs.js --apply < ~/.jtees-art.json
 *   node tools/fill-colour-backs.js --only=122,137 --apply < ~/.jtees-art.json
 *
 * wire.js writes one cfgstages variation per colour from S&S's photos. Where
 * S&S has no BACK photo of a colour, that colour opened with no Back side
 * (owner, 2026-10-20: "fix" the polos and quarter-zips that lack a back photo
 * for some colours). Such a colourway gets the product's back DRAWING — the
 * product's own non-photo back, or an older colourway's (placements.js
 * standins) — or, when every back is another colour's photo, a back measured
 * on the garment's drawing (standin-placements.js drawnBack). Never another
 * colour's photo: a white back on a navy polo is wrong.
 *
 * Only colourways with a front and no back are touched; every other stage,
 * the chest placements included, stays as it is. Old variations are saved to
 * ~/jtees-backups before an --apply.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFromStdinJson, mysql, enjson, dejson, sq } = require('./lib/db');
const { standins } = require('./lib/placements');

/** { variations, backs } with backs added, or null when nothing changes.
 *  `drawnBack(name, likeStage)` returns a measured drawing stage or null. */
function fillBacks(p, { drawnBack } = {}) {
  const st = dejson(p.stages) || {};
  const vars = p.variations ? dejson(p.variations) : null;
  if (!vars || !vars.variations) return null;
  const needs = Object.values(vars.variations).filter((v) => v && v.stages && v.stages.front && !v.stages.back);
  if (!needs.length) return null;
  let back = standins(st, vars).back;
  if (!back && drawnBack) back = drawnBack(p.name, st.front);
  if (!back) return null;
  const out = JSON.parse(JSON.stringify(vars));
  let backs = 0;
  for (const v of Object.values(out.variations)) {
    if (!v || !v.stages || !v.stages.front || v.stages.back) continue;
    v.stages.back = { ...JSON.parse(JSON.stringify(back)), label: 'Back' };
    backs++;
  }
  return { variations: out, backs };
}

function run(buf) {
  const APPLY = process.argv.includes('--apply');
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const ONLY = onlyArg ? onlyArg.slice(7).split(',').map((x) => x.trim()) : null;
  if (ONLY && (!ONLY.length || ONLY.some((x) => !/^\d+$/.test(x)))) { console.error('--only takes product ids, e.g. --only=122,137'); process.exit(2); }
  const url = urlFromStdinJson(buf);
  const { drawnBack } = require('./product-art/standin-placements');
  const rows = mysql(url, "SELECT id, name, active, IFNULL(supplier,'') supplier, stages, IFNULL(variations,'') variations FROM lumise_products " +
    "WHERE (active=1 OR supplier='ssa-staged')" + (ONLY ? ' AND id IN (' + ONLY.join(',') + ')' : '') + ' ORDER BY id;', { rows: true });
  const dir = path.join(os.homedir(), 'jtees-backups');
  let n = 0;
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — colours without a back, ' + rows.length + ' products\n');
  for (const p of rows) {
    let c;
    try { c = fillBacks(p, { drawnBack }); } catch (e) { console.log('  #' + p.id + ' skipped: ' + e.message.slice(0, 80)); continue; }
    if (!c) continue;
    n++;
    console.log('  #' + String(p.id).padStart(3) + ' ' + (p.supplier === 'ssa-staged' ? 'staged ' : 'live   ') + p.name.slice(0, 56).padEnd(58) + c.backs + ' colour(s) given a back');
    if (!APPLY) continue;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'colour-backs-' + p.id + '-' + Date.now() + '.json'), JSON.stringify({ id: p.id, variations: p.variations }));
    mysql(url, 'UPDATE lumise_products SET variations=' + sq(enjson(c.variations)) + ', updated=NOW() WHERE id=' + Number(p.id) + ';');
  }
  console.log('\n' + n + ' product(s) ' + (APPLY ? 'written (backups in ' + dir + ')' : 'to change — pass --apply to write'));
}

if (require.main === module) {
  let b = ''; process.stdin.on('data', (d) => (b += d)); process.stdin.on('end', () => run(b));
}
module.exports = { fillBacks };
