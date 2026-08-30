#!/usr/bin/env node
/* Make the catalogue able to offer a decoration CHOICE.
 *
 *   railway variables --service MySQL --json | node tools/decorations-2026.js
 *   railway variables --service MySQL --json | node tools/decorations-2026.js --apply
 *
 * WHY THIS EXISTS
 * ---------------
 * The designer asks "choose your decoration method (required)" and there has
 * never been anything to choose. Method #1 (DTF) is the only ACTIVE row, and 44
 * of the 45 active products allow only `{"_1":"A3"}` — that one method. So the
 * question was decorative: every customer was priced as DTF whatever they
 * clicked, and found out at the cart.
 *
 * Three changes, all data:
 *
 * 1. COMBINE the seven per-colour screen-print methods into ONE `color`-type
 *    method. Seven methods force the customer to declare a colour count before
 *    they have drawn anything; one `color`-type method lets both pricing
 *    engines read the count off the finished canvas and pick the column.
 *    The seven rows STAY, inactive: the quote form on jtees.net prices from
 *    their tiers (server.js filters on `use_for_quoting`, not on `active`), and
 *    a `color` table has no `price` key for jt-catalog.php to publish.
 *
 * 2. ACTIVATE embroidery. Its run rates were repriced by stitch band and are
 *    now authoritative (tools/reprice-anchorfish-2026.js), so the rows are safe
 *    to sell from. Digitizing rows stay INACTIVE on purpose: they are one-time
 *    fees, and a decoration method is multiplied by the line quantity, so an
 *    active digitizing row would bill $30 fifty times on a fifty-piece run.
 *
 * 3. WIDEN every active product's `printings` to the decorations its garment
 *    can actually take — caps embroidery-only, polos DTF and embroidery, tees
 *    and bags everything, infant bodysuits printed but never hooped. The rules
 *    are tools/lib/garments.js, the same ones ssa-add-products.js adds with.
 *
 * PRICES ARE NOT TOUCHED. The combined table is the existing per-colour tables
 * pivoted into columns, read out of the database rather than retyped, so the
 * two can never disagree. tools/reprice-anchorfish-2026.js keeps them in step
 * afterwards.
 *
 * Dry run by default: prints every change and writes nothing. `--apply` takes a
 * backup of both tables to ~/jtees-backups/ first, then writes the method
 * changes, re-reads the table, and only then writes the product changes — the
 * combined method's id does not exist until it has been inserted, and a product
 * pointed at a guessed id is a product that prices its decoration at $0.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { urlFromStdinJson, mysql, enjson, dejson, encodePrintings, decodePrintings, sq } = require('./lib/db');
const { classify, ROLES, DECORATIONS } = require('./lib/garments');
const { colorTable } = require('./lib/screenprint');

const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.join(os.homedir(), 'jtees-backups');

/* Products that stay printing-less on purpose — they show "Get a Quote" instead
   of the designer. Same list products.php and jt-set-printings.php hold; if it
   changes there it must change here, or this tool hands the designer a product
   the shop cannot render. */
const QUOTE_ONLY = [88];

/* The combined method. Titled with no em-dash so product.php's `$decos`
   grouping (it splits the title on the dash and keeps the first segment) reads
   it as the method "Screen Printing" rather than as a variant of one. */
const SCREEN_TITLE = 'Screen Printing';
const SCREEN_NOTE = 'Priced from the colours in the finished design: one column ' +
  'per colour count. 50-piece minimum — under that the editor prices DTF instead.';

const PER_COLOUR_RE = /^Screen Printing\s*[—–-]\s*(\d+)\s*Colou?rs?$/i;
const DIGITIZING_RE = /digitiz/i;

/* ── Reading ────────────────────────────────────────────────────────────── */

const loadMethods = (url) =>
  mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;', { rows: true })
    .map((m) => ({ id: Number(m.id), title: m.title, active: Number(m.active), calculate: m.calculate }));

const findByTitle = (methods, title) =>
  methods.find((m) => String(m.title).toLowerCase() === title.toLowerCase()) || null;

/** Resolve every role in tools/lib/garments.js to a live printing id. */
function resolveRoles(methods) {
  const ids = {}, missing = [];
  for (const [role, spec] of Object.entries(ROLES)) {
    const want = spec.title.toLowerCase();
    const hit = methods.find((m) => {
      const t = String(m.title || '').toLowerCase();
      return spec.exact ? t === want : t.startsWith(want);
    });
    if (hit) ids[role] = hit.id; else missing.push(role);
  }
  return { ids, missing };
}

/** The per-colour screen tables, in the shape tools/lib/screenprint.js wants. */
function perColourRows(methods) {
  const rows = [];
  for (const m of methods) {
    const hit = PER_COLOUR_RE.exec(String(m.title || ''));
    if (!hit) continue;
    const calc = dejson(m.calculate);
    const front = calc && calc.values && calc.values.front;
    if (!front) throw new Error('#' + m.id + ' "' + m.title + '" has no front price table');
    const tiers = Object.keys(front)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map((q) => [q, Number(front[q] && front[q].price)]);
    rows.push({ colors: Number(hit[1]), id: m.id, tiers });
  }
  return rows.sort((a, b) => a.colors - b.colors);
}

