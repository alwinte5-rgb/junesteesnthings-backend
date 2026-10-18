#!/usr/bin/env node
/* Set a product's listing photo — the picture on its product page, in the
 * catalogue grid and on the home page (`lumise_products.thumbnail_url`) — from
 * a folder of images named by product id.
 *
 *   <vars json> | node tools/set-listing-photos.js <dir>            # report only
 *   <vars json> | node tools/set-listing-photos.js <dir> --apply
 *
 * <dir> holds files named `NNN-Brand-Style-Words.webp|png|jpg`, NNN being the
 * product id: the owner's branded "Your design here" mockups, 2026-10-18.
 * This is the LISTING photo only. The designer canvas is the plain S&S photo
 * (tools/product-art) — a customer must not design on top of a placeholder.
 *
 * The vars JSON carries MYSQL_PUBLIC_URL and the Cloudinary keys, as for
 * tools/product-art/run.js; nothing secret is ever on the command line.
 *
 * WHAT IT REFUSES
 *   - a file whose id is not a product;
 *   - a file whose style number is not in that product's name — a misnumbered
 *     file would otherwise put one garment's photo on another.
 *
 * Uploads are signed, into one folder, with a public_id ending in a hash of the
 * file's bytes: a re-run of the same file replaces nothing, a new version gets
 * a new URL (no stale CDN copy). The thumbnail_urls being replaced are saved
 * to ~/jtees-backups first.
 */
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const { mysqlUrlFrom, mysql, sq } = require('./lib/db');

const FOLDER = 'jtees/listing';
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const dir = argv.find((a) => !a.startsWith('--'));

/** {id, file, styles, brand} for each image in `dir`: styles are the name
 *  tokens holding a digit (the style number), brand the words before the
 *  first of them — the product's name must carry both. */
function readDir(d) {
  return fs.readdirSync(d).filter((f) => /^\d{1,5}-.+\.(webp|png|jpe?g)$/i.test(f)).sort().map((f) => {
    const [idTok, ...rest] = f.replace(/\.[a-z]+$/i, '').split('-');
    const first = rest.findIndex((t) => /\d/.test(t));
    return { id: Number(idTok), file: path.join(d, f), styles: rest.filter((t) => /\d/.test(t)),
      brand: first > 0 ? rest.slice(0, first) : [] };
  });
}

/** Why `name` is not the product a file says it is, or null. */
/* The brand too: style numbers repeat across brands (Bella's 3001, Next
   Level's 3001), so a misnumbered file must not pass on the number alone. */
function mismatch(name, styles, brand = []) {
  const norm = String(name || '').toUpperCase().replace(/[^A-Z0-9]/g, ' ');
  const words = new Set(norm.split(/\s+/));
  const missing = styles.filter((s) => !words.has(s.toUpperCase()));
  const noBrand = brand.filter((b) => !words.has(b.toUpperCase()));
  return !styles.length ? 'no style number in the file name'
    : missing.length ? 'style ' + missing.join(', ') + ' is not in "' + name + '"'
    : noBrand.length ? 'brand ' + noBrand.join(' ') + ' is not in "' + name + '"' : null;
}

function upload(file, publicId, e) {
  const cloud = e.CLOUDINARY_NAME, key = e.CLOUDINARY_API_KEY;
  const secret = e.CLUDINARY_API_SECRET || e.CLOUDINARY_API_SECRET;   // Railway spells it CLUDINARY (see product-art/upload.js)
  if (!cloud || !key || !secret) throw new Error('cloudinary vars missing');
  const p = { folder: FOLDER, overwrite: 'false', public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const sig = crypto.createHash('sha1').update(Object.keys(p).sort().map((k) => k + '=' + p[k]).join('&') + secret).digest('hex');
  const a = ['-sS', '-X', 'POST', 'https://api.cloudinary.com/v1_1/' + cloud + '/image/upload',
    '-F', 'file=@' + file, '-F', 'api_key=' + key, '-F', 'signature=' + sig];
  for (const k of Object.keys(p)) a.push('-F', k + '=' + p[k]);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const out = spawnSync('curl', a, { encoding: 'utf8', maxBuffer: 1 << 24 });
    let d = null; try { d = JSON.parse(out.stdout); } catch { /* retry */ }
    if (d && d.secure_url) return d.secure_url;
    /* Cloudinary's own refusal (bad signature, bad file, quota) does not get
       better on a retry — only a dropped connection does. */
    if (d && d.error) throw new Error('Cloudinary refused ' + publicId + ': ' + d.error.message);
    if (attempt === 3) throw new Error('upload failed: ' + String(out.stdout || out.stderr).slice(0, 160));
    spawnSync('sleep', [String(attempt * 2)]);
  }
}

