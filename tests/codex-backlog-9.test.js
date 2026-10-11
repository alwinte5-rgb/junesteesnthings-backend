/* Codex backlog fixes, backend batch 9 (2026-10-11): tools and docs. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('#7 the env template and README name the Stripe and staff sign-in settings', () => {
  const env = read('.env.example');
  for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'CF_ACCESS_TEAM_DOMAIN', 'CF_ACCESS_AUD', 'OWNER_EMAILS']) {
    assert.match(env, new RegExp(`^${k}=$`, 'm'), `${k} in .env.example, blank`);
  }
  assert.match(read('README.md'), /STRIPE_WEBHOOK_SECRET/);
});

test('#137 a Google Ads failure names the service, verb and route', () => {
  assert.match(read('tools/lib/google-ads.js'), /new Error\(`Google \$\{String\(\(init && init\.method\) \|\| 'GET'\)\.toUpperCase\(\)\} \$\{where\}: HTTP/);
});

test('#232 model photos: real S&S errors, and a filtered write merges', () => {
  const t = read('tools/model-photos.js');
  assert.match(t, /'S&S GET ' \+ p\.split\('\?'\)\[0\] \+ ' returned ' \+ r\.status/);
  assert.match(t, /for \(const id of only\) delete out\[id\];\s*Object\.assign\(out, map\);/);
  assert.match(t, /refusing to replace it with/);
});

test('#223 new S&S styles: tank art, the price the account pays, filed into categories', () => {
  const t = read('tools/ssa-add-products.js');
  assert.match(t, /\['3483',\s+'tank',/);
  assert.match(t, /tank:\s+\{ raws: 'tank_tops'/);
  assert.match(t, /const pieceCost = \(r\) => Number\(r\.customerPrice \|\| r\.piecePrice/);
  assert.ok(!/Number\(r\.piecePrice \|\| r\.casePrice \|\| 0\)/.test(t), 'no reader left on the list price');
  assert.match(t, /categorise-products\.js'\), '--apply'\]/);
});

test('#105 the backfill books refunds on what it recovers, as the reconciler would', () => {
  const t = read('tools/backfill-unlinked.js');
  assert.match(t, /`\$\{c\.id\}:\$\{want\}:\$\{Number\(b\.n\) \+ 1\}`/, 'the server\'s ext_ref shape');
  assert.match(t, /ON CONFLICT \(ext_ref\) WHERE ext_ref IS NOT NULL DO NOTHING/, 'repeats the partial index predicate');
});

test('node --test does not run the Sentry tool as a test', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'tools', 'sentry-test.js')));
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'tools', 'sentry-check.js')));
});
