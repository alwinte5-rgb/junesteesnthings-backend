#!/usr/bin/env node
/*
 * S&S Activewear catalogue sync.
 *
 *   railway variables --service Lumise_Designer --json | node tools/ssa-sync.js
 *   ... | node tools/ssa-sync.js --apply
 *
 * Every active product is resolved to an S&S style and repriced from live cost
 * using the shop's rule: sell price = cheapest core-size piece cost x 2.
 *
 * WHY THIS IS NOT JUST "WRITE THE NEW PRICE"
 * ------------------------------------------
 * S&S returns no pricing rows for a style whose SKUs are all out of stock, and
 * that is indistinguishable from a style being discontinued. Treating the first
 * empty response as "delete this product" would have deactivated ten sellers on
 * the day this was written, several of which are ordinary tank tops and polos
 * that will restock. So availability is REMEMBERED rather than acted on:
 * `ssa_seen_at` records the last time a product had live pricing, and only a
 * sustained absence deactivates. A product that comes back is reactivated on
 * its own. The designer's own size-sync tooling reasons the same way about
 * core sizes vanishing from the feed.
 *
 * Two guards on the money, because this writes storefront prices unattended:
 *   - a move larger than PRICE_JUMP_GUARD is reported and skipped, never
 *     written. A supplier feed glitch must not reprice the shop.
 *   - the x2 rule is applied to the CHEAPEST CORE SIZE (S/M/L/XL), so a
 *     stocked-out medium cannot silently reprice a product off its 4XL.
 */

/* mysql() and sq() come from ./lib/db. This file used to carry its own copies,
   and they had already drifted: the local row parser called .trim() on the whole
   result, which strips leading whitespace from the first column as well as the
   trailing newline. That is the drift lib/db exists to prevent. */
const { mysql, sq, mysqlUrlFrom, dejson, enjson } = require('./lib/db');
const { pieceCost, costBySize, baseCostOf, jumpHeld, readSizes, sizeOptions, colourStock, closedColours, CLOSEOUT_MIN } = require('./lib/ssa-costs');
const { sellPrice } = require('./lib/markup');
const { CORE_SIZES } = require('./lib/garments');

const APPLY = process.argv.includes('--apply');
/* --json=<file>: the run's decisions as data, for the owner's review page. */
const JSON_OUT = (process.argv.find((a) => a.startsWith('--json=')) || '').slice(7);

/* Days a product may go without live S&S pricing before it is deactivated.
   Two weeks covers an ordinary restock; a genuinely dead style never returns. */
const STALE_DAYS = 14;

/* A cost move bigger than this is treated as suspect and left for a human.
   Real supplier moves are pennies; a 40% jump is a feed problem. */
const PRICE_JUMP_GUARD = 0.40;

/* CORE_SIZES is lib/garments' copy. This file used to carry ['S','M','L','XL'],
   which made every cap and tote report NONE LOCAL. */

/* The shop is in Chicago 60657, so S&S's Lockport IL warehouse is ~35 miles
   away. Freight on blanks comes straight off margin and cannot be passed on,
   so a product stocked only in Nevada or Georgia is a worse product to sell
   than an equivalent one sitting in Illinois — regardless of its piece price.
   DS is dropship (ships from the manufacturer) and CN is Canada; neither is a
   local option, so neither counts as stock. */
const HOME_WAREHOUSE = 'IL';
const NON_STOCK = ['DS', 'CN'];
/* Below this many core-size pieces locally, an order is likely to be split or
   shipped long-haul. Reported, never acted on automatically — it is a buying
   signal for a person, not a reason to hide a product a customer wants. */
const LOCAL_STOCK_WARN = 500;

/* ── S&S API ─────────────────────────────────────────────────────────────── */

/* S&S throttles a sustained bulk sweep: 60 back-to-back calls measured 10x 503.
   Pace the requests rather than relying on retries to absorb it. */
const CALL_SPACING_MS = 350;
let lastCall = 0;

