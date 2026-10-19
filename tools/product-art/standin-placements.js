#!/usr/bin/env node
/*
 * The garment's placement set on its STAND-IN drawing, for a style S&S never
 * photographed flat (owner, 2026-10-19: "model photo + stand-in").
 *
 *   node tools/product-art/standin-placements.js --vars=<file> <id>... [--apply] [--raws=<dir>] [--sheet=<png>]
 *
 * wire.js measures each colourway's PHOTO and writes cfgstages variations on
 * it. A stand-in has no photo: the product's own stages draw the shared base
 * art (products/basic_tshirt_front.png ...), which Lumise tints with the
 * chosen colour. So the boxes from tools/lib/placements.js are measured on
 * that drawing instead and written onto the product's own stages, keeping
 * each stage's drawing, overlay and size — only the label and edit zone are
 * new, plus the extra keys the set adds (left_chest).
 *
 * The drawings are the reverse of a cut-out photo: the garment is translucent
 * shading (the colour shows through it) and everything around it is opaque
 * white. measure.py reads opaque as garment, so each drawing is first turned
 * into a mask with the white outside made transparent.
 *
 * Only a product whose canvas tools/lib/canvas.js calls the garment itself
 * ('ok', not a photo) is touched; a jacket on hoodie art is left alone. The
 * old stages are saved to ~/jtees-backups before an --apply, as wire.js does.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { urlFromStdinJson, mysql, dejson, enjson, sq } = require('../lib/db');
const { placementSet, boxesFor, toEditZone } = require('../lib/placements');
const { canvasVerdict } = require('../lib/canvas');
const { classify } = require('../lib/garments');

/* The designer's drawing of each garment class (core/raws/products). */
const DRAWING = { tee: 'basic_tshirt', longslv: 'long_sleeve', tank: 'tank_tops', hoodie: 'hoodies_sweatshirt' };
/* A cropped tee drawn full length reads as the wrong garment (owner,
   2026-10-19: "cropped tee but full shirt"); lumise-designer #126 added it. */
const CROPPED_RE = /\bcrop(ped)?\b/i;
const drawingFor = (cls, name) => (cls === 'tee' && CROPPED_RE.test(name) ? 'cropped_tshirt' : DRAWING[cls]);

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const opt = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const RAWS = opt('raws', path.join(os.homedir(), 'lumise-designer', 'core', 'raws')).replace(/^~/, os.homedir());
const SHEET = opt('sheet', '');
const ids = argv.filter((a) => /^\d+$/.test(a)).map(Number);

const MASK = `
import sys
import numpy as np
from PIL import Image
x = np.array(Image.open(sys.argv[1]).convert('RGBA')).astype(int)
outside = (x[..., 3] > 245) & (x[..., :3].min(axis=2) > 245)
m = np.zeros(x.shape, np.uint8); m[..., :3] = 128; m[..., 3] = np.where(outside, 0, 255)
Image.fromarray(m).save(sys.argv[2], 'WEBP', lossless=True)`;

/** measure.py's record for a drawing, by its stage url. Cached per file. */
const measured = {};
function measure(url) {
  if (measured[url]) return measured[url];
  const src = path.join(RAWS, url);
  if (!fs.existsSync(src)) throw new Error('drawing not found: ' + src + ' (pass --raws=<designer>/core/raws)');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standin-'));
  const side = /back/.test(url) ? 'back' : 'front';
  const mask = path.join(dir, 'art-' + side + '.webp');
  try { return (measured[url] = measureMask(src, mask)); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function measureMask(src, mask) {
  let r = spawnSync('python3', ['-c', MASK, src, mask], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('mask: ' + (r.stderr || '').trim().split('\n').pop());
  r = spawnSync('python3', [path.join(__dirname, 'measure.py'), mask], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('measure: ' + (r.stderr || '').trim().split('\n').pop());
  return Object.values(JSON.parse(r.stdout))[0];
}

/** The product's new stages: every box of its set, on its own drawing. */
function standinStages(p) {
  const stages = dejson(p.stages) || {};
  const set = placementSet(p.name);
  if (!set) return { why: 'no placement set for this garment' };
  const v = canvasVerdict(p), cls = classify(p.name);
  if (!(v.verdict === 'ok' || (v.verdict === 'bad' && DRAWING[cls])) || v.real) return { why: 'canvas is ' + (v.real ? 'a photo' : v.verdict) + ' — not a stand-in this tool may place on' };
  /* On another garment's drawing (a muscle tee on the sleeved tee): moved to
     its own class's drawing, then checked again. */
  const want = drawingFor(cls, p.name);
  const onOther = want && Object.values(stages).some((s) => s && s.url && !String(s.url).includes(want + '_'));
  if (onOther && (v.verdict === 'bad' || want !== DRAWING[cls])) {
    for (const side of ['front', 'back']) if (stages[side]) stages[side].url = 'products/' + want + '_' + side + '.png';
    const again = canvasVerdict({ name: p.name, stages: enjson(stages) });
    if (again.verdict !== 'ok') return { why: 'no drawing of this garment (' + again.verdict + ')' };
  }
  else if (v.verdict !== 'ok') return { why: 'canvas is ' + v.verdict + ' and already on ' + want };
  const m = {};
  for (const side of ['front', 'back']) if (stages[side] && stages[side].url) m[side] = measure(stages[side].url);
  const boxes = boxesFor(set, m);
  if (!boxes.length) return { why: 'no boxes measured' };
  const out = {};
  for (const b of boxes) {
    const src = stages[b.side] || stages.front;
    const pw = src.product_width || 400;
    out[b.key] = Object.assign(JSON.parse(JSON.stringify(src)), {
      label: b.label, edit_zone: toEditZone(b, m[b.side].W, m[b.side].H, pw), product_width: pw,
    });
  }
  return { set, boxes, stages: out, m };
}

function run(buf) {
  const url = urlFromStdinJson(buf);
  const rows = mysql(url, 'SELECT id, name, stages FROM lumise_products WHERE id IN (' + ids.join(',') + ') ORDER BY id;', { rows: true });
  const sheet = [];
  let wrote = 0;
  for (const p of rows) {
    const r = standinStages(p);
    if (r.why) { console.log('#' + p.id + '  skipped — ' + r.why); continue; }
    console.log('#' + p.id + '  ' + p.name.slice(0, 50).padEnd(52) + r.set.padEnd(7) + Object.values(r.stages).map((s) => s.label).join(' · '));
    sheet.push({ id: p.id, name: p.name, stages: r.stages, m: r.m });
    if (!APPLY) continue;
    const bdir = path.join(os.homedir(), 'jtees-backups');
    fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, 'standin-' + p.id + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'),
      JSON.stringify({ id: p.id, stages: p.stages }));
    mysql(url, 'UPDATE lumise_products SET stages=' + sq(enjson(r.stages)) + ', updated=NOW() WHERE id=' + Number(p.id) + ';');
    wrote++;
  }
  if (SHEET) fs.writeFileSync(SHEET, JSON.stringify(sheet));
  console.log('\n' + (APPLY ? wrote + ' product(s) written' : 'dry run — pass --apply to write'));
}

if (require.main === module) {
  if (!ids.length) { console.error('usage: standin-placements.js --vars=<file> <id>... [--apply] [--raws=<dir>]'); process.exit(2); }
  const varsFile = opt('vars', '');
  if (varsFile) run(fs.readFileSync(varsFile.replace(/^~/, os.homedir()), 'utf8'));
  else { let b = ''; process.stdin.on('data', (d) => (b += d)); process.stdin.on('end', () => run(b)); }
}

module.exports = { standinStages, MASK };
