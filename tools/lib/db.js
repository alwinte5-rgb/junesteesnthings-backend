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

const MYSQL = '/usr/local/opt/mysql-client/bin/mysql';

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
  const r = spawnSync(MYSQL, rows ? ['-B', ...args] : args, {
    env: Object.assign({}, process.env, { MYSQL_PWD: decodeURIComponent(u.password) }),
    encoding: 'utf8',
    stdio: rows ? ['ignore', 'pipe', 'inherit'] : ['ignore', 'inherit', 'inherit'],
  });
  if (r.status !== 0) throw new Error('mysql exited ' + r.status);
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

module.exports = { MYSQL, urlFromStdinJson, mysql, enjson, dejson, encodePrintings, decodePrintings, sq };
