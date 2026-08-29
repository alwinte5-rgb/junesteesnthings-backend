#!/usr/bin/env node
/* Anchorfish 2026 repricing for the Lumise designer.
 *
 *   railway variables --service MySQL --json | node tools/reprice-anchorfish-2026.js
 *   railway variables --service MySQL --json | node tools/reprice-anchorfish-2026.js --apply
 *
 * Two changes:
 *
 * 1. DIGITIZING (#12,#15,#16,#17) goes up $5 across the board. Digitizing is a
 *    one-off fee the customer compares between shops, so it does not carry a
 *    multiple — a rise big enough to notice loses the job that would have paid
 *    for the run.
 *
 * 2. EMBROIDERY RUN RATES (#7-#11) are priced by centimetres, which is why
 *    jt-catalog.php flags them unquotable. Repriced by STITCH COUNT, the way
 *    embroidery is actually costed, with the band in each title.
 *
 *    EMBROIDERY IS SEWN IN HOUSE, so a contract sheet is not the cost basis —
 *    the real cost is thread and machine time. What the market will bear is
 *    what a contract embroiderer would charge for the same piece, so that is
 *    the basis: a vendor curve anchored at $8 for a chest logo, doubled.
 *    Anchorfish's sheet still sets the SHAPE (the relative cost of each stitch
 *    band and the quantity taper) because those relativities are real and
 *    documented; only the level is re-anchored. Screen print and DTF are
 *    genuinely contracted out and keep Anchorfish's actual numbers.
 *
 * `calculate` is base64(urlencode(json)) — the same encoding lumise's own
 * lib->enjson() uses. Quantity keys are band CEILINGS, matching the
 * storefront's pricing code (app.js ~16137), NOT floors.
 */

const { spawnSync } = require('child_process');
const APPLY = process.argv.includes('--apply');

/* ── Screen print (contracted to Anchorfish) ────────────────────────────── */

/* Their sheet, per piece, by colour count. Rows are quantity FLOORS; `ceil` is
   the band ceiling Lumise keys on. Minimum is 50 — the bands that used to start
   at 12 were the previous vendor's and contradicted the shop's own minimum.
   The markup falls with quantity because Anchorfish's cost curve is much
   flatter than the old vendor's while market price still drops steeply, so one
   multiple would either starve the small runs or lose the big bids. */
const SP = {
   50: { ceil:  99, mk: 4.40, p: [1.80, 2.25, 2.72, 3.19, 3.66, 4.13, 4.60] },
  100: { ceil: 249, mk: 3.65, p: [1.65, 2.06, 2.53, 3.00, 3.47, 3.94, 4.41] },
  250: { ceil: 499, mk: 2.75, p: [1.47, 1.84, 2.31, 2.78, 3.25, 3.72, 4.19] },
  500: { ceil: 999, mk: 2.55, p: [1.32, 1.65, 2.12, 2.59, 3.06, 3.53, 4.00] },
 1000: { ceil:2499, mk: 2.10, p: [1.17, 1.46, 1.93, 2.40, 2.87, 3.34, 3.81] },
 2500: { ceil:7000, mk: 1.95, p: [0.99, 1.24, 1.71, 2.18, 2.65, 3.12, 3.59] },
};
const SCREEN_CHARGE = 25;   // yours, per colour, amortised at the band floor

/* Anchorfish prices 5, 6 and 7 colours separately; the designer had one
   combined "5-6 Colors" method, which had to quote one of them wrong. */
const SP_METHODS = {
  2: { colors: 1, title: 'Screen Printing — 1 Color' },
  3: { colors: 2, title: 'Screen Printing — 2 Colors' },
  4: { colors: 3, title: 'Screen Printing — 3 Colors' },
  5: { colors: 4, title: 'Screen Printing — 4 Colors' },
  6: { colors: 5, title: 'Screen Printing — 5 Colors' },
};
const SP_INSERTS = [
  { colors: 6, title: 'Screen Printing — 6 Colors' },
  { colors: 7, title: 'Screen Printing — 7 Colors' },
];

