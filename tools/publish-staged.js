#!/usr/bin/env node
/* Put staged S&S blanks live: designer, storefront and the daily sync.
 *
 *   railway run -s junesteesnthings-backend -- railway run -s MySQL -- \
 *     node tools/publish-staged.js                      # dry run: ready / not ready, and why
 *   ... node tools/publish-staged.js --apply            # publish every READY product
 *   ... node tools/publish-staged.js --apply --only=358,374
 *
 * tools/ssa-add-products.js --staged adds a style switched off with
 * supplier='ssa-staged': the quote form can sell it (jt-catalog.php lists it),
 * nothing a shopper sees does. This is the other half — it checks the product
 * is ready for the DESIGNER and only then makes it an ordinary live product
 * (supplier='ssa', active=1), files it into its categories, and leaves the
 * rest to the daily S&S sync.
 *
 * READY means every one of these holds; the dry run names the one that fails:
 *   - EVERY colour has its real-photo canvas (tools/product-art, wired by
 *     wire.js with the garment's placements). Owner, 2026-10-18: "dont hold
 *     back unless they dont have product images" — so this is the canvas test.
 *     A real photo is the right garment by construction, jackets and caps
 *     included; a colour without one would open the designer on base art;
 *   - it has at least one decoration method, a size list and a price;
 *   - it has an https catalogue photo;
 *   - S&S still prices it (the sync has not marked it ssa_auto_off);
 *   - it has a description. An empty one is filled from S&S's own text as
 *     plain lines (product.php prints descriptions escaped, not as HTML), which
 *     needs SSA_ACCOUNT / SSA_API_KEY in the environment.
 *
 * A style S&S has NO flat photo for — only on-model shots (most of Shaka
 * Wear) — goes live on the drawn garment of its own type, with S&S's photo as
 * the listing image (owner, 2026-10-19 "model photo + stand-in"; the default
 * since 2026-10-20, when the owner checked the flagged drawings and photos and
 * found them fine). Only when canvasVerdict calls that drawing the garment
 * itself ('ok'): a jacket on hoodie art, a crewneck on a hooded drawing or a
 * flannel on a crew-neck tee stays staged.
 *
 * AUDIT: a product that passes the list above is then run through the whole
 * catalogue audit (tools/catalog-inventory.js) — its name against S&S's title,
 * the fabric weight its description states, its colours, size upcharges,
 * price, decoration methods and listing photo — and is held back on any fault
 * (owner, 2026-10-19: keep the audit for future products; #143 went live as a
 * shirt and six descriptions stated the wrong weight). That needs SSA_ACCOUNT /
 * SSA_API_KEY: without them --apply publishes nothing.
 *
 * Prices: the daily S&S sync re-costs staged rows too (tools/ssa-sync.js), so a
 * product published after weeks in staging goes live at today's cost.
 */
const { mysql, mysqlUrlFrom, sq, dejson } = require('./lib/db');
const { photoCoverage, canvasVerdict } = require('./lib/canvas');
const { localChecks, compareWithSsa, bad, noted, sublimationId } = require('./catalog-inventory');
const { resolveRoles } = require('./lib/garments');
const { makeClient } = require('./lib/ssa-client');
const { STAGED_SUPPLIER, parseIds } = require('./lib/ssa-staged');

