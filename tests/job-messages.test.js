'use strict';

/* Talking to the customer from the job page, and a record of everything they
 * were told.
 *
 * Until 2026-09-28 the only updates a customer got between paying and their
 * order arriving were texts, and texting was not switched on, so they heard
 * nothing; a note to a customer was typed on June's phone and left no trace
 * on the job. Now every email about a quote is recorded against it
 * (client_emails), texts carry their quote, the job page lists both with how
 * each one went, and a message can be written from there.
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
  assert.notStrictEqual(at, -1, `${signature} not found`);
  return src.slice(at, src.indexOf('\n});', at));
}
/* The job-page route and the sender it shares with /admin/approvals. */
function msgRoute() {
  return route("app.post('/admin/quote/:code/message', requireAdmin") + '\n' + lift('sendJobMessage');
}

/* ── The record ─────────────────────────────────────────────────────────── */

function clientMail({ fail = null, unsubscribed = false, inbound = false } = {}) {
  const rows = [];
  const sent = [];
  const sandbox = {
    /* Customer replies onto the job page (2026-10-06): off unless the reply domain is live. */
    inboundReady: inbound, INBOUND: require('../tools/lib/inbound-email'), INBOUND_DOMAIN: 'reply.jtees.net',
    pool: { query: async (sql, args) => { if (/INSERT INTO client_emails/.test(sql)) rows.push(args.slice(0, 7)); return { rows: [] }; } },
    sendEmail: async (m) => { if (fail) throw new Error(fail); sent.push(m); },
    isUnsubscribed: async () => unsubscribed,
    htmlToText: (h) => String(h).replace(/<[^>]+>/g, ''),
    attributedStaffId: () => null,
    console: { error() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(lift('logClientEmail') + '\n' + lift('sendClientEmail'), sandbox);
  return { send: (m) => sandbox.sendClientEmail(m), rows, sent };
}

test('an email about a quote is recorded on it once sent', async () => {
  const d = clientMail();
  await d.send({ quote: 'AB12CD', kind: 'receipt', to: 'ada@example.com', subject: 'Payment received', html: '<p>Thanks</p>' });
  assert.strictEqual(d.sent.length, 1);
  assert.strictEqual(d.sent[0].quote, undefined, 'the quote and kind are not handed to the mailer');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(d.rows[0])),
    ['AB12CD', 'receipt', 'ada@example.com', 'Payment received', 'Thanks', 'sent', null]);
});

test('the record keeps the message itself when the caller names it, and the mailer never sees it', async () => {
  const d = clientMail();
  await d.send({ quote: 'AB12CD', kind: 'manual', to: 'a@b.co', subject: 's', preview: 'Hi Ada,\nSee   you Saturday',
                 html: '<h2>A note about your order</h2><p>Hi Ada,<br>See you Saturday</p><a href="https://x">View</a>' });
  assert.strictEqual(d.sent[0].preview, undefined);
  assert.strictEqual(d.rows[0][4], 'Hi Ada, See you Saturday');
});

test('an email that fails is recorded as failed, and still throws', async () => {
  const d = clientMail({ fail: 'Brevo 500' });
  await assert.rejects(d.send({ quote: 'AB12CD', kind: 'manual', to: 'a@b.co', subject: 's', html: 'x' }), /Brevo 500/);
  assert.strictEqual(d.rows[0][5], 'failed');
  assert.strictEqual(d.rows[0][6], 'Brevo 500');
});

test('marketing to someone who unsubscribed is not sent, and not recorded as sent', async () => {
  const d = clientMail({ unsubscribed: true });
  await d.send({ quote: 'AB12CD', kind: 'reorder', to: 'a@b.co', subject: 's', html: 'x', marketing: true });
  assert.strictEqual(d.sent.length, 0);
  assert.strictEqual(d.rows[0][5], 'skipped');
});

