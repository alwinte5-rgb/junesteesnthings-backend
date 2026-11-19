'use strict';

/* Email a lead from the Leads page, and Contacted as a lead status (2026-10-07).
 * Run: node --test tests/*.test.js */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../tools/lib/lead-email');
const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const route = src.slice(src.indexOf("app.post('/admin/lead/:id/email'"), src.indexOf("app.post('/admin/lead/:id/assign'"));

test('the ready message asks for what a quote needs, by first name, about what they asked', () => {
  const m = M.infoRequest({ name: 'Maria Lopez', description: 'Shirts for a family reunion' }, { signer: 'June', shop: "June's Tees" });
  assert.match(m.body, /^Hi Maria,/);
  assert.match(m.body, /"Shirts for a family reunion"/);
  for (const ask of [/How many pieces/, /color/, /Where the design goes/, /artwork/, /date you need/]) assert.match(m.body, ask);
  assert.match(m.body, /\nJune\n/);
  assert.match(M.infoRequest({}).body, /^Hi,/, 'no name, no stray space');
  assert.ok(M.infoRequest({ description: 'x'.repeat(300) }).body.includes('...'), 'a long enquiry is shortened');
});

test('the form is checked: subject and message needed, capped, no header injection', () => {
  assert.ok(M.cleanEmail({ subject: '', body: 'hi' }).error);
  assert.ok(M.cleanEmail({ subject: 'Hi', body: '  ' }).error);
  assert.ok(M.cleanEmail({ subject: 'Hi', body: 'x'.repeat(M.LIMITS.body + 1) }).error);
  const ok = M.cleanEmail({ subject: 'Hi\r\nBcc: a@b.c', body: 'Line\r\nTwo' });
  assert.strictEqual(ok.subject, 'Hi Bcc: a@b.c');
  assert.strictEqual(ok.text, 'Line\nTwo');
  assert.strictEqual(M.cleanEmail({ subject: 's'.repeat(400), body: 'a' }).subject.length, M.LIMITS.subject);
});

test('what was typed is escaped for the email', () => {
  const html = M.toHtml('Hi <b>you</b>\nnext line\n\nNew "para"');
  assert.ok(!html.includes('<b>'));
  assert.match(html, /&lt;b&gt;you&lt;\/b&gt;<br>next line/);
  assert.strictEqual((html.match(/<p /g) || []).length, 2);
});

