'use strict';

/* Every product attribute needs an `id`, and the id must be its key.
 *
 * The cart field renderers build their input as name="'+data.id+'" — see
 * render_color() in the designer's core/includes/tmpl.php, and the same for
 * quantity. Products written by ssa-add-products carried no id, so the input
 * rendered as the literal name="undefined", and lumise.cart.calc does:
 *
 *     if (attrs[field.name] == undefined) return;
 *
 * which misses. The field then contributes nothing at all: no colour recorded
 * on the order, and lumise.cart.qty never incremented, so the line had no
 * quantity to price. A colourway variation cannot match either, because the
 * value its condition compares against is never collected.
 *
 * 71 products were built this way, 57 of them live.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'tools', 'ssa-add-products.js'), 'utf8');
const attrs = src.slice(src.indexOf('function buildAttributes'), src.indexOf('function buildPrintings'));

test('the quantity attribute is built with an id and a caption', () => {
  assert.match(attrs, /QTYS:\s*\{[^}]*id:\s*'QTYS'/, 'QTYS has no id — the input renders name="undefined"');
  assert.match(attrs, /QTYS:\s*\{[^}]*name:\s*'Quantity per Size'/, 'QTYS has no caption');
});

test('the colour attribute is built with an id and a caption', () => {
  assert.match(attrs, /attrs\.COL = \{[^}]*id:\s*'COL'/, 'COL has no id — colour is never recorded on the order');
  assert.match(attrs, /attrs\.COL = \{[^}]*name:\s*'Color'/, 'COL has no caption');
});

test('the id matches the key it is looked up by', () => {
  /* cart.calc resolves attrs[field.name], so the id has to BE the key —
     a pretty label there silently breaks the lookup. */
  assert.ok(/id:\s*'QTYS'/.test(attrs) && /QTYS:/.test(attrs), 'QTYS id must equal its key');
  assert.ok(/id:\s*'COL'/.test(attrs) && /attrs\.COL/.test(attrs), 'COL id must equal its key');
});

test('the repair tool restores the key as the id, not a label', () => {
  const rep = fs.readFileSync(path.join(root, 'tools', 'repair-attribute-ids.js'), 'utf8');
  assert.match(rep, /a\.id = key/, 'the repair must set the id to the attribute key');
  assert.match(rep, /product_color:\s*'Color'/, 'no caption for a colour field');
  assert.match(rep, /quantity:\s*'Quantity per Size'/, 'no caption for a quantity field');
});
