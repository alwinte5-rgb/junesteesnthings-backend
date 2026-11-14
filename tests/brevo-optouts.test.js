'use strict';

/* Opt-outs reach Brevo's blocklist (server.js pushOptoutsToBrevo).
 *
 * Run: node --test tests/*.test.js
 *
 * The app's one-click unsubscribe wrote only to its own email_optouts table.
 * Campaigns are sent from Brevo, which never saw it, so a customer who
 * unsubscribed from an app email kept getting every Brevo campaign (found in
 * the 2026-11-14 Brevo audit). Each opt-out is now pushed as a blocklisted
 * contact and stamped once Brevo has it; unstamped rows, including every
 * opt-out from before, are sent by the hourly sweep.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extract(name) {
  const at = src.indexOf(`async function ${name}(`);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', src.indexOf(')', at)); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

const quiet = { error() {}, log() {}, warn() {} };

/* A pool holding opt-out rows; `synced` records the stamps. */
function fakePool(emails) {
  const rows = emails.map((email) => ({ email, brevo_synced_at: null, brevo_attempts: 0 }));
  const queries = [];
  return {
    rows, queries,
    async query(sql, params = []) {
      queries.push({ sql, params });
      if (/^SELECT email FROM email_optouts/.test(sql)) {
        const single = /email = \$1/.test(sql);
        const cap = single ? params[1] : params[0];
        const open = rows.filter((r) => !r.brevo_synced_at && r.brevo_attempts < cap && (!single || r.email === params[0]));
        return { rows: open.slice(0, 100).map(({ email }) => ({ email })) };
      }
      if (/^UPDATE email_optouts SET brevo_synced_at/.test(sql)) {
        rows.find((r) => r.email === params[0]).brevo_synced_at = 'now';
        return { rows: [] };
      }
      if (/^UPDATE email_optouts SET brevo_attempts/.test(sql)) {
        const r = rows.find((x) => x.email === params[0]);
        r.brevo_attempts++;
        return { rows: [{ brevo_attempts: r.brevo_attempts }] };
      }
      throw new Error('unexpected SQL: ' + sql);
    },
  };
}

/* `fail` maps an email to the status Brevo refuses it with. */
function fakeBrevo(fail = {}) {
  const calls = [];
  return {
    calls,
    async post(url, body, opts) {
      calls.push({ url, body, opts });
      const code = fail[body.email];
      if (code) { const e = new Error(`Brevo POST ${url} -> ${code}`); e.response = { status: code }; throw e; }
      return { data: {} };
    },
  };
}

const make = vm.runInThisContext(`((pool, brevo, process, console, reportError, BREVO_CATCH_UP_TRIES) => {
  ${extract('pushOptoutsToBrevo')}
  return pushOptoutsToBrevo;
})`);

const reports = [];
const run = (pool, brevo, only, env = { BREVO_API_KEY: 'k' }) =>
  make(pool, brevo, { env }, quiet, async (...a) => { reports.push(a); }, 5)(only);

test('every unsent opt-out goes to Brevo as a blocklisted contact, and is stamped', async () => {
  const pool = fakePool(['a@example.com', 'b@example.com']);
  const brevo = fakeBrevo();
  const said = await run(pool, brevo);
  assert.deepStrictEqual(brevo.calls.map((c) => c.body), [
    { email: 'a@example.com', emailBlacklisted: true, updateEnabled: true },
    { email: 'b@example.com', emailBlacklisted: true, updateEnabled: true },
  ]);
  assert.ok(brevo.calls.every((c) => c.url === '/contacts'));
  assert.ok(brevo.calls.every((c) => c.opts && c.opts.timeout > 0), 'a hung call must not stall the sweep');
  assert.ok(pool.rows.every((r) => r.brevo_synced_at), 'both stamped');
  assert.strictEqual(said, '2 sent to Brevo');
});

test('a stamped opt-out is not sent again', async () => {
  const pool = fakePool(['a@example.com']);
  await run(pool, fakeBrevo());
  const again = fakeBrevo();
  assert.strictEqual(await run(pool, again), '');
  assert.strictEqual(again.calls.length, 0);
});

test('a refused row stays unstamped for the next hour, and the rest still go', async () => {
  const pool = fakePool(['bad@example.com', 'ok@example.com']);
  const said = await run(pool, fakeBrevo({ 'bad@example.com': 400 }));
  assert.strictEqual(pool.rows[0].brevo_synced_at, null);
  assert.ok(pool.rows[1].brevo_synced_at);
  assert.strictEqual(said, '1 sent to Brevo');
});

test('a row refused five times is given up on and reported once', async () => {
  reports.length = 0;
  const pool = fakePool(['bad@example.com']);
  for (let i = 0; i < 7; i++) await run(pool, fakeBrevo({ 'bad@example.com': 400 }));
  assert.strictEqual(pool.rows[0].brevo_attempts, 5, 'not tried after the fifth refusal');
  assert.strictEqual(reports.length, 1);
  assert.strictEqual(reports[0][0], 'brevo-optout');
});

test('a 401 is Brevo refusing the server: stop, stamp nothing more, say so', async () => {
  const pool = fakePool(['a@example.com', 'b@example.com']);
  const brevo = fakeBrevo({ 'a@example.com': 401 });
  const said = await run(pool, brevo);
  assert.strictEqual(brevo.calls.length, 1, 'no point trying the rest');
  assert.ok(pool.rows.every((r) => !r.brevo_synced_at && r.brevo_attempts === 0), 'a 401 is not the row\'s fault');
  assert.match(said, /401/);
});

test('the unsubscribe itself sends only that one address', async () => {
  const pool = fakePool(['old@example.com', 'new@example.com']);
  const brevo = fakeBrevo();
  await run(pool, brevo, 'new@example.com');
  assert.deepStrictEqual(brevo.calls.map((c) => c.body.email), ['new@example.com']);
  assert.strictEqual(pool.rows[0].brevo_synced_at, null, 'the backlog is the sweep\'s job');
});

test('a given-up address is not retried or reported again when the link is clicked again', async () => {
  reports.length = 0;
  const pool = fakePool(['bad@example.com']);
  for (let i = 0; i < 5; i++) await run(pool, fakeBrevo({ 'bad@example.com': 400 }));
  const again = fakeBrevo({ 'bad@example.com': 400 });
  await run(pool, again, 'bad@example.com');
  assert.strictEqual(again.calls.length, 0);
  assert.strictEqual(reports.length, 1);
});

test('with no Brevo key it does nothing', async () => {
  const pool = fakePool(['a@example.com']);
  assert.strictEqual(await run(pool, fakeBrevo(), undefined, {}), '');
  assert.strictEqual(pool.queries.length, 0);
});

test('wired in: the column exists, unsubscribe pushes, the sweep pushes the backlog', () => {
  assert.match(src, /ALTER TABLE email_optouts ADD COLUMN IF NOT EXISTS brevo_synced_at TIMESTAMPTZ/);
  assert.match(src, /ALTER TABLE email_optouts ADD COLUMN IF NOT EXISTS brevo_attempts INTEGER NOT NULL DEFAULT 0/);
  assert.match(extract('doUnsubscribe'), /pushOptoutsToBrevo\(String\(email\)\.toLowerCase\(\)\)\.catch\(/);
  assert.match(src, /await step\('brevo opt-outs', \(\) => pushOptoutsToBrevo\(\)\);/);
});
