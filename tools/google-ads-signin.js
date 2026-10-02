'use strict';

/* Sign in to Google once, so the dashboard can read Google Ads.

   Run on a Mac, from a directory linked to the June's Tees Railway project:
     railway run --service junesteesnthings-backend node tools/google-ads-signin.js

   It opens Google's sign-in page in the browser. Sign in as the Google account
   that can see the ad account and press Allow. The refresh token Google hands
   back is written straight into Railway as GOOGLE_ADS_REFRESH_TOKEN and never
   printed. Uses a Desktop OAuth client, which allows any port on 127.0.0.1. */

const http = require('node:http');
const crypto = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');

const SERVICE = process.env.RAILWAY_SERVICE_NAME || 'junesteesnthings-backend';
const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET are required (run through `railway run`).');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const verifier = crypto.randomBytes(32).toString('base64url');
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/') { res.writeHead(404).end(); return; }
  const done = (msg, code = 0) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end(msg);
    console.log(msg);
    server.close();
    process.exitCode = code;
  };
  const got = url.searchParams.get('state') || '';
  if (got.length !== state.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(state))) {
    return done('Sign-in refused: the reply did not match this request.', 1);
  }
  if (url.searchParams.get('error')) return done(`Google said: ${url.searchParams.get('error')}`, 1);
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code') || '', client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
      }).toString(),
    });
    const body = await r.json();
    if (!body.refresh_token) return done(`No refresh token came back (${body.error || r.status}).`, 1);
    /* Over stdin, so the token is never in a process list or shell history.
       Saving redeploys the backend, which is how it picks the token up. */
    const set = spawnSync('railway', ['variable', 'set', 'GOOGLE_ADS_REFRESH_TOKEN', '--stdin',
      '--service', SERVICE], { input: body.refresh_token, stdio: ['pipe', 'ignore', 'ignore'] });
    if (set.status !== 0) return done('Signed in, but saving to Railway failed. Nothing was printed; run it again.', 1);
    done('Signed in. GOOGLE_ADS_REFRESH_TOKEN saved to Railway. You can close this tab.');
  } catch (e) {
    done(`Sign-in failed: ${e.message}`, 1);
  }
});

let redirectUri;
server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}/`;
  const auth = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords', access_type: 'offline', prompt: 'consent',
    state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  console.log('Opening Google sign-in in your browser. If it does not open, visit:\n' + auth);
  spawn('open', [auth], { stdio: 'ignore', detached: true }).unref();
  setTimeout(() => { console.log('Timed out waiting for sign-in.'); process.exit(1); }, 5 * 60 * 1000).unref();
});