/* ── Reporting ──────────────────────────────────────────────────────────── */

function reportScreen(perColour, table) {
  const bands = Object.keys(table.values.front);
  console.log('SCREEN PRINTING — ' + perColour.length + ' per-colour methods (#' +
    perColour.map((r) => r.id).join(', #') + ') pivoted into one `color` table.');
  console.log('Prices are the existing ones, unchanged; only their shape changes.\n');
  let hdr = '  colours ';
  for (const b of bands) hdr += ('to ' + b).padStart(11);
  console.log(hdr);
  console.log('  ' + '-'.repeat(hdr.length));
  for (const r of perColour) {
    let line = '  ' + String(r.colors).padStart(4) + '    ';
    for (const b of bands) line += ('$' + table.values.front[b][r.colors + '-color']).padStart(11);
    console.log(line);
  }
  let line = '  full     ';
  for (const b of bands) line += ('$' + table.values.front[b]['full-color']).padStart(11);
  console.log(line);
  console.log('\n  `full-color` is the backstop for a design with more colours than any');
  console.log('  column. Without it both engines price the decoration at $0. The editor');
  console.log('  sends over-range designs to DTF, so it should never be reached.');
}

/* ── Main ───────────────────────────────────────────────────────────────── */

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  try { main(urlFromStdinJson(buf)); }
  catch (e) { console.error('\n' + e.message); process.exit(2); }
});
if (!process.stdin.isTTY) process.stdin.resume();