/* ── DTF (contracted to Anchorfish) ─────────────────────────────────────── */

/* Method #1 "Printing" is the only ACTIVE decoration, so this is what the
   storefront actually sells. It is `multi`, with a second stage for a second
   location — which maps onto Anchorfish's "Additional Loc" column.
   Columns used: [0]=16sq [1]=132sq (the standard print) [2]=252sq [3]=addl loc.
   Live bands stopped at 175 pieces, so every larger order was quoting at the
   175 rate; these run to 2,500. */
const DTF = {
    1: { ceil:  11, mk: 4.0, v: [5.00, 7.03, 9.38, 1.80] },
   12: { ceil:  24, mk: 4.0, v: [3.23, 5.63, 7.50, 1.80] },
   25: { ceil:  49, mk: 4.0, v: [2.58, 4.50, 6.00, 1.50] },
   50: { ceil:  99, mk: 3.6, v: [2.73, 3.60, 4.80, 1.50] },
  100: { ceil: 249, mk: 3.6, v: [1.65, 3.06, 4.08, 1.35] },
  250: { ceil: 499, mk: 3.0, v: [1.47, 2.60, 3.47, 1.20] },
  500: { ceil: 999, mk: 2.8, v: [1.32, 2.21, 2.95, 1.11] },
 1000: { ceil:2499, mk: 2.4, v: [1.17, 1.88, 2.51, 1.05] },
 2500: { ceil:7000, mk: 2.2, v: [0.99, 1.60, 2.13, 1.02] },
};

/* ── Anchorfish cost sheets ─────────────────────────────────────────────── */

/* Embroidery prices come from what the shop actually charges, not from a
 * multiple of the vendor sheet: a chest logo is $20 and a full back is $75.
 * Everything between is the straight line through those two points, plotted
 * against Anchorfish's own per-piece cost, so the intermediate sizes keep the
 * supplier's real relative spacing instead of being guessed.
 *
 * The columns on their sheet are stitch RANGES, not thousands of stitches:
 * $4.25 buys one piece with a logo of up to 8,000 stitches. (Price steps by
 * exactly $2.00 a column while the bands vary in width — 8k, 2k, 4k, 4k, 2k, 3k
 * — which per-thousand pricing could not do.) Because that step is uniform, the
 * fit lands on round $11 increments: 20, 31, 42, 53, 64, 75.
 *
 * Prices are FLAT across quantity. "$20 minimum" means the chest logo does not
 * go below $20, and the anchors sit on the 1-24 row where cost is highest, so
 * any volume taper would fall through that floor. Change EMB_TAPER to give
 * embroidery a volume break and the anchors become the top-quantity price.
 */
const EMB_PRICE = { chest: 20.00, fullBack: 75.00 };
const EMB_TAPER = false;

/* Names and text are priced on their own, not fitted from the logo line.
 *
 * A logo is one design sewn N times; names are N different designs, each typed,
 * checked against a list and hooped on its own. The work barely falls with
 * quantity, so the taper is shallow and stops at 75% — deep volume pricing here
 * would sell an hour of setup for the price of a run. Bands start at 1-5
 * because that is the size most name jobs actually are.
 */
const NAME_BASE = { chest: 10.00, upperBack: 25.00 };
const NAME_TAPER = [   // band ceiling, share of the 1-5 price
  [   5, 1.000 ],
  [  11, 0.950 ],
  [  24, 0.900 ],
  [  49, 0.850 ],
  [  74, 0.800 ],
  [  99, 0.775 ],
  [1000, 0.750 ],
];

