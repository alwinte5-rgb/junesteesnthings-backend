#!/usr/bin/env node
/* Signs365 signage: products, and a priced method per size.
 *
 *   node tools/add-signage.js --vars=~/.jtees-art.json
 *   node tools/add-signage.js --vars=~/.jtees-art.json --apply
 *
 * Same shape as tools/add-cutouts.js, and for the same reason: every ordinary
 * line in this system is `blank + decoration x qty`, and a banner has no blank
 * and no separate decoration — the print IS the product and the price turns on
 * the SIZE. So each size carries its own ladder as a decoration method, and the
 * product itself carries no price.
 *
 * Costs all come from tools/lib/signage.js, which is the only place they live.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   Yard signs. June can buy blank 24x18 coro from Amazon and apply a GF 2030
 *   sticker, which is cheaper than a Signs365 sheet on short runs — the same
 *   two-route split cutouts.js makes between a 20x30 board and a full sheet.
 *   The Amazon blank price is not recorded yet, so the route cannot be costed
 *   and the product is left out rather than published at the sheet-only price,
 *   which would put one 24x18 sign on the quote at $88.
 */
const fs = require('fs');
const sg = require('./lib/signage');
const { mysql, enjson, sq } = require('./lib/db');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const varsFile = ((argv.find((a) => a.startsWith('--vars=')) || '').split('=').slice(1).join('=') || '')
  .replace(/^~/, process.env.HOME);
if (!varsFile) { console.error('usage: add-signage.js --vars=<file> [--apply]'); process.exit(2); }
const env = JSON.parse(fs.readFileSync(varsFile, 'utf8'));
const url = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
if (!url) { console.error('no MySQL URL'); process.exit(2); }

const money = (n) => n.toFixed(2);

/* A flat method: one price at every quantity. Correct wherever the supplier's
   own unit is the thing being sold (a sheet, a fixed-size magnet, a stand),
   because there is no waste to recover and no volume break to pass on.
   Evened up, so the shelf reads $45 rather than $44.20. */
const flat = (price) => ({ 1000: money(sg.evenUp(price)) });

/* A one-piece line: supplier cost + the shop time on it, then x2, then evened.
   Every product here goes through this rather than flat(retail(cost)) — the
   old path priced the shop's work at zero. */
const priced = (cost, kind, markup = sg.MARKUP) =>
  flat((cost + sg.labourCost(kind, 1)) * markup);

/* A per-piece ladder from a cost function, keyed on band CEILINGS. Each band is
   priced at the WORST cost inside it, so the ladder never rises as the order
   grows — add-cutouts.js refuses to write a rising ladder and so does this. */
function ladder(costOf, bands, markup = sg.MARKUP) {
  const out = {};
  let worst = 0;
  for (let i = bands.length - 1; i >= 0; i--) {
    const q = bands[i];
    worst = Math.max(worst, costOf(q) / q);
    out[q] = money(sg.evenUp(worst * markup));
  }
  return out;
}

const PAPER_BANDS = [25, 50, 100, 250, 500, 1000, 2500];

const METHODS = [];
const add = (title, bands, description, minQty = 1) =>
  METHODS.push({ title, bands, description, min: minQty });

/* ── Full body cutouts ──────────────────────────────────────────────────── */
/* NOT flat, unlike everything else here. A standee carries freight that is
   charged once an ORDER, so one costs far more per piece than ten — and the
   backing is per piece on top. The ladder is the envelope over both. */
add('Full Body Cutout — single-sided', sg.standeeLadder(),
  'A life-size cutout on rigid corrugated plastic, printed, contour cut and built onto a backing so it stands on its own. Send a full-length photo.');
/* No double-sided standee. June's call: the second side more than doubles the
   supplier cost ($4.25/sqft against $1.25) and a standee is looked at from the
   front. It was priced at $300 for one, which is not a thing anyone buys. */

/* ── Banners ────────────────────────────────────────────────────────────── */
for (const [w, h] of [[24, 48], [36, 72], [48, 96], [36, 120]]) {
  const label = `${w / 12}ft x ${h / 12}ft`;
  add(`Vinyl Banner — ${label}, 13oz single-sided`, flat(sg.bannerPrice(w, h, { oz: 13 })),
    `A ${label} vinyl banner, hemmed with welded edges and grommets included. Indoor or outdoor.`);
}
add('Vinyl Banner — 3ft x 6ft, 18oz DOUBLE-SIDED',
  flat(sg.bannerPrice(36, 72, { oz: 18, sides: 'double' })),
  'A 3ft x 6ft banner printed both sides on heavy 18oz vinyl, for hanging where it is seen from both directions.');

