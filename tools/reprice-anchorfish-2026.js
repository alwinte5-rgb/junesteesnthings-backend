#!/usr/bin/env node
/* Anchorfish 2026 repricing for the Lumise designer.
 *
 *   railway variables --service MySQL --json | node tools/reprice-anchorfish-2026.js
 *   railway variables --service MySQL --json | node tools/reprice-anchorfish-2026.js --apply
 *
 * Dry run by default: prints every price and every statement, writes nothing.
 * `--apply` snapshots lumise_printings to ~/jtees-backups/ first and aborts if
 * that snapshot fails — the backup is the only undo for live pricing.
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

const fs = require('fs');
const path = require('path');
const os = require('os');
const { colorTable } = require('./lib/screenprint');
const { urlFromStdinJson, mysql, enjson, sq } = require('./lib/db');
const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.join(os.homedir(), 'jtees-backups');

/** Snapshot lumise_printings before writing. This is live pricing; there is no
 *  undo without it. Every other tool in this directory does this; this one only
 *  claimed to, in a comment, while writing 20 UPDATEs to live prices. */
function backup(url, tag) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
    p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
  const rows = mysql(url, 'SELECT id, title, active, calculate FROM lumise_printings ORDER BY id;', { rows: true });
  if (!rows.length) throw new Error('lumise_printings read returned no rows — refusing to write');
  const head = Object.keys(rows[0]);
  const file = path.join(BACKUP_DIR, 'printings-backup-' + stamp + '-' + tag + '.tsv');
  fs.writeFileSync(file, [head.join('\t'),
    ...rows.map((r) => head.map((h) => r[h]).join('\t'))].join('\n') + '\n');
  console.log('  backed up ' + rows.length + ' printings rows to ' + file);
  return file;
}

/* ── Screen print (contracted to Anchorfish) ────────────────────────────── */

/* Their sheet, per piece, by colour count. Rows are quantity FLOORS; `ceil` is
   the band ceiling Lumise keys on. Minimum is 50 — the bands that used to start
   at 12 were the previous vendor's and contradicted the shop's own minimum.
   The markup falls with quantity because Anchorfish's cost curve is much
   flatter than the old vendor's while market price still drops steeply, so one
   multiple would either starve the small runs or lose the big bids. */
/* Markups repriced to market 2026-08-30, from a real contract invoice (#16899:
   62 shirts, 2 colours, 2 locations — $4.50/pc print, 4 screens at $20).
   At the old 4.40x a two-sided 2-colour job billed $27.44/pc against an $8.61
   cost: 69% margin, well above the $15-18 that job fetches, and — because the
   second location doubles a marked-up figure — MORE than the same job in DTF,
   which inverts the one advantage screen printing has at volume.
   The cut is deepest at the small end, where 4.40x was the outlier; the large
   bands were already thin and barely move. Nothing goes below 1.80x. */
/* Screens are NOT in this table. They are billed once per order as a separate
   fee (SCREEN_FEE below), because a screen is bought once however many pieces
   run through it — amortising it into a per-piece rate makes a 50-piece job
   subsidise a 500-piece one and hides the setup cost from the customer.

   So the markup IS the margin on the print itself: 1 - 1/mk. 2.13 anchors
   1 colour / 1 location / 50-99 on $3.85 (53.2%), and the curve settles to
   about 50.5% at volume, where competition is hardest.

   Cut from 2.34/2.30/2.26/2.24/2.22/2.22 on 2026-08-30. The old anchor put a
   100-piece two-location job at $14.64 a piece, which is the top of what this
   trade quotes for one colour on a Gildan 5000 — and the second location is
   already a full-rate charge here, because Anchorfish gives no shared-setup
   discount. Carrying a premium markup on top of that priced the shop out of
   exactly the two-sided work it wants. Every band moved by the same factor so
   the shape of the curve is unchanged; nothing goes below 2.00x.

   An earlier draft of this file folded (SCREEN_COST * colours) / band_floor
   into the base before applying the markup. That was written before screens
   became a separate fee; leaving it in would bill every screen twice. */
const SP = {
   50: { ceil:  99, mk: 2.13, p: [1.80, 2.25, 2.72, 3.19, 3.66, 4.13, 4.60] },
  100: { ceil: 249, mk: 2.09, p: [1.65, 2.06, 2.53, 3.00, 3.47, 3.94, 4.41] },
  250: { ceil: 499, mk: 2.05, p: [1.47, 1.84, 2.31, 2.78, 3.25, 3.72, 4.19] },
  500: { ceil: 999, mk: 2.03, p: [1.32, 1.65, 2.12, 2.59, 3.06, 3.53, 4.00] },
 1000: { ceil:2499, mk: 2.02, p: [1.17, 1.46, 1.93, 2.40, 2.87, 3.34, 3.81] },
 2500: { ceil:7000, mk: 2.02, p: [0.99, 1.24, 1.71, 2.18, 2.65, 3.12, 3.59] },
};
/* Anchorfish's actual per-SCREEN charge, confirmed on invoice #16899: 4 screens
   at $20 for a 2-colour job across 2 locations. Screens are therefore
   colours x LOCATIONS, not colours — the old $25/colour figure counted only
   colours, so every two-sided job under-recovered its setup. The invoice's
   "Ink: Base, White" line also proves the white underbase is its own screen,
   so a 1-colour design on a dark garment is a 2-screen job.

   Neither constant enters the per-piece table below. They are here because
   this tool is where the screen economics are written down, and because the
   sell price has to be changed in the same breath as the cost that justifies
   it. The charge itself is applied by the `screens` add-on in server.js. */
