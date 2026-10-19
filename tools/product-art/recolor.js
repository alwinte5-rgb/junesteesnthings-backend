#!/usr/bin/env node
/*
 * Colourways S&S never photographed, made from a REAL photo of the same style
 * (owner, 2026-10-18: "the redraws were really bad" — drawing a garment from a
 * prompt invented its shape; recolouring a real one keeps the folds, seams and
 * cut, and changes only the fabric).
 *
 *   <vars json> | node tools/product-art/recolor.js <productDir>... [--only=<slug>] [--force] [--quality=medium]
 *   node tools/product-art/recolor.js --apply <productDir>... [--only=<slug>]
 *
 * <productDir> is a run.js output folder (~/jtees-product-art/live/148-...).
 * The vars JSON carries OPENAI_API_KEY, read from stdin, never an argument.
 *
 * MAKE (default): for every colour in colours.json that has no photo, the
 * photographed colour nearest to it (S&S's own swatch hex, c1) is padded to a
 * square and sent to OpenAI's image edit with an instruction to change the
 * fabric colour only, on a transparent background. The answer is cropped back
 * to the source's frame, so the garment sits where every other colourway's
 * does and measure.py finds the same body. Written to <dir>/recolor/, with
 * recolor.json saying which photo each came from. Nothing in the shop changes.
 *
 * The model follows a colour's NAME over its hex: "Sand Dune" came back camel
 * twice against a pinkish-tan swatch (2026-10-19). No measured threshold told
 * it apart from approved results (median RGB or Lab a*b* distance, lighting
 * moves both as much), so the review sheet's swatch dot is the check. A
 * rejected one was fixed by scaling its RGB channels so the fabric's median
 * lands on the swatch, which keeps the folds and shading.
 *
 * APPLY (after the owner approves the review sheet): the approved recolours
 * become <slug>-<side>.webp next to the real ones. pack.py reuses any .webp
 * already on disk, so the next `run.js <id> --apply` uploads and wires them
 * like a photograph.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const opt = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const ONLY = opt('only', '');
const QUALITY = opt('quality', 'medium');
const dirs = argv.filter((a) => !a.startsWith('--'));

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
/* A pattern is not one fabric colour: recolouring a plaid or a camo invents a
   new pattern, so a patterned colour is never a source, and is never made. A
   name with a slash is two colours (S&S's "Varsity Maroon/ Oxford"). */
const PATTERN = /\/|camo|plaid|buffalo|tie.?dye|stripe|check|gingham|tartan|marble|floral|print/i;
const single = (c) => !c.c2 && !PATTERN.test(c.name);

