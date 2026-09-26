'use strict';

/* Brevo gets every customer's details (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * On 2026-09-26 the owner switched HubSpot off "as long as Brevo is collecting
 * customer information" — and it was not:
 *
 *  - Brevo's SMS attribute must be E.164. The quote form sent the phone as
 *    typed, "(773) 555-1234", and checkout has sent the billing phone since
 *    2026-09-01; Brevo answers "Invalid phone number" and refuses the WHOLE
 *    contact, email and address included. Only the quote builder converted it.
 *  - A phone already on another contact (a family's or office's shared number)
 *    is refused the same way.
 *  - Brevo had also been refusing every call from the server (its IP block),
 *    and a failed sync was never tried again.
 *
 * So: the phone rule lives on the Brevo client (keepContactsWhenPhoneFails),
 * and failed enquiry syncs are retried hourly (brevoCatchUp).
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const axios = require('axios');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extractFn(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  const open = src.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated function reading \`${anchor}\``);
}

/* ── the phone rule, on a real axios client against a fake Brevo ─────────── */

const keepContactsWhenPhoneFails = vm.runInThisContext(`(() => {
  ${extractFn('function toE164(')}
  ${extractFn('function keepContactsWhenPhoneFails(')}
  return keepContactsWhenPhoneFails;
})()`);

/* A Brevo that behaves like the real one where it matters: a phone that is not
   E.164, or that another contact already has, fails the whole write with 400. */
function fakeBrevo({ taken = [], status = null, message = '' } = {}) {
  const sent = [];
  const adapter = async (config) => {
    const body = JSON.parse(config.data);
    sent.push({ url: config.url, body });
    const sms = body.attributes && body.attributes.SMS;
    const refuse = (code, msg) => {
      const response = { status: code, statusText: 'x', headers: {}, config, data: { code: 'x', message: msg } };
      throw new axios.AxiosError(`Request failed with status code ${code}`, 'ERR_BAD_REQUEST', config, null, response);
    };
    if (status) refuse(status, message);
    if (sms && !/^\+\d{11,15}$/.test(sms)) refuse(400, 'Invalid phone number');
    if (sms && taken.includes(sms)) refuse(400, 'Unable to create contact, SMS is already associated with another Contact');
    return { status: 201, statusText: 'Created', headers: {}, config, data: { id: sent.length } };
  };
  const client = keepContactsWhenPhoneFails(axios.create({ baseURL: 'https://api.brevo.test/v3', adapter }));
  return { client, sent };
}

const quiet = (fn) => async () => {
  const warn = console.warn; console.warn = () => {};
  try { await fn(); } finally { console.warn = warn; }
};

test('a phone typed the US way is sent as +1XXXXXXXXXX', async () => {
  const b = fakeBrevo();
  await b.client.post('/contacts', { email: 'a@b.com', attributes: { FIRSTNAME: 'Ada', SMS: '(773) 555-1234' } });
  assert.strictEqual(b.sent[0].body.attributes.SMS, '+17735551234');
  assert.strictEqual(b.sent[0].body.attributes.FIRSTNAME, 'Ada', 'the other attributes travel untouched');
});

test('a phone that cannot be made valid is dropped, not sent to sink the contact', async () => {
  const b = fakeBrevo();
  await b.client.post('/contacts', { email: 'a@b.com', attributes: { SMS: '555-12' } });
  assert.strictEqual('SMS' in b.sent[0].body.attributes, false);
  await b.client.post('/contacts', { email: 'a@b.com', attributes: { SMS: '' } });
  assert.strictEqual('SMS' in b.sent[1].body.attributes, false, 'an empty phone is absent, not blank');
});

test('a shared phone keeps the contact: retried once without the phone', quiet(async () => {
  const b = fakeBrevo({ taken: ['+17735551234'] });
  const r = await b.client.post('/contacts',
    { email: 'sister@b.com', attributes: { FIRSTNAME: 'Bea', SMS: '773-555-1234' }, listIds: [3] });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(b.sent.length, 2);
  assert.strictEqual('SMS' in b.sent[1].body.attributes, false);
  assert.strictEqual(b.sent[1].body.email, 'sister@b.com');
  assert.strictEqual(b.sent[1].body.attributes.FIRSTNAME, 'Bea');
  assert.strictEqual(b.sent[1].body.listIds[0], 3, 'still subscribed where it was meant to be');
}));

test('the retry happens once — a second refusal is returned, not looped on', quiet(async () => {
  const b = fakeBrevo({ status: 400, message: 'Invalid phone number' });
  await assert.rejects(b.client.post('/contacts', { email: 'a@b.com', attributes: { SMS: '7735551234' } }));
  assert.strictEqual(b.sent.length, 2);
}));

test('a refusal that is not about the phone is not retried', async () => {
  const b = fakeBrevo({ status: 400, message: 'Invalid email address' });
  await assert.rejects(b.client.post('/contacts', { email: 'bad', attributes: { SMS: '7735551234' } }));
  assert.strictEqual(b.sent.length, 1);
});

