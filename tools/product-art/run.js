#!/usr/bin/env node
/* Drive the whole product-art pipeline for one product, or for the whole
 * backlog, without re-typing the five steps per style.
 *
 *   <vars json> | node tools/product-art/run.js --list
 *   node tools/product-art/run.js --vars=~/.jtees-art.json --list
 *   <vars json> | node tools/product-art/run.js 154 --outdir /tmp/art
 *   <vars json> | node tools/product-art/run.js 154 --outdir /tmp/art --apply
 *   <vars json> | node tools/product-art/run.js --all --outdir /tmp/art --apply
 *
 * The vars JSON is one merged object carrying the S&S account, the Cloudinary
 * keys and MYSQL_PUBLIC_URL — the three stores the steps need. Each step reads
 * it from stdin, so nothing is ever passed on a command line.
 *
 * WHAT IT DECIDES FOR YOU
 * -----------------------
 * `--sides` per product, from tools/lib/garments.js: headwear is front only
 * (decided 2026-09-12 — a stage is somewhere a customer can put a design, and
 * adding a cap back commits the shop to decorating and pricing one), and every
 * other garment takes the sides its own stages already define. Guessing this
 * per style by hand is how a cap ends up with a back stage nobody meant to sell.
 *
 * WHAT IT REFUSES
 * ---------------
 * A product with no supplier style id (no art to fetch), no colour attribute
 * (nothing to key a variation on), or duplicate colour swatches (two colourways
 * that cannot be told apart — run tools/unique-colour-swatches.js first).
 * wire.js re-checks the swatches itself; this is the earlier, cheaper failure.
 *
 * Resumable. pack.py keeps any .webp already on disk and upload.js skips an
 * image whose URL is already in the manifest, so a run killed at image 300 of
 * 500 picks up where it stopped rather than starting over.
 */
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const { planFor, slug } = require('./plan');
const { urlFromStdinJson, mysql, dejson } = require('../lib/db');