/* Image work in Python, where Pillow already is (pack.py, cutout.py). */
function py(code, args) {
  const r = spawnSync('python3', ['-c', code, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error((r.stderr || '').trim().split('\n').pop());
  return r.stdout.trim();
}
const PAD = `
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA'); w, h = im.size; s = max(w, h)
sq = Image.new('RGBA', (s, s), (0, 0, 0, 0)); sq.paste(im, ((s - w) // 2, (s - h) // 2))
sq.resize((1024, 1024), Image.LANCZOS).save(out)
print(w, h)`;
const CROP = `
import sys
from PIL import Image
got, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
s = max(w, h); im = Image.open(got).convert('RGBA').resize((s, s), Image.LANCZOS)
im.crop(((s - w) // 2, (s - h) // 2, (s - w) // 2 + w, (s - h) // 2 + h)).save(out)`;
const WEBP = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGBA'); im.thumbnail((800, 800), Image.LANCZOS)
im.save(sys.argv[2], 'WEBP', quality=90, method=6)`;

function prompt(name, hex) {
  return `This is a product photo of a blank garment on a transparent background. ` +
    `Change ONLY the fabric colour of the garment to "${name}" (approximately ${hex}). ` +
    `Keep everything else exactly as it is: the same garment, shape, size, position, folds, wrinkles, seams, ` +
    `stitching, collar, cuffs, zipper, buttons, drawcords and any tags. Keep realistic fabric texture and lighting. ` +
    `Hardware, zippers, buttons and contrast trim keep their own colours. ` +
    `Do not add any logo, print, text, person, mannequin or background. The background stays fully transparent.`;
}

async function edit(key, png, name, hex) {
  const form = new FormData();
  form.append('model', 'gpt-image-1');
  form.append('image', new Blob([fs.readFileSync(png)], { type: 'image/png' }), 'garment.png');
  form.append('prompt', prompt(name, hex));
  form.append('size', '1024x1024');
  form.append('quality', QUALITY);
  form.append('background', 'transparent');
  form.append('output_format', 'png');
  form.append('n', '1');
  const r = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: form,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status !== 200 || !j.data || !j.data[0] || !j.data[0].b64_json) {
    /* The service's own words, never the key. */
    const msg = (j.error && (j.error.message || j.error.code)) || 'no image returned';
    throw new Error('OpenAI image edit ' + r.status + ': ' + String(msg).slice(0, 200));
  }
  return Buffer.from(j.data[0].b64_json, 'base64');
}

/** Colours with no photo, and the photographed colour each is made from. */
function plan(dir) {
  const cols = JSON.parse(fs.readFileSync(path.join(dir, 'colours.json'), 'utf8'));
  const has = (c, side) => fs.existsSync(path.join(dir, slug(c.name) + '-' + side + '.webp'));
  const shot = cols.filter((c) => has(c, 'front') && rgb(c.c1));
  const sides = ['front', 'back'].filter((s) => shot.some((c) => has(c, s)));
  const out = [];
  for (const c of cols) {
    if (has(c, 'front') || (ONLY && slug(c.name) !== ONLY)) continue;
    const want = rgb(c.c1);
    if (!want) { out.push({ c, skip: 'S&S gives no swatch colour' }); continue; }
    if (!single(c)) { out.push({ c, skip: 'a pattern or two colours, not one fabric colour' }); continue; }
    const src = shot.filter(single).sort((a, b) => dist(rgb(a.c1), want) - dist(rgb(b.c1), want))[0];
    if (!src) { out.push({ c, skip: 'no single-colour photo to start from' }); continue; }
    out.push({ c, src, sides: sides.filter((s) => has(src, s)) });
  }
  return out;
}

async function make(dir, key) {
  const rdir = path.join(dir, 'recolor');
  fs.mkdirSync(rdir, { recursive: true });
  const logPath = path.join(rdir, 'recolor.json');
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : {};
  let made = 0;
  for (const p of plan(dir)) {
    const sl = slug(p.c.name);
    if (p.skip) { console.log('  ' + p.c.name.padEnd(26) + 'skipped — ' + p.skip); log[sl] = { name: p.c.name, skipped: p.skip }; continue; }
    const rec = { name: p.c.name, hex: p.c.c1, from: p.src.name, fromHex: p.src.c1, sides: {} };
    for (const side of p.sides) {
      const out = path.join(rdir, sl + '-' + side + '.png');
      if (fs.existsSync(out) && !FORCE) { rec.sides[side] = path.basename(out); continue; }
      const tmp = path.join(rdir, '.in-' + sl + '-' + side + '.png'), got = path.join(rdir, '.out-' + sl + '-' + side + '.png');
      try {
        const [w, h] = py(PAD, [path.join(dir, slug(p.src.name) + '-' + side + '.webp'), tmp]).split(' ').map(Number);
        fs.writeFileSync(got, await edit(key, tmp, p.c.name, p.c.c1));
        py(CROP, [got, out, String(w), String(h)]);
        rec.sides[side] = path.basename(out); made++;
        console.log('  ' + p.c.name.padEnd(26) + side.padEnd(6) + ' from ' + p.src.name);
      } catch (e) {
        rec.error = (rec.error ? rec.error + '; ' : '') + side + ': ' + e.message;
        console.log('  ' + p.c.name.padEnd(26) + side.padEnd(6) + ' FAILED — ' + e.message);
      } finally {
        for (const f of [tmp, got]) if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
    log[sl] = rec;
    fs.writeFileSync(logPath, JSON.stringify(log, null, 1));   // after each colour: a killed run keeps what it paid for
  }
  return made;
}

function apply(dir) {
  const rdir = path.join(dir, 'recolor'), logPath = path.join(rdir, 'recolor.json');
  if (!fs.existsSync(logPath)) { console.log('  nothing made here'); return 0; }
  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  let n = 0;
  for (const [sl, rec] of Object.entries(log)) {
    if (rec.skipped || (ONLY && sl !== ONLY)) continue;
    for (const [side, file] of Object.entries(rec.sides || {})) {
      const web = path.join(dir, sl + '-' + side + '.webp');
      if (fs.existsSync(web)) continue;                      // a real photo (or an earlier apply) wins
      py(WEBP, [path.join(rdir, file), web]); n++;
      console.log('  ' + rec.name.padEnd(26) + side + ' → ' + path.basename(web));
    }
  }
  return n;
}

async function main(key) {
  let total = 0;
  for (const d of dirs) {
    const dir = path.resolve(d.replace(/^~/, process.env.HOME));
    console.log('\n' + path.basename(dir));
    total += APPLY ? apply(dir) : await make(dir, key);
  }
  console.log('\n' + total + (APPLY ? ' recolours placed — now run.js <ids> --apply to upload and wire them' : ' images made — review before --apply'));
}

if (require.main !== module) { /* required by a test: no run */ }
else if (!dirs.length) { console.error('usage: recolor.js <productDir>... [--apply]'); process.exit(2); }
else if (APPLY) main(null).catch((e) => { console.error(e.message); process.exit(1); });
else {
  let buf = '';
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => {
    let key;
    try { key = JSON.parse(buf).OPENAI_API_KEY; } catch { /* reported below */ }
    if (!key) { console.error('OPENAI_API_KEY missing from the vars on stdin'); process.exit(2); }
    main(key).catch((e) => { console.error(e.message); process.exit(1); });
  });
}

module.exports = { plan, prompt };
