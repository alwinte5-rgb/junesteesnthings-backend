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

test('both S&S clients tell a missing style apart from a refused request', () => {
  /* On 2026-09-22 SSA_API_KEY held a placeholder rather than a real key,
     so every call came back 401. ssa-sync.js survived it — it throws on any
     non-404 and leaves the product untouched — but ssa-add-products.js
     returned null for ALL of them, which its caller reads as "no such style
     at S&S", printed once per style, and exited 0. A dead credential is not
     a catalogue fact, and a tool must not report one as the other. */
  for (const f of ['ssa-sync.js', 'ssa-add-products.js']) {
    const src = read(path.join('tools', f));
    const fn = src.slice(src.indexOf('function makeClient('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /r\.status === 404\) return null/,
      f + ': 404 is the only status that means the style is absent');
    assert.match(body, /if \(!r\.ok\) throw new Error\('S&S returned '/,
      f + ': a non-404 failure is reported as an absent style');
    assert.match(body, /startsWith\('S&S returned'\)\) throw e/,
      f + ': the refusal is caught by the retry loop and retried pointlessly');
  }
});

test('ssa-add-products cannot fail silently', () => {
  /* Exit 0 with "0 to add" is indistinguishable from a clean no-op run. */
  const src = read('tools/ssa-add-products.js');
  assert.match(src, /apiErrors\+\+/, 'API failures are not counted');
  assert.match(src, /process\.exit\(apiErrors \? 1 : 0\)/,
    'a run that reached nothing still exits 0');
  assert.match(src, /SSA_API_KEY is wrong or expired/,
    'the operator is not told which credential to look at');
});

test('the Gildan 8000 is listed as a 50/50, not a sublimation blank', () => {
  /* Dye sublimation needs high-poly white goods. 8000 is a 50/50 DryBlend, so
     if it ever matched the isPoly test the product page would offer a method
     the shop has to refuse after the customer has designed on it. */
  const src = read('tools/ssa-add-products.js');
  assert.match(src, /\['8000',\s*'tee',\s*'Gildan',/, 'Gildan 8000 is not in the list');
  const poly = src.match(/const isPoly = ([^;]+);/);
  assert.ok(poly, 'the sublimation test moved — recheck 8000 against it');
  assert.ok(!new RegExp(poly[1].replace(/^\/|\/i?\.test\(name\)$/g, ''), 'i')
    .test('Gildan 8000 Adult DryBlend 50/50 Tee'),
    'the 8000 would be offered sublimation it cannot take');
});

test('no tool hardcodes a decoration method id', () => {
  /* On 2026-09-22 ssa-add-products.js still carried `methods: [1,2,3,4,5,6,8]`
     per garment type. Those were the PRE-renumbering ids: #2-#6 are the retired
     per-colour screen rows, long since replaced by the single combined method,
     and the one embroidery row had become seven placements. Every product the
     tool added after that renumbering therefore offered five dead methods and
     could not be screen printed at all — 32 live products, including tees,
     where screen print is the commonest job the shop sells. */
  const src = read('tools/ssa-add-products.js');
  assert.ok(!/methods:\s*\[\s*\d/.test(src),
    'a literal list of printing ids is back in the TYPES map');
  assert.match(src, /require\('\.\/lib\/garments'\)/, 'it does not read the shared rules');
  assert.match(src, /resolveRoles\(methods\)/,
    'decoration ids must be resolved against the live table, not assumed');
  assert.match(src, /SELECT id, title FROM lumise_printings/,
    'nothing reads the live printings table');
});

test('the dtf role matches the title the rename tool actually sets', () => {
  /* The break that hid all of the above. rename-dtf-method.js retitled method
     #1 "Printing" -> "DTF Printing" on the stated grounds that only ids are
     keyed off — but lib/garments.js ROLES is keyed off the TITLE, exactly, so
     the role stopped resolving. decorations-2026.js refuses to run on an
     unresolved role, so the sweep that would have repaired those 32 products
     could not be run at all, and said so in a message nobody was reading. */
  const rename = read('tools/rename-dtf-method.js');
  const to = /const TO = '([^']+)';/.exec(rename);
  assert.ok(to, 'rename-dtf-method.js no longer declares TO');
  const garments = read('tools/lib/garments.js');
  const dtf = /dtf:\s*\{ title: '([^']+)'/.exec(garments);
  assert.ok(dtf, 'the dtf role moved');
  assert.strictEqual(dtf[1], to[1],
    'ROLES.dtf must match the title rename-dtf-method.js leaves behind');
});

test('resolveRoles has one definition, shared by both callers', () => {
  /* It lived in decorations-2026.js, so the tool that FIXES a product's
     decorations and the tool that CREATES one did not share a definition. */
  const lib = read('tools/lib/garments.js');
  assert.match(lib, /function resolveRoles\(/, 'the shared copy is gone');
  assert.match(lib, /resolveRoles \}/, 'it is not exported');
  for (const f of ['decorations-2026.js', 'ssa-add-products.js']) {
    const src = read(path.join('tools', f));
    assert.ok(!/function resolveRoles\(/.test(src), f + ' has its own copy again');
    assert.match(src, /resolveRoles/, f + ' does not use it');
  }
});

test('a garment class with no decoration rules is skipped, not guessed', () => {
  const src = read('tools/ssa-add-products.js');
  assert.match(src, /if \(!roles\) return null/, 'an unknown class falls through');
  assert.match(src, /no decoration set for garment class/,
    'a skipped style does not say why');
});

test('the catalogue photo is the garment, never the model shot', () => {
  /* tools/product-art/README.md says this in capitals: Images/Style/<id>_fl.jpg
     is the MARKETING photograph, and for apparel that is a person wearing the
     garment — head, hands and trousers — in whichever colourway the supplier
     chose to shoot. ssa-add-products.js used it for thumbnail_url anyway, so 78
     of 104 active products show a model instead of the product, and a quote for
     a Forest Green tee showed a man in a white one. */
  const src = read('tools/ssa-add-products.js');
  assert.match(src, /function defaultColourImage\(rows\)/,
    'nothing picks a colourway photo');
  assert.match(src, /r\.colorFrontImage/,
    'the colour image field is not read');
  /* styleImage may survive ONLY as the last-resort fallback. */
  const thumbLine = /const thumb = ([\s\S]*?);\n/.exec(src);
  assert.ok(thumbLine, 'the thumbnail assignment moved');
  assert.match(thumbLine[1], /^defaultColourImage\(rows\)/,
    'the style image is still being reached for first');
});