function makeClient(acct, key) {
  const auth = 'Basic ' + Buffer.from(acct + ':' + key).toString('base64');

  /* Returns the parsed body, or THROWS when the API could not be reached.
   *
   * The distinction is the whole point. An empty array means S&S answered and
   * has nothing; a throw means S&S never answered. Collapsing both to null —
   * which is what this did first — makes a throttled request look exactly like
   * a discontinued product, and with a deactivation rule attached that quietly
   * removes healthy products from the storefront. The catalogue's own
   * pricing-health.php carries the same warning about 429s.
   */
  return async function ssa(path, tries = 5) {
    let lastStatus = 0;
    for (let i = 0; i < tries; i++) {
      const wait = Math.max(0, lastCall + CALL_SPACING_MS - Date.now()) + (i ? 800 * i * i : 0);
      if (wait) await new Promise((r) => setTimeout(r, wait));   // 0, 0.8s, 3.2s, 7.2s, 12.8s
      lastCall = Date.now();
      try {
        const r = await fetch('https://api.ssactivewear.com/v2/' + path, {
          headers: { Authorization: auth }, signal: AbortSignal.timeout(25000),
        });
        lastStatus = r.status;
        if (r.status === 429 || r.status >= 500) continue;       // throttled — retry
        if (r.status === 404) return null;                       // answered: not there
        if (!r.ok) throw new Error('S&S returned ' + r.status + ' for ' + path);
        return await r.json();
      } catch (e) {
        if (e.message && e.message.startsWith('S&S returned')) throw e;
        lastStatus = lastStatus || 'network';                    // timeout — retry
      }
    }
    throw new Error('S&S unreachable after ' + tries + ' tries (last ' + lastStatus + '): ' + path);
  };
}

/** The S&S styleID for a product, or null. */
async function resolveStyle(ssa, p) {
  /* The COLUMN first. supplier_style_id is written by ssa-add-products at
     insert and by this sync afterwards; it is the actual record of which style
     this is. It used to be ignored here in favour of parsing the number back
     out of the thumbnail URL, which quietly made the catalogue PHOTO
     load-bearing for pricing: swap a product to its colourway shot — which is
     the correct photo, and what tools/resync-thumbnails.js now does — and the
     style could no longer be resolved at all. */
  if (p.sid && String(p.sid) !== '0') return { id: Number(p.sid), how: 'column' };

  /* Legacy rows with no column value: the thumbnail path still names the style
     when a previous sync wrote a Style image there. */
  const m = /\/Style\/(\d+)_/.exec(p.thumb || '');
  if (m) return { id: Number(m[1]), how: 'thumbnail' };

  /* Otherwise parse a style number out of the product name and confirm the
     brand, so Bella's 3001 cannot resolve to another brand's 3001. */
  const tokens = [...p.name.matchAll(/\b(?:BC|RS|NL|CC)?([A-Z]{0,4}\d{3,5}[A-Z]{0,3})\b/gi)]
    .map((x) => x[1]);
  const brandWord = p.name.trim().split(/[\s+]/)[0].toUpperCase();
  for (const token of tokens.reverse()) {          // the last token is usually the style
    const found = await ssa('styles/?search=' + encodeURIComponent(token));
    if (!Array.isArray(found)) continue;
    for (const s of found) {
      if (String(s.styleName).toUpperCase() === token.toUpperCase() &&
          String(s.brandName).toUpperCase().includes(brandWord)) {
        return { id: Number(s.styleID), how: 'name' };
      }
    }
  }
  return null;
}