const SCREEN_COST = 20;   // what Anchorfish charges us, per screen
const SCREEN_FEE  = 35;   // what we bill, per screen, ONCE per order

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
/* Markups taper harder above 50 pieces (2026-08-30). At the old 3.6x, DTF at 100
   pieces cost $11.05 against a 1-colour screen print's $6.30 — so the full-colour
   convenience option was the DEAR one exactly where volume should make printing
   cheap, and the product page advertises the DTF ladder by default. Under 50 the
   markup stays at 4.0: small runs are labour-heavy per piece and screen printing
   cannot bid for them at all (50-piece minimum), so there is nothing to undercut.
   Above 50 DTF now lands just above a 2-colour screen job, which is the honest
   place for it — unlimited colours, no screens, no colour-count ceiling. */
const DTF = {
    1: { ceil:  11, mk: 3.70, v: [5.00, 7.03, 9.38, 1.80] },
   12: { ceil:  24, mk: 3.60, v: [3.23, 5.63, 7.50, 1.80] },
   25: { ceil:  49, mk: 3.50, v: [2.58, 4.50, 6.00, 1.50] },
   50: { ceil:  99, mk: 3.30, v: [2.73, 3.60, 4.80, 1.50] },
  100: { ceil: 249, mk: 3.10, v: [1.65, 3.06, 4.08, 1.35] },
  250: { ceil: 499, mk: 2.90, v: [1.47, 2.60, 3.47, 1.20] },
  500: { ceil: 999, mk: 2.75, v: [1.32, 2.21, 2.95, 1.11] },
 1000: { ceil:2499, mk: 2.60, v: [1.17, 1.88, 2.51, 1.05] },
 2500: { ceil:7000, mk: 2.50, v: [0.99, 1.60, 2.13, 1.02] },
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
 * The anchors are the 100+ price, NOT a flat rate. EMB_TAPER below lifts the
 * smaller runs above them; "$20 minimum" is honoured because nothing ever
 * prices under the anchor.
 */
const EMB_PRICE = { chest: 20.00, fullBack: 75.00 };

/* Embroidery tapers DOWN to those anchors rather than sitting flat on them.
 *
 * Flat pricing made embroidery the CHEAPER click below 50 pieces: a chest logo
 * was $20 against DTF's $22.55 at 12 pieces and $28.15 at one. That is exactly
 * backwards — a 12-piece embroidery run is the most labour-intensive job in the
 * shop per piece, and it was the bargain button. DTF starts high at low volume
 * and falls steeply, so the two curves crossed at 50.
 *
 * The uplift is a flat DOLLAR ADDITION, not a multiple. A multiple compounds up
 * the size ladder — 1.5x turns the $75 full back into $112.50 while the chest
 * only moves $10 — which prices the big pieces off the table at exactly the
 * quantities they are most often ordered in. Adding a fixed amount lifts every
 * size by the small-run premium and keeps the $11 step between sizes intact.
 *
 * $20 chest / $75 full back remain the 100+ price exactly as agreed; this only
 * lifts the small runs, where embroidery was cheaper than DTF.
 */
const EMB_TAPER = [   // band ceiling, dollars added to the anchor price
  [  11, 10 ],        // chest $30.00, full back $85.00
  [  24,  8 ],        // $28.00 / $83.00
  [  49,  5 ],        // $25.00 / $80.00
  [  74,  2 ],        // $22.00 / $77.00
  [  99,  1 ],        // $21.00 / $76.00
  [1000,  0 ],        // $20.00 / $75.00 — the agreed floor
];

/* Names and text are priced on their own, not fitted from the logo line.
 *
 * A logo is one design sewn N times; names are N different designs, each typed,
 * checked against a list and hooped on its own. The work barely falls with
 * quantity, so the taper is shallow and stops at 60% — deep volume pricing here
 * would sell an hour of setup for the price of a run. Bands start at 1-5
 * because that is the size most name jobs actually are.
 *
 * Raised from $10 to $20 on 2026-08-29. At $10 a name undercut DTF at every
 * quantity up to 250 — and a name is the most labour-heavy embroidery there is,
 * because each one is a separate design, a separate hooping and a separate
 * thread change. It was the cheapest button on the page for the slowest work.
 */
const NAME_BASE = { chest: 20.00, upperBack: 50.00 };
const NAME_TAPER = [   // band ceiling, share of the 1-5 price
  [   5, 1.000 ],      // $20.00 chest
  [  11, 0.900 ],      // $18.00
  [  24, 0.800 ],      // $16.00
  [  49, 0.700 ],      // $14.00
  [  74, 0.650 ],      // $13.00
  [  99, 0.625 ],      // $12.50
  [1000, 0.600 ],      // $12.00
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
  /* Logo prices are fitted from the vendor's stitch-band cost at the 1-24 row —
     the anchors describe that shape — then multiplied by the quantity taper, so
     the fitted relativity between sizes survives at every band. */
  return EMB_TAPER.map(([ceil, add]) =>
    [ceil, up05(embPrice(EMB[1][m.col]) + add)]);
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
/* `enjson` and `sq` come from ./lib/db — this file used to carry its own
   identical copies, which is the drift lib/db exists to prevent. */

/* Create the method if it is missing, and REPRICE it if it is already there.
 *
 * This was insert-only, guarded on the title not existing. That made the script
 * safe to re-run but also inert: once a method had been created, every later
 * price change silently skipped it. The upper-back name stayed at its original
 * $25 through a repricing that moved every other row, and the run reported
 * success — the guard was doing exactly what it said while quietly meaning
 * "never update this again".
 *
 * `active` is only set on insert, so a method the shop has switched on or off
 * by hand keeps that state through a reprice.
 */
function insertMethod(title, tiers) {
  return 'INSERT INTO lumise_printings (title, active, calculate, thumbnail, upload, description, author, created, updated)\n' +
    '  SELECT ' + sq(title) + ', 0, ' + sq(fixedCalc(tiers)) + ", '', '', '', '', NOW(), NOW()\n" +
    '  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_printings WHERE title=' +
    sq(title) + ') AS t);\n' +
    'UPDATE lumise_printings SET calculate=' + sq(fixedCalc(tiers)) +
    ', updated=NOW() WHERE title=' + sq(title) + ';';
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
console.log('Tapers to the anchors at 100+, lifted below that so embroidery is never\n' +
  'cheaper than DTF on a small run.\n');
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
const spPrice = (f, c) => up05(SP[f].p[c - 1] * SP[f].mk);
const spTiers = (c) => SPF.map((f) => [SP[f].ceil, spPrice(f, c)]);

console.log('\n\nSCREEN PRINT — Anchorfish 2026, print only. Screens are NOT in these rates:');
console.log('they bill once per order at $' + SCREEN_FEE + '/screen (cost $' + SCREEN_COST +
            '), screens = (colours + 1 on darks) x locations.');
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

/* The seven rows above are also sold as ONE `color`-type method, so the editor
 * can price from the colours in the finished design instead of asking for a
 * count first (tools/decorations-2026.js creates it; tools/lib/screenprint.js
 * does the pivot). It has to be repriced HERE, from the same numbers, or a
 * price change lands on the per-colour rows the quote form reads and never on
 * the combined row the store sells from — and the two answers to "what does a
 * 4-colour shirt cost" would drift apart with nothing reporting it.
 *
 * UPDATE only, matched by title: this does not create the method. If it has not
 * been built yet the statement changes nothing, so the two tools can be run in
 * either order.
 */
{
  const all = [...Object.values(SP_METHODS), ...SP_INSERTS]
    .map((m) => ({ colors: m.colors, tiers: spTiers(m.colors) }));
  const combined = enjson(colorTable(all));
  console.log('\n  The same prices are also written to the combined "Screen Printing" method,');
  console.log('  as columns 1-color..7-color plus a full-color backstop, so the editor can');
  console.log('  price from the design\'s own colour count.');
  stmts.push('UPDATE lumise_printings SET calculate=' + sq(combined) +
    ", updated=NOW() WHERE title='Screen Printing';");
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
  let url;
  try { url = urlFromStdinJson(buf); }
  catch (e) { console.error(e.message); process.exit(2); }

  /* Snapshot BEFORE the transaction, and let a failure here stop the run. The
     backup is the only undo; writing prices we cannot roll back is worse than
     not repricing today. */
  try { backup(url, 'pre-reprice'); }
  catch (e) { console.error('  backup FAILED, refusing to write: ' + e.message); process.exit(2); }

  const sql = 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;\n' +
    'SELECT id, title FROM lumise_printings WHERE id IN (7,8,9,10,11,12,15,16,17) ORDER BY id;';
  try { mysql(url, sql); }
  catch (e) { console.error(e.message); process.exit(1); }
  console.log('\n  TO UNDO: restore `calculate` from the backup named above.');
});
if (!process.stdin.isTTY) process.stdin.resume();