function main(buf) {
  if (!dir || !fs.existsSync(dir)) { console.error('usage: <vars json> | set-listing-photos.js <dir> [--apply]'); process.exit(2); }
  let e; try { e = JSON.parse(buf); } catch { console.error('stdin is not JSON'); process.exit(2); }
  const url = mysqlUrlFrom(e);
  if (!url) { console.error('no MySQL connection in the piped variables'); process.exit(2); }
  const files = readDir(dir);
  if (!files.length) { console.error('no NNN-*.webp|png|jpg files in ' + dir); process.exit(2); }
  const rows = mysql(url, 'SELECT id, name, thumbnail_url thumb, IFNULL(supplier_style_id,0) sid FROM lumise_products WHERE id IN (' +
    files.map((f) => f.id).join(',') + ');', { rows: true });
  const byId = new Map(rows.map((r) => [Number(r.id), r]));

  const plan = [], bad = [], seen = new Map();
  for (const f of files) seen.set(f.id, (seen.get(f.id) || 0) + 1);
  for (const f of files) {
    const p = byId.get(f.id);
    const was = p && p.thumb !== 'NULL' ? p.thumb : null;     // mysql -B prints NULL
    /* ssa-sync resolves a row with no supplier_style_id from a '/Style/<id>_'
       thumbnail; replacing it would cut that row off from its price. */
    const why = seen.get(f.id) > 1 ? 'more than one file for product #' + f.id
      : !p ? 'no product #' + f.id
      : (!Number(p.sid) && /\/Style\/\d+_/.test(was || '')) ? 'no supplier_style_id — its thumbnail is how ssa-sync finds its S&S style'
      : mismatch(p.name, f.styles, f.brand);
    if (why) bad.push('#' + f.id + '  ' + path.basename(f.file) + ' — ' + why);
    else plan.push({ ...f, name: p.name, was });
  }
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + plan.length + ' listing photo(s)\n');
  for (const x of plan) console.log('  #' + String(x.id).padStart(3) + '  ' + x.name.slice(0, 50).padEnd(52) + path.basename(x.file));
  if (bad.length) { console.log('\n  REFUSED:'); for (const b of bad) console.log('    ' + b); }
  if (!APPLY) { console.log('\n  report only — pass --apply to upload and write'); if (bad.length) process.exitCode = 1; return; }
  if (bad.length) { console.error('\n  fix the refused files first — nothing written'); process.exit(1); }

  const bdir = path.join(os.homedir(), 'jtees-backups'); fs.mkdirSync(bdir, { recursive: true });
  const bfile = path.join(bdir, 'listing-photos-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(bfile, JSON.stringify(plan.map((x) => ({ id: x.id, thumbnail_url: x.was })), null, 1));
  console.log('\n  backup ' + bfile);
  /* Each row is written as soon as its upload lands, so a failure part-way
     says exactly which products changed — the backup covers them all, and a
     re-run redoes only the rest (same bytes, same public_id). */
  const done = [];
  try {
    for (const x of plan) {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(x.file)).digest('hex').slice(0, 10);
      const secure = upload(x.file, 'p' + x.id + '-' + hash, e);
      if (!/^https:\/\/res\.cloudinary\.com\//.test(secure)) throw new Error('unexpected upload URL for #' + x.id);
      mysql(url, 'UPDATE lumise_products SET thumbnail_url=' + sq(secure) + ', updated=NOW() WHERE id=' + Number(x.id) + ';');
      done.push(x.id);
      console.log('  #' + x.id + '  ' + secure);
    }
  } catch (err) {
    console.error('\n  STOPPED: ' + err.message);
    console.error('  written: ' + (done.join(', ') || 'none'));
    console.error('  not written: ' + plan.filter((x) => !done.includes(x.id)).map((x) => x.id).join(', '));
    process.exit(1);
  }
  console.log('\n  ' + plan.length + ' listing photo(s) written');
}

if (require.main === module) {
  let buf = '';
  process.stdin.on('data', (d) => (buf += d));
  process.stdin.on('end', () => { try { main(buf); } catch (err) { console.error(err.message); process.exit(1); } });
}
module.exports = { readDir, mismatch };
