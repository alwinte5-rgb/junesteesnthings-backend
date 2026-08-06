#!/usr/bin/env node
/*
 * Cloudflare management across every zone on the account.
 *
 * WHY
 * ---
 * Cloudflare caches assets at the edge. During one debugging session it served
 * a stale image, a stale app.js and a stale CORS header — each time making a
 * deployed fix look like it had failed, which sent us chasing the wrong cause
 * three separate times. Purging on deploy removes that whole class of
 * confusion, and the other commands here keep the settings honest instead of
 * remembered.
 *
 * Note this deliberately does NOT use wrangler: wrangler drives Workers and
 * Pages and has no cache-purge or zone-settings command.
 *
 *   node tools/cf.js zones                 every zone the token can see
 *   node tools/cf.js check [--all]         settings vs what they should be
 *   node tools/cf.js purge [urls…]         purge everything, or just those URLs
 *   node tools/cf.js perf [--apply]        set the safe performance settings
 *   node tools/cf.js rules [--apply]       cache rules (edge TTL, API bypass)
 *   node tools/cf.js stats                 cache hit ratio + threats, 7 days
 *
 * Any command takes --zone <name> for one zone, or --all for every zone.
 * Default is CLOUDFLARE_ZONE, or jtees.net.
 *
 * Env: CLOUDFLARE_ZONE, and CLOUDFLARE_API_TOKEN with these permissions:
 *      Zone > Zone > Read            always — resolves zone ids
 *      Zone > Cache Purge > Purge    purge
 *      Zone > Zone Settings > Edit   perf
 *      Zone > Cache Rules > Edit     rules
 *      Zone > Analytics > Read       stats
 *      Zone > DNS > Read             optional, for diagnosing mail/CNAMEs
 */

const TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || '';
const API = 'https://api.cloudflare.com/client/v4';

const args = process.argv.slice(2);
const cmd = args.find(a => !a.startsWith('--')) || 'check';
const flag = (name) => args.includes('--' + name);
const opt = (name) => {
  const i = args.indexOf('--' + name);
  return i > -1 ? args[i + 1] : null;
};
const ZONE_NAME = opt('zone') || process.env.CLOUDFLARE_ZONE || 'jtees.net';

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => console.log('  \x1b[31m✗\x1b[0m ' + m);
const warn = (m) => console.log('  \x1b[33m!\x1b[0m ' + m);
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
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

/** Every zone the token can see, or just the named one. */
async function targetZones() {
  const r = await cf('/zones?per_page=50');
  const all = r.body.result || [];
  if (!all.length) throw new Error('no zones visible to this token');
  if (flag('all')) return all;
  const one = all.find(z => z.name === ZONE_NAME);
  if (!one) {
    throw new Error(`zone ${ZONE_NAME} not visible — this token sees: ${all.map(z => z.name).join(', ')}`);
  }
  return [one];
}

/* Settings worth having on, with the reason. Rocket Loader is deliberately
   absent and actively warned about: it defers JavaScript and breaks the canvas
   designer. Auto Minify is retired by Cloudflare and used to break inline
   scripts. Polish/Mirage are paid. */
const PERF = [
  ['browser_cache_ttl', 0, 'Respect our own Cache-Control instead of forcing 4 hours on everything'],
  ['early_hints', 'on', 'Browser preloads assets before the HTML finishes'],
  ['zero_rtt', 'on', 'Faster repeat connections'],
  ['always_use_https', 'on', 'No insecure first hop'],
  ['brotli', 'on', 'Better compression than gzip on JS/CSS'],
  ['http3', 'on', 'Faster on mobile'],
];

const fmtVal = (v) => (v === 0 ? 'respect-origin' : String(v));

