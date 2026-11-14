'use strict';

/* New business contacts join the Brevo "Business" list (owner, 2026-11-14:
 * "add new businesses"). The rule is the email's domain (tools/lib/business-
 * contact.js), applied on the Brevo client every contact write passes through
 * (joinBusinessList in server.js), and the list must never cost a contact.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const axios = require('axios');
const B = require('../tools/lib/business-contact');

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

test('a custom domain is a business; personal, test, typo and our own domains are not', () => {
  for (const e of ['owner@threegreenllc.com', 'Pastor@StPaulDorchester.COM', 'coach@mundelein.org', 'a@cps.edu']) {
    assert.ok(B.isBusinessEmail(e), e);
  }
  for (const e of ['ann@gmail.com', 'x@yahoo.fr', 'y@hotmail.it', 'z@icloud.com', 'q@gmail.con', 't@example.invalid',
    'staff@jtees.net', 'not-an-email', '', null]) {
    assert.ok(!B.isBusinessEmail(e), String(e));
  }
});

test('the list is 11 unless set, and can be switched off', () => {
  assert.strictEqual(B.businessListId({}), 11);
  assert.strictEqual(B.businessListId({ BREVO_BUSINESS_LIST_ID: '14' }), 14);
  assert.strictEqual(B.businessListId({ BREVO_BUSINESS_LIST_ID: 'off' }), null);
  assert.strictEqual(B.businessListId({ BREVO_BUSINESS_LIST_ID: 'abc' }), null);
});

test('the list is added, never duplicated, and a personal contact is left exactly as it was', () => {
  const biz = B.withBusinessList({ email: 'a@acme.co', listIds: [2] }, {});
  assert.deepStrictEqual(biz.listIds, [2, 11]);
  const again = B.withBusinessList(biz, {});
  assert.strictEqual(again, biz);
  const personal = { email: 'a@gmail.com', listIds: [2] };
  assert.strictEqual(B.withBusinessList(personal, {}), personal);
  const noList = B.withBusinessList({ email: 'a@acme.co' }, {});
  assert.deepStrictEqual(noList.listIds, [11]);
});

/* ── on a real axios client, against a fake Brevo ─────────────────────────── */

const joinBusinessList = vm.runInThisContext(`((BUSINESS) => {
  ${extractFn('function contactWriteBody(')}
  ${extractFn('function joinBusinessList(')}
  return joinBusinessList;
})`)(B);

function fakeBrevo({ refuseList = null, refuseAll = null } = {}) {
  const sent = [];
  const adapter = async (config) => {
    const body = JSON.parse(config.data);
    sent.push({ url: config.url, body });
    const refuse = (code, msg) => {
      const response = { status: code, statusText: 'x', headers: {}, config, data: { code: 'x', message: msg } };
      throw new axios.AxiosError(`Request failed with status code ${code}`, 'ERR_BAD_REQUEST', config, null, response);
    };
    if (refuseAll) refuse(refuseAll, 'Key not found');
    if (refuseList && (body.listIds || []).includes(refuseList)) refuse(404, 'List ID does not exist');
    return { status: 201, statusText: 'Created', headers: {}, config, data: { id: sent.length } };
  };
  const client = joinBusinessList(axios.create({ baseURL: 'https://api.brevo.test/v3', adapter }));
  return { client, sent };
}

test('a business contact write carries the business list', async () => {
  const { client, sent } = fakeBrevo();
  await client.post('/contacts', { email: 'owner@acme.co', listIds: [2], updateEnabled: true });
  assert.deepStrictEqual(sent[0].body.listIds, [2, 11]);
});

test('a personal contact write is sent untouched', async () => {
  const { client, sent } = fakeBrevo();
  await client.post('/contacts', { email: 'ann@gmail.com', listIds: [2] });
  assert.deepStrictEqual(sent[0].body.listIds, [2]);
});

test('if Brevo refuses the list, the contact is still saved without it', async () => {
  const { client, sent } = fakeBrevo({ refuseList: 11 });
  const r = await client.post('/contacts', { email: 'owner@acme.co', listIds: [2], attributes: { FIRSTNAME: 'A' } });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(sent.length, 2);
  assert.deepStrictEqual(sent[1].body.listIds, [2]);
  assert.strictEqual(sent[1].body.attributes.FIRSTNAME, 'A');
});

test('a dead key or outage is not retried here (no duplicate calls)', async () => {
  const { client, sent } = fakeBrevo({ refuseAll: 401 });
  await assert.rejects(client.post('/contacts', { email: 'owner@acme.co', listIds: [2] }));
  assert.strictEqual(sent.length, 1);
});

test('reads and other routes are never touched', async () => {
  const { client, sent } = fakeBrevo();
  await client.post('/contacts/lists/2/contacts/add', { emails: ['owner@acme.co'] });
  assert.ok(!('listIds' in sent[0].body));
});

test('the Brevo client is built with the business-list rule outermost', () => {
  assert.match(src, /const brevo = joinBusinessList\(keepFirstSource\(keepContactsWhenPhoneFails\(explainFailures\(/);
});

test('an unsubscribe never joins (or creates someone on) the business list', async () => {
  const { client, sent } = fakeBrevo();
  await client.post('/contacts', { email: 'jane@acme.org', emailBlacklisted: true, updateEnabled: true });
  assert.ok(!('listIds' in sent[0].body));
});

test('a refusal about something other than the list is not retried', async () => {
  const sent = [];
  const adapter = async (config) => {
    sent.push(JSON.parse(config.data));
    const response = { status: 400, statusText: 'x', headers: {}, config, data: { code: 'invalid_parameter', message: 'Invalid attribute FOO' } };
    throw new axios.AxiosError('Request failed with status code 400', 'ERR_BAD_REQUEST', config, null, response);
  };
  const client = joinBusinessList(axios.create({ baseURL: 'https://api.brevo.test/v3', adapter }));
  await assert.rejects(client.post('/contacts', { email: 'owner@acme.co', listIds: [2] }));
  assert.strictEqual(sent.length, 1);
});

test('a mistyped list setting is said out loud, not silently off', () => {
  const warn = console.warn; let said = '';
  console.warn = (m) => { said += m; };
  try {
    delete B.businessListId.warned;
    assert.strictEqual(B.businessListId({ BREVO_BUSINESS_LIST_ID: '#11' }), null);
  } finally { console.warn = warn; }
  assert.match(said, /not a list id/);
});
