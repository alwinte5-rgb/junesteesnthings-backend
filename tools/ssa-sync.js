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

const { spawnSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const MYSQL = '/usr/local/opt/mysql-client/bin/mysql';

/* Days a product may go without live S&S pricing before it is deactivated.
   Two weeks covers an ordinary restock; a genuinely dead style never returns. */
const STALE_DAYS = 14;

/* A cost move bigger than this is treated as suspect and left for a human.
   Real supplier moves are pennies; a 40% jump is a feed problem. */
const PRICE_JUMP_GUARD = 0.40;

const CORE_SIZES = ['S', 'M', 'L', 'XL'];

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
  /* The thumbnail path is authoritative: it was written by a previous sync and
     names the style directly. */
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
  const bySize = {};
  let homeQty = 0, farQty = 0;
  for (const r of rows) {
    const size = r.sizeName;
    const cost = Number(r.piecePrice || r.casePrice || 0);
    if (!size || !cost) continue;
    if (!bySize[size] || cost < bySize[size]) bySize[size] = cost;
    /* Stock is judged on CORE sizes only: a style with nothing but 4XL in
       Illinois is not locally stocked for any order a customer will place. */
    if (!CORE_SIZES.includes(size)) continue;
    for (const w of r.warehouses || []) {
      if (w.warehouseAbbr === HOME_WAREHOUSE) homeQty += w.qty;
      else if (!NON_STOCK.includes(w.warehouseAbbr)) farQty += w.qty;
    }
  }
  if (!Object.keys(bySize).length) return null;
  return { bySize, homeQty, farQty };
}

/** The base cost the x2 rule applies to: cheapest CORE size, not cheapest size. */
function baseCost(bySize) {
  const core = CORE_SIZES.map((s) => bySize[s]).filter((n) => n > 0);
  return core.length ? Math.min(...core) : Math.min(...Object.values(bySize));
}

/* ── SQL plumbing ────────────────────────────────────────────────────────── */

function mysql(url, sql, { rows = false } = {}) {
  const u = new URL(url);
  const args = ['-h', u.hostname, '-P', u.port || '3306', '-u', decodeURIComponent(u.username),
    '--protocol=TCP', '--default-character-set=utf8mb4', '-e', sql,
    u.pathname.replace(/^\//, '') || 'railway'];
  const r = spawnSync(MYSQL, rows ? ['-B', ...args] : args, {
    env: Object.assign({}, process.env, { MYSQL_PWD: decodeURIComponent(u.password) }),
    encoding: 'utf8',
    stdio: rows ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) throw new Error('mysql exited ' + r.status);
  if (!rows) return null;
  const lines = r.stdout.trim().split('\n');
  if (lines.length < 2) return [];
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) => Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
}

const sq = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const money = (n) => Math.round(Number(n) * 100) / 100;

/* ── Main ────────────────────────────────────────────────────────────────── */

let buf = '';
process.stdin.on('data', (d) => (buf += d));
process.stdin.on('end', async () => {
  const env = JSON.parse(buf);
  const dbUrl = env.MYSQL_PUBLIC_URL || env.MYSQL_URL;
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
    "IFNULL(thumbnail_url,'') thumb, IFNULL(DATE_FORMAT(ssa_seen_at,'%Y-%m-%d'),'') seen " +
    'FROM lumise_products WHERE active=1 ORDER BY id;', { rows: true });

  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' — ' + products.length + ' active products\n');

  const stmts = [];
  const repriced = [], unchanged = [], suspicious = [], missing = [], unresolved = [];
  /* Products the API could not be reached for. Kept strictly apart from
     `missing`: one means S&S says there is nothing, the other means S&S did not
     answer, and only the first is evidence about the product. */
  const unreachable = [];
  /* Stocked far from Chicago. Reported so buying decisions can favour what
     ships cheaply, never used to change a price or hide a product. */
  const lowLocal = [];

  for (const p of products) {
    let style, bySize;
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
    const price = money(cost * 2);
    const was = Number(p.cost);
    const move = was > 0 ? Math.abs(cost - was) / was : 0;

    /* Every product with live pricing gets its tag and its seen-date, whether or
       not the cost moved — that timestamp is what the staleness rule reads. */
    const sets = [`supplier='ssa'`, `supplier_style_id=${style.id}`, 'ssa_seen_at=NOW()'];

    if (was > 0 && move > PRICE_JUMP_GUARD) {
      suspicious.push({ p, cost, price, move });
      stmts.push(`UPDATE lumise_products SET ${sets.join(', ')} WHERE id=${p.id};`);
      continue;                                    // tag it, but never reprice it
    }

    if (Math.abs(cost - was) >= 0.01) {
      repriced.push({ p, cost, price });
      sets.push(`supplier_cost=${cost}`, `price=${price}`, 'cost_updated=NOW()');
    } else {
      unchanged.push(p);
    }
    stmts.push(`UPDATE lumise_products SET ${sets.join(', ')} WHERE id=${p.id};`);
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
   * own deactivation marker are eligible. */
  const returned = mysql(dbUrl,
    "SELECT id, name, IFNULL(thumbnail_url,'') thumb FROM lumise_products " +
    "WHERE active=0 AND supplier='ssa' AND ssa_auto_off IS NOT NULL;", { rows: true });
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
        `supplier_cost=${cost}, price=${money(cost * 2)}, ssa_seen_at=NOW(), ` +
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
  if (revived.length) {
    console.log('BACK IN STOCK — reactivating (' + revived.length + ')');
    for (const r of revived) console.log('  #' + String(r.p.id).padStart(3) + '  ' + r.p.name);
    console.log();
  }

  console.log(unchanged.length + ' already correct · ' + repriced.length + ' repriced · ' +
    stale.length + ' deactivating · ' + revived.length + ' reactivating');
  console.log('\n' + stmts.length + ' statements' + (APPLY ? ' — APPLYING' : ' — dry run, pass --apply to write'));

  if (!APPLY || !stmts.length) process.exit(0);
  mysql(dbUrl, 'START TRANSACTION;\n' + stmts.join('\n') + '\nCOMMIT;');
  console.log('done.');
});
