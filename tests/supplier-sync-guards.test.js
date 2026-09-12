'use strict';

/* The three things that let the catalogue rot for a fortnight without anyone
 * noticing, and the hold that a working sync would have undone.
 *
 * Background: the nightly supplier sync claimed a day in jt_supplier_sync_log,
 * spawned tools/ssa-sync.js, and the child died instantly on a mysql client
 * that exists only on a laptop. Fourteen consecutive days show a clean row in
 * that table and not one write to lumise_products. Meanwhile 46 products added
 * on 2026-08-29 were "held" by setting ssa_auto_off — the sync's OWN marker for
 * a product it switched off and may switch back on. Nothing released them only
 * because the sync was dead. Repairing the sync without also fixing the hold
 * would have put every one of them on the storefront, vests and jackets with
 * borrowed canvas art included.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('no tool hardcodes a mysql client path', () => {
  for (const f of fs.readdirSync(path.join(root, 'tools'))) {
    if (!f.endsWith('.js')) continue;
    const src = read(path.join('tools', f));
    const bad = src.split('\n').filter((l) =>
      /['"][^'"]*\/(opt|bin)\/mysql['"]/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l));
    assert.deepStrictEqual(bad, [],
      f + ' pins a mysql path; resolve it through lib/db instead');
  }
});

test('lib/db resolves a client at runtime and names a missing one', () => {
  const src = read('tools/lib/db.js');
  assert.match(src, /JT_MYSQL_BIN/, 'no override for an unusual install');
  assert.match(src, /opt\/homebrew/, 'Apple silicon Homebrew prefix is missing');
  assert.match(src, /'\/usr\/bin\/mysql'/, 'the deployed image path is missing');
  assert.match(src, /command -v mysql/, 'no PATH fallback');
  /* "mysql exited null" is what a missing binary reported for a fortnight. */
  assert.match(src, /no mysql client on this machine/,
    'a missing client must say so, not report an exit code');
});

test('the three ssa tools share lib/db rather than copying it', () => {
  for (const f of ['ssa-sync.js', 'ssa-add-products.js', 'canvas-audit.js']) {
    const src = read(path.join('tools', f));
    assert.match(src, /require\('\.\/lib\/db'\)/, f + ' does not use lib/db');
    assert.ok(!/function mysql\s*\(/.test(src), f + ' still carries its own mysql()');
  }
});

test('the sync never reactivates a product a person is holding', () => {
  const src = read('tools/ssa-sync.js');
  const revive = src.slice(src.indexOf('const returned = mysql('));
  const query = revive.slice(0, revive.indexOf('{ rows: true }'));
  assert.match(query, /held_for_review IS NULL/,
    'the revive query would resurrect a held product');
  assert.match(src, /ADD COLUMN held_for_review DATETIME NULL/,
    'the column the hold depends on is never created');
});

test('a failed sync does not burn the day', () => {
  const src = read('server.js');
  const fn = src.slice(src.indexOf('async function runSupplierSync()'));
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  assert.match(body, /ok BOOLEAN/, 'success is not recorded, so failure is invisible');
  assert.match(body, /jt_supplier_sync_log\.ok = FALSE/,
    'the claim must be retryable while the day has not succeeded');
  assert.match(body, /SET ok = TRUE/, 'nothing ever marks the day as succeeded');
  assert.match(body, /attempt === 1/, 'an hourly retry would alert every hour');
});

test('the deployed image installs a mysql client', () => {
  /* Railway builds this service with Railpack. A nixpacks.toml is read by
     nothing: the first attempt at this fix shipped one, the deploy went green,
     the build installed only libatomic1, and the sync stayed broken. */
  assert.ok(!fs.existsSync(path.join(root, 'nixpacks.toml')),
    'nixpacks.toml is dead config here — Railpack will ignore it');
  const cfg = JSON.parse(read('railpack.json'));
  assert.ok(Array.isArray(cfg.deploy && cfg.deploy.aptPackages),
    'deploy.aptPackages is where a runtime package goes');
  assert.ok(cfg.deploy.aptPackages.some((p) => /mysql-client/.test(p)),
    'the binary the sync needs is not installed in the final image');
  /* Omitted on purpose: Railpack keeps the detected start command, and pinning
     one here would be a second copy of package.json's start script. */
  assert.ok(!cfg.deploy.startCommand, 'do not duplicate the start command');
});