/* ── Banner stand ───────────────────────────────────────────────────────── */
{
  const st = sg.PER_ITEM.econo_banner_stand_plus;
  add(`Retractable Banner Stand — ${st.w}in x ${st.h}in`, priced(st.price, 'stand'),
    'A retractable banner and its stand together. Pulls up out of the base and rolls away into it.');
}

/* ── Posters ────────────────────────────────────────────────────────────── */
for (const [w, h] of [[18, 24], [24, 36]]) {
  add(`Poster — ${w}in x ${h}in, single-sided`, priced(sg.posterCost(w, h), 'rigid'),
    `A ${w} x ${h} inch poster on 16pt poster paper.`);
}

/* ── Adhesive graphics ──────────────────────────────────────────────────── */
const PER_SQFT_LINE = 20;   // a nominal line size, to spread the job time over
const perSqft = (rate) => flat(sg.retail(rate + sg.labourCost('adhesive', 1) / PER_SQFT_LINE));
add('Window Graphic — one-way vinyl, per sqft',
  perSqft(sg.ONE_WAY_WINDOW.no_laminate),
  'Perforated window vinyl: the graphic reads from outside while you still see out. Priced per square foot — enter the square footage as the quantity.');
add('Window Graphic — one-way vinyl, gloss laminated, per sqft',
  perSqft(sg.ONE_WAY_WINDOW.laminate),
  'Perforated window vinyl with a gloss laminate for longer life. Priced per square foot.');
add('Wall Graphic — removable fabric, per sqft',
  perSqft(sg.ADHESIVE.low_tac_wall),
  'Removable adhesive fabric for interior walls. Repositionable and comes off cleanly. INDOOR ONLY. Priced per square foot.');
add('Vehicle Graphic — 3M ControlTac, per sqft',
  perSqft(sg.ADHESIVE.controltac_3m),
  'Premium 3M vehicle-grade adhesive vinyl, gloss laminated. Priced per square foot.');

/* ── Magnets ────────────────────────────────────────────────────────────── */
for (const key of Object.keys(sg.MAGNET_FIXED)) {
  const [w, h] = key.split('x').map(Number);
  add(`Vehicle Magnet — ${w}in x ${h}in, single-sided`, priced(sg.magnetCost(w, h), 'magnet'),
    `A ${w} x ${h} inch vehicle magnet. Lifts off for the car wash and goes back on.`);
}

/* ── Acrylic ────────────────────────────────────────────────────────────── */
for (const [w, h] of [[12, 18], [18, 24], [24, 36]]) {
  add(`Acrylic Panel — ${w}in x ${h}in, single-sided`, priced(sg.acrylicCost(w, h), 'rigid'),
    `A ${w} x ${h} inch panel on 3/16 inch acrylic, printed on the back with a white underbase so the colour reads through the gloss. Indoor.`);
}

/* ── Canvas ─────────────────────────────────────────────────────────────── */
for (const [w, h] of [[16, 20], [24, 36]]) {
  add(`Canvas Print — ${w}in x ${h}in, single-sided`, priced(sg.canvasCost(w, h), 'rigid'),
    `A ${w} x ${h} inch print on 11oz poly-cotton canvas with a gesso finish. Ready to stretch or frame. Indoor.`);
}

/* ── Paper ──────────────────────────────────────────────────────────────── */
/* Paper is the one product here with a real ladder: a sheet yields 72 business
   cards, so the per-piece cost falls hard across the first few hundred. */
for (const [size, label, desc] of [
  ['3.5x2', 'Business Cards — single or double-sided', 'Standard 3.5 x 2 inch business cards on 16pt stock with a gloss coating. Printing the back costs nothing extra.'],
  ['6x4', 'Flyers — 6in x 4in, single or double-sided', 'A 6 x 4 inch flyer or postcard on 16pt stock.'],
  ['11x8.5', 'Flyers — 11in x 8.5in, single or double-sided', 'A full-page 11 x 8.5 inch flyer on 16pt stock.'],
]) {
  add(label, ladder((q) => sg.paperCost(q, size) + sg.labourCost('paper', q), PAPER_BANDS, sg.paperMarkupFor(size)), desc, 25);
}

/* ── Report ─────────────────────────────────────────────────────────────── */
console.log((APPLY ? 'APPLYING' : 'DRY RUN') + '  —  ' + METHODS.length + ' methods, cost x' + sg.MARKUP +
            ', oversized freight built in, $10 standard shown separately\n');

