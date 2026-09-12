#!/usr/bin/env node
/* Step 4: upload a packed manifest to Cloudinary and record the URLs.
 *
 *   <vars json> | node tools/product-art/upload.js <manifest.json> <folder> [--sides front]
 *
 * The signature is computed here so the API secret never reaches a command
 * line; curl does the multipart, which Node's fetch was resetting on.
 *
 * Was hardcoded to the 112RE pilot — one folder name, one manifest path read
 * out of $SP. Both are arguments now, because the remaining catalogue is 27
 * more styles and a pilot-shaped script cannot run them.
 *
 * Re-running is safe and cheap: `overwrite: true` with a deterministic
 * public_id means a repeat upload replaces the same asset rather than piling up
 * copies, and an image whose URL is already in the manifest is skipped
 * entirely. That is what makes a 500-image batch resumable after a network
 * failure.
 */
const crypto = require('crypto'), fs = require('fs'), { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const sidesArg = (args.find((a) => a.startsWith('--sides=')) || '').split('=')[1];
const force = args.includes('--force');
const [manPath, folder] = args.filter((a) => !a.startsWith('--'));

if (!manPath || !folder) {
  console.error('usage: <vars json> | upload.js <manifest.json> <folder> [--sides=front] [--force]');
  process.exit(2);
}
const SIDES = (sidesArg || 'front,back').split(',').filter(Boolean);

let b = '';
process.stdin.on('data', (d) => (b += d));
process.stdin.on('end', () => {
  const e = JSON.parse(b);
  const cloud = e.CLOUDINARY_NAME, key = e.CLOUDINARY_API_KEY;
  /* The variable is spelled CLUDINARY_API_SECRET in Railway. Kept as the first
     candidate rather than "fixed" here, because renaming it in one script and
     not in the store is how a working pipeline stops working. */
  const secret = e.CLUDINARY_API_SECRET || e.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) { console.error('cloudinary vars missing'); process.exit(2); }

  const man = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  let n = 0, skipped = 0;

  for (const r of man) {
    for (const side of SIDES) {
      const f = r[side + '_web'];
      if (!f) continue;
      if (r[side + '_url'] && !force) { skipped++; continue; }   // already up
      if (!fs.existsSync(f)) { console.error('  missing file ' + f); process.exit(1); }

      const public_id = r.slug + '-' + side, ts = String(Math.floor(Date.now() / 1000));
      const p = { folder, overwrite: 'true', public_id, timestamp: ts };
      const sig = crypto.createHash('sha1')
        .update(Object.keys(p).sort().map((k) => k + '=' + p[k]).join('&') + secret).digest('hex');
      const a = ['-sS', '-X', 'POST', 'https://api.cloudinary.com/v1_1/' + cloud + '/image/upload',
        '-F', 'file=@' + f, '-F', 'api_key=' + key, '-F', 'signature=' + sig];
      for (const k of Object.keys(p)) a.push('-F', k + '=' + p[k]);

      const out = spawnSync('curl', a, { encoding: 'utf8', maxBuffer: 1 << 24 });
      let d; try { d = JSON.parse(out.stdout); } catch { d = null; }
      if (!d || !d.secure_url) {
        console.error('FAILED ' + public_id + ' ' + (out.stdout || out.stderr || '').slice(0, 200));
        /* Write what did succeed before giving up, so a retry does not redo it. */
        fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
        process.exit(1);
      }
      r[side + '_url'] = d.secure_url; n++;
      console.log('  ' + public_id.padEnd(30) + String(d.bytes / 1024 | 0).padStart(4) + 'KB  ' +
        d.width + 'x' + d.height);
      /* Flush after every image: a batch killed halfway keeps its URLs. */
      fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
    }
  }
  console.log('  uploaded ' + n + ' images to ' + folder + (skipped ? ' (' + skipped + ' already there)' : ''));
});
