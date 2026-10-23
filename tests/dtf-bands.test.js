/* The DTF bands: 1-4, 5-11, 12-24 (owner, 2026-10-15), 25-35 / 36-49 split
   and every step a real break (owner, 2026-10-19). Read from the
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

test('every DTF band is a real break, at the owner\'s 2026-10-19 prices', () => {
  const v = dejson(stmt).values;
  const main = Object.fromEntries(Object.entries(v.id).map(([q, p]) => [q, p.price]));
  const add = Object.fromEntries(Object.entries(v.mr8a5dlx).map(([q, p]) => [q, p.price]));
  assert.deepStrictEqual(['4', '11', '24', '35', '49', '99'].map((q) => main[q]),
    ['20.75', '18.75', '14.00', '13.00', '12.00', '11.00']);
  assert.deepStrictEqual(['4', '11', '24', '35', '49', '99'].map((q) => add[q]),
    ['5.95', '5.50', '5.25', '5.00', '4.80', '4.60']);
  assert.strictEqual(main['3'], undefined, 'the old 1-3 band is gone');
  /* The nickel this replaced: 1-4 and 5-11 were $20.75 / $20.75, so the
     quote form offered "2 more pieces" to save 5 cents. Every step on the
     main print must now save at least a dollar a piece. */
  const ceils = Object.keys(main).map(Number).sort((a, b) => a - b);
  for (let i = 1; i < ceils.length; i++) {
    const drop = Number(main[ceils[i - 1]]) - Number(main[ceils[i]]);
    if (ceils[i] <= 249) assert.ok(drop >= 1, 'main print drops only $' + drop.toFixed(2) + ' at <=' + ceils[i]);
  }
});
