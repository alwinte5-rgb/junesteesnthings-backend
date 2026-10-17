/* The DTF bands the owner set on 2026-10-15: 1-4, 5-11, 12-24. Read from the
   generator's own dry run, so the statement it would write is what is checked. */
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { dejson } = require('../tools/lib/db');

const run = spawnSync(process.execPath, [path.join(__dirname, '../tools/reprice-anchorfish-2026.js'), '--only-dtf'],
  { encoding: 'utf8', input: '', env: { PATH: process.env.PATH } });
const stmt = (run.stdout.match(/^UPDATE lumise_printings SET calculate='([^']+)' WHERE id=1;$/m) || [])[1];

test('--only-dtf dry run writes method #1 and nothing else', () => {
  assert.strictEqual(run.status, 0, run.stderr);
  assert.ok(stmt, 'no DTF statement in the dry run');
  assert.strictEqual((run.stdout.match(/^UPDATE /gm) || []).length, 1);
});

test('small-run DTF bands are 1-4, 5-11, 12-24 at the owner\'s prices', () => {
  const v = dejson(stmt).values;
  const main = Object.fromEntries(Object.entries(v.id).map(([q, p]) => [q, p.price]));
  const add = Object.fromEntries(Object.entries(v.mr8a5dlx).map(([q, p]) => [q, p.price]));
  assert.deepStrictEqual([main['4'], main['11'], main['24']], ['23.20', '20.75', '18.30']);
  assert.deepStrictEqual([add['4'], add['11'], add['24']], ['5.95', '5.90', '5.85']);
  assert.strictEqual(main['3'], undefined, 'the old 1-3 band is gone');
});