// Embroidery: qty floor -> [0-8k, 8k-10k, 10k-14k, 14k-18k, 20k-22k, 22k-25k, puff, smName, lgName]
const EMB = {
    1: [4.25, 6.25, 8.25, 10.25, 12.25, 14.25, 1.50, 2, 5],
   12: [4.25, 6.25, 8.25, 10.25, 12.25, 14.25, 1.50, 2, 5],
   25: [3.85, 5.85, 7.85,  9.85, 11.85, 13.85, 1.50, 2, 5],
   50: [3.25, 5.25, 7.25,  9.25, 11.25, 13.25, 1.25, 2, 5],
   75: [3.25, 5.20, 7.20,  9.15, 11.15, 13.15, 1.25, 2, 5],
  100: [3.25, 5.15, 7.15,  9.05, 11.05, 13.05, 1.25, 2, 5],
  150: [3.25, 5.15, 7.15,  9.05, 11.05, 13.05, 1.25, 2, 5],
};
// Band ceilings for those floors. 150+ is capped at 1000 — over 1,000 logos
// Anchorfish quotes delivery separately, so it is not a shelf price anyway.
const EMB_CEIL = { 1: 11, 12: 24, 25: 49, 50: 74, 75: 99, 100: 149, 150: 1000 };

/* The line through the two anchor prices, plotted against cost on the 1-24 row
   (EMB[1][0] is the chest-logo cell, EMB[1][5] the full back). Derived rather
   than typed, so moving either price re-fits everything between automatically. */
const EMB_SLOPE = (EMB_PRICE.fullBack - EMB_PRICE.chest) / (EMB[1][5] - EMB[1][0]);
const EMB_BASE = EMB_PRICE.chest - EMB_SLOPE * EMB[1][0];
const embPrice = (cost) => up05(EMB_SLOPE * cost + EMB_BASE);

/* Which stitch column each existing method maps to. The size names are kept
   because that is how the shop thinks about the work; the stitch band is added
   to the title because that is what the supplier actually bills on. */
/* Small -> medium steps up one band, not two. Mapping medium at 10k-14k made a
   medium logo nearly double a small one, which is a cliff rather than the
   gradual climb these sizes actually represent. */
const EMB_METHODS = {
  7:  { name: 'chest', title: 'Embroidery — Name/Text (chest)' },
  8:  { col: 0, title: 'Embroidery — Small Logo (≤6×6 cm, to 8k stitches)' },
  9:  { col: 1, title: 'Embroidery — Medium Logo (≤10×10 cm, 8k–10k stitches)' },
  10: { col: 2, title: 'Embroidery — Large Logo (≤14×14 cm, 10k–14k stitches)' },
  11: { col: 5, title: 'Embroidery — Full Back (≤30×30 cm, 22k–25k stitches)' },
};

/* Names and text are sold by size, and the sheet already prices exactly two:
   Small Name and Large Name. Chest takes the small rate, upper back the large.
   #7 covers the chest; the upper back has no method yet, so it is inserted.
   Only these two placements are offered — sleeves and cuffs are not sold. */
const EMB_INSERTS = [
  { name: 'upperBack', title: 'Embroidery — Name/Text (upper back)' },
  /* One flat price across 14k-22k rather than the $53 and $64 the fit gives.
     It also closes the hole in the vendor sheet: Anchorfish prices 14k-18k and
     20k-22k but has no 18k-20k column at all, so a 19,000-stitch logo had no
     price anywhere. A single band spanning 14k-22k covers it. */
  { flat: 60.00, title: 'Embroidery — Extra Large Logo (14k–22k stitches)' },
];

/* One method's tier table: names walk their own taper, a flat method holds one
   price at every quantity, and logos are fitted from the vendor's stitch cost. */
function tiersFor(m) {
  if (m.flat) return FL.map((f) => [EMB_CEIL[f], m.flat]);
  if (m.name) return NAME_TAPER.map(([ceil, f]) => [ceil, up05(NAME_BASE[m.name] * f)]);
  return FL.map((f) => [EMB_CEIL[f], embPrice(EMB[EMB_TAPER ? f : 1][m.col])]);
}

/* Digitizing is charged at the vendor rate, with no multiple on top — unlike
   the run rates above. That is deliberate, not an oversight: digitizing is a
   one-off billed once per design however long the run, and it is the number a
   customer rings round to compare. Keeping it at cost while the per-piece rate
   carries the x3 wins the job and still makes the money on the run.
   Anchorfish: $30 up to 15k stitches, then +$5 per additional 1k. */
