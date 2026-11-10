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

test('--only-emb-logos dry run writes the four logo methods and nothing else', () => {
  assert.strictEqual(run.status, 0, run.stderr);
  assert.strictEqual((run.stdout.match(/^UPDATE /gm) || []).length, 4);
});

test('every logo size has a 36-49 band halfway between 25-35 and 50-74', () => {
  for (const id of ['8', '9', '10', '11']) {
    const p = prices(id);
    const mid = ((Number(p['35']) + Number(p['74'])) / 2).toFixed(2);
    assert.strictEqual(p['49'], mid, '#' + id + ' 36-49 halfway');
  }
});

/* Owner, 2026-11-10: logo prices lowered to the local market. */
test('logo prices are the owner\'s 2026-11-10 table, falling with quantity', () => {
  const want = {
    8:  ['18.00', '16.00', '14.00', '13.00', '12.00', '11.00', '10.00'],
    9:  ['25.00', '22.00', '19.00', '17.50', '16.00', '15.00', '14.00'],
    10: ['32.00', '29.00', '26.00', '24.50', '23.00', '22.00', '21.00'],
    11: ['60.00', '56.00', '52.00', '50.00', '48.00', '46.00', '45.00'],
  };
  for (const [id, w] of Object.entries(want)) {
    const p = prices(id);
    assert.deepStrictEqual(['11', '24', '35', '49', '74', '99', '1000'].map((q) => p[q]), w, '#' + id);
  }
});
