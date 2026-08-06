#!/usr/bin/env node
/*
 * Attach the photos customers posted with their Google reviews.
 *
 * WHY
 * ---
 * The nine Google reviews on the quote page are text only, but several of them
 * have a photo of the actual order attached on Google. A photo of real work is
 * the most persuasive thing on a page a hesitant customer is reading, so it is
 * worth carrying across — but the photos live in the Google Business Profile
 * and there is no API that hands them over per review. They have to be saved
 * once, by hand, and this uploads them and wires them up.
 *
 * HOW
 * ---
 *   1. Open the Google Business Profile > Reviews. For each review that has a
 *      photo, right-click the photo > Save image.
 *   2. Name each file after the reviewer, lowercase, e.g. rob-simpson.jpg
 *      (matching is on the first name, so rob.jpg works too).
 *   3. Put them all in one folder.
 *   4. node tools/add-review-photos.js ~/Desktop/review-photos
 *      ...to check what it matched, then:
 *      node tools/add-review-photos.js ~/Desktop/review-photos --apply
 *
 * Uploads to the review_photos Cloudinary folder and rewrites SHOP_REVIEWS in
 * server.js with an `image` field. Only ever adds a field; the review text is
 * never touched.
 *
 * Env: CLOUDINARY_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dir = process.argv[2];
const apply = process.argv.includes('--apply');
const SERVER = path.join(__dirname, '..', 'server.js');

const CN = process.env.CLOUDINARY_NAME;
const CK = process.env.CLOUDINARY_API_KEY;
const CS = process.env.CLOUDINARY_API_SECRET;

if (!dir) {
  console.error('Usage: node tools/add-review-photos.js <folder> [--apply]');
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.error(`No such folder: ${dir}`);
  process.exit(1);
}

/** Read the review list straight out of server.js so there is one source. */
function readReviews(src) {
  const m = src.match(/const SHOP_REVIEWS = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('SHOP_REVIEWS not found in server.js');
  return { json: m[1], list: JSON.parse(m[1]) };
}

/** "Rob Simpson · Google Review" -> ["rob simpson", "rob"] */
function nameKeys(who) {
  const clean = String(who).split('·')[0].trim().toLowerCase();
  return [clean, clean.split(/\s+/)[0]];
}

function fileKey(f) {
  return path.basename(f, path.extname(f)).toLowerCase().replace(/[-_]+/g, ' ').trim();
}

async function upload(file) {
  const ts = Math.floor(Date.now() / 1000);
  const publicId = 'review_photos/' + path.basename(file, path.extname(file))
    .toLowerCase().replace(/[^a-z0-9]+/g, '-');
  // Signed upload — the secret stays here and never reaches a browser.
  const toSign = `folder=review_photos&public_id=${publicId}&timestamp=${ts}${CS}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const form = new FormData();
  form.set('file', new Blob([fs.readFileSync(file)]), path.basename(file));
  form.set('api_key', CK);
  form.set('timestamp', String(ts));
  form.set('folder', 'review_photos');
  form.set('public_id', publicId);
  form.set('signature', signature);

  const r = await fetch(`https://api.cloudinary.com/v1_1/${CN}/image/upload`,
    { method: 'POST', body: form });
  const d = await r.json();
  if (!r.ok || !d.secure_url) throw new Error(d.error?.message || `HTTP ${r.status}`);
  // Serve a sensibly sized, auto-format version rather than the original.
  return d.secure_url.replace('/upload/', '/upload/c_fill,w_600,h_400,q_auto,f_auto/');
}

(async () => {
  const src = fs.readFileSync(SERVER, 'utf8');
  const { json, list } = readReviews(src);

  const files = fs.readdirSync(dir)
    .filter(f => /\.(jpe?g|png|webp|heic)$/i.test(f))
    .map(f => path.join(dir, f));

  console.log(`\n  reviews: ${list.length}   photos found: ${files.length}\n`);

  const pairs = [];
  for (const f of files) {
    const key = fileKey(f);
    const hit = list.find(r => nameKeys(r.who).some(k => k === key || k.startsWith(key) || key.startsWith(k)));
    if (hit) pairs.push({ file: f, review: hit });
    else console.log(`  ?  ${path.basename(f)} — no review matches that name`);
  }

  for (const p of pairs) {
    console.log(`  ->  ${path.basename(p.file)}  =>  ${p.review.who.split('·')[0].trim()}`);
  }
  const unmatched = list.filter(r => !pairs.some(p => p.review === r));
  if (unmatched.length) {
    console.log(`\n  no photo for: ${unmatched.map(r => r.who.split('·')[0].trim()).join(', ')}`);
  }

  if (!pairs.length) { console.log('\n  Nothing to do.'); return; }
  if (!apply) {
    console.log('\n  Dry run — nothing uploaded. Re-run with --apply.');
    return;
  }
  if (!CN || !CK || !CS) {
    console.error('\n  Cloudinary credentials not set. Run with:');
    console.error('  railway run --service junesteesnthings-backend node tools/add-review-photos.js ' + dir + ' --apply');
    process.exit(1);
  }

  let out = src;
  const updated = JSON.parse(json);
  for (const p of pairs) {
    process.stdout.write(`  uploading ${path.basename(p.file)} … `);
    try {
      const url = await upload(p.file);
      const target = updated.find(r => r.who === p.review.who);
      target.image = url;
      console.log('ok');
    } catch (e) {
      console.log('FAILED: ' + e.message);
    }
  }

  out = out.replace(json, JSON.stringify(updated, null, 2));
  fs.writeFileSync(SERVER, out);
  console.log(`\n  server.js updated. Commit and push to deploy.`);
})().catch(e => { console.error(e.message); process.exit(1); });