const digCost = (st) => 30 + Math.max(0, Math.ceil((st - 15000) / 1000)) * 5;

/* Digitizing is charged ONCE PER DESIGN and waived when the customer supplies a
   usable file. That is stated in the title and the description because the
   quote builder cannot express it: a decoration method is priced per piece and
   multiplied by the line quantity, so picking digitizing on a 50-piece line
   would bill $30 fifty times. It has to be added as its own line at quantity 1.
   The description is carried through by jt-catalog.php, so it reaches the quote
   form and the customer's page rather than living only here. */
const DIG_NOTE = 'One-time charge per design, not per piece — waived if the ' +
  'customer supplies a usable DST/EMB file. Add as its own line, quantity 1.';
const DIGITIZING = {
  12: { was: 25, stitches: 15000, title: 'DST Digitizing — one-time (to 15k stitches)' },
  15: { was: 25, stitches: 15000, title: 'DST Digitizing — one-time, Small/Medium (to 15k stitches)' },
  16: { was: 45, stitches: 18000, title: 'DST Digitizing — one-time, Large Logo (to 18k stitches)' },
  17: { was: 65, stitches: 25000, title: 'DST Digitizing — one-time, Full Back (to 25k stitches)' },
};

/* ── Encoding ───────────────────────────────────────────────────────────── */

const up05 = (n) => Math.ceil(n * 20 - 1e-9) / 20;
const enjson = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o)), 'utf8').toString('base64');
const sq = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

/* Insert a method only if the title is not already there, so the whole script
   stays safe to run twice — the only way to check it worked is to run it.
   `active` is 0 to match every other decoration method; the quote form filters
   on use_for_quoting, not on active, so it still appears there. */
function insertMethod(title, tiers) {
  return 'INSERT INTO lumise_printings (title, active, calculate, thumbnail, upload, description, author, created, updated)\n' +
    '  SELECT ' + sq(title) + ', 0, ' + sq(fixedCalc(tiers)) + ", '', '', '', '', NOW(), NOW()\n" +
    '  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_printings WHERE title=' +
    sq(title) + ') AS t);';
}

function fixedCalc(tiers) {
  const values = {};
  for (const [qty, price] of tiers) values[String(qty)] = { price: price.toFixed(2) };
  return enjson({ multi: false, type: 'fixed', show_detail: '1', values: { front: values } });
}

/* ── Build the statements ───────────────────────────────────────────────── */

const stmts = [];
console.log('DIGITIZING — charged at the vendor rate: $30 to 15k stitches, +$5 per extra 1k.\n');
console.log('  id   was      now      title');
console.log('  ' + '-'.repeat(76));
for (const [id, d] of Object.entries(DIGITIZING)) {
  const price = digCost(d.stitches);
  console.log('  ' + id.padStart(2) + '   $' + String(d.was).padEnd(7) + '$' + String(price).padEnd(8) + d.title);
  stmts.push('UPDATE lumise_printings SET title=' + sq(d.title) +
    ', description=' + sq(DIG_NOTE) +
    ', calculate=' + sq(fixedCalc([[1, price]])) + ' WHERE id=' + id + ';');
}
console.log('\n  ' + DIG_NOTE);

console.log('\n\nEMBROIDERY RUN RATES — sewn in house.');
console.log('Chest logo $' + EMB_PRICE.chest.toFixed(2) + ', full back $' + EMB_PRICE.fullBack.toFixed(2) +
  ', sizes between fitted on the vendor sheet.');
console.log(EMB_TAPER ? 'Volume taper ON.\n' : 'Flat across quantity — $' +
  EMB_PRICE.chest.toFixed(2) + ' is a minimum, so there is no volume break.\n');
const FL = Object.keys(EMB).map(Number).sort((a, b) => a - b);

/* Logos and names are shown as two tables because they band differently —
   logos on the vendor's quantity rows, names on their own starting at 1-5.
   One shared header would put each row's prices under the wrong quantities. */
