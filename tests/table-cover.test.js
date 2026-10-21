'use strict';

/* The 6 ft table cover (owner, 2026-10-20): DTF printed in house on one or two
 * sides of a YCC Linens blank, with the blank's delivery inside the price.
 * tools/add-table-cover.js writes the method and product; server.js carries
 * the delivery as the tablecover_ship add-on. The two must agree. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const tool = fs.readFileSync(path.join(__dirname, '..', 'tools', 'add-table-cover.js'), 'utf8');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the delivery charge in server.js is the tool\'s, and attaches to the tool\'s method', () => {
  const ship = Number((tool.match(/const SHIP = ([\d.]+);/) || [])[1]);
  const method = (tool.match(/const METHOD = '([^']+)';/) || [])[1];
  assert.ok(ship > 0 && method, 'SHIP and METHOD in the tool');
  const a = src.indexOf("code: 'tablecover_ship'");
  assert.ok(a !== -1, 'tablecover_ship add-on');
  const block = src.slice(a, src.indexOf('},', a));
  assert.match(block, new RegExp(`rate: ${ship.toString().replace('.', '\\.')},`));
  assert.match(block, /kind: 'once'/);
  assert.match(block, /orderShared: true/);
  assert.match(block, /inItemPrice: true/);
  assert.match(block, /auto: 'method'/);
  const re = new RegExp((block.match(/appliesTo: \/(.+?)\/i,/) || [])[1], 'i');
  assert.ok(re.test(method), 'the add-on matches the method title');
  assert.ok(!re.test('DTF Printing') && !re.test('DTF Printing — Oversized (up to 252 sq in)'), 'never on shirt DTF');
});

test('a typed price or the customer’s own cover: no delivery, on the form and the save', () => {
  assert.match(src, /if \(a\.code === 'tablecover_ship' && \(String\(u\.value \|\| ''\)\.trim\(\) !== '' \|\| addons\.some\(function\(x\)\{ return x\.code === 'own_blanks'; \}\)\)\) return;/);
  assert.match(src, /if \(a\.code === 'tablecover_ship' && \(priceTyped \|\| lineAddons\.some\(\(x\) => x\.code === 'own_blanks'\)\)\) continue;/);
  assert.match(src, /a\.code !== 'cutout_ship' && a\.code !== 'tablecover_ship'/, 'shown inside the price for staff too');
});

test('job costs book the delivery as shipping and the front as an oversized print', () => {
  const JC = require('../tools/lib/job-costs');
  assert.strictEqual(JC.addonCosts([{ code: 'tablecover_ship', total: 11.99 }]).shipping, 11.99);
});

test('the tool refuses a band without a price and is dry-run by default', () => {
  assert.match(tool, /no price for the <=' \+ c \+ ' band — refusing/);
  assert.match(tool, /const APPLY = argv\.includes\('--apply'\)/);
  assert.match(tool, /sellPrice\(BLANK_COST\)/, 'the blank follows the garment markup');
});