/* S&S descriptions are HTML lists. Bullet lines, entities decoded, capped. */
function htmlToLines(html) {
  const s = String(html || '');
  const items = [...s.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
  const parts = items.length ? items : [s];
  const clean = (t) => t.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&#174;|&reg;/g, '®')
    .replace(/&#8482;|&trade;/g, '™').replace(/&(?!amp;)[a-z#0-9]+;/gi, ' ')
    /* &amp; last, so "&amp;lt;" stays the literal text "&lt;" S&S meant. */
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
  const lines = parts.map(clean).filter(Boolean);
  return (items.length ? lines.map((l) => '• ' + l) : lines).join('\n').slice(0, 2000);
}

const decodePrintings = (v) => {
  try { const o = JSON.parse(decodeURIComponent(String(v || ''))); return o && typeof o === 'object' ? Object.keys(o) : []; }
  catch { return []; }
};

/* A drawing is one tinted colour, so a dip-dye, Colorblast, tie-dye or camo
   style, or a two-tone raglan, would open the designer as a plain shirt
   (owner, 2026-10-19: "this is an ombre shirt not solid green"). Read from the
   name and from every colour's name; "Black/ White" is two colours. */
const PATTERN_RE = /camo|plaid|buffalo|tie.?dye|dip.?dye|ombr[eé]|colou?rblast|marble|acid|crystal|stripe|gingham|tartan|floral|raglan/i;
/* In a COLOUR name a slash is two colours; in a style name it is "50/50". */
const TWO_TONE_RE = /\//;
function patterned(p) {
  if (PATTERN_RE.test(p.name)) return p.name.match(PATTERN_RE)[0];
  const a = dejson(p.attributes) || {};
  const c = Object.values(a).find((x) => x && x.type === 'product_color');
  let v = c && c.values;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const hit = ((v && v.options) || []).map((o) => String((o && o.title) || '')).filter((t) => PATTERN_RE.test(t) || TWO_TONE_RE.test(t));
  /* One camo colour among nine plain ones is that colour's problem, not the style's. */
  return hit.length * 2 > ((v && v.options) || []).length ? 'colours ' + hit.slice(0, 3).join(', ') : null;
}

/** Why a staged product is not ready, or null when it is. `desc` is the
 *  description it WILL have (the stored one, or the one S&S supplied). */
function notReady(p, { desc = p.description } = {}) {
  const cov = photoCoverage(dejson(p.attributes) || {}, dejson(p.variations) || {});
  if (!cov.colours) return 'no colours';
  /* Owner, 2026-10-20: a colour without its own photo is fine ("they all
     have the image loaded fine") — it opens on the product's drawing or
     default photo. What still holds a style back is a drawing that is the
     wrong garment or cannot show its pattern, when NO colour has a photo. */
  if (cov.withPhotos === 0) {
    const pat = patterned(p);
    if (pat) return 'drawing cannot show a pattern: ' + pat;
    const v = canvasVerdict(p);
    if (v.verdict === 'borrowed') return 'drawing is not this garment: drawn as ' + v.sub.looks;
    if (v.verdict !== 'ok') return 'drawing is the wrong garment' + (v.art ? ' (' + v.art + ')' : v.why ? ' (' + v.why + ')' : '');
  }
  /* The same checks the catalogue inventory reports, so "ready" here and
     "ok" there cannot disagree: the garment's full placement set on the
     product AND every colourway, and a size attribute beside the colours. */
  const lc = localChecks(p);
  if (lc.placements !== 'ok') return 'placements: ' + lc.placements;
  if (!decodePrintings(p.printings).length) return 'no decoration methods';
  if (lc.price === 'no sizes') return 'no sizes';
  if (!(parseFloat(p.price) > 0)) return 'no price';
  if (!/^https:\/\//.test(String(p.thumbnail_url || ''))) return 'no catalogue photo';
  if (!String(desc || '').trim()) return 'no description (S&S had none, or no SSA credentials)';
  if (p.auto_off) return 'S&S stopped pricing it (ssa-sync switched it off ' + p.auto_off + ')';
  return null;
}

/* Audit findings that are reported but do not hold a product back. The
   catalogue's own notes (copy, photos, swatch photos, an acceptable drawing —
   catalog-inventory.js isNote) plus categories, which this script files. */
const ADVISORY = new Set(['category']);

/** The audit faults that hold back a product: [[check, finding]]. Exported
 *  for tests. */
function auditFaults(r) {
  return bad(r).filter((k) => !ADVISORY.has(k)).map((k) => [k, r[k]]);
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  /* --only must name real ids. A typo that parsed to nothing used to mean
     "no filter" — i.e. publish everything ready. */
  let ONLY = null;
  const onlyArg = process.argv.find((a) => a.startsWith('--only'));
  try { ONLY = onlyArg ? parseIds(onlyArg.replace(/^--only=?/, '')) : null; }
  catch (e) { console.error(e.message); process.exit(2); }
  const url = mysqlUrlFrom(process.env);
  if (!url) { console.error('no MySQL connection — run under `railway run -s MySQL`'); process.exit(2); }
  const { SSA_ACCOUNT: acct, SSA_API_KEY: key } = process.env;

  let rows = mysql(url, "SELECT id, name, price, stages, printings, attributes, variations, thumbnail_url, " +
    "IFNULL(description,'') description, IFNULL(supplier_style_id,0) sid, " +
    "IFNULL(supplier_cost,0) cost, IFNULL(thumbnail_url,'') thumb, " +
    "IFNULL(DATE_FORMAT(ssa_auto_off,'%Y-%m-%d'),'') auto_off FROM lumise_products " +
    'WHERE supplier=' + sq(STAGED_SUPPLIER) + ' ORDER BY name;', { rows: true });
  if (ONLY) {
    const found = new Set(rows.map((p) => Number(p.id)));
    const absent = [...ONLY].filter((id) => !found.has(id));
    if (absent.length) { console.error('not staged products: #' + absent.join(', #')); process.exit(2); }
    rows = rows.filter((p) => ONLY.has(Number(p.id)));
  }
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + rows.length + ' staged product(s)\n');

  /* Descriptions from S&S, only for rows that have none AND would otherwise
     be ready — a jacket held for its canvas does not cost an API call on every
     dry run. Through the shared client (spacing, retries); a style that still
     fails is reported and held back, never fatal to the run. */
  const fetched = {}, fetchedStyle = {}, fetchFailed = [];
  const need = rows.filter((p) => !String(p.description).trim() && Number(p.sid) &&
    !notReady(p, { desc: 'x' }));
  if (need.length && acct && key) {
    const ssa = makeClient(acct, key);
    for (const p of need) {
      try {
        const j = await ssa('styles/' + Number(p.sid));
        fetched[p.id] = htmlToLines(((Array.isArray(j) ? j[0] : j) || {}).description);
        fetchedStyle[p.id] = j;   // reused by the audit: one styles/ call per product
      } catch (e) { fetchFailed.push('#' + p.id + ' ' + e.message.slice(0, 60)); }
    }
    if (fetchFailed.length) console.log('  S&S descriptions not fetched (held back):\n    ' + fetchFailed.join('\n    ') + '\n');
  } else if (need.length) {
    console.log('  no SSA credentials: ' + need.length + ' product(s) without a description stay staged\n');
  }

  const ready = [], held = [], warned = [];
  const candidates = [];
  for (const p of rows) {
    const desc = String(p.description).trim() ? p.description : (fetched[p.id] || '');
    const why = notReady(p, { desc });
    (why ? held : candidates).push({ p, why, desc, fill: !String(p.description).trim() && desc });
  }
  /* The catalogue audit, on the description each product WILL have (one
     filled from S&S here agrees with S&S's weight by construction). */
  if (candidates.length) {
    const methods = mysql(url, 'SELECT id, title FROM lumise_printings ORDER BY id;', { rows: true });
    const { ids: roleIds } = resolveRoles(methods), subId = sublimationId(methods);
    const ssa = acct && key ? makeClient(acct, key) : null;
    for (const c of candidates) {
      const p = { ...c.p, description: c.desc };
      const r = localChecks(p, { roleIds, subId });
      if (ssa) await compareWithSsa(r, p, ssa, { style: fetchedStyle[c.p.id] });
      else r.identity = 'not audited against S&S (no SSA credentials)';
      const faults = auditFaults(r);
      if (faults.length) held.push({ ...c, why: 'audit: ' + faults.map(([k, v]) => k + ' ' + v).join(' · ') });
      else ready.push(c);
      const notes = [...bad(r).filter((k) => ADVISORY.has(k)), ...noted(r).filter((k) => k !== 'photos')];
      if (!faults.length && notes.length) warned.push('#' + c.p.id + ' ' + notes.map((k) => k + ': ' + r[k]).join(' · '));
    }
  }
  console.log('  READY (' + ready.length + ')');
  for (const r of ready) console.log('    #' + String(r.p.id).padStart(3) + '  ' + r.p.name.slice(0, 70));
  console.log('\n  HELD BACK (' + held.length + ')');
  for (const h of held) console.log('    #' + String(h.p.id).padStart(3) + '  ' + h.p.name.slice(0, 50).padEnd(52) + h.why);
  if (warned.length) console.log('\n  READY, WITH AUDIT NOTES (fix after publishing)\n    ' + warned.join('\n    '));

  if (!APPLY) { console.log('\n  dry run — pass --apply to publish the ' + ready.length + ' ready product(s)'); return; }
  if (!ready.length) { console.log('\n  nothing ready to publish'); return; }

  /* One transaction. The WHERE re-checks 'ssa-staged' so a row published or
     changed since it was read is left alone. */
  const stmts = ready.map((r) => 'UPDATE lumise_products SET supplier=\'ssa\', active=1, ' +
    (r.fill ? 'description=' + sq(r.desc) + ', ' : '') + 'updated=NOW() ' +
    'WHERE id=' + Number(r.p.id) + ' AND supplier=' + sq(STAGED_SUPPLIER) + ';');
  mysql(url, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  const live = mysql(url, 'SELECT COUNT(*) n FROM lumise_products WHERE active=1 AND supplier=\'ssa\' AND id IN (' +
    ready.map((r) => Number(r.p.id)).join(',') + ');', { rows: true })[0].n;
  console.log('\n  published ' + live + ' of ' + ready.length);

  /* Filed into categories, as ssa-add-products does after an add: the
     categoriser only files LIVE products, so a staged one had none. */
  const cat = require('child_process').spawnSync(process.execPath,
    [require('path').join(__dirname, 'categorise-products.js'), '--apply'],
    { input: JSON.stringify({ MYSQL_PUBLIC_URL: url, SSA_ACCOUNT: acct || '', SSA_API_KEY: key || '' }), stdio: ['pipe', 'inherit', 'inherit'] });
  if (cat.status !== 0) { console.error('\n  published, but filing into categories FAILED: run tools/categorise-products.js --apply'); process.exit(1); }
  console.log('\n  next: tools/colour-photos.js --write, for per-colour photos on the new products');
  if (Number(live) !== ready.length) process.exit(1);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });

module.exports = { notReady, auditFaults, htmlToLines, decodePrintings, patterned };