test('the send route: checked, claims before it sends, no double send, helpers in training wait for June', () => {
  assert.ok(route.length > 200, 'route found');
  assert.match(route, /LEADMAIL\.cleanEmail\(b\)/);
  assert.match(route, /actorLevel\('customers\.message'\) === 'off' \|\| actorLevel\('leads\.view'\) !== 'on'/, 'no messaging, or no leads: refused');
  assert.match(route, /FRAUD\.mentionsOutsidePayment/);
  /* At "Needs my OK", or mentioning outside payment, it is queued, never sent. */
  const queue = route.indexOf("actorLevel('customers.message') === 'approval' || outside");
  assert.ok(queue > 0 && queue < route.indexOf('await sendLeadEmail('), 'queued before any send');
  assert.match(route.slice(queue, route.indexOf('await sendLeadEmail(')), /SELECT 'lead_email', \$1[\s\S]*WHERE NOT EXISTS[\s\S]*return res\.redirect/);
  assert.match(route, /INTERVAL '10 minutes'/, 'a second press sends nothing');
  /* The note is now the claim, written under a lock BEFORE the send and taken
     back out if the send fails (Codex #179): two presses could both pass a
     read-then-send check, and a note that failed after a send invited a resend. */
  assert.ok(route.indexOf('INSERT INTO lead_notes') < route.indexOf('await sendEmail('), 'claimed before the send');
  assert.match(route, /DELETE FROM lead_notes WHERE id = \$1', \[noteId\]/, 'a failed send un-claims');
  assert.ok(route.indexOf('INSERT INTO lead_notes') < route.indexOf('markLeadResponded'), 'then Contacted');
  assert.match(route, /Nothing was recorded/, 'a failure says so');
  assert.strictEqual(STAFF.ROUTES['POST /admin/lead/:id/email'], 'customers.message');
});

test('Contacted: a lead someone has answered, shown on the card and in its own filter, never hidden by default', () => {
  assert.match(src, /l\.dismissed_at \? 'dismissed' : l\.first_response_at \? 'contacted' : 'new'/);
  assert.match(src, /: 'open';\n\s+const inStatus/, 'the Leads page opens on Open (waiting + contacted)');
  assert.match(src, /label: 'Contacted', href: link\(\{ status: 'contacted' \}\)/);
  assert.match(src, /pill\('Contacted', 'blue'\)/);
  assert.match(src, /I already emailed them/);
  assert.match(src, /name="kind" value="email"/, 'that press is an email note, which marks them contacted');
});

/* Text a lead from the Leads page (owner, 2026-11-12). */
const textRoute = src.slice(src.indexOf("app.post('/admin/lead/:id/text'"), src.indexOf("app.post('/admin/lead/:id/assign'"));

test('a lead text is checked: needed, capped at 300, no [June to fill in], spaces collapsed', () => {
  assert.ok(M.cleanText({ body: '   ' }).error);
  assert.ok(M.cleanText({}).error);
  assert.ok(M.cleanText({ body: 'x'.repeat(M.TEXT_LIMIT + 1) }).error);
  assert.ok(M.cleanText({ body: 'Price is [June to fill in: price]' }).error);
  assert.deepStrictEqual(M.cleanText({ body: ' Hi\n\nthere ' }), { text: 'Hi there', dropped: false });
  // Accents become plain letters; emoji are left out and said so; the brand is added by the send.
  assert.deepStrictEqual(M.cleanText({ body: 'Hola señora, ¿cuántas?' }), { text: 'Hola senora, cuantas?', dropped: true });
  assert.deepStrictEqual(M.cleanText({ body: "June's Tees: ready 👍" }), { text: 'ready', dropped: true });
  // Nothing left once the brand and emoji are gone: refused, never an empty text.
  assert.ok(M.cleanText({ body: "June's Tees:" }).error);
  assert.ok(M.cleanText({ body: '👍👍' }).error);
  assert.strictEqual(M.TEXT_LIMIT, 300);
});

test('the lead text route: staff need full messaging and leads, only body/back accepted, sent from the shop number', () => {
  assert.ok(textRoute.length > 200, 'route found');
  assert.match(textRoute, /\['body', 'back'\]\.includes\(k\)/);
  assert.match(textRoute, /if \(!canTextLeads\(actor\)\)/);
  assert.match(src, /function canTextLeads\(actor\) \{\s*return !\(actor && actor\.kind === 'staff' && \(actorLevel\('customers\.message'\) !== 'on' \|\| actorLevel\('leads\.view'\) !== 'on'\)\);/);
  // A rolling ten-minute window catches a resend across a clock boundary.
  assert.match(textRoute, /template = 'lead-text' AND body = \$2::text[\s\S]*INTERVAL '10 minutes'/);
  // A failed Contacted stamp is reported, not read as success (markLeadResponded returns false, never throws).
  assert.match(textRoute, /marked = await markLeadResponded\(id, actor\);/);
  assert.match(textRoute, /if \(!marked\) return back\(/);
  assert.match(textRoute, /FRAUD\.mentionsOutsidePayment\(m\.text\)/);
  assert.match(textRoute, /sendCustomerSms\(\{ phone: l\.phone, kind: 'transactional', staffSent: true,/);
  assert.match(textRoute, /Reply STOP to opt out\./);
  // Recorded and marked Contacted only after Twilio took it.
  assert.ok(textRoute.indexOf("if (status !== 'sent')") < textRoute.indexOf("INSERT INTO lead_notes"));
});

test('every open lead card has Text them; the text box only for a usable phone, else why not', () => {
  /* The same buttons on every card (owner, 2026-11-19); leadTextArea decides what the box holds. */
  assert.match(src, /onclick="var f=document\.getElementById\('tx-\$\{l\.id\}'\);[^"]*">Text them<\/button>\n/);
  assert.match(src, /\$\{leadTextArea\(l, backField\)\}/);
  const fn = src.slice(src.indexOf('function leadTextArea('), src.indexOf('\n}\n', src.indexOf('function leadTextArea(')));
  assert.match(fn, /if \(!canTextLeads\(currentActor\(\)\)\) return why\(/);
  assert.match(fn, /if \(normalizeUsPhone\(l\.phone\)\) return leadTextBox\(l, backField\);/);
  assert.match(fn, /if \(isFoundLead\(l\)\) return why\('<b>No phone on file\.<\/b> We never text or call a number found online/);
  // A failed send is put back only into this lead's box.
  assert.match(src, /p\.get\('err'\)&&location\.hash==='#lead-\$\{l\.id\}'/);
});

test('a reply to a lead texted from its card comes back onto that lead', () => {
  const fn = src.slice(src.indexOf('async function textToLead('), src.indexOf('async function saveTextMedia('));
  /* The owner's replies from her phone ("You replied:") count too (2026-11-19). */
  assert.match(fn, /\(n\.body LIKE 'You texted:%' OR n\.body LIKE 'You replied:%'\) AND n\.created_at > NOW\(\) - INTERVAL '14 days'/);
  assert.match(textRoute, /`You texted: \$\{words\}`/);
  assert.match(src, /action="\/admin\/lead\/\$\{l\.id\}\/text"/);
});

test('text templates: first name in, fit the box at the longest name, pass the cleaner, no prices', () => {
  const list = M.textTemplates({ name: 'Maria Lopez', email: 'm@x.com' });
  assert.ok(list.length >= 5);
  const keys = new Set();
  for (const t of list) {
    assert.ok(!keys.has(t.key), 'keys are unique'); keys.add(t.key);
    assert.match(t.text, /^Hi Maria, /);
    assert.ok(!/\$\d/.test(t.text), t.key + ' carries no price');
    assert.ok(!/jtees\.net|https?:/i.test(t.text), t.key + ' leaves the site link to the send route');
    const c = M.cleanText({ body: t.text });
    assert.ok(!c.error && !c.dropped, t.key + ' sends as written');
  }
  for (const t of M.textTemplates({ name: 'Bartholomewwwwwwwwwwwwww', email: 'a@b.c' })) {
    assert.ok(t.text.length <= M.TEXT_LIMIT, t.key + ' fits the box at the longest name');
  }
  assert.match(M.textTemplates({})[0].text, /^Hi, /, 'no name, no stray space');
  assert.match(list.find((t) => t.key === 'next_week').text, /booked for the rest of this week.*next week/);
});

test('templates about email are not offered to a lead with no email', () => {
  const phoneOnly = M.textTemplates({ name: 'Ana', phone: '3125550100' });
  assert.ok(!phoneOnly.some((t) => t.key === 'quote_sent'));
  assert.ok(!phoneOnly.some((t) => /email/i.test(t.text)));
  assert.match(M.textTemplates({ name: 'Ana', email: 'a@b.c' }).find((t) => t.key === 'artwork').text, /reply to our email/);
});

test('first name: cleaned, capitalised, nothing that is not a name', () => {
  assert.strictEqual(M.firstName('maria lopez'), 'Maria');
  assert.strictEqual(M.firstName('MARIA'), 'Maria');
  assert.strictEqual(M.firstName('Maria,'), 'Maria');
  assert.strictEqual(M.firstName("O'Neil"), "O'Neil");
  assert.strictEqual(M.firstName('McKenzie'), 'McKenzie');
  assert.strictEqual(M.firstName('info@acme.com'), '');
  assert.strictEqual(M.firstName('3125550100'), '');
  assert.strictEqual(M.firstName(''), '');
  assert.match(M.infoRequest({ name: 'maria' }).body, /^Hi Maria,/);
  assert.match(M.followUp({ name: 'info@x.com' }).body, /^Hi,/);
});

test('the lead text box renders the templates escaped, asks before replacing, never posts the picker', () => {
  const vm = require('node:vm');
  const grab = (name) => { const a = src.indexOf(`function ${name}(`); return src.slice(a, src.indexOf('\n}\n', a) + 2); };
  const ctx = { LEADMAIL: M, escEmail: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;') };
  vm.createContext(ctx);
  vm.runInContext(grab('leadTextBox'), ctx);
  const html = ctx.leadTextBox({ id: 7, name: "O'Neil <b>", phone: '3125550100' }, '');
  assert.ok(html.includes('value="Hi O&#39;Neil, sorry we missed your call.'), 'apostrophes are escaped in the value');
  assert.ok(!html.includes('your email now'), 'no email, no email template');
  const select = html.slice(html.indexOf('<select'), html.indexOf('>', html.indexOf('<select')));
  assert.ok(!/\sname=/.test(select), 'the picker has no name, so the route never sees it');
  assert.match(select, /confirm\('Replace what you have typed/);
});

/* The Email them box (owner, 2026-11-19): it opens plain, and a template menu
   fills it for the situation, as the text box's does. */
test('email templates: plain start, greeting and sign-off on each, no prices, within the limits', () => {
  const b = M.blankEmail({ name: 'symia johnson' }, { signer: 'June', shop: "June's Tees" });
  assert.strictEqual(b.body, "Hi Symia,\n\n\n\nThank you,\nJune\nJune's Tees");
  assert.doesNotMatch(b.body, /quote|sizes|enquiry/i, 'nothing assumed');
  const list = M.emailTemplates({ name: 'Symia' }, { signer: 'June', shop: "June's Tees" });
  assert.ok(list.length >= 6);
  const keys = new Set();
  for (const t of list) {
    assert.ok(!keys.has(t.key)); keys.add(t.key);
    assert.match(t.body, /^Hi Symia,\n\n/); assert.match(t.body, /\n\nThank you,\nJune\nJune's Tees$/);
    assert.ok(!/\$\d/.test(t.body + t.subject), t.key + ' carries no price');
    const c = M.cleanEmail({ subject: t.subject, body: t.body });
    assert.ok(!c.error, t.key + ': ' + c.error);
  }
  for (const k of ['details', 'working', 'artwork', 'missed_call', 'intro', 'check_in']) assert.ok(keys.has(k), k);
  assert.match(M.emailTemplates({})[0].body, /^Hi,\n\n/, 'no name: plain Hi');
});

test('the untouched plain email is refused, however the sign-off is worded', () => {
  for (const shop of ["June's Tees", "June's Tees & Things"]) {
    const b = M.blankEmail({ name: 'Sam Lee' }, { signer: 'June', shop });
    assert.match(M.cleanEmail({ subject: 'Hi', body: b.body }).error, /Write the message first/);
  }
  assert.match(M.cleanEmail({ subject: 'Hi', body: 'Hi,\n\nThanks,\nJune' }).error, /Write the message first/);
  assert.ok(!M.cleanEmail({ subject: 'Hi', body: 'Hi Sam,\n\nYour shirts are ready.\n\nThank you,\nJune' }).error);
  assert.ok(!M.cleanEmail({ subject: 'Hi', body: 'Thanks for the order!' }).error, 'a one-line thank-you is a message');
  assert.ok(!M.cleanEmail({ subject: 'Hi', body: 'Hi Sam, your shirts are ready.' }).error, 'words on the greeting line count');
});
