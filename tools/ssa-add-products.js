#!/usr/bin/env node
/*
 * Add S&S styles to the designer catalogue, priced and configured.
 *
 *   node tools/ssa-add-products.js < vars.json           # dry run
 *   node tools/ssa-add-products.js --apply < vars.json   # write
 *   node tools/ssa-add-products.js --only=112,6606 ...   # just these styles
 *
 * For each style this pulls live S&S data and writes a product with:
 *   - price      cheapest core-size piece cost x 2 (the shop's rule)
 *   - sizes      every size S&S stocks, with upcharges derived from the real
 *                per-size cost difference rather than guessed
 *   - colours    the actual colour range, with swatch hexes
 *   - stages     the print area for that GARMENT TYPE, from the existing
 *                configured products — a cap is not a tee and must not get a
 *                tee's 175x280 print area
 *   - printings  only the decorations the garment can physically take
 *
 * Nothing here invents data. A style S&S cannot price is skipped rather than
 * added with a placeholder, because a product that cannot be costed is a
 * product that will be quoted wrong.
 */

const { spawnSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7)
  .split(',').filter(Boolean).map((s) => s.toUpperCase());
const MYSQL = '/usr/local/opt/mysql-client/bin/mysql';
const HOME = 'IL';
/* Core sizes, including every spelling S&S uses for a one-size garment. Caps
   are sized "Adjustable" and bags "One Size"; missing those made every cap look
   like it had no cost at all and skip silently. */
const CORE = ['S', 'M', 'L', 'XL', 'OSFA', 'One Size', 'OS', 'ADJ', 'Adjustable',
  'One Size Fits All', 'OSFM', 'ONE SIZE',
  /* Youth and toddler garments never carry an adult S/M/L, so without these a
     toddler tee reads as having no cost at all and is skipped in silence. */
  '2T', '3T', '4T', '5/6', 'XS', 'YXS', 'YS', 'YM', 'YL', '6M', '12M', '18M', '24M'];

/* ── Garment types ────────────────────────────────────────────────────────
 *
 * `stages` is the print area, and it is the one thing that cannot be shared
 * across types: a cap prints 165x100 on the front only, a tote prints
 * 200x280 both sides. These are lifted from products already configured and
 * selling, so they match what the shop actually produces.
 *
 * `printings` lists the decoration methods the garment can take. A curved cap
 * front cannot be screen printed and an infant bodysuit is not worth hooping,
 * so offering those is offering something the shop would have to refuse.
 */
const TYPES = {
  tee:      { raws: 'basic_tshirt',       front: { height: 280, width: 175, left: -2.5, top: -7.5 },
              back: { height: 339, width: 160, left: -4, top: -11 }, methods: [1, 2, 3, 4, 5, 6, 8] },
  longslv:  { raws: 'long_sleeve',        front: { height: 280, width: 175, left: -2.5, top: -7.5 },
              back: { height: 339, width: 160, left: -4, top: -11 }, methods: [1, 2, 3, 4, 5, 6, 8] },
  polo:     { raws: 'polo_core365',       front: { height: 200, width: 170, left: 0, top: 25 },
              back: { height: 240, width: 180, left: 0, top: 0 }, methods: [1, 8] },
  cap:      { raws: 'hat',                front: { height: 100, width: 165, left: -1, top: -5 },
              back: null, methods: [8] },
  bag:      { raws: 'bag',                front: { height: 280, width: 200, left: 0, top: -5 },
              back: { height: 280, width: 200, left: 0, top: -5 }, methods: [1, 2, 3, 4, 5, 6, 8] },
  hoodie:   { raws: 'hoodies_sweatshirt', front: { height: 240, width: 175, left: 0, top: 10 },
              back: { height: 320, width: 175, left: 0, top: -5 }, methods: [1, 2, 3, 4, 5, 6, 8] },
  kids:     { raws: 'kids_babies',        front: { height: 200, width: 140, left: 0, top: 0 },
              back: { height: 200, width: 140, left: 0, top: 0 }, methods: [1, 2, 3, 4, 5, 6] },
  premium:  { raws: 'premium',            front: { height: 260, width: 170, left: 0, top: 0 },
              back: { height: 300, width: 170, left: 0, top: 0 }, methods: [1, 8] },
};

