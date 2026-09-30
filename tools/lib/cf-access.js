'use strict';

/* Cloudflare Access: the only login to the back office.

   Every staff page lives under /admin, and Cloudflare Access stands in front
   of /admin on www.jtees.net: it asks for an email on the owner's list, sends
   a one-time code to that inbox, and only then lets the request through,
   carrying a signed pass (the Cf-Access-Jwt-Assertion header) that names the
   email.

   The app does not take Cloudflare's word for it by the request merely
   arriving. A request can reach Railway without passing Cloudflare (the bare
   jtees.net hostname was never covered, and Railway's edge answers to any Host
   header), so every staff request must carry a pass this module has verified:
   signed by the team's current keys, for this Access application (aud), from
   this team (iss), and in date. No pass, no page.

   Who the email belongs to — the owner, or which helper with which
   permissions — is the app's decision, made in requireAdmin. */

const crypto = require('node:crypto');

const KEYS_TTL_MS = 60 * 60 * 1000;       // refetch the team's keys hourly
const REFETCH_FLOOR_MS = 5 * 60 * 1000;   // an unknown key id forces at most one fetch per 5 min
const CLOCK_SKEW_S = 60;
const MAX_TOKEN_LEN = 8192;

/** Settings from the environment. Missing any → Access is not configured and
 *  every staff page is refused (never opened). */
function configFromEnv(env = process.env) {
  const team = String(env.CF_ACCESS_TEAM_DOMAIN || '').trim().replace(/\/+$/, '').replace(/^https?:\/\//, '');
  const aud = String(env.CF_ACCESS_AUD || '').trim();
  const owners = String(env.OWNER_EMAILS || '').split(',')
    .map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team) || !/^[0-9a-f]{64}$/.test(aud) || !owners.length) return null;
  return {
    issuer: `https://${team}`,
    certsUrl: `https://${team}/cdn-cgi/access/certs`,
    logoutUrl: '/cdn-cgi/access/logout',
    aud,
    owners,
  };
}

function b64urlJson(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** A key store that fetches the team's signing keys and caches them. `fetchKeys`
 *  is injectable so tests never touch the network. */
function makeKeyStore(certsUrl, fetchKeys = defaultFetchKeys) {
  let keys = new Map();
  let fetchedAt = 0;
  let inflight = null;

  async function refresh() {
    if (!inflight) {
      inflight = (async () => {
        try {
          const body = await fetchKeys(certsUrl);
          const next = new Map();
          for (const jwk of (body && Array.isArray(body.keys) ? body.keys : [])) {
            if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
            try { next.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })); } catch { /* skip a bad key */ }
          }
          if (next.size) { keys = next; fetchedAt = Date.now(); }
        } finally { inflight = null; }
      })();
    }
    return inflight;
  }

  return async function keyFor(kid) {
    const stale = Date.now() - fetchedAt > KEYS_TTL_MS;
    if (stale || (!keys.has(kid) && Date.now() - fetchedAt > REFETCH_FLOOR_MS)) {
      try { await refresh(); } catch (err) {
        if (!keys.size) throw err;   // keep serving the last good keys through a blip
      }
    }
    return keys.get(kid) || null;
  };
}

async function defaultFetchKeys(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Cloudflare Access keys: HTTP ${res.status}`);
  return res.json();
}

/** The verified email in a Cloudflare Access pass, or null. Signature first;
 *  nothing in the payload is trusted until it checks out. */
async function verifyAccessToken(token, cfg, keyFor, nowS = Math.floor(Date.now() / 1000)) {
  if (!cfg || typeof token !== 'string' || !token || token.length > MAX_TOKEN_LEN) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header;
  try { header = b64urlJson(parts[0]); } catch { return null; }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const key = await keyFor(header.kid);
  if (!key) return null;
  let ok = false;
  try {
    ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
      key, Buffer.from(parts[2], 'base64url'));
  } catch { ok = false; }
  if (!ok) return null;

  let p;
  try { p = b64urlJson(parts[1]); } catch { return null; }
  const auds = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!auds.includes(cfg.aud)) return null;
  if (p.iss !== cfg.issuer) return null;
  if (typeof p.exp !== 'number' || p.exp + CLOCK_SKEW_S < nowS) return null;
  if (typeof p.nbf === 'number' && p.nbf - CLOCK_SKEW_S > nowS) return null;
  const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';
  if (!email || email.length > 254 || !email.includes('@')) return null;
  return email;
}

module.exports = { configFromEnv, makeKeyStore, verifyAccessToken };