/** Cheapest piece cost per size, plus local stock, or null if S&S has nothing. */
async function sizeCosts(ssa, styleId) {
  /* No `fields=` filter. Asking for `warehouses` through it returns the array
     with warehouseAbbr and qty STRIPPED OUT, which reads as "nothing in stock
     anywhere" rather than as a malformed response — every product looked
     locally unstocked. The full record is bigger but it is the only shape that
     carries the stock levels. */
  const rows = await ssa('products/?styleid=' + styleId);
  if (!Array.isArray(rows) || !rows.length) return null;
  /* WHICH PRICE, AND WHOSE.
   *
   * piecePrice is S&S's LIST price. customerPrice is what this account
   * actually pays, and on a Gildan 18600 that is $18.67 against $14.92 — the
   * shop was marking up from a number it never pays, so every S&S garment in
   * the catalogue sold at about 2.5x cost while the rule says 2x. A full-zip
   * hoodie listed at $37.34 that should be $31.62.
   *
   * SALES. customerPrice already IS the sale price while a sale runs (the
   * 18600 figures above were a sale), and the list price otherwise: this
   * account has no standing discount (25 live styles checked, 2026-10-18).
   * The owner wants sales passed on, so they are — except inside the last
   * SALE_BUFFER_DAYS of a sale, where lib/ssa-costs pieceCost() costs the row
   * at list, so an order taken at the sale price is not bought after it ends.
   */
  /* pieceCost is lib/ssa-costs': what the account pays, sale included unless
     the sale ends within SALE_BUFFER_DAYS (then list). */

  /* COLOURS ARE NOT ALL THE SAME PRICE, and the cheapest is not the typical
   * one. On that same hoodie, White is $14.92 and the other FIFTEEN colours
   * are $15.81 — so pricing the style off its cheapest colour prices 15 of 16
   * garments off one the customer is not buying. The MEDIAN colour per size is
   * the typical garment: lib/ssa-costs costBySize(), shared with
   * ssa-add-products and the catalogue audit.
   *
   * listBySize is the same at S&S's list price, sale ignored: the jump guard
   * reads it, so the return to list when a sale ends is not mistaken for a
   * feed glitch.
   */
  let homeQty = 0, farQty = 0;
  for (const r of rows) {
    /* Stock is judged on CORE sizes only: a style with nothing but 4XL in
       Illinois is not locally stocked for any order a customer will place. */
    if (!CORE_SIZES.includes(r.sizeName) || !pieceCost(r)) continue;
    for (const w of r.warehouses || []) {
      if (w.warehouseAbbr === HOME_WAREHOUSE) homeQty += w.qty;
      else if (!NON_STOCK.includes(w.warehouseAbbr)) farQty += w.qty;
    }
  }
  const bySize = costBySize(rows);
  if (!Object.keys(bySize).length) return null;
  const listBySize = costBySize(rows, Date.now(), { list: true });
  /* The earliest end date of any core-size sale, for the report. */
  const ends = rows.filter((r) => CORE_SIZES.includes(r.sizeName) && r.saleExpiration)
    .map((r) => String(r.saleExpiration).slice(0, 10)).sort()[0] || null;
  return { bySize, listBySize, homeQty, farQty, saleEnds: ends, colours: colourStock(rows) };
}

/* The base cost the markup applies to — cheapest CORE size, else cheapest size —
   is lib/ssa-costs baseCostOf(), shared with ssa-add-products and the audit. */
const baseCost = baseCostOf;

/* ── SQL plumbing ────────────────────────────────────────────────────────── */

const money = (n) => Math.round(Number(n) * 100) / 100;

