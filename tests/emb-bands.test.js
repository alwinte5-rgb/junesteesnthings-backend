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
  const want = { 8: ['25.00', '23.50', '22.00'], 9: ['36.00', '34.50', '33.00'],
    10: ['47.00', '45.50', '44.00'], 11: ['80.00', '78.50', '77.00'] };
  for (const [id, w] of Object.entries(want)) {
    const p = prices(id);
    assert.deepStrictEqual(['35', '49', '74'].map((q) => p[q]), w, '#' + id);
    assert.strictEqual(p['11'], (Number(w[0]) + 5).toFixed(2), '#' + id + ' 1-11 unchanged');
    assert.strictEqual(p['1000'], (Number(w[2]) - 2).toFixed(2), '#' + id + ' 100+ anchor unchanged');
  }
});
