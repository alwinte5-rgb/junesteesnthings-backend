#!/usr/bin/env node
/* Put the GARMENT on the catalogue photo, not a model wearing it.
 *
 *   node tools/resync-thumbnails.js --vars=~/.jtees-art.json
 *   node tools/resync-thumbnails.js --vars=~/.jtees-art.json --apply
 *   node tools/resync-thumbnails.js --vars=~/.jtees-art.json --from-env --apply
 *
 * WHY
 * ---
 * tools/product-art/README.md says it in capitals and it was ignored anyway:
 *
 *     Images/Style/<id>_fl.jpg is the MARKETING photograph, and for apparel
 *     that is a PERSON WEARING IT — head, hands and trousers included.
 *     Images/Color/<id>_f_fm.jpg is the garment alone.
 *
 * ssa-add-products.js reached for styleImage on every insert, so 78 of 104
 * active products carried a model shot. On a quote that is worse than untidy:
 * the photo is a garment in whichever colourway the supplier chose to shoot,
 * so a quote for a Forest Green tee showed a man in a white one, and the
 * customer reads the picture as the thing being sold.
 *
 * WHICH COLOURWAY
 * ---------------
 * The product's DEFAULT colour option, so the photo matches what the designer
 * opens on. Falls back to the first colourway S&S has a photo for.
 *
 * This is a photo change only. No price, size, colour or decoration is touched.
 * Backs up every row it will change to ~/jtees-backups/ before writing.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mysql, dejson, sq } = require('./lib/db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile && !argv.includes('--from-env')) {
  console.error('usage: resync-thumbnails.js --vars=<file> [--from-env] [--apply]');
  process.exit(2);
}
const fromFile = varsFile ? JSON.parse(fs.readFileSync(varsFile, 'utf8')) : {};
const env = argv.includes('--from-env') ? Object.assign({}, fromFile, process.env) : fromFile;
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
if (!url) { console.error('no MySQL URL'); process.exit(2); }
if (!env.SSA_ACCOUNT || !env.SSA_API_KEY) { console.error('SSA credentials missing'); process.exit(2); }

const BACKUP_DIR = path.join(os.homedir(), 'jtees-backups');
const auth = 'Basic ' + Buffer.from(env.SSA_ACCOUNT + ':' + env.SSA_API_KEY).toString('base64');

let last = 0;
async function ssa(p, tries = 5) {
  let st = 0;
  for (let i = 0; i < tries; i++) {
    const wait = Math.max(0, last + 700 - Date.now()) + (i ? 1200 * i * i : 0);
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    try {
      const r = await fetch('https://api.ssactivewear.com/v2/' + p,
        { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) });
      st = r.status;
      if (r.status === 429 || r.status >= 500) continue;
      if (r.status === 404) return null;
      /* Same line ssa-sync draws: only a 404 means "not there". Anything else
         is the API refusing, and must never be read as a fact about the style. */
      if (!r.ok) throw new Error('S&S returned ' + r.status + ' for ' + p);
      return await r.json();
    } catch (e) {
      if (e.message && e.message.startsWith('S&S returned')) throw e;
    }
  }
  throw new Error('S&S unreachable (last ' + st + '): ' + p);
}

(async () => {
  const rows = mysql(url,
    "SELECT id, name, IFNULL(supplier_style_id,0) sid, IFNULL(thumbnail_url,'') thumb, attributes " +
    "FROM lumise_products WHERE active=1 AND thumbnail_url LIKE '%/Style/%' ORDER BY id;", { rows: true });

  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + rows.length + ' products on a model shot\n');

  const stmts = [], backup = [];
  let done = 0, skipped = 0, errors = 0;
  for (const p of rows) {
    if (!p.sid || p.sid === '0') {
      console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 44).padEnd(46) + 'no supplier style id — skipped');
      skipped++; continue;
    }
    let prods;
    try { prods = await ssa('products/?styleid=' + p.sid); }
    catch (e) { console.log('  #' + String(p.id).padStart(3) + '  API: ' + e.message.slice(0, 50)); errors++; continue; }
    if (!Array.isArray(prods) || !prods.length) {
      console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 44).padEnd(46) + 'no S&S rows — skipped');
      skipped++; continue;
    }

    /* First photo per colourway, in the order buildAttributes lists them. */
    const byColour = new Map();
    for (const r of prods) {
      if (!r.colorName || !r.colorFrontImage) continue;
      if (!byColour.has(r.colorName)) byColour.set(r.colorName, r.colorFrontImage);
    }
    const col = Object.values(dejson(p.attributes) || {}).find((a) => a && a.type === 'product_color');
    const opts = (col && col.values && col.values.options) || [];
    const def = opts.find((o) => String(o.default) === '1') || opts[0];
    const pick = (def && byColour.get(def.title)) || byColour.values().next().value;
    if (!pick) {
      console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 44).padEnd(46) + 'no colourway photo at S&S — left as is');
      skipped++; continue;
    }
    const next = 'https://cdn.ssactivewear.com/' + pick;
    const which = (def && byColour.get(def.title)) ? def.title : '(first with a photo)';
    console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 44).padEnd(46) + which.slice(0, 18).padEnd(20) + pick);
    backup.push({ id: p.id, name: p.name, thumbnail_url: p.thumb });
    stmts.push('UPDATE lumise_products SET thumbnail_url=' + sq(next) + ', updated=NOW() WHERE id=' + p.id + ';');
    done++;
  }

  console.log('\n  ' + done + ' to change · ' + skipped + ' skipped · ' + errors + ' unreachable');
  if (errors) console.error('\n  Some styles failed AT THE API. Fix the credential before reading\n' +
    '  anything above as a fact about the catalogue.');
  if (!APPLY || !stmts.length) {
    console.log('\n  dry run — pass --apply to write');
    process.exit(errors ? 1 : 0);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const bf = path.join(BACKUP_DIR, 'thumbnails-backup-' + stamp + '-pre-resync.json');
  fs.writeFileSync(bf, JSON.stringify(backup, null, 1));
  console.log('\n  backup: ' + bf);

  mysql(url, "SET SESSION sql_mode='';\nSTART TRANSACTION;\n" + stmts.join('\n') + '\nCOMMIT;');
  const after = mysql(url, "SELECT COUNT(*) n FROM lumise_products WHERE active=1 AND thumbnail_url LIKE '%/Style/%';", { rows: true });
  console.log('  done. still on a model shot: ' + after[0].n);
  process.exit(errors ? 1 : 0);
})();