async function doCheck(z) {
  const s = await cf(`/zones/${z.id}/settings`);
  if (!s.body.success) {
    bad(`${z.name}: cannot read settings — token likely lacks Zone Settings`);
    return;
  }
  const have = Object.fromEntries((s.body.result || []).map(x => [x.id, x.value]));
  console.log(`\n  ${z.name}  (${z.plan?.name || '?'})`);
  for (const [key, want, why] of PERF) {
    const cur = have[key];
    const good = String(cur) === String(want);
    console.log(`   ${good ? '\x1b[32m✓\x1b[0m' : '\x1b[33m•\x1b[0m'} ${key.padEnd(19)}${fmtVal(cur ?? '?').padEnd(16)}${good ? '' : '-> ' + fmtVal(want)}`);
    if (!good) note(`  ${why}`);
  }
  if (have['rocket_loader'] === 'on') {
    warn('rocket_loader is ON — it defers JavaScript and can break the designer canvas');
    note('Turn it off: Speed > Optimization > Rocket Loader');
  }
  // Tiered Cache lives on its own endpoint, not in /settings.
  const tc = await cf(`/zones/${z.id}/argo/tiered_caching`);
  if (tc.body.success) {
    const on = tc.body.result?.value === 'on';
    console.log(`   ${on ? '\x1b[32m✓\x1b[0m' : '\x1b[33m•\x1b[0m'} tiered_caching     ${(tc.body.result?.value || '?').padEnd(16)}${on ? '' : '-> on'}`);
    if (!on) note('  Edges pull from a regional parent instead of each hitting the origin');
  }
}

async function doPerf(z, apply) {
  console.log(`\n  ${z.name}`);
  for (const [key, want, why] of PERF) {
    if (!apply) { note(`${key} -> ${fmtVal(want)}   (${why})`); continue; }
    const r = await cf(`/zones/${z.id}/settings/${key}`, {
      method: 'PATCH', body: JSON.stringify({ value: want }),
    });
    if (r.body.success) ok(`${key} = ${fmtVal(want)}`);
    else bad(`${key}: ${((r.body.errors || [])[0] || {}).message || 'failed'}`);
  }
  if (apply) {
    const r = await cf(`/zones/${z.id}/argo/tiered_caching`, {
      method: 'PATCH', body: JSON.stringify({ value: 'on' }),
    });
    if (r.body.success) ok('tiered_caching = on');
    else note('tiered_caching: ' + (((r.body.errors || [])[0] || {}).message || 'not available on this plan'));
  }
}

/* Cache rules. Belt and braces alongside the origin's own Cache-Control:
   these run at the edge and cannot be forgotten in a server config. */
const CACHE_RULES = [
  {
    description: 'Bypass cache for API and admin — never serve one customer another one\'s data',
    expression: '(starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/quote") or starts_with(http.request.uri.path, "/q/") or starts_with(http.request.uri.path, "/review"))',
    action: 'set_cache_settings',
    action_parameters: { cache: false },
  },
  {
    description: 'Cache versioned assets hard — the ?v= stamp changes whenever the file does',
    expression: '(http.request.uri.query contains "v=" and http.request.uri.path.extension in {"js" "css" "png" "jpg" "jpeg" "webp" "svg" "woff2"})',
    action: 'set_cache_settings',
    action_parameters: {
      cache: true,
      edge_ttl: { mode: 'override_origin', default: 31536000 },
      browser_ttl: { mode: 'respect_origin' },
    },
  },
];

async function doRules(z, apply) {
  const phase = 'http_request_cache_settings';
  const cur = await cf(`/zones/${z.id}/rulesets/phases/${phase}/entrypoint`);
  const existing = cur.body?.result?.rules || [];
  console.log(`\n  ${z.name} — existing cache rules: ${existing.length}`);
  existing.forEach(r => note('- ' + (r.description || r.expression)));

  if (!apply) {
    console.log('\n  would set:');
    CACHE_RULES.forEach(r => note('- ' + r.description));
    if (existing.length) warn('--apply REPLACES the existing rules listed above');
    else console.log('\n  Re-run with --apply.');
    return;
  }
  const put = await cf(`/zones/${z.id}/rulesets/phases/${phase}/entrypoint`, {
    method: 'PUT', body: JSON.stringify({ rules: CACHE_RULES }),
  });
  if (put.body.success) ok(`${CACHE_RULES.length} cache rules set on ${z.name}`);
  else bad('failed: ' + JSON.stringify(put.body.errors || put.body));
}

