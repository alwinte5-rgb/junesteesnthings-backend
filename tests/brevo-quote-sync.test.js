'use strict';

/* A quote reaches Brevo as ONE deal, and a failed sync is tried again
 * (server.js: syncQuoteToBrevo, keepBrevoIds, brevoQuoteCatchUp).
 *
 * Run: node --test tests/*.test.js
 *
 * What this pins, from 2026-09-28:
 *
 *  - From 2026-08-24 to 2026-09-26 Brevo refused the server and not one quote
 *    reached it. Enquiries had been retried hourly since 09-26; quotes never
 *    were, so a failed sync was a console line and nothing more.
 *  - The sync runs on every save, and again when an accepting customer fills in
 *    their details, and each run POSTed a new deal: a quote edited three times
 *    stood in the pipeline three times over, and kept only the newest id.
 *  - The save wrote both ids back whenever either came back, so a run whose
 *    contact step failed erased the contact id an earlier run had stored.
 *  - A cancelled quote's deal stayed open in the pipeline.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

/* A whole function by name, skipping its parameter list first: a default like
   `{ note = true } = {}` would otherwise be read as the body. */
function extract(name) {
  let at = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  let i = src.indexOf('(', at);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

const quiet = { error() {}, log() {}, warn() {} };
const STAGES = { new: 'S-new', qualifying: 'S-qual', pending: 'S-pend', won: 'S-won', lost: 'S-lost' };

/* ── the sync, against a fake Brevo ───────────────────────────────────────── */

/* `fail` maps 'VERB /path' (or 'VERB *') to the status Brevo answers with. */
function fakeBrevo(fail = {}) {
  const calls = [];
  const call = (verb) => async (url, body) => {
    calls.push({ verb, url, body });
    const code = fail[`${verb} ${url}`] || fail[`${verb} *`];
    if (code) {
      const e = new Error(`Brevo ${verb} ${url} -> ${code}`);
      e.response = { status: code, data: {} };
      throw e;
    }
    if (verb === 'POST' && url === '/crm/deals') return { data: { id: 'new-deal' } };
    if (verb === 'GET' && url.startsWith('/contacts/')) return { data: { id: 42 } };
    return { data: {} };
  };
  return { calls, client: { post: call('POST'), get: call('GET'), patch: call('PATCH') } };
}

/* In this realm (vm.runInThisContext), so what comes back compares with
   deepStrictEqual; the collaborators are parameters, shadowing any global. */
const makeSync = vm.runInThisContext(`((brevo, BREVO_PIPELINE, BREVO_STAGE, money, quoteLink, fmtDate, process, console) => {
  ${extract('toE164')}
  ${extract('quoteStage')}
  ${extract('syncQuoteToBrevo')}
  return syncQuoteToBrevo;
})`);

async function sync(q, opts, fail) {
  const b = fakeBrevo(fail);
  const syncQuoteToBrevo = makeSync(b.client, 'pipe', STAGES, (n) => '$' + Number(n || 0).toFixed(2),
    (c) => 'https://jtees.net/q/' + c, String, { env: {} }, quiet);
  const out = await syncQuoteToBrevo({ code: 'AB12CD', name: 'Dana Reed', email: 'dana@example.com',
    phone: '(312) 555-0123', total: 100, items: [], ...q }, opts);
  return { out, calls: b.calls, did: b.calls.map((c) => `${c.verb} ${c.url}`) };
}

test('a new quote: its contact, one deal, the two linked, and a note of the job', async () => {
  const { out, did } = await sync({});
  assert.deepStrictEqual(out, { contactId: '42', dealId: 'new-deal', error: null });
  assert.deepStrictEqual(did, ['POST /contacts', 'GET /contacts/dana%40example.com', 'POST /crm/deals',
    'PATCH /crm/deals/new-deal', 'POST /crm/notes']);
});

test('a quote that has a deal updates it, and makes no second one', async () => {
  const { out, calls, did } = await sync({ brevo_deal_id: 'd7', total: 250, status: 'accepted' });
  assert.ok(!did.includes('POST /crm/deals'), 'every save used to add a deal');
  const patch = calls.find((c) => c.verb === 'PATCH' && c.url === '/crm/deals/d7' && c.body.attributes);
  assert.ok(patch, 'the existing deal is updated');
  assert.strictEqual(patch.body.name, 'Quote — Dana Reed (AB12CD)');
  assert.strictEqual(patch.body.attributes.amount, 250);
  assert.strictEqual(patch.body.attributes.deal_stage, 'S-qual');
  assert.strictEqual(out.dealId, 'd7');
  assert.ok(did.includes('POST /crm/notes'), 'an edit is a new version of the job, so it is noted');
});

test('the accepting customer\'s details update the deal without a second note of the same job', async () => {
  const { did } = await sync({ brevo_deal_id: 'd7' }, { note: false });
  assert.ok(did.includes('PATCH /crm/deals/d7'));
  assert.ok(!did.includes('POST /crm/notes'));
});

test('a deal deleted in Brevo is made again, and noted', async () => {
  const { out, did } = await sync({ brevo_deal_id: 'gone' }, { note: false }, { 'PATCH /crm/deals/gone': 404 });
  assert.strictEqual(out.dealId, 'new-deal');
  assert.strictEqual(out.error, null, 'a 404 on an old deal is handled, not a failure');
  assert.ok(did.includes('POST /crm/deals'));
  assert.ok(did.includes('POST /crm/notes'), 'a new deal gets its note even when the caller asked for none');
});

test('any other refusal to update the deal is not taken as "deleted"', async () => {
  const { out, did } = await sync({ brevo_deal_id: 'd7' }, {}, { 'PATCH /crm/deals/d7': 500 });
  assert.ok(!did.includes('POST /crm/deals'), 'a Brevo hiccup must not fork the deal');
  assert.strictEqual(out.dealId, 'd7');
  assert.strictEqual(out.error.response.status, 500);
});

test('Brevo refusing the server comes back as the error, with no deal', async () => {
  const { out } = await sync({}, {}, { 'POST *': 401 });
  assert.strictEqual(out.dealId, null);
  assert.strictEqual(out.error.response.status, 401, 'the catch-up reads this to stop the batch');
});

test('a failed contact step keeps the contact id stored before', async () => {
  const { out } = await sync({ brevo_contact_id: '9' }, {}, { 'POST /contacts': 400 });
  assert.strictEqual(out.contactId, '9');
  assert.strictEqual(out.dealId, 'new-deal', 'the deal does not depend on the contact');
});

/* ── keeping the ids ──────────────────────────────────────────────────────── */

test('ids are kept with COALESCE, so a failed step never erases an earlier id', async () => {
  const seen = [];
  const keepBrevoIds = vm.runInThisContext(`((pool) => { ${extract('keepBrevoIds')} return keepBrevoIds; })`)(
    { query: async (sql, params) => { seen.push({ sql, params }); return { rows: [] }; } });
  await keepBrevoIds(5, { contactId: null, dealId: 'd1' });
  assert.match(seen[0].sql, /brevo_contact_id = COALESCE\(\$1, brevo_contact_id\)/);
  assert.match(seen[0].sql, /brevo_deal_id\s+= COALESCE\(\$2, brevo_deal_id\)/);
  assert.deepStrictEqual(seen[0].params, [null, 'd1', 5]);
  await keepBrevoIds(5, { contactId: null, dealId: null });
  assert.strictEqual(seen.length, 1, 'nothing came back: nothing is written');
});

test('the save and the accept both keep their ids that way', () => {
  const save = route("app.post(['/api/quotes', '/api/quotes/:code']");
  assert.match(save, /syncQuoteToBrevo\(q\)\.then\(ids => \{\s*keepBrevoIds\(q\.id, ids\)/);
  assert.doesNotMatch(save, /SET brevo_contact_id=\$1, brevo_deal_id=\$2/, 'the old write erased ids with nulls');
  assert.match(src, /syncQuoteToBrevo\(q, \{ note: false \}\)\.then\(\(ids\) => keepBrevoIds\(q\.id, ids\)\)/,
    'the accept path updates the deal and keeps what came back');
});

/* ── every quote reaches Brevo eventually ─────────────────────────────────── */

const makeCatchUp = vm.runInThisContext(`((pool, syncQuoteToBrevo, syncQuoteContact, reportError, process,
                                          BREVO_QUOTE_CATCH_UP_SINCE, BREVO_CATCH_UP_TRIES) => {
  ${extract('keepBrevoIds')}
  ${extract('brevoQuoteCatchUp')}
  return brevoQuoteCatchUp;
})`);

function catchUp({ rows, results = {}, attempts = {} }) {
  const calls = { select: null, kept: [], counted: [], reported: [], contact: [] };
  const pool = {
    query: async (sql, params) => {
      if (/^\s*SELECT/.test(sql)) { calls.select = { sql, params }; return { rows }; }
      if (/brevo_deal_id\s+= COALESCE/.test(sql)) { calls.kept.push(params); return { rows: [] }; }
      if (/brevo_attempts = COALESCE/.test(sql)) {
        attempts[params[0]] = (attempts[params[0]] || 0) + 1;
        calls.counted.push(params[0]);
        return { rows: [{ brevo_attempts: attempts[params[0]] }] };
      }
      throw new Error('unexpected SQL: ' + sql);
    },
  };
  const syncQuoteToBrevo = async (q) => {
    const r = results[q.id];
    if (typeof r === 'number') {
      const e = new Error('Brevo -> ' + r);
      e.response = { status: r };
      return { contactId: null, dealId: null, error: e };
    }
    return { contactId: 'c' + q.id, dealId: 'd' + q.id, error: null };
  };
  const run = makeCatchUp(pool, syncQuoteToBrevo,
    (...args) => { calls.contact.push(args); return Promise.resolve(); },
    (kind, err, ctx) => { calls.reported.push([kind, ctx]); return Promise.resolve(); },
    { env: { BREVO_API_KEY: 'k' } }, '2026-09-28', 5);
  return run().then((out) => ({ out, ...calls }));
}

test('a quote that never reached Brevo is synced and its ids kept', async () => {
  const r = await catchUp({ rows: [{ id: 7, code: 'Q7' }] });
  assert.deepStrictEqual(r.kept, [['c7', 'd7', 7]]);
  assert.match(r.out, /1 synced/);
  assert.strictEqual(r.contact.length, 1);
  assert.strictEqual(r.contact[0].length, 1, 'attributes only: no jt_* event, which would start customer emails late');
});

test('Brevo refusing the server stops the batch without counting or reporting', async () => {
  const r = await catchUp({ rows: [{ id: 1 }, { id: 2 }], results: { 1: 401 } });
  assert.strictEqual(r.counted.length, 0, 'an outage is not the quote\'s fault; its tries are kept');
  assert.strictEqual(r.reported.length, 0, 'the breach monitor already says it once a day');
  assert.match(r.out, /refusing the server \(401\), 2 waiting/);
});

test('a quote Brevo keeps refusing is counted, and reported once, when given up on', async () => {
  const attempts = { 3: 3 };
  let r = await catchUp({ rows: [{ id: 3, code: 'Q3' }, { id: 4, code: 'Q4' }], results: { 3: 400 }, attempts });
  assert.deepStrictEqual(r.counted, [3]);
  assert.strictEqual(r.reported.length, 0, 'four tries in: not yet');
  assert.deepStrictEqual(r.kept, [['c4', 'd4', 4]], 'one bad quote does not hold up the rest');
  r = await catchUp({ rows: [{ id: 3, code: 'Q3' }], results: { 3: 400 }, attempts });
  assert.deepStrictEqual(r.reported, [['brevo-quote-catch-up', 'quote Q3 given up after 5 tries']]);
});

test('the catch-up picks only quotes with no deal, something to key on, and a settled save', async () => {
  const r = await catchUp({ rows: [] });
  const { sql, params } = r.select;
  assert.match(sql, /brevo_deal_id IS NULL/);
  assert.match(sql, /created_at >= \$1/, 'quotes missed in the outage are the owner\'s call');
  assert.match(sql, /created_at < NOW\(\) - interval '10 minutes'/, 'never races the sync the save started');
  assert.ok(sql.includes("regexp_replace(COALESCE(phone, ''), '\\D', '', 'g')"),
    "Postgres must receive '\\D'; in a template string a lone \\D is just D");
  assert.deepStrictEqual(params, ['2026-09-28', 5]);
});

test('the quote catch-up runs in the hourly sweep', () => {
  const sweep = src.slice(src.indexOf('const runSweep'));
  assert.match(sweep, /step\('brevo quote catch-up', brevoQuoteCatchUp\)/, 'a retry nothing calls is not a retry');
});

/* ── a cancelled job leaves the pipeline ──────────────────────────────────── */

test('a cancelled quote is lost, whatever was paid; un-cancelled it goes back', () => {
  const quoteStage = vm.runInThisContext(`(() => { ${extract('quoteStage')} return quoteStage; })()`);
  assert.strictEqual(quoteStage({ status: 'cancelled', total: 100, paid_amount: 50 }), 'lost');
  assert.strictEqual(quoteStage({ cancelled_at: '2026-09-28', status: 'accepted', total: 100 }), 'lost');
  assert.strictEqual(quoteStage({ status: 'accepted', accepted_at: 'x', total: 100 }), 'qualifying');
  assert.strictEqual(quoteStage({ status: 'sent', total: 100, paid_amount: 100 }), 'won');
});

test('cancelling and un-cancelling push the stage to the deal', () => {
  for (const sig of ["app.post('/quote/:code/cancel'", "app.post('/quote/:code/uncancel'"]) {
    const r = route(sig);
    assert.match(r, /RETURNING \*/, sig);
    assert.match(r, /if \(rows\.length\) syncDealStage\(rows\[0\]\)/, sig);
  }
});