/* The styles to add, each with the garment type that decides its print area.
   Every one was verified to have real Illinois stock — freight on blanks comes
   straight off margin and cannot be passed on. */
const WANTED = [
  ['112',      'cap',     'Richardson',  'Richardson 112 Snapback Trucker Cap'],
  ['6606',     'cap',     'YP',          'YP Classics 6606 Retro Trucker Cap'],
  ['VC300A',   'cap',     'Valucap',     'Valucap VC300A Bio-Washed Dad Hat'],
  ['6245CM',   'cap',     'YP',          'YP Classics 6245CM Classic Dad Hat'],
  ['8881',     'bag',     'Liberty',     'Liberty Bags 8881 Drawstring Pack'],
  ['EC8056',   'bag',     'econscious',  'econscious EC8056 Eco Promo Tote'],
  ['CCET0',    'bag',     'Comfort',     'Comfort Colors CCET0 Everyday Tote'],
  ['88181',    'polo',    'CORE365',     "CORE365 88181 Men's Origin Performance Polo"],
  ['78181',    'polo',    'CORE365',     "CORE365 78181 Women's Origin Performance Polo"],
  ['CE104',    'polo',    'CORE365',     "CORE365 CE104 Men's Market Snag Protect Polo"],
  ['5900',     'polo',    'C2',          "C2 Sport 5900 Men's Utility Polo"],
  ['CE10',     'tee',     'CORE365',     'CORE365 CE10 Unisex Capital Performance Tee'],
  ['42000',    'tee',     'Gildan',      'Gildan 42000 Unisex Performance Tee'],
  ['CO200',    'hoodie',  'Champion',    'Champion CO200 Packable Anorak Jacket'],
  ['IND5000P', 'hoodie',  'Independent', 'Independent Trading IND5000P Legend Pullover'],
  ['78190',    'hoodie',  'CORE365',     "CORE365 78190 Women's Journey Fleece Jacket"],
  ['HMB000',   'premium', 'Hanes',       "Hanes HMB000 Men's V-Neck Scrub Top"],
  ['CE520',    'premium', 'CORE365',     "CORE365 CE520 Men's Shoreline Shirt"],
  /* Purpose-made sublimation blanks — white polyester, which is what makes
     sublimation possible at all. The women's and Blackout styles are out of
     stock across the whole S&S network, so they are deliberately absent. */
  ['1910',     'tee',     'SubliVie',    "SubliVie 1910 Men's Polyester Sublimation Tee"],
  ['1210',     'kids',    'SubliVie',    'SubliVie 1210 Youth Polyester Sublimation Tee'],
  ['1310',     'kids',    'SubliVie',    'SubliVie 1310 Toddler Polyester Sublimation Tee'],
];

/* Sublimation (#14) needs a poly garment, so it is added only where the fabric
   supports it rather than offered everywhere and refused later. */
const SUBLIMATION_METHOD = 14;

/* ── S&S ─────────────────────────────────────────────────────────────────── */

let last = 0;
function makeClient(acct, key) {
  const auth = 'Basic ' + Buffer.from(acct + ':' + key).toString('base64');
  return async function ssa(path, tries = 5) {
    let st = 0;
    for (let i = 0; i < tries; i++) {
      const wait = Math.max(0, last + 700 - Date.now()) + (i ? 1200 * i * i : 0);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      try {
        const r = await fetch('https://api.ssactivewear.com/v2/' + path,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) });
        st = r.status;
        if (r.status === 429 || r.status >= 500) continue;
        if (!r.ok) return null;
        return await r.json();
      } catch { /* retry */ }
    }
    /* Throwing rather than returning null: a throttled call must never be
       mistaken for "this style does not exist", which would add nothing and
       report success. */
    throw new Error('S&S unreachable (last ' + st + '): ' + path);
  };
}

/* ── Encoding, matching lumise's lib->enjson() ───────────────────────────── */

const enjson = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o)), 'utf8').toString('base64');
const sq = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const money = (n) => Math.round(Number(n) * 100) / 100;

function buildStages(type) {
  const t = TYPES[type];
  const shape = (side, zone) => ({
    source: 'raws', overlay: true,
    url: 'products/' + t.raws + (t.back ? '_' + side : '') + '.png',
    label: side === 'front' ? 'Front' : 'Back',
    edit_zone: { ...zone, radius: '0' },
    product_width: 400, product_height: 475,
  });
  const stages = { front: shape('front', t.front) };
  if (t.back) stages.back = shape('back', t.back);
  return enjson(stages);
}

