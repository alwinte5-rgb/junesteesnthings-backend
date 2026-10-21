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
const namesStart = src.indexOf('const DESIGN_SERVICE_NAMES');
const namesSrc = src.slice(namesStart, src.indexOf(';\n', namesStart) + 2);

const SINALITE = require('../tools/lib/sinalite');
const SERVICES = require('../tools/lib/services');
global.__dfa = { SINALITE, SERVICES };
const { designFeesToAsk, DESIGN_FEE_FOR } = vm.runInThisContext(`(() => { const { SINALITE, SERVICES } = global.__dfa;
${mapSrc}
${namesSrc}
${lift('isDesignLine')}
${lift('designFeesToAsk')}
return { designFeesToAsk, DESIGN_FEE_FOR }; })()`);

const catalog = { products: [{ id: 519, name: 'Brochure Design — Trifold, New', price: '350.00' },
  { id: 520, name: 'Brochure Design — Revision', price: '150.00' },
  { id: 516, name: 'Label or Sticker Design — New', price: '25.00' },
  { id: 517, name: 'Label or Sticker Design — Revision', price: '25.00' }] };
const brochure = { description: 'Trifold Brochures', qty: 500, sign: { kind: 'brochure' } };
const fees = (items, cat = catalog) => designFeesToAsk(items, cat).fees;

test('a brochure with no design line offers the new and the revision fee', () => {
  assert.deepStrictEqual(fees([brochure]).map((f) => [f.id, f.price]), [[519, 350], [520, 150]]);
});

test('stickers and roll labels ask nothing: their $25 design is inside the price', () => {
  assert.deepStrictEqual(fees([{ sign: { kind: 'sticker' } }, { sign: { kind: 'roll_label' } }]), []);
});

test('a quote that already has design work asks nothing', () => {
  assert.deepStrictEqual(fees([brochure, { description: 'Brochure Design — Revision', product_id: 520 }]), []);
  assert.deepStrictEqual(fees([{ ...brochure, addons: [{ code: 'design_setup' }] }]), []);
  assert.deepStrictEqual(fees([brochure, { description: 'logo design work' }]), [], 'a typed design line with no product');
});

test('a product that only has "Design" in its name does not count as design work', () => {
  assert.strictEqual(fees([brochure, { description: 'Custom Design Tee', product_id: 14 }]).length, 2);
});

test('optional lines, garments, X-frames and an empty quote ask nothing', () => {
  assert.deepStrictEqual(fees([{ ...brochure, optional: true }]), []);
  assert.deepStrictEqual(fees([{ description: 'Gildan 5000', qty: 24, product_id: 3 }, { sign: { kind: 'xframe' } }]), []);
  assert.deepStrictEqual(fees(null), []);
});

test('a catalogue that failed to load is said, and the list prices still show', () => {
  const r = designFeesToAsk([brochure], { products: [], failed: true });
  assert.strictEqual(r.catalogFailed, true);
  assert.strictEqual(r.fees[0].id, null);
  assert.strictEqual(r.fees[0].price, 350);
});

test('every fee the send step can offer is a real service', () => {
  for (const names of Object.values(DESIGN_FEE_FOR)) for (const name of names) assert.ok(SERVICES.service(name));
});

test('the send buttons and the message wait for the answer; ?design= adds the fee once', () => {
  assert.match(src, /id="send-ask" data-after-design style="border-color:#c7d7fb;background:#f7faff\$\{askDesign\.length \? ';display:none' : ''\}"/);
  assert.match(src, /<div class="card" data-after-design\$\{askDesign\.length \? ' style="display:none"' : ''\}>\s*<div class="msg" id="m">/);
  assert.match(src, /No, they are sending a print-ready file/);
  assert.match(src, /u\.searchParams\.delete\('design'\); history\.replaceState/);
});