const have = new Map(mysql(url,
  "SELECT id,title FROM lumise_printings WHERE title REGEXP '^(Full Body Cutout|Vinyl Banner|Retractable Banner Stand|Poster|Window Graphic|Wall Graphic|Vehicle Graphic|Vehicle Magnet|Business Cards|Flyers|Acrylic Panel|Canvas Print)';",
  { rows: true }).map((r) => [r.title, r.id]));

for (const m of METHODS) {
  const q = Object.keys(m.bands).map(Number).sort((a, b) => a - b);
  console.log('  ' + (have.has(m.title) ? 'update #' + have.get(m.title) : 'create') + '  ' + m.title +
              (m.min > 1 ? '   [min ' + m.min + ']' : ''));
  console.log('      ' + q.map((k) => (q.length === 1 ? '$' + m.bands[k] : '<=' + k + ' $' + m.bands[k])).join('  '));
  for (let i = 1; i < q.length; i++) {
    if (parseFloat(m.bands[q[i]]) > parseFloat(m.bands[q[i - 1]])) {
      console.error('      !! price RISES at ' + q[i] + ' — refusing'); process.exit(1);
    }
  }
}

const PRODUCTS = [
  ['Full Body Cutouts', 'Life-size cutouts on rigid corrugated plastic. Send a full-length photo and choose 4mm or 10mm; the 10mm stands on its own.'],
  ['Vinyl Banners', 'Custom printed vinyl banners with welded edges and grommets included. Indoor or outdoor, in 13oz, 15oz and 18oz.'],
  ['Posters & Prints', 'Posters and prints on 16pt stock, in standard sizes.'],
  ['Window & Wall Graphics', 'Perforated one-way window vinyl, removable wall fabric and vehicle-grade 3M adhesive. Priced per square foot.'],
  ['Vehicle Magnets', 'Custom vehicle magnets in five stock sizes. They lift off for the car wash.'],
  ['Business Cards & Flyers', 'Business cards, postcards and flyers on 16pt stock with a gloss coating.'],
  ['Acrylic & Canvas', 'Photo panels and wall art: 3/16 inch acrylic printed with a white underbase, or 11oz poly-cotton canvas ready to stretch. Both indoor.'],
];
console.log('');
for (const [name] of PRODUCTS) {
  const got = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(name) + ';', { rows: true });
  console.log('  ' + (got.length ? 'product #' + got[0].id : 'create product') + '  ' + name + '  (no price — the size carries it)');
}

console.log('\n  NOT INCLUDED: Coroplast Yard Signs — the Amazon blank price is not recorded,');
console.log('  so the in-house route cannot be costed. Publishing sheet-only would put one');
console.log('  24x18 sign on the quote at $88.');

if (!APPLY) { console.log('\n  dry run — pass --apply to write'); process.exit(0); }

const calc = (bands, minQty) => enjson({
  multi: false, type: 'fixed', show_detail: '1',
  values: { front: Object.fromEntries(Object.entries(bands).map(([q, p]) => [q, { price: p }])) },
  min_qty: minQty,
});
const author = mysql(url, 'SELECT author FROM lumise_products WHERE active=1 LIMIT 1;', { rows: true })[0].author;

for (const m of METHODS) {
  if (have.has(m.title)) {
    mysql(url, 'UPDATE lumise_printings SET calculate=' + sq(calc(m.bands, m.min)) + ', description=' + sq(m.description) +
      ', active=1, updated=NOW() WHERE id=' + have.get(m.title) + ';');
  } else {
    mysql(url, 'INSERT INTO lumise_printings (title,active,calculate,thumbnail,upload,description,author,created,updated) VALUES (' +
      sq(m.title) + ",1," + sq(calc(m.bands, m.min)) + ",'',''," + sq(m.description) + ',' + sq(author) + ',NOW(),NOW());');
  }
}
for (const [name, description] of PRODUCTS) {
  const got = mysql(url, 'SELECT id FROM lumise_products WHERE name=' + sq(name) + ';', { rows: true });
  if (got.length) {
    mysql(url, 'UPDATE lumise_products SET description=' + sq(description) + ", price=0, active=1, updated=NOW() WHERE id=" + got[0].id + ';');
  } else {
    mysql(url, 'INSERT INTO lumise_products (name,description,price,supplier_cost,stages,attributes,printings,' +
      'thumbnail_url,active,`order`,author,created,updated) VALUES (' + sq(name) + ',' + sq(description) +
      ',0,0,' + sq(enjson({})) + ',' + sq(enjson({})) + ",'','',1,999," + sq(author) + ',NOW(),NOW());');
  }
}
console.log('\n  written.');
