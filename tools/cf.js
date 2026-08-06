#!/usr/bin/env node
/*
 * Cloudflare cache purge and performance settings.
 *
 * WHY
 * ---
 * Cloudflare caches assets for four hours. During one debugging session it
 * served a stale image, a stale app.js and a stale CORS header — each time
 * making a deployed fix look like it had failed, which cost hours of chasing
 * the wrong cause. Purging on deploy removes that whole class of confusion.
 *
 * Note this deliberately does NOT use wrangler: wrangler drives Workers and
 * Pages, and has no cache-purge command. Purging is a plain REST call.
 *
 *   node tools/cf.js check              what the token can see
 *   node tools/cf.js purge              purge everything
 *   node tools/cf.js purge <url> [...]  purge just those URLs (kinder to origin)
 *   node tools/cf.js perf               show the performance settings
 *   node tools/cf.js perf --apply       turn on the safe ones
 *
 * Env: CLOUDFLARE_API_TOKEN  (Zone > Cache Purge > Purge, plus Zone Settings >
 *      Edit for `perf --apply`), CLOUDFLARE_ZONE  (defaults to jtees.net)
 */

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const ZONE_NAME = process.env.CLOUDFLARE_ZONE || 'jtees.net';
const API = 'https://api.cloudflare.com/client/v4';

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => console.log('  \x1b[31m✗\x1b[0m ' + m);
const note = (m) => console.log('    ' + m);

async function cf(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function zoneId() {
  const r = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
  const z = (r.body.result || [])[0];
  if (!z) throw new Error(`zone ${ZONE_NAME} not visible to this token`);
  return z.id;
}

/* Settings that are safe for this site. Rocket Loader is deliberately absent:
   it defers JavaScript, which breaks the canvas designer. */
const PERF = [
  ['brotli', 'on', 'Better compression than gzip on JS/CSS — app.js is ~470KB'],
  ['early_hints', 'on', 'Browser starts fetching assets before the HTML finishes'],
  ['http3', 'on', 'Faster on mobile, where most customers design'],
  ['zero_rtt', 'on', 'Quicker repeat connections'],
  ['always_use_https', 'on', 'No insecure first hop'],
];

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  if (!TOKEN) {
    bad('CLOUDFLARE_API_TOKEN is not set');
    note('Create one at dash.cloudflare.com > My Profile > API Tokens > Create Token');
    note('Permissions: Zone > Cache Purge > Purge   (add Zone > Zone Settings > Edit for `perf`)');
    note(`Zone Resources: Include > Specific zone > ${ZONE_NAME}`);
    note('Then: railway variables --service junesteesnthings-backend --set CLOUDFLARE_API_TOKEN=...');
    process.exit(1);
  }

  const v = await cf('/user/tokens/verify');
  if (!v.body.success) {
    bad('token rejected: ' + ((v.body.errors || [])[0] || {}).message);
    process.exit(1);
  }
  ok('token is valid');

  const id = await zoneId();
  ok(`zone ${ZONE_NAME}`);

  if (cmd === 'check' || !cmd) {
    const s = await cf(`/zones/${id}/settings`);
    const have = Object.fromEntries((s.body.result || []).map(x => [x.id, x.value]));
    console.log('\n  current settings:');
    for (const [key, want, why] of PERF) {
      const cur = have[key];
      const good = cur === want;
      console.log(`   ${good ? '\x1b[32m✓\x1b[0m' : '\x1b[33m•\x1b[0m'} ${key.padEnd(18)} ${String(cur ?? '?').padEnd(6)} ${good ? '' : '-> ' + want}`);
      if (!good) note(`  ${why}`);
    }
    const rl = have['rocket_loader'];
    if (rl === 'on') {
      console.log('');
      bad('rocket_loader is ON — it defers JavaScript and can break the designer canvas');
      note('Turn it off: Speed > Optimization > Rocket Loader');
    }
    console.log('\n  purge with:  node tools/cf.js purge');
    return;
  }

  if (cmd === 'purge') {
    const files = rest.filter(a => /^https?:\/\//.test(a));
    const payload = files.length ? { files } : { purge_everything: true };
    const r = await cf(`/zones/${id}/purge_cache`, { method: 'POST', body: JSON.stringify(payload) });
    if (!r.body.success) {
      bad('purge failed: ' + JSON.stringify(r.body.errors || r.body));
      process.exit(1);
    }
    ok(files.length ? `purged ${files.length} URL(s)` : 'purged everything');
    return;
  }

  if (cmd === 'perf') {
    const apply = rest.includes('--apply');
    for (const [key, want, why] of PERF) {
      if (!apply) { note(`${key} -> ${want}   (${why})`); continue; }
      const r = await cf(`/zones/${id}/settings/${key}`, {
        method: 'PATCH', body: JSON.stringify({ value: want }),
      });
      if (r.body.success) ok(`${key} = ${want}`);
      else bad(`${key}: ${((r.body.errors || [])[0] || {}).message || 'failed'}`);
    }
    if (!apply) console.log('\n  Re-run with --apply to set them.');
    return;
  }

  console.log('  usage: check | purge [urls…] | perf [--apply]');
}

main().catch(e => { bad(e.message); process.exit(1); });