const HERE = __dirname;
const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ALL = argv.includes('--all');
const LIST = argv.includes('--list');
const opt = (n, d) => { const a = argv.find((x) => x.startsWith('--' + n + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const OUTDIR = opt('outdir', path.join(process.env.TMPDIR || '/tmp', 'jtees-product-art'));
const ids = argv.filter((a) => /^\d+$/.test(a)).map(Number);

/* Credentials come in on stdin, or from a file named with --vars=<path>.
 *
 * The file form exists because the pipeline needs three stores at once (S&S,
 * Cloudinary, MySQL) and the command that dumps a Railway store writes the
 * whole thing to stdout — which on a shared terminal or in an agent transcript
 * is a leak. A 0600 file read here, never echoed, keeps the values out of both.
 * Either way nothing is passed as an argument, where `ps` would show it. */
const varsFile = opt('vars', '');
if (varsFile) {
  let raw;
  try { raw = fs.readFileSync(varsFile, 'utf8'); }
  catch (e) { console.error('cannot read --vars file: ' + e.code); process.exit(1); }
  try { JSON.parse(raw); }
  catch { console.error('--vars file is not JSON'); process.exit(1); }
  run(raw);
} else {
  let stdin = '';
  process.stdin.on('data', (d) => (stdin += d));
  process.stdin.on('end', () => run(stdin));
}

function run(buf) {
  /* A missing MySQL URL is a configuration mistake, not a crash. Reported by
     NAME so it can be fixed without anybody opening a variable store. */
  let url;
  try { url = urlFromStdinJson(buf); }
  catch (e) { console.error(e.message); process.exit(1); }

  const rows = mysql(url,
    'SELECT id, name, stages, attributes, variations, supplier_style_id, printings ' +
    'FROM lumise_products WHERE active=1 ORDER BY id;', { rows: true });

  /* The decision itself is in ./plan.js, where it can be tested without a
     database. This loop only decodes the columns and hands them over. */
  const plan = [];
  for (const p of rows) {
    const x = planFor({
      id: p.id, name: p.name, supplier_style_id: p.supplier_style_id, printings: p.printings,
      stages: dejson(p.stages) || {},
      attributes: dejson(p.attributes) || {},
      variations: dejson(p.variations) || {},
    });
    if (!x) continue;
    x.dir = path.join(OUTDIR, String(x.id) + '-' + slug(x.name));
    plan.push(x);
  }

  const want = ALL ? plan.filter((x) => !x.done && !x.blocked.length)
    : plan.filter((x) => ids.includes(x.id));

  if (LIST || (!ALL && !ids.length)) {
    console.log('PRODUCT ART — ' + plan.length + ' products borrowing stand-in art\n');
    for (const x of plan) {
      const state = x.done ? 'done   ' : x.blocked.length ? 'BLOCKED' : x.wired ? 'partial' : 'to do  ';
      console.log('  ' + state + ' #' + String(x.id).padStart(3) + '  ' + x.name.slice(0, 44).padEnd(46) +
        String(x.cols).padStart(3) + 'c × ' + x.sides.length + '  ' + String(x.images).padStart(3) + ' images');
      for (const b of x.blocked) console.log('            ↳ ' + b);
    }
    const todo = plan.filter((x) => !x.done && !x.blocked.length);
    console.log('\n  ' + todo.length + ' runnable · ' +
      todo.reduce((s, x) => s + x.cols, 0) + ' colourways · ' +
      todo.reduce((s, x) => s + x.images, 0) + ' images');
    const bl = plan.filter((x) => x.blocked.length);
    if (bl.length) console.log('  ' + bl.length + ' blocked, listed above');
    if (!LIST) console.log('\n  pass product ids, or --all, to run');
    return;
  }

  if (!want.length) { console.error('nothing to run'); process.exit(1); }

  /* A step that fails throws, so the product it belongs to is abandoned and the
     BATCH CARRIES ON. Exiting here cost the run everything after the failure —
     across 27 products and 412 images over three quarters of an hour, one
     style S&S happens to 500 on should not end the other twenty-six. Every
     failure is named again at the end, and a re-run retries only those. */
  const step = (label, cmd, args, input) => {
    const r = spawnSync(cmd, args, { input, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'],
      maxBuffer: 1 << 26 });
    if (r.error || r.status !== 0) {
      throw new Error(label + ' failed' + (r.error ? ': ' + r.error.message : ' (exit ' + r.status + ')'));
    }
    return r;
  };
  const failures = [];

  console.log((APPLY ? 'APPLYING' : 'DRY RUN — variations will not be written') +
    '\n' + want.length + ' products · ' + want.reduce((s, x) => s + x.images, 0) + ' images\n');

  let n = 0;
  for (const x of want) {
    n++;
    console.log('─'.repeat(72));
    console.log('[' + n + '/' + want.length + '] #' + x.id + '  ' + x.name +
      '   (' + x.cols + ' colourways × ' + x.sides.join('+') + ')');
    try {
      fs.mkdirSync(x.dir, { recursive: true });

      const coloursJson = path.join(x.dir, 'colours.json');
      if (!fs.existsSync(coloursJson)) {
        const r = spawnSync('node', [path.join(HERE, 'colours.js'), String(x.sid)],
          { input: buf, encoding: 'utf8', maxBuffer: 1 << 26 });
        if (r.status !== 0 || !r.stdout.trim()) {
          throw new Error('colours failed for style ' + x.sid + ': ' + (r.stderr || '').slice(0, 200));
        }
        fs.writeFileSync(coloursJson, r.stdout);
      }
      console.log('  ' + JSON.parse(fs.readFileSync(coloursJson, 'utf8')).length + ' colourways at S&S');

      step('pack', 'python3', [path.join(HERE, 'pack.py'), coloursJson, x.dir, '--sides', x.sides.join(',')]);
      step('upload', 'node', [path.join(HERE, 'upload.js'), path.join(x.dir, 'manifest.json'),
        x.folder, '--sides=' + x.sides.join(',')], buf);
      step('wire', 'node', [path.join(HERE, 'wire.js'), String(x.id), path.join(x.dir, 'manifest.json')]
        .concat(APPLY ? ['--apply'] : []), buf);
    } catch (e) {
      failures.push('#' + x.id + '  ' + x.name + ' — ' + e.message);
      console.error('  SKIPPED — ' + e.message);
    }
  }
  console.log('─'.repeat(72));
  console.log((want.length - failures.length) + '/' + want.length + ' products ' +
    (APPLY ? 'written' : 'dry-run clean'));
  if (failures.length) {
    console.log('\n' + failures.length + ' FAILED — re-run the same command to retry only these:');
    for (const f of failures) console.log('  ' + f);
    process.exitCode = 1;
  }
}