test('every email a customer gets about a quote goes through the record', () => {
  for (const [subject, kind] of [
    ['`Payment received — quote ${code}`', 'receipt'], ['`Thanks — quote ${q.code} accepted`', 'accepted'],
    ['`Payment received — quote ${nq.code}`', 'receipt'], ['`Receipt — quote ${q.code}`', 'receipt'],
    ['`Still thinking it over? Quote ${q.code}`', 'follow-up'],
    ['`Ready when you are — deposit for quote ${q.code}`', 'deposit-reminder'],
    ['`Balance on quote ${q.code} — ${money(due)}`', 'balance-reminder'],
    ['`Your order has shipped — ${q.code}`', 'tracking'],
  ]) {
    const at = src.indexOf(`subject: ${subject}`);
    assert.ok(at > 0, subject);
    const call = src.slice(src.lastIndexOf('send', at), at);
    assert.match(call, new RegExp(`^sendClientEmail\\(\\{[\\s\\S]*kind: '${kind}'`), `${subject} is recorded as ${kind}`);
  }
});

test('the record is a table of its own, keyed on the quote', () => {
  const ddl = grab('CREATE TABLE IF NOT EXISTS client_emails (', ')`);');
  for (const col of ['quote_code  TEXT NOT NULL', 'kind        TEXT NOT NULL', 'status      TEXT NOT NULL']) {
    assert.ok(ddl.includes(col), col);
  }
  assert.match(src, /ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS quote_code TEXT/);
  assert.match(lift('sendCustomerSms'), /VALUES \(\$1,\$2,\$3,\$4,\$5,'sending',\$6,\$7\)/, 'a text carries its quote, and who sent it');
});

/* ── Replies ────────────────────────────────────────────────────────────── */

test('a customer text reply is kept on their latest quote, matched by phone', () => {
  const r = route("app.post('/webhooks/twilio/sms'");
  const at = r.indexOf('INSERT INTO sms_messages');
  assert.ok(at > 0 && at < r.indexOf("if (kind === 'stop')"), 'kept before anything else is done with it');
  /* The SQL as Postgres receives it: '\D' has to arrive with its backslash. */
  const lit = r.slice(r.indexOf('`', at - 20), r.indexOf('RETURNING id, quote_code`', at) + 'RETURNING id, quote_code`'.length);
  const cooked = vm.runInThisContext(lit);
  assert.ok(cooked.includes("regexp_replace(COALESCE(phone,''), '\\D', '', 'g')"), cooked);
  assert.match(cooked, /'received'/);
  assert.match(cooked, /ORDER BY created_at DESC LIMIT 1/, 'their latest quote');
});

/* ── The card ───────────────────────────────────────────────────────────── */

function card({ history = [], smsOn = true, consent = true, q = {} } = {}) {
  const sandbox = {
    pool: { query: async () => ({ rows: history }) },
    normalizeUsPhone: (p) => (p ? '+1' + String(p).replace(/\D/g, '').slice(-10) : null),
    smsConfigured: () => smsOn, smsConsentFor: async () => ({ transactional: consent }),
    balanceOf: () => 0, quoteTotals: () => ({ total: 0 }), money: (n) => '$' + Number(n).toFixed(2),
    quoteLink: (c) => 'https://www.jtees.net/q/' + c, SMS_PICKUP: '3047 N Lincoln Ave', SHOP_PHONE: '(773) 849-1854',
    ...(({ PICKUP_ADDRESS, PICKUP_HOURS, PICKUP_STEPS }) => ({ PICKUP_ADDRESS, PICKUP_HOURS, PICKUP_STEPS }))(require('../tools/lib/sms-templates')),
    SHOP_TZ: 'America/Chicago', console: { error() {} },
    intIn: () => null, PROOFS: require('../tools/lib/job-proofs'),
    /* Files on the job an email may carry (2026-10-06): none here. */
    jobFilesFor: async () => [], MSGFILES: require('../tools/lib/message-files'), inboundReady: false,
    jobPath: (c) => '/admin/production/' + c, TMEDIA: require('../tools/lib/text-media'),
    /* The shared browser upload helper (2026-10-06), as server.js defines it. */
    CLOUDINARY_UPLOAD_MAX: 10 * 1024 * 1024, CLD_UPLOAD_FN: 'function jtCldUpload(){}',
  };
  vm.createContext(sandbox);
  vm.runInContext([grab('const MESSAGE_KINDS = {', '};'), grab('const MESSAGE_ERRORS = {', '};'),
    grab('const ADMIN_ICONS = {', '};'), lift('icon'), lift('escEmail'), lift('pill'), lift('emptyState'),
    lift('jobMessagesCard')].join('\n'), sandbox);
  return sandbox.jobMessagesCard({ code: 'AB12CD', name: 'Ada Brooks', email: 'ada@example.com',
                                   phone: '(773) 555-0100', ...q }, {});
}

