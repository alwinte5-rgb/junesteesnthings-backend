'use strict';

/* The design fee is asked about before a quote is sent (owner, 2026-10-20:
 * "make sure they are added to quote with a question before sending").
 * server.js designFeesToAsk() decides which fee to offer; the send step shows
 * the question first and hides the send buttons until it is answered. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`${name} has no end`);
}
const mapStart = src.indexOf('const DESIGN_FEE_FOR = {');
const mapSrc = src.slice(mapStart, src.indexOf('};', mapStart) + 2);

const SINALITE = require('../tools/lib/sinalite');
const SERVICES = require('../tools/lib/services');
global.__dfa = { SINALITE, SERVICES };
const { designFeesToAsk, DESIGN_FEE_FOR } = vm.runInThisContext(`(() => { const { SINALITE, SERVICES } = global.__dfa;
${mapSrc}
${lift('designFeesToAsk')}
return { designFeesToAsk, DESIGN_FEE_FOR }; })()`);

const catalog = { products: [{ id: 519, name: 'Brochure Design — Trifold, New', price: '350.00' },
  { id: 516, name: 'Label or Sticker Design — New', price: '25.00' }] };
const brochure = { description: 'Trifold Brochures', qty: 500, sign: { kind: 'brochure' } };

test('a brochure with no design line asks about the brochure design fee', () => {
  assert.deepStrictEqual(designFeesToAsk([brochure], catalog),
    [{ name: 'Brochure Design — Trifold, New', what: SINALITE.table().families.brochure.label, id: 519, price: 350 }]);
});

test('stickers and roll labels ask about one $25 fee, once', () => {
  const r = designFeesToAsk([{ sign: { kind: 'sticker' } }, { sign: { kind: 'roll_label' } }], catalog);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].price, 25);
});

test('a quote that already has design work asks nothing', () => {
  assert.deepStrictEqual(designFeesToAsk([brochure, { description: 'Brochure Design — Revision' }], catalog), []);
  assert.deepStrictEqual(designFeesToAsk([{ ...brochure, addons: [{ code: 'design_setup' }] }], catalog), []);
});

test('garments, X-frames and an empty quote ask nothing', () => {
  assert.deepStrictEqual(designFeesToAsk([{ description: 'Gildan 5000', qty: 24 }, { sign: { kind: 'xframe' } }], catalog), []);
  assert.deepStrictEqual(designFeesToAsk(null, catalog), []);
});

test('a fee missing from the catalogue still asks, with the list price and no link', () => {
  const r = designFeesToAsk([brochure], { products: [] });
  assert.strictEqual(r[0].id, null);
  assert.strictEqual(r[0].price, 350);
});

test('every fee the send step can offer is a real service', () => {
  for (const name of Object.values(DESIGN_FEE_FOR)) assert.ok(SERVICES.service(name));
});

test('the send buttons wait for the answer, and the edit form adds the fee from ?design=', () => {
  assert.match(src, /id="send-ask" style="border-color:#c7d7fb;background:#f7faff\$\{askDesign\.length \? ';display:none' : ''\}"/);
  assert.match(src, /No, they are sending a print-ready file/);
  assert.match(src, /new URLSearchParams\(location\.search\)\.get\('design'\)/);
});
