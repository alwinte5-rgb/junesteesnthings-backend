'use strict';

/* The Reviews page, and the record behind it.
 *
 * Until 2026-09-28 the review sweep stamped sent_at on every ask it handled,
 * sent or not: an opt-out, a refund, a dispute and a bounced address all left
 * the queue looking exactly like an ask that went out, so "asked" and the
 * reply rate counted asks nobody received. The one reminder had the same
 * trouble with followup_sent_at. Each now records what became of it
 * (ask_outcome, followup_outcome), the page counts only what went out, and
 * a skipped or failed send says why.
 *
 * The page itself was rebuilt the same day: reviews waiting for June first,
 * then what is live, then the asking, folded away. It used to open on up to
 * 300 "never asked" rows, each with its own copy of the message.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function lift(name) {
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
function grab(startText, endText) {
  const at = src.indexOf(startText);
  assert.notStrictEqual(at, -1, `${startText} not found in server.js`);
  return src.slice(at, src.indexOf(endText, at) + endText.length);
}
function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}
/* A route's handler, as a function to call with a fake req and res. */
function handler(signature, sandbox) {
  const text = route(signature);
  const at = text.indexOf('async (req, res) =>');
  assert.notStrictEqual(at, -1, `no handler in ${signature}`);
  return vm.runInContext('(' + text.slice(at) + '\n})', sandbox);
}
function fakeRes() {
  return {
    code: 200, to: null, body: null,
    redirect(u) { this.to = u; }, status(c) { this.code = c; return this; }, send(b) { this.body = b; },
  };
}
const page = src.slice(src.indexOf("app.get('/admin/reviews'"), src.indexOf("app.post('/admin/reviews/backfill'"));

/* What an UPDATE wrote into an outcome column, written inline or as a param. */
function wrote(u, col) {
  const inline = u.sql.match(new RegExp(`${col}='(\\w+)'`));
  if (inline) return inline[1];
  const param = u.sql.match(new RegExp(`${col}=\\$(\\d)`));
  return param ? u.args[Number(param[1]) - 1] : undefined;
}

