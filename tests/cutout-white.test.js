/* tools/product-art/cutout.py keeps a white garment (2026-10-18).
 *
 * A fixed "238 or brighter is background" cut ate white shirts: #130's white
 * tee kept 20% of itself. Background is now the backdrop's own shade, read
 * from the border, so fabric at 240-250 on a 255 backdrop stays — and a light
 * grey backdrop is still removed.
 *
 * Run: node --test tests/cutout-white.test.js   (needs python3 with numpy + Pillow)
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'tools', 'product-art');
const py = (code) => spawnSync('python3', ['-c', code], { cwd: DIR, encoding: 'utf8' });
const ok = py('import numpy, PIL').status === 0;

/* Builds a 100x100 photo: backdrop `bg`, a 60x60 "garment" of `fg` touching
   nothing but the backdrop, and returns the share of the garment kept opaque
   and of the backdrop removed. */
function run(bg, fg) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cut-'));
  const r = py(`
import numpy as np
from PIL import Image
from cutout import cutout
a = np.full((100, 100, 3), ${bg}, np.uint8); a[20:80, 20:80] = ${fg}
Image.fromarray(a).save('${d}/in.png')
cutout('${d}/in.png', '${d}/out.png', pad=0, feather=0)
# The output is cropped to whatever stayed opaque: 60x60 means exactly the garment.
full = np.asarray(Image.open('${d}/out.png'))
print(full.shape[0], full.shape[1], int((full[:, :, 3] > 200).mean() * 1000))
`);
  assert.strictEqual(r.status, 0, r.stderr);
  const [h, w, permil] = r.stdout.trim().split('\n').pop().split(' ').map(Number);
  return { h, w, opaque: permil / 1000 };
}

test('a white shirt on a pure-white backdrop keeps its body', { skip: !ok && 'python3 numpy/Pillow missing' }, () => {
  const r = run(255, 246);
  /* Cropped to the 60x60 garment and fully opaque: nothing was eaten. */
  assert.deepStrictEqual([r.h, r.w], [60, 60]);
  assert.ok(r.opaque > 0.98, 'garment kept: ' + r.opaque);
});

test('a light grey backdrop is still removed around a dark garment', { skip: !ok && 'python3 numpy/Pillow missing' }, () => {
  const r = run(244, 30);
  assert.deepStrictEqual([r.h, r.w], [60, 60], 'cropped to the garment, so the grey backdrop was cut away');
  assert.ok(r.opaque > 0.98);
});
