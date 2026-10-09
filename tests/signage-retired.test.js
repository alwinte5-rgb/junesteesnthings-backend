'use strict';

/* The old fixed-size sign methods were retired on 2026-10-08 because they showed
 * twice in the staff quote form beside the sign products that replaced them.
 * A rerun of tools/add-signage.js used to set active=1 on everything it lists,
 * which would quietly bring every one of them back. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'add-signage.js'), 'utf8');
const RE = new RegExp(src.match(/const RETIRED_METHOD = \/(.+)\/;/)[1]);

test('every replaced fixed-size title is retired', () => {
  for (const t of [
    'Vinyl Banner — 3ft x 6ft, 13oz single-sided',
    'Vinyl Banner — 3ft x 6ft, 18oz DOUBLE-SIDED',
    'Poster — 18in x 24in, single-sided',
    'Window Graphic — one-way vinyl, per sqft',
    'Wall Graphic — removable fabric, per sqft',
    'Vehicle Graphic — 3M ControlTac, per sqft',
    'Vehicle Magnet — 24in x 12in, single-sided',
    'Acrylic Panel — 12in x 18in, single-sided',
    'Canvas Print — 16in x 20in, single-sided',
  ]) assert.ok(RE.test(t), t);
});

test('items with no replacement stay on sale', () => {
  for (const t of [
    'Full Body Cutout — single-sided',
    'Retractable Banner Stand — 33.5in x 80in',
    'Business Cards — single or double-sided',
    'Flyers — 6in x 4in, single or double-sided',
  ]) assert.ok(!RE.test(t), t);
});

test('a rerun skips retired rows before it can switch them on', () => {
  assert.match(src, /if \(isRetiredMethod\(m\.title\)\) \{[\s\S]{0,200}continue;/);
  assert.match(src, /if \(RETIRED_PRODUCTS\.has\(name\)\) \{[\s\S]{0,200}continue;/);
  assert.ok(!/RETIRED_PRODUCTS = new Set\([^)]*Business Cards/.test(src), 'business cards have no replacement');
});