function main(url) {
  let methods = loadMethods(url);

  /* ── 1. The combined screen-print method ─────────────────────────────── */

  const perColour = perColourRows(methods);
  if (!perColour.length) throw new Error('no per-colour screen-print methods found to combine');
  const table = colorTable(perColour);
  reportScreen(perColour, table);

  const methodStmts = [];
  const screen = findByTitle(methods, SCREEN_TITLE);

  /* The 50-piece minimum lives in this same blob (see tools/screenprint-minimum.js),
     but colorTable() rebuilds the blob from the per-colour tables alone and knows
     nothing about it. Without this carry-over a routine repricing would silently
     drop min_qty and reopen the below-minimum hole — the worst kind of regression,
     because the tool would report success. */
  if (screen) {
    const live = dejson(screen.calculate);
    if (live && live.min_qty) {
      table.min_qty = parseInt(live.min_qty, 10);
      console.log('  carrying over min_qty=' + table.min_qty + ' from the live method');
    }
  }

  const calcSql = sq(enjson(table));
  if (screen) {
    console.log('\n  #' + screen.id + ' "' + SCREEN_TITLE + '" exists — repricing it and switching it on.');
    methodStmts.push('UPDATE lumise_printings SET calculate=' + calcSql + ', description=' +
      sq(SCREEN_NOTE) + ', active=1, updated=NOW() WHERE id=' + screen.id + ';');
  } else {
    console.log('\n  "' + SCREEN_TITLE + '" does not exist yet — creating it, active.');
    methodStmts.push('INSERT INTO lumise_printings ' +
      '(title, active, calculate, thumbnail, upload, description, author, created, updated)\n' +
      '  SELECT ' + sq(SCREEN_TITLE) + ', 1, ' + calcSql + ", '', '', " + sq(SCREEN_NOTE) + ", '', NOW(), NOW()\n" +
      '  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_printings WHERE title=' +
      sq(SCREEN_TITLE) + ') AS t);');
  }

  /* ── 2. Which methods are switched on ────────────────────────────────── */

  const { ids: roleId, missing } = resolveRoles(methods);
  const blocking = missing.filter((r) => r !== 'screen');
  if (blocking.length) {
    throw new Error('these decoration roles have no matching method:\n    ' + blocking.join('\n    ') +
      '\n\n  Run  railway variables --service MySQL --json | node tools/reprice-anchorfish-2026.js --apply' +
      '\n  first — it creates and titles them.');
  }

  const embIds = Object.entries(roleId).filter(([r]) => r.startsWith('emb:')).map(([, i]) => i);
  const on = new Set([roleId.dtf, ...embIds].filter(Boolean));
  const off = new Set([...perColour.map((r) => r.id),
    ...methods.filter((m) => DIGITIZING_RE.test(m.title)).map((m) => m.id)]);

  console.log('\n\nACTIVE METHODS\n');
  console.log('  id   was  now  title');
  console.log('  ' + '-'.repeat(76));
  for (const m of methods) {
    const want = on.has(m.id) ? 1 : (off.has(m.id) ? 0 : null);
    if (want === null) continue;
    console.log('  ' + String(m.id).padStart(3) + '   ' + m.active + '    ' + want +
      (want === m.active ? '     ' : '  <- ') + m.title.slice(0, 58));
    if (want !== m.active) {
      methodStmts.push('UPDATE lumise_printings SET active=' + want +
        ', updated=NOW() WHERE id=' + m.id + ';');
    }
  }
  const untouched = methods.filter((m) => !on.has(m.id) && !off.has(m.id) &&
    String(m.title).toLowerCase() !== SCREEN_TITLE.toLowerCase());
  if (untouched.length) {
    console.log('\n  Left exactly as they are — not part of this change:');
    for (const m of untouched) console.log('    #' + m.id + '  active=' + m.active + '  ' + m.title);
  }
  console.log('\n  Digitizing stays INACTIVE deliberately: it is a one-time fee per design,');
  console.log('  and an active decoration method is multiplied by the line quantity.');
  console.log('  The per-colour screen rows stay INACTIVE but are NOT deleted — the quote');
  console.log('  form still prices from their tiers, which a `color` table cannot publish.');

  /* ── 3. What each product may be decorated with ──────────────────────── */

  /* The combined method's id is not knowable before it is inserted, so on a
     first run the products cannot be planned in full detail — and must not be
     written from a guess. Apply the method changes, then re-read. */
  if (APPLY) {
    backup(url, 'pre-decorations');
    console.log('\nApplying ' + methodStmts.length + ' method statements...');
    mysql(url, 'START TRANSACTION;\n' + methodStmts.join('\n') + '\nCOMMIT;');
    methods = loadMethods(url);
  }

  const screenId = (findByTitle(methods, SCREEN_TITLE) || {}).id || null;
  const idFor = (role) => (role === 'screen' ? screenId : roleId[role]);

  const products = mysql(url,
    'SELECT id, name, printings FROM lumise_products WHERE active=1 ORDER BY id;', { rows: true });

  console.log('\n\nPRODUCT DECORATIONS — ' + products.length + ' active products\n');
  console.log('  id   product                                      class    printing ids');
  console.log('  ' + '-'.repeat(96));

  const productStmts = [], unknown = [];
  let changed = 0, same = 0;
  for (const p of products) {
    const id = Number(p.id);
    if (QUOTE_ONLY.includes(id)) continue;
    const cls = classify(p.name);
    const roles = DECORATIONS[cls];
    if (!roles) { unknown.push(p); continue; }

    const wantIds = roles.map(idFor).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
    const pending = roles.includes('screen') && !screenId;
    const nowIds = decodePrintings(p.printings).sort((a, b) => a - b);
    const isSame = !pending && wantIds.join(',') === nowIds.join(',');

    console.log('  ' + String(id).padStart(3) + '  ' + String(p.name).slice(0, 43).padEnd(45) +
      cls.padEnd(9) + wantIds.join(',') + (pending ? ' + screen (id on apply)' : '') +
      (isSame ? '   =' : ''));

    if (isSame) { same++; continue; }
    changed++;
    if (!pending) {
      productStmts.push('UPDATE lumise_products SET printings=' + sq(encodePrintings(wantIds)) +
        ', updated=NOW() WHERE id=' + id + ';');
    }
  }

  if (unknown.length) {
    console.log('\n  UNCLASSIFIED — left exactly as they are, because guessing a decoration');
    console.log('  set for a garment nobody can name is how a cap ends up screen printed:');
    for (const p of unknown) console.log('    #' + p.id + '  ' + p.name);
  }
  console.log('\n  Quote-only, skipped on purpose (they show "Get a Quote", not the designer): #' +
    QUOTE_ONLY.join(', #'));
  console.log('\n  ' + changed + ' products change, ' + same + ' already correct, ' +
    unknown.length + ' unclassified.');

  /* ── Apply ───────────────────────────────────────────────────────────── */

  if (!APPLY) {
    console.log('\n\nDRY RUN — nothing written. Pass --apply to write.\n');
    console.log(methodStmts.join('\n'));
    if (productStmts.length) console.log(productStmts.join('\n'));
    else console.log('\n-- product statements are built after the method insert, on the apply run.');
    return;
  }

  console.log('\nApplying ' + productStmts.length + ' product statements...');
  mysql(url, 'START TRANSACTION;\n' + productStmts.join('\n') + '\nCOMMIT;\n' +
    'SELECT id, active, title FROM lumise_printings WHERE active=1 ORDER BY id;');
  console.log('\nDone. Re-run without --apply: every product should read "=".');
}

/** Snapshot both tables before writing. This is live pricing; there is no undo. */
function backup(url, tag) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
    p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
  for (const [name, sql] of [
    ['printings', 'SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;'],
    ['products', 'SELECT id, name, active, printings FROM lumise_products ORDER BY id;'],
  ]) {
    const rows = mysql(url, sql, { rows: true });
    const head = Object.keys(rows[0] || {});
    const file = path.join(BACKUP_DIR, name + '-backup-' + stamp + '-' + tag + '.tsv');
    fs.writeFileSync(file, [head.join('\t'),
      ...rows.map((r) => head.map((h) => r[h]).join('\t'))].join('\n') + '\n');
    console.log('  backed up ' + rows.length + ' ' + name + ' rows to ' + file);
  }
}