async function doStats(z) {
  const from = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
  const query = `{ viewer { zones(filter: {zoneTag: "${z.id}"}) {
    httpRequests1dGroups(limit: 7, orderBy: [date_DESC], filter: {date_geq: "${from}"}) {
      dimensions { date }
      sum { requests cachedRequests bytes cachedBytes threats }
    } } } }`;
  const r = await fetch(API + '/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const d = await r.json().catch(() => ({}));
  const days = d?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  if (!days.length) {
    bad(`${z.name}: no analytics — token likely lacks Zone > Analytics > Read`);
    if (d.errors) note(JSON.stringify(d.errors[0]?.message || d.errors));
    return;
  }
  console.log(`\n  ${z.name}`);
  console.log('   date          requests    cached   hit%   threats');
  for (const day of days) {
    const s = day.sum;
    const pct = s.requests ? Math.round((s.cachedRequests / s.requests) * 100) : 0;
    console.log(`   ${day.dimensions.date}  ${String(s.requests).padStart(9)} ${String(s.cachedRequests).padStart(9)}   ${String(pct).padStart(3)}%   ${s.threats}`);
  }
  note('\n  A low hit% on a mostly-static site means the cache rules are worth setting.');
}

async function main() {
  if (!TOKEN) {
    bad('CLOUDFLARE_API_TOKEN is not set');
    note('dash.cloudflare.com > My Profile > API Tokens > Create Token > Create Custom Token');
    note('Permissions (all Zone-scoped):');
    note('  Zone > Zone > Read            always needed');
    note('  Zone > Cache Purge > Purge    purge on deploy');
    note('  Zone > Zone Settings > Edit   perf');
    note('  Zone > Cache Rules > Edit     rules');
    note('  Zone > Analytics > Read       stats');
    note('  Zone > DNS > Read             optional, diagnosing mail/CNAMEs');
    note('Zone Resources: Include > All zones');
    note('Then: railway variables --service junesteesnthings-backend --set CLOUDFLARE_API_TOKEN=...');
    process.exit(1);
  }

  const v = await cf('/user/tokens/verify');
  if (!v.body.success) {
    bad('token rejected: ' + (((v.body.errors || [])[0] || {}).message || 'unknown'));
    process.exit(1);
  }
  ok('token is valid');

  if (cmd === 'zones') {
    const r = await cf('/zones?per_page=50');
    const all = r.body.result || [];
    console.log(`\n  ${all.length} zone(s) visible to this token:`);
    for (const z of all) {
      console.log(`   ${z.name.padEnd(28)} ${(z.plan?.name || '?').padEnd(16)} ${z.status}`);
    }
    note('\n  Use --zone <name> to target one, or --all for every zone.');
    return;
  }

  const zones = await targetZones();
  const apply = flag('apply');

  for (const z of zones) {
    if (cmd === 'check') await doCheck(z);
    else if (cmd === 'perf') await doPerf(z, apply);
    else if (cmd === 'rules') await doRules(z, apply);
    else if (cmd === 'stats') await doStats(z);
    else if (cmd === 'purge') {
      const files = args.filter(a => /^https?:\/\//.test(a));
      const payload = files.length ? { files } : { purge_everything: true };
      const r = await cf(`/zones/${z.id}/purge_cache`, { method: 'POST', body: JSON.stringify(payload) });
      if (r.body.success) ok(files.length ? `${z.name}: purged ${files.length} URL(s)` : `${z.name}: purged everything`);
      else { bad(`${z.name}: ${JSON.stringify(r.body.errors || r.body)}`); process.exitCode = 1; }
    } else {
      console.log('  usage: zones | check | purge [urls…] | perf [--apply] | rules [--apply] | stats');
      console.log('         [--zone <name>] [--all]');
      return;
    }
  }
  if (!apply && (cmd === 'perf')) console.log('\n  Re-run with --apply to set them.');
}

main().catch(e => { bad(e.message); process.exit(1); });
