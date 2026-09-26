'use strict';

/* HubSpot sync, and how any integration failure is described (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * From 2026-03-21 to 2026-09-26 every quote-form enquiry "failed" HubSpot with
 * a 405 and an empty body. The batch default-association endpoint takes only
 * POST; the code sent PUT, the verb of the SINGLE-record form. The contact and
 * deal were created each time, but the 405 threw out of syncToHubSpot and took
 * both ids with it: hubspot_deal_id was never saved, so no deal ever moved
 * stage, and every note and task sat unattached.
 *
 * It went unread for six months partly because the error digest only ever
 * said "Request failed with status code 405" — which call, nobody could tell.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

/* A HubSpot that behaves like the real one on the point that matters: the
   batch association endpoint refuses anything but POST, with an empty 405. */
function fakeHubSpot() {
  const calls = [];
  const send = (method) => async (url) => {
    calls.push({ method, url });
    if (url.includes('/batch/associate/') && method !== 'post') {
      const err = new Error('Request failed with status code 405');
      err.response = { status: 405, data: '' };
      throw err;
    }
    return { data: { id: method + '-' + calls.length } };
  };
  return { calls, client: { post: send('post'), put: send('put'), patch: send('patch'), get: send('get') } };
}

function runInSandbox(fnNames, globals) {
  const sandbox = { Promise, Date, String, console: { log() {}, warn() {}, error() {} }, ...globals };
  vm.createContext(sandbox);
  for (const name of fnNames) {
    // Keep the `async`, or the extracted body's awaits are a syntax error.
    const anchor = src.includes(`async function ${name}(`) ? `async function ${name}(` : `function ${name}(`;
    vm.runInContext(extractFn(anchor), sandbox);
  }
  return sandbox;
}

const S = { name: 'Ada Lovelace', email: 'ada@example.com', phone: '7735551234', description: '24 tees' };

/* ── the verb ─────────────────────────────────────────────────────────────── */

test('the note is linked to its contact and deal with POST, and the links succeed', async () => {
  const hs = fakeHubSpot();
  const sb = runInSandbox(['addHubSpotNote'], { hubspot: hs.client });
  await sb.addHubSpotNote(S, 'c1', 'd1');           // rejects if any link was PUT
  const links = hs.calls.filter((c) => c.url.includes('/batch/associate/'));
  assert.strictEqual(links.length, 2, 'one link to the contact, one to the deal');
  for (const l of links) assert.strictEqual(l.method, 'post', `${l.url} must be POSTed`);
});

test('the task is linked to its contact with POST', async () => {
  const hs = fakeHubSpot();
  const sb = runInSandbox(['createHubSpotTask'], { hubspot: hs.client });
  await sb.createHubSpotTask(S, 'c1');
  const links = hs.calls.filter((c) => c.url.includes('/batch/associate/'));
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].method, 'post');
});

/* ── a failed extra must not cost the records that matter ─────────────────── */

test('the contact and deal ids survive a failed note or task, and the failure is reported', async () => {
  const reported = [];
  const sb = runInSandbox(['syncToHubSpot'], {
    createOrUpdateHubSpotContact: async () => 'c1',
    createHubSpotDeal: async () => 'd1',
    addHubSpotNote: async () => { throw new Error('HubSpot POST /crm/v3/objects/notes -> 500'); },
    createHubSpotTask: async () => 't1',
    reportError: (kind, err) => { reported.push([kind, err.message]); return Promise.resolve(); },
  });
  const out = await sb.syncToHubSpot(S);
  // Field by field: an object built in the sandbox has that realm's prototype.
  assert.strictEqual(out.contactId, 'c1');
  assert.strictEqual(out.dealId, 'd1', 'the deal id is what moves the deal on later');
  assert.strictEqual(reported.length, 1);
  assert.strictEqual(reported[0][0], 'hubspot:note');
});

test('a failed contact or deal still fails the sync — there is nothing to save', async () => {
  const sb = runInSandbox(['syncToHubSpot'], {
    createOrUpdateHubSpotContact: async () => { throw new Error('HubSpot POST /crm/v3/objects/contacts -> 401'); },
    createHubSpotDeal: async () => 'd1',
    addHubSpotNote: async () => {}, createHubSpotTask: async () => {},
    reportError: () => Promise.resolve(),
  });
  await assert.rejects(sb.syncToHubSpot(S), /contacts -> 401/);
});

/* ── an integration failure names itself ──────────────────────────────────── */

function explained(service, err) {
  const inst = { interceptors: { response: { use(_ok, bad) { this.bad = bad; } } } };
  const sb = runInSandbox(['explainFailures', 'routeShape'], {});
  sb.explainFailures(inst, service);
  return inst.interceptors.response.bad(err).then(
    () => assert.fail('the interceptor must keep the request failed'), (e) => e.message);
}

test('a failure names the service, verb, route and status', async () => {
  const msg = await explained('HubSpot', {
    message: 'Request failed with status code 405',
    config: { method: 'put', url: '/crm/v4/associations/notes/contacts/batch/associate/default' },
    response: { status: 405, data: '' },
  });
  assert.strictEqual(msg, 'HubSpot PUT /crm/v4/associations/notes/contacts/batch/associate/default -> 405');
});

test("the service's own reason is kept, and ids are shaped so repeats group", async () => {
  const msg = await explained('Clover', {
    message: 'Request failed with status code 401',
    config: { method: 'get', url: '/v3/merchants/ABC123DEF456G/payments/PAY9XYZ0?expand=order' },
    response: { status: 401, data: { message: '401 Unauthorized' } },
  });
  assert.strictEqual(msg, 'Clover GET /v3/merchants/:id/payments/:id -> 401: 401 Unauthorized');
});

test('credentials never reach the message', async () => {
  const msg = await explained('Brevo', {
    message: 'Request failed with status code 401',
    config: { method: 'post', url: '/contacts', headers: { 'api-key': 'xkeysib-SECRET' } },
    response: { status: 401, data: { message: 'We have detected you are using an unrecognised IP address' } },
  });
  assert.doesNotMatch(msg, /SECRET/);
  assert.match(msg, /^Brevo POST \/contacts -> 401: We have detected/);
});

test('a request that never got an answer says so', async () => {
  const msg = await explained('Clover', {
    message: 'timeout of 0ms exceeded', code: 'ECONNABORTED',
    config: { method: 'post', url: '/v3/merchants/ABC123DEF456G/customers' },
  });
  assert.strictEqual(msg, 'Clover POST /v3/merchants/:id/customers -> ECONNABORTED');
});

test('all three integration clients are wrapped', () => {
  assert.match(src, /const brevo = explainFailures\(/);
  assert.match(src, /const hubspot = explainFailures\(/);
  assert.match(src, /explainFailures\(clover, 'Clover'\)/);
});
