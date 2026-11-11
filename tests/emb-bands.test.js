/* Embroidery logo bands: 25-49 split at 36 to match DTF (owner, 2026-10-23).
   Read from the generator's own dry run, so the statements it would write are
   what is checked. */
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { dejson } = require('../tools/lib/db');

const run = spawnSync(process.execPath, [path.join(__dirname, '../tools/reprice-anchorfish-2026.js'), '--only-emb-logos'],
  { encoding: 'utf8', input: '', env: { PATH: process.env.PATH } });
const prices = (id) => {
  const m = run.stdout.match(new RegExp("^UPDATE lumise_printings SET title='[^']*', calculate='([^']+)' WHERE id=" + id + ';$', 'm'));
  assert.ok(m, 'no statement for #' + id);
  const v = dejson(m[1]).values;
  const stage = v[Object.keys(v)[0]];
  return Object.fromEntries(Object.entries(stage).map(([q, p]) => [q, p.price]));
};

test('--only-emb-logos dry run writes the five logo methods and nothing else', () => {
  assert.strictEqual(run.status, 0, run.stderr);
  // #8-#11 by id, plus Extra Large by title (insert if missing, then update).
  assert.strictEqual((run.stdout.match(/^UPDATE lumise_printings SET title=/gm) || []).length, 4);
  assert.strictEqual((run.stdout.match(/^INSERT INTO lumise_printings/gm) || []).length, 1);
  assert.ok(/WHERE title='Embroidery — Extra Large Logo \(14k–22k stitches\)';$/m.test(run.stdout), 'XL update');
  assert.ok(!/ WHERE id=1;$/m.test(run.stdout), 'no DTF write');
});

const xlPrices = () => {
  const m = run.stdout.match(/^UPDATE lumise_printings SET calculate='([^']+)', updated=NOW\(\) WHERE title='Embroidery — Extra Large Logo/m);
  assert.ok(m, 'no XL statement');
  const v = dejson(m[1]).values;
  return Object.fromEntries(Object.entries(v[Object.keys(v)[0]]).map(([q, p]) => [q, p.price]));
};
const logo = (id) => (id === 'xl' ? xlPrices() : prices(id));
const BANDS = ['11', '24', '35', '49', '74', '99', '1000'];

test('every logo size has a 36-49 band halfway between 25-35 and 50-74', () => {
  for (const id of ['8', '9', '10', 'xl', '11']) {
    const p = logo(id);
    const mid = ((Number(p['35']) + Number(p['74'])) / 2).toFixed(2);
    assert.strictEqual(p['49'], mid, '#' + id + ' 36-49 halfway');
  }
});

/* Owner, 2026-11-10: logo prices lowered to the local market. Small 1-11 is
   $21 (not $18) so it stays above DTF; XL sits between Large and Full back. */
test('logo prices are the owner\'s 2026-11-10 table, falling with quantity', () => {
  const want = {
    8:  ['21.00', '16.00', '14.00', '13.00', '12.00', '11.00', '10.00'],
    9:  ['25.00', '22.00', '19.00', '17.50', '16.00', '15.00', '14.00'],
    10: ['32.00', '29.00', '26.00', '24.50', '23.00', '22.00', '21.00'],
    xl: ['45.00', '42.00', '39.00', '37.50', '36.00', '35.00', '34.00'],
    11: ['60.00', '56.00', '52.00', '50.00', '48.00', '46.00', '45.00'],
  };
  for (const [id, w] of Object.entries(want)) {
    const p = logo(id);
    assert.deepStrictEqual(BANDS.map((q) => p[q]), w, '#' + id);
  }
});

test('sizes stay in order at every quantity: Small < Medium < Large < XL < Full back', () => {
  const order = ['8', '9', '10', 'xl', '11'].map(logo);
  for (const q of BANDS) {
    for (let k = 1; k < order.length; k++) {
      assert.ok(Number(order[k][q]) > Number(order[k - 1][q]), 'band to ' + q + ', size ' + k);
    }
  }
});

/* The tool itself refuses a table that breaks the size or DTF rule
   (checkLogoRules), so the full dry run, DTF included, must exit cleanly. That
   alone cannot catch a broken checkLogoRules, so the DTF rule is also checked
   here on its own, from the DTF statement the dry run would write. */
test('no logo is cheaper than a DTF main print at the same quantity', () => {
  const full = spawnSync(process.execPath, [path.join(__dirname, '../tools/reprice-anchorfish-2026.js')],
    { encoding: 'utf8', input: '', env: { PATH: process.env.PATH } });
  assert.strictEqual(full.status, 0, full.stderr);
  const m = full.stdout.match(/^UPDATE lumise_printings SET calculate='([^']+)' WHERE id=1;$/m);
  assert.ok(m, 'no DTF statement');
  const main = Object.entries(dejson(m[1]).values.id).map(([c, p]) => [Number(c), Number(p.price)])
    .sort((a, b) => a[0] - b[0]);
  assert.ok(main.length && main[main.length - 1][0] >= 1000, 'DTF table reaches 1000');
  const at = (tiers, q) => (tiers.find(([c]) => q <= c) || [])[1];
  for (const id of ['8', '9', '10', 'xl', '11']) {
    const t = Object.entries(logo(id)).map(([c, p]) => [Number(c), Number(p)]).sort((a, b) => a[0] - b[0]);
    for (let q = 1; q <= 1000; q++) {
      const dtf = at(main, q), emb = at(t, q);
      assert.ok(dtf != null && emb != null, id + ' at ' + q + ' has no price');
      assert.ok(emb >= dtf, id + ' at ' + q);
    }
  }
});

test('the logo table prints in size order, Extra Large between Large and Full back', () => {
  const rows = run.stdout.split('\n').filter((l) => /^\s+(\d+|NEW)\s+(Small|Medium|Large|Full|Extra)/.test(l))
    .map((l) => l.trim().split(/\s+/)[0]);
  assert.deepStrictEqual(rows, ['8', '9', '10', 'NEW', '11']);
});
