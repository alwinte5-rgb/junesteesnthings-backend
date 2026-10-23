/* A product with no stock anywhere at S&S comes off the shop on the next run,
   not after 14 days (owner, 2026-10-22: "What if somebody buys"). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ssa-sync.js'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('stock is counted at every warehouse, dropship and Canada included', () => {
  assert.match(src, /allQty \+= Number\(w\.qty\) \|\| 0;/);
  assert.match(src, /return \{ bySize, listBySize, homeQty, farQty, allQty,/);
});

test('a live S&S product with no stock is switched off the same run; staged rows and Bella+Canvas are not', () => {
  assert.match(src, /if \(!bySize\.allQty && p\.supplier === 'ssa' && !atSanMar\(p\.name\)\) soldOut\.push\(p\);/);
  assert.match(src, /for \(const p of soldOut\) stmts\.push\(`UPDATE lumise_products SET active=0, ssa_auto_off=NOW\(\) WHERE id=\$\{p\.id\};`\);/,
    'ssa_auto_off marks it as the sync\'s own, so revival can bring it back');
});

test('more than SOLD_OUT_MAX sold out in one run is held as a feed problem', () => {
  assert.match(src, /const SOLD_OUT_MAX = 10;/);
  assert.match(src, /const soldOutHeld = soldOut\.length > SOLD_OUT_MAX;\n  if \(!soldOutHeld\) \{/);
  assert.match(src, /'SKIPPED — ' \+ soldOut\.length/, 'the held run says SKIPPED, which emails the shop');
});

test('revival waits for stock, not just a price', () => {
  assert.match(src, /if \(!bySize \|\| !bySize\.allQty\) continue;/);
});

test('sold out, dropped colours and retired products all email the shop', () => {
  const m = /\/(SKIPPED\|[^/]+)\/\.test\(l\)/.exec(server);
  assert.ok(m, 'the notable-line filter is in server.js');
  const re = new RegExp(m[1]);
  for (const line of ['SOLD OUT AT S&S — switched off until stock returns (1)', 'DISCONTINUED COLOURS DROPPED (2) — closeout',
    '  #266  Comfort Colors 4017   -> NO COLOURS LEFT, RETIRED', 'BACK IN STOCK — reactivating (1)']) {
    assert.ok(re.test(line), line);
  }
  assert.ok(!re.test('  #12  Gildan 5000   600 local   9000 elsewhere'));
});