test('the card lists what was sent, how it went, and what they replied', async () => {
  const html = await card({ history: [
    { channel: 'text', kind: 'reply', subject: null, body: 'Can I pick up Saturday?', status: 'received', created_at: '2026-09-28T15:00:00Z' },
    { channel: 'email', kind: 'milestone:ready', subject: 'Your order is ready for pickup — AB12CD', body: 'Ready',
      status: 'sent', created_at: '2026-09-28T14:00:00Z' },
    { channel: 'text', kind: 'in-production', subject: null, body: 'in production', status: 'undelivered',
      error: 'Twilio 30006: it is a landline', created_at: '2026-09-27T14:00:00Z' },
  ] });
  assert.match(html, /Their reply[\s\S]*Can I pick up Saturday\?[\s\S]*pill-neutral">reply</);
  assert.match(html, /Your order is ready for pickup — AB12CD[\s\S]*pill-blue">sent</);
  assert.match(html, /In production[\s\S]*Twilio 30006: it is a landline[\s\S]*pill-red">undelivered</);
});

test('a reply nobody has answered says so, with No reply needed; an answer written here clears it', async () => {
  const waiting = await card({ history: [
    { channel: 'text', kind: 'reply', body: 'Sizes are 4 M 2 L', status: 'received', created_at: '2026-09-28T15:00:00Z' },
    { channel: 'email', kind: 'milestone:ready', body: 'Ready', status: 'sent', created_at: '2026-09-28T16:00:00Z' }].reverse() });
  assert.match(waiting, /has not had an answer yet[\s\S]*action="\/admin\/quote\/AB12CD\/replies-handled"[\s\S]*No reply needed/);
  const answered = await card({ history: [
    { channel: 'email', kind: 'manual', body: 'Thanks!', status: 'sent', created_at: '2026-09-28T16:00:00Z' },
    { channel: 'text', kind: 'reply', body: 'Sizes', status: 'received', created_at: '2026-09-28T15:00:00Z' }] });
  assert.doesNotMatch(answered, /has not had an answer yet/);
  const handled = await card({ q: { replies_handled_at: '2026-09-29T00:00:00Z' }, history: [
    { channel: 'text', kind: 'reply', body: 'Thanks', status: 'received', created_at: '2026-09-28T15:00:00Z' }] });
  assert.doesNotMatch(handled, /has not had an answer yet/);
  assert.match(handled, /Add a to-do for this job[\s\S]*name="quote_code" value="AB12CD"/);
});

test('the dashboard lists replies waiting and the to-do list, and the routes are mapped', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const d = src.slice(src.indexOf("app.get('/admin/dashboard'"), src.indexOf("app.get('/admin/dashboard'") + 20000);
  assert.match(d, /many\(UNANSWERED_REPLIES_SQL/);
  assert.match(d, /is waiting for a reply/);
  assert.match(d, /id="todo"[\s\S]*action="\/admin\/tasks"/);
  const STAFF = require('../tools/lib/staff');
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/replies-handled'], 'customers.message');
  // Automatic emails are not an answer: only messages written from the job page count.
  assert.match(src, /FILTER \(WHERE what = 'manual' AND status NOT IN/);
});

test('what a customer wrote is escaped', async () => {
  const html = await card({ history: [
    { channel: 'text', kind: 'reply', body: '<img src=x onerror=alert(1)>', status: 'received', created_at: '2026-09-28' }] });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('text says why it cannot be used, rather than failing on send', async () => {
  assert.match(await card({ smsOn: false }), /disabled>\s*Text <span[^>]*>\(texting is not switched on yet\)/);
  assert.match(await card({ consent: false }), /\(they have not agreed to texts\)/);
  assert.match(await card({ q: { phone: '' } }), /\(no phone number on this quote\)/);
  const noEmail = await card({ q: { email: '' } });
  assert.match(noEmail, /value="email" style="width:auto" disabled/);
  assert.match(noEmail, /value="text" style="width:auto" checked/, 'with no email, text is the choice');
});

test('a long message is cut at a word with an ellipsis, and its time goes under it on a phone', async () => {
  const html = await card({ history: [
    { channel: 'email', kind: 'manual', subject: 's', body: 'word '.repeat(80), status: 'sent', created_at: '2026-09-28' }] });
  assert.match(html, /word…<\/div>/);
  assert.match(html, /class="row-i msg-row"[\s\S]*class="row-end msg-end"[\s\S]*class="muted msg-when"/);
  const css = grab('const ADMIN_CSS = `', '\n`;');
  assert.match(css, /@media \(max-width:640px\)\{\s*\.msg-row\{flex-wrap:wrap\}\s*\.msg-end\{flex:1 0 100%/);
  assert.match(css, /\.msg-row \.row-main\{flex:1 1 0\}/,
    'sized by the space beside the icon, not its own text, or a long subject drops under the icon');
});

test('the quick messages fill the box, and one for a balance only when one is owed', async () => {
  const html = await card();
  assert.match(html, /data-fill="Hi Ada! Your proof for order AB12CD is ready\./);
  assert.doesNotMatch(html, /Balance due</);
});

/* ── Sending ────────────────────────────────────────────────────────────── */

test('sending is admin only, and answers on the job page from a fixed list', () => {
  const r = msgRoute();
  assert.match(r, /QUOTE_CODE_RE\.test\(code\)/);
  // The job page for whoever sent it: production, or a designer's own page.
  assert.match(r, /res\.redirect\(`\$\{jobPath\(code\)\}\?\$\{key\}=\$\{encodeURIComponent\(value\)\}#messages`\)/);
  const card = lift('jobMessagesCard');
  assert.match(card, /const failed = MESSAGE_ERRORS\[String\(query\.msg_err \|\| ''\)\];/);
  assert.match(card, /\['email', 'text'\]\.includes\(String\(query\.sent\)\)/);
});

test('an empty or over-long message is refused before anything is sent', () => {
  const r = msgRoute();
  assert.ok(r.indexOf("answer('msg_err', 'empty')") < r.indexOf('SELECT * FROM quotes'));
  assert.match(r, /text\.length > \(channel === 'text' \? 300 : 5000\)/);
  assert.match(r, /\.replace\(\/\[\\r\\n\]\+\/g, ' '\)/, 'a subject is one line');
});

test('a double press is one message', () => {
  const r = msgRoute();
  assert.ok(r.indexOf("recentJobMessages.has(key)") < r.indexOf('SELECT * FROM quotes'));
  assert.match(r, /ref: 'manual:' \+ key\.slice\(0, 32\)/, 'and a text is keyed too, by the dedupe index');
  assert.match(r, /recentJobMessages\.delete\(key\)/, 'a send that did not happen can be tried again');
});

/* The route, run: a refusal must be the reason the card showed. With texting
   off and no consent on file, the send said "they have not agreed to texts"
   while the page said texting was not switched on (found end to end). */
function messageRoute(o = {}) {
  const opts = { smsOn: true, consent: true, q: {}, ...o };
  let handler;
  const sent = [];
  const sandbox = {
    app: { post: (_path, _gate, fn) => { handler = fn; } }, requireAdmin: null,
    QUOTE_CODE_RE: vm.runInThisContext(grab('const QUOTE_CODE_RE = ', ';').slice('const QUOTE_CODE_RE = '.length, -1)),
    crypto: require('node:crypto'), recentJobMessages: new Map(),
    pool: { query: async () => ({ rows: [{ code: 'AB12CD', email: 'ada@example.com', phone: '(773) 555-0100', ...opts.q }] }) },
    normalizeUsPhone: (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? '+1' + d.slice(-10) : null; },
    smsConfigured: () => opts.smsOn,
    sendCustomerSms: async (m) => { if (!opts.consent) return 'no-consent'; sent.push(m); return 'sent'; },
    sendClientEmail: async (m) => { sent.push(m); }, customerEmailHtml: () => '', escEmail: (t) => t,
    SHOP_EMAIL: 'shop@example.com', smsPlain: (t) => t, smsShort: require('../tools/lib/sms-templates').short, reportError: async () => {},
    quoteLink: (c) => 'https://www.jtees.net/q/' + c,
    console: { log() {}, error() {} },
    currentActor: () => null, actorLevel: () => 'on', markProofsSent: async () => {},
    jobPath: (c) => `/admin/production/${c}`, designJobFor: async () => null,
    FRAUD: require('../tools/lib/fraud-signals'), logActivity: () => {},
    /* Attachments (2026-10-06): none on the job, none posted. */
    jobFilesFor: async () => [], MSGFILES: require('../tools/lib/message-files'),
    QPHOTOS: { cloudName: () => 'demo' }, fetchAttachments: async () => [],
  };
  vm.createContext(sandbox);
  vm.runInContext(lift('sendJobMessage') + '\n' + route("app.post('/admin/quote/:code/message', requireAdmin") + '\n});', sandbox);
  const send = async (body) => {
    let location = null;
    await handler({ params: { code: 'AB12CD' }, body }, { redirect: (u) => { location = u; } });
    return location;
  };
  return { send, opts, sent };
}

test('a refused text names the reason the card showed, in the card\'s order', async () => {
  const err = (why) => `/admin/production/AB12CD?msg_err=${why}#messages`;
  const hi = { channel: 'text', body: 'Hi' };
  assert.strictEqual(await messageRoute({ smsOn: false, consent: false }).send(hi), err('texting-off'),
    'texting off comes before consent');
  assert.strictEqual(await messageRoute({ smsOn: false, q: { phone: '' } }).send(hi), err('no-phone'),
    'and no number before either');
  assert.strictEqual(await messageRoute({ consent: false }).send(hi), err('no-consent'));
  const r = messageRoute();
  assert.strictEqual(await r.send(hi), '/admin/production/AB12CD?sent=text#messages');
  assert.strictEqual(await r.send(hi), err('duplicate'), 'a second press');
  assert.strictEqual(r.sent.length, 1, 'one text went');
});

test('an email from the job page is recorded as what was typed', async () => {
  const r = messageRoute();
  assert.strictEqual(await r.send({ channel: 'email', subject: 'Hoodies', body: 'Hi Bo,\nSee you Saturday!' }),
    '/admin/production/AB12CD?sent=email#messages');
  assert.strictEqual(r.sent[0].kind, 'manual');
  assert.strictEqual(r.sent[0].preview, 'Hi Bo,\nSee you Saturday!');
});

test('a refused text does not hold the message back once it can go', async () => {
  const r = messageRoute({ smsOn: false });
  const hi = { channel: 'text', body: 'Hi' };
  assert.strictEqual(await r.send(hi), '/admin/production/AB12CD?msg_err=texting-off#messages');
  r.opts.smsOn = true;
  assert.strictEqual(await r.send(hi), '/admin/production/AB12CD?sent=text#messages');
  assert.strictEqual(r.sent.length, 1);
});

test('a text keeps the shape every customer text has', () => {
  const r = msgRoute();
  assert.match(r, /body: `June's Tees: \$\{smsPlain\(text\.replace\([^\n]*, ''\), 260\)\}\$\{/);
  assert.match(r, /' ' \+ smsShort\(quoteLink\(code\)\)\} Reply STOP to opt out\.`/, 'their order page goes on every text, short and branded');
  assert.match(r, /kind: 'transactional'/);
  const { plain } = require('../tools/lib/sms-templates');
  const body = `June's Tees: ${plain('x'.repeat(300), 260)} https://www.jtees.net/q/ABCDEFGHIJ Reply STOP to opt out.`;
  assert.ok(body.length <= 459, 'three segments at most');
});

test('once the reply domain is live, a job email asks for replies at the job address; marketing never does', async () => {
  const off = clientMail();
  await off.send({ quote: 'AB12CD', kind: 'manual', to: 'a@b.co', subject: 's', html: '<p>x</p>', replyTo: 'shop@jtees.net' });
  assert.strictEqual(off.sent[0].replyTo, 'shop@jtees.net');
  const on = clientMail({ inbound: true });
  await on.send({ quote: 'AB12CD', kind: 'manual', to: 'a@b.co', subject: 's', html: '<p>x</p>', replyTo: 'shop@jtees.net' });
  assert.strictEqual(on.sent[0].replyTo, 'order-ab12cd@reply.jtees.net');
  await on.send({ quote: 'AB12CD', kind: 'promo', to: 'a@b.co', subject: 's', html: '<p>x</p>', marketing: true });
  assert.strictEqual(on.sent[1].replyTo, undefined);
});

test('uploads go to Cloudinary as raw files for design files, with the 10 MB limit and the real error shown', async () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.doesNotMatch(src, /\/auto\/upload'/, 'an upload still uses the auto endpoint, which counts a PDF as an image');
  const fn = src.slice(src.indexOf('const CLD_UPLOAD_FN = `'), src.indexOf('`;', src.indexOf('const CLD_UPLOAD_FN')));
  assert.match(fn, /go\(img \? 'image' : 'raw'\)/);
  assert.match(fn, /\|\| !img \? d : go\('raw'\)/, 'a refused photo is not retried as a raw file');
  assert.strictEqual((src.match(/\$\{CLD_UPLOAD_FN\}/g) || []).length, 4);
  const html = await card();
  assert.match(html, /file\.size > 10485760/);
  assert.match(html, /did not upload' \+ \(e && e\.message/);
});

/* ── A customer's text, forwarded to the owner's phone (2026-10-06) ─────────── */

async function inboundText({ from = '+13125550199', body = 'Can I add 2 XL?', owner = '+17738491854', quote = 'AB12CD', name = 'Kim Lee',
                             forwards = [], twilioFails = null, media = {} } = {}) {
  const ownerTexts = [];
  const emails = [];
  const sent = [];
  const sql = [];
  const ownerPics = [];
  let handler;
  const sandbox = {
    app: { post: (p, h) => { handler = h; } },
    process: { env: { TWILIO_AUTH_TOKEN: 't', TWILIO_TO_NUMBER: owner } },
    verifyTwilioSignature: () => true, TWILIO_INBOUND_URL: 'u',
    normalizeUsPhone: (p) => (p ? '+1' + String(p).replace(/\D/g, '').slice(-10) : null),
    classifyInbound: () => 'message',
    pool: { query: async (q, args) => {
      sql.push([q, args]);
      if (/SELECT name FROM quotes/.test(q)) return { rows: [{ name }] };
      if (/FROM owner_text_forwards/.test(q)) return { rows: forwards };
      if (/INSERT INTO sms_messages[\s\S]*RETURNING id/.test(q)) return { rows: [{ id: 1, quote_code: quote }] };
      return { rows: [] };
    } },
    RELAY: require('../tools/lib/text-relay'), QUOTE_CODE_RE: /^(?:[A-Z0-9]{6}|[A-Z0-9]{10})$/,
    twilioSend: async (to, b) => { if (twilioFails) throw Object.assign(new Error('nope'), { twilioCode: twilioFails }); sent.push([to, b]); return { sid: 'SMx' }; },
    markLeadResponded: async () => {},
    textToLead: async () => (quote ? { quote } : { lead: 7 }),
    sendOwnerSms: async (b, pics = []) => { ownerTexts.push(b); ownerPics.push(pics); return true; },
    TMEDIA: require('../tools/lib/text-media'),
    saveTextMedia: async (list, q) => list.map((m, i) => ({ url: `https://res.cloudinary.com/shop/image/upload/v1/quote_photos/p${i}.jpg`, name: 'Text photo ' + (i + 1) + '.jpg', type: m.type, q })),
    sendEmail: async (m) => { emails.push(m); },
    smsPlain: require('../tools/lib/sms-templates').plain,
    PUBLIC_BASE_URL: 'https://www.jtees.net', NOTIFY_EMAIL: 'shop@x', escEmail: (s) => String(s),
    reportError: async () => {}, recordSmsConsent: async () => {}, joinByText: async () => {},
    console: { error() {}, warn() {}, log() {} }, String, Number, encodeURIComponent,
  };
  vm.createContext(sandbox);
  const start = src.indexOf("app.post('/webhooks/twilio/sms'");
  vm.runInContext(lift('relayOwnerReply') + '\n' + src.slice(start, src.indexOf('\n});', start) + 4), sandbox);
  const res = { type() { return this; }, send() {}, sendStatus() {} };
  await handler({ body: { From: from, Body: body, MessageSid: 'SM1', ...media }, get: () => 'sig' }, res);
  return { ownerTexts, emails, sent, sql, ownerPics };
}

test('a customer\'s text comes to the owner\'s phone with who it is and a link to their job', async () => {
  const { ownerTexts, emails } = await inboundText();
  assert.strictEqual(ownerTexts.length, 1);
  assert.match(ownerTexts[0], /^Text from Kim Lee \+13125550199 \(AB12CD\): "Can I add 2 XL\?" Reply here to answer them\. https:\/\/www\.jtees\.net\/admin\/production\/AB12CD#messages$/);
  assert.strictEqual(emails.length, 1, 'the email still goes too');
  const lead = await inboundText({ quote: null });
  assert.match(lead.ownerTexts[0], /\(new enquiry L7\).*\/admin\/leads#lead-7/);
});

test('the owner\'s own phone texting the shop is not forwarded back to it', async () => {
  const { ownerTexts, emails } = await inboundText({ from: '(773) 849-1854' });
  assert.ok(!ownerTexts.some((t) => /^Text from/.test(t)), 'forwarded to itself');
  assert.strictEqual(emails.length, 0);
});

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const kim = { phone: '+13125550199', quote_code: 'AB12CD', lead_id: null, name: 'Kim Lee', created_at: ago(5) };
const ann = { phone: '+13125550111', quote_code: 'FARYDGZMRY', lead_id: null, name: 'Ann Cole', created_at: ago(8) };

test('the owner replying to a forwarded text answers that customer from the shop number, on their job', async () => {
  const r = await inboundText({ from: '+17738491854', body: 'Yes we can add 2 XL', forwards: [kim] });
  assert.deepStrictEqual(r.sent, [['+13125550199', "June's Tees: Yes we can add 2 XL"]]);
  assert.deepStrictEqual(r.ownerTexts, ['Sent to Kim Lee (AB12CD).']);
  assert.strictEqual(r.emails.length, 0, 'the owner\'s own text is not handled as a customer message');
  const ins = r.sql.find(([q]) => /INSERT INTO sms_messages/.test(q));
  assert.match(ins[0], /'manual'/, 'it counts as an answer on the dashboard');
  assert.strictEqual(ins[1][3], 'AB12CD');
});

test('two customers within ten minutes: nobody is guessed at; a code picks one, and a word like Thanks is not a code', async () => {
  const both = await inboundText({ from: '+17738491854', body: 'Yes we can', forwards: [kim, ann] });
  assert.strictEqual(both.sent.length, 0);
  assert.match(both.ownerTexts[0], /^Not sent: 2 customers texted just now\. Start your reply with their code: AB12CD for Kim Lee, FARYDGZMRY for Ann Cole\.$/);
  const coded = await inboundText({ from: '+17738491854', body: 'farydgzmry: ready Friday', forwards: [kim, ann] });
  assert.deepStrictEqual(coded.sent, [['+13125550111', "June's Tees: ready Friday"]]);
  const thanks = await inboundText({ from: '+17738491854', body: 'Thanks so much Kim', forwards: [kim] });
  assert.deepStrictEqual(thanks.sent, [['+13125550199', "June's Tees: Thanks so much Kim"]]);
});

test('no recent customer, or a customer who texted STOP: the owner is told it was not sent', async () => {
  const none = await inboundText({ from: '+17738491854', body: 'hello', forwards: [{ ...kim, created_at: ago(60 * 30) }] });
  assert.strictEqual(none.sent.length, 0);
  assert.match(none.ownerTexts[0], /^Not sent: no customer has texted in the last day/);
  const stop = await inboundText({ from: '+17738491854', body: 'hello', forwards: [kim], twilioFails: 21610 });
  assert.match(stop.ownerTexts[0], /^Not sent to Kim Lee \(AB12CD\): they have texted STOP/);
});

test('a picture sent by text reaches the owner as a picture, is kept on the job, and is in the email', async () => {
  const r = await inboundText({ body: '', media: { NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1', MediaContentType0: 'image/jpeg' } });
  assert.match(r.ownerTexts[0], /\(AB12CD\): "\(sent a picture\)"/);
  assert.deepStrictEqual(r.ownerPics[0], ['https://res.cloudinary.com/shop/image/upload/c_limit,w_1200,q_auto,f_jpg/v1/quote_photos/p0.jpg']);
  assert.match(r.emails[0].html, /<img src="https:\/\/res\.cloudinary\.com\/shop\/image\/upload\/c_limit,w_1200/);
  assert.match(r.emails[0].html, /saved with their files on the job/);
  assert.ok(r.sql.some(([q, a]) => /UPDATE sms_messages SET media/.test(q) && /p0\.jpg/.test(a[1])), 'kept on the text');
});

test('media from anywhere but Twilio is ignored', () => {
  const T = require('../tools/lib/text-media');
  assert.deepStrictEqual(T.mediaOf({ NumMedia: '2', MediaUrl0: 'https://evil.example/x.jpg', MediaUrl1: 'http://api.twilio.com/x' }), []);
  assert.strictEqual(T.mediaOf({ NumMedia: '99' }).length, 0);
  assert.strictEqual(T.mediaOf({ NumMedia: '1', MediaUrl0: 'https://api.twilio.com/a', MediaContentType0: 'image/png' })[0].ext, 'png');
});

test('a texted picture shows on the job page as a picture', async () => {
  const html = await card({ history: [{ channel: 'text', kind: 'reply', body: '', status: 'received', created_at: '2026-10-06T21:00:00Z',
    attachments: [{ url: 'https://res.cloudinary.com/shop/image/upload/v1/quote_photos/p0.jpg', name: 'Text photo 1.jpg' }] },
    { channel: 'text', kind: 'reply', body: 'x', status: 'received', created_at: '2026-10-06T20:00:00Z',
      attachments: [{ url: 'https://evil.example/x.jpg', name: 'bad' }] }] });
  assert.match(html, /<img src="https:\/\/res\.cloudinary\.com\/shop\/image\/upload\/c_limit,w_240/);
  assert.doesNotMatch(html, /evil\.example/);
});

test('a message typed as "June\'s Tees: ..." does not go out with the brand twice', () => {
  const at = src.indexOf("msg: { template: 'manual', body: `June's Tees: ${smsPlain(text.replace(");
  assert.ok(at > 0, 'the manual text strips a leading brand');
  const re = /^\s*june['’]?s\s+tees\s*(&\s*things\s*)?[:,-]\s*/i;
  for (const t of ["June's Tees: Hi Samantha", 'June’s Tees & Things - Hi', "june's tees, hi"]) assert.ok(!/^june/i.test(t.replace(re, '')), t);
  assert.strictEqual("June's Tees has your proof".replace(re, ''), "June's Tees has your proof", 'a sentence about the shop stays');
});