/* Five customers, one of each fate. */
const ROWS = [
  { id: 1, token: 't1', email: 'gone@example.com', quote_code: 'Q1' },
  { id: 2, token: 't2', email: 'back@example.com', quote_code: 'Q2' },
  { id: 3, token: 't3', email: 'card@example.com', quote_code: 'Q3' },
  { id: 4, token: 't4', email: 'bounce@example.com', quote_code: 'Q4' },
  { id: 5, token: 't5', email: 'happy@example.com', quote_code: 'Q5' },
];
function desk(fn) {
  const updates = [], sent = [];
  const sandbox = {
    REVIEW_BATCH: 50, REVIEW_FOLLOWUP_DAYS: () => 5,
    console: { error() {}, log() {} },
    isUnsubscribed: async (email) => email === 'gone@example.com',
    refundedInFull: async (r) => r.quote_code === 'Q2',
    disputeOn: async (r) => r.quote_code === 'Q3',
    requestReview: async (r) => {
      if (r.email === 'bounce@example.com') throw new Error('550 mailbox does not exist');
      sent.push(r);
      return r.token;
    },
    pool: {
      query: async (sql, args = []) => {
        if (/^\s*SELECT \* FROM reviews/.test(sql)) return { rows: ROWS.map((r) => ({ ...r })) };
        if (/^UPDATE reviews/.test(sql)) { updates.push({ sql, args }); return { rows: [] }; }
        throw new Error('unexpected query: ' + sql.slice(0, 80));
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(lift(fn), sandbox);
  return { run: () => sandbox[fn](), updates, sent };
}

/* ── What became of each ask ─────────────────────────────────────────────── */

test('the sweep records why an ask did not go out, and sends only the rest', async () => {
  const d = desk('sendDueReviewRequests');
  const summary = await d.run();
  assert.deepStrictEqual(d.sent.map((r) => r.email), ['happy@example.com']);
  const outcome = (id) => wrote(d.updates.find((u) => u.args[0] === id), 'ask_outcome');
  assert.strictEqual(outcome(1), 'unsubscribed');
  assert.strictEqual(outcome(2), 'refunded');
  assert.strictEqual(outcome(3), 'disputed');
  assert.strictEqual(outcome(4), 'failed', 'a bounce read as an ask that went out');
  assert.strictEqual(outcome(5), 'sent');
  for (const u of d.updates) assert.match(u.sql, /sent_at=NOW\(\)/, 'every ask handled leaves the queue');
  assert.match(summary, /due=5 sent=1 skipped\(unsubscribed\)=1 skipped\(refunded or disputed\)=2 FAILED=1/);
});

test('an ask skipped for a refund or a dispute rules out the reminder, and says why', async () => {
  const d = desk('sendDueReviewRequests');
  await d.run();
  for (const [id, why] of [[2, 'refunded'], [3, 'disputed']]) {
    const u = d.updates.find((x) => x.args[0] === id);
    assert.match(u.sql, /followup_sent_at=NOW\(\)/, 'the reminder sweep would pick it up');
    assert.strictEqual(wrote(u, 'followup_outcome'), why);
  }
});

test('the reminder records what became of it, and goes to nobody who opted out, was refunded or disputed', async () => {
  const d = desk('sendReviewFollowUps');
  const summary = await d.run();
  assert.deepStrictEqual(d.sent.map((r) => r.email), ['happy@example.com']);
  assert.ok(d.sent.every((r) => r.followup === true), 'a reminder must be sent as the reminder');
  const outcome = (id) => wrote(d.updates.find((u) => u.args[0] === id), 'followup_outcome');
  assert.strictEqual(outcome(1), 'unsubscribed');
  assert.strictEqual(outcome(2), 'refunded');
  assert.strictEqual(outcome(3), 'disputed');
  assert.strictEqual(outcome(4), 'failed');
  assert.strictEqual(outcome(5), 'sent');
  assert.strictEqual(d.updates.length, 5, 'one stamp each: nobody is chased twice');
  for (const u of d.updates) assert.match(u.sql, /followup_sent_at=NOW\(\)/);
  assert.match(summary, /due=5 sent=1 FAILED=1/);
});

test('both outcome columns are created with the table', () => {
  assert.match(src, /ALTER TABLE reviews ADD COLUMN IF NOT EXISTS ask_outcome TEXT/);
  assert.match(src, /ALTER TABLE reviews ADD COLUMN IF NOT EXISTS followup_outcome TEXT/);
});

/* ── What the page counts ────────────────────────────────────────────────── */

test('only an ask that went out counts as asked, and rows from before the record count as sent', () => {
  const def = src.match(/const ASK_WENT_OUT = `([^`]*)`/);
  assert.ok(def, 'ASK_WENT_OUT is gone');
  assert.match(def[1], /sent_at IS NOT NULL/);
  assert.match(def[1], /COALESCE\(ask_outcome, 'sent'\) = 'sent'/,
    'older rows have no outcome, and every one of them was treated as sent at the time');
  const column = (name) => {
    const m = page.match(new RegExp(`([^\\n]*) AS ${name}\\b`));
    assert.ok(m, `the ${name} count is gone`);
    return m[1];
  };
  for (const name of ['asked', 'replied', 'last_sent']) {
    assert.match(column(name), /\$\{ASK_WENT_OUT\}/, `${name} counts asks that never went out`);
  }
});

test('the "Already asked" list names a send that did not happen, for the ask and the reminder', () => {
  assert.match(page, /ask_outcome, followup_outcome/, 'the list does not read the outcomes');
  assert.match(page, /outcomeCell\(a\.ask_outcome, a\.sent_at\)/);
  assert.match(page, /outcomeCell\(a\.followup_outcome, a\.followup_sent_at\)/);
  for (const why of ['unsubscribed', 'refunded', 'disputed', 'failed']) {
    assert.match(grab('const OUTCOME = {', '};'), new RegExp(`${why}:`), `no wording for ${why}`);
  }
});

test('the never-asked list leaves out what every automated ask leaves out', () => {
  /* Cancelled, refunded in full, disputed: the same rules as the sweep's
     refundedInFull and disputeOn, so ticking a box cannot queue what the
     sweep would refuse to send. */
  const q = (page.match(/rows: never \} = await pool\.query\(\s*`([^`]*)`/) || [])[1];
  assert.ok(q, 'the never-asked query is gone');
  assert.match(q, /cancelled_at IS NULL/, 'a cancelled job is offered for a review');
  assert.match(q, /FROM stripe_disputes d WHERE d\.quote_code = q\.code/, 'a disputed job is offered for a review');
  assert.match(q, /BOOL_OR\(p\.kind = 'refund'\) AND SUM\(p\.amount\) < 0\.01/,
    'a refunded job is offered for a review');
  assert.match(lift('refundedInFull'), /BOOL_OR\(kind = 'refund'\)[\s\S]*< 0\.01/,
    'the sweep\'s refund rule moved; the list must move with it');
});

test('the page puts what waits for June first and the asking last', () => {
  const body = page.slice(page.indexOf("res.send(adminPage('Reviews'"));
  const order = ['${tiles}', '${waitingSec}', '${liveSec}', '${hiddenSec}', '${askSec}', '${askedSec}']
    .map((part) => body.indexOf(part));
  assert.ok(order.every((at) => at > 0), 'a section is missing from the page');
  assert.deepStrictEqual([...order].sort((a, b) => a - b), order, 'the sections are out of order');
});

test('a review waits for June until she approves it or keeps it off, the same rule as the menu badge', () => {
  assert.match(page, /const waiting = rows\.filter\(\(r\) => !r\.approved && !r\.moderated_at\)/);
  assert.match(grab('const REVIEWS_WAITING_SQL = `', '`;'), /moderated_at IS NULL AND approved IS NOT TRUE/);
  assert.match(page, /value="hide" class="btn-ghost">Keep off the site</,
    'a new review cannot be turned down without approving it first');
});

/* ── Asking past customers ───────────────────────────────────────────────── */

function backfill(quotes, refused = []) {
  const queued = [];
  const sandbox = {
    console: { log() {}, error() {} },
    queueReviewRequest: async (ask) => { queued.push(ask); return !refused.includes(ask.quote_code); },
    pool: { query: async (sql, [code]) => ({ rows: quotes.filter((q) => q.code === code) }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(grab('const QUOTE_CODE_RE = ', ';'), sandbox);
  const h = handler("app.post('/admin/reviews/backfill'", sandbox);
  return { post: async (body) => { const res = fakeRes(); await h({ body }, res); return res; }, queued };
}

test('queueing says how many went, of how many ticked, and never asks about a cancelled job', async () => {
  const b = backfill([
    { code: 'AAAAAA', name: 'Ada', email: 'ada@example.com', items: [{ description: 'Tee' }] },
    { code: 'BBBBBB', name: 'Bo', email: 'bo@example.com', cancelled_at: new Date() },
    { code: 'CCCCCC', name: 'Cy', email: 'cy@example.com' },
  ], ['CCCCCC']);
  const res = await b.post({ code: ['aaaaaa', 'BBBBBB', 'CCCCCC', 'DDDDDD', 'not a code'] });
  assert.deepStrictEqual(b.queued.map((q) => q.quote_code), ['AAAAAA', 'CCCCCC'], 'the cancelled job was queued');
  assert.ok(b.queued.every((q) => q.days === 0), 'these jobs are weeks old; the ask goes on the next sweep');
  assert.strictEqual(res.to, '/admin/reviews?queued=1&of=4#ask',
    'four real codes were ticked and one was queued: the page has to say so');
});

test('queueing with nothing ticked says nothing was queued', async () => {
  const res = await backfill([]).post({});
  assert.strictEqual(res.to, '/admin/reviews?queued=0&of=0#ask');
  assert.match(page, /Nothing was ticked, so nothing was queued\./);
});

test('the queue button waits for a tick and cannot be pressed twice', () => {
  assert.match(page, /go\.disabled = n === 0/, 'an empty queue can be submitted');
  assert.match(page, /addEventListener\('submit', function\(\)\{ setTimeout\(function\(\)\{ go\.disabled = true;/,
    'a second press queues nothing new but reads as a second batch');
});

/* ── Approving, keeping off, removing ────────────────────────────────────── */

function moderate(fail) {
  const writes = [];
  const sandbox = {
    console: { error() {} }, _revCache: null,
    pool: { query: async (sql, args) => { writes.push({ sql, args }); if (fail) throw new Error('connection reset'); return { rows: [] }; } },
  };
  vm.createContext(sandbox);
  const h = handler("app.post('/admin/reviews/:id'", sandbox);
  return {
    post: async (id, action) => { const res = fakeRes(); await h({ params: { id: String(id) }, body: { action } }, res); return res; },
    writes, sandbox,
  };
}

test('approving saves and returns to the page, and the site shows it on its next read', async () => {
  const m = moderate(false);
  const res = await m.post(7, 'approve');
  assert.deepStrictEqual(Array.from(m.writes[0].args), [7, true]);   // built in the vm's realm
  assert.match(m.writes[0].sql, /moderated_at=NOW\(\)/, 'an approved review would still read as waiting');
  assert.strictEqual(res.to, '/admin/reviews');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(m.sandbox._revCache)), { at: 0, rows: [] },
    'the public strip keeps serving its cached copy');
});

test('a change that does not save says so, on the card it was for', async () => {
  for (const action of ['approve', 'hide', 'delete']) {
    const res = await moderate(true).post(7, action);
    assert.strictEqual(res.to, '/admin/reviews?failed=1#r7', `a failed ${action} reloaded as if it had worked`);
  }
  assert.match(page, /req\.query\.failed \? '<div class="warn">/, 'the page does not show the failure');
});

test('a link to a folded section, or to a card inside one, opens it', () => {
  assert.match(page, /t\.closest\('details'\)/);
  assert.match(page, /addEventListener\('hashchange', openTarget\); openTarget\(\);/);
});

/* ── The asks on the job's record ────────────────────────────────────────── */

function asker() {
  const mails = [];
  const sandbox = {
    isValidEmail: (e) => /^[^@\s]+@[^@\s]+$/.test(e), reviewToken: () => 'tok',
    PUBLIC_BASE_URL: 'https://www.jtees.net', SHOP_SIGNER: 'June', SHOP_PHONE: '(773) 555-0100', SHOP_NAME: "June's Tees",
    sendClientEmail: async (m) => { mails.push(m); },
    pool: { query: async () => ({ rows: [] }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(lift('escEmail') + '\n' + lift('requestReview'), sandbox);
  return { ask: (a) => sandbox.requestReview(a), mails };
}

test('a review ask and its reminder are recorded on the job, each by name', async () => {
  const a = asker();
  await a.ask({ token: 'x', name: 'Ada Lovelace', email: 'ada@example.com', quote_code: 'AB12CD34EF' });
  await a.ask({ token: 'x', name: 'Ada Lovelace', email: 'ada@example.com', quote_code: 'AB12CD34EF', followup: true });
  await a.ask({ token: 'y', name: 'Bo', email: 'bo@example.com', order_ref: '77' });
  assert.deepStrictEqual(a.mails.map((m) => [m.quote, m.kind]),
    [['AB12CD34EF', 'review-ask'], ['AB12CD34EF', 'review-followup'], [null, 'review-ask']]);
  assert.ok(a.mails.every((m) => m.preview && m.to && m.subject && m.html));
  const kinds = grab('const MESSAGE_KINDS = {', '};');
  assert.match(kinds, /'review-ask': 'Review ask'/, 'the job page would show the raw key');
  assert.match(kinds, /'review-followup': 'Review reminder'/);
});
