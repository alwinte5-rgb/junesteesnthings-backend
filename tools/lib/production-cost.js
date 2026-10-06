/* What a screen-print job COSTS the shop to make, two ways: sent to Anchorfish,
 * or pressed in-house with Transfer Express Goof Proof Premium transfers.
 *
 * Why it exists (2026-10-06): the owner's Anchorfish invoices (#16899, #18249)
 * showed a 1-colour white print on black billed as "2 Color" on every shirt plus
 * a screen for the base, while Premium transfers carry no base and no screens.
 * For #18249 — 100 black tees, white left chest + full back — that is $492 at
 * Anchorfish against about $283 pressed in-house. Large multi-colour prints go
 * the other way. The quote form shows both (internal only) so the cheaper way
 * is chosen job by job rather than by habit.
 *
 * `productionCompare` is shipped to the browser by its own source text, so it
 * must stay self-contained: no requires, no free variables, data passed in.
 *
 * PREMIUM PRICES — Transfer Express 2025 Price Guide, Goof Proof Premium (the
 * opaque one; standard Goof Proof shows through on dark shirts):
 *   Single images, ONE colour only, 25 minimum, per image.
 *   Gang sheets 12.5 x 17.5, vector (your artwork), 6-sheet minimum, per sheet.
 *   $15 flat shipping per order. No screen or setup fees.
 * Re-check against the current guide when Transfer Express reprices.
 */

const JC = require('./job-costs');

const PREMIUM = {
  shipping: 15,
  /* Quantity floors -> price per image. */
  single: {
    floors: [25, 50, 100, 150, 300, 500],
    small: [3.00, 1.69, 1.39, 0.99, 0.79, 0.69],   // 9 x 12.75 — left chest, sleeve
    large: [3.75, 1.89, 1.69, 1.29, 1.19, 1.09],   // 11 x 14 — full front/back
  },
  /* Sheet-count floors -> price per sheet, by ink colours 1..4. */
  gang: {
    floors: [6, 12, 18, 24, 36, 48, 60, 72, 90, 108, 144, 180, 216],
    1: [15.31, 8.27, 6.15, 5.19, 4.52, 3.69, 3.42, 3.12, 2.89, 2.66, 2.19, 2.09, 1.97],
    2: [28.04, 14.98, 11.18, 9.50, 7.96, 6.50, 5.97, 5.44, 5.06, 4.69, 4.11, 3.88, 3.61],
    3: [40.70, 21.76, 16.25, 13.77, 11.43, 9.28, 8.49, 7.68, 7.22, 6.75, 6.07, 5.70, 5.32],
    4: [53.25, 28.50, 21.32, 18.04, 14.87, 12.08, 11.02, 9.97, 9.40, 8.81, 8.00, 7.52, 7.03],
  },
  /* Images of one design per gang sheet, by size. A left chest or sleeve
     (about 3.5-4 inches) fits 12 to a 12.5 x 17.5 sheet; a full print, one. */
  perSheet: { small: 12, full: 1 },
};

/* What the browser needs, and nothing else. */
const DATA = {
  premium: PREMIUM,
  anchorfish: {
    screen: JC.SCREEN_PRINT, screenMin: JC.SCREEN_MIN_QTY, screenCost: JC.SCREEN_COST, dtf: JC.DTF,
  },
};

/**
 * input: { qty, dark, places: [{ loc, kind: 'screen'|'dtf'|'other', colours }] }
 * returns { anchorfish, premiumLow, premiumHigh } in dollars for the whole line,
 * or premium* null when a place cannot be made with Premium (5+ colours).
 * premiumLow treats the front as a left chest, premiumHigh as a full front;
 * the back is full size, sleeves small. Places that are not screen printed are
 * costed at Anchorfish in both.
 */
function productionCompare(input, data) {
  var q = Math.max(0, parseInt(input && input.qty, 10) || 0);
  if (!q) return null;
  var dark = !!(input && input.dark);
  var A = data.anchorfish, P = data.premium;
  function floorIdx(floors, n) { var k = -1; for (var i = 0; i < floors.length; i++) if (n >= floors[i]) k = i; return k; }
  function rowAt(table, n) {
    var keys = Object.keys(table).map(Number).sort(function (a, b) { return a - b; });
    var pick = keys[0];
    for (var i = 0; i < keys.length; i++) if (n >= keys[i]) pick = keys[i];
    return table[pick];
  }
  function cols(c) { var n = parseInt(c, 10); return n > 0 ? n : 1; }

  /* Anchorfish: screen print at colours (+ the base on dark), billed as their
     minimum under it, plus $20 a screen; DTF main print then additional. */
  function anchorScreen(c) {
    var billed = Math.max(q, A.screenMin);
    var n = Math.min(6, cols(c) + (dark ? 1 : 0));
    return rowAt(A.screen, billed)[n - 1] * billed + n * A.screenCost;
  }
  var dtfSeen = 0;
  function anchorDtf() {
    var row = rowAt(A.dtf, Math.max(1, q));
    var each = dtfSeen++ ? row[3] : row[1];
    return each * q;
  }

  /* Premium for one place: the cheaper of single images (1 colour only) and
     gang sheets, buying up to a cheaper tier when that costs less in total. */
  function cheapestBuy(floors, prices, need, perUnit) {
    var best = null;
    var cands = [need];
    for (var i = 0; i < floors.length; i++) if (floors[i] > need) cands.push(floors[i]);
    for (var j = 0; j < cands.length; j++) {
      var n = Math.max(cands[j], floors[0]);
      var k = floorIdx(floors, n);
      if (k < 0) continue;
      var cost = n * prices[k] * (perUnit || 1);
      if (best === null || cost < best) best = cost;
    }
    return best;
  }
  function premiumPlace(c, size) {
    var n = cols(c);
    if (n > 4) return null;
    var best = null;
    if (n === 1) best = cheapestBuy(P.single.floors, P.single[size === 'full' ? 'large' : 'small'], q, 1);
    var sheets = Math.ceil(q / P.perSheet[size]);
    var g = cheapestBuy(P.gang.floors, P.gang[n], sheets, 1);
    if (g !== null && (best === null || g < best)) best = g;
    return best;
  }

  var af = 0, low = 0, high = 0, premiumOk = true, anyScreen = false;
  var places = (input && input.places) || [];
  for (var i = 0; i < places.length; i++) {
    var p = places[i];
    if (p.kind === 'screen') {
      anyScreen = true;
      var a = anchorScreen(p.colours);
      af += a;
      var sizeHigh = (p.loc === 'left' || p.loc === 'right') ? 'small' : 'full';
      var sizeLow = (p.loc === 'back') ? 'full' : 'small';
      var hi = premiumPlace(p.colours, sizeHigh), lo = premiumPlace(p.colours, sizeLow);
      if (hi === null || lo === null) premiumOk = false;
      else { high += hi; low += lo; }
    } else if (p.kind === 'dtf') {
      var d = anchorDtf();
      af += d; low += d; high += d;
    }
  }
  if (!anyScreen) return { anchorfish: Math.round(af * 100) / 100, premiumLow: null, premiumHigh: null };
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  return {
    anchorfish: r2(af),
    premiumLow: premiumOk ? r2(low + P.shipping) : null,
    premiumHigh: premiumOk ? r2(high + P.shipping) : null,
  };
}

module.exports = { PREMIUM, DATA, productionCompare };