function bandHeader(ceils, firstFloor) {
  let h = '  id   item          ';
  let lo = firstFloor;
  for (const c of ceils) { h += (lo + '-' + c).padStart(11); lo = c + 1; }
  return h;
}
function emit(id, m, tiers) {
  let row = '  ' + String(id).padStart(3) + '  ' +
    m.title.replace(/^Embroidery — /, '').slice(0, 12).padEnd(12);
  for (const [, p] of tiers) row += ('$' + p.toFixed(2)).padStart(11);
  console.log(row);
  // A tier table that ever rises would charge more for ordering more.
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i][1] > tiers[i - 1][1]) {
      console.error('  !! ' + id + ' price RISES at ' + tiers[i][0] + ' — refusing');
      process.exit(3);
    }
  }
}

const logoIds = Object.entries(EMB_METHODS).filter(([, m]) => !m.name);
const nameIds = Object.entries(EMB_METHODS).filter(([, m]) => m.name);

let hdr = bandHeader(FL.map((f) => EMB_CEIL[f]), 1);
console.log(hdr);
console.log('  ' + '-'.repeat(hdr.length));
for (const [id, m] of logoIds) {
  const tiers = tiersFor(m);
  emit(id, m, tiers);
  stmts.push('UPDATE lumise_printings SET title=' + sq(m.title) +
    ', calculate=' + sq(fixedCalc(tiers)) + ' WHERE id=' + id + ';');
}

console.log('\n  NAMES & TEXT — own bands, shallow taper. Each name is a separate setup.');
hdr = bandHeader(NAME_TAPER.map(([c]) => c), 1);
console.log(hdr);
console.log('  ' + '-'.repeat(hdr.length));
for (const [id, m] of nameIds) {
  const tiers = tiersFor(m);
  emit(id, m, tiers);
  stmts.push('UPDATE lumise_printings SET title=' + sq(m.title) +
    ', calculate=' + sq(fixedCalc(tiers)) + ' WHERE id=' + id + ';');
}

/* New methods. Inserted only if the title is not already there, so re-running
   this does not create a second copy — the whole script has to stay safe to
   run twice, because the only way to check it worked is to run it. `active`
   is 0 to match every other decoration method; the quote form filters on
   use_for_quoting, not on active, so it still appears there. */
for (const m of EMB_INSERTS) {
  const tiers = tiersFor(m);
  emit('NEW', m, tiers);
  stmts.push(insertMethod(m.title, tiers));
}

console.log('\n  Fitted from your two prices: $' + EMB_PRICE.chest.toFixed(2) + ' chest -> $' +
  EMB_PRICE.fullBack.toFixed(2) + ' full back, x' + EMB_SLOPE.toFixed(2) + ' on cost.');
{
  const bands = ['0-8k', '8k-10k', '10k-14k', '14k-18k', '20k-22k', '22k-25k'];
  let r = '    by stitch band: ';
  for (let i = 0; i < 6; i++) r += (bands[i] + ' $' + embPrice(EMB[1][i]).toFixed(0)).padStart(16);
  console.log(r);
}
/* ── Screen print ───────────────────────────────────────────────────────── */

const SPF = Object.keys(SP).map(Number).sort((a, b) => a - b);
const spPrice = (f, c) => up05(SP[f].p[c - 1] * SP[f].mk + (SCREEN_CHARGE * c) / f);
const spTiers = (c) => SPF.map((f) => [SP[f].ceil, spPrice(f, c)]);

console.log('\n\nSCREEN PRINT — Anchorfish 2026, $' + SCREEN_CHARGE + '/colour screen charge baked in.');
console.log('50-piece minimum: the old bands started at 12, which contradicted it.\n');
let sh = '  id   colours   ';
for (const f of SPF) sh += (f + '-' + SP[f].ceil).padStart(11);
console.log(sh);
console.log('  ' + '-'.repeat(sh.length));
for (const [id, m] of Object.entries(SP_METHODS)) {
  const tiers = spTiers(m.colors);
  emit(id, { title: m.colors + ' colour' }, tiers);
  stmts.push('UPDATE lumise_printings SET title=' + sq(m.title) +
    ', calculate=' + sq(fixedCalc(tiers)) + ' WHERE id=' + id + ';');
}
for (const m of SP_INSERTS) {
  const tiers = spTiers(m.colors);
  emit('NEW', { title: m.colors + ' colour' }, tiers);
  stmts.push(insertMethod(m.title, tiers));
}