test('Brevo refusing the server (401) is not retried', async () => {
  const b = fakeBrevo({ status: 401, message: 'We have detected you are using an unrecognised IP address' });
  await assert.rejects(b.client.post('/contacts', { email: 'a@b.com', attributes: { SMS: '7735551234' } }));
  assert.strictEqual(b.sent.length, 1);
});

test('a phone-only contact is not retried without its phone — it would have no key', async () => {
  const b = fakeBrevo({ taken: ['+17735551234'] });
  await assert.rejects(b.client.post('/contacts', { attributes: { SMS: '7735551234' } }));
  assert.strictEqual(b.sent.length, 1);
});

test('the rule is on the client every contact write uses', () => {
  assert.match(src, /const brevo = keepContactsWhenPhoneFails\(/);
});

/* ── every enquiry reaches Brevo eventually ───────────────────────────────── */

function catchUp({ rows, fail = {}, attempts = {} }) {
  const calls = { synced: [], marked: [], counted: [], reported: [] };
  const sandbox = {
    process: { env: { BREVO_API_KEY: 'k' } },
    BREVO_CATCH_UP_SINCE: '2026-09-26', BREVO_CATCH_UP_TRIES: 5,
    pool: {
      query: async (sql, params) => {
        if (/^\s*SELECT/.test(sql)) return { rows };
        if (/brevo_synced_at = NOW\(\)/.test(sql)) { calls.marked.push(params[0]); return { rows: [] }; }
        if (/brevo_attempts = COALESCE/.test(sql)) {
          attempts[params[0]] = (attempts[params[0]] || 0) + 1;
          calls.counted.push(params[0]);
          return { rows: [{ brevo_attempts: attempts[params[0]] }] };
        }
        throw new Error('unexpected SQL: ' + sql);
      },
    },
    syncToBrevo: async (s) => {
      if (fail[s.id]) { const e = new Error('Brevo POST /contacts -> ' + fail[s.id]); e.response = { status: fail[s.id] }; throw e; }
      calls.synced.push(s.id);
    },
    reportError: (kind, err, ctx) => { calls.reported.push([kind, ctx]); return Promise.resolve(); },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFn('async function brevoCatchUp('), sandbox);
  return sandbox.brevoCatchUp().then((out) => ({ out, ...calls }));
}

test('an enquiry that failed is synced, then marked', async () => {
  const r = await catchUp({ rows: [{ id: 7, name: 'A', email: 'a@b.com', phone: '7735551234' }] });
  assert.deepStrictEqual([...r.synced], [7]);
  assert.deepStrictEqual([...r.marked], [7]);
  assert.match(r.out, /1 synced/);
});

test('Brevo refusing the server stops the batch quietly — the breach monitor says it daily', async () => {
  const r = await catchUp({ rows: [{ id: 1 }, { id: 2 }], fail: { 1: 401 } });
  assert.strictEqual(r.synced.length, 0);
  assert.strictEqual(r.counted.length, 0, 'an outage is not the row\'s fault; its tries are kept');
  assert.strictEqual(r.reported.length, 0, 'no hourly repeat of the daily alert');
  assert.match(r.out, /refusing the server \(401\), 2 waiting/);
});

test('a row Brevo keeps refusing is counted, and reported once — when given up on', async () => {
  const attempts = { 3: 3 };
  let r = await catchUp({ rows: [{ id: 3 }, { id: 4 }], fail: { 3: 400 }, attempts });
  assert.deepStrictEqual([...r.counted], [3]);
  assert.strictEqual(r.reported.length, 0, 'four tries in: not yet');
  assert.deepStrictEqual([...r.synced], [4], 'one bad row does not hold up the rest');
  r = await catchUp({ rows: [{ id: 3 }], fail: { 3: 400 }, attempts });
  assert.strictEqual(r.reported.length, 1);
  assert.strictEqual(r.reported[0][0], 'brevo-catch-up');
});

test('the catch-up leaves out older rows and enquiries that skipped the spam check', () => {
  const fn = extractFn('async function brevoCatchUp(');
  assert.match(fn, /brevo_synced_at IS NULL/);
  assert.match(fn, /human_check IS DISTINCT FROM 'missing'/, 'a token-less enquiry never goes to a Brevo list');
  assert.match(fn, /created_at >= \$1/, 'rows from before tracking may have been removed from Brevo on purpose');
});

test('the catch-up runs in the hourly sweep', () => {
  const sweep = src.slice(src.indexOf('const runSweep'));
  assert.ok(sweep.includes('brevoCatchUp'), 'a retry nothing calls is not a retry');
});

/* ── the enquiry route ────────────────────────────────────────────────────── */

const submitAt = src.indexOf("app.post('/submit'");
const submit = src.slice(submitAt, src.indexOf('\n});', submitAt));

test('a synced enquiry is marked so the catch-up leaves it alone', () => {
  assert.match(submit, /brevoResult\.status === 'fulfilled' && !unverified/);
  assert.match(submit, /SET brevo_synced_at = NOW\(\)/);
});