/** Sizes and colours, from what S&S actually stocks. */
function buildAttributes(rows, baseCost) {
  const sizeCost = {}, order = {}, colours = new Map();
  for (const r of rows) {
    const c = Number(r.piecePrice || r.casePrice || 0);
    if (!r.sizeName || !c) continue;
    if (!sizeCost[r.sizeName] || c < sizeCost[r.sizeName]) sizeCost[r.sizeName] = c;
    if (order[r.sizeName] === undefined) order[r.sizeName] = Number(r.sizeOrder || 999);
    if (r.colorName && !colours.has(r.colorName)) {
      colours.set(r.colorName, '#' + String(r.color1 || '000000').replace(/^#/, ''));
    }
  }
  const sizes = Object.keys(sizeCost).sort((a, b) => order[a] - order[b]);
  if (!sizes.length) return null;

  /* The upcharge is the REAL cost difference doubled, not a flat guess: a 2XL
     that costs $3.68 more must sell for $7.36 more or the shop loses on every
     extended size it sells. */
  const multiple_options = sizes.map((s) => {
    const up = money((sizeCost[s] - baseCost) * 2);
    return { title: s, price: up > 0 ? String(up) : '', default: s === 'L' ? '1' : '' };
  });

  const attrs = {
    QTYS: { type: 'quantity', title: '', values: JSON.stringify({ multiple_options }) },
  };
  if (colours.size) {
    attrs.COL = { type: 'product_color', title: '', values: {
      options: [...colours].map(([title, value], i) => ({
        value, title, price: '', default: i === 0 ? '1' : '' })) } };
  }
  return enjson(attrs);
}

/** Which decorations this garment can take, as lumise stores them. */
function buildPrintings(type, isPoly) {
  const ids = [...TYPES[type].methods];
  if (isPoly && !ids.includes(SUBLIMATION_METHOD)) ids.push(SUBLIMATION_METHOD);
  const o = {};
  for (const id of ids) o['_' + id] = 'A3';
  return encodeURIComponent(JSON.stringify(o));
}

/* ── SQL ─────────────────────────────────────────────────────────────────── */

function mysql(url, sql, { rows = false } = {}) {
  const u = new URL(url);
  const args = ['-h', u.hostname, '-P', u.port || '3306', '-u', decodeURIComponent(u.username),
    '--protocol=TCP', '--default-character-set=utf8mb4', '-e', sql,
    u.pathname.replace(/^\//, '') || 'railway'];
  const r = spawnSync(MYSQL, rows ? ['-B', ...args] : args, {
    env: Object.assign({}, process.env, { MYSQL_PWD: decodeURIComponent(u.password) }),
    encoding: 'utf8', stdio: rows ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) throw new Error('mysql exited ' + r.status);
  if (!rows) return null;
  const lines = r.stdout.trim().split('\n');
  if (lines.length < 2) return [];
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
}

/* ── Main ────────────────────────────────────────────────────────────────── */

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', async () => {
  const env = JSON.parse(buf);
  const dbUrl = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
  if (!env.SSA_ACCOUNT || !env.SSA_API_KEY) { console.error('SSA credentials missing'); process.exit(2); }
  if (!dbUrl) { console.error('no MySQL URL'); process.exit(2); }
  const ssa = makeClient(env.SSA_ACCOUNT, env.SSA_API_KEY);

  const existing = mysql(dbUrl,
    'SELECT id, name, IFNULL(supplier_style_id,0) sid FROM lumise_products;', { rows: true });
  const haveStyle = new Set(existing.map((p) => String(p.sid)));

  const list = ONLY.length ? WANTED.filter((w) => ONLY.includes(w[0].toUpperCase())) : WANTED;
  const seenIds = new Set();
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + list.length + ' styles\n');
  console.log('  style      name                                         price   sizes col  IL      type');
  console.log('  ' + '-'.repeat(96));

  const stmts = [];
  let added = 0, skipped = 0;
  for (const [token, type, brand, name] of list) {
    let s, rows;
    try {
      const found = await ssa('styles/?search=' + encodeURIComponent(token));
      /* Match the BRAND as well as the style number. Style numbers are not
         unique across brands — "1310" is SubliVie's toddler sublimation tee and
         also Colortone's oil-wash tee, and taking the first match added the
         wrong garment at the wrong price under the right name. */
      s = (found || []).find((x) => String(x.styleName).toUpperCase() === token.toUpperCase() &&
        String(x.brandName).toUpperCase().includes(brand.toUpperCase()));
      if (!s) {
        const anyName = (found || []).filter((x) => String(x.styleName).toUpperCase() === token.toUpperCase());
        console.log('  ' + token.padEnd(11) + (anyName.length
          ? 'style exists but not from ' + brand + ' (' + anyName.map((x) => x.brandName).join(', ') + ') — skipped'
          : 'no such style at S&S — skipped'));
        skipped++; continue;
      }
      if (haveStyle.has(String(s.styleID))) {
        console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) + 'already in the catalogue');
        skipped++; continue;
      }
      rows = await ssa('products/?styleid=' + s.styleID);
    } catch (e) {
      console.log('  ' + token.padEnd(11) + 'API: ' + e.message.slice(0, 46)); skipped++; continue;
    }
    if (!Array.isArray(rows) || !rows.length) {
      console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) + 'no live pricing — skipped');
      skipped++; continue;
    }

    let baseCost = Infinity, il = 0;
    const seenSizes = new Set(), seenCols = new Set();
    for (const r of rows) {
      const c = Number(r.piecePrice || r.casePrice || 0);
      if (!r.sizeName || !c) continue;
      seenSizes.add(r.sizeName);
      if (r.colorName) seenCols.add(r.colorName);
      if (CORE.includes(r.sizeName) && c < baseCost) baseCost = c;
      if (CORE.includes(r.sizeName)) {
        for (const w of r.warehouses || []) if (w.warehouseAbbr === HOME) il += w.qty;
      }
    }
    if (!isFinite(baseCost)) {
      console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) + 'no core-size cost — skipped');
      skipped++; continue;
    }

    const attributes = buildAttributes(rows, baseCost);
    if (!attributes) { console.log('  ' + token.padEnd(11) + 'no sizes — skipped'); skipped++; continue; }

    const price = money(baseCost * 2);
    /* Sublimation is offered ONLY on blanks made for it.
       The looser test — anything "performance" or "polyester" — enabled it on
       the CORE365 polos, which come in 19 colours that are mostly dark. Dye
       sublimation cannot print onto a dark garment at all, so that would have
       put a method on the page that has to be refused whenever it is chosen. */
    const isPoly = /^SubliVie/i.test(name);
    const thumb = s.styleImage ? 'https://cdn.ssactivewear.com/' + s.styleImage : '';

    console.log('  ' + token.padEnd(11) + name.slice(0, 44).padEnd(46) +
      ('$' + price.toFixed(2)).padStart(7) + String(seenSizes.size).padStart(6) +
      String(seenCols.size).padStart(5) + String(il).padStart(8) + '  ' + type +
      (isPoly ? '  +sublimation' : ''));

    stmts.push(
      'INSERT INTO lumise_products (name, price, product, thumbnail, thumbnail_url, template, ' +
      'description, stages, variations, attributes, printings, `order`, active, author, ' +
      'created, updated, supplier, supplier_style_id, supplier_cost, ssa_seen_at)\n' +
      "  SELECT " + sq(name) + ', ' + price + ", 0, '', " + sq(thumb) + ", '', '', " +
      sq(buildStages(type)) + ", '', " + sq(attributes) + ', ' + sq(buildPrintings(type, isPoly)) +
      ", 1, 1, '', NOW(), NOW(), 'ssa', " + s.styleID + ', ' + money(baseCost) + ', NOW()\n' +
      '  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_products ' +
      'WHERE supplier_style_id=' + s.styleID + ') AS t);');
    added++;
  }

  console.log('\n  ' + added + ' to add · ' + skipped + ' skipped');
  console.log('\n' + stmts.length + ' statements' + (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));
  if (!APPLY || !stmts.length) process.exit(0);

  mysql(dbUrl, "SET SESSION sql_mode='';\nSTART TRANSACTION;\n" + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
});
