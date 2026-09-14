'use strict';

/* The size list on a description must not compound.
 *
 * `desc` is the description POSTED BACK, which on an edit already ends in the
 * suffix written last time. Appending unconditionally added it again on every
 * save: three saves gave "... (1 M, 3 L, 1 3XL) (1 M, 3 L, 1 3XL) (1 M, 3 L,
 * 1 3XL)" and it never stopped growing.
 *
 * Same compounding shape as the blended unit price and the vanishing size
 * upcharges — each save is internally consistent, so nothing looks wrong at any
 * single point.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const m = src.match(/const SIZE_LIST_RE = (\/.*\/);/);
assert.ok(m, 'the size-list strip is gone from server.js');
const RE = new Function('return ' + m[1])();

const apply = (desc, mix) => {
  let d = desc;
  while (RE.test(d)) d = d.replace(RE, '');
  d = d.trim();
  if (mix) d += ` (${Object.entries(mix).map(([sz, n]) => `${n} ${sz}`).join(', ')})`;
  return d;
};

const MIX = { M: 1, L: 3, '3XL': 1 };
const BASE = 'Gildan 5000 Unisex Heavy Cotton Tee — DTF Printing';

test('saving repeatedly does not grow the description', () => {
  let d = apply(BASE, MIX);
  const once = d;
  for (let i = 0; i < 5; i++) d = apply(d, MIX);
  assert.strictEqual(d, once, 'five more saves must leave it identical');
  assert.strictEqual((d.match(/\(/g) || []).length, 1, 'exactly one size list');
});

test('a changed mix replaces the old list rather than adding to it', () => {
  const first = apply(BASE, { M: 1 });
  const second = apply(first, { L: 4, '2XL': 2 });
  assert.strictEqual(second, BASE + ' (4 L, 2 2XL)');
});

test('the customer\'s own parenthetical survives', () => {
  /* Only a "<count> <size>" shape is stripped, so a note in brackets is not
     silently eaten off the end of their description. */
  const d = apply('Team hoodies (rush job)', MIX);
  assert.strictEqual(d, 'Team hoodies (rush job) (1 M, 3 L, 1 3XL)');
  assert.strictEqual(apply(d, MIX), d, 'and it still does not compound');
});

test('no mix leaves a previously written list removed, not duplicated', () => {
  assert.strictEqual(apply(BASE + ' (2 L)', null), BASE);
});

/* Quotes written before the save was fixed carry the repeats in the DATABASE.
 * A fix in the save alone leaves them wrong until somebody happens to edit each
 * one, so the READ side normalises too and they come right on being opened.
 */
const om = src.match(/function oneSizeList\(desc\) \{[\s\S]*?\n\}/);
assert.ok(om, 'oneSizeList is gone from server.js');
const oneSizeList = new Function('SIZE_LIST_RE', 'stripSizeLists',
  om[0] + '; return oneSizeList;')(RE, (d) => {
    let x = String(d == null ? '' : d);
    while (RE.test(x)) x = x.replace(RE, '');
    return x.trim();
  });

test('an already-corrupted description displays with one size list', () => {
  const stored = BASE + ' (1 M, 3 L, 1 3XL)'.repeat(5);
  assert.strictEqual(oneSizeList(stored), BASE + ' (1 M, 3 L, 1 3XL)');
});

test('a clean description is left exactly as it is', () => {
  assert.strictEqual(oneSizeList(BASE + ' (2 XL)'), BASE + ' (2 XL)');
  assert.strictEqual(oneSizeList(BASE), BASE);
});

test('a note in brackets is not mistaken for a size list', () => {
  assert.strictEqual(oneSizeList('Team hoodies (rush job)'), 'Team hoodies (rush job)');
});

test('null and empty do not throw', () => {
  assert.strictEqual(oneSizeList(null), '');
  assert.strictEqual(oneSizeList(''), '');
});
