/* Codex backlog fixes, backend batch 5 (2026-10-10). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SHIP = require('../tools/lib/shipping');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('#34 a stalled upload fails after two minutes instead of holding the form', () => {
  const fn = src.slice(src.indexOf('const CLD_UPLOAD_FN = `'), src.indexOf('`;', src.indexOf('const CLD_UPLOAD_FN = `')));
  assert.match(fn, /setTimeout\(function\(\)\{ ac\.abort\(\); \}, 120000\)/);
  assert.match(fn, /signal: ac \? ac\.signal : undefined/);
  assert.ok(!fn.includes('${'), 'no template placeholders inside the pasted uploader');
});

test('#125 an expedited quote job preselects the fastest rate, not the cheapest', () => {
  const rates = [{ id: 'g', name: 'Ground', days: 5, amount: 8 }, { id: 'p', name: 'Priority', days: 2, amount: 12 },
                 { id: 'p2', name: 'Priority B', days: 2, amount: 11 }, { id: 'x', name: 'Unknown', amount: 5 }];
  assert.strictEqual(SHIP.preferredRate(rates, '').id, 'g', 'ground jobs keep the first (cheapest)');
  assert.strictEqual(SHIP.preferredRate(rates, '', { expedited: true }).id, 'p2', 'fastest, cheapest among equals');
  assert.strictEqual(SHIP.preferredRate(rates, 'Ground', { expedited: true }).id, 'g', 'a paid service still wins');
  assert.match(src, /shipRatesHtml\(ref, rates, paidService, !studio && String\(o\.ship_method\)\.toLowerCase\(\) === 'expedited'\)/);
});