/* ── Main ────────────────────────────────────────────────────────────────── */

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', async () => {
  const env = JSON.parse(buf);
  const dbUrl = mysqlUrlFrom(env);
  const acct = env.SSA_ACCOUNT, key = env.SSA_API_KEY;
  if (!acct || !key) { console.error('SSA_ACCOUNT / SSA_API_KEY are not set'); process.exit(2); }
  if (!dbUrl) { console.error('no MySQL URL in the piped variables'); process.exit(2); }
  const ssa = makeClient(acct, key);

  /* Remembering when a product last had live pricing is what makes a stock-out
     distinguishable from a discontinuation. Added by hand rather than with
     ADD COLUMN IF NOT EXISTS, which MySQL (unlike MariaDB) does not support —
     this has to stay safe to run every hour. */
  const cols = mysql(dbUrl, "SHOW COLUMNS FROM lumise_products;", { rows: true })
    .map((c) => c.Field);
  const need = [];
  if (!cols.includes('ssa_seen_at')) need.push('ADD COLUMN ssa_seen_at DATETIME NULL');
  /* Marks a deactivation as THIS TOOL's, so reactivation can never resurrect a
     product a person switched off on purpose. */
  if (!cols.includes('ssa_auto_off')) need.push('ADD COLUMN ssa_auto_off DATETIME NULL');
  /* A hold placed by a PERSON, and the reason reactivation cannot be trusted to
     ssa_auto_off alone. The August batch was held by setting ssa_auto_off, which
     is this tool's own marker — the one column it is entitled to clear. Nothing
     released those 46 only because the sync was never running; a working sync
     would have put every one of them on the storefront, unreviewed. */
  if (!cols.includes('held_for_review')) need.push('ADD COLUMN held_for_review DATETIME NULL');
  if (need.length) {
    /* `created` carries a legacy '0000-00-00' default that strict mode refuses
       to revalidate during an ALTER. Relaxing the mode for this one statement
       adds the column without rewriting a default the rest of the app relies
       on — the alternative is changing a column this tool has no business
       touching. */
    mysql(dbUrl, "SET SESSION sql_mode='';\n" +
      'ALTER TABLE lumise_products ' + need.join(', ') + ';');
    console.log('schema: ' + need.join(', ') + '\n');
  }

  const products = mysql(dbUrl,
    "SELECT id, name, IFNULL(supplier,'') supplier, IFNULL(supplier_cost,0) cost, price, " +
    "IFNULL(thumbnail_url,'') thumb, IFNULL(supplier_style_id,0) sid, " +
    "IFNULL(DATE_FORMAT(ssa_seen_at,'%Y-%m-%d'),'') seen, IFNULL(attributes,'') attributes " +
    /* Staged blanks (supplier='ssa-staged', switched off, quote form only) are
       re-costed too: the quote form sells them, and publish-staged.js would
       otherwise put one live at the cost it had the day it was added. */
    "FROM lumise_products WHERE active=1 OR supplier='ssa-staged' ORDER BY id;", { rows: true });

  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + products.length + ' active products\n');

  const stmts = [];
  const repriced = [], unchanged = [], suspicious = [], missing = [], unresolved = [];
  /* Size fields rebuilt from today's per-size cost: the upcharges were set once
     when a product was added and never again, so 34 products sold 2XL+ under
     cost on 2026-10-18, and 146 lacked the size list entirely. */
  const resized = [];
  /* A size field whose stored JSON cannot be read: reported, never rewritten. */
  const unreadable = [];
  /* The shop's own products — no supplier, no S&S style (banners, buttons,
     cutouts, cards). They will never match a style, and reporting them every
     night as NOT ON S&S sent the "needs a look" email daily for nothing: the
     alert that trains people to ignore the next one (9 of them, 2026-09-26).
     Listed quietly instead, and never looked up. */
  const ownProducts = [];
  /* Products the API could not be reached for. Kept strictly apart from
     `missing`: one means S&S says there is nothing, the other means S&S did not
     answer, and only the first is evidence about the product. */
  const unreachable = [];
  /* Stocked far from Chicago. Reported so buying decisions can favour what
     ships cheaply, never used to change a price or hide a product. */
  const lowLocal = [];
  /* Colours S&S is clearing out, dropped once a core size is under
     CLOSEOUT_MIN (lib/ssa-costs closedColours); and the products left with
     none, retired for good. */
  const droppedColours = [], retired = [];

  for (const p of products) {
    let style, bySize;
    if (!p.supplier && !Number(p.sid)) { ownProducts.push(p); continue; }
    try {
      style = await resolveStyle(ssa, p);
      if (!style) { unresolved.push(p); continue; }
      bySize = await sizeCosts(ssa, style.id);
    } catch (e) {
      unreachable.push({ p, why: e.message });
      continue;
    }
    if (!bySize) { missing.push(p); continue; }

    if (bySize.homeQty < LOCAL_STOCK_WARN) {
      lowLocal.push({ p, home: bySize.homeQty, far: bySize.farQty });
    }
    const cost = money(baseCost(bySize.bySize));
    const price = sellPrice(cost);
    const was = Number(p.cost);
    const move = was > 0 ? Math.abs(cost - was) / was : 0;
    /* A sale ending passes the guard; nothing else over it does (lib/ssa-costs). */
    const listCost = money(baseCost(bySize.listBySize));

    /* Every product with live pricing gets its tag and its seen-date, whether or
       not the cost moved — that timestamp is what the staleness rule reads. */
    /* A staged row keeps its tag: turning it into 'ssa' here would make it an
       ordinary product without publish-staged.js's designer checks. */
    const sets = [p.supplier === 'ssa-staged' ? `supplier='ssa-staged'` : `supplier='ssa'`,
      `supplier_style_id=${style.id}`, 'ssa_seen_at=NOW()'];

    if (jumpHeld(was, cost, listCost, PRICE_JUMP_GUARD)) {
      suspicious.push({ p, cost, price, move, saleEnds: bySize.saleEnds });
      stmts.push(`UPDATE lumise_products SET ${sets.join(', ')} WHERE id=${p.id};`);
      continue;                                    // tag it, but never reprice it
    }

    const attrs = dejson(p.attributes);
    let attrsChanged = false, retire = false;
    const sz = readSizes(attrs);
    if (sz && sz.values.unreadable) unreadable.push(p);
    else if (sz && Array.isArray(sz.values.multiple_options)) {
      const vals = sz.values;
      const next = sizeOptions(vals, bySize.bySize, cost);
      if (JSON.stringify(next) !== JSON.stringify(vals)) {
        attrs[sz.key] = { ...attrs[sz.key], values: sz.asString ? JSON.stringify(next) : next };
        attrsChanged = true;
        resized.push({ p, before: vals, after: next });
      }
    }

    /* Discontinued colours come off the product. The dropped options are kept
       on the field (jt_dropped, with the date) so a person can put one back. */
    const ck = Object.keys(attrs || {}).find((k) => attrs[k] && attrs[k].type === 'product_color');
    if (ck) {
      let cv = attrs[ck].values; const cvStr = typeof cv === 'string';
      if (cvStr) { try { cv = JSON.parse(cv); } catch { cv = null; } }
      const drop = cv && Array.isArray(cv.options) ? closedColours(cv.options, bySize.colours || {}) : [];
      if (drop.length) {
        const keep = cv.options.filter((o) => !drop.includes(o.title));
        if (!keep.length) {
          retire = true;                             // nothing left to sell: the product goes, the field stays
        } else {
          if (!keep.some((o) => o.default === '1' || o.default === true)) keep[0] = { ...keep[0], default: '1' };
          const today = new Date().toISOString().slice(0, 10);
          const next = { ...cv, options: keep,
            jt_dropped: (cv.jt_dropped || []).concat(cv.options.filter((o) => drop.includes(o.title)).map((o) => ({ ...o, default: '', dropped: today }))) };
          attrs[ck] = { ...attrs[ck], values: cvStr ? JSON.stringify(next) : next };
          attrsChanged = true;
        }
        droppedColours.push({ p, colours: drop, left: keep.length });
      }
    }
    if (attrsChanged) {
      /* Written only if the field is still what this run read: the run
         takes minutes of S&S calls, and an edit made in admin meanwhile
         must not be overwritten with this run's older copy. */
      sets.push('attributes=IF(attributes=' + sq(p.attributes) + ', ' + sq(enjson(attrs)) + ', attributes)');
    }
    if (retire) retired.push(p);

    if (Math.abs(cost - was) >= 0.01) {
      repriced.push({ p, cost, price, saleEnds: bySize.saleEnds });
      sets.push(`supplier_cost=${cost}`, `price=${price}`, 'cost_updated=NOW()');
    } else if (!resized.length || resized[resized.length - 1].p !== p) {
      unchanged.push(p);                         // a rebuilt size field is not "already correct"
    }
    stmts.push(`UPDATE lumise_products SET ${sets.join(', ')} WHERE id=${p.id};`);
    /* Retired: off the storefront AND the quote form, and out of the daily
       sync and its reactivation (both read only 'ssa' / 'ssa-staged'). Set
       supplier back to 'ssa' by hand to bring one back. */
    if (retire) stmts.push(`UPDATE lumise_products SET active=0, ssa_auto_off=NOW(), supplier='ssa-retired' WHERE id=${p.id};`);
  }

  /* Deactivate only what has been unavailable for a sustained period. A product
     seen today, or never seen because this is the first run, is left alone. */
  const stale = missing.filter((p) => {
    if (!p.seen) return false;                     // never recorded — give it a cycle
    const days = (Date.now() - Date.parse(p.seen)) / 86400000;
    return days >= STALE_DAYS;
  });
  for (const p of stale) {
    stmts.push(`UPDATE lumise_products SET active=0, ssa_auto_off=NOW() WHERE id=${p.id};`);
  }

  /* Bring back only what THIS TOOL switched off.
   *
   * Not everything inactive is inactive by accident. The catalogue holds
   * deliberately disabled duplicates — a second Richardson 112 with the same
   * name as the live one, an older Bella 3001, an older Next Level 3600 — and
   * an earlier version of this reactivated all three, because they are real
   * S&S styles that are perfectly in stock. Being purchasable is not evidence
   * that a person wants it on the storefront. Only rows carrying this tool's
   * own deactivation marker are eligible, and never one a person is holding:
   * `held_for_review` outranks the marker in both directions. */
  const returned = mysql(dbUrl,
    "SELECT id, name, IFNULL(thumbnail_url,'') thumb FROM lumise_products " +
    "WHERE active=0 AND supplier='ssa' AND ssa_auto_off IS NOT NULL " +
    "AND held_for_review IS NULL;", { rows: true });
  const revived = [];
  for (const p of returned) {
    try {
      const style = await resolveStyle(ssa, p);
      if (!style) continue;
      const bySize = await sizeCosts(ssa, style.id);
      if (!bySize) continue;
      const cost = money(baseCost(bySize.bySize));
      revived.push({ p, cost });
      stmts.push(`UPDATE lumise_products SET active=1, ssa_auto_off=NULL, ` +
        `supplier_cost=${cost}, price=${sellPrice(cost)}, ssa_seen_at=NOW(), ` +
        `cost_updated=NOW() WHERE id=${p.id};`);
    } catch { /* unreachable: leave it deactivated, try again tomorrow */ }
  }

  /* ── Report ─────────────────────────────────────────────────────────────── */

  if (repriced.length) {
    console.log('REPRICED (' + repriced.length + ')');
    for (const r of repriced) {
      console.log('  #' + String(r.p.id).padStart(3) + '  ' + r.p.name.slice(0, 44).padEnd(46) +
        '$' + Number(r.p.cost).toFixed(2) + ' -> $' + r.cost.toFixed(2) +
        '   sells $' + r.price.toFixed(2));
    }
    console.log();
  }
  if (unreadable.length) {
    console.log('SIZE FIELD UNREADABLE (' + unreadable.length + ') — left as it is, fix by hand');
    for (const p of unreadable) console.log('  #' + String(p.id).padStart(3) + '  ' + p.name);
    console.log('');
  }
  if (resized.length) {
    console.log('SIZES REBUILT (' + resized.length + ') — size list and extra charges from today\'s cost');
    for (const r of resized) {
      const fmt = (v) => (v.multiple_options || []).filter((o) => Number(o.price) > 0)
        .map((o) => (o.title || o.value) + ' +' + Number(o.price).toFixed(2)).join(' ') || 'no extra charges';
      console.log('  #' + String(r.p.id).padStart(3) + '  ' + r.p.name.slice(0, 44).padEnd(46) +
        (r.before.type !== 'multiple' && r.after.type === 'multiple' ? '[now a size list] ' : '') + fmt(r.after));
    }
    console.log();
  }
  if (suspicious.length) {
    console.log('SKIPPED — cost moved more than ' + Math.round(PRICE_JUMP_GUARD * 100) + '% (' +
      suspicious.length + '). Tagged, never repriced; check these by hand.');
    for (const s of suspicious) {
      console.log('  #' + String(s.p.id).padStart(3) + '  ' + s.p.name.slice(0, 44).padEnd(46) +
        '$' + Number(s.p.cost).toFixed(2) + ' -> $' + s.cost.toFixed(2) +
        '   (' + Math.round(s.move * 100) + '%)');
    }
    console.log();
  }
  if (missing.length) {
    console.log('NO LIVE PRICING (' + missing.length + ') — out of stock, or gone');
    for (const p of missing) {
      const days = p.seen ? Math.floor((Date.now() - Date.parse(p.seen)) / 86400000) : null;
      console.log('  #' + String(p.id).padStart(3) + '  ' + p.name.slice(0, 44).padEnd(46) +
        (days === null ? 'first seen this run' :
         days >= STALE_DAYS ? 'unavailable ' + days + 'd -> DEACTIVATING' :
         'unavailable ' + days + 'd (of ' + STALE_DAYS + ')'));
    }
    console.log();
  }
  if (unresolved.length) {
    console.log('NOT ON S&S (' + unresolved.length + ') — never matched a style');
    for (const p of unresolved) console.log('  #' + String(p.id).padStart(3) + '  ' + p.name);
    console.log();
  }
  if (ownProducts.length) {
    // Deliberately worded so the nightly run's "needs a look" filter ignores it.
    console.log('Shop-made, priced by hand (' + ownProducts.length + ') — no supplier, not synced');
    for (const p of ownProducts) console.log('  #' + String(p.id).padStart(3) + '  ' + p.name);
    console.log();
  }
  if (unreachable.length) {
    /* Reported loudly and counted nowhere. These products are NOT evidence of
       anything — S&S simply did not answer for them this run. */
    console.log('COULD NOT REACH S&S (' + unreachable.length + ') — left untouched, retried next run');
    for (const u of unreachable) {
      console.log('  #' + String(u.p.id).padStart(3) + '  ' + u.p.name.slice(0, 44).padEnd(46) +
        u.why.slice(0, 40));
    }
    console.log();
  }
  if (lowLocal.length) {
    console.log('STOCKED AWAY FROM ' + HOME_WAREHOUSE + ' (' + lowLocal.length +
      ') — freight the shop cannot pass on');
    for (const l of lowLocal.sort((a, b) => a.home - b.home)) {
      console.log('  #' + String(l.p.id).padStart(3) + '  ' + l.p.name.slice(0, 44).padEnd(46) +
        String(l.home).padStart(7) + ' local ' + String(l.far).padStart(8) + ' elsewhere' +
        (l.home === 0 ? '   NONE LOCAL' : ''));
    }
    console.log();
  }
  if (droppedColours.length) {
    console.log('DISCONTINUED COLOURS DROPPED (' + droppedColours.length + ') — closeout at S&S, a core size under ' + CLOSEOUT_MIN);
    for (const d of droppedColours) {
      console.log('  #' + String(d.p.id).padStart(3) + '  ' + d.p.name.slice(0, 44).padEnd(46) + d.colours.join(', ') +
        (d.left ? '   (' + d.left + ' left)' : '   -> NO COLOURS LEFT, RETIRED'));
    }
    console.log();
  }
  if (revived.length) {
    console.log('BACK IN STOCK — reactivating (' + revived.length + ')');
    for (const r of revived) console.log('  #' + String(r.p.id).padStart(3) + '  ' + r.p.name);
    console.log();
  }

  console.log(unchanged.length + ' already correct · ' + repriced.length + ' repriced · ' + resized.length + ' sizes rebuilt · ' +
    stale.length + ' deactivating · ' + revived.length + ' reactivating · ' +
    droppedColours.length + ' with colours dropped · ' + retired.length + ' retired');
  console.log('\n' + stmts.length + ' statements' + (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));

  if (JSON_OUT) {
    const row = (p) => ({ id: Number(p.id), name: p.name, cost: Number(p.cost), price: Number(p.price) });
    require('fs').writeFileSync(JSON_OUT, JSON.stringify({
      repriced: repriced.map((r) => ({ ...row(r.p), newCost: r.cost, newPrice: r.price, saleEnds: r.saleEnds || null })),
      resized: resized.map((r) => ({ ...row(r.p), before: r.before, after: r.after })),
      unreadable: unreadable.map(row),
      suspicious: suspicious.map((s) => ({ ...row(s.p), newCost: s.cost, newPrice: s.price, move: s.move, saleEnds: s.saleEnds || null })),
      droppedColours: droppedColours.map((d) => ({ ...row(d.p), colours: d.colours, left: d.left })),
    }, null, 1));
  }
  if (!APPLY || !stmts.length) process.exit(0);
  mysql(dbUrl, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
});
