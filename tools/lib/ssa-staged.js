/* Staged S&S blanks: added for the QUOTE FORM first, put live later.
 *
 * tools/ssa-add-products.js --staged writes a product switched off with
 * supplier='ssa-staged'. The designer's quote feed (jt-catalog.php) lists it;
 * the storefront, search and the designer loader do not. tools/publish-staged.js
 * checks its designer setup and makes it an ordinary live 'ssa' product.
 *
 * The two rules here are what keep a batch from going live by accident, so they
 * are functions the tests run rather than lines buried in the tool. */
const { sq } = require('./db');

const STAGED_SUPPLIER = 'ssa-staged';

/** Which WANTED rows a run adds. `core` is the hand-picked list, `batch` the
 *  generated streetwear rows. The batch is only ever added --staged: a plain
 *  `--apply` for one new core style must not put 180 unchecked styles live.
 *  Throws when --only names nothing at all, or names a batch row without
 *  --staged — never quietly widens or narrows what the operator asked for. */
function selectWanted(core, batch, { staged = false, only = [] } = {}) {
  const pool = staged ? [...core, ...batch] : core;
  if (!only.length) return pool;
  const want = new Set(only.map((s) => String(s).toUpperCase()));
  const list = pool.filter((w) => want.has(String(w[0]).toUpperCase()));
  if (!staged) {
    const batchHit = batch.filter((w) => want.has(String(w[0]).toUpperCase()));
    if (batchHit.length) throw new Error(batchHit.map((w) => w[0]).join(', ') + ' is in the streetwear batch — add it with --staged');
  }
  if (!list.length) throw new Error('--only matched no style: ' + [...want].join(', '));
  return list;
}

/* Where a new style sorts in the shop and the designer's product picker (both
   order by `order` ascending). The owner's hand-ranked basics are 1-45,
   tools/shop-order.js numbers the rest from 100 by section, and the one-off
   adders (signs, services, cutouts) sit at 997-999. A new style written as 1
   jumped ahead of every basic, which is how a $39 hoodie came to be the shop's
   second product; 900 puts it after the catalogue until shop-order.js files it. */
const NEW_PRODUCT_ORDER = 900;

const money = (n) => Math.round(Number(n) * 100) / 100;

/** The INSERT for one product. Staged: active=0, supplier='ssa-staged'. The
 *  NOT EXISTS on the style id makes a re-run add nothing twice. */
function productInsertSql({ name, price, thumb, stages, attributes, printings, styleID, cost, staged }) {
  const sid = Number(styleID);
  if (!Number.isFinite(sid) || sid <= 0) throw new Error('bad style id ' + styleID);
  return 'INSERT INTO lumise_products (name, price, product, thumbnail, thumbnail_url, template, ' +
    'description, stages, variations, attributes, printings, `order`, active, author, ' +
    'created, updated, supplier, supplier_style_id, supplier_cost, ssa_seen_at)\n' +
    '  SELECT ' + sq(name) + ', ' + money(price) + ", 0, '', " + sq(thumb) + ", '', '', " +
    sq(stages) + ", '', " + sq(attributes) + ', ' + sq(printings) +
    ', ' + NEW_PRODUCT_ORDER + ', ' + (staged ? 0 : 1) + ", '', NOW(), NOW(), " + sq(staged ? STAGED_SUPPLIER : 'ssa') + ', ' +
    sid + ', ' + money(cost) + ', NOW()\n' +
    '  FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM lumise_products ' +
    'WHERE supplier_style_id=' + sid + ') AS t);';
}

/** Ids from --only=, or throws on anything that is not a positive whole
 *  number. An empty or mistyped list must refuse, not mean "all of them". */
function parseIds(arg) {
  if (arg === undefined) return null;
  const parts = String(arg).split(',').map((s) => s.trim()).filter(Boolean);
  const bad = parts.filter((s) => !/^\d+$/.test(s) || Number(s) <= 0);
  if (!parts.length || bad.length) throw new Error('--only takes product ids, e.g. --only=358,374' + (bad.length ? ' (not ids: ' + bad.join(', ') + ')' : ''));
  return new Set(parts.map(Number));
}

module.exports = { STAGED_SUPPLIER, NEW_PRODUCT_ORDER, selectWanted, productInsertSql, parseIds };
