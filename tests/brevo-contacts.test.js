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
  ${extractFn('function contactWriteBody(')}
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
  assert.match(src, /const brevo = (keepFirstSource\()?keepContactsWhenPhoneFails\(/);
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

/* ── where each contact came from (Brevo SOURCE + LAST_SOURCE) ─────────────
   Owner, 2026-10-31: 656 of 924 contacts had no SOURCE, because only the
   designer's /api/crm-contact wrote one. Now: SOURCE = the FIRST way in, never
   overwritten; LAST_SOURCE = the latest. The rule is on the shared client
   (keepFirstSource), so every writer, /api/crm-contact included, obeys it. */

const fnBody = (anchor) => { const at = src.indexOf(anchor); assert.notStrictEqual(at, -1, anchor); return src.slice(at, src.indexOf('\n}\n', at) + 2); };

/* The real client stack and writers, against a Brevo that behaves like the
   real one where it matters: an upsert; a phone another contact has is
   refused 400 (`taken`), which keepContactsWhenPhoneFails answers by retrying
   without it. `known` maps an email or phone to the contact's attributes. */
function sourceSandbox({ known = {}, taken = [], status = null, getStatus = null } = {}) {
  const posted = [], looked = [];
  const have = new Map(Object.entries(known));
  const adapter = async (config) => {
    const res = (code, data) => {
      const r = { status: code, statusText: 'x', headers: {}, config, data };
      if (code >= 400) throw new axios.AxiosError('Request failed with status code ' + code, 'ERR_BAD_REQUEST', config, null, r);
      return r;
    };
    if (config.method === 'get') {
      looked.push(config.url);
      if (getStatus) return res(getStatus, {});
      const key = decodeURIComponent(config.url.slice('/contacts/'.length).split('?')[0]);
      return have.has(key) ? res(200, { id: 5, attributes: have.get(key) }) : res(404, { code: 'document_not_found' });
    }
    const body = JSON.parse(config.data);
    posted.push(body);
    if (status) return res(status, { code: 'x', message: 'down' });
    const sms = body.attributes && body.attributes.SMS;
    if (sms && taken.includes(sms)) return res(400, { code: 'duplicate_parameter', message: 'Unable to create contact, SMS is already associated with another Contact' });
    const key = body.email ? String(body.email).toLowerCase() : body.SMS || sms;   // Brevo ignores email case
    if (have.has(key)) return res(204, '');
    have.set(key, body.attributes);
    return res(201, { id: 900 + posted.length });
  };
  const ctx = { process: { env: {} }, console: { warn() {}, error() {} }, isSpamName: () => false, parseInt };
  vm.createContext(ctx);
  vm.runInContext([src.slice(src.indexOf('const LEAD_SOURCES = {'), src.indexOf('};', src.indexOf('const LEAD_SOURCES = {')) + 2),
    extractFn('function toE164('), extractFn('function contactWriteBody('), extractFn('function keepContactsWhenPhoneFails('),
    fnBody('function keepFirstSource('), extractFn('function brevoLeadSource('), fnBody('async function syncToBrevo('),
    fnBody('async function syncTawkContactToBrevo('),
    'this.f = { keepFirstSource, keepContactsWhenPhoneFails, brevoLeadSource, syncToBrevo, syncTawkContactToBrevo };'].join('\n'), ctx);
  ctx.brevo = ctx.f.keepFirstSource(ctx.f.keepContactsWhenPhoneFails(axios.create({ baseURL: 'https://api.brevo.test/v3', adapter })));
  return { ...ctx.f, brevo: ctx.brevo, posted, looked, last: () => posted[posted.length - 1] };
}

test('the live Brevo client carries the rule', () => {
  assert.match(src, /const brevo = keepFirstSource\(keepContactsWhenPhoneFails\(/);
});

test('an enquiry names the form it came from, in one spelling per channel', () => {
  const { brevoLeadSource } = sourceSandbox();
  assert.strictEqual(brevoLeadSource(undefined), 'quote-form', 'the quote form leaves submissions.source empty');
  assert.strictEqual(brevoLeadSource('embroidery'), 'embroidery-form');
  assert.strictEqual(brevoLeadSource('designer'), 'design-lead');
  assert.strictEqual(brevoLeadSource('chat'), 'chat', 'the same value the tawk path writes');
  assert.strictEqual(brevoLeadSource('offline'), 'chat');
  assert.strictEqual(brevoLeadSource('Text'), 'lead-text', 'Leads page keys, lower-cased');
  assert.strictEqual(brevoLeadSource('!!!'), 'lead-other', 'never "lead-" or a new spelling');
});

test('a new contact gets SOURCE and LAST_SOURCE', async () => {
  const b = sourceSandbox();
  await b.syncToBrevo({ name: 'Ann Lee', email: 'ann@x.com', phone: '', source: 'embroidery' });
  assert.strictEqual(b.posted.length, 1);
  assert.strictEqual(b.posted[0].attributes.SOURCE, 'embroidery-form');
  assert.strictEqual(b.posted[0].attributes.LAST_SOURCE, 'embroidery-form');
});

test('a known contact keeps its first way in; the new one is LAST_SOURCE', async () => {
  const b = sourceSandbox({ known: { 'ann@x.com': { SOURCE: 'quote-form' } } });
  await b.syncToBrevo({ name: 'Ann Lee', email: 'Ann@X.com', phone: '', source: 'manual' });
  assert.match(b.looked[0], /ann%40x\.com$/, 'looked up lower-cased');
  assert.ok(!('SOURCE' in b.last().attributes), 'a lead typed in by hand does not replace the real way in');
  assert.strictEqual(b.last().attributes.LAST_SOURCE, 'lead-manual');
  assert.strictEqual(b.last().attributes.FIRSTNAME, 'Ann', 'the rest of the write still lands');
  // /api/crm-contact (a designer sign-in) goes through the same client:
  await b.brevo.post('/contacts', { email: 'ann@x.com', attributes: { SOURCE: 'login-designer' }, updateEnabled: true });
  assert.ok(!('SOURCE' in b.last().attributes));
  assert.strictEqual(b.last().attributes.LAST_SOURCE, 'login-designer', 'the sign-in links still show');
});

test('a known contact with no SOURCE yet gets one from its next touch', async () => {
  const b = sourceSandbox({ known: { 'ann@x.com': { FIRSTNAME: 'Ann' } } });
  await b.syncToBrevo({ name: 'Ann Lee', email: 'ann@x.com', phone: '' });
  assert.strictEqual(b.last().attributes.SOURCE, 'quote-form', 'the 656 blank contacts fill in over time');
});

test('a failed look-up leaves SOURCE out rather than guess; the write still lands', async () => {
  const b = sourceSandbox({ getStatus: 500 });
  await b.syncToBrevo({ name: 'Ann', email: 'ann@x.com', phone: '', source: 'designer' });
  assert.strictEqual(b.posted.length, 1);
  assert.ok(!('SOURCE' in b.last().attributes));
  assert.strictEqual(b.last().attributes.LAST_SOURCE, 'design-lead');
});

test('a shared phone still keeps the contact, and its SOURCE', async () => {
  const b = sourceSandbox({ taken: ['+17735551234'] });
  await b.syncToBrevo({ name: 'Bea', email: 'bea@x.com', phone: '773-555-1234', source: 'embroidery' });
  assert.strictEqual(b.posted.length, 2, 'retried once without the phone, as before');
  assert.ok(!('SMS' in b.last().attributes));
  assert.strictEqual(b.last().attributes.SOURCE, 'embroidery-form');
  assert.strictEqual(b.looked.length, 1, 'the retry does not look up again');
});

test('a phone-only contact Brevo already has keeps its SOURCE', async () => {
  const b = sourceSandbox({ known: { '+17735551234': { SOURCE: 'quote-form' } } });
  await b.syncToBrevo({ name: 'Bo', email: '', phone: '(773) 555-1234', source: 'text' });
  assert.strictEqual(b.looked[0], '/contacts/%2B17735551234?identifierType=phone_id');
  assert.ok(!('SOURCE' in b.last().attributes));
  assert.strictEqual(b.last().attributes.LAST_SOURCE, 'lead-text');
});

test('a late write: new gets both, known-blank gets SOURCE only, known keeps both', async () => {
  let b = sourceSandbox();
  await b.syncToBrevo({ name: 'Ann', email: 'ann@x.com', phone: '' }, { retry: true });
  assert.strictEqual(b.last().attributes.SOURCE, 'quote-form');
  assert.strictEqual(b.last().attributes.LAST_SOURCE, 'quote-form', 'their only touch so far');
  b = sourceSandbox({ known: { 'ann@x.com': {} } });
  await b.syncToBrevo({ name: 'Ann', email: 'ann@x.com', phone: '' }, { retry: true });
  assert.strictEqual(b.last().attributes.SOURCE, 'quote-form');
  assert.ok(!('LAST_SOURCE' in b.last().attributes));
  b = sourceSandbox({ known: { 'ann@x.com': { SOURCE: 'chat' } } });
  await b.syncToBrevo({ name: 'Ann', email: 'ann@x.com', phone: '' }, { retry: true });
  assert.ok(!('SOURCE' in b.last().attributes) && !('LAST_SOURCE' in b.last().attributes),
    'an older touch must not cover a newer one');
});

test('a LAST_SOURCE the caller sets is kept', async () => {
  const b = sourceSandbox();
  await b.brevo.post('/contacts', { email: 'a@x.com', attributes: { SOURCE: 'quote-form', LAST_SOURCE: 'quote' }, updateEnabled: true });
  assert.strictEqual(b.last().attributes.LAST_SOURCE, 'quote');
});

test('any other refusal is the caller\'s error, as before', async () => {
  const b = sourceSandbox({ status: 401 });
  await assert.rejects(b.syncToBrevo({ name: 'Ann', email: 'ann@x.com', phone: '', source: 'designer' }),
    (e) => e.response.status === 401, 'brevoCatchUp reads the 401 to stop the batch');
  assert.strictEqual(b.posted.length, 1, 'no second try');
});

test('a chat: its start is a touch; its transcript names the way in only for someone new', async () => {
  let b = sourceSandbox();
  await b.syncTawkContactToBrevo({ name: 'Cy', email: 'cy@x.com' });
  assert.strictEqual(b.last().attributes.SOURCE, 'chat');
  b = sourceSandbox();
  await b.syncTawkContactToBrevo({ name: 'Cy', email: 'cy@x.com' }, { late: true });
  assert.strictEqual(b.last().attributes.SOURCE, 'chat', 'an email given only during the chat still counts');
  b = sourceSandbox({ known: { 'cy@x.com': { SOURCE: 'quote-form' } } });
  await b.syncTawkContactToBrevo({ name: 'Cy', email: 'cy@x.com' }, { late: true });
  assert.ok(!('SOURCE' in b.last().attributes) && !('LAST_SOURCE' in b.last().attributes));
  assert.match(src, /syncTawkContactToBrevo\(\{ name: transcript\.name, email: transcript\.email \}, \{ late: true \}\)/);
});

test('writes with no SOURCE pass straight through', async () => {
  const b = sourceSandbox({ known: { 'a@x.com': {} } });
  await b.brevo.post('/contacts', { email: 'a@x.com', attributes: { QUOTE_CODE: 'AB' }, updateEnabled: true });
  assert.strictEqual(b.looked.length, 0);
  assert.deepStrictEqual(Object.keys(b.posted[0].attributes), ['QUOTE_CODE']);
});

test('the hourly enquiry retry is marked late; quotes never move LAST_SOURCE', () => {
  assert.match(extractFn('async function brevoCatchUp('), /syncToBrevo\(s, \{ retry: true \}\)/);
  assert.match(fnBody('async function syncQuoteToBrevo('), /brevo\.post\('\/contacts', body, \{ jtNotLatest: true \}\)/);
});

test('the hourly retry carries each enquiry\'s source', () => {
  assert.match(extractFn('async function brevoCatchUp('), /email, source FROM submissions/);
});

test('a known contact\'s id rides back on the response, so a quote need not look it up again', async () => {
  const b = sourceSandbox({ known: { '+17735551234': { SOURCE: 'chat' } } });
  const r = await b.brevo.post('/contacts', { SMS: '+17735551234', attributes: { SOURCE: 'quote' }, updateEnabled: true });
  assert.strictEqual(r.config.jtContactId, '5', 'phone-only too, which an email look-up never found');
  assert.match(fnBody('async function syncQuoteToBrevo('), /posted\.config\.jtContactId/);
});