/* ── DTF ────────────────────────────────────────────────────────────────── */

const DF = Object.keys(DTF).map(Number).sort((a, b) => a - b);
const dtfSide = (col) => DF.map((f) => [DTF[f].ceil, up05(DTF[f].v[col] * DTF[f].mk)]);

console.log('\n\nDTF — method #1 "Printing", the only ACTIVE method, so this is live on the store.');
console.log('Stage 1 is the main print (132 sq in), stage 2 an additional location.');
console.log('Live bands stopped at 175, so every larger order quoted at the 175 rate.\n');
let dh = '  stage           ';
for (const f of DF) dh += (f + '-' + DTF[f].ceil).padStart(11);
console.log(dh);
console.log('  ' + '-'.repeat(dh.length));
{
  const main = dtfSide(1), add = dtfSide(3);
  for (const [label, t] of [['main print', main], ['add. location', add]]) {
    let r = '  ' + label.padEnd(16);
    for (const [, p] of t) r += ('$' + p.toFixed(2)).padStart(11);
    console.log(r);
    for (let i = 1; i < t.length; i++) {
      if (t[i][1] > t[i - 1][1]) {
        console.error('  !! DTF ' + label + ' price RISES at ' + t[i][0] + ' — refusing');
        process.exit(3);
      }
    }
  }
  /* #1 keeps its two existing stage names — the storefront's saved designs
     reference them, so renaming the stages would orphan those. */
  const calc = enjson({
    multi: true, type: 'fixed', show_detail: '1',
    values: {
      id: Object.fromEntries(main.map(([q, p]) => [String(q), { price: p.toFixed(2) }])),
      mr8a5dlx: Object.fromEntries(add.map(([q, p]) => [String(q), { price: p.toFixed(2) }])),
    },
  });
  stmts.push('UPDATE lumise_printings SET calculate=' + sq(calc) + ' WHERE id=1;');
}

console.log('\n  Every stitch count from 0 to 25k now has a price. The 14k-22k band is flat $60,');
console.log('  which also covers the 18k-20k gap Anchorfish leaves unpriced on their own sheet.');
console.log('  Above 25k stitches there is still no rate — Anchorfish quotes those separately.');

/* ── Apply ──────────────────────────────────────────────────────────────── */

console.log('\n\n' + stmts.length + ' UPDATE statements' + (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));
if (!APPLY) { console.log('\n' + stmts.join('\n')); process.exit(0); }

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', () => {
  const vars = JSON.parse(buf);
  const raw = vars.MYSQL_PUBLIC_URL || vars.MYSQL_URL;
  if (!raw) { console.error('no MySQL URL'); process.exit(2); }
  const u = new URL(raw);
  // Snapshot first: this is live pricing and there is no undo without it.
  const sql = 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;\n' +
    'SELECT id, title FROM lumise_printings WHERE id IN (7,8,9,10,11,12,15,16,17) ORDER BY id;';
  const r = spawnSync('/usr/local/opt/mysql-client/bin/mysql', [
    '-h', u.hostname, '-P', u.port || '3306', '-u', decodeURIComponent(u.username),
    '--protocol=TCP', '--default-character-set=utf8mb4', '-e', sql,
    u.pathname.replace(/^\//, '') || 'railway',
  ], { env: Object.assign({}, process.env, { MYSQL_PWD: decodeURIComponent(u.password) }),
       stdio: ['ignore', 'inherit', 'inherit'] });
  process.exit(r.status == null ? 1 : r.status);
});
if (!process.stdin.isTTY) process.stdin.resume();
