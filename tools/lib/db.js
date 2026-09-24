/* The Lumise MySQL, and the one encoding it stores structured columns in.
 *
 * Every tool in this directory used to carry its own copy of both. They drifted
 * — one passed `-B` for tab-separated rows, one did not, one decoded `stages`
 * with a try/catch and one threw — so a fix made in one tool was not a fix
 * anywhere else. This is the single copy.
 *
 * Connection comes from the Railway variables the caller pipes in:
 *
 *     railway variables --service MySQL --json | node tools/<tool>.js
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

/** The MySQL connection URL from whatever shape the environment provides.
 *
 *  Railway gives a service EITHER a combined MYSQL_URL / MYSQL_PUBLIC_URL or
 *  the five discrete MYSQLHOST / MYSQLPORT / MYSQLUSER / MYSQLPASSWORD /
 *  MYSQLDATABASE variables, depending on how it was linked. junesteesnthings-
 *  backend has only the discrete five, and the nightly supplier sync asked for
 *  the combined one — so every scheduled run exited "no MySQL URL in the piped
 *  variables" before touching anything, while the log table recorded an
 *  attempt. That is the second time this sync has failed silently for weeks
 *  (the first was a hardcoded mysql binary path), and both times the symptom
 *  was a catalogue quietly going stale rather than an error anyone saw.
 *
 *  Asking for every shape here means neither the tool nor its scheduler has to
 *  know which one a given service happens to have. */
function mysqlUrlFrom(env) {
  const e = env || process.env;
  if (e.MYSQL_PUBLIC_URL) return e.MYSQL_PUBLIC_URL;
  if (e.MYSQL_URL) return e.MYSQL_URL;
  const { MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE } = e;
  if (!MYSQLHOST || !MYSQLUSER || !MYSQLDATABASE) return '';
  const cred = encodeURIComponent(MYSQLUSER) +
    (MYSQLPASSWORD ? ':' + encodeURIComponent(MYSQLPASSWORD) : '');
  return 'mysql://' + cred + '@' + MYSQLHOST + ':' + (MYSQLPORT || 3306) + '/' + MYSQLDATABASE;
}

/* Where the mysql client actually is.
 *
 * This used to be one hardcoded Homebrew path, and that is the whole reason the
 * nightly supplier sync had never once succeeded in production. Railway's Node
 * image has no /usr/local/opt, so spawnSync failed with ENOENT, `r.status` came
 * back null, and the throw read "mysql exited null" — a message that says
 * nothing about a missing binary. The scheduled run claimed the day, threw, and
 * left the catalogue untouched for a fortnight while appearing to have run.
 *
 * Resolved once per process, in the order: an explicit override, the two
 * Homebrew prefixes (Intel and Apple silicon), the Debian path the deployed
 * image installs to, then whatever is on PATH. */
function resolveMysql() {
  if (process.env.JT_MYSQL_BIN) return process.env.JT_MYSQL_BIN;
  const candidates = [
    '/usr/local/opt/mysql-client/bin/mysql',    // Homebrew, Intel macOS
    '/opt/homebrew/opt/mysql-client/bin/mysql', // Homebrew, Apple silicon
    '/usr/bin/mysql',                           // Debian — the deployed image
    '/usr/local/bin/mysql',
  ];
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch { /* keep looking */ } }
  const found = spawnSync('sh', ['-c', 'command -v mysql'], { encoding: 'utf8' });
  return (found.stdout || '').trim() || null;
}

const MYSQL = resolveMysql();

/** Read the MySQL URL out of a piped `railway variables --json` payload. */
function urlFromStdinJson(buf) {
  const vars = JSON.parse(buf);
  const raw = vars.MYSQL_PUBLIC_URL || vars.MYSQL_URL;
  if (!raw) throw new Error('no MYSQL_PUBLIC_URL or MYSQL_URL in the piped variables');
  return raw;
}

/** Run SQL. `rows:true` parses the tab-separated result into objects. */
function mysql(url, sql, { rows = false } = {}) {
  const u = new URL(url);
  const args = ['-h', u.hostname, '-P', u.port || '3306',
    '-u', decodeURIComponent(u.username), '--protocol=TCP',
    '--default-character-set=utf8mb4', '-e', sql,
    u.pathname.replace(/^\//, '') || 'railway'];
  /* Named loudly. A missing client is a deployment problem, and reporting it as
     an exit code sent the last one undiagnosed for a fortnight. */
  if (!MYSQL) {
    throw new Error('no mysql client on this machine — install one, or set ' +
      'JT_MYSQL_BIN to its path');
  }
  const r = spawnSync(MYSQL, rows ? ['-B', ...args] : args, {
    env: Object.assign({}, process.env, { MYSQL_PWD: decodeURIComponent(u.password) }),
    encoding: 'utf8',
    stdio: rows ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
    /* spawnSync's default is 1MB, and `variations` is MEDIUMTEXT now — one
       product holds 128KB of per-colourway art, so selecting the column across
       the catalogue exceeds it. The failure is ENOBUFS, which names a buffer
       and not the column that outgrew it, and it arrives only once enough art
       has been wired for the query to get big. Sized well past anything this
       schema can produce in one read. */
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error || r.status !== 0) {
    throw new Error('mysql (' + MYSQL + ') failed: ' +
      (r.error ? r.error.code || r.error.message : 'exit ' + r.status));
  }
  if (!rows) return null;
  const lines = r.stdout.replace(/\n$/, '').split('\n');
  if (lines.length < 2) return [];
  const head = lines[0].split('\t');
  return lines.slice(1).map((l) =>
    Object.fromEntries(l.split('\t').map((v, i) => [head[i], v])));
}

/* Lumise stores `calculate`, `stages`, `attributes` and `printings` as
   base64(urlencode(json)) — what its own lib->enjson() produces. `printings` is
   the exception: it is urlencode(json) with no base64 layer. */
const enjson = (o) =>
  Buffer.from(encodeURIComponent(JSON.stringify(o)), 'utf8').toString('base64');

/** Inverse of enjson. Returns null rather than throwing on a corrupt column. */
function dejson(b64) {
  try {
    return JSON.parse(decodeURIComponent(Buffer.from(String(b64), 'base64').toString('utf8')));
  } catch { return null; }
}

/* `products.printings` — urlencoded JSON keyed "_<id>", e.g. {"_1":"A3"}. The
   value is the paper size a `size`-type method prices on; every other type
   ignores it, but it must be present or a size-type print costs $0.
   jt_printing_ids() in the designer (jt-auth.php:19) is the reader. */
const encodePrintings = (ids, size = 'A3') =>
  encodeURIComponent(JSON.stringify(Object.fromEntries(ids.map((i) => ['_' + i, size]))));

/** Ids out of a `printings` column, tolerating the legacy "1,2,3" CSV form. */
function decodePrintings(prt) {
  prt = String(prt == null ? '' : prt);
  if (prt === '' || prt === '%7B%7D') return [];
  let decoded = null;
  try { decoded = JSON.parse(decodeURIComponent(prt)); } catch { decoded = null; }
  const ids = decoded && typeof decoded === 'object'
    ? Object.keys(decoded).map((k) => parseInt(String(k).replace(/[^0-9]/g, ''), 10))
    : prt.split(',').map((s) => parseInt(s, 10));
  return [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))];
}

/** Single-quoted SQL literal. */
const sq = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

module.exports = {
  mysqlUrlFrom, MYSQL, resolveMysql, urlFromStdinJson, mysql, enjson, dejson, encodePrintings, decodePrintings, sq };
