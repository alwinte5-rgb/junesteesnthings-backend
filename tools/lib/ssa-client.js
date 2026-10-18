/* The S&S API client: auth, the 60-a-minute spacing, retries, and the line
 * between "S&S said no" (throws) and "S&S did not answer" (throws, retried).
 *
 * Lived in tools/ssa-add-products.js; tools/publish-staged.js needs the same
 * rules, so both read this copy. (tools/ssa-sync.js still has its own, with a
 * faster 350 ms spacing for its nightly sweep.) */
let last = 0;
function makeClient(acct, key) {
  const auth = 'Basic ' + Buffer.from(acct + ':' + key).toString('base64');
  return async function ssa(path, tries = 5) {
    let st = 0;
    for (let i = 0; i < tries; i++) {
      const wait = Math.max(0, last + 1000 - Date.now())  /* S&S: 60 a minute (Codex #232) */ + (i ? 1200 * i * i : 0);
      if (wait) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      try {
        const r = await fetch('https://api.ssactivewear.com/v2/' + path,
          { headers: { Authorization: auth }, signal: AbortSignal.timeout(30000) });
        st = r.status;
        if (r.status === 429 || r.status >= 500) continue;
        if (r.status === 404) return null;                  // answered: not there
        /* Anything else — 401 above all — is the API refusing to talk, not the
           API saying the style is absent. Returning null here made a dead key
           print "no such style at S&S" once per style and exit 0, which reads
           as a catalogue problem and sends you looking at S&S's data instead of
           at the credential. ssa-sync.js has drawn this line since it was
           written; this is the same line, in the tool that was missing it. */
        if (!r.ok) throw new Error('S&S returned ' + r.status + ' for ' + path);
        return await r.json();
      } catch (e) {
        /* Let our own refusal out. Without this the throw above is caught as
           if it were a timeout and retried five times, so a dead key costs
           five requests per style and still reports a retry exhaustion rather
           than the 401 that caused it. Same guard as ssa-sync.js. */
        if (e.message && e.message.startsWith('S&S returned')) throw e;
        /* anything else — timeout, socket — is worth retrying */
      }
    }
    /* Throwing rather than returning null: a throttled call must never be
       mistaken for "this style does not exist", which would add nothing and
       report success. */
    throw new Error('S&S unreachable (last ' + st + '): ' + path);
  };
}

/* ── Encoding, matching lumise's lib->enjson() ───────────────────────────── */

const enjson = (o) => Buffer.from(encodeURIComponent(JSON.stringify(o)), 'utf8').toString('base64');

module.exports = { makeClient };
